import pool from "../../config/db.js";

// 1. ดึงรายการข้อพิพาททั้งหมด (AD-2-001)
export const getAllDisputes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT d.*, u.full_name as reporter_name 
            FROM disputes d
            JOIN users u ON d.raised_by = u.id
            ORDER BY d.created_at DESC
        `);
        res.status(200).json({ success: true, count: result.rowCount, disputes: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูลข้อพิพาทได้", error: err.message });
    }
};

// 2. ดึงรายละเอียดและหลักฐาน (Evidence) รายเคส (AD-2-001)
export const getDisputeById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("SELECT * FROM disputes WHERE id = $1", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบรายการข้อพิพาทนี้" });
        }
        res.status(200).json({ success: true, dispute: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด", error: err.message });
    }
};

// 3. ตัดสินข้อพิพาท (Update Status)
export const decideDispute = async (req, res) => {
    const { id } = req.params;
    const { status, admin_comment } = req.body; // status: 'resolved_refund', 'resolved_payout', 'rejected'

    // ตรวจสอบสถานะที่ส่งมา
    const validStatuses = ['resolved_refund', 'resolved_payout', 'rejected'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "สถานะไม่ถูกต้อง" });
    }

    try {
        const result = await pool.query(
            "UPDATE disputes SET status = $1, admin_comment = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
            [status, admin_comment, id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบรายการที่ต้องการอัปเดต" });
        }

        res.status(200).json({ success: true, message: "ตัดสินข้อพิพาทเรียบร้อย", dispute: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: "ไม่สามารถบันทึกคำตัดสินได้", error: err.message });
    }
};