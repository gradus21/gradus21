import { describe, it, expect } from 'vitest';
import { escapeHtml } from './ExportAndPrintHelpers';

describe('ExportAndPrintHelpers - escapeHtml', () => {
  it('escapes dangerous HTML characters to prevent XSS in print views', () => {
    const dirty = '<script>alert("xss")</script> & \'test\'';
    const clean = escapeHtml(dirty);
    expect(clean).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
    expect(clean).not.toContain('<');
    expect(clean).not.toContain('>');
    expect(clean).not.toContain('"');
  });

  it('handles clean strings without alterations', () => {
    const text = 'Max Mustermann (Klasse 6a)';
    expect(escapeHtml(text)).toBe(text);
  });

  it('handles empty and whitespace strings gracefully', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('   ')).toBe('   ');
  });
});
