/**
 * Téranga — Référentiel Mobile Money zone UEMOA / F CFA (XOF).
 *
 * Source de vérité unique pour :
 *   - la liste des opérateurs valides (enum Prisma `PaymentMethod`) ;
 *   - la disponibilité par pays (filtrage exposé au client) ;
 *   - le mapping vers les canaux CinetPay ;
 *   - la validation du numéro (indicatif pays E.164).
 *
 * ⚠️  La disponibilité opérateur↔pays et les canaux CinetPay doivent être
 *     confirmés avec la configuration réelle du compte CinetPay avant la mise
 *     en production. Tout est centralisé ici pour être ajusté à un seul endroit.
 */

export type PaymentMethodKey =
  | 'ORANGE_MONEY'
  | 'WAVE'
  | 'MTN_MOMO'
  | 'MOOV_MONEY'
  | 'FREE_MONEY'
  | 'WIZALL'
  | 'CARD'
  | 'CARRIER_BILLING'
  | 'PAYPAL'
  | 'BANK_TRANSFER';

/** Canal attendu par l'API CinetPay v2 (champ `channels`). */
type CinetPayChannel =
  | 'MOBILE_MONEY'
  | 'WALLET'
  | 'CREDIT_CARD'
  | 'CARRIER_BILLING'
  | 'ALL'
  | 'PAYPAL'
  | 'BANK_TRANSFER';

interface OperatorMeta {
  label: string;
  channel: CinetPayChannel;
  /** true = portefeuille mobile money (numéro requis), false = carte/facturation. */
  isMobileMoney: boolean;
}

export const OPERATORS: Record<PaymentMethodKey, OperatorMeta> = {
  ORANGE_MONEY: { label: 'Orange Money', channel: 'MOBILE_MONEY', isMobileMoney: true },
  WAVE: { label: 'Wave', channel: 'WALLET', isMobileMoney: true },
  MTN_MOMO: { label: 'MTN MoMo', channel: 'MOBILE_MONEY', isMobileMoney: true },
  MOOV_MONEY: { label: 'Moov Money', channel: 'MOBILE_MONEY', isMobileMoney: true },
  FREE_MONEY: { label: 'Free Money', channel: 'MOBILE_MONEY', isMobileMoney: true },
  WIZALL: { label: 'Wizall Money', channel: 'MOBILE_MONEY', isMobileMoney: true },
  CARD: { label: 'Carte bancaire', channel: 'CREDIT_CARD', isMobileMoney: false },
  CARRIER_BILLING: { label: 'Facturation opérateur', channel: 'CARRIER_BILLING', isMobileMoney: true },
  // PayPal : hors CinetPay (flux de redirection propre), facturé en EUR.
  PAYPAL: { label: 'PayPal', channel: 'PAYPAL', isMobileMoney: false },
  // Virement bancaire (SEPA/EUR) : hors CinetPay, validation manuelle par un
  // admin après réception. Le `channel` n'est jamais transmis à CinetPay.
  BANK_TRANSFER: { label: 'Virement bancaire', channel: 'BANK_TRANSFER', isMobileMoney: false },
};

/**
 * Pays de la zone F CFA (XOF) desservis, avec :
 *   - `dialingCode` : indicatif international (validation du numéro) ;
 *   - `operators`   : portefeuilles mobile money réellement disponibles.
 *
 * `CARD` est ajouté automatiquement partout (voir `operatorsForCountry`).
 */
interface CountryMeta {
  name: string;
  dialingCode: string; // sans le '+'
  operators: PaymentMethodKey[];
}

export const XOF_COUNTRIES: Record<string, CountryMeta> = {
  SN: { name: 'Sénégal', dialingCode: '221', operators: ['ORANGE_MONEY', 'WAVE', 'FREE_MONEY', 'WIZALL'] },
  CI: { name: "Côte d'Ivoire", dialingCode: '225', operators: ['ORANGE_MONEY', 'MTN_MOMO', 'MOOV_MONEY', 'WAVE', 'WIZALL'] },
  ML: { name: 'Mali', dialingCode: '223', operators: ['ORANGE_MONEY', 'MOOV_MONEY', 'WAVE'] },
  BF: { name: 'Burkina Faso', dialingCode: '226', operators: ['ORANGE_MONEY', 'MOOV_MONEY', 'WAVE'] },
  BJ: { name: 'Bénin', dialingCode: '229', operators: ['MTN_MOMO', 'MOOV_MONEY', 'WAVE'] },
  TG: { name: 'Togo', dialingCode: '228', operators: ['MOOV_MONEY', 'WAVE'] },
  NE: { name: 'Niger', dialingCode: '227', operators: ['ORANGE_MONEY', 'MOOV_MONEY'] },
  GW: { name: 'Guinée-Bissau', dialingCode: '245', operators: ['ORANGE_MONEY', 'WAVE'] },
};

/** Vrai si le pays (code ISO-2) est desservi en zone XOF. */
export function isXofCountry(country: string): boolean {
  return !!XOF_COUNTRIES[country?.toUpperCase()];
}

/**
 * Opérateurs proposables pour un pays : mobile money du pays + carte bancaire.
 * Retourne [] si le pays n'est pas desservi.
 */
export function operatorsForCountry(country: string): PaymentMethodKey[] {
  const meta = XOF_COUNTRIES[country?.toUpperCase()];
  if (!meta) return [];
  // Carte et PayPal proposés partout (PayPal facturé en EUR, utile diaspora).
  return [...meta.operators, 'CARD', 'PAYPAL'];
}

/** Vrai si `method` est disponible dans `country`. */
export function isMethodAvailable(country: string, method: PaymentMethodKey): boolean {
  return operatorsForCountry(country).includes(method);
}

/** Indicatif international (`+221`…) d'un pays desservi, ou null hors zone. */
export function dialingCodeForCountry(country: string): string | null {
  const meta = XOF_COUNTRIES[country?.toUpperCase()];
  return meta ? `+${meta.dialingCode}` : null;
}

/** Canal CinetPay pour un moyen de paiement. */
export function cinetpayChannel(method: PaymentMethodKey): CinetPayChannel {
  return OPERATORS[method]?.channel ?? 'ALL';
}

/** Libellé lisible d'un moyen de paiement. */
export function methodLabel(method: PaymentMethodKey): string {
  return OPERATORS[method]?.label ?? method;
}

/**
 * Valide qu'un numéro E.164 correspond bien à l'indicatif du pays.
 * Pour la carte bancaire, le numéro n'est pas contraint à l'indicatif.
 */
export function isPhoneValidForCountry(country: string, phone: string, method: PaymentMethodKey): boolean {
  if (!OPERATORS[method]?.isMobileMoney) return true; // carte : pas de contrainte d'indicatif
  const meta = XOF_COUNTRIES[country?.toUpperCase()];
  if (!meta) return false;
  return phone.startsWith(`+${meta.dialingCode}`);
}

/** Catalogue complet pays → opérateurs (métadonnées client). */
export function methodsCatalog() {
  return Object.entries(XOF_COUNTRIES).map(([code, meta]) => ({
    country: code,
    name: meta.name,
    dialingCode: `+${meta.dialingCode}`,
    methods: operatorsForCountry(code).map((m) => ({
      method: m,
      label: methodLabel(m),
      isMobileMoney: OPERATORS[m].isMobileMoney,
    })),
  }));
}
