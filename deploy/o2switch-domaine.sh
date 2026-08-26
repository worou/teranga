#!/bin/bash
# =============================================================================
#  Téranga — faire pointer le site sur un nom de domaine
#
#  À EXÉCUTER SUR LE SERVEUR, en SSH :
#      ssh rise9482@cassis.o2switch.net
#      bash ~/teranga/deploy/o2switch-domaine.sh teranga.re
#
#  Le script est idempotent : le relancer ne casse rien et reprend là où il en
#  est. Il vérifie d'abord, agit ensuite, et s'arrête net dès qu'une étape
#  hors de sa portée n'a pas été faite.
#
#  CE QU'IL FAIT      : nettoie le .htaccess, met à jour les origines CORS,
#                       redémarre les applications et vérifie que le site
#                       répond sur le nouveau nom.
#  CE QU'IL NE FAIT PAS, et ce n'est pas un oubli :
#    - enregistrer le domaine — acte contractuel (identité du titulaire,
#      adresse dans l'UE/EEE pour un .re), à faire sur clients.o2switch.fr ;
#    - le déclarer sur le compte — les modules UAPI `Park` et `AddonDomain`
#      ne sont pas installés sur ce cPanel, la création passe par l'interface ;
#    - émettre le certificat — la fonctionnalité `autossl` est désactivée sur
#      ce compte, o2switch fournit son propre outil « Let's Encrypt™ SSL »,
#      sans ligne de commande.
#  Pour chacune, le script s'arrête en indiquant précisément la marche à
#  suivre, puis reprend le reste au lancement suivant. Continuer sans elles
#  laisserait une configuration désignant un domaine que le serveur ne sert
#  pas : un site qui s'affiche et ne fonctionne pas, sans message d'erreur.
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

# Domaine principal du compte : sert de référence pour savoir où le site est
# réellement servi. `hostname -f` ne convient pas — il résout en IPv6
# lien-local (fe80::…), qui ne correspondra jamais à l'IPv4 d'un domaine.
DOMAINES_JSON=$(uapi --output=json DomainInfo list_domains 2>/dev/null || echo '{}')
PRINCIPAL=$(printf '%s' "$DOMAINES_JSON" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['data']['main_domain'])" 2>/dev/null || echo '')
[ -n "$PRINCIPAL" ] || fail "Impossible de lire les domaines du compte (uapi indisponible ?)."

# `|| true` indispensable : getent sort en code 2 quand le nom est inconnu, et
# `set -e` tuerait le script AVANT le message qui explique quoi faire — un
# échec silencieux là où l'utilisateur a précisément besoin d'être guidé.
# `ahostsv4` plutôt que `hosts` : on compare des IPv4 entre elles.
ip4() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | head -1 || true; }

IP_DOMAINE=$(ip4 "$DOMAINE")
if [ -z "$IP_DOMAINE" ]; then
  fail "$DOMAINE ne résout pas : pas encore enregistré, ou délégation non propagée.
     → Réclamez-le sur https://clients.o2switch.fr
       Gérer mes services → « … » de l'hébergement → Choisir mon domaine offert
     Puis relancez ce script. La propagation prend de quelques minutes à 2 h."
fi
ok "$DOMAINE résout vers $IP_DOMAINE"

IP_SERVEUR=$(ip4 "$PRINCIPAL")
if [ -n "$IP_SERVEUR" ] && [ "$IP_DOMAINE" != "$IP_SERVEUR" ]; then
  info "Le site est servi en $IP_SERVEUR ($PRINCIPAL), ce domaine pointe vers $IP_DOMAINE."
  info "Si le domaine vient d'être créé, la propagation n'est peut-être pas finie."
  # Sans terminal (exécution par ssh non interactive), `read` reçoit EOF : le
  # script s'arrêterait sur une simple mise en garde. On avertit et on
  # poursuit — les vérifications finales montreront le résultat réel.
  if [ -t 0 ]; then
    read -r -p "  Continuer quand même ? [o/N] " reponse
    case "$reponse" in
      o|O) ;;
      *)   fail "Interrompu." ;;
    esac
  else
    info "Pas de terminal : on poursuit malgré l'écart."
  fi
else
  ok "le domaine pointe bien vers le serveur du site"
fi

# --- 1. Le domaine est-il déclaré sur le compte ? ----------------------------
# Ce script NE CRÉE PAS le domaine, et ce n'est pas un oubli : sur ce compte,
# aucune API ne le permet. Les modules UAPI `Park` et `AddonDomain` ne sont
# pas installés (« Can't locate Cpanel/API/Park.pm »), et `SubDomain` ne sait
# créer que des sous-domaines d'un domaine existant. La création passe
# obligatoirement par l'interface cPanel.
#
# Le script s'arrête donc ici avec la marche à suivre, plutôt que de continuer
# et de laisser une configuration qui désigne un domaine que le serveur ne
# sert pas.
log "Déclaration du domaine sur le compte cPanel"

