import { seeder } from "nestjs-seeder";
import { TypeOrmModule } from "@nestjs/typeorm";
import dataSourceOptions from "@/config/database.config";
import { UsersSeeder } from "@/database/seeders/users.seeder";
import { User } from "@/modules/users/entities/user.entity";

seeder({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    TypeOrmModule.forFeature([User]),
  ],
}).run([UsersSeeder]);
