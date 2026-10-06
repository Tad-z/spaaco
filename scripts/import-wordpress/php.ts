/**
 * WordPress (ACF) stores some lists as PHP-serialized arrays, for example
 * `a:1:{i:0;s:18:"Dispute Resolution";}`. Only arrays of strings occur in this
 * export, so that is all this reads.
 *
 * String lengths in the format are *bytes*, not characters, so the parser
 * walks a UTF-8 buffer. When a length is wrong — which happens after a
 * database charset conversion — it falls back to matching the quoted values.
 */

/** The strings in a serialized array, or null when the value is not one. */
export function unserializeStrings(raw: string | null | undefined): string[] | null {
  const value = (raw ?? '').trim();
  if (!/^a:\d+:\{/.test(value)) return null;

  try {
    return parse(value);
  } catch {
    const loose = [...value.matchAll(/s:\d+:"(.*?)";/g)].map((match) => match[1] ?? '');
    return loose.length > 0 ? loose : null;
  }
}

function parse(value: string): string[] {
  const buffer = Buffer.from(value, 'utf8');
  let position = 0;

  const expect = (token: string): void => {
    const found = buffer.toString('utf8', position, position + token.length);
    if (found !== token) throw new Error(`expected "${token}" at byte ${String(position)}`);
    position += token.length;
  };

  const readUntil = (terminator: string): string => {
    const end = buffer.indexOf(terminator, position);
    if (end < 0) throw new Error(`no "${terminator}" after byte ${String(position)}`);
    const text = buffer.toString('utf8', position, end);
    position = end + terminator.length;
    return text;
  };

  const readString = (): string => {
    expect('s:');
    const length = Number(readUntil(':'));
    expect('"');
    const text = buffer.toString('utf8', position, position + length);
    position += length;
    expect('";');
    return text;
  };

  expect('a:');
  const count = Number(readUntil(':'));
  expect('{');

  const out: string[] = [];
  for (let index = 0; index < count; index += 1) {
    // Keys are integers in a list, but a string key is legal PHP.
    if (buffer.toString('utf8', position, position + 2) === 'i:') {
      expect('i:');
      readUntil(';');
    } else {
      readString();
    }
    out.push(readString());
  }

  expect('}');
  return out;
}
