export function FollowingCount({
  displayed,
  total,
  ofTotal,
  searching,
}: {
  displayed: string;
  total: string;
  ofTotal: string;
  searching: boolean;
}) {
  return (
    <span className="following-count-slot">
      <span className="following-count-measure" aria-hidden="true">
        <strong>{total}</strong>
        <small> {ofTotal}</small>
      </span>
      <span className="following-count" aria-live="polite" aria-atomic="true">
        <strong key={displayed} data-search-count={searching || undefined}>
          {displayed}
        </strong>
        {searching && <small> {ofTotal}</small>}
      </span>
    </span>
  );
}
