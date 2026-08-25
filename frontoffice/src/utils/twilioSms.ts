import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { logger } from './logger';

/**
 * Client de l'API Twilio Programmable Messaging — envoi des SMS OTP.
 *
 * Réf. : https://www.twilio.com/docs/sms/api/message-resource — flux simple :
 *   POST .../Accounts/{AccountSid}/Messages.json (Basic auth AccountSid:AuthToken,
 *   corps `application/x-www-form-urlencoded`). Un succès renvoie 201 avec le
 *   `sid` du message ; un échec renvoie un 4xx portant `{ code, message }`.
 *
 * Authentification : soit `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`
 * (recommandé — révocable isolément), soit `TWILIO_AUTH_TOKEN`. Dans les deux
 * cas `TWILIO_ACCOUNT_SID` reste obligatoire : il désigne le compte dans l'URL.
 *
 * ⚠️  L'envoi réel exige `TWILIO_ACCOUNT_SID`, un identifiant et un
 *     émetteur — soit `TWILIO_FROM` (numéro E.164), soit
 *     `TWILIO_MESSAGING_SERVICE_SID` (recommandé en Afrique de l'Ouest :
 *     Sender ID alphanumérique + routage par pays). Sans eux (dev local),
 *     `isConfigured()` renvoie false et l'appelant retombe sur une
 *     journalisation du code (cf. auth.service.requestOtp).
 *
 * L'`http` est injectable pour permettre des tests unitaires déterministes
 * (construction des requêtes) sans réseau ni identifiants.
 */

const API_BASE = 'https://api.twilio.com/2010-04-01';

/** Normalise un numéro au format E.164 attendu par Twilio (préfixe « + »). */
function e164(number: string): string {
  return number.startsWith('+') ? number : `+${number}`;
}

export class TwilioSmsClient {
  constructor(private readonly http: AxiosInstance = axios) {}

  /**
   * Couple Basic auth à présenter à Twilio, ou `null` si rien n'est utilisable.
   *
   * Une clé d'API (SK… + secret) l'emporte sur le jeton de compte : elle se
   * révoque isolément. Dans les deux cas l'Account SID reste requis — il
   * désigne le compte dans l'URL, il n'authentifie rien.
   */
  private credentials(): { user: string; pass: string } | null {
    const { accountSid, authToken, apiKeySid, apiKeySecret } = config.twilio;
    if (!accountSid) return null;
    if (apiKeySid && apiKeySecret) return { user: apiKeySid, pass: apiKeySecret };
    if (authToken) return { user: accountSid, pass: authToken };
    return null;
  }

  /** Vrai si les identifiants et un émetteur (numéro ou service) sont présents. */
  isConfigured(): boolean {
    const { from, messagingServiceSid } = config.twilio;
    return Boolean(this.credentials() && (from || messagingServiceSid));
  }

  /**
   * Envoie un SMS. Lève si l'API refuse la requête (avec le code Twilio quand
   * il est disponible : ex. 21211 numéro invalide, 21608 numéro non vérifié en
   * compte d'essai).
   * @param to Numéro destinataire E.164 (ex. +229981234567).
   */
  async sendSms(to: string, message: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Twilio: identifiants ou émetteur non configurés');
    }

    const { accountSid, from, messagingServiceSid } = config.twilio;
    const creds = this.credentials()!;
    // L'Account SID désigne le compte dans le chemin, même quand on
    // s'authentifie avec une clé d'API.
    const url = `${API_BASE}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const basic = Buffer.from(`${creds.user}:${creds.pass}`).toString('base64');

    const form = new URLSearchParams();
    form.set('To', e164(to));
    // Un Messaging Service prime sur un numéro émetteur brut s'il est fourni.
    if (messagingServiceSid) {
      form.set('MessagingServiceSid', messagingServiceSid);
    } else {
      form.set('From', e164(from));
    }
    form.set('Body', message);

    try {
      const res = await this.http.post(url, form.toString(), {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 15_000,
      });
      logger.info('SMS envoyé via Twilio', {
        to,
        sid: res.data?.sid,
        status: res.data?.status,
      });
    } catch (err) {
      // Twilio renvoie un 4xx avec un corps { code, message } exploitable ;
      // on le fait remonter pour un diagnostic clair côté journal.
      const data = (err as { response?: { data?: { code?: number; message?: string } } })
        ?.response?.data;
      if (data?.message) {
        throw new Error(`Twilio ${data.code ?? ''}: ${data.message}`.trim());
      }
      throw err;
    }
  }
}

export const twilioSms = new TwilioSmsClient();
