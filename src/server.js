import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
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
import settingsRoutes from './routes/admin/settingsRoutes.js';
import finesRoutes from './routes/admin/finesRoutes.js';
import ratingRoutes from './routes/pool/ratingRoutes.js';
import marketRequestRoutes from './routes/pool/marketRequestRoutes.js';
import userLookupRoutes from './routes/admin/userLookupRoutes.js';
import courierRoutes from './routes/courier/courierRoutes.js';
import businessRoutes from './routes/business/businessRoutes.js';

// the app can't issue or verify tokens without this — stop at startup with a clear message
// instead of failing on the first login in production
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set — add it to the environment variables');
  process.exit(1);
}

connectDB();

const app = express();

// Render/Railway/Vercel put a proxy in front of the app. Without this, req.ip is the proxy's
// address for EVERYONE, so the rate limiter would count all users as one person.
app.set('trust proxy', 1);

// ALLOWED_ORIGINS = the frontend address(es), comma separated, e.g.
//   https://mawrid.vercel.app,http://localhost:5173
// spaces and a trailing "/" are tolerated — a browser's Origin header never has one
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
  : '*';

if (allowedOrigins === '*' && process.env.NODE_ENV === 'production') {
  console.warn('ALLOWED_ORIGINS is not set — the API accepts requests from any website');
}
app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10kb' }));
app.use(sanitizeInput);

app.get('/', (req, res) => {
  res.json({ message: 'Mawrid API is running' });
});

// for the hosting platform's health check and the uptime monitor: 200 only when the
// database connection is actually up (readyState 1), otherwise 503
app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp });
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
// must come before /api/admin so the more specific path is matched first
app.use('/api/admin/lookup', userLookupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/delivery-zones', deliveryZoneRoutes);
app.use('/api/governorates', governorateRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/contact-messages', contactRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fines', finesRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/market-requests', marketRequestRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/business', businessRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // run once on startup, then repeat automatically every hour — wrapped in .catch so
  // one bad/legacy document (e.g. an old pool missing a field added later) doesn't
  // crash the entire server via an unhandled promise rejection
  expirePools().catch((err) => console.error('expirePools failed:', err.message));
  const EXPIRE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  setInterval(() => {
    expirePools().catch((err) => console.error('expirePools failed:', err.message));
  }, EXPIRE_CHECK_INTERVAL_MS);
});

process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  server.close(() => process.exit(1));
});