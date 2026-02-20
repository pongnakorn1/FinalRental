import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../config/db.js";


// =============================
// 📌 REGISTER
// =============================
export const register = async (req, res) => {
  try {
    const { full_name, email, phone, address, password } = req.body;

    // 1. ❌ ตรวจข้อมูลที่จำเป็น
    if (!full_name || !email || !password || !phone) {
      return res.status(400).json({
        message: "กรุณากรอกข้อมูลให้ครบถ้วน"
      });
    }

    // 2. ❌ เช็กเบอร์โทรศัพท์ (10 หลัก, ขึ้นต้นด้วย 08 หรือ 09 เท่านั้น)
    const phoneRegex = /^(08|09)\d{8}$/; // เปลี่ยนจาก ^08 เป็น ^(08|09)
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก และเริ่มต้นด้วย 08 หรือ 09 เท่านั้น"
      });
    }

    // 3. ❌ เช็กเบอร์โทรศัพท์ซ้ำในฐานข้อมูล
    const existingPhone = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );

    if (existingPhone.rowCount > 0) {
      return res.status(400).json({
        message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว",
        suggestion: "กรุณาใช้เบอร์โทรศัพท์อื่นในการลงทะเบียน"
      });
    }

    // 4. ❌ ตรวจรูปแบบ email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "รูปแบบอีเมลไม่ถูกต้อง" });
    }

    // 5. ❌ ตรวจความปลอดภัยรหัสผ่าน (8+ ตัว, ใหญ่+เล็ก+เลข, ห้ามภาษาไทย)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    const containsThai = /[\u0E00-\u0E7F]/;

    if (containsThai.test(password)) {
      return res.status(400).json({ message: "รหัสผ่านห้ามใช้ภาษาไทย" });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        message: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลข" 
      });
    }

    // 6. ❌ เช็ก email ซ้ำ
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existingUser.rowCount > 0) {
      return res.status(400).json({
        message: "อีเมลนี้ถูกใช้งานแล้ว",
        suggestion: "หากคุณลืมรหัสผ่าน กรุณาไปที่หน้า 'ลืมรหัสผ่าน'",
        redirect_to: "/forgot-password"
      });
    }

    // 🔒 7. Hash password และ บันทึกข้อมูล
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, address, password, role, kyc_status)
       VALUES ($1,$2,$3,$4,$5,'user','not_submitted')
       RETURNING id, full_name, email, phone, role, kyc_status`,
      [full_name, email, phone, address, hashedPassword]
    );

    res.status(201).json({
      message: "ลงทะเบียนสำเร็จ",
      user: result.rows[0]
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการลงทะเบียน" });
  }
};


// =============================
// 📌 LOGIN
// =============================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ❌ ตรวจ input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required"
      });
    }

    // 🔎 หา user
    const result = await pool.query(
      `SELECT id, full_name, email, password, role, kyc_status
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    // 🔒 เช็ครหัสผ่าน
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    // ❌ ตรวจ JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET not set");
      return res.status(500).json({
        message: "Server configuration error"
      });
    }

    // 🔑 สร้าง JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_status: user.kyc_status
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        kyc_status: user.kyc_status
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      message: "Login failed"
    });
  }
};
