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