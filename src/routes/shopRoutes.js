import express from 'express';
import {
  createShop,
  getMyShop,
  updateMyShop,
  getShops,
  getShopById,
} from '../controllers/shopController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, authorize('buyer'), createShop);
router.get('/me', protect, authorize('buyer'), getMyShop);
router.put('/me', protect, authorize('buyer'), updateMyShop);
router.get('/', protect, authorize('admin'), getShops);
router.get('/:id', protect, authorize('admin'), getShopById);

export default router;