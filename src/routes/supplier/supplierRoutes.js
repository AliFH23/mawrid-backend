import express from 'express';
import {
  createSupplier,
  getMySupplierProfile,
  updateMySupplierProfile,
  getSuppliers,
  getSupplierById,
} from '../../controllers/supplier/supplierController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, authorize('supplier'), createSupplier);
router.get('/me', protect, authorize('supplier'), getMySupplierProfile);
router.put('/me', protect, authorize('supplier'), updateMySupplierProfile);
router.get('/', protect, authorize('admin'), getSuppliers);
router.get('/:id', protect, authorize('admin'), getSupplierById);

export default router;