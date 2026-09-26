import express from 'express';
import { checkEmailAvailability, registerUser, loginUser, getMe, forgotPassword } from '../../controllers/auth/authController.js';
import { protect } from '../../middleware/authMiddleware.js';

const router = express.Router();


router.get('/check-email', checkEmailAvailability);
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);

export default router;