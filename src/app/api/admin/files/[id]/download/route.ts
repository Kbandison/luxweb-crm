import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const BUCKET = 'project-files';
const TTL_SECONDS = 60 * 5; // 5-min signed download URL

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const { data: row } = await supabaseAdmin()
      .from('files')
      .select('storage_path, file_name')
      .eq('id', id)
      .single();

    if (!row?.storage_path) {
      return new NextResponse('Not found', { status: 404 });
    }

    // ?inline=1 → render inline in the browser (used by the preview modal).
    // Default → forces a download with the original filename.
    const inline = req.nextUrl.searchParams.get('inline') === '1';
    const { data: sign, error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(
        row.storage_path as string,
        TTL_SECONDS,
        inline
          ? undefined
          : { download: (row.file_name as string) ?? undefined },
      );

    if (error || !sign?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? 'Sign failed' },
        { status: 500 },
      );
    }

    // Redirect the browser to the short-lived signed URL.
    return NextResponse.redirect(sign.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
