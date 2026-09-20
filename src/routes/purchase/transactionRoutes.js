import express from 'express';
import { getTransactions } from '../../controllers/purchase/transactionController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, authorize('admin'), getTransactions);

export default router;