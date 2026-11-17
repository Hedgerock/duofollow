import type { ComparedFollowingUser } from '@duofollow/extension/src/dto/DuolingoFollowingDto';
import type { Messages } from '@duofollow/src/i18n/messages';

export function RelationshipLegend({
  relationships,
  messages,
  visible = true,
}: {
  relationships: ComparedFollowingUser['relationship'][];
  messages: Messages;
  visible?: boolean;
}) {
  return (
    <ul
      className="following-legend"
      role="list"
      aria-label={messages.relationshipLegend}
      aria-hidden={!visible || undefined}
    >
      {relationships.map((relationship) => (
        <li className="relationship-badge" data-relationship={relationship} key={relationship}>
          {messages.relationships[relationship]}
        </li>
      ))}
    </ul>
  );
}
