import { Inject, Injectable } from "@nestjs/common";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { EXPLANATION_PROVIDER, ExplanationProvider } from "@/modules/ai/provider";
import { describeParse, describeTask } from "@/modules/ai/tasks/describe";

/**
 * Describe-to-design: one description in, one prepared design out. Nothing is saved; the person reviews it and creates it
 * through the existing create path. Building the design happens inside the task's own validation, so a form that cannot become a
 * valid design is recorded as invalid output like any other bad answer.
 */
@Injectable()
export class AiDescribeService {
  constructor(
    private readonly tasks: AiTaskService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
  ) {}

  prepare(owner: string, text: string, signal: AbortSignal) {
    const model = this.provider.model;
    return this.tasks.run({
      task: "describe",
      owner,
      userText: text,
      request: describeTask(text),
      parse: describeParse(text, model),
      signal,
    });
  }
}
