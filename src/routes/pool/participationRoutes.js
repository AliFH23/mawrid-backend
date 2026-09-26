import express from 'express';
import { getMyParticipations, getBalancePreview, payRemainingBalance, confirmReceipt } from '../../controllers/pool/participationController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', protect, authorize('buyer'), getMyParticipations);
router.put('/:id/pay-balance', protect, authorize('buyer'), payRemainingBalance);
router.get('/:id/balance-preview', protect, authorize('buyer'), getBalancePreview);
router.put('/:id/confirm-receipt', protect, authorize('buyer'), confirmReceipt);

export default router;