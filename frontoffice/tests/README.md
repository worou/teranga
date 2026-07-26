# Jeu de test — Abonnement & Paiement mobile

Couvre les deux modules critiques du frontoffice Téranga : la souscription /
cycle de vie des abonnements, et l'encaissement mobile money via CinetPay.

## Lancer

```bash
npm test                        # toute la suite
npx ts-node --transpile-only tests/payments.webhook.test.ts   # un seul fichier
```

Pour voir les logs applicatifs (silencieux par défaut) :

```bash
$env:TEST_LOGS=1; npm test      # PowerShell
TEST_LOGS=1 npm test            # bash
```

Le code de sortie vaut `1` dès qu'une assertion échoue (utilisable en CI).

## Aucune dépendance externe

Les tests s'exécutent **sans base de données, sans réseau et sans framework de
test supplémentaire** : `node:test` + `node:assert` via `ts-node`, déjà présents.

`tests/helpers/setup.ts` substitue trois modules dans le cache CommonJS *avant*
que le moindre fichier de `src/` ne soit chargé — le code de production n'est pas
modifié pour être testable :

| Module remplacé      | Par                     | Pourquoi                                   |
| -------------------- | ----------------------- | ------------------------------------------ |
| `src/config/prisma`  | `helpers/fakePrisma`    | store en mémoire, aucune base requise      |
| `axios`              | `helpers/cinetpayMock`  | API CinetPay simulée, aucun appel réseau   |
| `src/utils/logger`   | no-op                   | sortie de test lisible (`TEST_LOGS=1`)     |

Les variables d'environnement sont posées avant le premier chargement de
`src/config`. Comme `dotenv` n'écrase jamais une variable déjà définie, le `.env`
de développement ne peut pas faire basculer les tests dans la branche « mock dev »
du service : c'est bien le chemin de **production** (vérification HMAC +
ré-interrogation de CinetPay + contrôle du montant) qui est exercé. La branche
mock dev a ses propres tests, explicitement isolés via `withConfig()`.

### Le double Prisma respecte les sémantiques qui comptent

`PaymentsService.completePayment()` repose sur
`updateMany({ where: { status: { in: ['PENDING','PROCESSING'] } } })` et traite
`count === 1` comme « j'ai remporté la transition ». Un double renvoyant toujours
`count: 1` ferait passer les tests d'idempotence **à tort** : `fakePrisma` mute
donc réellement les lignes et renvoie `count: 0` sur une transition déjà jouée.
Tout opérateur de filtre non implémenté lève une erreur explicite plutôt que
d'être ignoré silencieusement.

## Contenu

| Fichier                          | Portée                                                                 |
| -------------------------------- | ---------------------------------------------------------------------- |
| `cinetpayHmac.test.ts`           | Signature HMAC-SHA256 des notifications (dont l'ordre des champs signés) |
| `mobileMoney.test.ts`            | Référentiel opérateurs/pays zone F CFA, indicatifs, canaux CinetPay, validateur `subscribeSchema` |
| `payments.initiate.test.ts`      | Catalogue tarifaire, moyens de paiement par pays, initiation, échecs provider |
| `payments.webhook.test.ts`       | Confirmation, sécurité, idempotence, concurrence, renouvellement/upgrade |
| `payments.status.test.ts`        | Repli par sondage quand le webhook se perd                             |
| `subscriptions.service.test.ts`  | Consultation et résiliation de l'abonnement                            |
| `subscriptionLifecycle.test.ts`  | Job quotidien : expiration + rappels J-3                               |

### Invariants métier vérifiés

- **Argent** — le montant et la devise réellement encaissés sont recoupés avec le
  tarif du plan ; un écart bascule le paiement en `FAILED` sans ouvrir d'accès.
- **Authenticité** — une notification non signée, mal signée ou rejouée après
  altération est rejetée (401) et ne modifie rien.
- **Source de vérité** — le corps du webhook n'est jamais cru : CinetPay est
  ré-interrogé, et son démenti (`REFUSED`) l'emporte sur un corps « SUCCES ».
- **Idempotence** — webhook rejoué, webhook + sondage concurrents, double
  sondage : l'abonnement n'est crédité qu'une fois (date d'expiration
  strictement identique après rejeu).
- **Durées** — 1 / 3 / 6 mois selon le plan ; un abonnement encore actif est
  prolongé depuis son échéance, pas depuis la date du paiement.
- **Zone F CFA** — hors UEMOA, ou opérateur absent du pays, ou indicatif
  incohérent : refus **avant** tout appel au provider, sans ligne de paiement.
- **Résiliation** — coupe le renouvellement sans avancer l'échéance.
- **Cycle de vie** — un seul rappel par cycle, jamais sur `FREE` ni sur les
  abonnements déjà résiliés ou expirés.

## Validation par mutation

La suite a été vérifiée en injectant des régressions dans le code de production
et en confirmant qu'elle les détecte (sources restaurées ensuite) :

| Régression injectée                                        | Tests en échec |
| ---------------------------------------------------------- | -------------- |
| `completePayment` gagne toujours la transition              | 1              |
| Vérification HMAC désactivée                                | 3              |
| Contrôle du montant / de la devise supprimé                 | 2              |
| Prolongation calculée depuis `now` au lieu de l'échéance    | 2              |
| Rappel de renouvellement non limité à un par cycle          | 1              |
| Indicatif pays non vérifié                                  | 4              |
| Wave routé sur le mauvais canal CinetPay                    | 2              |
| MTN MoMo ouvert au Sénégal                                  | 5              |
| Expiration touchant les abonnements déjà expirés            | 2              |
| Résiliation coupant l'accès immédiatement                   | 3              |

> `scripts/paymentsSmoke.ts` (assertions HMAC + opérateurs, sans base) reste
> fonctionnel mais est entièrement couvert par `cinetpayHmac.test.ts` et
> `mobileMoney.test.ts`.

## Ajouter un test

1. Créer `tests/<sujet>.test.ts` commençant par `import './helpers/setup';`
   (cet import doit rester le **premier** du fichier).
2. Semer les données avec `seedUser` / `seedSubscription` / `seedPayment`, piloter
   le provider via `cinetpay.check` / `cinetpay.init`.
3. Asserter sur l'état **relu** (`readPayment` / `readSubscription` /
   `allNotifications`) plutôt que sur la valeur de retour du service : c'est la
   persistance qui porte l'effet métier.
4. Référencer le fichier dans `tests/run.ts`.
