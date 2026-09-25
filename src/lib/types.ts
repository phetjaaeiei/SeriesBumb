export type Role = 'member' | 'admin';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  commentBanned: boolean;
}
