import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
  eventsService,
  moderationService,
  trustedCircleService,
  notificationsService,
} from '../services/other.services';
import { reportSchema, blockSchema, addTrustedSchema } from '../validators';
import { prisma } from '../config/prisma';

const router = Router();
router.use(requireAuth);

// ==================== EVENTS ====================

/**
 * @openapi
 * /events:
 *   get:
 *     tags: [Events]
 *     summary: Lister les événements à venir
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: country
 *         schema: { type: string, example: SN }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Event' }
 */
router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const events = await eventsService.list(
      req.auth!.userId,
      req.query.country as string,
      req.query.city as string,
    );
    res.json(events);
  }),
);

/**
 * @openapi
 * /events/{eventId}/join:
 *   post:
 *     tags: [Events]
 *     summary: S'inscrire à un événement
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Inscrit" }
 *       400: { description: "Événement complet ou terminé" }
 */
router.post(
  '/events/:eventId/join',
  asyncHandler(async (req, res) => {
    const result = await eventsService.join(req.auth!.userId, req.params.eventId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /events/{eventId}/leave:
 *   post:
 *     tags: [Events]
 *     summary: Se désinscrire d'un événement
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Désinscrit" }
 */
router.post(
  '/events/:eventId/leave',
  asyncHandler(async (req, res) => {
    const result = await eventsService.leave(req.auth!.userId, req.params.eventId);
    res.json(result);
  }),
);

// ==================== MODERATION ====================

/**
 * @openapi
 * /moderation/reports:
 *   post:
 *     tags: [Moderation]
 *     summary: Signaler un utilisateur
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ReportRequest' }
 *     responses:
 *       201: { description: "Signalement enregistré" }
 */
router.post(
  '/moderation/reports',
  validate(reportSchema),
  asyncHandler(async (req, res) => {
    const report = await moderationService.report(
      req.auth!.userId,
      req.body.reportedUserId,
      req.body.reason,
      req.body.description,
    );
    res.status(201).json(report);
  }),
);

/**
 * @openapi
 * /moderation/blocks:
 *   get:
 *     tags: [Moderation]
 *     summary: Lister mes utilisateurs bloqués
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Liste" }
 */
router.get(
  '/moderation/blocks',
  asyncHandler(async (req, res) => {
    const blocks = await moderationService.listBlocks(req.auth!.userId);
    res.json(blocks);
  }),
);

/**
 * @openapi
 * /moderation/blocks:
 *   post:
 *     tags: [Moderation]
 *     summary: Bloquer un utilisateur
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BlockRequest' }
 *     responses:
 *       201: { description: "Bloqué" }
 */
router.post(
  '/moderation/blocks',
  validate(blockSchema),
  asyncHandler(async (req, res) => {
    const block = await moderationService.block(
      req.auth!.userId,
      req.body.blockedUserId,
      req.body.reason,
    );
    res.status(201).json(block);
  }),
);

/**
 * @openapi
 * /moderation/blocks/{blockedUserId}:
 *   delete:
 *     tags: [Moderation]
 *     summary: Débloquer un utilisateur
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: blockedUserId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Débloqué" }
 */
router.delete(
  '/moderation/blocks/:blockedUserId',
  asyncHandler(async (req, res) => {
    const result = await moderationService.unblock(req.auth!.userId, req.params.blockedUserId);
    res.json(result);
  }),
);

// ==================== TRUSTED CIRCLE ====================

/**
 * @openapi
 * /trusted-circle:
 *   get:
 *     tags: [TrustedCircle]
 *     summary: Lister mon cercle de confiance
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Liste
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/TrustedCircleMember' }
 */
router.get(
  '/trusted-circle',
  asyncHandler(async (req, res) => {
    const members = await trustedCircleService.list(req.auth!.userId);
    res.json(members);
  }),
);

/**
 * @openapi
 * /trusted-circle:
 *   post:
 *     tags: [TrustedCircle]
 *     summary: Ajouter un tiers de confiance (proche, famille)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AddTrustedMemberRequest' }
 *     responses:
 *       201:
 *         description: Ajouté
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/TrustedCircleMember' }
 */
router.post(
  '/trusted-circle',
  validate(addTrustedSchema),
  asyncHandler(async (req, res) => {
    const entry = await trustedCircleService.add(req.auth!.userId, req.body);
    res.status(201).json(entry);
  }),
);

/**
 * @openapi
 * /trusted-circle/{circleId}:
 *   delete:
 *     tags: [TrustedCircle]
 *     summary: Retirer un tiers de confiance
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: circleId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Retiré" }
 */
router.delete(
  '/trusted-circle/:circleId',
  asyncHandler(async (req, res) => {
    const result = await trustedCircleService.remove(req.auth!.userId, req.params.circleId);
    res.json(result);
  }),
);

// ==================== NOTIFICATIONS ====================

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Lister mes notifications
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Liste paginée
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PaginatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Notification' }
 */
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '30', 10);
    const result = await notificationsService.list(req.auth!.userId, page, limit);
    res.json(result);
  }),
);

/**
 * @openapi
 * /notifications/{notificationId}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Marquer une notification comme lue
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Marquée comme lue" }
 */
router.post(
  '/notifications/:notificationId/read',
  asyncHandler(async (req, res) => {
    const result = await notificationsService.markRead(req.auth!.userId, req.params.notificationId);
    res.json(result);
  }),
);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Marquer toutes les notifications comme lues
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Toutes marquées comme lues" }
 */
router.post(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const result = await notificationsService.markAllRead(req.auth!.userId);
    res.json(result);
  }),
);

// ==================== ADMIN ====================

router.use('/admin', requireAdmin);

/**
 * @openapi
 * /admin/reports:
 *   get:
 *     tags: [Admin]
 *     summary: Lister les signalements en attente (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Liste" }
 */
router.get(
  '/admin/reports',
  asyncHandler(async (_req, res) => {
    const reports = await prisma.report.findMany({
      where: { status: 'PENDING' },
      include: {
        reporter: { select: { id: true, firstName: true } },
        reported: { select: { id: true, firstName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(reports);
  }),
);

/**
 * @openapi
 * /admin/users/{userId}/ban:
 *   post:
 *     tags: [Admin]
 *     summary: Bannir un utilisateur (admin)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: "Utilisateur banni" }
 */
router.post(
  '/admin/users/:userId/ban',
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { status: 'BANNED' },
    });
    res.json({ banned: true });
  }),
);

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Statistiques globales (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Stats" }
 */
router.get(
  '/admin/stats',
  asyncHandler(async (_req, res) => {
    const [totalUsers, activeWomen, activeMen, activeSubs, totalConversations, pendingReports] =
      await Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count({ where: { status: 'ACTIVE', gender: 'FEMALE' } }),
        prisma.user.count({ where: { status: 'ACTIVE', gender: 'MALE' } }),
        prisma.subscription.count({
          where: { status: 'ACTIVE', plan: { not: 'FREE' } },
        }),
        prisma.match.count({ where: { status: 'MATCHED' } }),
        prisma.report.count({ where: { status: 'PENDING' } }),
      ]);

    const mrr = await prisma.payment.aggregate({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      },
      _sum: { amountFcfa: true },
    });

    res.json({
      totalUsers,
      activeWomen,
      activeMen,
      ratioMaleFemale: activeWomen > 0 ? activeMen / activeWomen : 0,
      activeSubscriptions: activeSubs,
      conversionRate: activeMen > 0 ? activeSubs / activeMen : 0,
      totalConversations,
      pendingReports,
      mrr30dFcfa: mrr._sum.amountFcfa || 0,
    });
  }),
);

export default router;
