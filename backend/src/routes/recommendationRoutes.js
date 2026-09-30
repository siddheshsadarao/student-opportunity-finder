/** /api/recommendations  (student only) */
import { Router } from 'express';
import * as recommendations from '../controllers/recommendationController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, idParamRule } from '../middleware/validate.js';

const router = Router();

router.use(protect, restrictTo('student'));

router.get('/', recommendations.getMyRecommendations);
router.get('/:id/explain', idParamRule, validate, recommendations.explainMatch);

export default router;
