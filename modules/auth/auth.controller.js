import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../config/db.js";

// =============================
// 📌 REGISTER
// =============================
export const register = async (req, res) => {
    const client = await pool.connect(); // ใช้ client เพื่อทำ Transaction
    try {
        const { full_name, email, phone, address, password } = req.body;

        // [ส่วน Validation เดิมของคุณ - ผมข้ามมาตอนบันทึกเลยนะครับ]
        // ... (เช็คข้อมูลครบ, Regex เบอร์, Regex รหัสผ่าน, เช็ค Email ซ้ำ) ...
        
        await client.query("BEGIN");

        // 🔒 Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. บันทึกข้อมูล User
        const userResult = await client.query(
            `INSERT INTO users 
             (full_name, email, phone, address, password, role, kyc_status)
             VALUES ($1,$2,$3,$4,$5,'user','not_submitted')
             RETURNING id, full_name, email, role`,
            [full_name, email, phone, address, hashedPassword]
        );
        const newUser = userResult.rows[0];

        // 💰 2. สร้าง Wallet ให้ User ใหม่ทันที (สำคัญสำหรับระบบเช่า)
        await client.query(
            `INSERT INTO wallets (user_id, balance) VALUES ($1, 0)`,
            [newUser.id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "ลงทะเบียนสำเร็จ",
            user: newUser
        });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลงทะเบียน" });
    } finally {
        client.release();
    }
};

// =============================
// 📌 LOGIN
// =============================
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "กรุณากรอกอีเมลและรหัสผ่าน" });
        }

        // 🔎 ดึงข้อมูลเพิ่ม: ดึง is_suspended และ suspension_reason มาด้วย
        const result = await pool.query(
            `SELECT id, full_name, email, password, role, kyc_status, is_suspended, suspension_reason
             FROM users
             WHERE LOWER(email) = LOWER($1)`,
            [email]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        }

        const user = result.rows[0];

        // 🚫 1. ตรวจสอบว่าโดนระงับการใช้งานหรือไม่
        if (user.is_suspended) {
            return res.status(403).json({
                message: "บัญชีของคุณถูกระงับการใช้งาน",
                reason: user.suspension_reason || "ทำผิดกฎของระบบ"
            });
        }

        // 🔒 2. เช็ครหัสผ่าน
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        }

        // 🔑 3. สร้าง JWT
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
            message: "เข้าสู่ระบบสำเร็จ",
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
        res.status(500).json({ message: "Login failed" });
    }
};