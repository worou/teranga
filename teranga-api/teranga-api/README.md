# Téranga API

**Backend Node.js / TypeScript** pour Téranga — l'application de rencontres sérieuses pour l'Afrique francophone.

API REST complète, documentée avec Swagger, prête à être connectée à l'application mobile (React Native) et au site web (Next.js).

---

## ⚡️ Démarrage rapide

### Option 1 — Avec Docker (recommandé)

```bash
# 1. Cloner et configurer
cp .env.example .env

# 2. Lancer Postgres + API
docker-compose up -d

# 3. Appliquer les migrations et insérer des données de test
docker-compose exec api npx prisma migrate deploy
docker-compose exec api npm run prisma:seed

# 4. Ouvrir Swagger
open http://localhost:3000/api-docs
```

### Option 2 — Installation locale

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# → Éditer .env (DATABASE_URL notamment)

# 3. Créer la base (si PostgreSQL local tourne)
npx prisma migrate dev

# 4. Insérer des données de test
npm run prisma:seed

# 5. Lancer le serveur en dev (hot reload)
npm run dev
```

Le serveur tourne sur `http://localhost:3000`.

---

## 📚 Documentation Swagger

Toute l'API est documentée de manière interactive :

- **Swagger UI** → http://localhost:3000/api-docs
- **OpenAPI JSON** → http://localhost:3000/api-docs.json (importable dans Postman)

Vous pouvez **tester chaque endpoint** directement depuis Swagger :

1. Appeler `POST /auth/login` avec un compte de test
2. Copier le `accessToken` renvoyé
3. Cliquer sur 🔒 **Authorize** en haut à droite, coller le token
4. Tous les endpoints protégés sont maintenant testables

### Comptes de test après `prisma:seed`

Mot de passe universel : `Password123!`

| Rôle | Téléphone | Détails |
|---|---|---|
| Femme 🇸🇳 | `+221771000001` | Aminata, Dakar, enseignante |
| Femme 🇸🇳 | `+221771000002` | Fatou, Dakar, pharmacienne (a un enfant) |
| Femme 🇨🇮 | `+2250701000003` | Clarisse, Abidjan, architecte |
| Homme 🇸🇳 **abonné** | `+221771000101` | Ibrahim, Dakar, ingénieur |
| Homme 🇸🇳 *free* | `+221771000102` | Mamadou, Dakar, médecin |
| Homme 🇨🇮 **abonné** | `+2250701000103` | Jean-Paul, Abidjan, avocat |

Deux matches sont pré-créés : Aminata ↔ Ibrahim, Clarisse ↔ Jean-Paul.

---

## 🗂 Structure du projet

```
teranga-api/
├── prisma/
│   ├── schema.prisma     # Modèle DB complet (User, Match, Subscription, etc.)
│   └── seed.ts           # Données de test
├── src/
│   ├── config/
│   │   ├── index.ts      # Configuration app (JWT, CinetPay, pricing...)
│   │   ├── prisma.ts     # Singleton Prisma client
│   │   └── swagger.ts    # Config OpenAPI 3.0
│   ├── middleware/
│   │   ├── auth.ts       # requireAuth, requireSubscriptionForMessaging
│   │   ├── errorHandler.ts
│   │   └── validate.ts   # Zod validator middleware
│   ├── services/
│   │   ├── auth.service.ts        # Register, login, OTP
│   │   ├── users.service.ts       # Profil, photos, biométrie
│   │   ├── discovery.service.ts   # Feed, like, match
│   │   ├── matches.service.ts     # Matches, messages, anti-brouteur
│   │   ├── payments.service.ts    # CinetPay Mobile Money
│   │   ├── subscriptions.service.ts
│   │   └── other.services.ts      # Events, moderation, trusted circle, notifs
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── discovery.routes.ts
│   │   ├── payments.routes.ts
│   │   ├── webhooks.routes.ts
│   │   └── other.routes.ts        # events, moderation, trusted, notifs, admin
│   ├── sockets/
│   │   └── index.ts               # Socket.io (messagerie temps réel)
│   ├── utils/
│   │   ├── AppError.ts
│   │   ├── asyncHandler.ts
│   │   ├── jwt.ts
│   │   ├── logger.ts
│   │   └── helpers.ts
│   ├── validators/
│   │   └── index.ts               # Schémas Zod
│   └── server.ts                  # Point d'entrée Express
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🔐 Authentification

L'API utilise **JWT (access + refresh)** avec vérification OTP par SMS.

### Flux d'inscription typique

```
POST /auth/register
  → crée le compte + envoie un OTP au numéro

