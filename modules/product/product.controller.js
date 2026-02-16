import pool from '../../config/db.js';

export const createProduct = async (req, res) => {
  try {
    const { name, description, price_per_day, stock } = req.body;
    const userId = req.user.id;

    const shopResult = await pool.query(
      "SELECT * FROM shops WHERE owner_id = $1",
      [userId]
    );

    if (shopResult.rows.length === 0)
      return res.status(400).json({
        message: "You don't have a shop"
      });

    const shopId = shopResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO products (name, description, price_per_day, stock, shop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, price_per_day, stock, shopId]
    );

    res.status(201).json({
      message: "Product created successfully",
      product: result.rows[0]
    });

  } catch {
    res.status(500).json({ message: "Product creation failed" });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.name AS shop_name
       FROM products p
       JOIN shops s ON p.shop_id = s.id`
    );

    res.json({ products: result.rows });

  } catch {
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.id;
    const { name, description, price_per_day, stock } = req.body;

    const checkOwner = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.id = $1 AND s.owner_id = $2`,
      [productId, userId]
    );

    if (checkOwner.rows.length === 0)
      return res.status(403).json({
        message: "You are not the owner of this product"
      });

    const result = await pool.query(
      `UPDATE products
       SET name=$1, description=$2, price_per_day=$3, stock=$4
       WHERE id=$5
       RETURNING *`,
      [name, description, price_per_day, stock, productId]
    );

    res.json({
      message: "Product updated successfully",
      product: result.rows[0]
    });

  } catch {
    res.status(500).json({ message: "Product update failed" });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.id;

    const checkOwner = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.id = $1 AND s.owner_id = $2`,
      [productId, userId]
    );

    if (checkOwner.rows.length === 0)
      return res.status(403).json({
        message: "You are not the owner of this product"
      });

    await pool.query(
      `DELETE FROM products WHERE id = $1`,
      [productId]
    );

    res.json({
      message: "Product deleted successfully"
    });

  } catch {
    res.status(500).json({ message: "Product deletion failed" });
  }
};