DEJA=$(printf '%s' "$DOMAINES_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)['result']['data']
tous = [d['main_domain']] + d.get('addon_domains', []) + d.get('parked_domains', []) + d.get('sub_domains', [])
print('\n'.join(tous))
" | grep -Fx "$DOMAINE" || true)

if [ -n "$DEJA" ]; then
  ok "$DOMAINE est déjà déclaré sur le compte"
else
  fail "$DOMAINE n'est pas encore déclaré sur le compte.

     Dans cPanel (https://cassis.o2switch.net:2083) → Domaines → Créer un domaine :
       Domaine          : $DOMAINE
       Racine du document : décocher « créer un nouveau répertoire »
                            et indiquer  public_html
     Le même répertoire que $PRINCIPAL : les deux noms servent alors la même
     application, sans dupliquer la configuration Passenger.

     Puis relancez ce script — il enchaînera tout le reste."
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
#
# Deux subtilités, l'une et l'autre vérifiées sur ce serveur :
#   - Passenger ne consulte restart.txt qu'À LA REQUÊTE SUIVANTE. Toucher le
#     fichier puis attendre ne déclenche rien ; il faut réveiller l'application.
#   - Il ne supprime pas restart.txt. Sa présence ne prouve donc rien : seul
#     le changement de PID atteste du redémarrage.
log "Redémarrage des applications"
for svc in frontoffice backoffice; do
  AVANT=$(pgrep -f "teranga/$svc" | head -1 || true)
  mkdir -p "$ROOT/$svc/tmp"
  touch "$ROOT/$svc/tmp/restart.txt"
  curl -s -o /dev/null --max-time 25 "http://$PRINCIPAL/health" || true
  sleep 5
  APRES=$(pgrep -f "teranga/$svc" | head -1 || true)
  if [ -n "$AVANT" ] && [ "$AVANT" != "$APRES" ]; then
    ok "$svc redémarré (PID $AVANT → ${APRES:-?})"
  elif [ -z "$AVANT" ]; then
    ok "$svc n'était pas démarré — il le sera à la première requête"
  else
    info "$svc : PID inchangé ($AVANT). Redémarrez-le depuis cPanel → Node.js"
    info "  si les requêtes API restent refusées par CORS."
  fi
done

# --- 5. Certificat SSL --------------------------------------------------------
# Là encore, pas d'automatisation possible : la fonctionnalité `autossl` est
# désactivée sur ce compte (« You do not have the feature autossl ») et
# o2switch fournit à la place son propre outil « Let's Encrypt™ SSL », qui
# n'expose aucune ligne de commande. L'émission se demande depuis cPanel.
log "Certificat SSL"
CERT=$(echo | openssl s_client -connect "$DOMAINE:443" -servername "$DOMAINE" 2>/dev/null \
       | openssl x509 -noout -issuer 2>/dev/null || true)
case "$CERT" in
  *"Let's Encrypt"*|*"E5"*|*"R10"*|*"R11"*) ok "certificat reconnu déjà en place : $CERT" ;;
  *) info "Pas encore de certificat reconnu (actuel : ${CERT:-aucun})"
     info "cPanel → Let's Encrypt™ SSL → « Issue » sur $DOMAINE (+ www)" ;;
esac

# --- 6. Vérifications ---------------------------------------------------------
log "Vérifications"
for chemin in /health /api/v1/discovery/feed /admin; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://$DOMAINE$chemin" || echo 000)
  printf '  %-52s %s\n' "http://$DOMAINE$chemin" "$code"
done

cat <<FIN

  Attendu : /health et /api/v1/discovery/feed en 200, /admin en 200 ou 302.

  Dernière étape, dans cPanel → Let's Encrypt™ SSL :
    « Issue » sur $DOMAINE en cochant aussi www.$DOMAINE
  Contrôle ensuite : curl -sI https://$DOMAINE/health

  Pourquoi l'émission aboutira ici alors qu'elle échouait sur $PRINCIPAL :
  Let's Encrypt lit les enregistrements CAA en remontant l'arbre du domaine.
  Pour $PRINCIPAL il traverse odns.fr, dont la zone renvoie SERVFAIL sur les
  serveurs d'o2switch — un échec dur, pas une absence. La chaîne de $DOMAINE
  ne passe plus par odns.fr.

  Cette zone odns.fr reste cassée et mérite un signalement à o2switch,
  indépendamment de ce domaine.

FIN
