import express from 'express';
import {
  createCourier,
  getMyCourier,
  updateMyCourier,
  getAvailableDeliveries,
  getMyDeliveries,
  claimDelivery,
  startDelivery,
  releaseDelivery,
} from '../../controllers/courier/courierController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// every courier route is for couriers only
router.use(protect, authorize('courier'));

router.post('/', createCourier);
router.get('/me', getMyCourier);
router.put('/me', updateMyCourier);

router.get('/available', getAvailableDeliveries);
router.get('/deliveries', getMyDeliveries);
router.put('/deliveries/:id/claim', claimDelivery);
router.put('/deliveries/:id/start', startDelivery);
router.put('/deliveries/:id/release', releaseDelivery);

export default router;