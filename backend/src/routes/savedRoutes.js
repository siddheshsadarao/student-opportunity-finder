/** /api/saved  (student only) */
import { Router } from 'express';
import * as saved from '../controllers/savedController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, idParamRule } from '../middleware/validate.js';

const router = Router();

router.use(protect, restrictTo('student'));

router.get('/', saved.listSaved);
router.post('/:id', idParamRule, validate, saved.saveOpportunity);
router.delete('/:id', idParamRule, validate, saved.unsaveOpportunity);

export default router;
