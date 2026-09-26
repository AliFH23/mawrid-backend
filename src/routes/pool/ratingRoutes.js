import express from 'express';
import { createRating, getSupplierRatings } from '../../controllers/pool/ratingController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, authorize('buyer'), createRating);
router.get('/supplier/:id', protect, getSupplierRatings);

export default router;