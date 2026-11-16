import type { DuolingoFollowingUserDto } from '@duofollow/src/api/dto/DuolingoFollowingDto';
import type { DuolingoUser } from '@duofollow/src/domain/models/DuolingoUser';

export function toDuolingoUser(dto: DuolingoFollowingUserDto): DuolingoUser {
  return {
    id: String(dto.userId),
    username: dto.username,
    displayName: dto.displayName,
    avatarUrl: dto.picture ?? undefined,
    isFollowing: dto.isFollowing,
    isFollowedBy: dto.isFollowedBy,
  };
}
