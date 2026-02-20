import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import vision from '@google-cloud/vision';
import pool from '../../config/db.js';
import path from 'path';

// --- [จุดแก้ไข 1] ตั้งค่า Vision Client ---
// มั่นใจว่าไฟล์ google-key.json อยู่ในโฟลเดอร์ Root ตามที่เห็นใน Sidebar
const client = new vision.ImageAnnotatorClient({ 
  keyFilename: path.resolve('./google-key.json') // ใช้ path.resolve เพื่อความชัวร์ในการหาไฟล์
});

// --- [จุดแก้ไข 2] ฟังก์ชัน OCR ดึงเลข 13 หลัก ---
const extractIDNumber = async (imagePath) => {
  try {
    console.log("--- เริ่มการสแกน OCR สำหรับไฟล์:", imagePath, "---");
    const [result] = await client.textDetection(imagePath);
    
    if (!result.textAnnotations || result.textAnnotations.length === 0) {
      console.log("OCR: ไม่พบข้อความในรูปภาพ");
      return null;
    }

    const fullText = result.textAnnotations[0].description;
    console.log("ข้อความที่ตรวจพบ:", fullText.replace(/\n/g, ' '));
    
    // ลบทุกอย่างที่ไม่ใช่ตัวเลข แล้วหาตัวเลขที่เรียงกัน 13 หลัก
    const cleanText = fullText.replace(/[\s-]/g, ''); // ลบช่องว่างและขีดออกก่อน 
    const match = cleanText.match(/\d{13}/);
    
    if (match) {
      console.log("OCR Success: พบเลขบัตรประชาชน:", match[0]);
      return match[0];
    }
    
    console.log("OCR Warning: ตรวจพบข้อความแต่ไม่พบตัวเลข 13 หลักเรียงกัน");
    return null;
  } catch (err) {
    // หากเกิด Error ตรงนี้ ให้เช็คว่าเปิด Vision API ใน Console หรือยัง
    console.error("GOOGLE VISION ERROR:", err.message);
    return null;
  }
};

// --- [จุดแก้ไข 3] ฟังก์ชัน uploadKYC ---
export const uploadKYC = async (req, res) => {
  try {
    // ตรวจสอบว่า req.user ถูกเซ็ตมาจาก middleware หรือไม่
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อนทำรายการ" });
    }

    const userId = req.user.id; 
    const { id_card_number, is_live_photo } = req.body; 
    const files = req.files;

    // 1. ตรวจสอบไฟล์รูปภาพ
    if (!files || !files.id_card_image || !files.face_image) {
      return res.status(400).json({ message: "กรุณาอัปโหลดทั้งรูปบัตรประชาชนและรูป Selfie" });
    }

    const idCardPath = files.id_card_image[0].path;
    const faceImagePath = files.face_image[0].path;

    // 2. เริ่มกระบวนการ OCR (สแกนหาเลขบัตรอัตโนมัติ)
    const scannedID = await extractIDNumber(idCardPath);
    
    // เลือกใช้เลขบัตร: ใช้จาก OCR ถ้าเจอ ถ้าไม่เจอให้ใช้ค่าที่ผู้ใช้พิมพ์มา (id_card_number)
    let finalIDNumber = scannedID || id_card_number;

    if (!finalIDNumber) {
      return res.status(400).json({ 
        message: "ระบบสแกนเลขบัตรไม่สำเร็จ และไม่มีเลขบัตรที่กรอกด้วยตนเอง",
        scannedID: null 
      });
    }

    // 3. ตรวจสอบเลขบัตรซ้ำในฐานข้อมูล (ยกเว้นของตัวเอง)
    const duplicateCheck = await pool.query(
      "SELECT id FROM users WHERE id_card_number = $1 AND id != $2",
      [finalIDNumber, userId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ message: "เลขบัตรประชาชนนี้ถูกใช้งานในระบบแล้ว" });
    }

    // 4. บันทึกข้อมูลและอัปเดตสถานะเป็น 'pending'
    const result = await pool.query(
      `UPDATE users 
       SET id_card_number = $1, 
           id_card_image = $2, 
           face_image = $3, 
           kyc_status = 'pending' 
       WHERE id = $4
       RETURNING id, id_card_number, kyc_status`,
      [finalIDNumber, idCardPath, faceImagePath, userId]
    );

    console.log(`KYC SUCCESS: อัปเดต User ID ${userId} สำเร็จ`);

    res.json({
      message: scannedID ? "สแกนและบันทึกข้อมูลสำเร็จ" : "บันทึกข้อมูลสำเร็จ (สแกนอัตโนมัติไม่สำเร็จ)",
      scannedID: scannedID, // ส่งกลับไปหน้าบ้านเพื่อ Auto-fill
      data: result.rows[0]
    });

  } catch (err) {
    console.error("KYC UPLOAD ERROR:", err.message);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ" });
  }
};

// --- ฟังก์ชัน Register และ Login คงเดิมตามที่คุณส่งมา ---
export const register = async (req, res) => {
  try {
    const { full_name, email, phone, address, password } = req.body;
    if (!full_name || !email || !password) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }
    const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, address, password, role, kyc_status)
       VALUES ($1,$2,$3,$4,$5,'user','not_submitted')
       RETURNING id, full_name, email, role, kyc_status`,
      [full_name, email, phone, address, hashedPassword]
    );
    res.status(201).json({ message: "ลงทะเบียนสำเร็จ", user: result.rows[0] });
  } catch (err) {
    console.error("REGISTER ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "ไม่พบผู้ใช้งาน" });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "รหัสผ่านไม่ถูกต้อง" });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, kyc_status: user.kyc_status },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      user: { id: user.id, full_name: user.full_name, role: user.role, kyc_status: user.kyc_status }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err.message);
    res.status(500).json({ message: "การเข้าสู่ระบบล้มเหลว" });
  }
};