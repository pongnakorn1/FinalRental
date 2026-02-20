import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../config/db.js";


// =============================
// 📌 REGISTER
// =============================
export const register = async (req, res) => {
  try {
    const { full_name, email, phone, address, password } = req.body;

    // ❌ ตรวจข้อมูลที่จำเป็น
    if (!full_name || !email || !password) {
      return res.status(400).json({
        message: "Full name, email and password are required"
      });
    }

    // ❌ ตรวจรูปแบบ email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format"
      });
    }

    // ❌ ตรวจความยาว password
    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    // ❌ เช็ค email ซ้ำ
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existingUser.rowCount > 0) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }

    // 🔒 hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 💾 บันทึก user
    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, address, password, role, kyc_status)
       VALUES ($1,$2,$3,$4,$5,'user','not_submitted')
       RETURNING id, full_name, email, role, kyc_status`,
      [full_name, email, phone, address, hashedPassword]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({
      message: "Registration failed"
    });
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
