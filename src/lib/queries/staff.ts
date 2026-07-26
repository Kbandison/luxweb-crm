import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Read queries for the contractor staff portal. All fail soft (empty result
 * rather than throwing into the RSC render).
 */

export type StaffTimeLog = {
  id: string;
  hours: number;
  logDate: string;
  note: string | null;
  createdAt: string;
};

/** A contractor's own logged time on one project, newest first, plus total. */
export async function getStaffProjectTimeLogs(
  teamMemberId: string,
  projectId: string,
): Promise<{ logs: StaffTimeLog[]; totalHours: number }> {
  try {
    const { data } = await supabaseAdmin()
      .from('time_logs')
      .select('id, hours, log_date, note, created_at')
      .eq('team_member_id', teamMemberId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as {
      id: string;
      hours: number;
      log_date: string;
      note: string | null;
      created_at: string;
    }[];
    const logs = rows.map((r) => ({
      id: r.id,
      hours: Number(r.hours),
      logDate: r.log_date,
      note: r.note,
      createdAt: r.created_at,
    }));
    const totalHours = logs.reduce((s, l) => s + l.hours, 0);
    return { logs, totalHours };
  } catch {
    return { logs: [], totalHours: 0 };
  }
}
