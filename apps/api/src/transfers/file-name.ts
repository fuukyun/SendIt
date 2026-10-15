import { LIMITS } from '@sendit/shared';

const FALLBACK_NAME = 'file';
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
// Bidi overrides let "invoice\u202Efdp.exe" render as "invoiceexe.pdf".
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const RESERVED_CHARS = /[<>:"|?*]/g;

/**
 * Makes a client-supplied name safe to display and to put in Content-Disposition.
 * Storage keys never use it.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CONTROLS, '')
    .replace(RESERVED_CHARS, '_')
    .trim()
    // Windows silently drops trailing dots and spaces.
    .replace(/[. ]+$/, '');
  if (!cleaned) return FALLBACK_NAME;
  return Array.from(cleaned).slice(0, LIMITS.maxFileNameLength).join('');
}
