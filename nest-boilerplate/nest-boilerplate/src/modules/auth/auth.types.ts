import { Role } from "@/common/enums/role.enum";

export interface AccessTokenPayload {
  typ: "access";
  sub: string;
  email: string;
  role: Role;
  jti: string;
  exp: number;
}

export interface RefreshTokenPayload {
  /** Version 1 families have a fixed deadline; pre-fix sliding cookies must sign in again. */
  ver: 1;
  typ: "refresh";
  sub: string;
  /** Token id; rotated on every refresh. */
  jti: string;
  /** Family id; constant across a rotation chain so a reuse can revoke the whole chain. */
  fam: string;
  /** Issued-at, added by the JWT library; compared with `users.sessions_revoked_at` on refresh. */
  iat?: number;
  exp: number;
}
