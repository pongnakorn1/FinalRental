import pool from "../../config/db.js";


// =============================
// 📌 ดูรายการ KYC ที่รออนุมัติ
// =============================
export const viewPendingKYC = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, kyc_status
       FROM users
       WHERE kyc_status = 'pending'
       ORDER BY id ASC`
    );

    res.status(200).json({
      pending_users: result.rows,
      total: result.rowCount
    });

  } catch (err) {
    console.error("viewPendingKYC error:", err);
    res.status(500).json({
      message: "Failed to fetch pending users"
    });
  }
};



// ==================================
// 📌 Admin อนุมัติ หรือ ปฏิเสธ KYC
// ==================================
export const approveRejectKYC = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { status } = req.body;

    // ❌ id ไม่ถูกต้อง
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: "Invalid user id"
      });
    }

    // ❌ status ต้องเป็น approved หรือ rejected เท่านั้น
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be 'approved' or 'rejected'"
      });
    }

    // 🔎 ตรวจว่า user มีอยู่และอยู่ในสถานะ pending
    const checkUser = await pool.query(
      `SELECT id, kyc_status
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (checkUser.rowCount === 0) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (checkUser.rows[0].kyc_status !== "pending") {
      return res.status(400).json({
        message: "KYC is not pending"
      });
    }

    // ✅ อัปเดตสถานะ
    const result = await pool.query(
      `UPDATE users
       SET kyc_status = $1
       WHERE id = $2
       RETURNING id, full_name, email, kyc_status`,
      [status, userId]
    );

    res.status(200).json({
      message: `KYC ${status} successfully`,
      user: result.rows[0]
    });

  } catch (err) {
    console.error("approveRejectKYC error:", err);
    res.status(500).json({
      message: "KYC update failed"
    });
  }
};
