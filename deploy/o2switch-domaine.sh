#!/bin/bash
# =============================================================================
#  Téranga — faire pointer le site sur un nom de domaine
#
#  À EXÉCUTER SUR LE SERVEUR, en SSH :
#      ssh rise9482@cassis.o2switch.net
#      bash ~/teranga/deploy/o2switch-domaine.sh teranga.re
#
#  Le script est idempotent : le relancer ne casse rien et reprend là où il en
#  est. Il ne fait qu'une chose, mais entièrement — déclarer le domaine sur le
#  compte, l'autoriser côté API, redémarrer, puis demander le certificat.
#
#  PRÉALABLE — le domaine doit DÉJÀ ÊTRE ENREGISTRÉ et délégué à ce serveur.
#  L'enregistrement est un acte contractuel (identité du titulaire, adresse
#  dans l'UE/EEE pour un .re) : il se fait depuis https://clients.o2switch.fr,
#  pas ici. Le script refuse de s'exécuter tant que ce n'est pas le cas —
#  configurer un domaine qui ne résout pas produit un site à moitié câblé et
#  un certificat en échec, deux pannes silencieuses.
# =============================================================================
set -euo pipefail

DOMAINE="${1:-}"
ROOT="$HOME/teranga"
DOCROOT="$HOME/public_html"

log()  { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✔\033[0m %s\n' "$*"; }
info() { printf '  \033[0;36mi\033[0m %s\n' "$*"; }
fail() { printf '  \033[0;31m✘\033[0m %s\n' "$*"; exit 1; }

[ -n "$DOMAINE" ] || fail "Usage : bash deploy/o2switch-domaine.sh <domaine>   (ex. teranga.re)"
case "$DOMAINE" in
  *.*) ;;
  *)   fail "« $DOMAINE » n'est pas un nom de domaine." ;;
esac

# --- 0. Le domaine existe-t-il vraiment ? ------------------------------------
# Deux questions distinctes : est-il enregistré (résout-il ?) et pointe-t-il
# ICI (sinon on configure un site que personne n'atteindra).
log "Vérification du domaine « $DOMAINE »"

# `|| true` indispensable : getent sort en code 2 quand le nom est inconnu, et
# `set -e` tuerait le script AVANT le message qui explique quoi faire — un
# échec silencieux là où l'utilisateur a précisément besoin d'être guidé.
IP_DOMAINE=$(getent hosts "$DOMAINE" 2>/dev/null | awk '{print $1}' | head -1 || true)

if [ -z "$IP_DOMAINE" ]; then
  fail "$DOMAINE ne résout pas : pas encore enregistré, ou délégation non propagée.
     → Réclamez-le sur https://clients.o2switch.fr
       Gérer mes services → « … » de l'hébergement → Choisir mon domaine offert
     Puis relancez ce script. La propagation prend de quelques minutes à 2 h."
fi
ok "$DOMAINE résout vers $IP_DOMAINE"

# IP publique du compte, telle que cPanel la connaît.
IP_SERVEUR=$(getent hosts "$(hostname -f)" 2>/dev/null | awk '{print $1}' | head -1 || true)
if [ -n "$IP_SERVEUR" ] && [ "$IP_DOMAINE" != "$IP_SERVEUR" ]; then
  info "Ce serveur répond en $IP_SERVEUR, le domaine pointe vers $IP_DOMAINE."
  info "Si le domaine vient d'être créé, la propagation n'est peut-être pas finie."
  read -r -p "  Continuer quand même ? [o/N] " reponse
  case "$reponse" in
    o|O) ;;
    *)   fail "Interrompu." ;;
  esac
fi

# --- 1. Déclarer le domaine sur le compte ------------------------------------
# En ALIAS et non en « domaine additionnel » : un alias sert exactement le même
# docroot, donc la même application Passenger, sans dupliquer la configuration.
log "Déclaration du domaine sur le compte cPanel"

DOMAINES_JSON=$(uapi --output=json DomainInfo list_domains 2>/dev/null || echo '{}')
PRINCIPAL=$(printf '%s' "$DOMAINES_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['main_domain'])" 2>/dev/null || echo '')
[ -n "$PRINCIPAL" ] || fail "Impossible de lire les domaines du compte (uapi indisponible ?)."

