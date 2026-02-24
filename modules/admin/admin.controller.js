import pool from "../../config/db.js";

// ==========================================
// 📌 1. ดูรายการ KYC ที่รออนุมัติ
// ==========================================
export const viewPendingKYC = async (req, res) => {
  try {
    // เพิ่มการดึงข้อมูลที่จำเป็นต้องใช้ตรวจ (เช่น id_card_url)
    const result = await pool.query(
      `SELECT id, full_name, email, kyc_status, id_card_number, id_card_image_url 
       FROM users 
       WHERE kyc_status = 'pending' 
       ORDER BY created_at ASC`
    );

    res.status(200).json({
      pending_users: result.rows,
      total: result.rowCount
    });
  } catch (err) {
    console.error("viewPendingKYC error:", err);
    res.status(500).json({ message: "Failed to fetch pending users" });
  }
};

// ==========================================
// 📌 2. Admin อนุมัติ หรือ ปฏิเสธ KYC
// ==========================================
export const approveRejectKYC = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' หรือ 'rejected'
  const adminId = req.user.id; // เก็บไว้เผื่อทำ Log ว่าแอดมินคนไหนเป็นคนกด

  try {
    // ตรวจสอบสถานะที่ส่งมา
    const cleanStatus = status?.trim().toLowerCase();
    if (!["approved", "rejected"].includes(cleanStatus)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }

    const result = await pool.query(
      `UPDATE users 
       SET kyc_status = $1, 
           kyc_verified_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END
       WHERE id = $2 AND kyc_status = 'pending'
       RETURNING id, full_name, kyc_status`,
      [cleanStatus, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบผู้ใช้ที่รอการยืนยันตัวตนนี้" });
    }

    res.status(200).json({
      message: `KYC ${cleanStatus} successfully`,
      user: result.rows[0]
    });
  } catch (err) {
    console.error("approveRejectKYC error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ==========================================
// 📌 3. ระบบระงับการใช้งาน (Suspend User)
// ==========================================
export const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { is_suspended, reason } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET is_suspended = $1, 
           suspension_reason = $2, 
           suspended_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
       WHERE id = $3
       RETURNING id, full_name, is_suspended`,
      [is_suspended, reason, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const statusText = is_suspended ? "ระงับการใช้งาน" : "ยกเลิกการระงับ";
    res.status(200).json({
      message: `${statusText} เรียบร้อยแล้ว`,
      user: result.rows[0]
    });
  } catch (err) {
    console.error("suspendUser error:", err);
    res.status(500).json({ message: "Failed to update user status" });
  }
};
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
