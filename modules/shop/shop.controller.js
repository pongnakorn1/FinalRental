import pool from '../../config/db.js';

export const createShop = async (req, res) => {
  try {
    const { name, description } = req.body;
    const ownerId = req.user.id;

    const existingShop = await pool.query(
      "SELECT * FROM shops WHERE owner_id = $1",
      [ownerId]
    );

    if (existingShop.rows.length > 0) {
      return res.status(400).json({
        message: "You already have a shop"
      });
    }

    const result = await pool.query(
      `INSERT INTO shops (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, ownerId]
    );

    res.status(201).json({
      message: "Shop created successfully",
      shop: result.rows[0]
    });

  } catch {
    res.status(500).json({ message: "Shop creation failed" });
  }
};

export const getAllShops = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name AS owner_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id`
    );

    res.json({ shops: result.rows });

  } catch {
    res.status(500).json({ message: "Failed to fetch shops" });
  }
};

export const getShopById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name AS owner_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Shop not found" });

    res.json({ shop: result.rows[0] });

  } catch {
    res.status(500).json({ message: "Failed to fetch shop" });
  }
};
