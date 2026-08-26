import { z } from 'zod';
import { isXofCountry, dialingCodeForCountry, OPERATORS } from '../config/mobileMoney';
import { calculateAge } from '../utils/helpers';

const phoneRegex = /^\+\d{8,15}$/;

/**
 * Âge minimum légal pour s'inscrire. Contrôlé côté serveur : la validation du
 * navigateur est une commodité d'affichage, elle se contourne en une requête.
 */
export const MIN_AGE = 18;
/** Borne haute : au-delà, la date est presque sûrement une saisie erronée. */
export const MAX_AGE = 100;

// ==================== AUTH ====================

export const registerSchema = z
  .object({
    phone: z.string().regex(phoneRegex, 'Numéro invalide (format E.164)'),
    // Obligatoire : c'est par e-mail qu'arrive le code de verification. Le
    // laisser facultatif ouvrirait des inscriptions sans moyen d'aboutir.
    email: z.string().email(),
    password: z.string().min(8).optional(),
    firstName: z.string().min(1).max(60),
    lastName: z.string().max(60).optional(),
    // Âge : calcul CALENDAIRE, le même que `calculateAge` utilisé à l'affichage.
    //
    // L'approximation précédente (365,25 jours) pouvait diverger d'un jour du
    // calcul calendaire selon les années bissextiles traversées : un profil
    // accepté comme majeur pouvait s'afficher à 17 ans. Sur un seuil légal,
    // les deux doivent dire la même chose.
    //
    // Deux contrôles distincts plutôt qu'un seul : un refus pour âge trop
    // élevé ne doit pas annoncer « vous devez avoir au moins 18 ans ».
    birthDate: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now(), {
        message: 'La date de naissance ne peut pas être dans le futur',
      })
      .refine((d) => calculateAge(d) >= MIN_AGE, {
        message: `Vous devez avoir au moins ${MIN_AGE} ans pour vous inscrire`,
      })
      .refine((d) => calculateAge(d) <= MAX_AGE, {
        message: 'Date de naissance invalide',
      }),
    gender: z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED']),
    intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']),
    religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
    city: z.string().min(1).max(80),
    country: z.string().length(2),
    profession: z.string().max(80).optional(),
  })
  // Garde-fou : pour un pays de la zone F CFA (où le paiement mobile money et
  // l'OTP dépendent de l'indicatif), le numéro doit porter cet indicatif. Les
  // pays hors zone ne sont pas contraints (numéro étranger de la diaspora).
  .refine(
    (d) => {
      if (!isXofCountry(d.country)) return true;
      const code = dialingCodeForCountry(d.country);
      return !code || d.phone.startsWith(code);
    },
    {
      message: "Le numéro doit commencer par l'indicatif du pays sélectionné.",
      path: ['phone'],
    },
  );

export const loginSchema = z.object({
  phone: z.string().regex(phoneRegex),
  password: z.string().min(1),
});

/**
 * Identifiant d'un compte pour les codes de vérification : une adresse
 * e-mail OU un numéro de téléphone, l'un ou l'autre mais pas les deux.
 *
 * La vérification se fait désormais par e-mail (l'acheminement SMS n'était
 * jamais fiable sur la zone), mais les codes restent stockés PAR TÉLÉPHONE :
 * `OtpCode.phone`, index `[phone, code]`, et `verifyOtp` qui cherche par
 * téléphone. L'e-mail est résolu vers le téléphone du compte avant toute
 * écriture — ce qui évite une migration sur une base en production et laisse
 * intacte la logique déjà éprouvée.
 *
 * Le téléphone reste accepté : l'inscription s'en sert encore, et les
 * intégrations existantes ne cassent pas.
 */
const identifiantCompte = {
  phone: z.string().regex(phoneRegex, 'Numéro invalide (format E.164)').optional(),
  email: z.string().email('Adresse e-mail invalide').optional(),
};

/** Exactement un identifiant : ni zéro, ni les deux (qui pourraient désigner
 *  deux comptes différents — on refuse plutôt que d'en choisir un). */
const unSeulIdentifiant = (d: { phone?: string; email?: string }) =>
  Boolean(d.phone) !== Boolean(d.email);

const erreurIdentifiant = {
  message: 'Indiquez une adresse e-mail ou un numéro de téléphone.',
  path: ['email'] as (string | number)[],
};

export const otpRequestSchema = z
  .object({
    ...identifiantCompte,
    purpose: z.enum(['registration', 'login', 'password_reset']).default('registration'),
  })
  .refine(unSeulIdentifiant, erreurIdentifiant);

export const otpVerifySchema = z
  .object({
    ...identifiantCompte,
    code: z.string().length(6),
  })
  .refine(unSeulIdentifiant, erreurIdentifiant);

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

