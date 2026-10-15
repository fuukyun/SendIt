import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from './content-disposition.js';

describe('attachmentDisposition', () => {
  it('keeps plain ASCII names', () => {
    expect(attachmentDisposition('report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('encodes non-ASCII names and provides a fallback', () => {
    expect(attachmentDisposition('ảnh (1).png')).toBe(
      `attachment; filename="_nh (1).png"; filename*=UTF-8''%E1%BA%A3nh%20%281%29.png`,
    );
  });

  it('cannot break out of the quoted fallback', () => {
    const header = attachmentDisposition('a"; filename="evil.html');
    expect(header).toContain('filename="a_; filename=_evil.html"');
    expect(header).toContain(`filename*=UTF-8''a%22%3B%20filename%3D%22evil.html`);
  });
});
