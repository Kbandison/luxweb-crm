import { getSession } from '@/lib/supabase/session';
import {
  getUnreadNotificationCount,
  getUserNotifications,
} from '@/lib/queries/notifications';

export const runtime = 'nodejs';

/**
 * GET /api/notifications/recent
 * Returns the latest 20 notifications for the current user + unread count.
 * Polled by the bell dropdown on focus.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ notifications: [], unread: 0 });
  }
  const [notifications, unread] = await Promise.all([
    getUserNotifications(session.userId, 20),
    getUnreadNotificationCount(session.userId),
  ]);
  return Response.json({ notifications, unread });
}
