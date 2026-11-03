import { Inject, Injectable } from "@nestjs/common";
import { aiWhatIfSchema, type AiWhatIf } from "@/common/contracts/phase3/ai-tasks.schema";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { parseWhatIf, readWhatIf, whatIfTask } from "@/modules/ai/tasks/what-if";

/**
 * Turns a sentence about the traffic into a proposal for the what-if controls. Nothing is calculated or saved here: the proposal is
 * handed back to be shown and applied by the person, and the what-if itself is the server's ordinary, model-free calculation. The
 * sentence is cleaned first, and the model's choices pass through the grounding guard and the bounds before anything is returned.
 */
@Injectable()
export class AiWhatIfService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  async interpret(owner: string, text: string, signal: AbortSignal): Promise<AiWhatIf> {
    const reading = await readWhatIf(text, (cleaned) => this.tasks.run({ task: "whatif", owner, userText: cleaned, request: whatIfTask(cleaned), parse: parseWhatIf, signal }));
    return aiWhatIfSchema.parse({ status: reading.status, change: reading.change, interpretation: reading.interpretation, provider: "groq", model: this.provider.model });
  }
}
