import express from 'express';
import {
  optionalAuth,
  checkRegistrationNumber,
  getBlockedBusinesses,
  blockBusiness,
  unblockBusiness,
} from '../../controllers/business/businessController.js';
import { protect, authorize } from '../../middleware/authMiddleware.js';

const router = express.Router();

// public (token optional): the register page checks a number before the account exists
router.get('/check', optionalAuth, checkRegistrationNumber);

// admin only: the blocklist
router.get('/blocked', protect, authorize('admin'), getBlockedBusinesses);
router.post('/blocked', protect, authorize('admin'), blockBusiness);
router.delete('/blocked/:number', protect, authorize('admin'), unblockBusiness);

export default router;