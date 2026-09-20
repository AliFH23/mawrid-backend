import express from 'express';
import { createContactMessage, getContactMessages, markMessageRead } from '../../controllers/contact/contactController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', createContactMessage);
router.get('/', protect, authorize('admin'), getContactMessages);
router.put('/:id/mark-read', protect, authorize('admin'), markMessageRead);

export default router;