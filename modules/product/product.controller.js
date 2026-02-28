import pool from "../../config/db.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";

// =============================
// 📌 CREATE PRODUCT 
// =============================
export const createProduct = async (req, res) => {
  try {
    const { name, description, price_per_day, quantity } = req.body;
    const userId = req.user.id;
    const files = req.files; // ไฟล์ดิบจาก Multer (25MB)

    // 1. Validation พื้นฐาน
    if (!name || !price_per_day || quantity === undefined) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    // 2. ตรวจสอบจำนวนรูป (4-10 รูป)
    if (!files || files.length < 4) {
      return res.status(400).json({ message: "ต้องอัปโหลดรูปภาพสินค้าอย่างน้อย 4 รูป" });
    }
    if (files.length > 10) {
      return res.status(400).json({ message: "อัปโหลดรูปภาพได้ไม่เกิน 10 รูป" });
    }

    // 3. ตรวจสอบร้านค้า
    const shopResult = await pool.query("SELECT id FROM shops WHERE owner_id = $1", [userId]);
    if (shopResult.rowCount === 0) {
      return res.status(400).json({ message: "ไม่พบร้านค้าของคุณ" });
    }
    const shopId = shopResult.rows[0].id;

    // 4. 🔥 ประมวลผลรูปภาพด้วย Sharp (ย่อขนาด + แปลงเป็น WebP)
    const processedImageUrls = await Promise.all(
      files.map(async (file) => {
        const fileName = `prod-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
        const outputPath = path.join("uploads/products", fileName);

        await sharp(file.path)
          .resize(1280, 1280, { fit: "inside", withoutEnlargement: true }) // ย่อขนาดแต่ไม่ขยายภาพที่เล็กอยู่แล้ว
          .webp({ quality: 80 }) // แปลงเป็น WebP คุณภาพ 80%
          .toFile(outputPath);

        // ลบไฟล์ต้นฉบับ (Temporary file) ที่ Multer เก็บไว้เพื่อประหยัดพื้นที่
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return `/uploads/products/${fileName}`;
      })
    );

    // 5. บันทึกลง Database
    const result = await pool.query(
      `INSERT INTO products
       (name, description, price_per_day, quantity, shop_id, images)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name.trim(),
        description?.trim() || null,
        price_per_day,
        quantity,
        shopId,
        JSON.stringify(processedImageUrls)
      ]
    );

    res.status(201).json({
      success: true,
      message: "ลงสินค้าและประมวลผลรูปภาพเรียบร้อยแล้ว",
      product: result.rows[0]
    });

  } catch (err) {
    console.error("Create Product Error:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในการสร้างสินค้า" });
  }
};



// =============================
// 📌 GET ALL PRODUCTS (แก้ไขแล้ว ✅)
// =============================
export const getAllProducts = async (req, res) => {
  try {
    // แก้ไข SQL ให้เพิ่มเงื่อนไข WHERE p.is_active = TRUE
    const result = await pool.query(
      `SELECT 
         p.id,
         p.name,
         p.description,
         p.price_per_day,
         p.quantity,
         p.is_active,
         s.name AS shop_name
       FROM products p
       JOIN shops s ON p.shop_id = s.id
       WHERE p.is_active = TRUE  -- ดึงเฉพาะที่เปิดใช้งาน
       ORDER BY p.id DESC`
    );

    res.json({ products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

// =============================
// 📌 GET PRODUCTS BY SHOP (แก้ไขแล้ว ✅)
// =============================
export const getProductsByShop = async (req, res) => {
  try {
    const shopId = req.params.shopId;
    // เพิ่ม WHERE is_active = TRUE
    const result = await pool.query(
      `SELECT 
         id, name, description, price_per_day, quantity, is_active
       FROM products
       WHERE shop_id = $1 AND is_active = TRUE
       ORDER BY id DESC`,
      [shopId]
    );

    res.json({ products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch shop products" });
  }
};

// =============================
// 📌 GET PRODUCTS BY ANY USER ID (ดึงสินค้าของใครก็ได้ผ่าน ID)
// =============================
export const getProductsByUserId = async (req, res) => {
    try {
        const targetUserId = req.params.id; // ดึง ID จาก URL (:id)

        // JOIN กับตาราง shops เพราะตาราง products ไม่มี owner_id โดยตรง
        const result = await pool.query(
            `SELECT p.*, s.name AS shop_name 
             FROM products p
             JOIN shops s ON p.shop_id = s.id
             WHERE s.owner_id = $1 AND p.is_active = TRUE
             ORDER BY p.id DESC`,
            [targetUserId]
        );

        res.json({
            success: true,
            user_id: targetUserId,
            count: result.rowCount,
            products: result.rows
        });
    } catch (err) {
        console.error("GET USER PRODUCTS ERROR:", err);
        res.status(500).json({ message: "ไม่สามารถดึงข้อมูลสินค้าของปู้ใช้นี้ได้" });
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

// =============================
// 📌 TOGGLE PRODUCT STATUS (แก้ไขสิทธิ์การเข้าถึง ✅)
// =============================
export const toggleProductStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // แก้ไข: สินค้าไม่มี owner_id โดยตรง ต้อง JOIN กับ shops เพื่อเช็กสิทธิ์
        const result = await pool.query(
            `UPDATE products p
             SET is_active = NOT p.is_active 
             FROM shops s
             WHERE p.shop_id = s.id 
             AND p.id = $1 
             AND s.owner_id = $2 
             RETURNING p.is_active`,
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "ไม่พบสินค้า หรือคุณไม่มีสิทธิ์แก้ไข" });
        }

        const currentStatus = result.rows[0].is_active;
        res.json({ 
            message: currentStatus ? "เปิดการให้เช่า" : "ปิดการให้เช่าชั่วคราว",
            is_active: currentStatus 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Toggle failed" });
    }

  
};
