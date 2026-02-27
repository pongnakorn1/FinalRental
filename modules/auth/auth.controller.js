import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import vision from '@google-cloud/vision';
import admin from 'firebase-admin';
import pool from "../../config/db.js";

// =============================
// 🔥 Firebase Admin
// =============================
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } catch (error) {
        console.error("Firebase Init Error:", error.message);
    }
}

// =============================
// 🔥 Google Vision
// =============================
let visionClient;
try {
    visionClient = new vision.ImageAnnotatorClient({
        credentials: JSON.parse(process.env.GOOGLE_VISION_KEY),
    });
} catch (error) {
    console.error("Vision Client Error:", error.message);
}

// =============================
// 📌 OCR Function
// =============================
const extractIDNumber = async (imagePath) => {
    try {
        if (!visionClient) return { id: null, expired: false };
        const [result] = await visionClient.textDetection(imagePath);
        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return { id: null, expired: false };
        }

        const fullText = result.textAnnotations[0].description;
        const cleanText = fullText.replace(/[\s-]/g, "");
        const idMatch = cleanText.match(/\d{13}/);
        const scannedID = idMatch ? idMatch[0] : null;

        const years = fullText.match(/20\d{2}/g);
        let isExpired = false;
        if (years) {
            const currentYear = new Date().getFullYear();
            const expiryYear = Math.max(...years.map(Number));
            if (expiryYear < currentYear) isExpired = true;
        }
        return { id: scannedID, expired: isExpired };
    } catch (err) {
        console.error("OCR ERROR:", err.message);
        return { id: null, expired: false };
    }
};

// =============================
// 📌 REGISTER
// =============================
export const register = async (req, res) => {
    const dbClient = await pool.connect();
    try {
        const { full_name, email, phone, address, password, idToken } = req.body;
        let finalPhone = phone;

        if (idToken) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                finalPhone = decodedToken.phone_number;
            } catch (error) {
                return res.status(401).json({ message: "Firebase Token ไม่ถูกต้อง" });
            }
        }

        if (!full_name || !email || !password || !finalPhone) {
            return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
        }

        await dbClient.query("BEGIN");
        const checkUser = await dbClient.query(
            "SELECT id FROM users WHERE email = $1 OR phone = $2", 
            [email, finalPhone]
        );
        if (checkUser.rowCount > 0) {
            await dbClient.query("ROLLBACK");
            return res.status(400).json({ message: "อีเมลหรือเบอร์โทรศัพท์นี้ถูกใช้งานแล้ว" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await dbClient.query(
            `INSERT INTO users (full_name, email, phone, address, password, role, kyc_status)
             VALUES ($1, $2, $3, $4, $5, 'user', 'not_submitted')
             RETURNING id, full_name, email, role`,
            [full_name, email, finalPhone, address, hashedPassword]
        );

        await dbClient.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0)", [userResult.rows[0].id]);
        await dbClient.query("COMMIT");
        res.status(201).json({ message: "ลงทะเบียนสำเร็จ", user: userResult.rows[0] });

    } catch (err) {
        await dbClient.query("ROLLBACK");
        console.error("REGISTER ERROR:", err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลงทะเบียน" });
    } finally {
        dbClient.release();
    }
};

// =============================
// 📌 LOGIN
// =============================
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query(
            `SELECT id, full_name, email, password, role, kyc_status, is_suspended, suspension_reason
             FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
        );

        if (result.rowCount === 0) return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

        const user = result.rows[0];
        if (user.is_suspended) {
            return res.status(403).json({
                message: "บัญชีของคุณถูกระงับการใช้งาน",
                reason: user.suspension_reason || "ทำผิดกฎของระบบ"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, kyc_status: user.kyc_status },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({ message: "เข้าสู่ระบบสำเร็จ", token, user: { id: user.id, full_name: user.full_name, role: user.role, kyc_status: user.kyc_status } });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).json({ message: "การเข้าสู่ระบบล้มเหลว" });
    }
};

// =============================
// 📌 SOCIAL LOGIN (Google, Facebook, LINE) - UPDATED!
// =============================
export const socialLogin = async (req, res) => {
    try {
        console.log("Raw Passport User:", req.user); // ช่วย Debug ใน Render Logs

        if (!req.user) {
            return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
        }

        const { displayName, emails, id, provider, _json } = req.user;
        
        // ดึง Email แบบครอบคลุมทุก Provider
        let email = null;
        if (emails && emails.length > 0) email = emails[0].value;
        else if (_json && _json.email) email = _json.email; // สำหรับ LINE/Facebook บางเคส

        if (!email) {
            console.error("Social Login Error: No email found in profile");
            return res.redirect(`${process.env.CLIENT_URL}/login?error=no_email`);
        }

        // ตรวจสอบคอลัมน์ที่จะบันทึกตาม Provider
        let idColumn;
        if (provider === 'google') idColumn = 'google_id';
        else if (provider === 'facebook') idColumn = 'facebook_id';
        else if (provider === 'line') idColumn = 'line_id';
        else throw new Error("Unsupported provider");

        let result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user;

        if (result.rows.length === 0) {
            // สร้าง User ใหม่
            const newUser = await pool.query(
                `INSERT INTO users (full_name, email, ${idColumn}, role, kyc_status) 
                 VALUES ($1, $2, $3, 'user', 'not_submitted') RETURNING *`,
                [displayName || 'Social User', email, id]
            );
            user = newUser.rows[0];
            await pool.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0)", [user.id]);
        } else {
            // อัปเดต ID ของ Social เจ้าปัจจุบันถ้ายังไม่มี
            user = result.rows[0];
            if (!user[idColumn]) {
                await pool.query(`UPDATE users SET ${idColumn} = $1 WHERE id = $2`, [id, user.id]);
            }
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, kyc_status: user.kyc_status },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.redirect(`${process.env.CLIENT_URL}/login-success?token=${token}`);
        
    } catch (err) {
        console.error("SOCIAL LOGIN ERROR:", err);
        res.redirect(`${process.env.CLIENT_URL}/login?error=server_error`);
    }
};

// =============================
// 📌 UPLOAD KYC
// =============================
export const uploadKYC = async (req, res) => {
    try {
        const userId = req.user.id; 
        const { id_card_number } = req.body; 
        const files = req.files;

        if (!files?.id_card_image || !files?.face_image) {
            return res.status(400).json({ message: "กรุณาอัปโหลดรูปภาพให้ครบถ้วน" });
        }

        const idCardPath = files.id_card_image[0].path;
        const faceImagePath = files.face_image[0].path;

        const ocr = await extractIDNumber(idCardPath);
        if (ocr.expired) return res.status(400).json({ message: "บัตรประชาชนหมดอายุแล้ว" });

        const finalID = ocr.id || id_card_number;
        if (!finalID) return res.status(400).json({ message: "ไม่สามารถอ่านเลขบัตรได้ กรุณากรอกด้วยตนเอง" });

        const result = await pool.query(
            `UPDATE users SET id_card_number = $1, id_card_image = $2, face_image = $3, kyc_status = 'pending' 
             WHERE id = $4 RETURNING id, kyc_status`,
            [finalID, idCardPath, faceImagePath, userId]
        );

        res.json({ message: "ส่งข้อมูล KYC เรียบร้อย", data: result.rows[0] });
    } catch (err) {
        console.error("KYC ERROR:", err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปโหลด KYC" });
    }
};