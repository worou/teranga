import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const swaggerDefinition: swaggerJsdoc.OAS3Definition = {
  openapi: '3.0.3',
  info: {
    title: 'Téranga API',
    version: '1.0.0',
    description: `
# API Téranga

API REST pour l'application de rencontres sérieuses **Téranga** — dédiée à
l'Afrique francophone.

## Authentification

La plupart des endpoints nécessitent un token JWT. Récupérez-le via
\`POST /auth/login\` ou \`POST /auth/verify-otp\`, puis ajoutez-le dans le
header \`Authorization: Bearer <token>\`.

## Modèle économique

- **Femmes** : accès complet gratuit
- **Hommes** : inscription et navigation limitées gratuitement,
  messagerie réservée aux abonnés

## Paiements Mobile Money

L'API supporte Orange Money, Wave, MTN MoMo, Moov Money, M-Pesa, Airtel Money,
carte bancaire et facturation opérateur — via CinetPay principalement.

## Conventions

- Toutes les dates sont en format ISO 8601 UTC.
- Les montants sont en **F CFA (XOF)** sauf mention contraire.
- Les identifiants sont des UUID v4.
    `.trim(),
    contact: {
      name: 'Équipe Téranga',
      email: 'dev@teranga.africa',
    },
    license: {
      name: 'Propriétaire',
    },
  },
  servers: [
    { url: config.apiBaseUrl + '/api/v1', description: 'Serveur local / développement' },
    { url: 'https://api.teranga.africa/v1', description: 'Production' },
  ],
  tags: [
    { name: 'Auth', description: "Inscription, connexion, OTP SMS, vérification d'identité" },
    { name: 'Users', description: 'Profils utilisateurs, photos, préférences' },
    { name: 'Discovery', description: 'Découverte de profils, likes, super-likes' },
    { name: 'Messages', description: 'Messagerie ouverte entre membres (anti-brouteur intégré)' },
    { name: 'Subscriptions', description: 'Abonnements mensuels pour les hommes' },
    { name: 'Payments', description: 'Paiements Mobile Money, carte, facturation' },
    { name: 'Events', description: 'Événements communautaires visio / présentiel' },
    { name: 'Moderation', description: "Signalements et blocages d'utilisateurs" },
    { name: 'TrustedCircle', description: 'Tiers de confiance : impliquer ses proches' },
    { name: 'Notifications', description: "Notifications de l'utilisateur" },
    { name: 'Admin', description: 'Endpoints administrateurs (back-office)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      // ==================== COMMON ====================
      Error: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 400 },
          error: { type: 'string', example: 'Bad Request' },
          message: { type: 'string', example: 'Invalid input' },
          details: { type: 'object' },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: {} },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 147 },
              totalPages: { type: 'integer', example: 8 },
            },
          },
        },
      },

      // ==================== AUTH ====================
      RegisterRequest: {
        type: 'object',
        required: ['phone', 'firstName', 'birthDate', 'gender', 'intent', 'city', 'country'],
        properties: {
          phone: { type: 'string', example: '+221771234567', description: 'Numéro au format E.164' },
          email: { type: 'string', format: 'email', example: 'aminata@example.com' },
          password: { type: 'string', format: 'password', example: 'password123', minLength: 8 },
          firstName: { type: 'string', example: 'Aminata' },
          lastName: { type: 'string', example: 'Diop' },
          birthDate: { type: 'string', format: 'date', example: '1995-03-14' },
          gender: {
            type: 'string',
            enum: ['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED'],
            example: 'FEMALE',
          },
          intent: {
            type: 'string',
            enum: ['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY'],
            example: 'MARRIAGE',
          },
          religion: {
            type: 'string',
            enum: ['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED'],
            example: 'MUSLIM',
          },
          city: { type: 'string', example: 'Dakar' },
          country: { type: 'string', example: 'SN', description: 'Code ISO pays' },
          profession: { type: 'string', example: 'Enseignante' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', example: '+221771234567' },
          password: { type: 'string', format: 'password', example: 'password123' },
        },
      },
      OtpRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '+221771234567' },
          purpose: { type: 'string', enum: ['registration', 'login', 'password_reset'], example: 'registration' },
        },
      },
      OtpVerifyRequest: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', example: '+221771234567' },
          code: { type: 'string', example: '123456', minLength: 6, maxLength: 6 },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
          refreshToken: { type: 'string', example: '55e4b3f8-3c2d-4a2b-...' },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },

      // ==================== USER ====================
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phone: { type: 'string', example: '+221771234567' },
          email: { type: 'string', nullable: true },
          firstName: { type: 'string', example: 'Aminata' },
          lastName: { type: 'string', nullable: true, example: 'Diop' },
          birthDate: { type: 'string', format: 'date' },
          age: { type: 'integer', example: 29 },
          gender: { type: 'string', enum: ['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED'] },
          intent: { type: 'string', enum: ['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY'] },
          religion: { type: 'string', enum: ['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED'] },
          city: { type: 'string' },
          country: { type: 'string' },
          profession: { type: 'string', nullable: true },
          bio: { type: 'string', nullable: true },
          hasChildren: { type: 'boolean' },
          educationLevel: { type: 'string', nullable: true },
          isVerified: { type: 'boolean' },
          photos: { type: 'array', items: { $ref: '#/components/schemas/Photo' } },
          subscription: { $ref: '#/components/schemas/Subscription', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          bio: { type: 'string', maxLength: 500 },
          profession: { type: 'string' },
          city: { type: 'string' },
          educationLevel: { type: 'string' },
          hasChildren: { type: 'boolean' },
          religion: { type: 'string', enum: ['CHRISTIAN', 'MUSLIM', 'OTHER', 'UNDISCLOSED'] },
          intent: { type: 'string', enum: ['SERIOUS_RELATIONSHIP', 'MARRIAGE', 'FAMILY'] },
        },
      },
      Photo: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          order: { type: 'integer' },
          isMain: { type: 'boolean' },
          moderationStatus: { type: 'string', enum: ['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED'] },
        },
      },
      BiometricVerifyRequest: {
        type: 'object',
        required: ['videoSelfieBase64'],
        properties: {
          videoSelfieBase64: { type: 'string', description: "Selfie vidéo 3s en base64" },
        },
      },

      // ==================== DISCOVERY ====================
      DiscoveryProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          firstName: { type: 'string' },
          age: { type: 'integer' },
          city: { type: 'string' },
          profession: { type: 'string', nullable: true },
          bio: { type: 'string', nullable: true },
          intent: { type: 'string' },
          religion: { type: 'string' },
          photos: { type: 'array', items: { $ref: '#/components/schemas/Photo' } },
          isVerified: { type: 'boolean' },
          score: { type: 'integer', description: 'Score de compatibilité (tri décroissant).', example: 70 },
          sharedTraits: {
            type: 'object',
            description: 'Points communs avec le chercheur.',
            properties: {
              sameCity: { type: 'boolean' },
              sameCountry: { type: 'boolean' },
              sameIntent: { type: 'boolean' },
              sameReligion: { type: 'boolean' },
            },
          },
        },
      },
      DiscoveryFilters: {
        type: 'object',
        properties: {
          minAge: { type: 'integer', example: 25 },
          maxAge: { type: 'integer', example: 40 },
          city: { type: 'string' },
          religion: { type: 'string' },
          intent: { type: 'string' },
          hasChildren: { type: 'boolean' },
        },
      },
      LikeRequest: {
        type: 'object',
        required: ['receiverId'],
        properties: {
          receiverId: { type: 'string', format: 'uuid' },
          isSuperLike: { type: 'boolean', default: false },
        },
      },
      LikeResponse: {
        type: 'object',
        description:
          "Le like n'ouvre aucune conversation : la messagerie est accessible sans accord préalable.",
        properties: {
          liked: { type: 'boolean' },
          reciprocal: { type: 'boolean', description: "L'autre membre vous a déjà liké." },
        },
      },

      // ==================== CONVERSATION ====================
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          otherUser: { $ref: '#/components/schemas/DiscoveryProfile' },
          startedAt: { type: 'string', format: 'date-time' },
          lastMessage: { $ref: '#/components/schemas/Message', nullable: true },
          unreadCount: { type: 'integer' },
        },
      },

      // ==================== MESSAGE ====================
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          conversationId: { type: 'string', format: 'uuid' },
          senderId: { type: 'string', format: 'uuid' },
          content: { type: 'string' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SendMessageRequest: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', example: 'Bonjour, votre profil m\'a beaucoup touché.', maxLength: 2000 },
        },
      },
      MessageSafetyBlock: {
        type: 'object',
        properties: {
          blocked: { type: 'boolean', example: true },
          reason: {
            type: 'string',
            example: 'scam_money_request',
            enum: ['scam_money_request', 'harassment', 'sexual_content', 'hate_speech'],
          },
          message: {
            type: 'string',
            example: 'Votre message a été bloqué par notre IA anti-brouteur. Ne jamais envoyer d\'argent à une personne rencontrée ici.',
          },
        },
      },

      // ==================== SUBSCRIPTION ====================
      Subscription: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          plan: { type: 'string', enum: ['FREE', 'DISCOVERY', 'STANDARD', 'ENGAGEMENT'] },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'] },
          startsAt: { type: 'string', format: 'date-time', nullable: true },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          autoRenew: { type: 'boolean' },
          lastReminderAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      SubscribeRequest: {
        type: 'object',
        required: ['plan', 'method', 'phoneNumber'],
        properties: {
          plan: { type: 'string', enum: ['DISCOVERY', 'STANDARD', 'ENGAGEMENT'] },
          method: {
            type: 'string',
            description: 'Opérateurs zone F CFA (XOF). Disponibilité selon le pays — cf. GET /payments/methods.',
            enum: ['ORANGE_MONEY', 'WAVE', 'MTN_MOMO', 'MOOV_MONEY', 'FREE_MONEY', 'WIZALL', 'CARD', 'CARRIER_BILLING'],
          },
          phoneNumber: { type: 'string', example: '+221771234567' },
          autoRenew: { type: 'boolean', default: true, description: 'Renouveler à l\'expiration (rappel J-3).' },
        },
      },
      PricingCatalog: {
        type: 'object',
        properties: {
          DISCOVERY: {
            type: 'object',
            properties: {
              amount: { type: 'integer', example: 1000 },
              months: { type: 'integer', example: 1 },
              currency: { type: 'string', example: 'XOF' },
            },
          },
          STANDARD: {
            type: 'object',
            properties: {
              amount: { type: 'integer', example: 1500 },
              months: { type: 'integer', example: 3 },
              monthlyDisplay: { type: 'integer', example: 500 },
              currency: { type: 'string', example: 'XOF' },
            },
          },
          ENGAGEMENT: {
            type: 'object',
            properties: {
              amount: { type: 'integer', example: 5000 },
              months: { type: 'integer', example: 6 },
              monthlyDisplay: { type: 'integer', example: 833 },
              currency: { type: 'string', example: 'XOF' },
            },
          },
        },
      },

      // ==================== PAYMENT ====================
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          plan: { type: 'string' },
          method: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'] },
          amountFcfa: { type: 'integer' },
          currency: { type: 'string' },
          phoneNumber: { type: 'string', nullable: true },
          providerRef: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PaymentInitResponse: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', format: 'uuid' },
          paymentUrl: { type: 'string', format: 'uri', nullable: true, description: 'Pour CARD uniquement' },
          ussdInstruction: { type: 'string', example: 'Validez la demande #123456 sur votre téléphone avec votre code PIN' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },

      // ==================== EVENT ====================
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string', enum: ['VIRTUAL', 'IN_PERSON'] },
          city: { type: 'string', nullable: true },
          country: { type: 'string', nullable: true },
          venueAddress: { type: 'string', nullable: true },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
          maxParticipants: { type: 'integer', nullable: true },
          participantsCount: { type: 'integer' },
          coverImageUrl: { type: 'string', nullable: true },
          hasJoined: { type: 'boolean' },
        },
      },

      // ==================== REPORT ====================
      ReportRequest: {
        type: 'object',
        required: ['reportedUserId', 'reason'],
        properties: {
          reportedUserId: { type: 'string', format: 'uuid' },
          reason: {
            type: 'string',
            enum: ['HARASSMENT', 'FAKE_PROFILE', 'SCAM', 'INAPPROPRIATE_CONTENT', 'SPAM', 'OTHER'],
          },
          description: { type: 'string', maxLength: 1000 },
        },
      },
      BlockRequest: {
        type: 'object',
        required: ['blockedUserId'],
        properties: {
          blockedUserId: { type: 'string', format: 'uuid' },
          reason: { type: 'string' },
        },
      },

      // ==================== TRUSTED CIRCLE ====================
      TrustedCircleMember: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          relation: { type: 'string', example: 'mère' },
          trusteeContact: { type: 'string', nullable: true },
          trustee: { $ref: '#/components/schemas/User', nullable: true },
          canReview: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AddTrustedMemberRequest: {
        type: 'object',
        required: ['relation'],
        properties: {
          relation: { type: 'string', example: 'mère' },
          trusteePhone: { type: 'string', example: '+221771234567' },
          trusteeName: { type: 'string', example: 'Adama Diop' },
        },
      },

      // ==================== NOTIFICATION ====================
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          data: { type: 'object' },
          readAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Token JWT manquant ou invalide',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFoundError: {
        description: 'Ressource non trouvée',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ValidationError: {
        description: 'Erreur de validation des données entrantes',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ForbiddenError: {
        description: "Abonnement requis ou action non autorisée",
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/docs/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
