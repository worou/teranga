import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { usersService } from '../services/users.service';
import { updateProfileSchema, addPhotoSchema, biometricSchema } from '../validators';

const router = Router();

router.use(requireAuth);

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
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await usersService.updateProfile(req.auth!.userId, req.body);
    res.json(user);
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
  asyncHandler(async (req, res) => {
    const user = await usersService.getById(req.params.id);
    const { phone, email, passwordHash, ...publicFields } = user;
    res.json(publicFields);
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
  validate(addPhotoSchema),
  asyncHandler(async (req, res) => {
    const photo = await usersService.addPhoto(req.auth!.userId, req.body.url);
    res.status(201).json(photo);
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