// ==================== USERS ====================

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().max(60).optional(),
  bio: z.string().max(500).optional(),
  profession: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  educationLevel: z.string().max(80).optional(),
  hasChildren: z.boolean().optional(),
  religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
  intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']).optional(),

  // Critères de recherche facultatifs. `null` est accepté explicitement :
  // c'est ainsi qu'un membre efface une valeur déjà renseignée. Zod supprime
  // les clés inconnues, ces champs doivent donc figurer ici pour atteindre
  // la liste blanche du service.
  wantsChildren: z.boolean().nullable().optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  weightKg: z.number().int().min(35).max(250).nullable().optional(),
  bodyType: z.enum(['MINCE', 'MOYENNE', 'RONDE']).nullable().optional(),
  ethnicity: z
    .enum(['AFRICAN', 'ARAB', 'ASIAN', 'EUROPEAN', 'LATIN', 'NORTH_AMERICAN', 'UNDISCLOSED'])
    .nullable()
    .optional(),
  /** Codes ISO ; le service les normalise en ",FR,WO,". */
  languages: z.array(z.string().min(2).max(5)).max(12).nullable().optional(),
});

export const addPhotoSchema = z.object({
  url: z.string().url(),
});

export const biometricSchema = z.object({
  videoSelfieBase64: z.string().min(100),
});

// ==================== DISCOVERY ====================

/** `?a=false` arrive en chaîne : `z.coerce.boolean()` la rendrait `true`. */
const boolFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const discoveryFiltersSchema = z.object({
  q: z.string().trim().min(1).max(60).optional(), // pseudo / recherche plein-texte
  gender: z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED']).optional(),
  minAge: z.coerce.number().min(18).max(99).optional(),
  maxAge: z.coerce.number().min(18).max(99).optional(),
  city: z.string().max(80).optional(),
  country: z.string().length(2).optional(),
  religion: z.enum(['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED']).optional(),
  intent: z.enum(['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY']).optional(),
  profession: z.string().max(80).optional(),

  // Physique et origine — tous facultatifs côté profil, donc tous soumis au
  // drapeau `includeUnspecified` ci-dessous.
  minHeightCm: z.coerce.number().min(120).max(230).optional(),
  maxHeightCm: z.coerce.number().min(120).max(230).optional(),
  minWeightKg: z.coerce.number().min(35).max(250).optional(),
  maxWeightKg: z.coerce.number().min(35).max(250).optional(),
  bodyType: z.enum(['MINCE', 'MOYENNE', 'RONDE']).optional(),
  ethnicity: z
    .enum(['AFRICAN', 'ARAB', 'ASIAN', 'EUROPEAN', 'LATIN', 'NORTH_AMERICAN', 'UNDISCLOSED'])
    .optional(),
  /** Code ISO d'une langue parlée (ex. FR, WO). Voir User.languages. */
  language: z.string().trim().min(2).max(5).optional(),

  hasChildren: boolFlag.optional(),
  wantsChildren: boolFlag.optional(),
  hasPhoto: boolFlag.optional(),

  /** Tous / actifs récemment (7 j) / actifs à l'instant (5 min). */
  lastActive: z.enum(['all', 'recent', 'online']).default('all'),

  /**
   * Inclure les profils qui n'ont pas renseigné le critère filtré. Activé par
   * défaut : les champs physiques et l'origine sont facultatifs, les exclure
   * d'office viderait la liste pour tous les profils encore incomplets.
   */
  includeUnspecified: boolFlag.default(true),

  limit: z.coerce.number().min(1).max(50).default(20),
});

export const likeSchema = z.object({
  receiverId: z.string().uuid(),
  isSuperLike: z.boolean().default(false),
});

// ==================== MESSAGES ====================

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

// ==================== SUBSCRIPTIONS / PAYMENTS ====================

export const subscribeSchema = z
  .object({
    plan: z.enum(['DISCOVERY', 'STANDARD', 'ENGAGEMENT']),
    // Moyens mobile money (zone F CFA), carte, PayPal ou virement — cf. mobileMoney.ts
    method: z.enum([
      'ORANGE_MONEY',
      'WAVE',
      'MTN_MOMO',
      'MOOV_MONEY',
      'FREE_MONEY',
      'WIZALL',
      'CARD',
      'CARRIER_BILLING',
      'PAYPAL',
      'BANK_TRANSFER',
    ]),
    // Optionnel : requis seulement pour le mobile money (validé ci-dessous).
    phoneNumber: z.string().regex(phoneRegex).optional(),
    autoRenew: z.boolean().default(true),
  })
  // Le numéro n'est exigé que pour un portefeuille mobile money (Carte et
  // PayPal n'en ont pas besoin).
  .refine((d) => !OPERATORS[d.method]?.isMobileMoney || !!d.phoneNumber, {
    message: 'Numéro de téléphone requis pour ce moyen de paiement',
    path: ['phoneNumber'],
  });

// ==================== MODERATION ====================

export const reportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.enum(['HARASSMENT', 'FAKE_PROFILE', 'SCAM', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER']),
  description: z.string().max(1000).optional(),
});

export const blockSchema = z.object({
  blockedUserId: z.string().uuid(),
  reason: z.string().max(200).optional(),
});

// ==================== TRUSTED CIRCLE ====================

export const addTrustedSchema = z.object({
  relation: z.string().min(1).max(40),
  trusteePhone: z.string().regex(phoneRegex).optional(),
  trusteeName: z.string().max(80).optional(),
});

// ==================== PAGINATION ====================

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});