import pool from "../../pool.js"; // ดึง pool จากไฟล์หลักของคุณ

export const processAutoRefunds = async () => {
    console.log("🔍 [Cron Job] Checking for items returned > 24h ago...");
    const client = await pool.connect();
    
    try {
        // ดึงรายการที่สถานะเป็น returning เกิน 24 ชม.
        const expiredBookings = await client.query(`
            SELECT id, renter_id, deposit_fee, penalty_fee 
            FROM bookings 
            WHERE status = 'returning' 
            AND returned_at <= NOW() - INTERVAL '24 hours'
        `);

        for (let booking of expiredBookings.rows) {
            try {
                await client.query("BEGIN");

                const deposit = parseFloat(booking.deposit_fee);
                const penalty = parseFloat(booking.penalty_fee || 0);
                const refundAmount = Math.max(0, deposit - penalty);

                // 1. คืนเงินเข้า Wallet ของผู้เช่า
                await client.query(
                    "UPDATE wallets SET balance = balance + $1 WHERE user_id = $2",
                    [refundAmount, booking.renter_id]
                );

                // 2. บันทึกประวัติธุรกรรม
                await client.query(
                    `INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) 
                     VALUES ($1, $2, $3, 'refund', 'คืนมัดจำอัตโนมัติ (เจ้าของไม่แจ้งปัญหาภายใน 24 ชม.)')`,
                    [booking.renter_id, booking.id, refundAmount]
                );

                // 3. ปิดรายการเป็น completed
                await client.query("UPDATE bookings SET status = 'completed' WHERE id = $1", [booking.id]);

                await client.query("COMMIT");
                console.log(`✅ Auto-refunded Booking ID: ${booking.id} (Refund: ${refundAmount})`);
            } catch (err) {
                await client.query("ROLLBACK");
                console.error(`❌ Error processing Auto-Refund for ID ${booking.id}:`, err);
            }
        }
    } catch (err) {
        console.error("❌ Auto-refund main error:", err);
    } finally {
        client.release();
    }
};

// ฟังก์ชันสำหรับ Manual Trigger ผ่าน API
export const triggerAutoRefundManual = async (req, res) => {
    try {
        await processAutoRefunds();
        res.json({ message: "Auto-refund job executed successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};