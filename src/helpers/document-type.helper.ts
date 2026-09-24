/**
 * What a CV actually is, read from its bytes.
 *
 * Same rule as images (`image-type.helper.ts`): the filename and the declared
 * `Content-Type` both come from whoever is uploading, so neither is evidence.
 * This is what stops an executable arriving as `cv.pdf`.
 */

const PDF_MAGIC = Buffer.from('%PDF-');

/** Every ZIP starts with this, including every DOCX. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * The entry a Word document must contain.
 *
 * Searched for as raw bytes rather than by unzipping: a ZIP stores each entry's
 * name uncompressed in both the local header and the central directory, so the
 * string is present in the file either way. Unzipping untrusted input to find
 * out what it is would mean decompressing it first, which is the thing a zip
 * bomb relies on.
 */
const DOCX_ENTRY = Buffer.from('word/document.xml');

export const PDF_MIME = 'application/pdf';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The real media type, or `undefined` when it is not a CV we accept. */
export function sniffDocumentType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return PDF_MIME;

  if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    return buffer.includes(DOCX_ENTRY) ? DOCX_MIME : undefined;
  }

  return undefined;
}
