# Bakery Management System

A production-grade, highly secure, and reliable Bakery Management System with a Node.js/Express backend, React.js/Tailwind CSS frontend, and Capacitor wrapper for Android APK generation.

## Project Structure

- `backend/` - Node.js/Express API server
- `frontend/` - React.js web application (mobile-ready)

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to set your database credentials and JWT secret.

4. Ensure PostgreSQL is running and the database `bakery_db` exists (the init script will create tables).

5. Initialize the database (optional, as it will connect on startup):
   ```bash
   node init-db.js
   ```

6. Start the server:
   ```bash
   npm start
   ```
   The server will run on `http://localhost:5000`.

## Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

## Building for Production

To build the frontend for production:

```bash
npm run build
```
This will generate optimized static assets in the `dist` directory.

## Mobile Build (Android APK)

The frontend is configured with Capacitor to build an Android APK.

1. Ensure you have Android Studio and the Android SDK installed.

2. Build the web assets:
   ```bash
   npm run build
   ```

3. Sync with Capacitor:
   ```bash
   npx cap sync
   ```

4. Open the Android project in Android Studio:
   ```bash
   npx cap open android
   ```

5. In Android Studio, build the APK via:
   - Build > Build Bundle(s) / APK(s) > Build APK(s)

Alternatively, you can build the APK from the command line:
   ```bash
   npx cap copy android
   npx cap build android
   ```

## Security Features Implemented

- Role-Based Access Control (RBAC) for Customers, Bakers, and Administrators
- JWT authentication with HttpOnly, Secure, SameSite cookies
- Password hashing using bcrypt
- Input validation and sanitization using Zod
- Rate limiting to prevent DDoS and brute force attacks
- Helmet.js for secure HTTP headers
- CORS configuration
- Parameterized queries to prevent SQL Injection
- No storage of raw payment details (payment simulation uses gateway tokenization concept)

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user
- POST `/api/auth/logout` - Logout user
- GET `/api/auth/profile` - Get authenticated user profile

### Products
- GET `/api/products` - Get all available products
- GET `/api/products/:id` - Get a product by ID
- POST `/api/products` - Create a new product (admin/baker only)

### Orders
- POST `/api/orders` - Create a new order
- GET `/api/orders/my` - Get current user's orders
- PATCH `/api/orders/:id/status` - Update order status (admin/baker only)

### Payments
- POST `/api/payments/process` - Simulate payment processing

## Database Schema

- `users`: Stores user information with role-based access control
- `products`: Stores bakery items with customization options
- `orders`: Stores customer orders with status workflow
- `order_items`: Stores individual items within each order

## License

This project is proprietary and confidential.