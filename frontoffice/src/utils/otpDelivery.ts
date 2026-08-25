import { smsSender } from './smsSender';
import { emailSender, otpEmail } from './emailSender';
import { logger } from './logger';

/**
 * Acheminement du code de vérification, par e-mail ou par SMS.
 *
 * Même principe que la chaîne de fournisseurs SMS, d'un cran plus haut : on
 * essaie les canaux dans l'ordre et le premier qui aboutit gagne. Un canal non
 * configuré, ou sans destinataire utilisable, est simplement absent de la
 * chaîne — ce n'est pas un échec.
 *
 * L'e-mail passe en premier : il ne dépend d'aucun compte tiers payant, là où
 * le SMS suppose un fournisseur provisionné et, en compte d'essai, des numéros
 * destinataires vérifiés un à un.
 *
 * Le canal retenu est renvoyé à l'appelant, qui le consigne sur le code émis :
 * c'est lui qui déterminera, à la vérification, si l'on a prouvé la possession
 * du téléphone ou celle de l'adresse e-mail.
 */

export type OtpChannelName = 'email' | 'sms';

export interface OtpDestination {
  phone: string;
  email?: string | null;
}

export interface OtpDeliveryResult {
  channel: OtpChannelName;
  /** Détail du fournisseur ayant délivré (utile côté SMS, où il y a un repli). */
  provider?: string;
  failures: { channel: OtpChannelName; error: string }[];
}

interface Channel {
  name: OtpChannelName;
  usable(dest: OtpDestination): boolean;
  send(dest: OtpDestination, code: string): Promise<string | undefined>;
}

const CANAUX: Channel[] = [
  {
    name: 'email',
    usable: (dest) => Boolean(dest.email) && emailSender.isConfigured(),
    async send(dest, code) {
      const { subject, text, html } = otpEmail(code);
      await emailSender.send({ to: dest.email as string, subject, text, html });
      return 'smtp';
    },
  },
  {
    name: 'sms',
    usable: (dest) => Boolean(dest.phone) && smsSender.isConfigured(),
    async send(dest, code) {
      const texte = `Téranga : votre code de vérification est ${code}. Il expire dans 10 minutes.`;
      const { provider } = await smsSender.send(dest.phone, texte);
      return provider;
    },
  },
];

export class OtpDelivery {
  constructor(private readonly channels: Channel[] = CANAUX) {}

  /** Canaux réellement utilisables pour ce destinataire. */
  available(dest: OtpDestination): OtpChannelName[] {
    return this.channels.filter((c) => c.usable(dest)).map((c) => c.name);
  }

  isConfigured(dest: OtpDestination): boolean {
    return this.available(dest).length > 0;
  }

  /** Envoie le code par le premier canal qui aboutit. Lève si tous échouent. */
  async send(dest: OtpDestination, code: string): Promise<OtpDeliveryResult> {
    const utilisables = this.channels.filter((c) => c.usable(dest));
    if (utilisables.length === 0) {
      throw new Error('Aucun canal de vérification disponible');
    }

    const failures: { channel: OtpChannelName; error: string }[] = [];
    for (const canal of utilisables) {
      try {
        const provider = await canal.send(dest, code);
        if (failures.length > 0) {
          logger.warn('Code délivré par un canal de repli', { channel: canal.name, failures });
        }
        return { channel: canal.name, provider, failures };
      } catch (err) {
        failures.push({ channel: canal.name, error: (err as Error).message || 'échec inconnu' });
        logger.warn('Canal de vérification en échec, passage au suivant', {
          channel: canal.name,
          error: (err as Error).message,
        });
      }
    }

    const detail = failures.map((f) => `${f.channel}: ${f.error}`).join(' | ');
    throw new Error(`Aucun canal n'a pu délivrer le code (${detail})`);
  }
}

export const otpDelivery = new OtpDelivery();
