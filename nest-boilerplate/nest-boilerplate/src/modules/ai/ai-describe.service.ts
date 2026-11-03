import { Inject, Injectable } from "@nestjs/common";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { cleanDescription, describeV2Parse, describeV2Task, notASystem } from "@/modules/ai/tasks/describe-v2";

/**
 * Describe-to-design: one description in, one prepared design out. Nothing is saved; the person reviews it and creates it
 * through the existing create path. The description is cleaned first, so the model never sees an order or embedded code; when
 * nothing is left, no model is asked. Building the design happens inside the task's own validation, so a form that cannot become a
 * valid design is recorded as invalid output like any other bad answer.
 */
@Injectable()
export class AiDescribeService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  prepare(owner: string, text: string, signal: AbortSignal) {
    const { cleaned } = cleanDescription(text);
    if (!cleaned) return Promise.reject(notASystem());
    return this.tasks.run({
      task: "describe",
      owner,
      userText: cleaned,
      request: describeV2Task(cleaned),
      parse: describeV2Parse(text, this.provider.model),
      signal,
    });
  }
}
