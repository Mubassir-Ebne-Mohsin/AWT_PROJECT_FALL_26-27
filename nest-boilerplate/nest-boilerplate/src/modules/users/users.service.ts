import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { AppException } from "@/common/errors";
import { Role } from "@/common/enums/role.enum";
import { User } from "@/modules/users/entities/user.entity";
import { UserDto } from "@/modules/users/dto/user.dto";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOneBy({ email: normalizeEmail(email) });
  }

  async usernameAvailable(username: string) {
    return !(await this.repo.existsBy({ username }));
  }

  async setUsername(id: string, username: string) {
    try {
      await this.repo.update({ id }, { username });
    } catch (error) {
      this.throwUsernameConflict(error);
    }
  }

  private throwUsernameConflict(error: unknown): never {
    if (error instanceof QueryFailedError) {
      const { code, constraint } = error.driverError as { code?: string; constraint?: string };
      if (code === "23505" && constraint === "uq_users_username") {
        throw new AppException("VALIDATION_FAILED", "Validation failed", {
          fields: [{ path: "username", message: "This username is already taken" }],
        });
      }
    }
    throw error;
  }

  findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  /** P4: store a new password hash and end all earlier sessions (refresh tokens older than the given moment stop working). */
  async setPassword(id: string, passwordHash: string, at: Date) {
    await this.repo.update({ id }, { passwordHash, sessionsRevokedAt: at });
  }

  async create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    username?: string;
    role?: Role;
  }) {
    try {
      return await this.repo.save(
        this.repo.create({
          ...input,
          email: normalizeEmail(input.email),
          role: input.role ?? Role.USER,
        }),
      );
    } catch (error) {
      // The preflight email lookup cannot protect against concurrent inserts.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string; constraint?: string }).code ===
          "23505" &&
        (error.driverError as { constraint?: string }).constraint ===
          "uq_users_email"
      ) {
        throw new AppException("VALIDATION_FAILED", "Validation failed", {
          fields: [
            { path: "email", message: "This email is already registered" },
          ],
        });
      }
      this.throwUsernameConflict(error);
    }
  }

  /** The only shape of a user that may leave the API: never includes the hash. */
  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      ...(user.username ? { username: user.username } : {}),
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