POST /auth/otp/verify { phone, code }
  → vérifie le code et retourne { accessToken, refreshToken }
```

### Flux de connexion

```
POST /auth/login { phone, password }
  → retourne { accessToken, refreshToken }
```

### Refresh

```
POST /auth/refresh { refreshToken }
  → nouveau access token + refresh rotaté
```

Tous les endpoints protégés nécessitent le header :
```
Authorization: Bearer <accessToken>
```

---

## 💰 Modèle économique

| | Femmes | Hommes |
|---|---|---|
| Inscription | Gratuite | Gratuite |
| Navigation | Illimitée | 10 profils/jour |
| Likes | Illimités | 5 likes/jour |
| **Messagerie** | **Gratuite** | **Abonnement requis** |
| Événements | Inclus | Selon formule |

### Formules hommes (F CFA)

- **Découverte** — 3 000 F / 1 mois
- **Standard** — 21 000 F / 3 mois (soit 7 000 F/mois) — *le plus choisi*
- **Engagement** — 72 000 F / 6 mois (soit 12 000 F/mois)

### Moyens de paiement (via CinetPay)

Orange Money · Wave · MTN MoMo · Moov Money · M-Pesa · Airtel Money · Carte bancaire · Facturation opérateur

---

## 🛡 Protection anti-brouteur

Chaque message est analysé par un filtre anti-arnaque qui détecte :

- Demandes d'argent ("envoyer argent", "Western Union", "MoneyGram"…)
- Urgences manipulatrices ("maman malade", "bloqué à l'aéroport"…)
- Tentatives visa, crypto, IBAN/RIB
- Harcèlement et insultes

Les messages bloqués :
1. Sont cachés au destinataire
2. Génèrent un signalement automatique à la modération
3. Notifient l'expéditeur du blocage

Implémentation : `src/services/matches.service.ts` — `analyzeMessageForSafety()`.

En production, à étendre avec un appel à un modèle NLP (OpenAI Moderation, Perspective API, ou modèle custom entraîné sur des cas africains).

---

## 🎯 Endpoints principaux (vue d'ensemble)

| Méthode | Endpoint | Description |
|---|---|---|
| **Auth** |||
| POST | `/auth/register` | Inscription + envoi OTP |
| POST | `/auth/login` | Connexion mot de passe |
| POST | `/auth/otp/request` | Demander un code SMS |
| POST | `/auth/otp/verify` | Vérifier code et obtenir token |
| POST | `/auth/refresh` | Rafraîchir le token |
| POST | `/auth/logout` | Déconnexion |
| **Users** |||
| GET | `/users/me` | Mon profil |
| PATCH | `/users/me` | Modifier mon profil |
| DELETE | `/users/me` | Supprimer mon compte |
| GET | `/users/:id` | Profil public d'un autre |
| POST | `/users/me/photos` | Ajouter une photo |
| DELETE | `/users/me/photos/:photoId` | Supprimer une photo |
| PUT | `/users/me/photos/:photoId/main` | Définir comme photo principale |
| POST | `/users/me/biometric-verification` | Soumettre selfie vidéo |
| **Discovery & Matches** |||
| GET | `/discovery/feed` | Fil de profils (filtres : âge, ville, religion…) |
| POST | `/discovery/like` | Liker un profil |
| POST | `/discovery/pass` | Passer un profil |
| GET | `/matches` | Mes matches |
| DELETE | `/matches/:matchId` | Unmatch |
| GET | `/matches/:matchId/messages` | Messages d'un match |
| POST | `/matches/:matchId/messages` | Envoyer un message (anti-brouteur) |
| **Subscriptions & Payments** |||
| GET | `/pricing` | Catalogue des formules (public) |
| GET | `/subscriptions/me` | Mon abonnement actuel |
| POST | `/subscriptions/me/cancel` | Annuler le renouvellement |
| POST | `/payments/subscribe` | Initier un paiement (Mobile Money / carte) |
| GET | `/payments/me` | Historique de mes paiements |
| GET | `/payments/:paymentId/status` | Statut d'un paiement (polling) |
| POST | `/payments/webhook/cinetpay` | Webhook CinetPay (public) |
| **Events** |||
| GET | `/events` | Événements à venir |
| POST | `/events/:id/join` | S'inscrire |
| POST | `/events/:id/leave` | Se désinscrire |
| **Moderation** |||
| POST | `/moderation/reports` | Signaler un utilisateur |
| GET | `/moderation/blocks` | Mes blocages |
| POST | `/moderation/blocks` | Bloquer un utilisateur |
| DELETE | `/moderation/blocks/:id` | Débloquer |
| **Trusted Circle** |||
| GET | `/trusted-circle` | Mon cercle de confiance |
| POST | `/trusted-circle` | Ajouter un proche |
| DELETE | `/trusted-circle/:id` | Retirer un membre |
| **Notifications** |||
| GET | `/notifications` | Mes notifications |
| POST | `/notifications/:id/read` | Marquer comme lu |
| POST | `/notifications/read-all` | Tout marquer comme lu |
| **Admin** |||
| GET | `/admin/reports` | Signalements en attente |
| POST | `/admin/users/:id/ban` | Bannir un utilisateur |
| GET | `/admin/stats` | KPIs globaux |

---

## 🔌 WebSockets (Socket.io)

Connexion temps réel pour la messagerie et les notifications.

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken }
});

// Rejoindre une conversation
socket.emit('join_match', matchId);

// Écouter les nouveaux messages
socket.on('new_message', (message) => { /* ... */ });

// Écouter les nouveaux matches
socket.on('new_match', (match) => { /* ... */ });

// Indicateur "en train d'écrire"
socket.emit('typing', { matchId, isTyping: true });
socket.on('typing', ({ userId, isTyping }) => { /* ... */ });
```

