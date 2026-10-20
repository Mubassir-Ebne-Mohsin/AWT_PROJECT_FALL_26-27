import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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

  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
    role?: Role;
  }) {
    return this.repo.save(
      this.repo.create({
        ...input,
        email: normalizeEmail(input.email),
        role: input.role ?? Role.USER,
      }),
    );
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
