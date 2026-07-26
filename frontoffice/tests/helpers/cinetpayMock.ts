/**
 * Simulateur de l'API CinetPay v2, branché à la place d'axios.
 *
 * Deux endpoints sont utilisés par `PaymentsService` :
 *   - POST /v2/payment        → initialisation (retourne payment_url + token)
 *   - POST /v2/payment/check  → statut de la transaction (source de vérité)
 *
 * Chaque test pilote la réponse via `cinetpay.init` / `cinetpay.check` et peut
 * inspecter ce qui a été réellement envoyé au provider via `cinetpay.calls`.
 */

export interface CinetPayCall {
  url: string;
  body: Record<string, any>;
}

export const cinetpay = {
  calls: [] as CinetPayCall[],

  /** Réponse de l'initialisation. `code` ≠ '201' déclenche l'erreur métier. */
  init: {
    code: '201',
    message: 'CREATED',
    paymentUrl: 'https://checkout.cinetpay.com/payment/TEST-TOKEN',
    paymentToken: 'CP-TEST-TOKEN',
  },
  /** Si non nul, l'appel d'initialisation lève une erreur réseau. */
  initNetworkError: null as string | null,

  /** Réponse de la vérification de statut (ACCEPTED / REFUSED / PENDING). */
  check: {
    status: 'PENDING' as string,
    amount: undefined as number | string | undefined,
    currency: undefined as string | undefined,
  },
  /** Si non nul, l'appel de vérification lève une erreur réseau. */
  checkNetworkError: null as string | null,

  /** Barrière consommée par le prochain appel `/check` (tests de concurrence). */
  checkGate: null as Promise<void> | null,

  /**
   * Bloque le PROCHAIN appel de vérification jusqu'à `release()`. Permet
   * d'ordonner précisément webhook et sondage pour tester la transition
   * atomique du paiement (cf. `completePayment`).
   */
  gateNextCheck() {
    let release!: () => void;
    this.checkGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { release };
  },

  /** Nombre d'appels reçus par endpoint. */
  countCalls(suffix: string) {
    return this.calls.filter((c) => c.url.endsWith(suffix)).length;
  },

  lastCall(suffix: string) {
    return [...this.calls].reverse().find((c) => c.url.endsWith(suffix));
  },

  reset() {
    this.calls = [];
    this.init = {
      code: '201',
      message: 'CREATED',
      paymentUrl: 'https://checkout.cinetpay.com/payment/TEST-TOKEN',
      paymentToken: 'CP-TEST-TOKEN',
    };
    this.initNetworkError = null;
    this.check = { status: 'PENDING', amount: undefined, currency: undefined };
    this.checkNetworkError = null;
    this.checkGate = null;
  },
};

/** Laisse s'exécuter toutes les micro-tâches en attente. */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const CHECK_URL = '/v2/payment/check';
const INIT_URL = '/v2/payment';

/** Faux module axios : seul `post` est utilisé par le service. */
export const fakeAxios = {
  async post(url: string, body: Record<string, any>, _opts?: unknown) {
    cinetpay.calls.push({ url, body });

    if (url.endsWith(CHECK_URL)) {
      if (cinetpay.checkGate) {
        const gate = cinetpay.checkGate;
        cinetpay.checkGate = null; // la barrière ne vaut que pour cet appel
        await gate;
      }
      if (cinetpay.checkNetworkError) throw new Error(cinetpay.checkNetworkError);
      return {
        data: {
          code: '00',
          data: {
            status: cinetpay.check.status,
            amount: cinetpay.check.amount,
            currency: cinetpay.check.currency,
          },
        },
      };
    }

    if (url.endsWith(INIT_URL)) {
      if (cinetpay.initNetworkError) throw new Error(cinetpay.initNetworkError);
      return {
        data: {
          code: cinetpay.init.code,
          message: cinetpay.init.message,
          data: {
            payment_url: cinetpay.init.paymentUrl,
            payment_token: cinetpay.init.paymentToken,
          },
        },
      };
    }

    throw new Error(`cinetpayMock: URL non simulée « ${url} »`);
  },

  async get(url: string) {
    throw new Error(`cinetpayMock: GET non simulé « ${url} »`);
  },
};
