/**
 * /api/admin  (admin only)
 *
 * The two middlewares on the line below guard EVERY route in this file:
 * you must be logged in (protect) and your role must be 'admin' (restrictTo).
 */
import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import * as ingestion from '../controllers/ingestionController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate, idParamRule, opportunityRules, categoryRules } from '../middleware/validate.js';

const router = Router();

router.use(protect, restrictTo('admin'));

// Analytics
router.get('/analytics', admin.getAnalytics);

// Students
router.get('/students', admin.listStudents);

// Opportunities
router.get('/opportunities', admin.listAllOpportunities);
router.post('/opportunities', opportunityRules, validate, admin.createOpportunity);
router.put('/opportunities/:id', idParamRule, opportunityRules, validate, admin.updateOpportunity);
router.delete('/opportunities/:id', idParamRule, validate, admin.deleteOpportunity);

// Automatic ingestion (see ingestion/ service)
router.get('/ingestion', ingestion.getIngestionOverview);
router.patch('/ingestion/sources/:key', ingestion.updateSource);
router.get('/ingestion/pending', ingestion.listPending);
router.patch('/ingestion/review/:id', idParamRule, validate, ingestion.reviewOpportunity);

// Categories
router.post('/categories', categoryRules, validate, admin.createCategory);
router.put('/categories/:id', idParamRule, categoryRules, validate, admin.updateCategory);
router.delete('/categories/:id', idParamRule, validate, admin.deleteCategory);

export default router;
