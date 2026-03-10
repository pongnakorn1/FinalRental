import pool from "../../config/db.js";

// =============================================
// 📌 1. CREATE RENTAL (ผู้เช่ากดยืนยันการจอง)
// =============================================
export const createRental = async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, start_date, end_date, quantity, shipping_fee = 0, deposit_fee = 0 } = req.body;
    const userId = req.user.id;

    if (!product_id || !start_date || !end_date || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await client.query("BEGIN");

    const productResult = await client.query(
      `SELECT id, quantity, price_per_day, shop_id FROM products WHERE id = $1 FOR UPDATE`,
      [product_id]
    );

    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productResult.rows[0];
    const shopResult = await client.query(`SELECT owner_id FROM shops WHERE id = $1`, [product.shop_id]);
    const ownerId = shopResult.rows[0]?.owner_id;

    if (ownerId === userId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "You cannot rent your own product" });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1; 
    
    const rent_fee = days * parseFloat(product.price_per_day) * quantity;
    const total_price = rent_fee + parseFloat(shipping_fee) + parseFloat(deposit_fee);

    const rentalResult = await client.query(
      `INSERT INTO bookings
       (renter_id, product_id, quantity, start_date, end_date, rent_fee, shipping_fee, deposit_fee, total_price, status, days, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_owner', $10, $11)
       RETURNING *`,
      [userId, product_id, quantity, start_date, end_date, rent_fee, shipping_fee, deposit_fee, total_price, days, ownerId]
    );

    await client.query("COMMIT");
    res.status(201).json({ success: true, rental: rentalResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Creation failed: " + err.message });
  } finally {
    client.release();
  }
};

// =============================================
// 📌 2. CREATE PAYMENT (ผู้เช่าอัปโหลดรูปสลิป) - **แก้บั๊ก Error 500 แล้ว**
// =============================================
export const createPayment = async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { rental_id, slip_image } = req.body;
    console.log("📦 Payment Request:", { rental_id, slipLength: slip_image?.length, userId: req.user?.id });


    const userId = req.user.id;

    if (!rental_id || !slip_image) {
      return res.status(400).json({ message: "Rental ID and slip image required" });
    }

    await client.query("BEGIN");

    // 🔎 1. แก้ไข SQL ให้ใช้ parseInt เพื่อป้องกัน Error 500 เรื่องชนิดข้อมูล
    const rentalResult = await client.query(
      `SELECT * FROM bookings WHERE id = $1 AND renter_id = $2 FOR UPDATE`,
      [parseInt(rental_id), parseInt(userId)]
    );

    if (rentalResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Rental booking not found" });
    }

    const rental = rentalResult.rows[0];

    // ✅ 2. ตรวจสอบสถานะ (ยอมรับทั้ง waiting_payment และ approved)
    if (rental.status !== "waiting_payment" && rental.status !== "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "รายการนี้ยังไม่พร้อมสำหรับการชำระเงิน" });
    }

    // 🔄 3. อัปเดตลงตาราง bookings (ตรวจสอบชื่อคอลัมน์ให้ตรงตาม Supabase หน้า 2)
    const updatedBooking = await client.query(
      `UPDATE bookings
       SET slip_image = $1, 
           status = 'waiting_admin_verify',
           payment_status = 'pending'
       WHERE id = $2
       RETURNING *`,
      [slip_image, parseInt(rental_id)]
    );

    await client.query("COMMIT");
    res.status(200).json({ success: true, message: "Upload slip successfully", booking: updatedBooking.rows[0] });

  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("Error at createPayment:", err);
    res.status(500).json({ message: "Payment upload failed: " + err.message });
  } finally {
    if (client) client.release();
  }
};


// =============================================
// 📌 2.1 ดึงรายการสลิปที่รอการตรวจสอบ
// =============================================
export const getPendingVerifyBookings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.full_name as renter_name 
       FROM bookings b
       JOIN users u ON b.renter_id = u.id
       WHERE b.status = 'waiting_admin_verify'
       ORDER BY b.created_at DESC`
    );
    // ส่งกลับเป็นรูปแบบ Object ที่มี success: true
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Fetch Pending Slips Error:", err);
    res.status(500).json({ success: false, message: "Fetch pending slips failed" });
  }
};


// =============================================
// 📌 3. OWNER APPROVE (เจ้าของกดยอมรับการเช่า)

// =============================================
export const ownerApproveRental = async (req, res) => {
  const client = await pool.connect();
  try {
    const rentalId = req.params.id;
    const userId = req.user.id;

    await client.query("BEGIN");

    const result = await client.query(
      `SELECT r.*, p.quantity AS current_stock
       FROM bookings r
       JOIN products p ON r.product_id = p.id
       WHERE r.id = $1 FOR UPDATE`,
      [rentalId]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = result.rows[0];
    if (rental.owner_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Unauthorized" });
    }

    // หักสต็อกและเปลี่ยนสถานะเป็น waiting_payment
    await client.query(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [rental.quantity, rental.product_id]);
    await client.query(`UPDATE bookings SET status = 'waiting_payment', approved_at = NOW() WHERE id = $1`, [rentalId]);

    await client.query("COMMIT");
    res.json({ success: true, message: "Approved" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Approval failed: " + err.message });
  } finally {
    client.release();
  }
};

// =============================================
// 📌 4. ADMIN VERIFY (แอดมินยืนยันยอดเงินจากสลิป)
// =============================================
export const adminVerifyPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    const bookingId = req.params.id;
    const { approve } = req.body;

    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [bookingId]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking not found" });
    }

    if (approve) {
      await client.query(
        `UPDATE bookings SET status = 'paid', payment_status = 'paid' WHERE id = $1`,
        [bookingId]
      );
      await client.query("COMMIT");
      res.json({ success: true, message: "Payment verified" });
    } else {
      await client.query(
        `UPDATE bookings SET status = 'waiting_payment', payment_status = 'rejected' WHERE id = $1`,
        [bookingId]
      );
      await client.query("COMMIT");
      res.json({ message: "Payment rejected, waiting for new slip" });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Verification failed: " + err.message });
  } finally {
    client.release();
  }
};

// ==================================================
// 📌 5. GET DATA (ฟังก์ชันดึงข้อมูลต่างๆ)
// ==================================================
export const getRenterRentals = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT b.*, p.name as product_name, p.images, s.name as shop_name 
             FROM bookings b
             JOIN products p ON b.product_id = p.id
             JOIN shops s ON p.shop_id = s.id
             WHERE b.renter_id = $1 ORDER BY b.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Fetch rentals failed" });
    }
};

export const getOwnerRentals = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT b.*, p.name as product_name, p.images, u.full_name as renter_name
             FROM bookings b
             JOIN products p ON b.product_id = p.id
             JOIN users u ON b.renter_id = u.id
             WHERE b.owner_id = $1 ORDER BY b.created_at DESC`,
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ message: "Fetch owner rentals failed" });
    }
};
