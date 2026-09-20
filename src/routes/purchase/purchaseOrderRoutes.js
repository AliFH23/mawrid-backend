import express from 'express';
import { getMyPurchaseOrders, getAllPurchaseOrders } from '../../controllers/purchase/purchaseOrderController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', protect, authorize('supplier'), getMyPurchaseOrders);
router.get('/', protect, authorize('admin'), getAllPurchaseOrders);

export default router;