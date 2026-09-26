import express from 'express';
import { getAllFines } from '../../controllers/admin/settingsController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, authorize('admin'), getAllFines);

export default router;