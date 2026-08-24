# Téranga

Application de rencontre sérieuse pour l'Afrique de l'Ouest francophone (zone UEMOA / F CFA).
Modèle *freemium* : gratuit et illimité pour les femmes ; abonnement payant pour débloquer la
messagerie côté hommes. Paiements adaptés à la région (mobile money, carte, PayPal, virement).

> ⚠️ **Sécurité** — Ne versionnez **jamais** de secrets. Les fichiers `.env` sont ignorés par Git ;
> seuls les `*.env.example` (valeurs d'exemple) sont suivis. Coordonnées bancaires, clés API et
> emails réels se configurent uniquement via l'environnement.

## Structure du dépôt

| Dossier | Rôle | Stack |
|---|---|---|
| `frontoffice/` | API publique (Express) **+** client React (Vite) servi en statique | TypeScript, Express, Prisma, React |
| `backoffice/` | Console d'administration (auth dédiée, gestion membres/paiements/abonnements) | TypeScript, Express, Prisma, SPA HTML |
| `teranga-api/` | Module API complémentaire | TypeScript |

Le **backoffice** partage la **même base MySQL** que le frontoffice (source de vérité). Les actions
sensibles (ex. validation d'un virement) sont relayées au frontoffice, qui détient la logique
canonique d'activation d'abonnement.

## Prérequis

- Node.js ≥ 18
- MySQL / MariaDB (ex. XAMPP en local)

## Installation & démarrage (dev)

Pour **chaque** service (`frontoffice`, `backoffice`) :

```bash
cd frontoffice            # puis, séparément, cd backoffice
cp .env.example .env      # renseigner les valeurs (DB, secrets, paiements…)
npm install
npx prisma migrate deploy # applique le schéma (frontoffice = propriétaire du schéma)
npm run dev               # API en mode watch
```

> **Base déjà créée par `db push` ?** Les migrations ont été introduites après
> coup. Une base existante doit être *baselinée* une fois, sinon
> `migrate deploy` tentera de recréer des tables déjà là :
>
> ```bash
> cd frontoffice
> npx prisma migrate resolve --applied 0_init
> ```
>
> Le backoffice n'a pas de migrations : il partage la base du frontoffice, qui
> seul possède le schéma. Ne jamais y lancer `prisma migrate`.

Client React (frontoffice) :

```bash
cd frontoffice/client
npm install
npm run dev               # dev server Vite
```

Compte administrateur initial (backoffice) :

```bash
cd backoffice
npx ts-node --transpile-only prisma/seedAdmin.ts   # mot de passe généré et affiché une fois
```

## Mise en production

Points bloquants vérifiés avant tout déploiement :

1. **Secrets.** `JWT_SECRET`, `INTERNAL_API_SECRET` (frontoffice) et en plus
   `ADMIN_SECRET` (backoffice) doivent être renseignés, longs d'au moins 32
   caractères, et différents des valeurs d'exemple — celles-ci sont publiées
   dans ce dépôt. Les deux services **refusent de démarrer** sinon.
   `INTERNAL_API_SECRET` doit être **identique** des deux côtés.

   ```bash
   openssl rand -base64 48
   ```

2. **Reverse proxy.** Derrière nginx, un load balancer ou une plateforme type
   Heroku/Render, poser `TRUST_PROXY=1`. Sans cela, la limitation de débit voit
   l'adresse du proxy et compte tous les utilisateurs dans un seul seau. Ne pas
   le poser sans proxy devant : `X-Forwarded-For` deviendrait forgeable.

3. **Photos des membres.** Elles sont écrites sur disque, dans `UPLOAD_DIR`
   (`frontoffice/uploads` par défaut). **Ce dossier doit être un volume
   persistant**, sinon toutes les photos disparaissent à chaque redéploiement.
   Le `Dockerfile` le déclare en `VOLUME` ; il reste à le monter côté
   orchestrateur.

4. **Base de données.** `prisma migrate deploy` s'exécute au démarrage du
   conteneur. Sur une base préexistante, la baseliner d'abord (voir ci-dessus).

## Build de production

```bash
# frontoffice : API + client (le client se construit dans public/, servi par Express)
cd frontoffice && npm run build:all

# backoffice
cd backoffice && npm run build
```

## Tests

Suite du frontoffice (abonnements & paiements — mobile money, carte, PayPal, virement, SMS OTP) :

```bash
cd frontoffice && npm test
```

## Configuration des paiements & SMS

Tout se configure via l'environnement (voir `frontoffice/.env.example`) :

- **CinetPay** (`CINETPAY_*`) — mobile money + carte bancaire (zone F CFA).
- **PayPal** (`PAYPAL_*`) — diaspora, facturé en EUR (parité fixe CFA).
- **Virement bancaire** (`BANK_TRANSFER_*`) — SEPA/EUR, validé manuellement depuis le backoffice.
- **Twilio** (`TWILIO_*`) — envoi des codes OTP par SMS.
- **INTERNAL_API_SECRET** — secret partagé (valeur **identique** frontoffice/backoffice) pour les
  actions admin internes ; obligatoire en production.

Sans clés configurées, les intégrations retombent sur un mode simulé/journalisé pour le
développement local.
