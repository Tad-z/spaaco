/**
 * CSV for files somebody at the firm opens in a spreadsheet.
 *
 * Two things matter beyond quoting. A cell starting with `=`, `+`, `-`, `@`,
 * a tab or a carriage return is read as a formula by Excel and Sheets, and the
 * values here came from the public internet, so such a cell is prefixed with
 * `'` to keep it text. And lines end in CRLF, as RFC 4180 says.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
