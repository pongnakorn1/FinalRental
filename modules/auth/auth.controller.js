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

// =============================
// 🔥 Google Vision
// =============================
// const cleanVisionKey = process.env.GOOGLE_VISION_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, '').trim();
// console.log("--- Debug Vision Key ---");
// console.log("Key Found:", !!cleanVisionKey);
// console.log("Key Header:", cleanVisionKey?.substring(0, 27));
// console.log("Key Footer:", cleanVisionKey?.substring(cleanVisionKey.length - 25));

// try {
//     visionClient = new vision.ImageAnnotatorClient({
//         credentials: {
//             "type": "service_account",
//             "project_id": "product-rental-login",
//             "private_key_id": "ad32742f5aaff61c6bdc44c9349efbccd9a90b57",
//             // ต้องมี process.env. นำหน้าเสมอเพื่อดึงค่าจากไฟล์ .env
//             private_key: process.env.GOOGLE_VISION_PRIVATE_KEY.replace(/\\n/g, '\n'),
//             "client_email": process.env.GOOGLE_VISION_EMAIL,
//             "client_id": "101819675936404406787",
//             "auth_uri": "https://accounts.google.com/o/oauth2/auth",
//             "token_uri": "https://oauth2.googleapis.com/token",
//             "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
//             "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/vision-scanner%40product-rental-login.iam.gserviceaccount.com",
//             "universe_domain": "googleapis.com"
//         }
//     });
// } catch (error) {
//     console.error("Vision Client Error:", error.message);
// }

// =============================
// 📌 OCR Function
// =============================

