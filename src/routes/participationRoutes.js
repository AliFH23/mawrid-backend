import express from 'express';
import { getMyParticipations, payRemainingBalance, confirmReceipt } from '../controllers/participationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', protect, authorize('buyer'), getMyParticipations);
router.put('/:id/pay-balance', protect, authorize('buyer'), payRemainingBalance);
router.put('/:id/confirm-receipt', protect, authorize('buyer'), confirmReceipt);

export default router;