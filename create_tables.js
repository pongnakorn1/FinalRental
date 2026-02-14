import pool from './pool.js';

const createTables = async () => {
  try {

    // USERS
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  password TEXT NOT NULL,

  role VARCHAR(50) DEFAULT 'user',

  id_card_image TEXT,
  face_image TEXT,

  verification_status VARCHAR(20) DEFAULT 'not_submitted',
  is_verified BOOLEAN DEFAULT false,

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
    //rental
await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_price NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);
//payment
await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  slip_image TEXT,
  status VARCHAR(20) DEFAULT 'waiting_admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`);


    console.log("✅ Core tables created successfully");
    process.exit();

  } catch (err) {
    console.error("❌ Error creating tables");
    console.error(err);
    process.exit(1);
  }
};

createTables();
