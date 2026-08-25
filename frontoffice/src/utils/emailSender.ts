import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

/**
 * Envoi d'e-mails transactionnels (codes de vérification).
 *
 * Le transport par défaut vise le serveur SMTP local — sur un hébergement
 * mutualisé, il écoute sur 127.0.0.1:25 et n'exige aucun identifiant. C'est le
 * chemin le plus court et le plus fiable : pas de clé à gérer, pas de quota
 * d'API tierce.
 *
 * ⚠️  L'adresse d'expédition doit appartenir à un domaine réellement hébergé.
 *     Écrire depuis un domaine sans DNS (donc sans SPF ni DKIM) fait classer le
 *     message comme falsifié, et la plupart des destinataires le suppriment
 *     sans avertissement.
 *
 * Le transport est injectable, comme le client HTTP de `twilioSms` : les tests
 * vérifient la construction du message sans ouvrir de connexion.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export class EmailSender {
  private transport: Transporter | null = null;

  constructor(private readonly injected?: Transporter) {}

  /** Vrai si une adresse d'expédition et un hôte SMTP sont connus. */
  isConfigured(): boolean {
    return Boolean(config.email.from && (config.email.host || this.injected));
  }

  private getTransport(): Transporter {
    if (this.injected) return this.injected;
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        // Le SMTP local n'est pas chiffré et n'a pas à l'être : le trafic ne
        // quitte pas la machine. `secure: false` avec `ignoreTLS` évite une
        // négociation STARTTLS inutile qui échouerait sur certains hôtes.
        secure: config.email.secure,
        ignoreTLS: !config.email.secure && !config.email.user,
        ...(config.email.user
          ? { auth: { user: config.email.user, pass: config.email.password } }
          : {}),
      });
    }
    return this.transport;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('E-mail : expéditeur ou hôte SMTP non configuré');
    }
    const info = await this.getTransport().sendMail({
      from: config.email.fromName
        ? `"${config.email.fromName}" <${config.email.from}>`
        : config.email.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    logger.info('E-mail envoyé', { to: message.to, messageId: info.messageId });
  }
}

export const emailSender = new EmailSender();

/** Message du code de vérification, en texte et en HTML. */
export function otpEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `Téranga — votre code de vérification : ${code}`,
    text:
      `Votre code de vérification Téranga est : ${code}\n\n` +
      `Il expire dans 10 minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#2B1605">` +
      `<h1 style="font-family:Georgia,serif;color:#5B2E0C;font-weight:400">Téranga</h1>` +
      `<p>Votre code de vérification :</p>` +
      `<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#B8691A;margin:24px 0">${code}</p>` +
      `<p style="color:#4A2A12">Il expire dans 10 minutes.</p>` +
      `<p style="color:#8a7566;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>` +
      `</div>`,
  };
}
