import 'dotenv/config';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import admin from 'firebase-admin';
import pool from "../../config/db.js";
import fs from 'fs';
import path from 'path';

import vision from '@google-cloud/vision'

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
  export const extractIDNumber = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "กรุณาอัปโหลดรูปภาพ" });
        }

        // --- 🛠️ จุดแก้ที่ 1: ประกาศตัวแปรไว้ด้านบนสุดเพื่อให้ทุกส่วนเข้าถึงได้ ---
        let clientOptions = {};
        let formattedKeyForLog = "Using Local Key File"; // ไว้สำหรับแสดงผลใน console.log

        if (process.env.NODE_ENV === 'production') {
            // 1. ล้างขยะ: ลบช่องว่าง และลบหัวท้ายเดิมออกก่อน
            const rawKey = process.env.GOOGLE_VISION_PRIVATE_KEY
                .replace(/\\n/g, '\n')
                .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');

            // 2. หั่นเนื้อกุญแจ และ 3. ประกอบร่าง (ประกาศตัวแปรข้างในนี้ได้เลย แต่ส่งเข้า clientOptions)
            const formattedKey = "-----BEGIN PRIVATE KEY-----\n" + 
                                 rawKey.match(/.{1,64}/g).join('\n') + 
                                 "\n-----END PRIVATE KEY-----\n";
            
            formattedKeyForLog = formattedKey; // ฝากค่าไว้ให้ Log ดูด้านนอก

            clientOptions = {
                credentials: {
                    project_id: "product-rental-login",
                    client_email: process.env.GOOGLE_VISION_EMAIL,
                    private_key: formattedKey
                }
            };
        } else {
            // 💻 สำหรับ Local
            clientOptions = {
                keyFilename: path.join(process.cwd(), 'google-key.json')
            };
        }

        // --- ✅ บรรทัดนี้จะไม่ Error แล้ว เพราะเรามีตัวแปรรับค่าไว้ ---
        console.log("Key Status:", formattedKeyForLog.substring(0, 50) + "..."); 

        const client = new vision.ImageAnnotatorClient(clientOptions);
        const imagePath = req.file.path;
        const [result] = await client.textDetection(imagePath);
        
        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            return res.status(400).json({ success: false, message: "ไม่พบข้อความในรูปภาพ" });
        }

        const fullText = result.textAnnotations[0].description;
        const cleanText = fullText.replace(/[\s-]/g, "");
        const idMatch = cleanText.match(/\d{13}/);
        const scannedID = idMatch ? idMatch[0] : null;

        return res.status(200).json({
            success: true,
            id: scannedID,
            raw_text: fullText
        });

    } catch (err) {
        console.error("OCR ERROR:", err.message);
        return res.status(500).json({ success: false, error: err.message });
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
        
        // 🛠️ แก้ไข: ดึง email และ phone ออกมาเช็คด้วย
        const checkUser = await dbClient.query(
            "SELECT email, phone FROM users WHERE email = $1 OR phone = $2",
            [email, finalPhone]
        );
        
        if (checkUser.rowCount > 0) {
            await dbClient.query("ROLLBACK");
            
            // 🛠️ ตรวจสอบว่าซ้ำที่ไหน โดยใช้ .some() เผื่อกรณีที่อีเมลและเบอร์โทรไปซ้ำกับ user 2 คนที่ต่างกัน
            const isEmailUsed = checkUser.rows.some(row => row.email === email);
            const isPhoneUsed = checkUser.rows.some(row => row.phone === finalPhone);

            // ส่ง Response กลับไปพร้อมระบุ field เพื่อให้ Frontend ทำงานง่ายขึ้น
            if (isEmailUsed && isPhoneUsed) {
                return res.status(400).json({ message: "อีเมลและเบอร์โทรศัพท์นี้ถูกใช้งานแล้ว", field: "both" });
            } else if (isEmailUsed) {
                return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว", field: "email" });
            } else if (isPhoneUsed) {
                return res.status(400).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว", field: "phone" });
            }
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
            `SELECT id, full_name, email, phone, password, role, kyc_status, is_suspended, suspension_reason
     FROM users 
     WHERE LOWER(email) = LOWER($1) OR phone = $1`,
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
// 📌 SOCIAL LOGIN (Google, Facebook, LINE) - Fixed Version
// =============================
export const socialLogin = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Authentication failed" });
        }

        const { displayName, emails, id, provider } = req.user;

        // 1. ดึง Email (เจาะจงที่โครงสร้างของ LINE มากขึ้น)
        let currentEmail;

        if (emails && emails.length > 0) {
            // เช็คจากมาตรฐาน Passport ทั่วไป
            currentEmail = emails[0].value;
        } else if (req.user._json && req.user._json.email) {
            // ✨ สำคัญ: LINE มักจะเก็บอีเมลไว้ใน _json.email
            currentEmail = req.user._json.email;
        } else if (req.user.email) {
            // เช็คเผื่อกรณีอื่นๆ
            currentEmail = req.user.email;
        } else {
            // ถ้าพยายามทุกทางแล้วไม่มีจริงๆ ค่อยใช้เมลจำลอง
            currentEmail = `${id}@${provider}.com`;
        }
        // 2. กำหนดชื่อคอลัมน์ตาม Provider
        let idColumn;
        if (provider === 'google') idColumn = 'google_id';
        else if (provider === 'facebook') idColumn = 'facebook_id';
        else if (provider === 'line') idColumn = 'line_id';

        let result = await pool.query(`SELECT * FROM users WHERE ${idColumn} = $1`, [id]);
        let user;

        if (result.rows.length > 0) {
            // ✨ กรณีที่ 1: เจอ Social ID นี้ในระบบอยู่แล้ว (Login ปกติ)
            user = result.rows[0];
        } else {
            // ✨ กรณีที่ 2: ไม่เจอ Social ID แต่ลองเช็คจาก Email (ป้องกันการสมัครซ้ำ)
            let emailCheck = await pool.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [currentEmail]);

            if (emailCheck.rows.length > 0) {
                // พบ User ที่ใช้อีเมลนี้อยู่แล้ว -> ผูก Social ID เข้ากับไอดีเดิมที่มีอยู่
                user = emailCheck.rows[0];
                await pool.query(`UPDATE users SET ${idColumn} = $1 WHERE id = $2`, [id, user.id]);
                console.log(`🔗 Linked ${provider} to existing user ID: ${user.id}`);
            } else {
                // ✨ กรณีที่ 3: ไม่เจอทั้ง ID และ Email -> สร้างผู้ใช้ใหม่จริงๆ
                const newUser = await pool.query(
                    `INSERT INTO users (full_name, email, ${idColumn}, role, kyc_status) 
             VALUES ($1, $2, $3, 'user', 'not_submitted') RETURNING *`,
                    [displayName || 'Social User', currentEmail, id]
                );
                user = newUser.rows[0];

                // สร้าง Wallet ให้ผู้ใช้ใหม่
                await pool.query("INSERT INTO wallets (user_id, balance) VALUES ($1, 0)", [user.id]);
                console.log(`🆕 Created new user ID: ${user.id} via ${provider}`);
            }
        }

        // 4. สร้าง JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, kyc_status: user.kyc_status },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // 5. ส่ง Response
        res.json({
            success: true,
            message: `Login with ${provider} success!`,
            token: token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                line_id: user.line_id
            }
        });

    } catch (err) {
        console.error("SOCIAL LOGIN ERROR:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
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

        const result = await pool.query(
            `UPDATE users SET id_card_number = $1, id_card_image = $2, face_image = $3, kyc_status = 'pending' 
             WHERE id = $4 RETURNING id, kyc_status`,
            [id_card_number, idCardPath, faceImagePath, userId]
        );

        res.json({ message: "ส่งข้อมูล KYC เรียบร้อย", data: result.rows[0] });
    } catch (err) {
        console.error("KYC ERROR:", err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปโหลด KYC" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 🛠️ แก้จุดนี้: เปลี่ยน undefined ให้เป็น null เพื่อไม่ให้ PostgreSQL แจ้ง Error
        const full_name = req.body.full_name ?? null;
        const address = req.body.address ?? null;
        const phone = req.body.phone ?? null;

        let profilePicturePath = null;
        if (req.file) {
            // เปลี่ยน \ เป็น / เผื่อไว้สำหรับการเรียกดูรูปบนเว็บ
            profilePicturePath = req.file.path.replace(/\\/g, '/'); 
        }

        const result = await pool.query(
            `UPDATE users 
             SET full_name = COALESCE($1, full_name),
                 address = COALESCE($2, address),
                 phone = COALESCE($3, phone), 
                 profile_picture = COALESCE($4, profile_picture)
             WHERE id = $5
             RETURNING id, full_name, email, address, phone, profile_picture`,
            [full_name, address, phone, profilePicturePath, userId]
        );
        // (เอา updated_at = NOW() ออกก่อนเพื่อความชัวร์ ถ้าตารางคุณมีฟิลด์นี้ค่อยใส่กลับไปนะครับ)

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้งาน" });
        }

        res.json({
            success: true,
            message: "อัปเดตข้อมูลสำเร็จ",
            user: result.rows[0]
        });
    } catch (err) {
        // 🚨 ตรงนี้สำคัญมาก! ถ้ายังพังอีก ให้ไปดูใน Terminal ของ VS Code 
        // มันจะบอกเป๊ะๆ ว่า Database ด่าเราว่าอะไร
        console.error("Update Profile Error:", err); 
        res.status(500).json({ success: false, message: "ไม่สามารถอัปเดตข้อมูลได้" });
    }
};

