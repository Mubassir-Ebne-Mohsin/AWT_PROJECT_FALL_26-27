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

  findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  async create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
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
      throw error;
    }
  }

  /** The only shape of a user that may leave the API: never includes the hash. */
  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
