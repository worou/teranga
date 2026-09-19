import PageLegale, { type SectionLegale } from '../components/PageLegale'
import styles from './Legal.module.css'
import { MailLegal } from '../components/MailLegal'

/**
 * Politique de confidentialité.
 *
 * Écrite À PARTIR du schéma Prisma, pas d'un modèle générique — d'où quatre
 * points qu'un texte standard aurait manqués :
 *
 * 1. `religion` et `ethnicity` sont des données de l'art. 9 RGPD. Le schéma le
 *    signale déjà. Elles exigent un consentement EXPLICITE et distinct — voir
 *    la réserve honnête de la section correspondante : la case unique de
 *    l'inscription n'y suffit pas aujourd'hui.
 * 2. `TrustedCircle.trusteeContact` enregistre les coordonnées de personnes qui
 *    ne sont pas membres et n'ont rien consenti : art. 14 RGPD.
 * 3. `PhotosVisibility.PRIVATE` n'est pas du chiffrement. Le commentaire du
 *    schéma est franc là-dessus ; ce document ne doit pas l'être moins.
 * 4. `flaggedByAi` / `blockedByAi` bloquent un message sans intervention
 *    humaine : décision automatisée au sens de l'art. 22, donc droit à un
 *    réexamen humain.
 *
 * L'analyse anti-brouteur (`analyzeMessageForSafety`) tourne EN LOCAL : aucun
 * message ne part chez un tiers. Ne pas la lister parmi les sous-traitants.
 * Anthropic n'apparaît qu'au titre du chatbot d'aide, et seulement si
 * ANTHROPIC_API_KEY est configurée.
 *
 * CHOIX STRUCTURANT — un standard unique pour seize pays.
 *
 * Le service est ouvert de Dakar à Montréal, sur des droits très inégalement
 * exigeants. Deux voies s'offraient : appliquer à chacun le minimum de son pays
 * — ingérable, et indéfendable — ou retenir partout le plus protecteur. C'est
 * le RGPD, et c'est ce qui est annoncé en section 1.
 *
 * Ce n'est pas qu'une posture : cela ÉLÈVE l'engagement au rang contractuel
 * pour un membre nigérien ou congolais dont la loi nationale ne prévoit pas ces
 * droits. Ne pas le rétrograder au motif que l'éditeur s'établirait hors de
 * l'UE — l'engagement est pris, et le rétablir coûterait plus cher que de le
 * tenir. Les références aux articles du RGPD qui subsistent dans le document
 * sont donc voulues : elles nomment le standard choisi, pas une loi subie.
 */

const MAJ = '19 septembre 2026'

