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
        const userId = req.user?.id || req.body.user_id;
        let { bank_account_id, amount, bank_name, account_number, account_name } = req.body;
        
        if (!userId) {
            return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
        }

        try {
            // 1. เช็คยอดเงินใน Wallet (ตาราง users คอลัมน์ wallet)
            const user = await pool.query('SELECT wallet FROM public.users WHERE id = $1', [userId]);
            if (user.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
            }
            const currentBalance = parseFloat(user.rows[0].wallet || 0);

            if (currentBalance < amount) {
                return res.json({ success: false, message: 'ยอดเงินไม่เพียงพอสำหรับการถอน' });
            }

            // 2. ถ้าไม่มี bank_account_id แต่มีข้อมูลบัญชี ให้สร้างหรือผูกบัญชีอัตโนมัติ (Method 2)
            if (!bank_account_id && account_number) {
                const existingBank = await pool.query(
                    'SELECT id FROM public.bank_accounts WHERE user_id = $1 AND account_number = $2',
                    [userId, account_number]
                );
                
                if (existingBank.rows.length > 0) {
                    bank_account_id = existingBank.rows[0].id;
                } else {
                    const newBank = await pool.query(
                        `INSERT INTO public.bank_accounts (user_id, bank_name, account_number, account_name) 
                         VALUES ($1, $2, $3, $4) RETURNING id`,
                        [userId, bank_name || 'ไม่ระบุธนาคาร', account_number, account_name]
                    );
                    bank_account_id = newBank.rows[0].id;
                }
            }

            if (!bank_account_id) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุข้อมูลบัญชีธนาคาร' });
            }

            // 3. เริ่ม Transaction (หักเงินและสร้างรายการถอน)
            await pool.query('BEGIN');
            
            // หักเงินจาก wallet ในตาราง users
            await pool.query('UPDATE public.users SET wallet = wallet - $1 WHERE id = $2', [amount, userId]);
            
            // สร้างรายการในตาราง withdrawals
            await pool.query(
                `INSERT INTO public.withdrawals (user_id, bank_account_id, amount, status) 
                 VALUES ($1, $2, $3, 'pending')`,
                [userId, bank_account_id, amount]
            );

            await pool.query('COMMIT');
            res.json({ success: true, message: 'ส่งคำขอถอนเงินสำเร็จ โปรดรอแอดมินดำเนินการ' });
        } catch (error) {
            if (pool.query) await pool.query('ROLLBACK');
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
        const { withdrawal_id, requestId, status, admin_note, transfer_slip_url, comment } = req.body;
        const id = withdrawal_id || requestId;
        const finalStatus = status === 'rejected' ? 'rejected' : 'completed';
        const finalNote = admin_note || comment;

        try {
            // 1. Fetch the withdrawal request to get amount and user_id
            const requestQuery = await pool.query('SELECT user_id, amount FROM public.withdrawals WHERE id = $1', [id]);
            if (requestQuery.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการถอนที่ระบุ' });
            }
            const { user_id, amount } = requestQuery.rows[0];

            // 2. ถ้าปฏิเสธ (rejected) ให้คืนเงินกลับเข้ากระเป๋า
            if (finalStatus === 'rejected') {
                await pool.query('UPDATE public.users SET wallet = wallet + $1 WHERE id = $2', [amount, user_id]);
            }

            // 3. อัปเดตสถานะและใส่ข้อมูลหลักฐาน
            const result = await pool.query(
                `UPDATE public.withdrawals 
                 SET status = $1, 
                     admin_note = $2, 
                     transfer_slip_url = $3
                 WHERE id = $4 
                 RETURNING *`,
                [finalStatus, finalNote, transfer_slip_url, id]
            );

            res.json({ 
                success: true, 
                message: finalStatus === 'rejected' ? 'ปฏิเสธรายการถอนและคืนเงินเรียบร้อย' : 'อนุมัติการถอนเงินเรียบร้อย',
                data: result.rows[0] 
            });
        } catch (error) {
            console.error("Approve Withdraw Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

export default moneyController;