const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(limiter);

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Role middleware
const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

// Basic routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'customer' } = req.body;

    const existing = await query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, passwordHash, role]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.status(201).json({ message: 'User registered', user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ message: 'Login successful', user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query('SELECT id, username, email, role, first_name, last_name FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Product routes
app.get('/api/products', async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE is_available = true ORDER BY name');
    res.json({ products: result.rows });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', authenticateToken, authorizeRole('admin', 'baker'), async (req, res) => {
  try {
    const { name, description, category, basePrice, imageUrl, preparationTimeMinutes, customizationOptions } = req.body;

    const result = await query(
      'INSERT INTO products (name, description, category, base_price, image_url, preparation_time_minutes, customization_options) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, description || null, category, basePrice, imageUrl || null, preparationTimeMinutes || 30, customizationOptions || null]
    );

    res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Order routes
app.post('/api/orders', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { items, collectionDate, collectionTime, paymentMethod, specialInstructions } = req.body;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      const productResult = await client.query('SELECT base_price FROM products WHERE id = $1', [item.productId]);
      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }
      totalAmount += productResult.rows[0].base_price * item.quantity;
    }

    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (user_id, order_number, status, total_amount, payment_method, payment_status, collection_date, collection_time, special_instructions) VALUES ($1, $2, \'pending\', $3, $4, \'pending\', $5, $6, $7) RETURNING *',
      [req.user.id, orderNumber, totalAmount, paymentMethod, collectionDate, collectionTime, specialInstructions || null]
    );

    const order = orderResult.rows[0];

    // Create order items
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, customization, total_price) VALUES ($1, $2, $3, $4, $5, $6)',
        [order.id, item.productId, item.quantity, 0, '{}', 0]
      );

      // Update unit_price and total_price
      const productResult = await client.query('SELECT base_price FROM products WHERE id = $1', [item.productId]);
      const unitPrice = productResult.rows[0].base_price;
      const totalPrice = unitPrice * item.quantity;

      await client.query(
        'UPDATE order_items SET unit_price = $1, total_price = $2 WHERE order_id = $3 AND product_id = $4',
        [unitPrice, totalPrice, order.id, item.productId]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Order created',
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        totalAmount: order.total_amount,
        paymentMethod: order.payment_method,
        collectionDate: order.collection_date,
        collectionTime: order.collection_time
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/orders/my', authenticateToken, async (req, res) => {
  try {
    // Get orders
    const ordersResult = await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    // For each order, get items
    const ordersWithItems = [];
    for (const order of ordersResult.rows) {
      const itemsResult = await query(
        'SELECT oi.*, p.name, p.description FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1',
        [order.id]
      );

      ordersWithItems.push({
        ...order,
        items: itemsResult.rows
      });
    }

    res.json({ orders: ordersWithItems });
  } catch (error) {
    console.error('My orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Order status update
app.patch('/api/orders/:id/status', authenticateToken, authorizeRole('admin', 'baker'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'baking', 'ready_for_collection', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    res.json({ message: 'Status updated', order: result.rows[0] });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Payment simulation
app.post('/api/payments/process', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.body;

    const orderResult = await query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, req.user.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResult.rows[0];
    if (order.payment_status !== 'pending') return res.status(400).json({ error: 'Payment not pending' });

    // Simulate payment
    const successful = Math.random() > 0.1; // 90% success
    const paymentStatus = successful ? 'paid' : 'failed';

    await query('UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [paymentStatus, orderId]);

    if (successful) {
      await query('UPDATE orders SET status = \'baking\', updated_at = CURRENT_TIMESTAMP WHERE id = $1', [orderId]);
    }

    res.json({
      message: successful ? 'Payment processed' : 'Payment failed',
      paymentStatus
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;