const sections: SectionLegale[] = [
  {
    id: 'responsable',
    titre: '1. Responsable du traitement',
    corps: (
      <>
        <p>
          Le responsable du traitement est la société éditrice identifiée dans les
          <a href="/mentions-legales"> mentions légales</a>.
        </p>
        <div className={styles.encadre}>
          <p><strong>Délégué à la protection des données</strong> : <MailLegal boite="dpo" /></p>
          <p>
            <strong>Autorité de contrôle</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : l’autorité de protection des données du pays d’établissement de l’éditeur]</span>
          </p>
        </div>
        <p>
          Téranga dessert seize pays, dont les législations sur les données personnelles sont
          d’exigence inégale. Plutôt que d’appliquer à chacun le minimum de son pays, nous avons
          retenu <strong>un standard unique et unique pour tous</strong> : celui du règlement
          européen sur la protection des données (RGPD), qui est le plus protecteur du lot.
        </p>
        <p>
          Concrètement, les droits décrits à la section 9 — accès, rectification, effacement,
          portabilité, opposition — vous sont ouverts <strong>quel que soit votre pays de
          résidence</strong>, y compris là où la loi locale ne les prévoit pas encore. Ce choix vaut
          engagement contractuel de notre part.
        </p>
        <p>
          S’y ajoutent, le cas échéant : la loi du pays d’établissement de l’éditeur, celle de votre
          propre pays de résidence, et les instruments régionaux applicables. Lorsque l’une d’elles
          vous accorde davantage que le présent document, c’est elle qui prime.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    titre: '2. Données que nous collectons',
    corps: (
      <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Catégorie</th><th>Données</th><th>Origine</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Identification</strong></td>
                <td>Prénom, nom, numéro de téléphone, adresse e-mail, date de naissance, mot de passe (empreinte chiffrée)</td>
                <td>Vous</td>
              </tr>
              <tr>
                <td><strong>Profil</strong></td>
                <td>Genre, ville, pays, intention (relation sérieuse, mariage, famille), profession, niveau d’études, langues, présentation, situation familiale et souhait d’enfants</td>
                <td>Vous</td>
              </tr>
              <tr>
                <td><strong>Physique</strong></td>
                <td>Taille, poids, corpulence</td>
                <td>Vous, facultatif</td>
              </tr>
              <tr>
                <td><strong>Sensibles (art. 9)</strong></td>
                <td>Religion, origine ethnique déclarée</td>
                <td>Vous, strictement facultatif</td>
              </tr>
              <tr>
                <td><strong>Photographies</strong></td>
                <td>Photos de profil</td>
                <td>Vous</td>
              </tr>
              <tr>
                <td><strong>Usage</strong></td>
                <td>Messages, conversations, likes et favoris, blocages, signalements, notifications, participation aux événements</td>
                <td>Votre activité</td>
              </tr>
              <tr>
                <td><strong>Cercle de confiance</strong></td>
                <td>Lien de parenté et coordonnées des proches que vous désignez</td>
                <td>Vous (voir section 6)</td>
              </tr>
              <tr>
                <td><strong>Transactions</strong></td>
                <td>Historique des paiements, formule, montant, statut, moyen employé</td>
                <td>Vous et les prestataires de paiement</td>
              </tr>
              <tr>
                <td><strong>Technique</strong></td>
                <td>Adresse IP, journaux de connexion, type de terminal</td>
                <td>Automatique</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Nous ne collectons <strong>aucune donnée bancaire</strong> : numéros de carte et
          identifiants de portefeuille mobile sont saisis chez le prestataire de paiement et ne
          transitent jamais par nos serveurs.
        </p>
      </>
    ),
  },
  {
    id: 'sensibles',
    titre: '3. Données sensibles — religion et origine',
    corps: (
      <>
        <p>
          La religion et l’origine ethnique relèvent de l’article 9 du RGPD, qui en interdit le
          traitement par principe. Elles ne sont traitées que sur le fondement de votre
          <strong> consentement explicite</strong>, et uniquement parce que ces critères comptent
          réellement dans une démarche matrimoniale.
        </p>
        <ul>
          <li>Ces champs sont <strong>facultatifs</strong> : « non précisé » est une réponse valable, et c’est la valeur par défaut.</li>
          <li>Ils ne sont <strong>jamais déduits</strong> de votre nom, de votre pays ou de vos photographies.</li>
          <li>Ils ne servent qu’à l’affichage de votre profil et au filtrage de recherche, y compris le vôtre.</li>
          <li>Vous pouvez les retirer à tout moment depuis votre profil, sans conséquence sur votre compte.</li>
        </ul>
        <div className={styles.avertissement}>
          <strong>Ce que nous devons améliorer.</strong> À ce jour, ces champs sont renseignés dans le
          même formulaire que le reste du profil, sans case de consentement qui leur soit propre. Un
          consentement explicite au sens de l’article 9 suppose un accord distinct et spécifique.
          Nous le corrigeons. D’ici là, si vous préférez ne pas voir ces données traitées, laissez ces
          champs sur « non précisé » ou écrivez à <MailLegal boite="dpo" />.
        </div>
      </>
    ),
  },
  {
    id: 'finalites',
    titre: '4. Pourquoi nous les traitons, et à quel titre',
    corps: (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Finalité</th><th>Base légale</th></tr>
          </thead>
          <tbody>
            <tr><td>Créer et gérer votre compte, afficher votre profil</td><td>Exécution du contrat (art. 6.1.b)</td></tr>
            <tr><td>Vérifier votre numéro par code à usage unique</td><td>Exécution du contrat et intérêt légitime (sécurité)</td></tr>
            <tr><td>Proposer des profils et permettre les échanges</td><td>Exécution du contrat</td></tr>
            <tr><td>Afficher la religion et l’origine déclarées</td><td><strong>Consentement explicite</strong> (art. 9.2.a)</td></tr>
            <tr><td>Modérer, détecter les escroqueries et les abus, traiter les signalements</td><td>Intérêt légitime — protéger les membres (art. 6.1.f)</td></tr>
            <tr><td>Conserver des éléments de preuve en cas de faits graves</td><td>Intérêt légitime et obligation légale (art. 6.1.c et f)</td></tr>
            <tr><td>Traiter les paiements et tenir la comptabilité</td><td>Exécution du contrat et obligation légale</td></tr>
            <tr><td>Répondre aux réquisitions judiciaires</td><td>Obligation légale (art. 6.1.c)</td></tr>
            <tr><td>Assurer la sécurité du service, prévenir la fraude</td><td>Intérêt légitime</td></tr>
            <tr><td>Envoyer des informations sur le service</td><td>Consentement, révocable à tout moment</td></tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: 'moderation',
    titre: '5. Modération et décisions automatisées',
    corps: (
      <>
        <p>
          Vos messages sont analysés automatiquement avant remise, afin de détecter les demandes
          d’argent caractéristiques de l’escroquerie sentimentale et les propos manifestement
          abusifs. Cette analyse repose sur la reconnaissance de formulations connues et
          <strong> s’exécute sur nos propres serveurs</strong> : aucun message n’est transmis à un
          tiers, ni utilisé pour entraîner un modèle d’intelligence artificielle.
        </p>
        <p>
          Un message détecté est bloqué : il n’est remis à personne, mais conservé aux fins de
          modération et de preuve. Une demande d’argent détectée déclenche en outre un signalement
          automatique au bénéfice du destinataire.
        </p>
        <div className={styles.encadre}>
          <strong>Article 22 du RGPD.</strong> Ce blocage est une décision automatisée. Vous avez le
          droit d’obtenir une <strong>intervention humaine</strong>, d’exprimer votre point de vue et
          de contester la décision : écrivez à <MailLegal boite="moderation" />.
        </div>
        <p>
          Nos modérateurs peuvent accéder aux profils, aux photographies et aux messages signalés ou
          détectés, dans la stricte mesure nécessaire au traitement du signalement. Ils sont tenus à
          la confidentialité.
        </p>
      </>
    ),
  },
  {
    id: 'proches',
    titre: '6. Le cercle de confiance — données de tiers',
    corps: (
      <>
        <p>
          Le cercle de confiance vous permet de désigner un proche à prévenir avant une rencontre. Ce
          faisant, vous nous transmettez les coordonnées d’une personne qui, si elle n’est pas membre,
          ne nous les a pas confiées elle-même.
        </p>
        <ul>
          <li>
            Vous vous engagez à n’inscrire un proche qu’avec son <strong>accord préalable</strong>, et
            à l’informer que ses coordonnées sont enregistrées chez nous.
          </li>
          <li>
            Ces coordonnées servent exclusivement à cette fonction. Elles ne sont ni utilisées à des
            fins de prospection, ni recoupées, ni transmises à d’autres membres.
          </li>
          <li>
            La personne désignée dispose des mêmes droits que vous sur ses données et peut en demander
            la suppression à <MailLegal boite="dpo" />, sans avoir à
            vous en informer.
          </li>
          <li>Elles sont effacées dès que vous retirez ce proche de votre cercle.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'destinataires',
    titre: '7. Qui reçoit vos données',
    corps: (
      <>
        <h3>7.1 — Les autres membres</h3>
        <p>
          Votre profil — prénom, âge, ville, pays, présentation, et selon vos réglages vos
          photographies — est visible des membres, et pour partie des visiteurs non inscrits, la
          découverte étant publique. Ne sont <strong>jamais</strong> exposés : votre nom de famille,
          votre numéro de téléphone, votre adresse e-mail, votre date de naissance exacte et vos
          données de paiement.
        </p>
        <h3>7.2 — Nos sous-traitants</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Prestataire</th><th>Rôle</th><th>Données</th><th>Lieu</th></tr>
            </thead>
            <tbody>
              <tr><td>o2switch</td><td>Hébergement</td><td>Toutes</td><td>France (UE)</td></tr>
              <tr><td>Twilio</td><td>Envoi des SMS de vérification</td><td>Numéro de téléphone, code</td><td>États-Unis</td></tr>
              <tr><td>CinetPay</td><td>Paiements mobile money et carte</td><td>Nom, e-mail, téléphone, montant</td><td>Côte d’Ivoire</td></tr>
              <tr><td>PayPal</td><td>Paiements par redirection</td><td>Nom, e-mail, montant</td><td>UE / États-Unis</td></tr>
              <tr><td>Anthropic</td><td>Assistant d’aide (chatbot), s’il est activé</td><td>Le texte de votre question</td><td>États-Unis</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Chacun est lié par un contrat de sous-traitance conforme à l’article 28 du RGPD et
          n’intervient que sur nos instructions.
        </p>
        <div className={styles.encadre}>
          <strong>Transferts internationaux.</strong> Vos données sont hébergées en France et
          transitent, pour les seules finalités du tableau ci-dessus, vers les États-Unis (SMS,
          assistant d’aide) et la Côte d’Ivoire (paiements mobile money). Ces transferts sont
          encadrés par les clauses contractuelles types de la Commission européenne, complétées le
          cas échéant par l’adhésion du prestataire au <em>Data Privacy Framework</em>. Nous
          appliquons ce même encadrement à tous les membres, y compris lorsque leur pays de
          résidence n’impose aucune formalité de transfert. Vous pouvez en obtenir copie auprès du
          délégué à la protection des données.
        </div>
        <h3>7.3 — Les autorités</h3>
        <p>
          Nous communiquons les données sur réquisition régulière d’une autorité judiciaire ou
          administrative compétente, et lorsque leur transmission est nécessaire à la constatation, à
          l’exercice ou à la défense d’un droit en justice, ou à la protection des intérêts vitaux
          d’une personne.
        </p>
        <p>
          <strong>Vos données ne sont ni vendues, ni louées, ni cédées à des fins publicitaires.</strong>
        </p>
      </>
    ),
  },
  {
    id: 'conservation',
    titre: '8. Combien de temps nous les gardons',
    corps: (
      <>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Donnée</th><th>Durée</th></tr>
            </thead>
            <tbody>
              <tr><td>Compte actif (profil, photos)</td><td>Toute la durée de l’inscription</td></tr>
              <tr><td>Compte inactif</td><td>Suppression après 3 ans sans connexion, précédée d’un courriel d’avertissement</td></tr>
              <tr><td>Après suppression du compte</td><td>Effacement sous 30 jours, sous réserve des lignes ci-dessous</td></tr>
              <tr><td>Messages échangés</td><td>Supprimés avec le compte, sauf ceux liés à un signalement</td></tr>
              <tr><td><strong>Signalements et messages bloqués</strong></td><td><strong>5 ans</strong> à compter du signalement, y compris après suppression du compte</td></tr>
              <tr><td><strong>Éléments liés à une infraction grave</strong></td><td><strong>Jusqu’au terme de la prescription de l’action publique</strong>, et jusqu’à décision définitive en cas de procédure engagée</td></tr>
              <tr><td>Données d’identification à la création du contenu</td><td>1 an — durée que les législations sur les intermédiaires techniques imposent couramment, et que nous appliquons partout</td></tr>
              <tr><td>Comptes bannis (identifiants techniques)</td><td>3 ans, afin d’empêcher la réinscription</td></tr>
              <tr><td>Factures et pièces comptables</td><td>10 ans (obligation légale)</td></tr>
              <tr><td>Journaux de connexion</td><td>12 mois</td></tr>
              <tr><td>Consentements</td><td>3 ans après leur retrait, à titre de preuve</td></tr>
            </tbody>
          </table>
        </div>
        <div className={styles.avertissement}>
          <strong>Pourquoi nous conservons au-delà de la suppression du compte.</strong> Une victime
          de violences, d’agression ou d’escroquerie porte souvent plainte des mois après les faits,
          et l’auteur efface volontiers son compte entre-temps. Un effacement immédiat et
          inconditionnel priverait l’enquête des seuls éléments matériels disponibles. Cette
          conservation est limitée aux données nécessaires, techniquement isolée du service actif, et
          n’est accessible qu’aux personnes habilitées.
        </div>
      </>
    ),
  },
  {
    id: 'droits',
    titre: '9. Vos droits',
    corps: (
      <>
        <p>Vous disposez à tout moment des droits suivants :</p>
        <ul>
          <li><strong>Accès</strong> — obtenir copie des données que nous détenons sur vous.</li>
          <li><strong>Rectification</strong> — corriger une donnée inexacte, directement depuis votre profil pour l’essentiel.</li>
          <li><strong>Effacement</strong> — demander la suppression de vos données.</li>
          <li><strong>Limitation</strong> — demander le gel d’un traitement le temps d’une contestation.</li>
          <li><strong>Portabilité</strong> — recevoir vos données dans un format lisible par machine.</li>
          <li><strong>Opposition</strong> — vous opposer à un traitement fondé sur l’intérêt légitime, pour des raisons tenant à votre situation.</li>
          <li><strong>Retrait du consentement</strong> — à tout moment, sans effet sur ce qui a été fait auparavant.</li>
          <li><strong>Directives post mortem</strong> — organiser le sort de vos données après votre décès.</li>
        </ul>
        <p>
          Adressez votre demande à <MailLegal boite="dpo" />. Nous
          répondons dans un délai d’un mois, prorogeable de deux mois si la demande est complexe. Une
          pièce d’identité peut être demandée en cas de doute sérieux sur votre identité — elle est
          détruite aussitôt la vérification faite.
        </p>
        <div className={styles.encadre}>
          <strong>Limite du droit à l’effacement.</strong> L’article 17.3 du RGPD écarte ce droit
          lorsque la conservation est nécessaire au respect d’une obligation légale ou à la
          constatation, à l’exercice ou à la défense d’un droit en justice. Nous pouvons donc être
          tenus de conserver les éléments liés à un signalement pour faits graves malgré votre
          demande — y compris si cette demande émane de la personne mise en cause. Vous en serez
          informé, avec le motif.
        </div>
        <p>
          Vous pouvez enfin introduire une réclamation auprès de l’autorité de contrôle compétente,
          mentionnée à la section 1.
        </p>
      </>
    ),
  },
  {
    id: 'securite',
    titre: '10. Sécurité',
    corps: (
      <>
        <p>Nous mettons en œuvre les mesures suivantes :</p>
        <ul>
          <li>chiffrement des échanges en transit (HTTPS/TLS) ;</li>
          <li>mots de passe stockés sous forme d’empreinte cryptographique non réversible ;</li>
          <li>authentification par code à usage unique à la création du compte ;</li>
          <li>accès aux données de production restreint aux personnes habilitées et journalisé ;</li>
          <li>sauvegardes régulières.</li>
        </ul>
        <div className={styles.avertissement}>
          <p>
            <strong>Sur les photographies dites « privées ».</strong> Le réglage « photos privées »
            restreint l’<em>affichage</em> de vos photographies aux autres membres. Il ne les chiffre
            pas : le fichier transite par le réseau, reste stocké sur nos serveurs et demeure visible
            de la modération. Nous ne pouvons pas non plus empêcher qu’un autre membre réalise une
            capture d’écran d’une photographie qui lui a été montrée.
          </p>
          <p>
            Aucun système n’est inviolable et nous ne promettons pas l’impossible. En cas de violation
            de données susceptible d’engendrer un risque élevé pour vos droits, nous vous en
            informerons, ainsi que l’autorité de contrôle, dans les délais prévus aux articles 33 et
            34 du RGPD.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'cookies',
    titre: '11. Cookies et traceurs',
    corps: (
      <>
        <p>
          Le service dépose uniquement les traceurs <strong>strictement nécessaires</strong> à son
          fonctionnement : maintien de votre session, sécurisation de la connexion, mémorisation de
          vos préférences d’affichage. Dispensés de consentement, ils ne servent à aucun suivi
          publicitaire.
        </p>
        <p>
          Nous n’utilisons aujourd’hui ni régie publicitaire, ni traceur de réseau social, ni outil de
          mesure d’audience tiers. Si cela devait changer, un bandeau vous permettrait d’accepter ou
          de refuser <em>avant</em> tout dépôt, aussi simplement dans un cas que dans l’autre.
        </p>
      </>
    ),
  },
  {
    id: 'mineurs',
    titre: '12. Mineurs',
    corps: (
      <p>
        Le service est interdit aux personnes de moins de 18 ans et n’est en aucune manière destiné
        aux mineurs. Nous ne collectons pas sciemment leurs données. Si vous constatez qu’un mineur
        s’est inscrit, signalez-le à <MailLegal boite="signalement" /> :
        le compte sera bloqué sans délai et les données supprimées, sous réserve de ce qui doit être
        conservé pour un éventuel signalement aux autorités.
      </p>
    ),
  },
  {
    id: 'modification',
    titre: '13. Modification de la présente politique',
    corps: (
      <p>
        Cette politique peut évoluer avec le service ou la réglementation. Toute modification
        substantielle — nouvelle finalité, nouveau destinataire, allongement d’une durée de
        conservation — vous sera notifiée au moins <strong>trente (30) jours</strong> avant son entrée
        en vigueur. La date de mise à jour figure en tête de page.
      </p>
    ),
  },
]

export default function Confidentialite() {
  return (
    <PageLegale
      eyebrow="CONFIDENTIALITÉ"
      titre="Politique de"
      titreAccent="confidentialité"
      chapo="Quelles données nous collectons, pourquoi, qui y accède, combien de temps nous les gardons, et comment reprendre la main dessus."
      version={`Version 1.0 — dernière mise à jour le ${MAJ}.`}
      sections={sections}
    />
  )
}
