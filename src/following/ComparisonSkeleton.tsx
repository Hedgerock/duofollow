export function ComparisonSkeleton() {
  return (
    <div className="comparison-skeleton" aria-hidden="true" inert>
      <div className="stats">
        {[0, 1, 2].map((index) => (
          <article key={index}>
            <span className="skeleton-bar skeleton-label" />
            <span className="skeleton-bar skeleton-value" />
            <span className="skeleton-bar skeleton-caption" />
          </article>
        ))}
      </div>

      <div className="panel live-following">
        <div className="panel-heading">
          <div className="skeleton-heading">
            <span className="skeleton-bar skeleton-title" />
            <span className="skeleton-bar skeleton-caption" />
          </div>
        </div>

        <div className="toolbar">
          <span className="skeleton-bar skeleton-search" />
        </div>

        <ul className="users live-following-list virtual-following">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => (
            <li className="user" key={index}>
              <div className="user-info">
                <span className="skeleton-bar skeleton-label" />
                <span className="skeleton-bar skeleton-caption" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
