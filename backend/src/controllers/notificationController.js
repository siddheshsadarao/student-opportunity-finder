/**
 * Notifications.
 *
 * Notifications are created in two ways:
 *  1. Directly, when something happens (welcome message, onboarding done,
 *     an admin publishes an opportunity that matches the student).
 *  2. By the deadline generator below, which the frontend triggers when the
 *     student opens the app. It looks for saved opportunities whose deadline
 *     is within three days and creates one reminder each (never a duplicate).
 */
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** Creates deadline reminders for saved opportunities closing within 3 days. */
async function generateDeadlineNotifications(userId) {
  await query(
    `INSERT INTO notifications (user_id, title, message, type, opportunity_id)
     SELECT
        sv.user_id,
        'Deadline approaching',
        o.title || ' at ' || o.organization || ' closes on ' ||
          to_char(o.deadline, 'DD Mon YYYY') || '.',
        'deadline',
        o.id
       FROM saved_opportunities sv
       JOIN opportunities o ON o.id = sv.opportunity_id
      WHERE sv.user_id = $1
        AND o.is_active = TRUE
        AND o.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
        -- Do not create the same reminder twice.
        AND NOT EXISTS (
              SELECT 1 FROM notifications n
               WHERE n.user_id = sv.user_id
                 AND n.opportunity_id = o.id
                 AND n.type = 'deadline'
            )`,
    [userId]
  );
}

/** GET /api/notifications */
export const listNotifications = asyncHandler(async (req, res) => {
  await generateDeadlineNotifications(req.user.id);

  const { rows } = await query(
    `SELECT n.id, n.title, n.message, n.type, n.is_read, n.created_at,
            n.opportunity_id
       FROM notifications n
      WHERE n.user_id = $1
      ORDER BY n.is_read ASC, n.created_at DESC
      LIMIT 50`,
    [req.user.id]
  );

  const unread = rows.filter((r) => !r.is_read).length;

  res.json({
    success: true,
    data: {
      notifications: rows.map((r) => ({
        id: r.id,
        title: r.title,
        message: r.message,
        type: r.type,
        isRead: r.is_read,
        createdAt: r.created_at,
        opportunityId: r.opportunity_id,
      })),
      unreadCount: unread,
    },
  });
});

/** PATCH /api/notifications/:id/read */
export const markAsRead = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw ApiError.notFound('Notification not found.');
  res.json({ success: true, data: { message: 'Marked as read.' } });
});

/** PATCH /api/notifications/read-all */
export const markAllAsRead = asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
  res.json({ success: true, data: { message: 'All notifications marked as read.' } });
});

/** DELETE /api/notifications/:id */
export const deleteNotification = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw ApiError.notFound('Notification not found.');
  res.json({ success: true, data: { message: 'Notification removed.' } });
});

export default { listNotifications, markAsRead, markAllAsRead, deleteNotification };
