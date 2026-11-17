const graphemes =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined;

function normalizeSearch(value: string) {
  return value.normalize('NFC').toLowerCase().replaceAll('ς', 'σ');
}

export function getSearchTerm(query: string) {
  return normalizeSearch(query.trim().replace(/^@/, ''));
}

export function matchesSearch(value: string, term: string) {
  return normalizeSearch(value).includes(term);
}

/** Maps normalized substring offsets back to whole graphemes in the displayed text. */
export function findSearchRanges(value: string, term: string) {
  const normalized = normalizeSearch(value);
  let offset = term ? normalized.indexOf(term) : -1;
  if (offset < 0 || !graphemes) return [];

  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of graphemes.segment(value)) {
    const units = normalizeSearch(segment).length;
    for (let unit = 0; unit < units; unit++) {
      starts.push(index);
      ends.push(index + segment.length);
    }
  }

  const ranges: { start: number; end: number }[] = [];
  while (offset >= 0) {
    const start = starts[offset];
    const end = ends[offset + term.length - 1];
    const previous = ranges.at(-1);
    if (previous && start < previous.end) previous.end = end;
    else ranges.push({ start, end });
    offset = normalized.indexOf(term, offset + term.length);
  }
  return ranges;
}
