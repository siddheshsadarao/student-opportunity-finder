/**
 * Mounts every route group under /api.
 *
 *   /api/auth            register, login, me, password
 *   /api/profile         student profile + onboarding
 *   /api/opportunities   public browsing
 *   /api/saved           bookmarks                (student)
 *   /api/applications    application tracker      (student)
 *   /api/recommendations personalised feed        (student)
 *   /api/notifications   alerts                   (student)
 *   /api/dashboard       student dashboard summary
 *   /api/admin           admin CRUD + analytics   (admin)
 *   /api/categories, /api/skills, /api/interests, /api/stats  public lookups
 */
import { Router } from 'express';

import authRoutes from './authRoutes.js';
import profileRoutes from './profileRoutes.js';
import opportunityRoutes from './opportunityRoutes.js';
import savedRoutes from './savedRoutes.js';
import applicationRoutes from './applicationRoutes.js';
import recommendationRoutes from './recommendationRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import adminRoutes from './adminRoutes.js';
import metaRoutes from './metaRoutes.js';

import { protect } from '../middleware/auth.js';
import { getDashboard } from '../controllers/recommendationController.js';

const router = Router();

router.get('/health', (req, res) =>
  res.json({ success: true, data: { status: 'ok', service: 'sof-backend' } })
);

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/opportunities', opportunityRoutes);
router.use('/saved', savedRoutes);
router.use('/applications', applicationRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/', metaRoutes); // /categories, /skills, /interests, /stats

router.get('/dashboard', protect, getDashboard);

export default router;
