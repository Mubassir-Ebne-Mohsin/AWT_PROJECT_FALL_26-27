import { Inject, Injectable } from "@nestjs/common";
import { aiFixIntentSchema, type AiFixIntent } from "@/common/contracts/phase3/ai-tasks.schema";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { fixIntentV3Task, parseFixIntentV3, readGoal } from "@/modules/ai/tasks/fix-intent-v3";

/**
 * Turns a person's goal for the fix suggestions into a proposal. Nothing is saved and nothing is calculated here: the proposal is
 * handed back to be shown and confirmed, then sent with the request for fixes, where the engine verifies every fix as usual.
 * The text is cleaned first so the model never sees an order or embedded code, and the model's choices pass through the grounding
 * guard, which removes any choice the person's own words do not support (docs/AI-DEADLINE-PLAN.md, goal box version 3).
 */
@Injectable()
export class AiFixIntentService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  async interpret(owner: string, goal: string, signal: AbortSignal): Promise<AiFixIntent> {
    const reading = await readGoal(goal, (cleaned) =>
      this.tasks.run({ task: "fixes", owner, userText: cleaned, request: fixIntentV3Task(cleaned), parse: parseFixIntentV3, signal }),
    );
    return aiFixIntentSchema.parse({
      understood: reading.status === "SUPPORTED",
      status: reading.status,
      clarification: reading.clarification,
      filter: reading.filter,
      interpretation: reading.interpretation,
      provider: "groq",
      model: this.provider.model,
    });
  }
}
