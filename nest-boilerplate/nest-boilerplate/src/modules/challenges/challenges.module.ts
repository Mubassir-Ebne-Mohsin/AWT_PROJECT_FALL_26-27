import { LearnerChallengesController } from "@/modules/challenges/learner-challenges.controller";
import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
import { InstructorSubmissionsController } from "@/modules/challenges/instructor-submissions.controller";
import { InstructorSubmissionsService } from "@/modules/challenges/instructor-submissions.service";
import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { SimulationModule } from "@/modules/simulation/simulation.module";
import { ChallengesService } from "@/modules/challenges/challenges.service";
import { InstructorChallengesController } from "@/modules/challenges/challenges.controller";

@Module({
  imports: [DesignsModule, SimulationModule],
  controllers: [InstructorChallengesController, InstructorSubmissionsController, LearnerChallengesController],
  providers: [ChallengesService, InstructorSubmissionsService, LearnerChallengesService],
})
export class ChallengesModule {}