// export const test = async (req, res) => {
//     // Creates a client
//     const client = new vision.ImageAnnotatorClient({
//         credentials: {
//             "type": "service_account",
//             "project_id": "product-rental-login",
//             "private_key_id": "ad32742f5aaff61c6bdc44c9349efbccd9a90b57",
//             "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDiyoaYMVw/YhSR\nTrBH4XiqxU0gSiqgvIt23A99naL4PSWVrXgDXg1sKhl5yuu0hRDttuCqWT7RTovC\nEsicblV0RjOalWA84pm3nJnUAB4+l3ZWvlO1Uv1M19S20OtQWQu28T4/mvhUcUOI\ngARyStY2Me/T0M8sRRDqQyIN5u3vTTWmoPLTbLnno+0FFTQkxJNW6pKve8nDdATz\nyWtCm1QgPodX+iCd9lLD/NuEgxn/dtFWvQ2RekhbWCaYtSp1s3BZtJETj8AMjre5\nVciOERHaW7vAikTF955bCqypU51PGQX0qzBXRD79MSfw67SG0bRqvm8qoLnMx803\nU6LkpSqvAgMBAAECggEAXVlOaFOc7EvzOlJA1f11HRmEIv/UJwAkiaKPz700aOhG\nUaMqzHwIm1aC0PJY7Z999dK6C/QbGq0xcosnvtfdXbRNplnI2JbO/dg8Kxp3WH0g\njRjfPLnxoBEQscUxrotQepc275haketjCErlSaQLIxiP5khDFi5BhaNnX4CHvGDt\nTGE4RSxt4KbwO5e/duf9/rOi8jELa5vkl5j5/c7ZXTWkTN0i/HFKwF9+d16Mf+e8\nAXOie58SOBody7HWaDw8eTghDdclpiRsV6nxiu2f+s8pepC1gTzOZDnHMBgjJuLV\nrTrCrZc/In4I0hkJMsFIZMCVhZkBXnAPZMPPMGnKiQKBgQD95pFz/RyEXy25HXjf\n/dRSapD7nAmhgFzhJarM/3B99uVPA6u6wssyfrQIaHyfN3p34af4Dg0HvkTsfdOc\pqEPPcCguPszu4h28s631/gNKByTsRf++/KMnefbMuGuYhUS31X/zI7XVlpP4hxx\nhfltOxCwpi5zsHe5CaH6G4OeaQKBgQDkqpMlNYB2BHhz96FPe0SS8vL2fug2hPyT\nP1X0P9jpZbqrQRlRA9+ioTZxoOfLba435gvdcr9Wpd6GU5QPxma3PxbHd09C08TM\nzQ3XdD1Y6EDj89jvjtO/gIpHr8zShFvbDcZGQa7dNAbHu8+FGCNxZKI01o8knt+Z\nXm2tbwcNVwKBgDUoRcGr94F7T95W3ky/HunWZ95Vz+phLpDwyu66eDnXLDE7yoOC\nbvp2bojoH1dSTTC2LO2RO4cofdOpkFlWxZekTSUZNXaiR7LnqQHylHtkr374b9ax\ntxlbogRRhdB1toXJ/n5cvHc3HBdndp8J9qu41wi08jrEcnxqGOB9TDQpAoGBAI+o\nTjthKmx6kIYiu7godENx2Ixd3FtsHxYPA1woxIiVPbobcuE/8r7EU2T9tsJKDNrX\nbvrX/Tddi7iOR4XFmoBjZVc5MJWGX6xe4uRKBcSWXTYY22BdNdCo27b/zkkvmFm9\nhKRc3ZPg/KV863ntWU8C7xkM9u8F1OoQtgzwpNiPAoGAExpDElgROhqJhPlP3n/k\nMk7CS8kheTCJqThigrT3icIgvmO9BpmBYDeXe1BwIsexli7V42sMtmUBa3M3ctUd\nUeZplHpmD5w8e6VYASRsH8MRI2UxgjsC3KRyiZ4ZngSCXzXjWLVwAE7/5r8/m3oy\nfon/sEvTeDY8zXEPv23EjtM=\n-----END PRIVATE KEY-----\n",
//             "client_email": "vision-scanner@product-rental-login.iam.gserviceaccount.com",
//             "client_id": "101819675936404406787",
//             "auth_uri": "https://accounts.google.com/o/oauth2/auth",
//             "token_uri": "https://oauth2.googleapis.com/token",
//             "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
//             "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/vision-scanner%40product-rental-login.iam.gserviceaccount.com",
//             "universe_domain": "googleapis.com"
//         }
//     });
//     const imagePath = path.join(process.cwd(), "uploads", "kyc", "face_image-1771569494011-792384911.jpg");
//     console.log("Vision Client:", client ? "Initialized" : "Not Available");
//     //TODO
//     const [result] = await client.textDetection(imagePath);
//     const fullText = result.textAnnotations[0].description;
//         const cleanText = fullText.replace(/[\s-]/g, "");
//         const idMatch = cleanText.match(/\d{13}/);
//         const scannedID = idMatch ? idMatch[0] : null;

//         const years = fullText.match(/20\d{2}/g);
//         let isExpired = false;
//         if (years) {
//             const currentYear = new Date().getFullYear();
//             const expiryYear = Math.max(...years.map(Number));
//             if (expiryYear < currentYear) isExpired = true;
//         }
//         // return { id: scannedID, expired: isExpired };
//         res.json({ success: true, text: scannedID });
// }



