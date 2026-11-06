import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envoi d'e-mails. En local, SMTP vers Mailpit (http://localhost:8125) ; en test, une boîte en mémoire. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
    this.transport = nodemailer.createTransport(env.SMTP_URL);
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...message });
    } catch (error) {
      // L'échec d'envoi ne doit ni bloquer l'inscription ni révéler l'existence d'un compte :
      // l'utilisateur pourra redemander le message.
      this.logger.error(`Envoi d'e-mail impossible : ${String(error)}`);
    }
  }
}

/** Boîte de réception en mémoire pour les tests de bout en bout. */
export class InMemoryMailer extends Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastTo(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}
