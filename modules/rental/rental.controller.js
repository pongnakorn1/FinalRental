import pool from "../../config/db.js";

// =============================
// 📌 1. CREATE RENTAL (จองและแยกยอดเงิน)
// =============================
export const createRental = async (req, res) => {
  const client = await pool.connect();
  try {
    // รับค่า shipping_fee และ deposit_fee เพิ่มเข้ามา
    const { product_id, start_date, end_date, quantity, shipping_fee = 0, deposit_fee = 0 } = req.body;
    const userId = req.user.id;

    if (!product_id || !start_date || !end_date || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await client.query("BEGIN");

    // ดึงข้อมูลสินค้าและเช็คสต็อก
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

    // คำนวณวันและเงินแยก 3 ส่วน
    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    
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
    res.status(201).json({ message: "Rental created", rental: rentalResult.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Creation failed" });
  } finally {
    client.release();
  }
};

// =============================================
// 📌 2. OWNER APPROVE (หักสต็อกอัตโนมัติ)
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

    // หักสต็อก
    await client.query(`UPDATE products SET quantity = quantity - $1 WHERE id = $2`, [rental.quantity, rental.product_id]);
    await client.query(`UPDATE bookings SET status = 'waiting_payment' WHERE id = $1`, [rentalId]);

    await client.query("COMMIT");
    res.json({ message: "Approved" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Approval failed" });
  } finally {
    client.release();
  }
};

// ==================================================
// 📌 3. UPDATE STATUS (ระบบจัดการสถานะและการโอนเงิน)
// ==================================================
export const updateRentalStatus = async (req, res) => {
    const { id } = req.params;
    const { action, proof_url } = req.body;
    const userId = req.user.id;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // --- 🔍 ส่วนที่ 1: ดึงข้อมูลและล็อคแถวป้องกัน Race Condition ---
        const result = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Booking not found" });
        }
        const booking = result.rows[0];
        let nextStatus = "";
        let responseMessage = ""; 

        switch (action) {
            // ==========================================
            // 1. เจ้าของกดยอมรับการเช่า (APPROVE)
            // ==========================================
            case 'approve':
                // 1.1 เช็คสิทธิ์: ต้องเป็นเจ้าของเท่านั้น
                if (booking.owner_id !== userId) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Only owner can approve" });
                }
                // 1.2 เช็คสถานะ: ต้องเป็น pending เท่านั้น
                if (booking.status !== 'pending') {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "Status must be pending" });
                }
                // 1.3 อัปเดตสถานะและเวลาที่ยอมรับ (เพื่อเริ่มนับ 24 ชม.)
                nextStatus = 'approved';
                await client.query(`UPDATE bookings SET status = $1, approved_at = NOW() WHERE id = $2`, [nextStatus, id]);
                break;

            // ==========================================
            // 2. ผู้เช่าแจ้งชำระเงิน (PAY)
            // ==========================================
            case 'pay':
                // 2.1 เช็คสิทธิ์: ต้องเป็นผู้เช่าเท่านั้น
                if (booking.renter_id !== userId) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Only renter can pay" });
                }
                // 2.2 ตรวจสอบเวลา: ต้องไม่เกิน 24 ชม. หลังจากเจ้าของอนุมัติ
                const approvedAt = new Date(booking.approved_at);
                const diffInHours = (new Date() - approvedAt) / (1000 * 60 * 60);
