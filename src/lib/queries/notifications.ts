import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export async function getUserNotifications(
  userId: string,
  limit = 20,
): Promise<NotificationRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('notifications')
      .select('id, type, payload, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    type Row = {
      id: string;
      type: string;
      payload: Record<string, unknown>;
      read_at: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  try {
    const { count } = await supabaseAdmin()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
