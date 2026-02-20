import pool from "../../config/db.js";


// =============================
// 📌 CREATE PRODUCT
// =============================
export const createProduct = async (req, res) => {
  try {
    const { name, description, price_per_day, quantity } = req.body;
    const userId = req.user.id;

    if (!name || !price_per_day || quantity === undefined) {
      return res.status(400).json({
        message: "Name, price_per_day and quantity required"
      });
    }

    if (price_per_day <= 0 || quantity < 0) {
      return res.status(400).json({
        message: "Invalid price or quantity"
      });
    }

    // 🔎 หา shop ของ owner
    const shopResult = await pool.query(
      "SELECT id FROM shops WHERE owner_id = $1",
      [userId]
    );

    if (shopResult.rowCount === 0) {
      return res.status(400).json({
        message: "You don't have a shop"
      });
    }

    const shopId = shopResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO products
       (name, description, price_per_day, quantity, shop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), description?.trim() || null, price_per_day, quantity, shopId]
    );

    res.status(201).json({
      message: "Product created successfully",
      product: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Product creation failed"
    });
  }
};



// =============================
// 📌 GET ALL PRODUCTS
// =============================
export const getAllProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.price_per_day,
         p.quantity,
         s.name AS shop_name
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       ORDER BY p.id DESC`
    );

    res.json({ products: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch products"
    });
  }
};



// =============================
// 📌 GET PRODUCTS BY SHOP 🔥 (เพิ่มใหม่)
// =============================
export const getProductsByShop = async (req, res) => {
  try {
    const shopId = req.params.shopId;

    const result = await pool.query(
      `SELECT 
         id,
         name,
         description,
         price_per_day,
         quantity
       FROM products
       WHERE shop_id = $1
       ORDER BY id DESC`,
      [shopId]
    );

    res.json({
      products: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch shop products"
    });
  }
};



// =============================
// 📌 UPDATE PRODUCT
// =============================
export const updateProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const productId = req.params.id;
    const userId = req.user.id;
    const { name, description, price_per_day, quantity } = req.body;

    // 1. ตรวจสอบความเป็นเจ้าของสินค้าผ่าน Shop
    const checkOwner = await client.query(
      `SELECT p.id, p.shop_id 
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.id = $1 AND s.owner_id = $2`,
      [productId, userId]
    );

    if (checkOwner.rowCount === 0) {
      return res.status(403).json({
        message: "คุณไม่มีสิทธิ์แก้ไขสินค้านี้ เนื่องจากคุณไม่ใช่เจ้าของร้าน"
      });
    }

    // 2. Validation ตรวจสอบความถูกต้องของข้อมูล
    if (price_per_day !== undefined && (isNaN(price_per_day) || price_per_day <= 0)) {
      return res.status(400).json({ message: "ราคาต่อวันต้องเป็นตัวเลขที่มากกว่า 0" });
    }

    if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
      return res.status(400).json({ message: "จำนวนสต็อกต้องเป็นตัวเลขที่ไม่ติดลบ" });
    }

    // 3. เริ่มการอัปเดตข้อมูล (ใช้เพียง Query เดียวที่รองรับค่า Null)
    // ถ้าตัวแปรไหนไม่ได้ส่งมา ($ เป็น NULL) จะใช้ค่าเดิมจาก Database (เช่น name = name)
    const result = await client.query(
      `UPDATE products
       SET
         name = CASE WHEN $1::text IS NULL THEN name ELSE $1 END,
         description = CASE WHEN $2::text IS NULL THEN description ELSE $2 END,
         price_per_day = CASE WHEN $3::numeric IS NULL THEN price_per_day ELSE $3 END,
         quantity = CASE WHEN $4::integer IS NULL THEN quantity ELSE $4 END,
         updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        name !== undefined ? name : null, 
        description !== undefined ? description : null, 
        price_per_day !== undefined ? price_per_day : null, 
        quantity !== undefined ? quantity : null, 
        productId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลสินค้า" });
    }

    res.json({
      message: "อัปเดตข้อมูลสินค้าสำเร็จ",
      product: result.rows[0]
    });

  } catch (err) {
    console.error("Update Product Error:", err);
    res.status(500).json({
      message: "การอัปเดตสินค้าล้มเหลว",
      error: err.message
    });
  } finally {
    client.release();
  }
};


// =============================
// 📌 DELETE PRODUCT
// =============================
export const deleteProduct = async (req, res) => {
  const client = await pool.connect();

  try {
    const productId = req.params.id;
    const userId = req.user.id;

    await client.query("BEGIN");

    // 🔎 ตรวจ owner
    const checkOwner = await client.query(
      `SELECT p.id
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.id = $1 AND s.owner_id = $2
       FOR UPDATE`,
      [productId, userId]
    );

    if (checkOwner.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "You are not the owner of this product"
      });
    }

    // 🔒 เช็คว่ามี rental อยู่ไหม
    const rentalCheck = await client.query(
      `SELECT id FROM rentals WHERE product_id = $1`,
      [productId]
    );

    if (rentalCheck.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Cannot delete product with rentals"
      });
    }

    await client.query(
      `DELETE FROM products WHERE id = $1`,
      [productId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Product deleted successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);

    res.status(500).json({
      message: "Product deletion failed"
    });

  } finally {
    client.release();
  }
};