if (diffInHours > 1000) { // เปลี่ยนจาก 24 เป็น 1000 ชั่วคราว
                
                    await client.query(`UPDATE bookings SET status = 'expired' WHERE id = $1`, [id]);
                    await client.query("COMMIT");
                    return res.status(400).json({ message: "เกินกำหนดเวลา 24 ชม. รายการถูกยกเลิก" });
                }
                // 2.3 ตรวจสอบหลักฐาน: ต้องส่งรูปสลิป
                if (!proof_url) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "กรุณาแนบรูปภาพใบสลิป" });
                }
                // 2.4 อัปเดตเป็นรอแอดมินตรวจสอบ
                nextStatus = 'waiting_verification';
                await client.query(`UPDATE bookings SET status = $1, payment_proof_url = $2 WHERE id = $3`, [nextStatus, proof_url, id]);
                break;

            // ==========================================
            // 3. แอดมินยืนยันยอดเงิน (ADMIN VERIFY)
            // ==========================================
            case 'admin_verify':
                // 3.1 เช็คสิทธิ์: ต้องเป็น Admin เท่านั้น
                if (req.user.role !== 'admin') {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Admin Only" });
                }
                // 3.2 คำนวณยอดเงินรวมที่ต้องจ่าย (ค่าเช่า + ค่าส่ง + มัดจำ)
                const totalAmount = parseFloat(booking.rent_fee) + parseFloat(booking.shipping_fee) + parseFloat(booking.deposit_fee);
                // 3.3 ตรวจสอบเงินใน Wallet ผู้เช่า
                const walletCheck = await client.query(`SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [booking.renter_id]);
                if (walletCheck.rowCount === 0 || walletCheck.rows[0].balance < totalAmount) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "ยอดเงินใน Wallet ไม่เพียงพอ" });
                }
                // 3.4 หักเงินและบันทึกธุรกรรม
                await client.query(`UPDATE wallets SET balance = balance - $1 WHERE user_id = $2`, [totalAmount, booking.renter_id]);
                await client.query(`INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) VALUES ($1, $2, $3, 'payment', 'ชำระค่าเช่า (Admin Verified)')`, [booking.renter_id, id, totalAmount]);
                // 3.5 เปลี่ยนสถานะเป็นชำระแล้ว
                nextStatus = 'paid';
                await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [nextStatus, id]);
                break;

            // ==========================================
            // 4. เจ้าของส่งสินค้า (SHIP)
            // ==========================================
            case 'ship':
                // 4.1 ตรวจสอบความครบถ้วนของข้อมูลขนส่ง
                const { outbound_shipping_company, outbound_tracking_number } = req.body;
                if (!outbound_shipping_company || !outbound_tracking_number || !proof_url) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "กรุณากรอกข้อมูลขนส่งและรูปภาพให้ครบ" });
                }
                // 4.2 บันทึกข้อมูลและเปลี่ยนสถานะเป็นส่งแล้ว
                nextStatus = 'shipped';
                await client.query(`UPDATE bookings SET status = $1, proof_before_shipping = $2, outbound_shipping_company = $3, outbound_tracking_number = $4 WHERE id = $5`, [nextStatus, proof_url, outbound_shipping_company, outbound_tracking_number, id]);
                break;

            // ==========================================
            // 5. ผู้เช่ายืนยันรับของ (RECEIVE)
            // ==========================================
            case 'receive':
                // 5.1 ตรวจสอบรูปภาพยืนยันการรับ
                if (!proof_url) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "กรุณาแนบรูปภาพสภาพสินค้าที่ได้รับ" });
                }
                // 5.2 คำนวณรายได้โอนให้เจ้าของ (เฉพาะค่าเช่า + ค่าส่ง)
                const payoutToOwner = parseFloat(booking.rent_fee) + parseFloat(booking.shipping_fee);
                await client.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [payoutToOwner, booking.owner_id]);
                await client.query(`INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) VALUES ($1, $2, $3, 'income', 'รายได้ค่าเช่าสินค้า')`, [booking.owner_id, id, payoutToOwner]);
                // 5.3 อัปเดตสถานะเป็นได้รับของแล้ว
                nextStatus = 'received';
                await client.query(`UPDATE bookings SET status = $1, proof_after_receiving = $2 WHERE id = $3`, [nextStatus, proof_url, id]);
                break;

            // ==========================================
            // 6. ผู้เช่าส่งของคืน (RETURN)
            // ==========================================
            case 'return':
                // 6.1 ตรวจสอบข้อมูลขนส่งขากลับ
                const { inbound_shipping_company, inbound_tracking_number } = req.body;
                if (!inbound_shipping_company || !inbound_tracking_number || !proof_url) {
                    await client.query("ROLLBACK");
                    return res.status(400).json({ message: "กรุณากรอกข้อมูลส่งคืนให้ครบถ้วน" });
                }
                // 6.2 คำนวณค่าปรับกรณีคืนช้า (1.5 เท่าต่อวัน)
                const now = new Date();
                const endDate = new Date(booking.end_date);
                let penaltyFee = 0;
                if (now > endDate) {
                    const diffInMs = now - endDate;
                    const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
                    penaltyFee = (parseFloat(booking.price_per_day) * 1.5) * diffInDays;
                }
                // 6.3 บันทึกข้อมูลและค่าปรับ
                nextStatus = 'returning';
                await client.query(`UPDATE bookings SET status = $1, proof_before_return = $2, inbound_shipping_company = $3, inbound_tracking_number = $4, penalty_fee = $5, returned_at = NOW() WHERE id = $6`, [nextStatus, proof_url, inbound_shipping_company, inbound_tracking_number, penaltyFee, id]);
                responseMessage = penaltyFee > 0 ? `(มีค่าปรับคืนช้า ${penaltyFee} บาท)` : "";
                break;

            // ==========================================
            // 7. เจ้าของตรวจสอบของและคืนมัดจำ (VERIFY)
            // ==========================================
            case 'verify':
                // 7.1 ตรวจสอบสิทธิ์และสถานะปัจจุบัน
                if (booking.owner_id !== userId) {
                    await client.query("ROLLBACK");
                    return res.status(403).json({ message: "Only owner can verify" });
                }
                // 7.2 รับข้อมูลค่าเสียหาย (ถ้ามี)
                const { damage_fee } = req.body;
                // 7.3 คำนวณเงินมัดจำที่จะคืน (มัดจำ - ค่าปรับ - ค่าเสียหาย)
                let refundAmount = parseFloat(booking.deposit_fee) - parseFloat(booking.penalty_fee || 0) - parseFloat(damage_fee || 0);
                refundAmount = Math.max(0, refundAmount); // กันติดลบ
                // 7.4 คืนเงินเข้า Wallet และบันทึกประวัติ
                await client.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [refundAmount, booking.renter_id]);
                await client.query(`INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) VALUES ($1, $2, $3, 'refund', 'คืนเงินมัดจำหลังหักค่าปรับ/ค่าเสียหาย')`, [booking.renter_id, id, refundAmount]);
                // 7.5 อัปเดตเป็นสถานะเสร็จสมบูรณ์
                nextStatus = 'completed';
                await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [nextStatus, id]);
                break;

            default:
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid action" });
        }

        // --- 💾 บันทึกการเปลี่ยนแปลงทั้งหมดและส่งผลลัพธ์ ---
        await client.query("COMMIT");
        res.json({ message: `Success: ${nextStatus} ${responseMessage}`, current_status: nextStatus });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Update Status Error:", err);
        res.status(500).json({ message: "Update failed" });
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
        const result = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        res.json(result.rows[0] || { balance: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};