DEJA=$(printf '%s' "$DOMAINES_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)['result']['data']
tous = [d['main_domain']] + d.get('addon_domains', []) + d.get('parked_domains', []) + d.get('sub_domains', [])
print('\n'.join(tous))
" | grep -Fx "$DOMAINE" || true)

if [ -n "$DEJA" ]; then
  ok "$DOMAINE est déjà déclaré sur le compte"
else
  REPONSE=$(uapi --output=json Park park domain="$DOMAINE" 2>&1 || true)
  STATUT=$(printf '%s' "$REPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['status'])" 2>/dev/null || echo 0)
  if [ "$STATUT" = "1" ]; then
    ok "$DOMAINE ajouté en alias de $PRINCIPAL"
  else
    printf '%s\n' "$REPONSE" | head -20
    fail "Ajout refusé par cPanel. À faire à la main : cPanel → Domaines → Créer un domaine."
  fi
fi

# --- 2. Nettoyer la redirection morte vers l'IP nue --------------------------
# cPanel avait posé une redirection 301 vers https://109.234.166.165/ pour
# teranga.com. Une IP nue ne peut présenter aucun certificat valide : c'est
# exactement l'avertissement de sécurité observé dans le navigateur.
log "Nettoyage du .htaccess"
if grep -q '109\.234\.166\.165' "$DOCROOT/.htaccess" 2>/dev/null; then
  cp "$DOCROOT/.htaccess" "$DOCROOT/.htaccess.avant-domaine"
  python3 - "$DOCROOT/.htaccess" <<'PY'
import io, re, sys

chemin = sys.argv[1]
s = io.open(chemin, encoding='utf-8', errors='surrogateescape').read()

# Le bloc fautif : la suite de RewriteCond qui le précède, puis la RewriteRule
# qui redirige vers l'IP nue. On retire l'ensemble, pas seulement la règle :
# des RewriteCond orphelines s'appliqueraient à la règle suivante.
motif = re.compile(
    r'(?:^RewriteCond .*\n)+^RewriteRule [^\n]*109[^\n]*166[^\n]*165[^\n]*\n',
    re.MULTILINE,
)
s2, n = motif.subn('', s)
io.open(chemin, 'w', encoding='utf-8', errors='surrogateescape').write(s2)
print('    blocs de redirection supprimés : %d' % n)
PY
  ok "redirection vers l'IP nue retirée (sauvegarde : .htaccess.avant-domaine)"
else
  ok "aucune redirection parasite"
fi

# --- 3. Autoriser le domaine côté API ----------------------------------------
# Sans cela le navigateur charge la page mais toutes les requêtes API sont
# refusées par CORS : un site qui s'affiche et ne fait rien.
log "Origines autorisées (CORS)"
ORIGINES="https://$DOMAINE,https://www.$DOMAINE,http://$DOMAINE,http://www.$DOMAINE,https://$PRINCIPAL,http://$PRINCIPAL"

for svc in frontoffice backoffice; do
  ENV="$ROOT/$svc/.env"
  [ -f "$ENV" ] || fail "$ENV introuvable."
  if grep -q "^CORS_ORIGIN=.*[/.]$DOMAINE\(,\|$\)" "$ENV"; then
    ok "$svc : $DOMAINE déjà autorisé"
  else
    cp "$ENV" "$ENV.avant-domaine"
    python3 - "$ENV" "$ORIGINES" <<'PY'
import io, sys

chemin, origines = sys.argv[1], sys.argv[2]
lignes = io.open(chemin, encoding='utf-8').read().splitlines(True)
trouve = False
for i, ligne in enumerate(lignes):
    if ligne.startswith('CORS_ORIGIN='):
        lignes[i] = 'CORS_ORIGIN=%s\n' % origines
        trouve = True
if not trouve:
    if lignes and not lignes[-1].endswith('\n'):
        lignes[-1] += '\n'
    lignes.append('CORS_ORIGIN=%s\n' % origines)
io.open(chemin, 'w', encoding='utf-8').write(''.join(lignes))
PY
    ok "$svc : CORS_ORIGIN mis à jour (sauvegarde : .env.avant-domaine)"
  fi
done

# --- 4. Redémarrer les applications ------------------------------------------
# Passenger ne relit .env qu'au démarrage : sans redémarrage, le nouveau
# CORS_ORIGIN reste lettre morte.
log "Redémarrage des applications"
for svc in frontoffice backoffice; do
  mkdir -p "$ROOT/$svc/tmp"
  touch "$ROOT/$svc/tmp/restart.txt"
  ok "$svc marqué pour redémarrage"
done
sleep 8

# --- 5. Certificat SSL --------------------------------------------------------
log "Certificat SSL"
if uapi --output=json SSL start_autossl_check >/dev/null 2>&1; then
  ok "AutoSSL déclenché — l'émission prend quelques minutes"
else
  info "AutoSSL non déclenchable en ligne de commande sur ce compte."
  info "cPanel → SSL/TLS Status → cocher $DOMAINE → « Run AutoSSL »"
fi

# --- 6. Vérifications ---------------------------------------------------------
log "Vérifications"
for chemin in /health /api/v1/discovery/feed /admin; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://$DOMAINE$chemin" || echo 000)
  printf '  %-52s %s\n' "http://$DOMAINE$chemin" "$code"
done

cat <<FIN

  Attendu : /health et /api/v1/discovery/feed en 200, /admin en 200 ou 302.

  Le HTTPS suit dès qu'AutoSSL a émis le certificat (quelques minutes à 1 h).
  Contrôle : curl -sI https://$DOMAINE/health

  Pourquoi l'émission aboutira ici alors qu'elle échouait sur $PRINCIPAL :
  Let's Encrypt lit les enregistrements CAA en remontant l'arbre du domaine.
  Pour $PRINCIPAL il traverse odns.fr, dont la zone renvoie SERVFAIL sur les
  serveurs d'o2switch — un échec dur, pas une absence. La chaîne de $DOMAINE
  ne passe plus par odns.fr.

  Cette zone odns.fr reste cassée et mérite un signalement à o2switch,
  indépendamment de ce domaine.

FIN
