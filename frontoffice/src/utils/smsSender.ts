import { twilioSms } from './twilioSms';
import { orangeSms } from './orangeSms';
import { logger } from './logger';

/**
 * Envoi d'un SMS avec repli d'un fournisseur sur l'autre.
 *
 * Deux clients existaient déjà, mais `requestOtp` n'appelait que Twilio :
 * `orangeSms` n'était importé nulle part. Renseigner les identifiants Orange
 * ne changeait donc rien, et une panne Twilio bloquait toutes les inscriptions.
 *
 * L'ordre — Twilio puis Orange — reprend celui de la configuration existante.
 * Orange est l'opérateur pertinent en zone UEMOA : le garder en second donne
 * une redondance réelle, pas décorative.
 *
 * Un fournisseur non configuré est simplement absent de la chaîne ; il n'est
 * pas compté comme un échec.
 */

export interface SmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  sendSms(to: string, message: string): Promise<void>;
}

export interface SmsResult {
  /** Fournisseur qui a effectivement délivré le message. */
  provider: string;
  /** Fournisseurs ayant échoué avant lui, avec leur motif. */
  failures: { provider: string; error: string }[];
}

/** Chaîne par défaut. Injectable pour les tests. */
export const DEFAULT_PROVIDERS: SmsProvider[] = [
  { name: 'twilio', isConfigured: () => twilioSms.isConfigured(), sendSms: (t, m) => twilioSms.sendSms(t, m) },
  { name: 'orange', isConfigured: () => orangeSms.isConfigured(), sendSms: (t, m) => orangeSms.sendSms(t, m) },
];

export class SmsSender {
  constructor(private readonly providers: SmsProvider[] = DEFAULT_PROVIDERS) {}

  /** Fournisseurs réellement utilisables, dans l'ordre d'essai. */
  available(): SmsProvider[] {
    return this.providers.filter((p) => p.isConfigured());
  }

  /** Vrai si au moins un fournisseur peut envoyer. */
  isConfigured(): boolean {
    return this.available().length > 0;
  }

  /**
   * Essaie chaque fournisseur configuré jusqu'au premier succès.
   *
   * Lève si tous échouent — l'erreur porte le détail de chaque tentative, ce
   * qu'un simple « envoi impossible » ne permettrait pas de diagnostiquer.
   */
  async send(to: string, message: string): Promise<SmsResult> {
    const chain = this.available();
    if (chain.length === 0) {
      throw new Error('Aucun fournisseur SMS configuré');
    }

    const failures: { provider: string; error: string }[] = [];
    for (const provider of chain) {
      try {
        await provider.sendSms(to, message);
        if (failures.length > 0) {
          logger.warn('SMS délivré par un fournisseur de repli', {
            to,
            provider: provider.name,
            failures,
          });
        }
        return { provider: provider.name, failures };
      } catch (err) {
        const error = (err as Error).message || 'échec inconnu';
        failures.push({ provider: provider.name, error });
        logger.warn('Fournisseur SMS en échec, passage au suivant', {
          to,
          provider: provider.name,
          error,
        });
      }
    }

    const detail = failures.map((f) => `${f.provider}: ${f.error}`).join(' | ');
    throw new Error(`Tous les fournisseurs SMS ont échoué (${detail})`);
  }
}

export const smsSender = new SmsSender();
