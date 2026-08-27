import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { authService } from '../services/auth.service';
import { usersService } from '../services/users.service';
import {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetSchema,
  refreshTokenSchema,
} from '../validators';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Inscription d'un nouvel utilisateur
 *     description: |
 *       Crée un nouveau compte et envoie automatiquement un OTP SMS pour vérifier le numéro.
 *       Pour les femmes : accès complet gratuit dès vérification.
 *       Pour les hommes : accès limité jusqu'à la souscription d'un abonnement.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterRequest' }
 *     responses:
 *       201:
 *         description: Utilisateur créé, OTP SMS envoyé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *                 otpSent: { type: boolean, example: true }
 *                 message: { type: string, example: "Un code a été envoyé au +221771234567" }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: "Numéro ou email déjà utilisé" }
 */
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { user, devCode, resumed } = await authService.register(req.body);
    res.status(resumed ? 200 : 201).json({
      user: usersService.serialize(user),
      otpSent: true,
      message: resumed
        ? `Une inscription est déjà en cours pour le ${user.phone}. Un nouveau code vient d'être envoyé.`
        : `Un code a été envoyé au ${user.phone}`,
      resumed,
      // Développement sans fournisseur SMS uniquement (cf. requestOtp).
      ...(devCode ? { devCode } : {}),
    });
  }),
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Connexion par numéro et mot de passe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       200:
 *         description: Authentification réussie
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401: { description: "Identifiants invalides" }
 */
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.loginFor(
      { phone: req.body.phone, email: req.body.email },
      req.body.password,
    );
    const { accessToken, refreshToken } = authService.issueTokens(user as any);
    await authService.saveRefreshToken(user.id, refreshToken);
    res.json({
      user: usersService.serialize(user),
      accessToken,
      refreshToken,
    });
  }),
);

/**
 * @openapi
 * /auth/otp/request:
 *   post:
 *     tags: [Auth]
 *     summary: Demander un code OTP par SMS
 *     description: |
 *       Envoie un code à 6 chiffres par SMS (Orange SMS API, Africa's Talking).
 *       Limité à 3 demandes par numéro par heure.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OtpRequest' }
 *     responses:
 *       200:
 *         description: Code envoyé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sent: { type: boolean }
 *                 expiresAt: { type: string, format: date-time }
 *       429: { description: "Trop de demandes" }
 */
router.post(
  '/otp/request',
  validate(otpRequestSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.requestOtpFor(
      { phone: req.body.phone, email: req.body.email },
      req.body.purpose,
    );
    res.json(result);
  }),
);

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Vérifier un code OTP et obtenir un token
 *     description: |
 *       Vérifie le code envoyé par SMS. Si valide, marque le numéro comme vérifié
 *       et retourne un JWT pour authentifier les appels suivants.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/OtpVerifyRequest' }
 *     responses:
 *       200:
 *         description: Code valide, token délivré
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       400: { description: "Code incorrect ou expiré" }
 */
router.post(
  '/otp/verify',
  validate(otpVerifySchema),
  asyncHandler(async (req, res) => {
    const user = await authService.verifyOtpFor(
      { phone: req.body.phone, email: req.body.email },
      req.body.code,
    );
    const { accessToken, refreshToken } = authService.issueTokens(user as any);
    await authService.saveRefreshToken(user.id, refreshToken);
    res.json({
      user: usersService.serialize(user),
      accessToken,
      refreshToken,
    });
  }),
);

/**
 * @openapi
 * /auth/password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Définir un nouveau mot de passe à partir d'un code
 *     description: |
 *       Le code doit avoir été demandé avec `purpose: "password_reset"` : un
 *       code de connexion ne change pas la serrure.
 *
 *       Aucune session n'est ouverte en retour, et tous les jetons de
 *       rafraîchissement du compte sont révoqués — si le compte était
 *       compromis, la réinitialisation met l'intrus dehors. La personne se
 *       reconnecte ensuite avec son nouveau mot de passe.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *               code: { type: string, minLength: 6, maxLength: 6 }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: "Mot de passe remplacé" }
 *       400: { description: "Code expiré, inexistant ou incorrect" }
 *       429: { description: "Trop de tentatives" }
 */
router.post(
  '/password/reset',
  validate(passwordResetSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.resetPassword(
      { phone: req.body.phone, email: req.body.email },
      req.body.code,
      req.body.password,
    );
    res.json(result);
  }),
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rafraîchir le token d'accès
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenRequest' }
 *     responses:
 *       200:
 *         description: Nouveau token délivré
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthResponse' }
 *       401: { description: "Refresh token invalide" }
 */
router.post(
  '/refresh',
  validate(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.refresh(req.body.refreshToken);
    const tokens = authService.issueTokens(user as any);
    // Rotate refresh token
    await authService.revokeRefreshToken(req.body.refreshToken);
    await authService.saveRefreshToken(user.id, tokens.refreshToken);
    res.json({
      user: usersService.serialize(user),
      ...tokens,
    });
  }),
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Déconnexion (révoque le refresh token)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RefreshTokenRequest' }
 *     responses:
 *       200: { description: "Déconnecté" }
 */
router.post(
  '/logout',
  requireAuth,
  validate(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    await authService.revokeRefreshToken(req.body.refreshToken);
    res.json({ loggedOut: true });
  }),
);

export default router;
