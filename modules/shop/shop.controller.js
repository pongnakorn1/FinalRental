import pool from "../../config/db.js";

export const createShop = async (req, res) => {
  try {
    const { name, description } = req.body;
    const ownerId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Shop name is required"
      });
    }

    const cleanName = name.trim();
    const cleanDescription = description?.trim() || null;

    const existingShop = await pool.query(
      "SELECT id FROM shops WHERE owner_id = $1",
      [ownerId]
    );

    if (existingShop.rowCount > 0) {
      return res.status(400).json({
        message: "You already have a shop"
      });
    }

    const result = await pool.query(
      `INSERT INTO shops (name, description, owner_id)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [cleanName, cleanDescription, ownerId]
    );

    res.status(201).json({
      message: "Shop created successfully",
      shop: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Shop creation failed"
    });
  }
};
export const getAllShops = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT s.*, u.full_name AS owner_name
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      ORDER BY s.id DESC
      `
    );

    res.json({ shops: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch shops"
    });
  }
};
export const getShopById = async (req, res) => {
  try {
    const shopId = req.params.id;

    if (!shopId) {
      return res.status(400).json({
        message: "Shop ID is required"
      });
    }

    const result = await pool.query(
      `
      SELECT s.*, u.full_name AS owner_name
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.id = $1
      `,
      [shopId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Shop not found"
      });
    }

    res.json({ shop: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch shop"
    });
  }
};
