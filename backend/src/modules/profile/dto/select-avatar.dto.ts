import { IsUUID } from 'class-validator';

export class SelectAvatarDto {
  @IsUUID()
  profileId: string;

  @IsUUID()
  avatarId: string;
}
