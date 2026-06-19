import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Thin wrapper around nodemailer. If SMTP is not configured (no SMTP_HOST), it
// degrades to logging the message instead of failing — handy in dev/CI.
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('mail.host');
    if (!host) {
      this.logger.warn('SMTP not configured — emails will be logged, not sent.');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: this.config.get<string>('mail.user')
        ? {
            user: this.config.get<string>('mail.user'),
            pass: this.config.get<string>('mail.password'),
          }
        : undefined,
    });
  }

  // Returns true if actually dispatched to an SMTP server, false if logged only.
  async send(msg: MailMessage): Promise<boolean> {
    const from = this.config.get<string>('mail.from');
    if (!this.transporter) {
      this.logger.log(`[mail:dev] to=${msg.to} subject="${msg.subject}"`);
      return false;
    }
    await this.transporter.sendMail({ from, ...msg });
    return true;
  }

  appUrl(): string {
    return this.config.get<string>('mail.appUrl') ?? 'http://localhost:5173';
  }
}