// export const extractIDNumber = async (imagePath) => {
//     const client = new vision.ImageAnnotatorClient({
//         credentials: {
//             "type": "service_account",
//             "project_id": "product-rental-login",
//             "private_key_id": "ad32742f5aaff61c6bdc44c9349efbccd9a90b57",
//             "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDiyoaYMVw/YhSR\nTrBH4XiqxU0gSiqgvIt23A99naL4PSWVrXgDXg1sKhl5yuu0hRDttuCqWT7RTovC\nEsicblV0RjOalWA84pm3nJnUAB4+l3ZWvlO1Uv1M19S20OtQWQu28T4/mvhUcUOI\ngARyStY2Me/T0M8sRRDqQyIN5u3vTTWmoPLTbLnno+0FFTQkxJNW6pKve8nDdATz\nyWtCm1QgPodX+iCd9lLD/NuEgxn/dtFWvQ2RekhbWCaYtSp1s3BZtJETj8AMjre5\nVciOERHaW7vAikTF955bCqypU51PGQX0qzBXRD79MSfw67SG0bRqvm8qoLnMx803\nU6LkpSqvAgMBAAECggEAXVlOaFOc7EvzOlJA1f11HRmEIv/UJwAkiaKPz700aOhG\nUaMqzHwIm1aC0PJY7Z999dK6C/QbGq0xcosnvtfdXbRNplnI2JbO/dg8Kxp3WH0g\njRjfPLnxoBEQscUxrotQepc275haketjCErlSaQLIxiP5khDFi5BhaNnX4CHvGDt\nTGE4RSxt4KbwO5e/duf9/rOi8jELa5vkl5j5/c7ZXTWkTN0i/HFKwF9+d16Mf+e8\nAXOie58SOBody7HWaDw8eTghDdclpiRsV6nxiu2f+s8pepC1gTzOZDnHMBgjJuLV\nrTrCrZc/In4I0hkJMsFIZMCVhZkBXnAPZMPPMGnKiQKBgQD95pFz/RyEXy25HXjf\n/dRSapD7nAmhgFzhJarM/3B99uVPA6u6wssyfrQIaHyfN3p34af4Dg0HvkTsfdOc\pqEPPcCguPszu4h28s631/gNKByTsRf++/KMnefbMuGuYhUS31X/zI7XVlpP4hxx\nhfltOxCwpi5zsHe5CaH6G4OeaQKBgQDkqpMlNYB2BHhz96FPe0SS8vL2fug2hPyT\nP1X0P9jpZbqrQRlRA9+ioTZxoOfLba435gvdcr9Wpd6GU5QPxma3PxbHd09C08TM\nzQ3XdD1Y6EDj89jvjtO/gIpHr8zShFvbDcZGQa7dNAbHu8+FGCNxZKI01o8knt+Z\nXm2tbwcNVwKBgDUoRcGr94F7T95W3ky/HunWZ95Vz+phLpDwyu66eDnXLDE7yoOC\nbvp2bojoH1dSTTC2LO2RO4cofdOpkFlWxZekTSUZNXaiR7LnqQHylHtkr374b9ax\ntxlbogRRhdB1toXJ/n5cvHc3HBdndp8J9qu41wi08jrEcnxqGOB9TDQpAoGBAI+o\nTjthKmx6kIYiu7godENx2Ixd3FtsHxYPA1woxIiVPbobcuE/8r7EU2T9tsJKDNrX\nbvrX/Tddi7iOR4XFmoBjZVc5MJWGX6xe4uRKBcSWXTYY22BdNdCo27b/zkkvmFm9\nhKRc3ZPg/KV863ntWU8C7xkM9u8F1OoQtgzwpNiPAoGAExpDElgROhqJhPlP3n/k\nMk7CS8kheTCJqThigrT3icIgvmO9BpmBYDeXe1BwIsexli7V42sMtmUBa3M3ctUd\nUeZplHpmD5w8e6VYASRsH8MRI2UxgjsC3KRyiZ4ZngSCXzXjWLVwAE7/5r8/m3oy\nfon/sEvTeDY8zXEPv23EjtM=\n-----END PRIVATE KEY-----\n",
//             "client_email": "vision-scanner@product-rental-login.iam.gserviceaccount.com",
//             "client_id": "101819675936404406787",
//             "auth_uri": "https://accounts.google.com/o/oauth2/auth",
//             "token_uri": "https://oauth2.googleapis.com/token",
//             "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
//             "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/vision-scanner%40product-rental-login.iam.gserviceaccount.com",
//             "universe_domain": "googleapis.com"
//         }
//     // const imagePath = path.join(process.cwd(), "uploads", "kyc", "face_image-1771569494011-792384911.jpg");
//     try {
//         console.log("Vision Client:", visionClient ? "Initialized" : "Not Available");
//         if (!visionClient) return { id: null, expired: false };

