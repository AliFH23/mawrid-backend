import express from 'express';
import { lookupUser } from '../../controllers/admin/userLookupController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:publicId', protect, authorize('admin'), lookupUser);

export default router;