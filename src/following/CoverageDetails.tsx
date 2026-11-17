import { useId, useRef, useState } from 'react';

import type { RelationshipCoverageStatus } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Messages } from '@duofollow/src/i18n/messages';

interface CoverageDetailsProps {
  status?: RelationshipCoverageStatus;
  label: string;
  total: string;
  messages: Pick<Messages, 'partialCoverage' | 'coverage'>;
}

export function CoverageDetails({ status, label, total, messages }: CoverageDetailsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (!status || status === 'complete') return <small>{total}</small>;

  return (
    <div
      className="comparison-coverage-details"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        toggleRef.current?.focus();
        setOpen(false);
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        className="comparison-coverage-toggle"
        aria-label={`${label} · ${total} · ${messages.partialCoverage}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
      >
        <small>{total}</small>
        <span className="comparison-coverage-label">{messages.partialCoverage}</span>
      </button>
      <div
        id={panelId}
        className="comparison-coverage-panel"
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
      >
        <div className="comparison-coverage-content">
          <p className="comparison-coverage-explanation">{messages.coverage[status]}</p>
        </div>
      </div>
    </div>
  );
}
