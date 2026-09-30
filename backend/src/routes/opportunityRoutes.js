/**
 * /api/opportunities  (public, but personalised when a token is sent)
 *
 * Note the order: the fixed paths (/featured, /filters, /calendar) must be
 * declared BEFORE "/:id", otherwise Express would treat "featured" as an id.
 */
import { Router } from 'express';
import * as opportunities from '../controllers/opportunityController.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate, idParamRule, listQueryRules } from '../middleware/validate.js';

const router = Router();

router.use(optionalAuth);

router.get('/featured', opportunities.getFeatured);
router.get('/filters', opportunities.getFilterOptions);
router.get('/calendar', opportunities.getCalendar);
router.get('/', listQueryRules, validate, opportunities.listOpportunities);
router.get('/:id', idParamRule, validate, opportunities.getOpportunity);

export default router;
