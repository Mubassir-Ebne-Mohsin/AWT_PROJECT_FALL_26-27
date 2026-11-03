import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { AiController } from "@/modules/ai/ai.controller";
import { AiService } from "@/modules/ai/ai.service";
import { AiDescribeService } from "@/modules/ai/ai-describe.service";
import { AiFixIntentService } from "@/modules/ai/ai-fix-intent.service";
import { AiWhatIfService } from "@/modules/ai/ai-what-if.service";
import { AiTasksController } from "@/modules/ai/ai-tasks.controller";
import { AiTaskService } from "@/modules/ai/ai-task.service";
import { AiMemory } from "@/modules/ai/ai-memory";
import { AiQuota } from "@/modules/ai/ai-quota";
import { OllamaProvider } from "@/modules/ai/ollama.provider";
import { EXPLANATION_PROVIDER } from "@/modules/ai/provider";
import { selectProvider } from "@/modules/ai/provider.factory";
import { AI_FETCH, AI_SETTINGS, GROQ_CREDENTIALS, AiSettings, aiSettings, groqCredentials } from "@/modules/ai/ai.settings";
@Module({
  imports: [DesignsModule],
  controllers: [AiController, AiTasksController],
  providers: [
    AiService,
    AiTaskService,
    AiDescribeService,
    AiFixIntentService,
    AiWhatIfService,
    AiMemory,
    AiQuota,
    OllamaProvider,
    { provide: AI_SETTINGS, useFactory: aiSettings },
    { provide: AI_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    { provide: GROQ_CREDENTIALS, useFactory: groqCredentials },
    {
      // The provider is chosen by configuration and never switches silently to another.
      provide: EXPLANATION_PROVIDER,
      inject: [AI_SETTINGS, OllamaProvider, GROQ_CREDENTIALS, AI_FETCH],
      useFactory: (settings: AiSettings, ollama: OllamaProvider, credentials: { apiKey: string }, fetcher: typeof fetch) =>
        selectProvider(settings, ollama, credentials, fetcher),
    },
  ],
  exports: [AiService, AiTaskService],
})
export class AiModule {}
