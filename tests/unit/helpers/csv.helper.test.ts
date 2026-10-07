import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../../../src/helpers/csv.helper.js';

describe('csvCell', () => {
  it('leaves a plain value alone', () => {
    expect(csvCell('adaeze.nwosu@example.com')).toBe('adaeze.nwosu@example.com');
  });

  it('quotes a value with a comma, quote or newline, doubling the quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it.each(['=HYPERLINK("x")', '+1', '-1', '@SUM(A1)', '\tx'])(
    'keeps %j from being read as a spreadsheet formula',
    (value) => {
      expect(csvCell(value).replace(/^"/, '')).toMatch(/^'/);
    }
  );
});

describe('toCsv', () => {
  it('writes a header and rows with CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });
});
