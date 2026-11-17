import { Fragment } from 'react';

import { findSearchRanges } from '@duofollow/src/following/followingSearch';

export function HighlightedSearchText({
  text,
  term,
  active,
}: {
  text: string;
  term: string;
  active: boolean;
}) {
  const matches = findSearchRanges(text, term);
  if (matches.length === 0) return text;

  return (
    <>
      {matches.map(({ start, end }, index) => (
        <Fragment key={start}>
          {text.slice(matches[index - 1]?.end ?? 0, start)}
          <mark className="following-search-match" data-highlight={active || undefined}>
            {text.slice(start, end)}
          </mark>
        </Fragment>
      ))}
      {text.slice(matches.at(-1)?.end)}
    </>
  );
}
