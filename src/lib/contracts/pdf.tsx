import 'server-only';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { inlineSegments, parseBlocks, type Block } from './markdown';
import { pdfSafe } from './pdf-text';

/**
 * The executed copy of an Agreement as a PDF: the frozen body exactly as
 * signed, both signatures, and an audit trail page (timestamps, IPs, and
 * the body's SHA-256) so the document can be checked against the record.
 *
 * Rendered from the same parsed markdown as the on-screen contract.
 */

export type PdfSigner = {
  /** The party, as printed on the signature line. */
  party: string;
  name: string | null;
  signedAt: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AgreementPdfInput = {
  title: string;
  agreementVersion: string;
  bodyMd: string;
  bodySha256: string | null;
  contractor: PdfSigner;
  client: PdfSigner;
};

const ET = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'long',
  timeStyle: 'long',
});

function when(iso: string | null): string {
  return iso ? ET.format(new Date(iso)) : 'Not signed';
}

const s = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 64,
    paddingHorizontal: 60,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.45,
    color: '#1a1a1a',
  },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 16, marginTop: 6, marginBottom: 4 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, marginTop: 16, marginBottom: 2 },
  h3: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 10, marginBottom: 2 },
  h4: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginTop: 8, color: '#555555' },
  p: { marginTop: 6 },
  bold: { fontFamily: 'Helvetica-Bold' },
  listItem: { flexDirection: 'row', marginTop: 3 },
  bullet: { width: 12 },
  listText: { flex: 1 },
  table: { marginTop: 8, borderWidth: 0.5, borderColor: '#bbbbbb' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#bbbbbb' },
  th: { flex: 1, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 8.5, backgroundColor: '#f2f2f2' },
  td: { flex: 1, padding: 4, fontSize: 9 },
  hr: { marginTop: 12, marginBottom: 2, borderBottomWidth: 0.5, borderBottomColor: '#bbbbbb' },
  sigGrid: { flexDirection: 'row', marginTop: 14, gap: 16 },
  sigBox: { flex: 1, borderWidth: 0.5, borderColor: '#bbbbbb', padding: 10 },
  sigLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#555555' },
  sigName: { fontFamily: 'Helvetica-Oblique', fontSize: 14, marginTop: 6 },
  small: { fontSize: 8.5, color: '#444444', marginTop: 2 },
  mono: { fontFamily: 'Courier', fontSize: 8.5 },
  // Positioned from the top: react-pdf mis-places a page-number (render
  // prop) element anchored with `bottom` once the content spans several
  // pages — it lands hundreds of thousands of points off the page.
  // Letter is 792pt tall; this sits ~30pt above the bottom edge.
  footerLeft: {
    position: 'absolute',
    top: 752,
    left: 60,
    fontSize: 7.5,
    color: '#888888',
  },
  footerRight: {
    position: 'absolute',
    top: 752,
    left: 60,
    right: 60,
    textAlign: 'right',
    fontSize: 7.5,
    color: '#888888',
  },
});

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(pdfSafe(text)).map((seg, i) =>
        seg.bold ? (
          <Text key={i} style={s.bold}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const style = [s.h1, s.h2, s.h3, s.h4][block.level - 1];
      return (
        <Text style={style} minPresenceAhead={40}>
          <Inline text={block.text} />
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text style={s.p}>
          <Inline text={block.text} />
        </Text>
      );
    case 'list':
      return (
        <View>
          {block.items.map((item, i) => (
            <View key={i} style={s.listItem} wrap={false}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.listText}>
                <Inline text={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <View style={s.table}>
          {block.rows.map((row, r) => (
            <View key={r} style={s.tr} wrap={false}>
              {row.map((cell, c) => (
                <Text key={c} style={r === 0 ? s.th : s.td}>
                  <Inline text={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case 'hr':
      return <View style={s.hr} />;
  }
}

function SignatureBox({ label, signer }: { label: string; signer: PdfSigner }) {
  return (
    <View style={s.sigBox} wrap={false}>
      <Text style={s.sigLabel}>{label}</Text>
      <Text style={s.small}>{pdfSafe(signer.party)}</Text>
      <Text style={s.sigName}>{pdfSafe(signer.name ?? '—')}</Text>
      <Text style={s.small}>Signed electronically · {when(signer.signedAt)}</Text>
    </View>
  );
}

function AuditRow({ label, signer }: { label: string; signer: PdfSigner }) {
  return (
    <View style={{ marginTop: 10 }} wrap={false}>
      <Text style={s.bold}>{label}</Text>
      <Text style={s.small}>Party: {pdfSafe(signer.party)}</Text>
      <Text style={s.small}>Typed signature: {pdfSafe(signer.name ?? '—')}</Text>
      <Text style={s.small}>
        Signed at: {when(signer.signedAt)}
        {signer.signedAt ? ` (${signer.signedAt})` : ''}
      </Text>
      <Text style={s.small}>IP address: {signer.ip ?? 'Not recorded'}</Text>
      <Text style={s.small}>Browser: {pdfSafe(signer.userAgent ?? 'Not recorded')}</Text>
    </View>
  );
}

function AgreementPdf(props: AgreementPdfInput) {
  const blocks = parseBlocks(props.bodyMd);
  const shortHash = props.bodySha256 ? props.bodySha256.slice(0, 16) : 'n/a';
  return (
    <Document
      title={pdfSafe(`${props.title} — Agreement v${props.agreementVersion}`)}
      author="LuxWeb Studio LLC"
      creator="LuxWeb client portal"
    >
      <Page size="LETTER" style={s.page}>
        {/* Repeats on every page — fixed elements go first so react-pdf
            lays them out before the content that wraps across pages. */}
        <Text style={s.footerLeft} fixed>
          {pdfSafe(props.title)} · Agreement v{props.agreementVersion} · {shortHash}
        </Text>
        <Text
          style={s.footerRight}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />

        {blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}

        <View style={s.sigGrid}>
          <SignatureBox label="CONTRACTOR" signer={props.contractor} />
          <SignatureBox label="CLIENT" signer={props.client} />
        </View>

        <View break>
          <Text style={s.h2}>Signature audit trail</Text>
          <Text style={s.p}>
            This record accompanies the Agreement above. Each party signed
            electronically in the LuxWeb client portal by typing their full
            name and affirming they agree to be bound.
          </Text>
          <Text style={[s.p, s.bold]}>Document fingerprint (SHA-256 of the Agreement text)</Text>
          <Text style={[s.small, s.mono]}>{props.bodySha256 ?? 'Not recorded'}</Text>
          <Text style={s.small}>Agreement version {props.agreementVersion}</Text>
          <AuditRow label="Contractor" signer={props.contractor} />
          <AuditRow label="Client" signer={props.client} />
        </View>

      </Page>
    </Document>
  );
}

export async function renderAgreementPdf(input: AgreementPdfInput): Promise<Buffer> {
  return renderToBuffer(<AgreementPdf {...input} />);
}
