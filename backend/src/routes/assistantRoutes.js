import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchWithAssistant } from '../controllers/assistantController.js';

const router = Router();
const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Assistant is busy. Try again in a minute.' },
});

router.post('/search', assistantLimiter, searchWithAssistant);
export default router;
