import { describe, expect, it } from 'vitest';
import { valuesAt } from '../../../src/helpers/path.helper.js';

describe('valuesAt', () => {
  it('reads a single field, a nested one, and a leaf array', () => {
    expect(valuesAt({ photo: 'a' }, 'photo')).toEqual(['a']);
    expect(valuesAt({ hero: { images: ['a', 'b'] } }, 'hero.images')).toEqual(['a', 'b']);
  });

  it('reaches into an array of sub-documents, as MongoDB reads the path', () => {
    const doc = { coAuthors: [{ photo: 'a' }, { photo: null }, { name: 'x' }, { photo: 'b' }] };

    expect(valuesAt(doc, 'coAuthors.photo')).toEqual(['a', null, undefined, 'b']);
  });

  it('yields nothing past a missing or null step', () => {
    expect(valuesAt({ hero: null }, 'hero.images')).toEqual([]);
    expect(valuesAt({}, 'story.profileDownload.document')).toEqual([]);
  });
});
