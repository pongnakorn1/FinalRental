import pool from '../../config/db.js';

export const createRental = async (req, res) => {
  try {
    const { product_id, start_date, end_date } = req.body;
    const userId = req.user.id;

    const productResult = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [product_id]
    );

    if (productResult.rows.length === 0)
      return res.status(404).json({ message: "Product not found" });

    const product = productResult.rows[0];

    if (product.stock <= 0)
      return res.status(400).json({ message: "Product out of stock" });

    const start = new Date(start_date);
    const end = new Date(end_date);
    const days = (end - start) / (1000 * 60 * 60 * 24);

    if (days <= 0)
      return res.status(400).json({ message: "Invalid rental period" });

    const totalPrice = days * product.price_per_day;

    const rentalResult = await pool.query(
      `INSERT INTO rentals 
       (user_id, product_id, start_date, end_date, total_price, status)
       VALUES ($1, $2, $3, $4, $5, 'pending_owner')
       RETURNING *`,
      [userId, product_id, start_date, end_date, totalPrice]
    );

    res.status(201).json({
      message: "Rental created successfully",
      rental: rentalResult.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Rental creation failed" });
  }
};

export const ownerApproveRental = async (req, res) => {
  try {
    const rentalId = req.params.id;
    const userId = req.user.id;

    const checkOwner = await pool.query(
      `
      SELECT r.*, p.id AS product_id, s.owner_id
      FROM rentals r
      JOIN products p ON r.product_id = p.id
      JOIN shops s ON p.shop_id = s.id
      WHERE r.id = $1
      `,
      [rentalId]
    );

    if (checkOwner.rows.length === 0)
      return res.status(404).json({ message: "Rental not found" });

    const rental = checkOwner.rows[0];

    if (rental.owner_id !== userId)
      return res.status(403).json({
        message: "You are not the owner of this product"
      });

    if (rental.status !== 'pending_owner')
      return res.status(400).json({
        message: "Rental cannot be approved at this stage"
      });

    await pool.query(
      `UPDATE rentals
       SET status = 'owner_approved'
       WHERE id = $1`,
      [rentalId]
    );

    res.json({
      message: "Rental approved by owner",
      status: "owner_approved"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Owner approval failed" });
  }
};
