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
  typ: "refresh";
  sub: string;
  /** Token id; rotated on every refresh. */
  jti: string;
  /** Family id; constant across a rotation chain so a reuse can revoke the whole chain. */
  fam: string;
  exp: number;
}
