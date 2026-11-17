import { describe, expect, it } from 'vitest';

import {
  findSearchRanges,
  getSearchTerm,
  matchesSearch,
} from '@duofollow/src/following/followingSearch';

describe('following search', () => {
  it.each([
    ['BoPedersen', 'ers', ['ers']],
    ['JerSal2', 'ers', ['erS']],
    ['Jer Sal', 'ers', []],
    ['セリーナ', 'セリ', ['セリ']],
    ['أحمد', 'أحم', ['أحم']],
    ['Jose\u0301', 'É', ['e\u0301']],
    ['İstanbul', 'STAN', ['stan']],
    ['ΟΣ', 'ΟΣ', ['ΟΣ']],
    ['Αλέξης', 'Σ', ['ς']],
    ['Αλέξης', 'σ', ['ς']],
    ['Σοφία', 'ς', ['Σ']],
    ['A[bc[', '[', ['[', '[']],
    ['👩‍💻 Dev', '👩', ['👩‍💻']],
  ])('maps the search for %s and %s to the original text', (text, query, expected) => {
    const term = getSearchTerm(query);
    expect(matchesSearch(text, term)).toBe(expected.length > 0);
    expect(findSearchRanges(text, term).map(({ start, end }) => text.slice(start, end))).toEqual(
      expected,
    );
  });

  it('accepts leading @ and outer whitespace and skips empty highlights', () => {
    expect(getSearchTerm('  @JeRSaL2  ')).toBe('jersal2');
    expect(findSearchRanges('JerSal2', getSearchTerm(' @ '))).toEqual([]);
  });
});
