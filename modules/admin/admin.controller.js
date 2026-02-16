import pool from '../../config/db.js';

export const viewPendingKYC = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, kyc_status 
       FROM users WHERE kyc_status = 'pending'`
    );

    res.json({ pending_users: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch pending users" });
  }
};

export const approveRejectKYC = async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        message: "Status must be 'approved' or 'rejected'"
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET kyc_status = $1
       WHERE id = $2
       RETURNING id, full_name, email, kyc_status`,
      [status, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: `KYC ${status} successfully`,
      user: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "KYC update failed" });
  }
};
