import express from 'express';
import {
  createPool,
  getPools,
  getPoolById,
  updatePool,
  extendPool,
  joinPool,
  leavePool,
  confirmPool,
  rejectPool,
  cancelPool,
  getPoolParticipants,
} from '../../controllers/pool/poolController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, authorize('admin', 'supplier'), createPool);
router.get('/', protect, getPools);
router.get('/:id', protect, getPoolById);
router.put('/:id', protect, authorize('admin', 'supplier'), updatePool);
router.put('/:id/extend', protect, authorize('admin', 'supplier'), extendPool);
router.get('/:id/participants', protect, authorize('admin', 'supplier'), getPoolParticipants);
router.post('/:id/join', protect, authorize('buyer'), joinPool);
router.delete('/:id/leave', protect, authorize('buyer'), leavePool);
router.post('/:id/confirm', protect, authorize('admin', 'supplier'), confirmPool);
router.post('/:id/reject', protect, authorize('admin', 'supplier'), rejectPool);
router.post('/:id/cancel', protect, authorize('admin', 'supplier'), cancelPool);

export default router;