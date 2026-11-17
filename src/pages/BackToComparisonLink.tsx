import { ComparisonLink } from '@duofollow/src/ComparisonLink';

export function BackToComparisonLink({ label }: { label: string }) {
  return (
    <ComparisonLink className="secondary-button information-button">
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 3 4 8l5 5M4 8h9" />
      </svg>
      {label}
    </ComparisonLink>
  );
}
