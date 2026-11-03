import { Inject, Injectable } from "@nestjs/common";
import { aiFixIntentSchema, type AiFixIntent } from "@/common/contracts/phase3/ai-tasks.schema";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { describeFilter, fixIntentTask, parseFixIntent, toFilter } from "@/modules/ai/tasks/fix-intent";

/**
 * Turns a person's goal for the fix suggestions into a filter. Nothing is saved and nothing is calculated here: the filter is handed
 * back to be shown, edited and sent with the request for fixes, where the engine verifies every fix as usual.
 */
@Injectable()
export class AiFixIntentService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  async interpret(owner: string, goal: string, signal: AbortSignal): Promise<AiFixIntent> {
    const answer = await this.tasks.run({ task: "fixes", owner, userText: goal, request: fixIntentTask(goal), parse: parseFixIntent, signal });
    const filter = toFilter(answer);
    return aiFixIntentSchema.parse({ understood: answer.understood, filter, interpretation: describeFilter(answer.understood, filter), provider: "groq", model: this.provider.model });
  }
}
