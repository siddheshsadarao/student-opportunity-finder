/** /api/notifications */
import { Router } from 'express';
import * as notifications from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { validate, idParamRule } from '../middleware/validate.js';

const router = Router();

router.use(protect);

router.get('/', notifications.listNotifications);
router.patch('/read-all', notifications.markAllAsRead);
router.patch('/:id/read', idParamRule, validate, notifications.markAsRead);
router.delete('/:id', idParamRule, validate, notifications.deleteNotification);

export default router;
