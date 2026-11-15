export interface DuolingoProfileDto {
  id: number;
  username: string;
  name: string;
  picture: string | null;
}

export interface DuolingoUsersResponseDto {
  users: DuolingoProfileDto[];
}
