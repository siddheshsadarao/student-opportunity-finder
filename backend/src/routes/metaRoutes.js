/** Public lookup data: /api/categories, /api/skills, /api/interests, /api/stats */
import { Router } from 'express';
import * as meta from '../controllers/metaController.js';

const router = Router();

router.get('/categories', meta.listCategories);
router.get('/skills', meta.listSkills);
router.get('/interests', meta.listInterests);
router.get('/stats', meta.getPublicStats);

export default router;
