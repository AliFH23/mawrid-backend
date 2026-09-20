import express from 'express';
import { runExpirePoolsCheck, getUsers, toggleUserStatus } from '../../controllers/admin/adminController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/expire-pools', protect, authorize('admin'), runExpirePoolsCheck);
router.get('/users', protect, authorize('admin'), getUsers);
router.put('/users/:id/toggle-status', protect, authorize('admin'), toggleUserStatus);

export default router;