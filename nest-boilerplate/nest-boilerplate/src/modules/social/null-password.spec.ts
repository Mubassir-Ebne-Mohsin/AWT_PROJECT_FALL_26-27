import { AuthService } from "@/modules/auth/auth.service";
import { UsersService } from "@/modules/users/users.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { JwtService } from "@nestjs/jwt";
describe("Social-only local login", () => {
  it("never accepts the timing dummy password as a real credential", async () => {
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "social@example.test",
      passwordHash: null,
      accountStatus: "active",
      role: "user",
    };
    const users = { findByEmail: jest.fn().mockResolvedValue(user) },
      jwt = { signAsync: jest.fn().mockResolvedValue("must-not-be-issued") };
    const auth = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      {} as TokenStore,
    );
    await expect(
      auth.login({ email: user.email, password: "not-a-real-password" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
