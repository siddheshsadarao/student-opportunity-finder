/** /api/auth */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import {
  validate,
  registerRules,
  loginRules,
  changePasswordRules,
  resetPasswordRules,
} from '../middleware/validate.js';

const router = Router();

/**
 * Brute-force protection: at most 20 login/registration attempts from one IP
 * every 15 minutes. Without this, someone could try thousands of passwords.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

router.post('/register', authLimiter, registerRules, validate, auth.register);
router.post('/login', authLimiter, loginRules, validate, auth.login);
router.post('/admin/login', authLimiter, loginRules, validate, auth.adminLogin);
router.post('/forgot-password', authLimiter, auth.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordRules, validate, auth.resetPassword);

router.get('/me', protect, auth.getMe);
router.patch('/password', protect, changePasswordRules, validate, auth.changePassword);

export default router;
