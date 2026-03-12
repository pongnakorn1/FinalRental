import bcrypt from "bcrypt";
import pool from "../../config/db.js";

// ==========================================
// 📌 1. ดูรายการ KYC ที่รออนุมัติ (Pending)
// ==========================================
export const viewPendingKYC = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, id_card_number, id_card_image, face_image, kyc_status
             FROM users 
             WHERE kyc_status = 'pending'`
        );
        
        res.status(200).json({ 
            success: true,
            total: result.rowCount,
            pending_users: result.rows 
        });
    } catch (err) {
        console.error("View Pending Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal Server Error: " + err.message 
        });
    }
};

// ==========================================
// 📌 1.1 ดูรายการ KYC ทั้งหมด (รวมที่จัดการแล้ว)
// ==========================================
export const viewAllKYC = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, id_card_number, id_card_image, face_image, kyc_status
             FROM users 
             WHERE kyc_status IN ('pending', 'approved', 'rejected')
             ORDER BY id DESC`
        );
        
        res.status(200).json({ 
            success: true,
            total: result.rowCount,
            data: result.rows 
        });
    } catch (err) {
        console.error("View All KYC Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "Internal Server Error: " + err.message 
        });
    }
};

// ==========================================
// 📌 2. Admin อนุมัติ หรือ ปฏิเสธ KYC
// ==========================================
export const approveRejectKYC = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const cleanStatus = status?.trim().toLowerCase();
        if (!['approved', 'rejected'].includes(cleanStatus)) {
            return res.status(400).json({
                success: false,
                message: "สถานะต้องเป็น 'approved' หรือ 'rejected' เท่านั้น"
            });
        }

        // อัปเดตเฉพาะคอลัมน์ที่มีอยู่จริงใน Database (ลบ kyc_verified_at และ updated_at ออก)
        const result = await pool.query(
            `UPDATE users
             SET kyc_status = $1
             WHERE id = $2 AND kyc_status = 'pending'
             RETURNING id, full_name, email, kyc_status`,
            [cleanStatus, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "ไม่พบข้อมูลผู้ใช้ที่รอการยืนยันนี้ หรือผู้ใช้อาจถูกตรวจสอบไปแล้ว" 
            });
        }

        res.status(200).json({
            success: true,
            message: `ดำเนินการ${cleanStatus === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}เรียบร้อยแล้ว`,
            user: result.rows[0]
        });

    } catch (err) {
        console.error("Update KYC Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "เกิดข้อผิดพลาดในการอัปเดต: " + err.message 
        });
    }
};

// ==========================================
// 📌 3. ระบบระงับการใช้งาน (Suspend/Unsuspend User)
// ==========================================
export const suspendUser = async (req, res) => {
    const { id } = req.params;
    const { is_suspended, reason } = req.body;

    try {
        // แก้ไข: ลบ updated_at ออกเพราะในตารางไม่มี
        const result = await pool.query(
            `UPDATE users 
             SET is_suspended = $1, 
                 suspension_reason = $2, 
                 suspended_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
             WHERE id = $3
             RETURNING id, full_name, is_suspended, suspension_reason`,
            [is_suspended, reason, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false,
                message: "ไม่พบข้อมูลผู้ใช้งาน" 
            });
        }

        const statusText = is_suspended ? "ระงับการใช้งาน" : "ยกเลิกการระงับ";
        res.status(200).json({
            success: true,
            message: `${statusText} เรียบร้อยแล้ว`,
            user: result.rows[0]
        });
    } catch (err) {
        console.error("suspendUser error:", err.message);
        res.status(500).json({ 
            success: false,
            message: "เกิดข้อผิดพลาดทางเทคนิค: " + err.message 
        });
    }
};
// 1. ดึงรายชื่อผู้ที่ส่งคำขอ "ลืมรหัสผ่าน"
export const getForgotPasswordRequests = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, phone, id_card_number, kyc_status 
             FROM users 
             WHERE password_reset_requested = true`
        );
        res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "ไม่สามารถดึงข้อมูลคำขอได้" });
    }
};

// 2. Admin ตั้งรหัสผ่านใหม่ให้ผู้ใช้
export const adminResetPassword = async (req, res) => {
    const { userId, newPassword } = req.body;
    try {
        // Hash รหัสใหม่ก่อนบันทึก
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await pool.query(
            `UPDATE users 
             SET password = $1, password_reset_requested = false 
             WHERE id = $2`,
            [hashedPassword, userId]
        );
        
        res.json({ success: true, message: "เปลี่ยนรหัสผ่านใหม่สำเร็จ และเคลียร์สถานะคำขอแล้ว" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน" });
    }
};

export const approvePasswordReset = async (req, res) => {
    try {
        // 📌 ดึง ID แบบปลอดภัย ไม่ให้แอปพัง (รองรับทั้งชื่อตัวแปร id และ userId)
        const paramsId = req.params ? (req.params.userId || req.params.id) : null;
        const bodyId = req.body ? req.body.userId : null;
        const finalUserId = paramsId || bodyId;

        

        if (!finalUserId) {
            return res.status(400).json({ success: false, message: "ไม่พบข้อมูล ID ของผู้ใช้" });
        }

        const result = await pool.query(
            `UPDATE users 
             SET password = pending_password, 
                 pending_password = NULL, 
                 password_reset_requested = false 
             WHERE id = $1
             RETURNING id`,
            [finalUserId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "หาผู้ใช้งานไม่เจอ หรือไม่ได้ขอเปลี่ยนรหัสไว้" });
        }

        res.json({ success: true, message: "อนุมัติการเปลี่ยนรหัสผ่านสำเร็จ เปลี่ยนใน DB แล้ว!" });
    } catch (err) {
        console.error("APPROVE ERROR:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการอนุมัติ" });
    }
};

// ==========================================
// 📌 4. ดึงรายชื่อผู้ใช้ทั้งหมด (Admin)
// ==========================================
export const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, role, kyc_status, is_suspended, created_at 
             FROM users 
             ORDER BY created_at DESC`
        );
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error("Get All Users Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ==========================================
// 📌 5. ดึงรายการธุรกรรมทั้งหมด (Admin)
// ==========================================
export const getAllTransactions = async (req, res) => {
    try {
        // แอดมินดูธุรกรรมทั้งหมดในระบบ
        const result = await pool.query(
            `SELECT * FROM transactions ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Get All Transactions Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
