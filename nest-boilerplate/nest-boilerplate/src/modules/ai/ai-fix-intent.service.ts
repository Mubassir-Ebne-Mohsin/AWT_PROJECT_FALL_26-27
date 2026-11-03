import { Inject, Injectable } from "@nestjs/common";
import { aiFixIntentSchema, type AiFixIntent } from "@/common/contracts/phase3/ai-tasks.schema";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { describeFilter, fixIntentTask, parseFixIntent, toFilter } from "@/modules/ai/tasks/fix-intent";
import { groundIntent } from "@/modules/ai/tasks/fix-intent-guard";

/**
 * Turns a person's goal for the fix suggestions into a filter. Nothing is saved and nothing is calculated here: the filter is handed
 * back to be shown, edited and sent with the request for fixes, where the engine verifies every fix as usual. The model's choices pass
 * through the grounding guard first, which removes any choice the person's own words do not support.
 */
@Injectable()
export class AiFixIntentService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  async interpret(owner: string, goal: string, signal: AbortSignal): Promise<AiFixIntent> {
    const answer = await this.tasks.run({ task: "fixes", owner, userText: goal, request: fixIntentTask(goal), parse: parseFixIntent, signal });
    // Whatever the model chose, only what the person's own words support is kept (docs/AI-FIX-INTENT-GUARD-RUBRIC.md).
    const { output } = groundIntent(goal, answer);
    const filter = toFilter(output);
    return aiFixIntentSchema.parse({ understood: output.understood, filter, interpretation: describeFilter(output.understood, filter), provider: "groq", model: this.provider.model });
  }
}
