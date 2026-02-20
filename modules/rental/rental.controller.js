import pool from "../../config/db.js";

// =============================
// 📌 CREATE RENTAL (จองสินค้า)
// =============================
export const createRental = async (req, res) => {
  const client = await pool.connect();

  try {
    const { product_id, start_date, end_date, quantity } = req.body;
    const userId = req.user.id; 

    if (!product_id || !start_date || !end_date || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than 0" });
    }

    await client.query("BEGIN");

    // 🔎 1. ล็อคสินค้าจากตาราง products
    const productResult = await client.query(
      `SELECT id, quantity, price_per_day, shop_id FROM products WHERE id = $1 FOR UPDATE`,
      [product_id]
    );

    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Product not found" });
    }

    const product = productResult.rows[0];

    // 🔎 2. ดึง owner_id จากตาราง shops
    const shopResult = await client.query(
      `SELECT owner_id FROM shops WHERE id = $1`,
      [product.shop_id]
    );

    // ป้องกันกรณีสินค้าไม่ได้ผูกกับร้านค้าที่ถูกต้อง
    const ownerId = shopResult.rowCount > 0 ? shopResult.rows[0].owner_id : null;

    // 🛡️ 3. ป้องกันเจ้าของเช่าของตัวเอง
    if (ownerId === userId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "You cannot rent your own product" });
    }

    // ✅ 4. เช็คสต็อก (ใช้ quantity จากตาราง products)
    if (product.quantity < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Not enough stock. Remaining ${product.quantity}`
      });
    }

    // 📅 5. คำนวณวัน
    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (days <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid rental period (end date must be after start date)" });
    }

    // 💰 6. คำนวณราคาทั้งหมด
    const totalPrice = days * parseFloat(product.price_per_day) * quantity;

    // 📥 7. บันทึกลงตาราง bookings
    // ตรวจสอบชื่อคอลัมน์ใน DB: renter_id, product_id, quantity, start_date, end_date, total_price, status, days, owner_id
    const rentalResult = await client.query(
      `INSERT INTO bookings
       (renter_id, product_id, quantity, start_date, end_date, total_price, status, days, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_owner', $7, $8)
       RETURNING *`,
      [userId, product_id, quantity, start_date, end_date, totalPrice, days, ownerId]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Rental created successfully",
      rental: rentalResult.rows[0]
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error at createRental:", err);
    
    // ดัก Error เมื่อไม่มีคอลัมน์ quantity ในตาราง bookings
    if (err.code === '42703') {
       return res.status(500).json({ 
         message: "Database schema mismatch: Column 'quantity' missing in 'bookings' table. Please run SQL to add column." 
       });
    }

    res.status(500).json({ message: "Rental creation failed" });
  } finally {
    client.release();
  }
};

// =============================
// 📌 OWNER APPROVE RENTAL (เจ้าของอนุมัติ)
// =============================
export const ownerApproveRental = async (req, res) => {
  const client = await pool.connect();

  try {
    const rentalId = req.params.id;
    const userId = req.user.id; // ID เจ้าของร้านจาก Token

    await client.query("BEGIN");

    // 🔎 1. ดึงข้อมูล Booking และเช็คสต็อกสินค้าปัจจุบัน
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

    // 🛡️ 2. เช็คสิทธิ์เจ้าของ
    if (rental.owner_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You are not the owner of this product" });
    }

    // 🛡️ 3. เช็คสถานะ Booking ว่ายังรออนุมัติอยู่ไหม
    if (rental.status !== "pending_owner") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Rental already processed" });
    }

    // 🔒 4. เช็คสต็อกอีกครั้งก่อนหักจริง
    if (rental.current_stock < rental.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Product quantity is no longer enough" });
    }

    // ✅ 5. หักสต็อกสินค้าจริงออกจากตาราง products
    await client.query(
      `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
      [rental.quantity, rental.product_id]
    );

    // ✅ 6. อัปเดตสถานะในตาราง bookings
    await client.query(
      `UPDATE bookings SET status = 'owner_approved' WHERE id = $1`,
      [rentalId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Rental approved and product quantity updated",
      status: "owner_approved"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error at ownerApproveRental:", err);
    res.status(500).json({ message: "Owner approval failed" });
  } finally {
    client.release();
  }
}



export const updateRentalStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params; 
    const { action } = req.body; 
    const userId = req.user.id;

    await client.query("BEGIN");

    // 🔎 1. ดึงข้อมูลการจองมาตรวจสอบ
    const result = await client.query(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = result.rows[0];
    let nextStatus = "";

    // 🛡️ 2. ตรรกะการเปลี่ยนสถานะ
    switch (action) {
      case 'ship': 
        if (booking.owner_id !== userId) return res.status(403).json({ message: "Only owner can ship" });
        if (booking.status !== 'completed') return res.status(400).json({ message: "Payment not verified yet" });
        nextStatus = 'shipped';
        break;

      case 'receive': 
        if (booking.renter_id !== userId) return res.status(403).json({ message: "Only renter can confirm receipt" });
        if (booking.status !== 'shipped') return res.status(400).json({ message: "Item not shipped yet" });
        nextStatus = 'received';
        break;

      case 'return': 
        if (booking.renter_id !== userId) return res.status(403).json({ message: "Only renter can return item" });
        if (booking.status !== 'received') return res.status(400).json({ message: "You haven't received the item yet" });
        nextStatus = 'returning';
        break;

      case 'verify': // เจ้าของร้านได้รับของคืนและตรวจสภาพ
        if (booking.owner_id !== userId) return res.status(403).json({ message: "Only owner can verify return" });
        if (booking.status !== 'returning') return res.status(400).json({ message: "Item not in returning process" });
        
        nextStatus = 'returned_and_verified';

        // ✅ เพิ่มส่วนนี้: บวกสต็อกคืนเข้าตาราง products
        await client.query(
          `UPDATE products 
           SET quantity = quantity + $1 
           WHERE id = $2`,
          [booking.quantity, booking.product_id]
        );
        break;

      default:
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Invalid action" });
    }

    // 🔄 3. อัปเดตสถานะในตาราง bookings
    await client.query(
      `UPDATE bookings SET status = $1 WHERE id = $2`,
      [nextStatus, id]
    );

    await client.query("COMMIT");
    res.json({ 
      message: `Status updated to ${nextStatus} and stock returned`, 
      current_status: nextStatus 
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Update Status Error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};
