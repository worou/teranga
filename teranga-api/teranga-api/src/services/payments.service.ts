import axios from 'axios';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { AppError } from '../utils/AppError';
import { addMonths, monthsForPlan } from '../utils/helpers';
import { logger } from '../utils/logger';

type PlanKey = 'DISCOVERY' | 'STANDARD' | 'ENGAGEMENT';
type MethodKey =
  | 'ORANGE_MONEY'
  | 'WAVE'
  | 'MTN_MOMO'
  | 'MOOV_MONEY'
  | 'M_PESA'
  | 'AIRTEL_MONEY'
  | 'CARD'
  | 'CARRIER_BILLING';

export class PaymentsService {
  getCatalog() {
    return {
      DISCOVERY: { ...config.pricing.DISCOVERY, currency: 'XOF' },
      STANDARD: { ...config.pricing.STANDARD, currency: 'XOF' },
      ENGAGEMENT: { ...config.pricing.ENGAGEMENT, currency: 'XOF' },
    };
  }

  /**
   * Initialize a payment flow.
   * For Mobile Money: returns instructions to validate USSD.
   * For Card: returns a hosted payment URL.
   */
  async initiate(userId: string, plan: PlanKey, method: MethodKey, phoneNumber: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound();

    // Only men subscribe (but we don't block explicitly - some use cases may change)
    const priceInfo = config.pricing[plan];
    if (!priceInfo) throw AppError.badRequest('Plan invalide');

    // Create pending payment row
    const payment = await prisma.payment.create({
      data: {
        userId,
        plan,
        method,
        status: 'PENDING',
        amountFcfa: priceInfo.amount,
        currency: 'XOF',
        phoneNumber,
        providerRef: `TERANGA-${Date.now()}-${uuid().slice(0, 8)}`,
      },
    });

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
        channels: this.mapMethodToCinetPayChannels(method),
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
        ussdInstruction:
          method !== 'CARD'
            ? `Validez la demande USSD sur votre téléphone ${phoneNumber} avec votre code PIN ${this.methodLabel(method)}.`
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
   * CinetPay webhook handler - confirms payment and activates subscription.
   */
  async handleWebhook(payload: any) {
    logger.info('CinetPay webhook received', { cpm_trans_id: payload.cpm_trans_id });

    const providerRef = payload.cpm_trans_id || payload.transaction_id;
    if (!providerRef) throw AppError.badRequest('Webhook sans identifiant');

    const payment = await prisma.payment.findFirst({
      where: { providerRef },
    });
    if (!payment) throw AppError.notFound('Paiement introuvable');

    if (payment.webhookReceived) {
      return { alreadyProcessed: true };
    }

    const paymentStatus = payload.cpm_result === '00' ? 'COMPLETED' : 'FAILED';

    if (paymentStatus === 'COMPLETED') {
      await this.activateSubscription(payment.userId, payment.plan as PlanKey, payment.id);
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        completedAt: paymentStatus === 'COMPLETED' ? new Date() : null,
        webhookReceived: true,
        webhookPayload: payload,
        failureReason: paymentStatus === 'FAILED' ? payload.cpm_error_message : null,
      },
    });

    return { processed: true, status: paymentStatus };
  }

  /**
   * Manual check of payment status (polling fallback if webhook lost).
   */
  async checkStatus(userId: string, paymentId: string) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw AppError.notFound();

    // If still processing, call CinetPay to check
    if (payment.status === 'PROCESSING' && payment.providerRef) {
      try {
        const remote = await this.fetchCinetPayStatus(payment.providerRef);
        if (remote.status === 'ACCEPTED') {
          await this.activateSubscription(userId, payment.plan as PlanKey, paymentId);
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        } else if (remote.status === 'REFUSED') {
          await prisma.payment.update({
            where: { id: paymentId },
            data: { status: 'FAILED', failureReason: 'Refusé par l\'opérateur' },
          });
        }
      } catch (err) {
        logger.warn('CinetPay status check failed', { paymentId, error: (err as Error).message });
      }
    }

    const updated = await prisma.payment.findUnique({ where: { id: paymentId } });
    return updated;
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

  /**
   * Activate subscription after successful payment.
   */
  private async activateSubscription(userId: string, plan: PlanKey, paymentId: string) {
    const months = monthsForPlan(plan);
    const now = new Date();

    const existing = await prisma.subscription.findUnique({ where: { userId } });

    // If user already has active subscription, extend it
    const baseDate = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
    const newExpiresAt = addMonths(baseDate, months);

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: 'ACTIVE',
        startsAt: now,
        expiresAt: newExpiresAt,
      },
      update: {
        plan,
        status: 'ACTIVE',
        startsAt: existing?.status === 'ACTIVE' ? existing.startsAt : now,
        expiresAt: newExpiresAt,
        cancelledAt: null,
      },
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        subscriptionId: (await prisma.subscription.findUnique({ where: { userId } }))?.id,
      },
    });

    logger.info('Subscription activated', { userId, plan, expiresAt: newExpiresAt });
  }

  // ==================== CINETPAY INTEGRATION ====================
  // Real CinetPay API docs: https://docs.cinetpay.com

  private async callCinetPay(data: any): Promise<{ paymentUrl?: string; cinetpayTxId?: string }> {
    if (process.env.NODE_ENV === 'development' && !config.cinetpay.apiKey) {
      // Dev mock: simulate successful init
      logger.info('DEV MODE: mocking CinetPay init', { data });
      return {
        paymentUrl: `${config.apiBaseUrl}/mock-cinetpay?tx=${data.transaction_id}`,
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

  private async fetchCinetPayStatus(providerRef: string): Promise<{ status: string }> {
    if (process.env.NODE_ENV === 'development' && !config.cinetpay.apiKey) {
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
    return { status: response.data.data?.status || 'PENDING' };
  }

  private mapMethodToCinetPayChannels(method: MethodKey): string {
    switch (method) {
      case 'ORANGE_MONEY':
        return 'MOBILE_MONEY';
      case 'WAVE':
        return 'WALLET';
      case 'MTN_MOMO':
      case 'MOOV_MONEY':
      case 'M_PESA':
      case 'AIRTEL_MONEY':
        return 'MOBILE_MONEY';
      case 'CARD':
        return 'CREDIT_CARD';
      case 'CARRIER_BILLING':
        return 'CARRIER_BILLING';
      default:
        return 'ALL';
    }
  }

  private methodLabel(method: MethodKey): string {
    const labels: Record<MethodKey, string> = {
      ORANGE_MONEY: 'Orange Money',
      WAVE: 'Wave',
      MTN_MOMO: 'MTN MoMo',
      MOOV_MONEY: 'Moov Money',
      M_PESA: 'M-Pesa',
      AIRTEL_MONEY: 'Airtel Money',
      CARD: 'carte bancaire',
      CARRIER_BILLING: 'facturation opérateur',
    };
    return labels[method];
  }
}

export const paymentsService = new PaymentsService();
