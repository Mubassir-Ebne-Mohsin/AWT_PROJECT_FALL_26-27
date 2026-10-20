import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { Seeder } from "nestjs-seeder";
import { Repository } from "typeorm";
import { appConfig } from "@/config";
import { Role } from "@/common/enums/role.enum";
import { User } from "@/modules/users/entities/user.entity";

export const DEMO_EMAIL = "demo@stressforge.dev";

@Injectable()
export class UsersSeeder implements Seeder {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  async seed() {
    // Idempotent: running the seeder twice must not fail or duplicate.
    if (await this.repo.existsBy({ email: DEMO_EMAIL })) return;
    await this.repo.save(
      this.repo.create({
        email: DEMO_EMAIL,
        displayName: "Demo User",
        role: Role.USER,
        passwordHash: await argon2.hash(appConfig.env.DEMO_USER_PASSWORD),
      }),
    );
  }

  async drop() {
    await this.repo.delete({ email: DEMO_EMAIL });
  }
}
