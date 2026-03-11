/**
 * RFC 2047 Decoder — Browser-compatible
 * ═══════════════════════════════════════════════════════════
 * Decodes MIME encoded-word headers like:
 *   =?UTF-8?B?QWdvZGE=?=          → "Agoda"
 *   =?UTF-8?Q?H=C3=A0_N=E1=BB=99i?= → "Hà Nội"
 *   =?iso-8859-1?Q?caf=E9?=       → "café"
 *
 * Also handles multi-word folded headers per RFC 2047 §6.2.
 */

const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g;

/**
 * Decode a single RFC 2047 encoded word.
 */
function decodeWord(charset: string, encoding: string, payload: string): string {
  const enc = encoding.toUpperCase();

  let bytes: Uint8Array;

  if (enc === 'B') {
    // Base64
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    // Quoted-Printable: underscores → spaces, =XX → byte
    const raw = payload.replace(/_/g, ' ');
    const parts: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '=' && i + 2 < raw.length) {
        parts.push(parseInt(raw.substring(i + 1, i + 3), 16));
        i += 2;
      } else {
        parts.push(raw.charCodeAt(i));
      }
    }
    bytes = new Uint8Array(parts);
  }

  // Decode bytes to string using the given charset
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(bytes);
  } catch {
    // Fallback: try utf-8
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return payload; // give up, return raw payload
    }
  }
}

/**
 * Normalize charset aliases that TextDecoder might not recognize.
 */
function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, string> = {
    'utf8': 'utf-8',
    'ascii': 'utf-8',
    'usascii': 'utf-8',
    'iso88591': 'iso-8859-1',
    'latin1': 'iso-8859-1',
    'iso88592': 'iso-8859-2',
    'iso88593': 'iso-8859-3',
    'iso885915': 'iso-8859-15',
    'windows1252': 'windows-1252',
    'cp1252': 'windows-1252',
    'windows1251': 'windows-1251',
    'cp1251': 'windows-1251',
    'windows1250': 'windows-1250',
    'cp1250': 'windows-1250',
    'gb2312': 'gb18030',
    'gbk': 'gb18030',
    'big5': 'big5',
    'eucjp': 'euc-jp',
    'shiftjis': 'shift_jis',
    'sjis': 'shift_jis',
    'euckr': 'euc-kr',
    'ksc56011987': 'euc-kr',
    'iso2022jp': 'iso-2022-jp',
  };
  return map[lower] ?? charset;
}

/**
 * Decode an RFC 2047 encoded header string.
 * If the string contains no encoded words, returns it unchanged.
 *
 * @example
 *   decodeRFC2047('=?UTF-8?B?QWdvZGE=?= <no-reply@agoda.com>')
 *   // → 'Agoda <no-reply@agoda.com>'
 */
export function decodeRFC2047(input: string): string {
  if (!input || !input.includes('=?')) return input;

  // Remove folding whitespace between consecutive encoded words (RFC 2047 §6.2)
  const normalized = input.replace(/\?=\s+=\?/g, '?==?');

  return normalized.replace(ENCODED_WORD_RE, (_match, charset, encoding, payload) => {
    try {
      return decodeWord(charset, encoding, payload);
    } catch {
      return _match; // Return original on error
    }
  });
}

/**
 * Parse a "From" or "To" header into name + email, with RFC2047 decoding.
 * Handles:
 *   - "Display Name" <email@domain.com>
 *   - =?UTF-8?B?...?= <email@domain.com>
 *   - email@domain.com
 *   - Display Name <email@domain.com>
 */
export function parseFromHeader(raw: string): { name: string; email: string } {
  if (!raw) return { name: '', email: '' };

  const decoded = decodeRFC2047(raw.trim());

  // Try "Name" <email> or Name <email>
  const match = decoded.match(/^"?(.+?)"?\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  // Just an email address
  const emailOnly = decoded.match(/^([^@\s]+@[^@\s]+)$/);
  if (emailOnly) {
    return { name: '', email: emailOnly[1] };
  }

  return { name: '', email: decoded };
}

/**
 * Get a display name for a sender, with a smart fallback chain:
 * 1. participant.name (may need RFC2047 decode)
 * 2. email local-part prettified (foo.bar → Foo Bar)
 * 3. '(không rõ)'
 */
export function getSenderDisplayName(
  name: string | undefined | null,
  email: string | undefined | null
): string {
  // Try the name, possibly RFC2047-encoded
  if (name) {
    const decoded = decodeRFC2047(name);
    if (decoded && decoded !== name) return decoded;
    if (decoded) return decoded;
  }

  // Prettify email local part
  if (email) {
    const localPart = email.split('@')[0];
    if (localPart) {
      return localPart
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  return '(không rõ)';
}
