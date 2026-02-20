import express from 'express';
import 'dotenv/config';

import authRoutes from './modules/auth/auth.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import shopRoutes from './modules/shop/shop.routes.js';
import productRoutes from './modules/product/product.routes.js';
import rentalRoutes from './modules/rental/rental.routes.js';
import paymentRoutes from './modules/payment/payment.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import moneyRoutes from './modules/money/money.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Server is working ✅');
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rentals', rentalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/money', moneyRoutes);

export default app;
