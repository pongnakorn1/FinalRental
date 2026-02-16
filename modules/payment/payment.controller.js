import pool from '../../config/db.js';

export const createPayment = async (req, res) => {
  try {
    const { rental_id, slip_image } = req.body;
    const userId = req.user.id;

    const rentalResult = await pool.query(
      `SELECT * FROM rentals WHERE id = $1 AND user_id = $2`,
      [rental_id, userId]
    );

    if (rentalResult.rows.length === 0)
      return res.status(404).json({
        message: "Rental not found"
      });

    const rental = rentalResult.rows[0];

    if (rental.status !== 'owner_approved')
      return res.status(400).json({
        message: "Rental is not ready for payment"
      });

    const paymentResult = await pool.query(
      `INSERT INTO payments (rental_id, slip_image)
       VALUES ($1, $2)
       RETURNING *`,
      [rental_id, slip_image]
    );

    await pool.query(
      `UPDATE rentals
       SET status = 'waiting_admin_verify'
       WHERE id = $1`,
      [rental_id]
    );

    res.status(201).json({
      message: "Slip uploaded successfully",
      payment: paymentResult.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Payment upload failed"
    });
  }
};

export const adminVerifyPayment = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { approve } = req.body;

    if (req.user.role !== 'admin')
      return res.status(403).json({
        message: "Only admin can verify payments"
      });

    const paymentResult = await pool.query(
      `
      SELECT p.*, r.product_id, r.id AS rental_id
      FROM payments p
      JOIN rentals r ON p.rental_id = r.id
      WHERE p.id = $1
      `,
      [paymentId]
    );

    if (paymentResult.rows.length === 0)
      return res.status(404).json({
        message: "Payment not found"
      });

    const payment = paymentResult.rows[0];

    if (approve) {

      await pool.query(
        `UPDATE payments
         SET status = 'approved'
         WHERE id = $1`,
        [paymentId]
      );

      await pool.query(
        `UPDATE rentals
         SET status = 'completed'
         WHERE id = $1`,
        [payment.rental_id]
      );

      await pool.query(
        `UPDATE products
         SET stock = stock - 1
         WHERE id = $1`,
        [payment.product_id]
      );

      res.json({
        message: "Payment verified",
        rental_status: "completed"
      });

    } else {

      await pool.query(
        `UPDATE payments
         SET status = 'rejected'
         WHERE id = $1`,
        [paymentId]
      );

      await pool.query(
        `UPDATE rentals
         SET status = 'rejected'
         WHERE id = $1`,
        [payment.rental_id]
      );

      res.json({
        message: "Payment rejected",
        rental_status: "rejected"
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Admin verification failed"
    });
  }
};
