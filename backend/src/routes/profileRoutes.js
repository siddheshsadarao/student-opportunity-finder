/** /api/profile  (student only) */
import { Router } from 'express';
import * as profile from '../controllers/profileController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, profileRules } from '../middleware/validate.js';
import { receiveResume } from '../middleware/resumeUpload.js';

const router = Router();

router.use(protect, restrictTo('student'));

router.get('/', profile.getProfile);
router.get('/resume', profile.downloadResume);
router.post('/resume', receiveResume, profile.uploadResume);
router.delete('/resume', profile.deleteResume);
router.put('/', profileRules, validate, profile.updateProfile);
router.post('/onboarding', profileRules, validate, profile.completeOnboarding);

export default router;
