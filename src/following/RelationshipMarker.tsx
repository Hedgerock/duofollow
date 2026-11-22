import { Tooltip } from '@duofollow/src/Tooltip';

import type { FollowingRelationship } from '@duofollow/extension/src/dto/DuolingoFollowingDto';

export function RelationshipMarker({
  relationship,
  label,
}: {
  relationship: FollowingRelationship;
  label: string;
}) {
  return (
    <Tooltip label={label} followPointer>
      <button
        type="button"
        className="relationship-marker"
        data-relationship={relationship}
        aria-label={label}
      />
    </Tooltip>
  );
}
