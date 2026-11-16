import type { ComparedFollowingUser } from '../../extension/src/dto/DuolingoFollowingDto';
import type { Messages } from '../i18n/messages';

export function RelationshipLegend({
  relationships,
  messages,
}: {
  relationships: ComparedFollowingUser['relationship'][];
  messages: Messages;
}) {
  return (
    <ul className="following-legend" role="list" aria-label={messages.relationshipLegend}>
      {relationships.map((relationship) => (
        <li className="relationship-badge" data-relationship={relationship} key={relationship}>
          {messages.relationships[relationship]}
        </li>
      ))}
    </ul>
  );
}
