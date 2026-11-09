import { createTransport, type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The only thing the outbox needs from a mail server. Tests and the disabled mode never touch SMTP. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_SENDER = Symbol("MAIL_SENDER");
export const MAIL_OPTIONS = Symbol("MAIL_OPTIONS");

export interface MailOptions {
  from: string;
  hourlyLimit: number;
  frontendUrl: string;
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;
  constructor(private readonly settings: SmtpSettings) {
    this.transport = createTransport({
      host: settings.host,
      port: settings.port,
      auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  async send(message: MailMessage) {
    await this.transport.sendMail({ from: this.settings.from, ...message });
  }
}
