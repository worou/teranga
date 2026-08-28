import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { usersService } from '../services/users.service';
import { updateProfileSchema, addPhotoSchema, biometricSchema } from '../validators';
import { photoUpload } from '../config/upload';
import { config } from '../config';
import { AppError } from '../utils/AppError';

const router = Router();

/**
 * Gardes posées par route. Tout `/users/me*` exige un compte ; seule la
 * consultation d'un profil (`GET /users/:id`) est publique.
 *
 * L'ordre de déclaration compte : les routes `/me` sont déclarées avant
 * `/:id`, sinon « me » serait pris pour un identifiant.
 */

// Enveloppe multer : convertit ses erreurs (taille, format…) en 400 propres.
function uploadPhotos(req: Request, res: Response, next: NextFunction) {
  photoUpload.array('photos', config.profile.maxPhotos)(req, res, (err: unknown) => {
    if (err) return next(AppError.badRequest((err as Error).message || 'Upload échoué'));
    next();
  });
}

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Mon profil complet
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profil complet
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await usersService.getById(req.auth!.userId);
    res.json(user);
  }),
);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Modifier mon profil
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateProfileRequest' }
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 */
router.patch(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await usersService.updateProfile(req.auth!.userId, req.body);
    res.json(user);
  }),
);

/**
 * @openapi
 * /users/me/deactivate:
 *   post:
 *     tags: [Users]
 *     summary: Mettre mon compte en pause
 *     description: |
 *       Le membre disparaît de la découverte et n'est plus joignable, mais
 *       rien n'est effacé. Réversible par lui seul, via `/users/me/reactivate`.
 *       N'accepte qu'un compte `ACTIVE` : une sanction ne se lève pas ainsi.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Compte en pause" }
 *       400: { description: "Le compte n'est pas actif" }
 */
router.post(
  '/me/deactivate',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await usersService.deactivate(req.auth!.userId));
  }),
);

/**
 * @openapi
 * /users/me/reactivate:
 *   post:
 *     tags: [Users]
 *     summary: Remettre mon compte en service
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Compte réactivé" }
 *       400: { description: "Le compte n'est pas en pause" }
 */
router.post(
  '/me/reactivate',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await usersService.reactivate(req.auth!.userId));
  }),
);

/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Users]
 *     summary: Supprimer mon compte (soft delete)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Compte supprimé" }
 */
router.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await usersService.deleteAccount(req.auth!.userId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Consulter un profil public
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Profil public
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DiscoveryProfile' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:id',
  // Consultable sans être connecté : un visiteur doit pouvoir parcourir les
  // profils avant de créer un compte. `optionalAuth` sert uniquement à
  // rafraîchir l'activité du membre s'il est identifié.
  //
  // La réponse vient d'une liste blanche explicite (getPublicProfile) et non de
  // `serialize` amputé : par soustraction, la date de naissance exacte, le
  // statut de vérification, l'abonnement et la dernière activité partiraient
  // avec, et tout champ ajouté plus tard au modèle fuirait en silence.
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await usersService.getPublicProfile(req.params.id, req.auth?.userId));
  }),
);

/**
 * @openapi
 * /users/me/photos:
 *   post:
 *     tags: [Users]
 *     summary: Ajouter une photo (max 6)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url: { type: string, format: uri, description: "URL de la photo déjà uploadée sur S3" }
 *     responses:
 *       201:
 *         description: Photo ajoutée (en attente de modération)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Photo' }
 */
router.post(
  '/me/photos',
  requireAuth,
  validate(addPhotoSchema),
  asyncHandler(async (req, res) => {
    const photo = await usersService.addPhoto(req.auth!.userId, req.body.url);
    res.status(201).json(photo);
  }),
);

/**
 * @openapi
 * /users/me/photos/upload:
 *   post:
 *     tags: [Users]
 *     summary: Uploader une ou plusieurs photos (fichiers)
 *     description: |
 *       Upload multipart (`photos`). JPEG/PNG/WebP, 5 Mo max par fichier, 6 max.
 *       Dernière étape de l'inscription : tant que le profil ne porte pas le
 *       minimum de photos exigé (`config.profile.minPhotos`), la découverte, les
 *       matchs et la messagerie répondent 403 `PHOTOS_REQUIRED`. Cette route
 *       reste ouverte aux profils incomplets — c'est elle qui lève le blocage.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Photos ajoutées
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Photo' }
 */
router.post(
  '/me/photos/upload',
  requireAuth,
  uploadPhotos,
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) throw AppError.badRequest('Aucune photo reçue');

    const created = [];
    for (const f of files) {
      created.push(await usersService.addPhoto(req.auth!.userId, `/uploads/${f.filename}`));
    }
    res.status(201).json(created);
  }),
);

/**
 * @openapi
 * /users/me/photos/{photoId}:
 *   delete:
 *     tags: [Users]
 *     summary: Supprimer une photo
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Photo supprimée" }
 */
router.delete(
  '/me/photos/:photoId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await usersService.deletePhoto(req.auth!.userId, req.params.photoId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /users/me/photos/{photoId}/main:
 *   put:
 *     tags: [Users]
 *     summary: Définir une photo comme photo principale
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Photo principale mise à jour" }
 */
router.put(
  '/me/photos/:photoId/main',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await usersService.setMainPhoto(req.auth!.userId, req.params.photoId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /users/me/biometric-verification:
 *   post:
 *     tags: [Users]
 *     summary: Soumettre un selfie vidéo pour vérification biométrique
 *     description: |
 *       Envoie un selfie vidéo (3 secondes) qui sera comparé aux photos de profil
 *       par Smile Identity ou un prestataire équivalent. Étape obligatoire pour
 *       obtenir le badge "Vérifié" et apparaître dans le fil de découverte.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BiometricVerifyRequest' }
 *     responses:
 *       202:
 *         description: Vérification en cours
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: IN_REVIEW }
 */
router.post(
  '/me/biometric-verification',
  requireAuth,
  validate(biometricSchema),
  asyncHandler(async (req, res) => {
    const result = await usersService.submitBiometricVerification(
      req.auth!.userId,
      req.body.videoSelfieBase64,
    );
    res.status(202).json(result);
  }),
);

export default router;
