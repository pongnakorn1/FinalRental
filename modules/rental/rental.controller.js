import pool from "../../config/db.js";

// =============================================
// 📌 1. CREATE RENTAL (จองและแยกยอดเงิน)
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

    if (product.quantity < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough stock" });
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
// 📌 2. OWNER APPROVE (เจ้าของอนุมัติ + หักสต็อก)
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

    if (rental.current_stock < rental.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Product no longer available" });
    }

    // ✅ 1. หักสต็อกทันที
    await client.query(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [rental.quantity, rental.product_id]);
    
    // ✅ 2. อัปเดตสถานะและบันทึกเวลา approved_at เพื่อใช้เช็ค 24 ชม.
    await client.query(
        `UPDATE bookings SET status = 'waiting_payment', approved_at = NOW() WHERE id = $1`, 
        [rentalId]
    );

    await client.query("COMMIT");
    res.json({ success: true, message: "Approved and stock deducted" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Approval failed: " + err.message });
  } finally {
    client.release();
  }
};

// ==================================================
// 📌 3. UPDATE STATUS (ระบบจัดการสถานะที่เหลือทั้งหมด)
// ==================================================
export const updateRentalStatus = async (req, res) => {
    const { id } = req.params;
    const { action, proof_url } = req.body;
    const userId = req.user.id;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const result = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Booking not found" });
        }
        const booking = result.rows[0];
        let nextStatus = "";

        switch (action) {
            case 'pay':
                if (booking.renter_id !== userId) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Only renter can pay" });
                }

                // 🕒 เช็คเวลา 24 ชม.
                if (!booking.approved_at) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "ยังไม่ได้รับการอนุมัติ" });
                }
                const diffInHours = (new Date() - new Date(booking.approved_at)) / (1000 * 60 * 60);
                if (diffInHours > 24) {
                    await client.query(`UPDATE bookings SET status = 'expired' WHERE id = $1`, [id]);
                    await client.query(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [booking.quantity, booking.product_id]);
                    await client.query("COMMIT");
                    return res.status(400).json({ message: "เกินกำหนด 24 ชม. ระบบคืนสต็อกแล้ว" });
                }

                if (!proof_url) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "กรุณาแนบรูปภาพสลิป" });
                }
                nextStatus = 'waiting_admin_verify';
                await client.query(`UPDATE bookings SET status = $1, slip_image = $2, payment_status = 'pending' WHERE id = $3`, [nextStatus, proof_url, id]);
                break;

            case 'admin_verify':
                if (req.user.role !== 'admin') {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Admin Only" });
                }
                nextStatus = 'paid';
                await client.query(`UPDATE bookings SET status = $1, payment_status = 'completed' WHERE id = $2`, [nextStatus, id]);
                break;

            case 'ship':
                const { outbound_shipping_company, outbound_tracking_number } = req.body;
                nextStatus = 'shipped';
                await client.query(
                    `UPDATE bookings SET status = $1, proof_before_shipping = $2, outbound_shipping_company = $3, outbound_tracking_number = $4 WHERE id = $5`, 
                    [nextStatus, proof_url, outbound_shipping_company, outbound_tracking_number, id]
                );
                break;

            case 'receive':
                nextStatus = 'received';
                // ✅ 1. อัปเดตสถานะของ Booking
                await client.query(`UPDATE bookings SET status = $1, proof_after_receiving = $2 WHERE id = $3`, [nextStatus, proof_url, id]);
                
                // ✅ 2. โอนเงินให้เจ้าของร้าน (ค่าเช่า + ค่าขนส่ง)
                // ตรวจสอบว่าเคยโอนไปหรือยัง (ปรับให้ตรงกับชื่อคอลัมน์ transaction_type)
                const transferCheck = await client.query(
                    `SELECT 1 FROM wallet_transactions WHERE booking_id = $1 AND transaction_type = 'payout' LIMIT 1`,
                    [id]
                );

                if (transferCheck.rowCount === 0) {
                    const payoutAmount = parseFloat(booking.rent_fee || 0) + parseFloat(booking.shipping_fee || 0);
                    
                    if (payoutAmount > 0) {
                        // เพิ่มเงินใน wallet ของเจ้าของ
                        await client.query(
                            `UPDATE users SET wallet = COALESCE(wallet, 0) + $1 WHERE id = $2`,
                            [payoutAmount, booking.owner_id]
                        );

                        // บันทึกประวัติธุรกรรม (ปรับให้ตรงกับชื่อคอลัมน์ transaction_type)
                        await client.query(
                            `INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [
                                booking.owner_id, 
                                id, 
                                payoutAmount, 
                                'payout', 
                                `รายได้จากการปล่อยเช่ารายการ #${id}`
                            ]
                        );
                    }
                }
                break;

            case 'return':
                const { inbound_shipping_company, inbound_tracking_number } = req.body;
                nextStatus = 'returning';
                await client.query(
                    `UPDATE bookings SET status = $1, proof_before_return = $2, inbound_shipping_company = $3, inbound_tracking_number = $4, returned_at = NOW() WHERE id = $5`, 
                    [nextStatus, proof_url, inbound_shipping_company, inbound_tracking_number, id]
                );
                break;

            case 'verify':
                if (booking.status === 'completed') {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "รายการนี้เสร็จสมบูรณ์แล้ว" });
                }
                nextStatus = 'completed';
                // ✅ 1. คืนสต็อกสินค้าเมื่อได้รับของคืนเสร็จสิ้น
                await client.query(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [booking.quantity, booking.product_id]);
                // ✅ 2. อัปเดตสถานะเป็นสำเร็จ
                await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [nextStatus, id]);
                break;

            case 'reject':
            case 'rejected':
                if (booking.owner_id !== userId) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Unauthorized" });
                }
                if (booking.status === 'rejected') {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "รายการนี้ถูกปฏิเสธไปแล้ว" });
                }
                nextStatus = 'rejected';
                // ✅ ถ้าถูกตัดสต็อกไปแล้ว (สถานะคือ waiting_payment) ให้คืนสต็อกด้วย
                if (booking.status === 'waiting_payment' || booking.status === 'approved') {
                    await client.query(`UPDATE products SET quantity = quantity + $1 WHERE id = $2`, [booking.quantity, booking.product_id]);
                }
                await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [nextStatus, id]);
                break;


            default:
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid action" });
        }

        await client.query("COMMIT");
        res.json({ success: true, current_status: nextStatus });
    } catch (err) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "Update failed: " + err.message });
    } finally {
        client.release();
    }
};
// ==================================================
// 📌 4. GET WALLET & TRANSACTIONS (ฟังก์ชันที่ต้องเพิ่มใหม่)
// ==================================================
export const getWalletBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        // ปรับให้ใช้คอลัมน์ wallet ในตาราง users เพื่อให้ตรงกับ money.controller.js
        const result = await pool.query('SELECT wallet as balance FROM users WHERE id = $1', [userId]);
        res.json(result.rows[0] || { balance: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT 
                wt.transaction_id as id,
                wt.*, 
                wt.transaction_type as type,
                wt.created_at as timestamp,
                u_renter.full_name as counterparty_name,
                b.rent_fee,
                b.shipping_fee,
                p.name as product_name
             FROM wallet_transactions wt
             LEFT JOIN bookings b ON wt.booking_id = b.id
             LEFT JOIN users u_renter ON b.renter_id = u_renter.id
             LEFT JOIN products p ON b.product_id = p.id
             WHERE wt.user_id = $1 
             ORDER BY wt.created_at DESC`,
            [userId]
        );
        res.json({ success: true, transactions: result.rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ดึงรายการที่ "เราไปเช่าคนอื่น" (สำหรับหน้า รายการเช่าของฉัน - ฝั่งผู้เช่า)
export const getRenterRentals = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT b.*, p.name as product_name, p.images, s.name as shop_name 
             FROM bookings b
             JOIN products p ON b.product_id = p.id
             JOIN shops s ON p.shop_id = s.id
             WHERE b.renter_id = $1 
             ORDER BY b.created_at DESC`, // ลบลูกน้ำออกและใส่ Backtick ครอบ
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Fetch rentals failed" });
    }
};

