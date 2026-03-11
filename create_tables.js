import pool from './pool.js';

const createTables = async () => {
  try {

    // USERS
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  password TEXT, -- Nullable for social login users
  
  role VARCHAR(50) DEFAULT 'user',
  
  -- Social Login IDs
  google_id VARCHAR(255) UNIQUE,
  facebook_id VARCHAR(255) UNIQUE,
  line_id VARCHAR(255) UNIQUE,
  
  profile_picture TEXT,
  id_card_number VARCHAR(13),
  id_card_image TEXT,
  face_image TEXT,
  
  kyc_status VARCHAR(20) DEFAULT 'not_submitted',
  is_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);


    // SHOPS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
    `);

    // PRODUCTS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        price_per_day NUMERIC(10,2) NOT NULL,
        stock INTEGER DEFAULT 1,
        shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // bookings (หรือเรียกอีกอย่างว่า rentals)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        renter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days INTEGER,
        quantity INTEGER DEFAULT 1,
        rent_fee NUMERIC(10,2),
        shipping_fee NUMERIC(10,2),
        deposit_fee NUMERIC(10,2),
        total_price NUMERIC(10,2),
        status VARCHAR(50) DEFAULT 'pending_owner',
        payment_status VARCHAR(50) DEFAULT 'pending',
        slip_image TEXT,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // payments (ถ้าต้องการตารางแยกเก็บประวัติ)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        amount NUMERIC(10,2),
        slip_image TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // withdrawals (สำหรับถอนเงิน)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bank_account_id INTEGER,
        amount NUMERIC(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        transfer_slip_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);



    console.log("✅ Core tables created successfully");
    process.exit();

  } catch (err) {
    console.error("❌ Error creating tables");
    console.error(err);
    process.exit(1);
  }
};

createTables();
