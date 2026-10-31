import { LearnerChallengesController } from "@/modules/challenges/learner-challenges.controller";
import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { SimulationModule } from "@/modules/simulation/simulation.module";
import { ChallengesService } from "@/modules/challenges/challenges.service";
import { InstructorChallengesController } from "@/modules/challenges/challenges.controller";

@Module({
  imports: [DesignsModule, SimulationModule],
  controllers: [InstructorChallengesController, LearnerChallengesController],
  providers: [ChallengesService, LearnerChallengesService],
})
export class ChallengesModule {}
