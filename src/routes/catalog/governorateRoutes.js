import express from 'express';
import {
  getGovernorates,
  createGovernorate,
  updateGovernorate,
  deleteGovernorate,
} from '../../controllers/catalog/governorateController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getGovernorates);

router.post('/', protect, authorize('admin'), createGovernorate);
router.put('/:id', protect, authorize('admin'), updateGovernorate);
router.delete('/:id', protect, authorize('admin'), deleteGovernorate);

export default router;