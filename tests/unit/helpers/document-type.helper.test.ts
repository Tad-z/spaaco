import { describe, expect, it } from 'vitest';
import {
  DOCX_MIME,
  PDF_MIME,
  sniffDocumentType,
} from '../../../src/helpers/document-type.helper.js';

/**
 * The check that decides whether a stranger's file reaches the firm's storage.
 * Worth testing against the things people actually try, not just a happy path.
 */

const zip = (...entries: string[]): Buffer =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(26),
    ...entries.map((entry) => Buffer.from(entry, 'latin1')),
  ]);

describe('sniffDocumentType', () => {
  it('recognises a PDF', () => {
    expect(sniffDocumentType(Buffer.from('%PDF-1.7\nstuff'))).toBe(PDF_MIME);
  });

  it('recognises a DOCX by the entry every Word document has', () => {
    expect(sniffDocumentType(zip('word/document.xml', '[Content_Types].xml'))).toBe(DOCX_MIME);
  });

  it('refuses a ZIP that is not a Word document', () => {
    // The distinction that matters: a .docx rename of an archive of anything.
    expect(sniffDocumentType(zip('holiday.jpg', 'notes.txt'))).toBeUndefined();
  });

  it('refuses an xlsx, which is a ZIP with the wrong entry', () => {
    expect(sniffDocumentType(zip('xl/workbook.xml'))).toBeUndefined();
  });

  it('refuses an executable', () => {
    expect(
      sniffDocumentType(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512)]))
    ).toBeUndefined();
  });

  it('refuses an image', () => {
    expect(sniffDocumentType(Buffer.from('89504e470d0a1a0a', 'hex'))).toBeUndefined();
  });

  it('refuses a PDF header hidden after other bytes', () => {
    const disguised = Buffer.concat([Buffer.from('GIF89a'), Buffer.from('%PDF-1.7')]);

    expect(sniffDocumentType(disguised)).toBeUndefined();
  });

  it('refuses an empty file', () => {
    expect(sniffDocumentType(Buffer.alloc(0))).toBeUndefined();
  });
});
