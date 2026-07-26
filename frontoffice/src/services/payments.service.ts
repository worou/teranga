import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { addMonths, monthsForPlan } from '../utils/helpers';
import { logger } from '../utils/logger';
import { verifyCinetPayHmac } from '../utils/cinetpay';
import { paypal, xofToEur } from '../utils/paypal';
import {
  PaymentMethodKey,
  cinetpayChannel,
  methodLabel,
  isXofCountry,
  isMethodAvailable,
  isPhoneValidForCountry,
  operatorsForCountry,
  dialingCodeForCountry,
  OPERATORS,
} from '../config/mobileMoney';

type PlanKey = 'DISCOVERY' | 'STANDARD' | 'ENGAGEMENT';

export class PaymentsService {
  getCatalog() {
    return {
      DISCOVERY: { ...config.pricing.DISCOVERY, currency: 'XOF' },
      STANDARD: { ...config.pricing.STANDARD, currency: 'XOF' },
      ENGAGEMENT: { ...config.pricing.ENGAGEMENT, currency: 'XOF' },
    };
  }

  /** Moyens de paiement disponibles pour l'utilisateur (selon son pays). */
  async getMethodsForUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    if (!user) throw AppError.notFound();
    return this.getMethodsForCountry(user.country);
  }

  /** Vrai si le virement bancaire est configuré (IBAN renseigné). */
  private bankTransferEnabled(): boolean {
    return Boolean(config.bankTransfer.iban);
  }

  /** Moyens de paiement disponibles pour un pays donné (code ISO-2). */
  getMethodsForCountry(country: string) {
    const methods = operatorsForCountry(country).map((m) => ({
      method: m,
      label: methodLabel(m),
      isMobileMoney: OPERATORS[m].isMobileMoney,
    }));

    // Virement bancaire : proposé à tous les pays desservis, uniquement s'il est
    // configuré (IBAN présent). Facturé en EUR (SEPA) ; validation manuelle.
    if (isXofCountry(country) && this.bankTransferEnabled()) {
      methods.push({
        method: 'BANK_TRANSFER',
        label: methodLabel('BANK_TRANSFER'),
        isMobileMoney: OPERATORS.BANK_TRANSFER.isMobileMoney,
      });
    }

    return {
      country: country?.toUpperCase(),
      supported: isXofCountry(country),
      dialingCode: dialingCodeForCountry(country),
      methods,
    };
  }

  /**
   * Initialize a payment flow.
   * For Mobile Money: returns instructions to validate USSD.
   * For Card: returns a hosted payment URL.
   */
  async initiate(
    userId: string,
    plan: PlanKey,
    method: PaymentMethodKey,
    phoneNumber: string | undefined,
    autoRenew = true,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound();

    const priceInfo = config.pricing[plan];
    if (!priceInfo) throw AppError.badRequest('Plan invalide');

    // Zone F CFA (XOF) requise pour tous les moyens.
    if (!isXofCountry(user.country)) {
      throw AppError.badRequest(
        "Le paiement n'est disponible que dans la zone F CFA (UEMOA) pour le moment.",
      );
    }

    // Le virement bancaire est hors CinetPay et sans numéro : on saute les
    // contrôles opérateur/indicatif, mais il doit être configuré (IBAN).
    if (method === 'BANK_TRANSFER') {
      if (!this.bankTransferEnabled()) {
        throw AppError.badRequest("Le virement bancaire n'est pas disponible pour le moment.");
      }
    } else {
      if (!isMethodAvailable(user.country, method)) {
        throw AppError.badRequest(`${methodLabel(method)} n'est pas disponible dans votre pays.`);
      }
      if (!isPhoneValidForCountry(user.country, phoneNumber ?? '', method)) {
        throw AppError.badRequest(
          "Le numéro fourni ne correspond pas à l'indicatif de votre pays.",
        );
      }
    }

    // Create pending payment row. PayPal et virement sont facturés en EUR.
    const billedInEur = method === 'PAYPAL' || method === 'BANK_TRANSFER';
    const payment = await prisma.payment.create({
      data: {
        userId,
        plan,
        method,
        status: 'PENDING',
        amountFcfa: priceInfo.amount,
        currency: billedInEur ? 'EUR' : 'XOF',
        autoRenew,
        phoneNumber: method === 'BANK_TRANSFER' ? null : (phoneNumber ?? null),
        providerRef: `TERANGA-${Date.now()}-${uuid().slice(0, 8)}`,
      },
    });

    // PayPal : flux de redirection propre (hors CinetPay), facturé en EUR.
    if (method === 'PAYPAL') {
      return this.initiatePayPal(payment.id, payment.providerRef!, plan);
    }

    // Virement bancaire : on renvoie les coordonnées et la référence à indiquer.
    // Le paiement reste PENDING jusqu'à validation manuelle par un admin.
    if (method === 'BANK_TRANSFER') {
      return this.initiateBankTransfer(payment.id, payment.providerRef!, plan);
    }

    // Call CinetPay API (or similar)
    try {
      const response = await this.callCinetPay({
        transaction_id: payment.providerRef!,
        amount: priceInfo.amount,
        currency: 'XOF',
        description: `Abonnement Téranga ${plan} - ${priceInfo.months} mois`,
        customer_phone_number: phoneNumber,
        customer_email: user.email || '',
        customer_name: user.firstName,
        customer_surname: user.lastName || '',
        channels: cinetpayChannel(method),
        notify_url: config.cinetpay.notifyUrl,
        return_url: config.cinetpay.returnUrl,
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PROCESSING',
          cinetpayTxId: response.cinetpayTxId,
        },
      });

      return {
        paymentId: payment.id,
        paymentUrl: response.paymentUrl || null,
        ussdInstruction: OPERATORS[method].isMobileMoney
          ? `Validez la demande sur votre téléphone ${phoneNumber} avec votre code secret ${methodLabel(method)}.`
          : undefined,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      };
    } catch (err) {
      logger.error('Payment init failed', { error: (err as Error).message, paymentId: payment.id });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: (err as Error).message },
      });
      throw AppError.badRequest('Impossible d\'initier le paiement. Réessayez.');
    }
  }

  /**
   * CinetPay webhook handler — confirms payment and activates subscription.
   *
   * Sécurité : on ne fait JAMAIS confiance au corps de la notification.
   *   1. On vérifie la signature HMAC (en-tête `x-token`) si la clé secrète
   *      est configurée.
   *   2. On ré-interroge CinetPay (API `check`) comme source de vérité.
   *   3. On contrôle que le montant/devise payés correspondent au plan.
   * L'activation est atomique et idempotente (cf. `completePayment`).
   */
  async handleWebhook(payload: any, xToken?: string) {
    logger.info('CinetPay webhook received', { cpm_trans_id: payload?.cpm_trans_id });

    const providerRef = payload?.cpm_trans_id || payload?.transaction_id;
    if (!providerRef) throw AppError.badRequest('Webhook sans identifiant');

    const payment = await prisma.payment.findUnique({ where: { providerRef } });
    if (!payment) throw AppError.notFound('Paiement introuvable');

    // Idempotence : notification déjà traitée / paiement déjà terminal.
    if (payment.webhookReceived || payment.status === 'COMPLETED' || payment.status === 'FAILED') {
      return { alreadyProcessed: true, status: payment.status };
    }

    const isDevMock = config.env === 'development' && !config.cinetpay.apiKey;
    let accepted: boolean;
    let failureReason: string | null = null;

    if (isDevMock) {
      // Mode dev sans clés : on se base sur le corps (tests locaux).
      accepted = payload.cpm_result === '00' || payload.cpm_error_message === 'SUCCES';
      failureReason = accepted ? null : payload.cpm_error_message || 'Paiement refusé (mock)';
    } else {
      // 1. Authenticité : signature HMAC.
      if (config.cinetpay.secretKey && !verifyCinetPayHmac(payload, xToken, config.cinetpay.secretKey)) {
        logger.warn('CinetPay webhook: signature HMAC invalide', { providerRef });
        throw AppError.unauthorized('Signature du webhook invalide');
      }
      // 2. Source de vérité : ré-interrogation de CinetPay.
      const remote = await this.fetchCinetPayStatus(providerRef);
      accepted = remote.status === 'ACCEPTED';
      if (accepted) {
        // 3. Contrôle montant + devise contre le plan attendu.
        const expected = config.pricing[payment.plan as PlanKey]?.amount;
        const paidAmount = remote.amount ?? Number(payload.cpm_amount);
        const paidCurrency = remote.currency ?? payload.cpm_currency;
        if (expected == null || paidAmount !== expected || (paidCurrency && paidCurrency !== 'XOF')) {
          logger.warn('CinetPay webhook: montant/devise incohérent', {
            providerRef, expected, paidAmount, paidCurrency,
          });
          accepted = false;
          failureReason = 'Montant ou devise du paiement incohérent';
        }
      } else {
        failureReason = "Paiement refusé par l'opérateur";
      }
    }

    if (accepted) {
      const won = await this.completePayment(payment.id);
      if (won) {
        await this.activateSubscription(
          payment.userId,
          payment.plan as PlanKey,
          payment.id,
          payment.autoRenew,
        );
      }
    } else {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason },
      });
    }

    // Trace de la notification (indépendante de la transition d'état).
    await prisma.payment.update({
      where: { id: payment.id },
      data: { webhookReceived: true, webhookPayload: payload },
    });

    return { processed: true, status: accepted ? 'COMPLETED' : 'FAILED' };
  }

  /**
   * Manual check of payment status (polling fallback if webhook lost).
   */
  async checkStatus(userId: string, paymentId: string) {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, userId } });
    if (!payment) throw AppError.notFound();

    // PayPal (IPN) et virement bancaire (validation admin) n'ont pas d'API de
    // statut CinetPay : le sondage se contente de relire la ligne persistée.
    if (payment.method === 'PAYPAL' || payment.method === 'BANK_TRANSFER') {
      return payment;
    }

    // If still processing, call CinetPay to check
    if (payment.status === 'PROCESSING' && payment.providerRef) {
      try {
        const remote = await this.fetchCinetPayStatus(payment.providerRef);
        if (remote.status === 'ACCEPTED') {
          const expected = config.pricing[payment.plan as PlanKey]?.amount;
          const paidAmount = remote.amount ?? expected;
          if (expected != null && paidAmount === expected) {
            const won = await this.completePayment(payment.id);
            if (won) {
              await this.activateSubscription(userId, payment.plan as PlanKey, paymentId, payment.autoRenew);
            }
          } else {
            await prisma.payment.updateMany({
              where: { id: paymentId, status: { in: ['PENDING', 'PROCESSING'] } },
              data: { status: 'FAILED', failureReason: 'Montant du paiement incohérent' },
            });
          }
        } else if (remote.status === 'REFUSED') {
          await prisma.payment.updateMany({
            where: { id: paymentId, status: { in: ['PENDING', 'PROCESSING'] } },
            data: { status: 'FAILED', failureReason: "Refusé par l'opérateur" },
          });
        }
      } catch (err) {
        logger.warn('CinetPay status check failed', { paymentId, error: (err as Error).message });
      }
    }

    return prisma.payment.findUnique({ where: { id: paymentId } });
  }

  /**
   * List a user's payments (history).
   */
  async listForUser(userId: string) {
    return prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==================== PAYPAL (Paiements Standard) ====================

  /** Dev sans compte PayPal réel : on simule l'IPN localement. */
  private isPayPalDevMock(): boolean {
    return config.env === 'development' && config.paypal.env !== 'live';
  }

  /**
   * Prépare une redirection PayPal (ou son simulateur en dev) pour un paiement
   * déjà créé. Le montant est converti en EUR (parité fixe CFA).
   */
  private async initiatePayPal(paymentId: string, providerRef: string, plan: PlanKey) {
    const amountEur = xofToEur(config.pricing[plan].amount);
    const notifyUrl = `${config.apiBaseUrl}/api/v1/payments/webhook/paypal`;

    const paymentUrl = this.isPayPalDevMock()
      ? // Dev : URL locale qui déclenche une IPN simulée (cf. mockPayPalComplete).
        `${config.apiBaseUrl}/api/v1/payments/webhook/paypal/mock?pid=${paymentId}`
      : paypal.buildRedirectUrl({
          providerRef,
          amountEur,
          itemName: `Abonnement Téranga ${plan} — ${config.pricing[plan].months} mois`,
          notifyUrl,
          returnUrl: `${config.paypal.returnUrl}&pid=${paymentId}`,
          cancelUrl: config.paypal.cancelUrl,
        });

    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'PROCESSING' } });

    return {
      paymentId,
      paymentUrl,
      amountEur,
      currency: 'EUR',
      // La fenêtre PayPal reste ouverte plus longtemps que l'USSD mobile money.
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  /**
   * Traite une notification IPN PayPal.
   *
   * Sécurité (identique à l'esprit du webhook CinetPay) :
   *   1. Authenticité : on RENVOIE le message brut à PayPal (« VERIFIED »).
   *   2. Cohérence : statut « Completed », destinataire = notre email marchand,
   *      montant + devise = prix EUR attendu du plan, référence = `custom`.
   * L'activation est atomique et idempotente (cf. completePayment).
   */
  async handlePayPalIpn(payload: any, rawBody: string) {
    const providerRef = payload?.custom;
    if (!providerRef) throw AppError.badRequest('Notification PayPal sans référence');

    const payment = await prisma.payment.findUnique({ where: { providerRef } });
    if (!payment) throw AppError.notFound('Paiement introuvable');

    if (payment.webhookReceived || payment.status === 'COMPLETED' || payment.status === 'FAILED') {
      return { alreadyProcessed: true, status: payment.status };
    }

    // 1. Authenticité (sauf simulateur de dev).
    if (!this.isPayPalDevMock()) {
      const verified = await paypal.verifyIpn(rawBody);
      if (!verified) {
        logger.warn('IPN PayPal non validée (INVALID)', { providerRef });
        throw AppError.unauthorized('Notification PayPal invalide');
      }
    }

    // 2. Cohérence des montants / destinataire / statut.
    const expectedEur = xofToEur(config.pricing[payment.plan as PlanKey].amount);
    const okStatus = payload.payment_status === 'Completed';
    const okReceiver =
      String(payload.receiver_email || '').toLowerCase() === config.paypal.email.toLowerCase();
    const okCurrency = payload.mc_currency === config.paypal.currency;
    const okAmount = String(payload.mc_gross) === expectedEur;
    const accepted = okStatus && okReceiver && okCurrency && okAmount;

    let failureReason: string | null = null;
    if (!accepted) {
      failureReason = !okStatus
        ? `Paiement PayPal non abouti (${payload.payment_status})`
        : 'Montant, devise ou destinataire PayPal incohérent';
      logger.warn('IPN PayPal refusée', { providerRef, okStatus, okReceiver, okCurrency, okAmount });
    }

    if (accepted) {
      const won = await this.completePayment(payment.id);
      if (won) {
        await this.activateSubscription(
          payment.userId,
          payment.plan as PlanKey,
          payment.id,
          payment.autoRenew,
        );
      }
    } else {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason },
      });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { webhookReceived: true, webhookPayload: payload, providerTxId: payload.txn_id ?? null },
    });

    return { processed: true, status: accepted ? 'COMPLETED' : 'FAILED' };
  }

  /**
   * Dev uniquement : simule la réception d'une IPN « Completed » pour un
   * paiement PayPal, en passant par le VRAI chemin de traitement.
   */
  async mockPayPalComplete(paymentId: string) {
    if (!this.isPayPalDevMock()) throw AppError.forbidden('Simulateur indisponible');
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('Paiement introuvable');

    const payload = {
      custom: payment.providerRef,
      payment_status: 'Completed',
      receiver_email: config.paypal.email,
      mc_gross: xofToEur(config.pricing[payment.plan as PlanKey].amount),
      mc_currency: config.paypal.currency,
      txn_id: `MOCK-${Date.now()}`,
    };
    return this.handlePayPalIpn(payload, '');
  }

  // ==================== VIREMENT BANCAIRE (SEPA / EUR) ====================

  /**
   * Prépare un paiement par virement : renvoie les coordonnées bancaires et la
   * référence (à reporter en motif du virement). Le paiement reste PENDING —
   * l'abonnement n'est activé qu'après validation manuelle d'un admin qui a
   * constaté la réception des fonds (cf. confirmBankTransfer).
   */
  private initiateBankTransfer(paymentId: string, providerRef: string, plan: PlanKey) {
    const amountFcfa = config.pricing[plan].amount;
    return {
      paymentId,
      paymentUrl: null,
      bankTransfer: {
        beneficiary: config.bankTransfer.beneficiary,
        iban: config.bankTransfer.iban,
        bic: config.bankTransfer.bic,
        bankName: config.bankTransfer.bankName,
        // Motif OBLIGATOIRE du virement : permet à l'admin de rapprocher.
        reference: providerRef,
        amountEur: xofToEur(amountFcfa),
        amountFcfa,
        currency: 'EUR',
      },
      // Un virement peut prendre plusieurs jours ouvrés : fenêtre large.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Validation manuelle (admin) d'un virement reçu : passe le paiement en
   * COMPLETED et active l'abonnement. Idempotent et réservé au virement.
   * Réutilise `completePayment` + `activateSubscription` (source unique).
   */
  async confirmBankTransfer(paymentId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (payment.method !== 'BANK_TRANSFER') {
      throw AppError.badRequest("Ce paiement n'est pas un virement bancaire.");
    }
    if (payment.status === 'COMPLETED') {
      return { alreadyProcessed: true, status: 'COMPLETED' as const };
    }
    if (payment.status === 'FAILED' || payment.status === 'REFUNDED') {
      throw AppError.badRequest('Ce paiement ne peut plus être confirmé.');
    }

    const won = await this.completePayment(payment.id);
    if (won) {
      await this.activateSubscription(
        payment.userId,
        payment.plan as PlanKey,
        payment.id,
        payment.autoRenew,
      );
    }
    logger.info('Bank transfer confirmed', { paymentId, userId: payment.userId });
    return { processed: true, status: 'COMPLETED' as const };
  }

  /**
   * Rejet manuel (admin) d'un virement non reçu : marque le paiement FAILED.
   * N'active jamais d'abonnement.
   */
  async rejectBankTransfer(paymentId: string, reason?: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    if (payment.method !== 'BANK_TRANSFER') {
      throw AppError.badRequest("Ce paiement n'est pas un virement bancaire.");
    }
    if (payment.status === 'COMPLETED') {
      throw AppError.badRequest('Paiement déjà confirmé, impossible de le rejeter.');
    }
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'FAILED', failureReason: reason || 'Virement non reçu' },
    });
    logger.info('Bank transfer rejected', { paymentId, reason });
    return { processed: true, status: 'FAILED' as const };
  }

  /**
   * Transition atomique PENDING/PROCESSING → COMPLETED.
   * Renvoie `true` uniquement si CET appel a remporté la transition, ce qui
   * garantit qu'`activateSubscription` ne s'exécute qu'une seule fois même si
   * le webhook et le polling arrivent en concurrence (pas de double prolongation).
   */
  private async completePayment(paymentId: string): Promise<boolean> {
    const res = await prisma.payment.updateMany({
      where: { id: paymentId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return res.count === 1;
  }

  /**
   * Activate subscription after successful payment (extends if already active).
   */
  private async activateSubscription(
    userId: string,
    plan: PlanKey,
    paymentId: string,
    autoRenew: boolean,
  ) {
    const months = monthsForPlan(plan);
    const now = new Date();

    const existing = await prisma.subscription.findUnique({ where: { userId } });

    // If user already has active subscription, extend from its expiry.
    const baseDate = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
    const newExpiresAt = addMonths(baseDate, months);

    const sub = await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: 'ACTIVE',
        startsAt: now,
        expiresAt: newExpiresAt,
        autoRenew,
        lastReminderAt: null,
      },
      update: {
        plan,
        status: 'ACTIVE',
        startsAt: existing?.status === 'ACTIVE' ? existing.startsAt : now,
        expiresAt: newExpiresAt,
        autoRenew,
        cancelledAt: null,
        lastReminderAt: null,
      },
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: { subscriptionId: sub.id },
    });

    logger.info('Subscription activated', { userId, plan, expiresAt: newExpiresAt, autoRenew });
  }

  // ==================== CINETPAY INTEGRATION ====================
  // Real CinetPay API docs: https://docs.cinetpay.com

  /** Dev sans clés CinetPay : init/statut simulés localement. */
  private isCinetPayDevMock(): boolean {
    return config.env === 'development' && !config.cinetpay.apiKey;
  }

  /**
   * Dev uniquement : simule la confirmation CinetPay d'un paiement (carte ou
   * mobile money) en passant par le VRAI webhook. Ouvert par le client à la
   * place de la page de paiement CinetPay.
   */
  async mockCinetPayComplete(providerRef: string) {
    if (!this.isCinetPayDevMock()) throw AppError.forbidden('Simulateur indisponible');
    const payment = await prisma.payment.findUnique({ where: { providerRef } });
    if (!payment) throw AppError.notFound('Paiement introuvable');
    return this.handleWebhook(
      {
        cpm_trans_id: providerRef,
        cpm_result: '00',
        cpm_error_message: 'SUCCES',
        cpm_amount: String(payment.amountFcfa),
        cpm_currency: 'XOF',
      },
      undefined,
    );
  }

  private async callCinetPay(data: any): Promise<{ paymentUrl?: string; cinetpayTxId?: string }> {
    if (this.isCinetPayDevMock()) {
      // Dev mock : l'« URL de paiement » pointe vers un simulateur local qui
      // confirme réellement le paiement (cf. mockCinetPayComplete), pour tester
      // le flux carte / mobile money de bout en bout sans compte CinetPay.
      logger.info('DEV MODE: mocking CinetPay init', { data });
      return {
        paymentUrl: `${config.apiBaseUrl}/api/v1/payments/webhook/cinetpay/mock?ref=${data.transaction_id}`,
        cinetpayTxId: `CP-MOCK-${Date.now()}`,
      };
    }

    const response = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment',
      {
        apikey: config.cinetpay.apiKey,
        site_id: config.cinetpay.siteId,
        ...data,
      },
      { timeout: 15_000 },
    );

    if (response.data.code !== '201') {
      throw new Error(`CinetPay error: ${response.data.message}`);
    }
    return {
      paymentUrl: response.data.data.payment_url,
      cinetpayTxId: response.data.data.payment_token,
    };
  }

  private async fetchCinetPayStatus(
    providerRef: string,
  ): Promise<{ status: string; amount?: number; currency?: string }> {
    if (config.env === 'development' && !config.cinetpay.apiKey) {
      // In dev, return random
      return { status: Math.random() > 0.3 ? 'ACCEPTED' : 'PENDING' };
    }
    const response = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment/check',
      {
        apikey: config.cinetpay.apiKey,
        site_id: config.cinetpay.siteId,
        transaction_id: providerRef,
      },
      { timeout: 10_000 },
    );
    const d = response.data?.data || {};
    return {
      status: d.status || 'PENDING',
      amount: d.amount != null ? Number(d.amount) : undefined,
      currency: d.currency,
    };
  }
}

export const paymentsService = new PaymentsService();
