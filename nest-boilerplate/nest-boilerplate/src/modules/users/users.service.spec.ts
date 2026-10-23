import { QueryFailedError, Repository } from "typeorm";
import { User } from "@/modules/users/entities/user.entity";
import { UsersService } from "@/modules/users/users.service";

const input = {
  email: "ADA@EXAMPLE.TEST",
  displayName: "Ada",
  passwordHash: "hashed",
};
describe("UsersService unique-email constraint", () => {
  const make = (error: Error) =>
    new UsersService({
      create: (value: unknown) => value,
      save: async () => {
        throw error;
      },
    } as unknown as Repository<User>);

  it("turns the email constraint race into a field-level validation error", async () => {
    const error = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error("duplicate"), {
        code: "23505",
        constraint: "uq_users_email",
      }),
    );
    await expect(make(error).create(input)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        fields: [
          { path: "email", message: "This email is already registered" },
        ],
      },
    });
  });

  it.each([
    { code: "23505", constraint: "another_constraint" },
    { code: "08006", constraint: "uq_users_email" },
  ])("preserves unrelated DB failures (%s)", async (driver) => {
    const error = new QueryFailedError(
      "INSERT",
      [],
      Object.assign(new Error("database failure"), driver),
    );
    await expect(make(error).create(input)).rejects.toBe(error);
  });
});
