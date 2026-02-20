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
// 📌 3. UPDATE STATUS (ระบบโอนเงินตาม Action) 
// ==================================================
export const updateRentalStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.user.id;

        await client.query("BEGIN");

        const result = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [id]);
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Booking not found" });
        }

        const booking = result.rows[0];
        let nextStatus = "";

        switch (action) {
            case 'ship':
                if (booking.owner_id !== userId) return res.status(403).json({ message: "Only owner can ship" });
                if (booking.status !== 'paid') {
                    return res.status(400).json({ message: "ผู้เช่ายังไม่ได้ชำระเงิน" });
                }
                nextStatus = 'shipped';
                break;

            case 'receive':
                if (booking.renter_id !== userId) return res.status(403).json({ message: "Only renter can confirm" });
                if (booking.status !== 'shipped') return res.status(400).json({ message: "Item not shipped yet" });

                nextStatus = 'received';
                const rentalAmount = parseFloat(booking.rent_fee) || 0;
                const shippingAmount = parseFloat(booking.shipping_fee) || 0;
                const payoutAmount = rentalAmount + shippingAmount;

                if (payoutAmount > 0) {
                    // 💰 1. อัปเดตเงินในกระเป๋าเจ้าของ
                    await client.query(
                        `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
                        [payoutAmount, booking.owner_id]
                    );
                    // 📝 2. บันทึกประวัติ
                    await client.query(
                        `INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) 
                         VALUES ($1, $2, $3, 'income', 'รายได้ค่าเช่าและค่าจัดส่ง')`,
                        [booking.owner_id, id, payoutAmount]
                    );
                }
                break;

            case 'return':
                if (booking.renter_id !== userId) return res.status(403).json({ message: "Only renter can initiate return" });
                nextStatus = 'returning';
                break;

            case 'verify':
                if (booking.owner_id !== userId) return res.status(403).json({ message: "Only owner can verify" });
                if (booking.status !== 'returning') return res.status(400).json({ message: "Not in returning process" });

                const { is_damaged, damage_fee, damage_note } = req.body;
                const totalDeposit = parseFloat(booking.deposit_fee) || 0;

                let refundToRenter = totalDeposit;
                let payoutToOwner = 0;

                if (is_damaged && damage_fee > 0) {
                    payoutToOwner = parseFloat(damage_fee);
                    if (payoutToOwner > totalDeposit) payoutToOwner = totalDeposit;
                    refundToRenter = totalDeposit - payoutToOwner;
                }

                nextStatus = 'returned_and_verified';

                // 💰 1. คืนมัดจำส่วนที่เหลือให้ผู้เช่า
                if (refundToRenter > 0) {
                    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [refundToRenter, booking.renter_id]);
                    await client.query(
                        `INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) 
                         VALUES ($1, $2, $3, 'refund', 'คืนเงินมัดจำสินค้า')`,
                        [booking.renter_id, id, refundToRenter]
                    );
                }

                // 💰 2. จ่ายค่าเสียหายให้เจ้าของ (ถ้ามี)
                if (payoutToOwner > 0) {
                    await client.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [payoutToOwner, booking.owner_id]);
                    await client.query(
                        `INSERT INTO wallet_transactions (user_id, booking_id, amount, transaction_type, description) 
                         VALUES ($1, $2, $3, 'compensation', 'ค่าชดเชยความเสียหายสินค้า')`,
                        [booking.owner_id, id, payoutToOwner]
                    );
                }

                await client.query(
                    `UPDATE bookings SET damage_report = $1, status = $2 WHERE id = $3`,
                    [damage_note || (is_damaged ? 'Damaged' : 'Normal'), nextStatus, id]
                );
                break;

            default:
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid action" });
        }

        if (nextStatus && action !== 'verify') { // verify อัปเดตสถานะไปแล้วพร้อม damage_report
            await client.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [nextStatus, id]);
        }
        
        await client.query("COMMIT");
        res.json({ message: `Success: ${nextStatus}`, current_status: nextStatus });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
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