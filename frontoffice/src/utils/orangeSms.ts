import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from './logger';

/**
 * Client de l'API Orange SMS (zone Afrique de l'Ouest).
 *
 * Réf. : https://developer.orange.com/apis/sms — flux en deux temps :
 *   1. OAuth2 « client_credentials » → jeton d'accès (valide 1 h) ;
 *   2. POST outbound → envoi du SMS depuis un numéro émetteur provisionné.
 *
 * ⚠️  L'envoi réel exige `ORANGE_SMS_CLIENT_ID`, `ORANGE_SMS_CLIENT_SECRET` et
 *     `ORANGE_SMS_SENDER_NUMBER`. Sans eux (dev local), `isConfigured()` renvoie
 *     false et l'appelant retombe sur une journalisation du code (cf.
 *     auth.service.requestOtp). Le jeton OAuth est mis en cache jusqu'à sa
 *     quasi-expiration pour éviter un aller-retour par SMS.
 *
 * L'`http` est injectable pour permettre des tests unitaires déterministes
 * (construction des requêtes) sans réseau ni identifiants.
 */

const TOKEN_URL = 'https://api.orange.com/oauth/v3/token';
const OUTBOUND_BASE = 'https://api.orange.com/smsmessaging/v1/outbound';

/** Encode un numéro émetteur en segment d'URL `tel:+…` (ex. tel%3A%2B221771234567). */
function senderPath(senderNumber: string): string {
  const e164 = senderNumber.startsWith('+') ? senderNumber : `+${senderNumber}`;
  return encodeURIComponent(`tel:${e164}`);
}

/** Normalise un numéro au format `tel:+…` attendu par le corps de la requête. */
function telAddress(number: string): string {
  const e164 = number.startsWith('+') ? number : `+${number}`;
  return `tel:${e164}`;
}

export class OrangeSmsClient {
  private tokenCache: { value: string; expiresAt: number } | null = null;

  constructor(private readonly http: AxiosInstance = axios) {}

  /** Vrai si les identifiants et le numéro émetteur sont présents. */
  isConfigured(): boolean {
    const { clientId, clientSecret, senderNumber } = config.orangeSms;
    return Boolean(clientId && clientSecret && senderNumber);
  }

  /**
   * Récupère un jeton d'accès OAuth2 (mis en cache jusqu'à ~1 min avant
   * l'expiration annoncée).
   */
  async getAccessToken(now = Date.now()): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > now) {
      return this.tokenCache.value;
    }

    const { clientId, clientSecret } = config.orangeSms;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await this.http.post(
      TOKEN_URL,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 10_000,
      },
    );

    const token: string | undefined = res.data?.access_token;
    if (!token) throw new Error('Orange SMS: réponse OAuth sans access_token');

    // expires_in est en secondes ; on garde une marge de 60 s.
    const ttlMs = Math.max(0, (Number(res.data.expires_in) || 3600) - 60) * 1000;
    this.tokenCache = { value: token, expiresAt: now + ttlMs };
    return token;
  }

  /**
   * Envoie un SMS. Lève si l'API refuse la requête.
   * @param to Numéro destinataire E.164 (ex. +221771234567).
   */
  async sendSms(to: string, message: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Orange SMS: identifiants ou numéro émetteur non configurés');
    }

    const token = await this.getAccessToken();
    const { senderNumber, senderName } = config.orangeSms;
    const url = `${OUTBOUND_BASE}/${senderPath(senderNumber)}/requests`;

    const body: Record<string, unknown> = {
      outboundSMSMessageRequest: {
        address: telAddress(to),
        senderAddress: telAddress(senderNumber),
        outboundSMSTextMessage: { message },
      },
    };
    // Nom d'expéditeur alphanumérique (si whitelisté côté Orange).
    if (senderName) {
      (body.outboundSMSMessageRequest as any).senderName = senderName;
    }

    await this.http.post(url, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15_000,
    });

    logger.info('SMS envoyé via Orange', { to });
  }
}

export const orangeSms = new OrangeSmsClient();
