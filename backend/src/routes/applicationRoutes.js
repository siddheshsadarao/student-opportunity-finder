/** /api/applications  (student only) */
import { Router } from 'express';
import * as applications from '../controllers/applicationController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, idParamRule, applicationStatusRules } from '../middleware/validate.js';

const router = Router();

router.use(protect, restrictTo('student'));

router.get('/', applications.listApplications);
router.post('/:opportunityId', applications.trackApplication);
router.patch('/:id', idParamRule, applicationStatusRules, validate, applications.updateApplication);
router.delete('/:id', idParamRule, validate, applications.deleteApplication);

export default router;