//         if (!fs.existsSync(imagePath)) {
//             console.error("OCR ERROR: Image file not found at", imagePath);
//             return { id: null, expired: false };
//         }

//         const [result] = await client.textDetection(imagePath);
//     const fullText = result.textAnnotations[0].description;
//         const cleanText = fullText.replace(/[\s-]/g, "");
//         const idMatch = cleanText.match(/\d{13}/);
//         const scannedID = idMatch ? idMatch[0] : null;

//         const years = fullText.match(/20\d{2}/g);
//         let isExpired = false;
//         if (years) {
//             const currentYear = new Date().getFullYear();
//             const expiryYear = Math.max(...years.map(Number));
//             if (expiryYear < currentYear) isExpired = true;
//         }
//         // return { id: scannedID, expired: isExpired };
//         res.json({ success: true, text: scannedID });
//     } catch (err) {
//         console.error("OCR ERROR:", err.message);
//         return { id: null, expired: false };
//     }
// };




    export const extractIDNumber = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "กรุณาอัปโหลดรูปภาพ" });
        }

        // --- 🛠️ จุดแก้ที่ 1: ประกาศตัวแปรให้เสร็จก่อนเรียกใช้งาน ---
        let clientOptions = {};

if (process.env.NODE_ENV === 'production') {
        // 🌍 สำหรับ Render (ใช้ค่าจาก Environment Variables)
        
        // 1. ดึงกุญแจออกมาแล้วล้างหัวท้ายและช่องว่างออกให้หมดก่อน
        const rawKey = process.env.GOOGLE_VISION_PRIVATE_KEY
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');

// ใช้การบวก String ธรรมดา (Template Literal) แทน .insertAt
const formattedKey = `-----BEGIN PRIVATE KEY-----\n${rawKey.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

clientOptions = {
    credentials: {
        project_id: "product-rental-login",
        client_email: process.env.GOOGLE_VISION_EMAIL,
        private_key: formattedKey // ✅ ส่งค่าที่ประกอบร่างเสร็จแล้วไปใช้งาน
    }
};
    } else {
        // 💻 สำหรับรันในเครื่องตัวเอง (Local)
        clientOptions = {
            keyFilename: path.join(process.cwd(), 'google-key.json')
        };
    }
const client = new vision.ImageAnnotatorClient(clientOptions);
            

            const imagePath = req.file.path;
            const [result] = await client.textDetection(imagePath);
            
            // --- 🛠️ จุดแก้ที่ 3: ดัก Error ถ้า Google สแกนข้อความไม่เจอ ---
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
            // ถ้าขึ้น DECODER routines::unsupported แสดงว่า cleanKey ยังไม่ถูก
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

// 📌 1. ดึงข้อมูลโปรไฟล์ตัวเอง (Get My Profile)
export const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id; // ได้มาจาก middleware authenticateToken

        const result = await pool.query(
    `SELECT id, full_name, email, phone, address, profile_image, kyc_status 
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

// 📌 2. อัปเดตข้อมูลที่อยู่และโปรไฟล์ (Update Profile/Address)
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, address, phone_number } = req.body;

        const result = await pool.query(
            `UPDATE users 
             SET full_name = COALESCE($1, full_name),
                 address = COALESCE($2, address),
                 phone_number = COALESCE($3, phone_number),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, full_name, email, address, phone_number`,
            [full_name, address, phone_number, userId]
        );

        res.json({
            success: true,
            message: "อัปเดตข้อมูลสำเร็จ",
            user: result.rows[0]
        });
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.status(500).json({ message: "ไม่สามารถอัปเดตข้อมูลได้" });
    }
};