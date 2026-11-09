import { InjectQueue, Process, Processor, BullModule } from "@nestjs/bull";
import { Module, OnModuleInit, Logger } from "@nestjs/common";
import type { Queue } from "bull";
import { appConfig } from "@/config";
import { MailOutboxService } from "@/modules/mails/mail-outbox.service";
import { MAIL_OPTIONS, MAIL_SENDER, SmtpMailSender } from "@/modules/mails/mail-sender";

export const MAIL_QUEUE = "mail-outbox";
const TICK_MS = 30_000;

/** Bull worker: one repeating job that asks the outbox to look for new notifications. */
@Processor(MAIL_QUEUE)
export class MailOutboxProcessor {
  private readonly log = new Logger("Mail");
  constructor(private readonly outbox: MailOutboxService) {}

  @Process("tick")
  async tick() {
    try {
      const r = await this.outbox.runOnce();
      if (r.sent || r.retry || r.failed || r.skipped) this.log.log(`outbox: ${JSON.stringify(r)}`);
    } catch {
      // The job must never crash the app; the next tick tries again.
      this.log.warn("Outbox run failed; will retry on the next tick");
    }
  }
}

/** Only imported by AppModule when MAIL_ENABLED=true (docs/MAILER-SCOPE.md). */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    {
      provide: MAIL_SENDER,
      useFactory: () => {
        const e = appConfig.env;
        return new SmtpMailSender({ host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.MAIL_FROM });
      },
    },
    {
      provide: MAIL_OPTIONS,
      useFactory: () => ({
        from: appConfig.env.MAIL_FROM,
        hourlyLimit: appConfig.env.MAIL_HOURLY_LIMIT,
        frontendUrl: appConfig.env.FRONTEND_URL,
      }),
    },
    MailOutboxService,
    MailOutboxProcessor,
  ],
})
export class MailsModule implements OnModuleInit {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue) {}
  async onModuleInit() {
    // A fixed job id keeps exactly one repeating job even after restarts or several instances.
    await this.queue.add("tick", {}, { repeat: { every: TICK_MS }, jobId: "mail-outbox-tick", removeOnComplete: true, removeOnFail: 20 });
  }
}