// ดึงรายการที่ "มีคนมาเช่าของร้านเรา" (สำหรับฝั่งเจ้าของร้าน)
export const getOwnerRentals = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT b.*, p.name as product_name, p.images, u.full_name as renter_name
             FROM bookings b
             JOIN products p ON b.product_id = p.id
             JOIN users u ON b.renter_id = u.id
             WHERE b.owner_id = $1 
             ORDER BY b.created_at DESC`, // ลบลูกน้ำออกและใส่ Backtick ครอบ
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Fetch owner rentals failed" });
    }
};

// ดึงข้อมูลการจองเพียงรายการเดียว
export const getRentalById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT b.*, p.name as product_name, p.images, p.price_per_day, s.name as shop_name 
             FROM bookings b
             JOIN products p ON b.product_id = p.id
             JOIN shops s ON p.shop_id = s.id
             WHERE b.id = $1`,
            [id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลการจอง" });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =============================================
// 📌 6. REPORT DAMAGE (แจ้งสินค้าเสียหาย)
// =============================================
export const reportDamage = async (req, res) => {
    const { id } = req.params;
    const { description } = req.body;
    const userId = req.user.id;
  
    if (!description && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรายละเอียดหรือแนบรูปภาพความเสียหาย" });
    }
  
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. ตรวจสอบว่า Booking นี้มีอยู่จริงและเป็นของ Renter หรือ Owner ที่เกี่ยวข้อง
        const bookingCheck = await client.query("SELECT * FROM bookings WHERE id = $1", [id]);
        if (bookingCheck.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลการจอง" });
        }
        
        const booking = bookingCheck.rows[0];
        
        // กรองรูปถาพ (Multer จะส่งมาใน req.files ในกรณีที่เป็น folder uploads ในเครื่อง)
        const images = req.files ? req.files.map(f => f.path.replace(/\\/g, '/')) : [];
        
        // 2. บันทึกลงตาราง disputes
        const result = await client.query(
            `INSERT INTO disputes (booking_id, raised_by, description, images, status)
             VALUES ($1, $2, $3, $4, 'pending')
             RETURNING *`,
            [id, userId, description || "ไม่ได้ระบุรายละเอียด", JSON.stringify(images)]
        );
        
        // 3. อัปเดตสถานะของ Booking เป็น disputed หรือคงไว้ แต่การมี Dispute จะทำให้ Admin เข้ามาดู
        await client.query(`UPDATE bookings SET status = 'disputed' WHERE id = $1`, [id]);
        
        await client.query("COMMIT");
        res.status(201).json({ success: true, message: "ส่งแจ้งปัญหาเรียบร้อย เจ้าหน้าที่จะดำเนินการตรวจสอบข้อมูล", dispute: result.rows[0] });
    } catch (err) {
        if (client) await client.query("ROLLBACK");
        console.error("Report Damage Error:", err);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการส่งข้อมูล: " + err.message });
    } finally {
        if (client) client.release();
    }
};