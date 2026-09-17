import express from 'express';
import {
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} from '../controllers/deliveryZoneController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// public — needed on the registration form before the user has an account
router.get('/', getDeliveryZones);

router.post('/', protect, authorize('admin'), createDeliveryZone);
router.put('/:id', protect, authorize('admin'), updateDeliveryZone);
router.delete('/:id', protect, authorize('admin'), deleteDeliveryZone);

export default router;