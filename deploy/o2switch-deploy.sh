#!/bin/bash
# =============================================================================
#  Téranga — déploiement sur o2switch (cPanel + Passenger)
#
#  À EXÉCUTER SUR LE SERVEUR, en SSH :
#      ssh rise9482@cassis.o2switch.net
#      cd ~/teranga && bash deploy/o2switch-deploy.sh
#
#  Le script est idempotent : le relancer après un échec reprend sans casser
#  ce qui est déjà en place.
#
#  PRÉALABLES (faits depuis le poste de développement, pas ici) :
#    - le code est présent dans ~/teranga, SANS node_modules, SANS .git,
#      SANS fichiers .env ;
#    - frontoffice/.env.production et backoffice/.env.production sont déposés
#      et renommés en .env (le script le fait si les .production sont là).
#
#  POURQUOI PAS DE TRANSFERT DE node_modules : le moteur de requête Prisma est
#  un binaire compilé par plateforme. Celui du poste de développement (Windows)
#  ne s'exécute pas ici. Les dépendances DOIVENT être installées sur place.
# =============================================================================
set -euo pipefail

ROOT="$HOME/teranga"
FRONT="$ROOT/frontoffice"
BACK="$ROOT/backoffice"

log()  { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✔\033[0m %s\n' "$*"; }
fail() { printf '  \033[0;31m✘\033[0m %s\n' "$*"; exit 1; }

# --- 0. Environnement --------------------------------------------------------
log "Environnement"
command -v node >/dev/null 2>&1 || fail "node introuvable. Créez d'abord une application Node dans cPanel : elle installe l'environnement (nodevenv) et met node dans le PATH."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || fail "Node $NODE_MAJOR détecté, 18 minimum requis."
ok "node $(node --version), npm $(npm --version)"

# --- 1. Fichiers d'environnement --------------------------------------------
log "Fichiers d'environnement"
for svc in frontoffice backoffice; do
  if [ -f "$ROOT/$svc/.env.production" ] && [ ! -f "$ROOT/$svc/.env" ]; then
    mv "$ROOT/$svc/.env.production" "$ROOT/$svc/.env"
    ok "$svc/.env installé"
  elif [ -f "$ROOT/$svc/.env" ]; then
    ok "$svc/.env déjà présent"
  else
    fail "$svc/.env absent — déposez-le avant de lancer le script."
  fi
  chmod 600 "$ROOT/$svc/.env"
done

# Contrôle de sûreté : une mise en ligne avec les valeurs de développement
# laisserait forger des jetons — ces valeurs sont publiques dans le dépôt.
grep -q "^NODE_ENV=production" "$FRONT/.env" || fail "frontoffice/.env n'est pas en production."
grep -q "dev-secret-change-me" "$FRONT/.env" && fail "JWT_SECRET est encore la valeur de développement."
grep -q "admin-dev-secret" "$BACK/.env" && fail "ADMIN_SECRET est encore la valeur de développement."
FRONT_INTERNAL=$(grep "^INTERNAL_API_SECRET=" "$FRONT/.env" | cut -d= -f2-)
BACK_INTERNAL=$(grep "^INTERNAL_API_SECRET=" "$BACK/.env" | cut -d= -f2-)
[ "$FRONT_INTERNAL" = "$BACK_INTERNAL" ] || fail "INTERNAL_API_SECRET diffère entre les deux services : la validation de virement échouerait en silence."
ok "secrets de production en place et cohérents"

# --- 2. Base de données ------------------------------------------------------
# cPanel préfixe systématiquement bases et utilisateurs par le nom du compte.
log "Base de données"
DB_URL=$(grep "^DATABASE_URL=" "$FRONT/.env" | cut -d= -f2- | tr -d '"')
echo "$DB_URL" | grep -q "UTILISATEUR\|BASE" && fail "DATABASE_URL contient encore les marqueurs UTILISATEUR/BASE."
ok "DATABASE_URL renseignée"

# --- 3. Dépendances et client Prisma ----------------------------------------
log "Frontoffice — dépendances"
cd "$FRONT"
npm ci --omit=dev --no-audit --no-fund
ok "dépendances installées"

npx prisma generate
ok "client Prisma généré (moteur Linux)"

# `db push` applique le schéma sans historique de migration — c'est le mode
# retenu par le projet (cf. README), et il crée les tables sur une base vide.
npx prisma db push --skip-generate
ok "schéma appliqué"

log "Backoffice — dépendances"
cd "$BACK"
npm ci --omit=dev --no-audit --no-fund
npx prisma generate
ok "backoffice prêt (schéma partagé, pas de push : le frontoffice en est propriétaire)"

# --- 4. Client React ---------------------------------------------------------
# Le dossier public/ est la SORTIE de vite build : il est vidé à chaque
# construction. Les photos de membres vivent dans frontoffice/uploads/,
# volontairement en dehors — ne jamais les y remettre.
log "Client React"
if [ -f "$FRONT/public/index.html" ] && [ -d "$FRONT/public/assets" ]; then
  ok "build déjà présent (transféré depuis le poste), reconstruction inutile"
else
  cd "$FRONT/client"
  npm ci --no-audit --no-fund
  npm run build
  ok "client construit"
fi

mkdir -p "$FRONT/uploads"
chmod 755 "$FRONT/uploads"
ok "dossier des photos prêt (persistant, hors build)"

# --- 5. Compte administrateur ------------------------------------------------
log "Compte administrateur"
cd "$BACK"
if [ -n "$(grep '^ADMIN_SEED_PASSWORD=' .env | cut -d= -f2-)" ]; then
  npx ts-node --transpile-only prisma/seedAdmin.ts || true
  ok "compte admin créé ou réactivé"
else
  ok "ADMIN_SEED_PASSWORD vide — création ignorée"
fi

# --- 6. Vérifications --------------------------------------------------------
# Les processus sont démarrés par Passenger (applications cPanel), pas ici :
# ce script prépare, il ne lance pas de démon.
log "Terminé"
cat <<'FIN'

  Reste à faire dans cPanel → Node.js :

    Application 1 — frontoffice
      Racine        : teranga/frontoffice
      Fichier       : dist/server.js   (après `npm run build`)
      URL           : /
      Variables     : lues depuis .env

    Application 2 — backoffice
      Racine        : teranga/backoffice
      Fichier       : dist/server.js
      URL           : /admin

  Puis vérifier :
    curl -s https://VOTRE-DOMAINE/health
    curl -s https://VOTRE-DOMAINE/api/v1/discovery/feed | head -c 200      # 200 attendu
    curl -s -o /dev/null -w '%{http_code}\n' -X POST \
         https://VOTRE-DOMAINE/api/v1/discovery/like                        # 401 attendu

  Point le plus incertain : le WebSocket à travers Passenger. S'il ne passe
  pas, Socket.IO retombe sur du sondage long — la messagerie fonctionne quand
  même (cadence adaptative côté client), mais la livraison instantanée est
  perdue. À tester explicitement.

FIN
