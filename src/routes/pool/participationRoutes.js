import express from 'express';
import {
  getMyParticipations,
  getMyReliability,
  getMySavings,
  getBalancePreview,
  payRemainingBalance,
  confirmReceipt,
  markShipped,
  markPoolShipped,
} from '../../controllers/pool/participationController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// buyer
router.get('/me', protect, authorize('buyer'), getMyParticipations);
router.get('/me/reliability', protect, authorize('buyer'), getMyReliability);
router.get('/me/savings', protect, authorize('buyer'), getMySavings);
router.put('/:id/pay-balance', protect, authorize('buyer'), payRemainingBalance);
router.get('/:id/balance-preview', protect, authorize('buyer'), getBalancePreview);
router.put('/:id/confirm-receipt', protect, authorize('buyer'), confirmReceipt);

// supplier — delivery tracking
router.put('/pool/:poolId/mark-shipped', protect, authorize('supplier'), markPoolShipped);
router.put('/:id/mark-shipped', protect, authorize('supplier'), markShipped);

export default router;