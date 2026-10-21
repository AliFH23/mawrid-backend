import express from 'express';
import {
  getDeliveryZones,
  resolveDeliveryZone,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} from '../../controllers/catalog/deliveryZoneController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getDeliveryZones);

// public like GET '/', because the register page needs it before login
router.get('/resolve', resolveDeliveryZone);

router.post('/', protect, authorize('admin'), createDeliveryZone);
router.put('/:id', protect, authorize('admin'), updateDeliveryZone);
router.delete('/:id', protect, authorize('admin'), deleteDeliveryZone);

export default router;