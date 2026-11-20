/**
 * Line prompts that do not use Node's readline TTY parser.
 *
 * readline puts stdin in raw mode and assembles escape sequences itself.
 * A bracketed paste (macOS Terminal wraps every paste in ESC [200~ … ESC [201~)
 * can leave that parser waiting for the rest of a sequence. Enter is then
 * swallowed, so the last prompt never returns. Reading the byte stream and
 * treating CR/LF as submit cannot get stuck that way.
 */
import type { Readable, Writable } from 'node:stream';

const PASTE_START = '\u001b[200~';
const PASTE_END = '\u001b[201~';
const LINE_BREAK = /\r\n|\n|\r/;

export function stripPasteMarkers(value: string): string {
  return value.split(PASTE_START).join('').split(PASTE_END).join('');
}

export interface LineInput extends Readable {
  isTTY?: boolean;
  setRawMode?(mode: boolean): this;
}

export interface LineReader {
  /** Resolves with the trimmed line. An empty Enter resolves to ''. */
  ask(label: string): Promise<string>;
  close(): void;
}

export function createLineReader(input: LineInput, output: Writable): LineReader {
  if (input.isTTY && typeof input.setRawMode === 'function') {
    input.setRawMode(false);
  }
  // Ask the terminal to send pastes as plain text. Harmless if it ignores this.
  output.write('\u001b[?2004l');

  let buffer = '';
  let waiting: ((line: string) => void) | null = null;

  const takeLine = (): void => {
    if (!waiting) return;
    const match = LINE_BREAK.exec(buffer);
    if (match?.index === undefined) return;
    const raw = buffer.slice(0, match.index);
    buffer = buffer.slice(match.index + match[0].length);
    const resolve = waiting;
    waiting = null;
    resolve(stripPasteMarkers(raw).trim());
  };

  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    takeLine();
  };
  input.on('data', onData);
  input.resume();

  return {
    ask(label: string): Promise<string> {
      output.write(label);
      return new Promise((resolve) => {
        waiting = resolve;
        takeLine();
      });
    },
    close(): void {
      input.off('data', onData);
      input.pause();
    },
  };
}

const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function adminSubjectWarnings(raw: string): string[] {
  const subjects = raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  if (subjects.length === 0) return [];
  const hasObjectId = subjects.some((subject) => OBJECT_ID.test(subject));
  const onlyEmails = subjects.every((subject) => subject.includes('@'));
  if (!hasObjectId && onlyEmails) {
    return [
      'Warning: ADMIN_SUBJECTS contains only email addresses. Add an Entra object id as well. When dynamic claims are not minted, the server can only match the subject id, not the email.',
    ];
  }
  return [];
}

export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return null;
  }
  const kind = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (kind !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const ICON_BYTE_LIMIT = 200 * 1024;

export function iconFileWarnings(
  byteLength: number,
  size: { width: number; height: number } | null,
): string[] {
  const warnings: string[] = [];
  if (byteLength > ICON_BYTE_LIMIT) {
    warnings.push(
      `Warning: the icon is ${Math.ceil(byteLength / 1024)} KB. It is also copied to the favicon; a square PNG under 200 KB is a better fit.`,
    );
  }
  if (size && size.width !== size.height) {
    warnings.push(
      `Warning: the icon is ${size.width}×${size.height}, not square. It is also copied to the favicon.`,
    );
  } else if (!size) {
    warnings.push('Warning: the icon does not look like a PNG with a readable size. It is also copied to the favicon.');
  }
  return warnings;
}

/** Empty, y, or yes accepts. Anything else declines. */
export function acceptsWrite(answer: string): boolean {
  const value = answer.trim().toLowerCase();
  return value === '' || value === 'y' || value === 'yes';
}
