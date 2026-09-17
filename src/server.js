import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import expirePools from './utils/expirePools.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { sanitizeInput } from './middleware/sanitizeMiddleware.js';
import { authRateLimiter } from './middleware/rateLimitMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import poolRoutes from './routes/poolRoutes.js';
import participationRoutes from './routes/participationRoutes.js';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import deliveryZoneRoutes from './routes/deliveryZoneRoutes.js';
import governorateRoutes from './routes/governorateRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
// connect to the database first, before starting the server
connectDB();

const app = express();

// restricts which frontend origins may call this API. Set ALLOWED_ORIGINS in .env as a
// comma-separated list (e.g. "http://localhost:3000,https://mawrid.com") once a frontend
// exists. Falls back to allowing everything, which is fine for local development only.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : '*';
app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10kb' })); // caps request body size against oversized-payload abuse
app.use(sanitizeInput); // strips MongoDB operators from body/query/params before any route sees them

// simple route to confirm the server is running
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
// these two MUST be registered last, after every real route above
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // run once on startup, then repeat automatically every hour
  expirePools();
  const EXPIRE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  setInterval(expirePools, EXPIRE_CHECK_INTERVAL_MS);
});

// last line of defense: catches any error that slipped past every try/catch and every
// middleware above. Without this, an unexpected error anywhere in the app could crash
// the entire Node process, killing the server for every user at once — not just the
// one request that triggered it. We log it and shut down cleanly instead of letting
// the process die in an unknown state.
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  server.close(() => process.exit(1));
});