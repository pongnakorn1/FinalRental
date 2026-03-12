import pool from '../../pool.js';

const moneyController = {
    // เพิ่มบัญชีธนาคาร (ผูกบัญชี)
    addBankAccount: async (req, res) => {
        const { user_id, bank_name, account_number, account_name } = req.body;
        try {
            await pool.query(
                `INSERT INTO public.bank_accounts (user_id, bank_name, account_number, account_name) 
                 VALUES ($1, $2, $3, $4)`,
                [user_id, bank_name, account_number, account_name]
            );
            res.json({ success: true, message: 'ผูกบัญชีธนาคารสำเร็จ' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // ส่งคำขอถอนเงิน
    requestWithdraw: async (req, res) => {
        const { user_id, bank_account_id, amount } = req.body;
        try {
            // 1. เช็คยอดเงินใน Wallet (ตาราง users คอลัมน์ wallet)
            const user = await pool.query('SELECT wallet FROM public.users WHERE id = $1', [user_id]);
            const currentBalance = parseFloat(user.rows[0].wallet || 0);

            if (currentBalance < amount) {
                return res.json({ success: false, message: 'ยอดเงินไม่เพียงพอสำหรับการถอน' });
            }

            // 2. เริ่ม Transaction (หักเงินและสร้างรายการถอน)
            await pool.query('BEGIN');
            
            // หักเงินจาก wallet ในตาราง users
            await pool.query('UPDATE public.users SET wallet = wallet - $1 WHERE id = $2', [amount, user_id]);
            
            // สร้างรายการในตาราง withdrawals
            await pool.query(
                `INSERT INTO public.withdrawals (user_id, bank_account_id, amount, status) 
                 VALUES ($1, $2, $3, 'pending')`,
                [user_id, bank_account_id, amount]
            );

            await pool.query('COMMIT');
            res.json({ success: true, message: 'ส่งคำขอถอนเงินสำเร็จ โปรดรอแอดมินดำเนินการ' });
        } catch (error) {
            await pool.query('ROLLBACK');
            res.status(500).json({ success: false, error: error.message });
        }
    },


    // ดึงรายการถอนเงินทั้งหมด (Admin) - เรียงลำดับ pending ขึ้นก่อน
    getPendingWithdrawals: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT w.*, u.full_name, u.email, u.profile_image, 
                        b.bank_name, b.account_number, b.account_name
                 FROM public.withdrawals w
                 JOIN public.users u ON w.user_id = u.id
                 JOIN public.bank_accounts b ON w.bank_account_id = b.id
                 ORDER BY 
                    CASE WHEN w.status = 'pending' THEN 0 ELSE 1 END,
                    w.created_at DESC`
            );
            res.json(result.rows);
        } catch (error) {
            console.error("Fetch Withdrawals Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    approveWithdraw: async (req, res) => {
        try {
            // รับข้อมูลจาก body (JSON)
            const { withdrawal_id, admin_note, transfer_slip_url } = req.body;

            if (!withdrawal_id) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุ ID รายการถอนเงิน (withdrawal_id is required)' });
            }

            // อัปเดตสถานะและบันทึกข้อมูลหลักฐานการโอน (สลิปอาจเป็น Base64 หรือ URL)
            const result = await pool.query(
                `UPDATE public.withdrawals 
                 SET status = 'completed', 
                     admin_note = $1, 
                     transfer_slip_url = $2
                 WHERE id = $3 
                 RETURNING *`,
                [admin_note, transfer_slip_url, withdrawal_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการถอนที่ระบุ' });
            }

            res.json({ 
                success: true, 
                message: 'อนุมัติการถอนเงินเรียบร้อย',
                data: result.rows[0] 
            });
        } catch (error) {
            console.error("Approve Withdraw Error:", error);
            res.status(500).json({ success: false, error: 'Server Error: ' + error.message });
        }
    }
}

export default moneyController;