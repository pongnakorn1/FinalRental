import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------- DATABASE CONNECTION ----------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
});

// --------- ROOT ROUTE ----------------
app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

// --------- START SERVER ----------------
app.listen(PORT, async () => {
  try {
    await pool.connect();
    console.log('✅ Connected to Database');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('❌ Database connection failed');
    console.error(err);
  }
});


// ======================================================
// 🔐 AUTH SECTION
// ======================================================


// --------- REGISTER ----------------
app.post('/register', async (req, res) => {
  try {
    const { full_name, email, phone, address, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users 
       (full_name, email, phone, address, password, role, kyc_status)
       VALUES ($1, $2, $3, $4, $5, 'user', 'not_submitted')
       RETURNING id, full_name, email, role, kyc_status`,
      [full_name, email, phone, address, hashedPassword]
    );

    res.status(201).json({
      message: "Registration successful",
      user: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});


// --------- LOGIN ----------------
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        kyc_status: user.kyc_status
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        kyc_status: user.kyc_status
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed" });
  }
});


// ======================================================
// 🛡 MIDDLEWARE SECTION
// ======================================================


// --------- AUTHENTICATE TOKEN ----------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  });
};


// --------- ADMIN ONLY ----------------
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
};


// --------- KYC APPROVED ONLY ----------------
const requireVerified = (req, res, next) => {
  if (req.user.kyc_status !== 'approved') {
    return res.status(403).json({
      message: "Please complete KYC verification"
    });
  }
  next();
};
// --------- SUBMIT KYC ----------------
app.post('/kyc/submit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // เช็คก่อนว่าเคย approved แล้วไหม
    if (req.user.kyc_status === 'approved') {
      return res.status(400).json({
        message: "KYC already approved"
      });
    }

    await pool.query(
      `UPDATE users 
       SET kyc_status = 'pending'
       WHERE id = $1`,
      [userId]
    );

    res.json({
      message: "KYC submitted successfully. Waiting for admin approval."
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "KYC submission failed" });
  }
});
// --------- VIEW PENDING KYC (Admin) ----------------
app.get(
  '/admin/kyc/pending',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, full_name, email, kyc_status 
         FROM users
         WHERE kyc_status = 'pending'`
      );

      res.json({
        pending_users: result.rows
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  }
);
// --------- APPROVE / REJECT KYC (Admin) ----------------
app.put(
  '/admin/kyc/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          message: "Status must be 'approved' or 'rejected'"
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET kyc_status = $1
         WHERE id = $2
         RETURNING id, full_name, email, kyc_status`,
        [status, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        message: `KYC ${status} successfully`,
        user: result.rows[0]
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "KYC update failed" });
    }
  }
);


// ======================================================
// 🔎 TEST ROUTES
// ======================================================


// --------- PROFILE (Protected) ----------------
app.get('/profile', authenticateToken, (req, res) => {
  res.json({
    message: "Protected route working",
    user: req.user
  });
});


// --------- ADMIN TEST ----------------
app.get('/admin-test', authenticateToken, requireAdmin, (req, res) => {
  res.json({ message: "Welcome Admin 👑" });
});


// --------- VERIFIED TEST ----------------
app.get('/rent-test', authenticateToken, requireVerified, (req, res) => {
  res.json({ message: "You are KYC approved ✅" });
});

//=======================================
//            SHOP
//=======================================
// --------- CREATE SHOP ----------------
app.post(
  '/shops',
  authenticateToken,
  requireVerified,
  async (req, res) => {
    try {
      const { name, description } = req.body;
      const ownerId = req.user.id;

      // เช็คว่ามีร้านแล้วหรือยัง
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

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Shop creation failed" });
    }
  }
);
// --------- GET ALL SHOPS ----------------
app.get('/shops', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name AS owner_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id`
    );

    res.json({ shops: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch shops" });
  }
});
// --------- GET SHOP BY ID ----------------
app.get('/shops/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name AS owner_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Shop not found" });
    }

    res.json({ shop: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch shop" });
  }
});
// --------- CREATE PRODUCT ----------------
app.post(
  '/products',
  authenticateToken,
  requireVerified,
  async (req, res) => {
    try {
      const { name, description, price_per_day, stock } = req.body;
      const userId = req.user.id;

      // หา shop ของ user
      const shopResult = await pool.query(
        "SELECT * FROM shops WHERE owner_id = $1",
        [userId]
      );

      if (shopResult.rows.length === 0) {
        return res.status(400).json({
          message: "You don't have a shop"
        });
      }

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

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Product creation failed" });
    }
  }
);
// --------- GET ALL PRODUCTS ----------------
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, s.name AS shop_name
       FROM products p
       JOIN shops s ON p.shop_id = s.id`
    );

    res.json({ products: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});
// --------- UPDATE PRODUCT ----------------
app.put(
  '/products/:id',
  authenticateToken,
  requireVerified,
  async (req, res) => {
    try {
      const productId = req.params.id;
      const userId = req.user.id;
      const { name, description, price_per_day, stock } = req.body;

      // เช็คว่า product นี้เป็นของ shop user ไหม
      const checkOwner = await pool.query(
        `SELECT p.* 
         FROM products p
         JOIN shops s ON p.shop_id = s.id
         WHERE p.id = $1 AND s.owner_id = $2`,
        [productId, userId]
      );

      if (checkOwner.rows.length === 0) {
        return res.status(403).json({
          message: "You are not the owner of this product"
        });
      }

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

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Product update failed" });
    }
  }
);
// --------- DELETE PRODUCT ----------------
app.delete(
  '/products/:id',
  authenticateToken,
  requireVerified,
  async (req, res) => {
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

      if (checkOwner.rows.length === 0) {
        return res.status(403).json({
          message: "You are not the owner of this product"
        });
      }

      await pool.query(
        `DELETE FROM products WHERE id = $1`,
        [productId]
      );

      res.json({
        message: "Product deleted successfully"
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Product deletion failed" });
    }
  }
);
// --------- CREATE RENTAL ----------------
app.post(
  '/rentals',
  authenticateToken,
  requireVerified,
  async (req, res) => {
    try {
      const { product_id, start_date, end_date } = req.body;
      const userId = req.user.id;

      // ดึงข้อมูลสินค้า
      const productResult = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [product_id]
      );

      if (productResult.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      const product = productResult.rows[0];

      if (product.stock <= 0) {
        return res.status(400).json({ message: "Product out of stock" });
      }

      // คำนวณจำนวนวัน
      const start = new Date(start_date);
      const end = new Date(end_date);
      const days = (end - start) / (1000 * 60 * 60 * 24);

      if (days <= 0) {
        return res.status(400).json({ message: "Invalid rental period" });
      }

      const totalPrice = days * product.price_per_day;

      // สร้าง rental
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
  }
);
// --------- OWNER APPROVE RENTAL ----------------
app.put(
  '/rentals/:id/owner-approve',
  authenticateToken,
  async (req, res) => {
    try {
      const rentalId = req.params.id;
      const userId = req.user.id;

      // เช็คว่า rental นี้เป็นของร้าน user ไหม
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

      if (checkOwner.rows.length === 0) {
        return res.status(404).json({ message: "Rental not found" });
      }

      const rental = checkOwner.rows[0];

      if (rental.owner_id !== userId) {
        return res.status(403).json({
          message: "You are not the owner of this product"
        });
      }

      if (rental.status !== 'pending_owner') {
        return res.status(400).json({
          message: "Rental cannot be approved at this stage"
        });
      }

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
  }
);
// --------- CREATE PAYMENT (UPLOAD SLIP) ----------------
app.post(
  '/payments',
  authenticateToken,
  async (req, res) => {
    try {
      const { rental_id, slip_image } = req.body;
      const userId = req.user.id;

      // เช็คว่า rental นี้เป็นของ user คนนี้ไหม
      const rentalResult = await pool.query(
        `SELECT * FROM rentals WHERE id = $1 AND user_id = $2`,
        [rental_id, userId]
      );

      if (rentalResult.rows.length === 0) {
        return res.status(404).json({
          message: "Rental not found"
        });
      }

      const rental = rentalResult.rows[0];

      if (rental.status !== 'owner_approved') {
        return res.status(400).json({
          message: "Rental is not ready for payment"
        });
      }

      // สร้าง payment record
      const paymentResult = await pool.query(
        `INSERT INTO payments (rental_id, slip_image)
         VALUES ($1, $2)
         RETURNING *`,
        [rental_id, slip_image]
      );

      // เปลี่ยน rental status
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
  }
);
// --------- ADMIN VERIFY PAYMENT ----------------
app.put(
  '/payments/:id/admin-verify',
  authenticateToken,
  async (req, res) => {
    try {
      const paymentId = req.params.id;
      const { approve } = req.body;

      // เช็ค role เป็น admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          message: "Only admin can verify payments"
        });
      }

      // ดึง payment + rental + product
      const paymentResult = await pool.query(
        `
        SELECT p.*, r.product_id
        FROM payments p
        JOIN rentals r ON p.rental_id = r.id
        WHERE p.id = $1
        `,
        [paymentId]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          message: "Payment not found"
        });
      }

      const payment = paymentResult.rows[0];

      if (approve) {

        // อัปเดต payment
        await pool.query(
          `UPDATE payments
           SET status = 'approved'
           WHERE id = $1`,
          [paymentId]
        );

        // อัปเดต rental
        await pool.query(
          `UPDATE rentals
           SET status = 'completed'
           WHERE id = $1`,
          [payment.rental_id]
        );

        // ลด stock ตอนนี้
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
  }
);
