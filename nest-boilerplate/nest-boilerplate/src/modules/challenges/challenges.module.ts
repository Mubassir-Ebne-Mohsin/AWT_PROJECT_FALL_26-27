import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { SimulationModule } from "@/modules/simulation/simulation.module";
import { ChallengesService } from "@/modules/challenges/challenges.service";
import { InstructorChallengesController } from "@/modules/challenges/challenges.controller";

@Module({
  imports: [DesignsModule, SimulationModule],
  controllers: [InstructorChallengesController],
  providers: [ChallengesService],
})
export class ChallengesModule {}
