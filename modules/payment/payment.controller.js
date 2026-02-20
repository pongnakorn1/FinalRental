import pool from "../../config/db.js";

// =============================
// 📌 USER UPLOAD PAYMENT SLIP
// =============================
export const createPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const { rental_id, slip_image } = req.body; // rental_id คือ id จากตาราง bookings
    const userId = req.user.id;

    if (!rental_id || !slip_image) {
      return res.status(400).json({ message: "Rental ID and slip image required" });
    }

    await client.query("BEGIN");

    // 🔎 1. เปลี่ยนชื่อตารางเป็น bookings และคอลัมน์เป็น renter_id
    const rentalResult = await client.query(
      `SELECT * FROM bookings 
       WHERE id = $1 AND renter_id = $2
       FOR UPDATE`,
      [rental_id, userId]
    );

    if (rentalResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Rental booking not found" });
    }

    const rental = rentalResult.rows[0];

    // ✅ 2. ตรวจสอบสถานะ (ต้องผ่านการอนุมัติจากเจ้าของก่อน)
    if (rental.status !== "waiting_payment") {
    await client.query("ROLLBACK");
    return res.status(400).json({ message: "Rental is not ready for payment" });
}

    // 🔄 3. อัปเดตลงตาราง bookings โดยตรง (เพราะคุณมีคอลัมน์ slip_image อยู่แล้ว)
    const updatedBooking = await client.query(
      `UPDATE bookings
       SET slip_image = $1, 
           status = 'waiting_admin_verify',
           payment_status = 'pending'
       WHERE id = $2
       RETURNING *`,
      [slip_image, rental_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Slip uploaded successfully",
      booking: updatedBooking.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error at createPayment:", err);
    res.status(500).json({ message: "Payment upload failed" });
  } finally {
    client.release();
  }
};

// =============================
// 📌 ADMIN VERIFY PAYMENT
// =============================
export const adminVerifyPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const bookingId = req.params.id; // รับ ID ของการจอง
    const { approve } = req.body;

    if (typeof approve !== "boolean") {
      return res.status(400).json({ message: "Approve must be true or false" });
    }

    await client.query("BEGIN");

    // 🔎 1. ตรวจสอบข้อมูลการจอง
    const result = await client.query(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking not found" });
    }

    if (approve) {
      // ✅ 2. อนุมัติ: เปลี่ยนสถานะเป็น completed และ paid
      await client.query(
        `UPDATE bookings 
         SET status = 'paid', 
             payment_status = 'paid' 
         WHERE id = $1`,
        [bookingId]
      );

      // ⚠️ หมายเหตุ: ไม่ต้องหักสต็อกซ้ำ เพราะเราหักไปแล้วในขั้นตอน owner_approved

      await client.query("COMMIT");
      res.json({ message: "Payment verified, rental completed" });

    } else {
      // ❌ 3. ปฏิเสธ: ส่งกลับไปสถานะรอชำระใหม่ หรือยกเลิก
      await client.query(
        `UPDATE bookings 
         SET status = 'owner_approved', 
             payment_status = 'rejected' 
         WHERE id = $1`,
        [bookingId]
      );

      await client.query("COMMIT");
      res.json({ message: "Payment rejected, waiting for new slip" });
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error at adminVerifyPayment:", err);
    res.status(500).json({ message: "Admin verification failed" });
  } finally {
    client.release();
  }
};