// 📌 อย่าลืมแก้ getMyProfile ให้ดึงฟิลด์ที่ถูกต้องด้วยครับ
export const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT id, full_name, email, phone, address, profile_picture, kyc_status 
             FROM users 
             WHERE id = $1`,
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบข้อมูลผู้ใช้งาน" });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });
    } catch (err) {
        console.error("Get Profile Error:", err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์" });
    }
};
// ขั้นตอนที่ 1: ตรวจสอบตัวตน (Verify User)
// เรียกใช้เมื่อกดปุ่ม "รีเซ็ทรหัสผ่าน" หน้าแรก
export const verifyUserBeforeReset = async (req, res) => {
    try {
        const { full_name, id_card_number, contact } = req.body;

        const user = await pool.query(
            `SELECT id FROM users 
             WHERE full_name = $1 AND id_card_number = $2 
             AND (LOWER(email) = LOWER($3) OR phone = $3)`,
            [full_name, id_card_number, contact]
        );

        if (user.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "ข้อมูลไม่ถูกต้อง ไม่พบผู้ใช้งานในระบบ" 
            });
        }

        // ถ้าผ่าน ให้ส่ง userId กลับไป เพื่อให้หน้าบ้านใช้ส่งในขั้นตอนถัดไป
        res.json({ 
            success: true, 
            userId: user.rows[0].id,
            message: "ตรวจสอบข้อมูลสำเร็จ" 
        });
    } catch (err) {
        console.error("VERIFY ERROR:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการตรวจสอบข้อมูล" });
    }
};

// ขั้นตอนที่ 2: บันทึกรหัสใหม่ (Submit Password)
// เรียกใช้เมื่อกรอกรหัสใหม่แล้วกด "ยืนยันรหัสผ่าน"
export const submitPasswordResetRequest = async (req, res) => {
    try {
        const { userId, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "รหัสผ่านไม่ตรงกัน" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        

        await pool.query(
            `UPDATE users 
             SET pending_password = $1, 
                 password_reset_requested = true 
             WHERE id = $2`,
            [hashedPassword, userId]
        );

        res.json({ 
            success: true, 
            message: "ส่งคำขอเปลี่ยนรหัสผ่านแล้ว กรุณารอการอนุมัติจาก Admin" 
        });
    } catch (err) {
        console.error("SUBMIT ERROR:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการบันทึกรหัสผ่าน" });
    }
};