import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

/**
 * Intégration PayPal — « Paiements Standard » (bouton _xclick + IPN).
 *
 * Choix assumé : l'email marchand suffit (aucune clé API à créer), au prix
 * d'une méthode plus ancienne que l'API REST. L'utilisateur est redirigé vers
 * PayPal ; la confirmation arrive de façon asynchrone via une notification IPN
 * que l'on VALIDE en renvoyant le message brut, inchangé, à PayPal.
 *
 * Devise : le F CFA (XOF) n'est pas supporté par PayPal. On facture en EUR au
 * taux FIXE de la parité CFA (655,957 XOF = 1 €, garanti) : conversion exacte,
 * sans risque de change.
 *
 * Réf. : PayPal IPN — « Your listener HTTPS POSTs the complete, unaltered
 * message back to https://ipnpb.paypal.com/cgi-bin/webscr », préfixé de
 * `cmd=_notify-validate`, réponse « VERIFIED » ou « INVALID ».
 */

/** Parité fixe franc CFA (UEMOA) ↔ euro. */
export const XOF_PER_EUR = 655.957;

/** Convertit un montant XOF en EUR (chaîne à 2 décimales, format PayPal). */
export function xofToEur(amountXof: number): string {
  return (amountXof / XOF_PER_EUR).toFixed(2);
}

const REDIRECT_HOST = {
  live: 'https://www.paypal.com/cgi-bin/webscr',
  sandbox: 'https://www.sandbox.paypal.com/cgi-bin/webscr',
};
const IPN_VALIDATION_HOST = {
  live: 'https://ipnpb.paypal.com/cgi-bin/webscr',
  sandbox: 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr',
};

export interface PayPalRedirectParams {
  providerRef: string; // reporté dans `custom`, corrèle l'IPN au paiement
  amountEur: string; // ex. '32.01'
  itemName: string;
  notifyUrl: string;
  returnUrl: string;
  cancelUrl: string;
}

export class PayPalClient {
  constructor(private readonly http: AxiosInstance = axios) {}

  private get mode(): 'live' | 'sandbox' {
    return config.paypal.env === 'live' ? 'live' : 'sandbox';
  }

  isLive(): boolean {
    return this.mode === 'live';
  }

  /** Construit l'URL de redirection PayPal (_xclick) vers laquelle envoyer l'utilisateur. */
  buildRedirectUrl(p: PayPalRedirectParams): string {
    const params = new URLSearchParams({
      cmd: '_xclick',
      business: config.paypal.email,
      currency_code: config.paypal.currency,
      amount: p.amountEur,
      item_name: p.itemName,
      custom: p.providerRef,
      no_shipping: '1', // bien numérique : pas d'adresse de livraison
      notify_url: p.notifyUrl,
      return: p.returnUrl,
      cancel_return: p.cancelUrl,
    });
    return `${REDIRECT_HOST[this.mode]}?${params.toString()}`;
  }

  /**
   * Valide une notification IPN : renvoie le message BRUT (inchangé) à PayPal,
   * préfixé de `cmd=_notify-validate`. PayPal répond « VERIFIED » ou « INVALID ».
   */
  async verifyIpn(rawBody: string): Promise<boolean> {
    const res = await this.http.post(
      IPN_VALIDATION_HOST[this.mode],
      `cmd=_notify-validate&${rawBody}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Teranga-IPN/1.0',
        },
        timeout: 10_000,
      },
    );
    return String(res.data).trim() === 'VERIFIED';
  }
}

export const paypal = new PayPalClient();
