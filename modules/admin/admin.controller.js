import pool from "../../config/db.js";

// ฟังก์ชันดึงรายการที่รอตรวจสอบ (KYC-1-004)
export const viewPendingKYC = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, email, id_card_number, id_card_image, face_image, kyc_status 
             FROM users 
             WHERE kyc_status = 'pending'
             ORDER BY id ASC` // เพิ่มการเรียงลำดับเพื่อให้หน้าบ้านแสดงผลไม่กระโดด
        );
        
        res.status(200).json({ 
            success: true,
            count: result.rowCount,
            pending_users: result.rows 
        });
    } catch (err) {
        console.error("View Pending Error:", err.message);
        res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูลผู้ใช้ที่รอตรวจสอบได้" });
    }
};

// ฟังก์ชันอนุมัติหรือปฏิเสธ KYC
export const approveRejectKYC = async (req, res) => {
    const userId = req.params.id;
    const { status } = req.body;

    try {
        // 1. ตรวจสอบสถานะที่ส่งมา
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "สถานะต้องเป็น 'approved' หรือ 'rejected' เท่านั้น"
            });
        }

        // 2. อัปเดตฐานข้อมูล
        const result = await pool.query(
            `UPDATE users
             SET kyc_status = $1,
                 updated_at = NOW() -- เก็บเวลาที่ Admin ตรวจสอบ
             WHERE id = $2
             RETURNING id, full_name, email, kyc_status`,
            [status, userId]
        );

        // 3. เช็คว่าเจอ User หรือไม่
        if (result.rowCount === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "ไม่พบข้อมูลผู้ใช้งานในระบบ" 
            });
        }

        // 4. ส่งผลลัพธ์กลับไปให้หน้าบ้านอัปเดต UI
        res.status(200).json({
            success: true,
            message: `เปลี่ยนสถานะเป็น ${status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'} เรียบร้อยแล้ว`,
            user: result.rows[0]
        });

    } catch (err) {
        console.error("Update KYC Error:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "เกิดข้อผิดพลาดในการอัปเดตสถานะในระบบฐานข้อมูล" 
        });
    }
};
