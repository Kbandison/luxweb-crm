import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isContractorAssigned } from '@/lib/staff/access';

export const runtime = 'nodejs';
const BUCKET = 'project-files';
const TTL_SECONDS = 60 * 5; // 5-min signed download URL

/**
 * GET /api/staff/files/[id]/download — signed download for a contractor,
 * scoped to files on projects they're assigned to. Mirrors the admin
 * download route but gates on project_assignments instead of a capability.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'contractor') {
      return new NextResponse('Not found', { status: 404 });
    }
    const { id } = await params;

    const { data: row } = await supabaseAdmin()
      .from('files')
      .select('storage_path, file_name, project_id')
      .eq('id', id)
      .single();

    if (!row?.storage_path || !row.project_id) {
      return new NextResponse('Not found', { status: 404 });
    }
    if (!(await isContractorAssigned(session.userId, row.project_id as string))) {
      return new NextResponse('Not found', { status: 404 });
    }

    const inline = req.nextUrl.searchParams.get('inline') === '1';
    const { data: sign, error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(
        row.storage_path as string,
        TTL_SECONDS,
        inline ? undefined : { download: (row.file_name as string) ?? undefined },
      );

    if (error || !sign?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? 'Sign failed' },
        { status: 500 },
      );
    }

    return NextResponse.redirect(sign.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
