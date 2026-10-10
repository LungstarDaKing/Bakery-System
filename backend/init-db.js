const { query } = require('./db');
require('dotenv').config();

// Initialize database schema
const initDB = async () => {
  try {
    // Create users table with role-based access control
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'baker', 'admin')),
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone_number VARCHAR(20),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table (bakery items)
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL,
        base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
        image_url VARCHAR(255),
        is_available BOOLEAN DEFAULT TRUE,
        preparation_time_minutes INTEGER DEFAULT 30,
        customization_options JSONB, // Stores available customizations like size, frosting, etc.
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create orders table
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        order_number VARCHAR(20) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'baking', 'ready_for_collection', 'completed', 'cancelled')),
        total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
        payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'digital_wallet')),
        payment_status VARCHAR(20) NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
        collection_date DATE NOT NULL,
        collection_time TIME NOT NULL,
        special_instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create order_items table (items in each order)
    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
        customization JSONB, // Stores selected customizations for this item
        total_price DECIMAL(10, 2) NOT NULL CHECK (total_price >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await query('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    await query('CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');

    // Create default admin user if not exists
    const adminCheck = await query('SELECT * FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('Admin123!', 12); // Default password - should be changed in production
      
      await query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'admin',
        'admin@bakery.com',
        passwordHash,
        'admin',
        'System',
        'Administrator'
      ]);
      
      console.log('Default admin user created');
    }

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDB;
