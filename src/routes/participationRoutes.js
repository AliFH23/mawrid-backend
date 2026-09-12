import express from 'express';
import { getMyParticipations, confirmReceipt } from '../controllers/participationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', protect, authorize('buyer'), getMyParticipations);
router.put('/:id/confirm-receipt', protect, authorize('buyer'), confirmReceipt);

export default router;