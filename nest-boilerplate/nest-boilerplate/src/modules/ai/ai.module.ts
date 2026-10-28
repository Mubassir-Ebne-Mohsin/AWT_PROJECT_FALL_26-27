import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { AiController } from "@/modules/ai/ai.controller";
import { AiService } from "@/modules/ai/ai.service";
import { AiMemory } from "@/modules/ai/ai-memory";
import { OllamaProvider } from "@/modules/ai/ollama.provider";
import { AI_FETCH, AI_SETTINGS, aiSettings } from "@/modules/ai/ai.settings";
@Module({
  imports: [DesignsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiMemory,
    OllamaProvider,
    { provide: AI_SETTINGS, useFactory: aiSettings },
    { provide: AI_FETCH, useValue: globalThis.fetch.bind(globalThis) },
  ],
  exports: [AiService],
})
export class AiModule {}
