import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import expirePools from './utils/expirePools.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { sanitizeInput } from './middleware/sanitizeMiddleware.js';
import { authRateLimiter } from './middleware/rateLimitMiddleware.js';
import authRoutes from './routes/auth/authRoutes.js';
import categoryRoutes from './routes/catalog/categoryRoutes.js';
import shopRoutes from './routes/shop/shopRoutes.js';
import supplierRoutes from './routes/supplier/supplierRoutes.js';
import poolRoutes from './routes/pool/poolRoutes.js';
import participationRoutes from './routes/pool/participationRoutes.js';
import purchaseOrderRoutes from './routes/purchase/purchaseOrderRoutes.js';
import adminRoutes from './routes/admin/adminRoutes.js';
import deliveryZoneRoutes from './routes/catalog/deliveryZoneRoutes.js';
import governorateRoutes from './routes/catalog/governorateRoutes.js';
import transactionRoutes from './routes/purchase/transactionRoutes.js';
import contactRoutes from './routes/contact/contactRoutes.js';
connectDB();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : '*';
app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10kb' }));
app.use(sanitizeInput);

app.get('/', (req, res) => {
  res.json({ message: 'Mawrid API is running' });
});

app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
app.use('/api/auth/forgot-password', authRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/pools', poolRoutes);
app.use('/api/participations', participationRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/delivery-zones', deliveryZoneRoutes);
app.use('/api/governorates', governorateRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/contact-messages', contactRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  expirePools();
  const EXPIRE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(expirePools, EXPIRE_CHECK_INTERVAL_MS);
});

process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  server.close(() => process.exit(1));
});