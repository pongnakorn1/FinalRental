import pool from '../../config/db.js';
import twilio from 'twilio'; // อย่าลืม npm install twilio
import 'dotenv/config';

// --- [ตั้งค่า Twilio] ---
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);
// ฟังก์ชันสำหรับแปลงเบอร์ไทยเป็นรูปแบบ E.164 (+66...)
const formatPhone = (phone) => {
    let cleaned = phone.replace(/\D/g, ''); // ลบตัวอักษรที่ไม่ใช่ตัวเลขออก
    if (cleaned.startsWith('0')) {
        return '+66' + cleaned.substring(1);
    }
    return cleaned.startsWith('+') ? cleaned : '+' + cleaned;
};

// --- [ขอรหัส OTP] ---
export const requestOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ message: "กรุณาระบุเบอร์โทรศัพท์" });

        const formattedPhone = formatPhone(phone);
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredAt = new Date(Date.now() + 5 * 60000); // 5 นาที

        // 1. บันทึกลงฐานข้อมูล
        await pool.query(
            "INSERT INTO otp_requests (phone, otp_code, expired_at, is_verified) VALUES ($1, $2, $3, $4)",
            [phone, otpCode, expiredAt, false]
        );

        // 2. ส่ง SMS จริงผ่าน Twilio
        // ในการส่งงาน ถ้ายังไม่อยากใช้เงินจริง ให้ครอบด้วย try-catch เพื่อให้ระบบไม่พัง
        try {
            await client.messages.create({
                body: `Your OTP code is: ${otpCode} (valid for 5 mins)`,
                from: twilioPhone,
                to: formattedPhone
            });
            console.log(`[SMS Sent] OTP ${otpCode} sent to ${formattedPhone}`);
        } catch (smsError) {
            console.error("Twilio Error:", smsError.message);
            // ถ้าส่งไม่ไป ให้แสดงรหัสใน Console แทน (เผื่อเครดิตฟรีหมด)
            console.log(`[Mock SMS] Phone: ${phone}, OTP: ${otpCode}`);
        }

        res.json({ 
            message: "ส่งรหัส OTP เรียบร้อยแล้ว", 
            phone: phone,
            note: "รหัสส่งไปที่เบอร์มือถือของคุณแล้ว" 
        });

    } catch (err) {
        console.error("Database Error:", err.message);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง OTP" });
    }
};

// --- [ยืนยันรหัส OTP] ---
export const verifyOTP = async (req, res) => {
    try {
        const { phone, otp_code } = req.body;

        // ดึง OTP ล่าสุดที่ยังไม่ถูกยืนยันของเบอร์นี้
        const result = await pool.query(
            `SELECT * FROM otp_requests 
             WHERE phone = $1 AND otp_code = $2 AND is_verified = FALSE 
             ORDER BY created_at DESC LIMIT 1`,
            [phone, otp_code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "รหัส OTP ไม่ถูกต้อง หรือเคยถูกใช้งานไปแล้ว" });
        }

        const otpData = result.rows[0];

        // ตรวจสอบเวลาหมดอายุ
        if (new Date() > new Date(otpData.expired_at)) {
            return res.status(400).json({ message: "รหัส OTP หมดอายุแล้ว กรุณาขอใหม่" });
        }

        // ยืนยันสำเร็จ: อัปเดตสถานะเพื่อไม่ให้ใช้ซ้ำได้อีก
        await pool.query(
            "UPDATE otp_requests SET is_verified = TRUE WHERE id = $1", 
            [otpData.id]
        );

        res.json({ 
            success: true, 
            message: "ยืนยันเบอร์โทรศัพท์สำเร็จ",
            verified_at: new Date()
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};