---

## 🌍 Variables d'environnement

Voir `.env.example` pour la liste complète. Points d'attention :

- `JWT_SECRET` → **à changer obligatoirement en production**
- `DATABASE_URL` → PostgreSQL 14+
- `CINETPAY_*` → credentials CinetPay (paiements Mobile Money)
- `ORANGE_SMS_*` → API Orange SMS pour OTP
- `SMILE_*` → Smile Identity pour la vérification biométrique
- `SIGHTENGINE_*` → modération automatique des photos
- `S3_*` → stockage des photos (Scaleway, AWS S3, MinIO...)

---

## 🧪 Tester l'API rapidement

```bash
# 1. Obtenir un token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+221771000001","password":"Password123!"}'

# → récupérer accessToken dans la réponse

# 2. Lister les profils à découvrir
curl http://localhost:3000/api/v1/discovery/feed \
  -H "Authorization: Bearer <accessToken>"

# 3. Voir ses matches
curl http://localhost:3000/api/v1/matches \
  -H "Authorization: Bearer <accessToken>"

# 4. Tester le filtre anti-brouteur
curl -X POST http://localhost:3000/api/v1/matches/<matchId>/messages \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"content":"envoie-moi 50000 F par Western Union, ma mère est malade"}'

# → sera bloqué avec 403
```

---

## 📦 Build production

```bash
# Compilation TypeScript
npm run build

# Déploiement Docker
docker build -t teranga-api .
docker run -p 3000:3000 --env-file .env teranga-api
```

---

## 🚀 Prochaines étapes d'industrialisation

- [ ] Tests unitaires (Jest) et e2e (Supertest)
- [ ] Vérification HMAC sur le webhook CinetPay
- [ ] Upload direct S3 avec URLs signées pour les photos
- [ ] Appel réel à Smile Identity pour biométrie
- [ ] Intégration Sightengine pour la modération auto des photos
- [ ] Modèle ML de détection anti-brouteur entraîné sur corpus local
- [ ] Cache Redis pour le feed de découverte
- [ ] Notifications push (Firebase Cloud Messaging)
- [ ] CI/CD (GitHub Actions)
- [ ] Monitoring (Sentry + Prometheus/Grafana)

---

**Fait avec ❤️ pour l'Afrique.**
