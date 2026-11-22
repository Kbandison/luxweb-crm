import { describe, expect, it } from 'vitest';
import { attributionDate, composeHtml, htmlToText, quoteHtml, replySubject } from './email-body';

const first =
  '<div dir="ltr"><p>Good afternoon Sam,</p><p>I came across <a href="https://shop.test/">Shop&#39;s website</a> while looking around.</p>' +
  '<p>Thanks,</p><div style="margin-top:20px"><b>Kevin Bandison</b><br>LuxWeb Studio<br>' +
  '<a href="tel:+17185550100">(718) 555-0100</a> · <a href="https://studio.test/">studio<span>.</span>test</a></div></div>';

describe('replySubject', () => {
  it('adds one Re:', () => {
    expect(replySubject('The quote form')).toBe('Re: The quote form');
    expect(replySubject('Re: The quote form')).toBe('Re: The quote form');
    expect(replySubject('RE: re: The quote form')).toBe('Re: The quote form');
  });
});

describe('quoteHtml', () => {
  it("writes Gmail's attribution line in the studio's time zone and quotes the HTML as is", () => {
    const q = quoteHtml(
      { html: first, sentAt: new Date('2026-11-10T21:14:00Z'), fromName: 'LuxWeb Studio', fromEmail: 'owner@studio.test' },
      'America/New_York',
    );
    expect(q).toContain('class="gmail_quote"');
    expect(q).toContain(
      'On Tue, Nov 10, 2026 at 4:14 PM LuxWeb Studio &lt;<a href="mailto:owner@studio.test">owner@studio.test</a>&gt; wrote:',
    );
    expect(q).toContain(`<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${first}</blockquote>`);
  });

  it('handles midnight and noon', () => {
    expect(attributionDate(new Date('2026-11-11T05:03:00Z'), 'America/New_York')).toBe('Wed, Nov 11, 2026 at 12:03 AM');
    expect(attributionDate(new Date('2026-11-11T17:30:00Z'), 'America/New_York')).toBe('Wed, Nov 11, 2026 at 12:30 PM');
  });
});

describe('htmlToText', () => {
  it('turns paragraphs, links, bold, and breaks into Gmail-style text', () => {
    expect(htmlToText(first)).toBe(
      [
        'Good afternoon Sam,',
        '',
        "I came across Shop's website <https://shop.test/> while looking around.",
        '',
        'Thanks,',
        '',
        '*Kevin Bandison*',
        'LuxWeb Studio',
        '(718) 555-0100 · studio.test <https://studio.test/>',
      ].join('\n'),
    );
  });

  it('quotes earlier emails under "> ", nesting each level', () => {
    const fu1Body = '<p>Good morning Sam,</p><p>One more thing.</p><p>Thanks,</p>';
    const fu1 = composeHtml(
      fu1Body,
      quoteHtml(
        { html: first, sentAt: new Date('2026-11-10T21:14:00Z'), fromName: 'LuxWeb Studio', fromEmail: 'owner@studio.test' },
        'America/New_York',
      ),
    );
    const fu2 = composeHtml(
      '<p>Last one.</p>',
      quoteHtml(
        { html: fu1, sentAt: new Date('2026-11-13T14:00:00Z'), fromName: 'LuxWeb Studio', fromEmail: 'owner@studio.test' },
        'America/New_York',
      ),
    );
    const text = htmlToText(fu2);
    expect(text.startsWith('Last one.\n\nOn Fri, Nov 13, 2026 at 9:00 AM LuxWeb Studio <owner@studio.test> wrote:\n')).toBe(true);
    expect(text).toContain('> One more thing.');
    expect(text).toContain('> On Tue, Nov 10, 2026 at 4:14 PM LuxWeb Studio <owner@studio.test> wrote:');
    expect(text).toContain("> > I came across Shop's website <https://shop.test/> while looking around.");
    expect(text).not.toMatch(/<\/?(p|div|a|b|br|span|blockquote)\b/i);
  });

  it('decodes entities after stripping tags, so text can never become markup', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;b&gt; &quot;hi&quot;</p>')).toBe('Tom & Jerry <b> "hi"');
  });
});
