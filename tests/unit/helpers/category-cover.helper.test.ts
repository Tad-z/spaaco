import { describe, expect, it } from 'vitest';
import { pickCategoryCover } from '../../../src/helpers/category-cover.helper.js';

describe('pickCategoryCover', () => {
  const covers = { articles: 'articles-card', events: null, insights: 'insights-card' };

  it("takes the first category's card", () => {
    expect(pickCategoryCover(['articles', 'insights'], covers)).toBe('articles-card');
  });

  it('moves on to the next category when the first has no card', () => {
    expect(pickCategoryCover(['events', 'firm_news', 'insights'], covers)).toBe('insights-card');
  });

  it('is null when no category has a card', () => {
    expect(pickCategoryCover(['events', 'firm_news'], covers)).toBeNull();
  });
});
