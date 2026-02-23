import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import vision from '@google-cloud/vision';
import pool from '../../config/db.js';
import path from 'path';

// --- [ตั้งค่า Vision Client] ---
const client = new vision.ImageAnnotatorClient({ 
  keyFilename: path.resolve('./google-key.json') 
});

// --- [ฟังก์ชัน OCR ดึงเลข 13 หลัก และเช็ควันหมดอายุ] ---
const extractIDNumber = async (imagePath) => {
  try {
    console.log("--- เริ่มการสแกน OCR สำหรับไฟล์:", imagePath, "---");
    const [result] = await client.textDetection(imagePath);
    
    if (!result.textAnnotations || result.textAnnotations.length === 0) {
      console.log("OCR: ไม่พบข้อความในรูปภาพ");
      return { id: null, expired: false };
    }

    const fullText = result.textAnnotations[0].description;
    console.log("ข้อความที่ตรวจพบ:", fullText.replace(/\n/g, ' '));
    
    // 1. หาเลขบัตรประชาชน 13 หลัก
    const cleanText = fullText.replace(/[\s-]/g, ''); 
    const idMatch = cleanText.match(/\d{13}/);
    const scannedID = idMatch ? idMatch[0] : null;

    // 2. ตรวจสอบวันหมดอายุ (KYC-1-002) 
    // มองหาปี ค.ศ. 4 หลัก (เช่น 2029) จากข้อความ "Date of Expiry" หรือที่ปรากฏบนบัตร
    const years = fullText.match(/20\d{2}/g); 
    let isExpired = false;
    if (years) {
      const currentYear = new Date().getFullYear();
      const expiryYear = Math.max(...years.map(Number)); // เลือกปีที่มากที่สุดเป็นวันหมดอายุ
      if (expiryYear < currentYear) {
        isExpired = true;
      }
    }

    return { id: scannedID, expired: isExpired };
  } catch (err) {
    console.error("GOOGLE VISION ERROR:", err.message);
    return { id: null, expired: false };
  }
};

// --- [ฟังก์ชัน uploadKYC - สำหรับผู้ใช้ทั่วไป] ---
export const uploadKYC = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อนทำรายการ" });
    }

    const userId = req.user.id; 
    const { id_card_number } = req.body; 
    const files = req.files;

    // ตรวจสอบไฟล์ (KYC-1-001)
    if (!files || !files.id_card_image || !files.face_image) {
      return res.status(400).json({ message: "กรุณาอัปโหลดทั้งรูปบัตรประชาชนและรูป Selfie" });
    }

    const idCardPath = files.id_card_image[0].path;
    const faceImagePath = files.face_image[0].path;

    // เริ่มกระบวนการ OCR
    const ocrResult = await extractIDNumber(idCardPath);
    
    // ตรวจสอบวันหมดอายุ (KYC-1-002)
    if (ocrResult.expired) {
      return res.status(400).json({ message: "บัตรประชาชนหมดอายุแล้ว ไม่สามารถใช้งานได้" });
    }

    let finalIDNumber = ocrResult.id || id_card_number;

    if (!finalIDNumber) {
      return res.status(400).json({ message: "ระบบสแกนเลขบัตรไม่สำเร็จ และไม่ได้กรอกเลขบัตร" });
    }

    // ตรวจสอบเลขบัตรซ้ำในระบบ (KYC-1-003)
    const duplicateCheck = await pool.query(
      "SELECT id FROM users WHERE id_card_number = $1 AND id != $2",
      [finalIDNumber, userId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ message: "เลขบัตรประชาชนนี้ถูกใช้งานในระบบแล้ว กรุณาติดต่อเจ้าหน้าที่" });
    }

    // บันทึกข้อมูลและเปลี่ยนสถานะเป็น pending เพื่อรอ Admin (KYC-1-004)
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

    console.log(`KYC PENDING: User ID ${userId} ส่งข้อมูลสำเร็จ`);

    res.json({
      message: ocrResult.id ? "สแกนและส่งข้อมูลตรวจสอบสำเร็จ" : "บันทึกข้อมูลสำเร็จ (สแกนอัตโนมัติไม่สำเร็จ)",
      scannedID: ocrResult.id,
      data: result.rows[0]
    });

  } catch (err) {
    console.error("KYC UPLOAD ERROR:", err.message);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลรูปภาพ" });
  }
};

// --- [Register & Login] ---
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
    res.status(500).json({ message: "การเข้าสู่ระบบล้มเหลว" });
  }
};