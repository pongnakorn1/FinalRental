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
            // 1. เช็คยอดเงินใน Wallet
            const user = await pool.query('SELECT wallet FROM public.users WHERE id = $1', [userId]);
            if (user.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
            }
            const currentBalance = parseFloat(user.rows[0].wallet || 0);

            if (currentBalance < amount) {
                return res.json({ success: false, message: 'ยอดเงินไม่เพียงพอสำหรับการถอน' });
            }

            // 2. จัดการบัญชีธนาคาร (ถ้าไม่ได้ส่ง ID มาแต่ส่งข้อมูลบัญชีมา)
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

            // 3. เริ่ม Transaction
            await pool.query('BEGIN');
            
            // หักเงินจาก wallet
            await pool.query('UPDATE public.users SET wallet = wallet - $1 WHERE id = $2', [amount, userId]);
            
            // สร้างรายการถอน
            await pool.query(
                `INSERT INTO public.withdrawals (user_id, bank_account_id, amount, status) 
                 VALUES ($1, $2, $3, 'pending')`,
                [userId, bank_account_id, amount]
            );

            await pool.query('COMMIT');
            res.json({ success: true, message: 'ส่งคำขอถอนเงินสำเร็จ โปรดรอแอดมินดำเนินการ' });
        } catch (error) {
            await pool.query('ROLLBACK');
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // ดึงรายการถอนเงินทั้งหมด (Admin)
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

    // อนุมัติการถอนเงิน (Admin)
    approveWithdraw: async (req, res) => {
        try {
            const { withdrawal_id, admin_note, status } = req.body;
            
            if (!withdrawal_id) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุ withdrawal_id' });
            }

            let transfer_slip_url = req.body.transfer_slip_url || '';

            // ถ้ามีการอัปโหลดไฟล์ผ่าน multer
            if (req.file) {
                transfer_slip_url = `/uploads/slips/${req.file.filename}`;
            }

            const finalStatus = status === 'rejected' ? 'rejected' : 'completed';

            // ถ้าเป็นการปฏิเสธ (rejected) ให้คืนเงินกลับเข้ากระเป๋าผู้ใช้
            if (finalStatus === 'rejected') {
                const withdrawInfo = await pool.query('SELECT user_id, amount FROM public.withdrawals WHERE id = $1', [withdrawal_id]);
                if (withdrawInfo.rows.length > 0) {
                    const { user_id, amount } = withdrawInfo.rows[0];
                    await pool.query('UPDATE public.users SET wallet = wallet + $1 WHERE id = $2', [amount, user_id]);
                }
            }

            // อัปเดตรายการถอน
            const result = await pool.query(
                `UPDATE public.withdrawals 
                 SET status = $1, 
                     admin_note = $2, 
                     transfer_slip_url = $3
                 WHERE id = $4 
                 RETURNING *`,
                [finalStatus, admin_note, transfer_slip_url, withdrawal_id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการถอนที่ระบุ' });
            }

            res.json({ 
                success: true, 
                message: finalStatus === 'rejected' ? 'ปฏิเสธคำขอและคืนเงินเข้าวอลเล็ตแล้ว' : 'อนุมัติการถอนเงินเรียบร้อย',
                data: result.rows[0] 
            });
        } catch (error) {
            console.error("Approve Withdraw Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

export default moneyController;