import pool from "../../pool.js"; 

// ==========================================
// 📌 1. สร้างรีวิวใหม่ (หลังสถานะ completed)
// ==========================================
export const createReview = async (req, res) => {
    const { booking_id, rating, comment } = req.body;
    const userId = req.user.id; 
    const client = await pool.connect(); // ใช้ client เพื่อทำ Transaction

    try {
        await client.query("BEGIN");

        // --- 1.1 ตรวจสอบสิทธิ์และสถานะการจอง ---
        const bookingResult = await client.query(
            `SELECT id, owner_id, product_id, status 
             FROM bookings 
             WHERE id = $1 AND renter_id = $2 FOR UPDATE`,
            [booking_id, userId]
        );

        if (bookingResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "ไม่พบข้อมูลการจองของคุณ" });
        }

        const booking = bookingResult.rows[0];

        // --- 1.2 เงื่อนไขบังคับ: ต้องคืนของจบงานแล้วเท่านั้น ---
        if (booking.status !== 'completed') {
            await client.query("ROLLBACK");
            return res.status(400).json({ 
                message: "คุณจะรีวิวได้หลังจากขั้นตอนการคืนของเสร็จสมบูรณ์ (completed) เท่านั้น" 
            });
        }

        // --- 1.3 บันทึกรีวิวลงฐานข้อมูล ---
        await client.query(
            `INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, product_id, rating, comment)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [booking.id, userId, booking.owner_id, booking.product_id, rating, comment]
        );

        // --- 1.4 (เพิ่มเติม) อัปเดตคะแนนเฉลี่ยในตาราง products ทันที ---
        await client.query(
            `UPDATE products 
             SET rating_avg = (SELECT AVG(rating) FROM reviews WHERE product_id = $1),
                 review_count = review_count + 1
             WHERE id = $1`,
            [booking.product_id]
        );

        await client.query("COMMIT");
        res.status(201).json({ message: "ส่งรีวิวสำเร็จ ขอบคุณที่ใช้บริการครับ!" });

    } catch (error) {
        await client.query("ROLLBACK");
        // ดักจับ Error: รีวิวซ้ำ (Unique Constraint)
        if (error.code === '23505') {
            return res.status(400).json({ message: "คุณเคยรีวิวรายการนี้ไปแล้ว" });
        }
        console.error("Review Error:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกรีวิว" });
    } finally {
        client.release();
    }
};

// ==========================================
// 📌 2. ดึงรีวิวของสินค้า (สำหรับหน้า Product Detail)
// ==========================================
export const getProductReviews = async (req, res) => {
    const { product_id } = req.params;
    try {
        const reviews = await pool.query(
            `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name as reviewer_name 
             FROM reviews r
             JOIN users u ON r.reviewer_id = u.id
             WHERE r.product_id = $1
             ORDER BY r.created_at DESC`,
            [product_id]
        );
        res.json(reviews.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};