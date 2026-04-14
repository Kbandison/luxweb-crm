import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type MessageRow = {
  id: string;
  threadId: string;
  senderId: string;
  senderEmail: string | null;
  senderName: string | null;
  senderRole: 'admin' | 'client' | null;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type ThreadMeta = {
  id: string;
  projectId: string | null;
  subject: string | null;
  createdAt: string;
};

/**
 * Look up (or create) the thread for a project. Each project gets one
 * canonical thread for v1; multi-thread comes later if needed.
 */
export async function ensureProjectThread(
  projectId: string,
): Promise<ThreadMeta | null> {
  try {
    const { data: existing } = await supabaseAdmin()
      .from('message_threads')
      .select('id, project_id, subject, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return toThread(existing);
    }

    const { data: project } = await supabaseAdmin()
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    const { data: created, error } = await supabaseAdmin()
      .from('message_threads')
      .insert({
        project_id: projectId,
        subject: (project?.name as string | null) ?? 'Project',
      })
      .select('id, project_id, subject, created_at')
      .single();
    if (error || !created) return null;
    return toThread(created);
  } catch {
    return null;
  }
}

export async function getThreadMessages(
  threadId: string,
): Promise<MessageRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('messages')
      .select(
        'id, thread_id, sender_id, body, read_at, created_at, users!messages_sender_id_fkey(email, full_name, role)',
      )
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    type Row = {
      id: string;
      thread_id: string;
      sender_id: string;
      body: string;
      read_at: string | null;
      created_at: string;
      users:
        | {
            email: string | null;
            full_name: string | null;
            role: 'admin' | 'client' | null;
          }
        | {
            email: string | null;
            full_name: string | null;
            role: 'admin' | 'client' | null;
          }[]
        | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
      return {
        id: r.id,
        threadId: r.thread_id,
        senderId: r.sender_id,
        senderEmail: u?.email ?? null,
        senderName: u?.full_name ?? null,
        senderRole: u?.role ?? null,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

/** Mark all messages in this thread from OTHER senders as read. */
export async function markThreadRead(
  threadId: string,
  viewerId: string,
): Promise<void> {
  try {
    await supabaseAdmin()
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('thread_id', threadId)
      .is('read_at', null)
      .neq('sender_id', viewerId);
  } catch {
    /* noop */
  }
}

function toThread(r: {
  id: string;
  project_id: string | null;
  subject: string | null;
  created_at: string;
}): ThreadMeta {
  return {
    id: r.id,
    projectId: r.project_id,
    subject: r.subject,
    createdAt: r.created_at,
  };
}

/** Ownership check — is this thread's project owned by the given user? */
export async function threadBelongsToUser(
  threadId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .from('message_threads')
      .select('project_id, projects!inner(contact_id, contacts!inner(user_id))')
      .eq('id', threadId)
      .single();
    if (!data) return false;
    type Row = {
      projects:
        | { contacts: { user_id: string | null } | { user_id: string | null }[] }
        | { contacts: { user_id: string | null } | { user_id: string | null }[] }[];
    };
    const r = data as unknown as Row;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    const contact = Array.isArray(project?.contacts)
      ? project?.contacts[0]
      : project?.contacts;
    return contact?.user_id === userId;
  } catch {
    return false;
  }
}
