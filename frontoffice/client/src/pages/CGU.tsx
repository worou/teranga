import PageLegale, { type SectionLegale } from '../components/PageLegale'
import styles from './Legal.module.css'
import { MailLegal } from '../components/MailLegal'

/**
 * Conditions générales d'utilisation.
 *
 * C'est ici — et NON dans les mentions légales — que se règle la question de la
 * responsabilité. Trois articles la portent : 5 (nature du service et absence
 * de contrôle des antécédents), 6 (rencontres hors ligne) et 7 (responsabilité).
 *
 * RÉDIGÉ SANS ANCRAGE NATIONAL. Le service est ouvert à seize pays, de
 * l'Afrique de l'Ouest et centrale à l'Europe et au Canada. Les notions
 * employées — obligation de moyens, faute lourde, clause abusive,
 * responsabilité du fait d'autrui — existent dans chacun de ces droits, qui
 * descendent pour l'essentiel de la même tradition civiliste. En revanche la
 * NUMÉROTATION des articles, elle, ne voyage pas : citer « art. 1170 du code
 * civil » serait juste à Paris et faux à Dakar. On énonce donc le principe,
 * jamais la référence. Ne pas réintroduire de numéros d'articles nationaux.
 *
 * ⚠️ AVERTISSEMENT AU DÉVELOPPEUR — ne pas « durcir » l'article 7.
 *
 * Une clause qui exclurait TOUTE responsabilité, y compris en cas de dommage
 * corporel ou de faute lourde, est nulle dans chacun de ces pays : elle prive
 * de sa substance l'obligation essentielle du contrat et elle est abusive au
 * regard du droit de la consommation. Surtout, la nullité frapperait l'article
 * ENTIER, y compris les limitations qui, elles, sont valables. La réserve du
 * 7.4 n'affaiblit pas le dispositif : c'est elle qui le tient debout.
 *
 * De même, aucune clause ne peut écarter la responsabilité PÉNALE, ni celle de
 * l'auteur d'une infraction, ni celle de la plateforme au titre de ses propres
 * manquements. Ce que ce document fait — et qui protège réellement — c'est
 * établir que Téranga n'est pas partie aux relations entre membres, décrire
 * loyalement ce qu'elle contrôle et ce qu'elle ne contrôle pas, et documenter
 * le dispositif de signalement dont dépend le statut d'hébergeur.
 */

const MAJ = '19 septembre 2026'

const sections: SectionLegale[] = [
  {
    id: 'objet',
    titre: 'Article 1 — Objet et acceptation',
    corps: (
      <>
        <p>
          Les présentes conditions générales d’utilisation (les « <strong>CGU</strong> ») régissent
          l’accès et l’utilisation du service de mise en relation matrimoniale Téranga (le
          « <strong>Service</strong> »), accessible par site web et application, édité par la société
          désignée dans les <a href="/mentions-legales">mentions légales</a> (« <strong>Téranga</strong> »,
          « <strong>nous</strong> »).
        </p>
        <p>
          La création d’un compte vaut acceptation pleine, entière et sans réserve des présentes CGU.
          L’utilisateur qui n’y consent pas doit renoncer à utiliser le Service. Les CGU forment,
          avec la <a href="/confidentialite">politique de confidentialité</a>, l’intégralité de
          l’accord entre le membre et Téranga.
        </p>
      </>
    ),
  },
  {
    id: 'definitions',
    titre: 'Article 2 — Définitions',
    corps: (
      <ul>
        <li><strong>Membre</strong> : toute personne physique titulaire d’un compte sur le Service.</li>
        <li><strong>Visiteur</strong> : toute personne consultant les parties publiques du Service sans compte.</li>
        <li><strong>Contenu</strong> : toute donnée publiée par un membre — texte de profil, photographie, message, signalement.</li>
        <li><strong>Rencontre</strong> : tout échange ou toute entrevue, en ligne ou physique, entre deux membres ou anciens membres.</li>
      </ul>
    ),
  },
  {
    id: 'acces',
    titre: 'Article 3 — Conditions d’accès',
    corps: (
      <>
        <p>L’inscription au Service est strictement réservée aux personnes qui, cumulativement :</p>
        <ul>
          <li>
            sont <strong>âgées de dix-huit (18) ans révolus</strong> au jour de l’inscription. L’âge
            est contrôlé à partir de la date de naissance déclarée et le refus est opposé côté
            serveur ;
          </li>
          <li>jouissent de leur pleine capacité juridique ;</li>
          <li>
            ne font l’objet d’aucune interdiction, judiciaire ou administrative, d’entrer en relation
            avec autrui, notamment au titre d’une condamnation pour infraction sexuelle ou violente ;
          </li>
          <li>
            n’ont pas fait l’objet d’une exclusion antérieure du Service, quel qu’en soit le motif.
          </li>
        </ul>
        <div className={styles.encadre}>
          <strong>Champ géographique.</strong> Le Service est ouvert aux résidents du Sénégal, de la
          Côte d’Ivoire, du Mali, du Burkina Faso, de la Guinée, du Togo, du Bénin, du Niger, du
          Cameroun, du Gabon, de la République démocratique du Congo, du Congo, de la Mauritanie, de
          la France, de la Belgique et du Canada, ainsi qu’aux membres de la diaspora résidant
          ailleurs. Les présentes CGU sont rédigées pour valoir dans l’ensemble de ces pays : elles
          énoncent des principes communs plutôt que les dispositions d’une loi nationale
          particulière. Là où la loi de votre pays de résidence vous accorde davantage, c’est elle
          qui s’applique.
        </div>
        <p>
          Un membre ne peut détenir qu’un seul compte. Les informations déclarées doivent être
          exactes, sincères et tenues à jour. Toute déclaration inexacte relative à l’âge, à
          l’identité, à la situation matrimoniale ou aux antécédents judiciaires constitue un
          manquement grave, justifiant la fermeture immédiate du compte, sans préjudice des
          poursuites.
        </p>
        <div className={styles.avertissement}>
          <strong>Mineurs.</strong> Le Service est interdit aux mineurs. Toute suspicion de présence
          d’un mineur entraîne le blocage immédiat du compte et, le cas échéant, un signalement aux
          autorités compétentes. Nous invitons toute personne ayant connaissance d’une telle
          situation à la signaler sans délai à <MailLegal boite="signalement" />.
        </div>
      </>
    ),
  },
  {
    id: 'engagements',
    titre: 'Article 4 — Engagements du membre',
    corps: (
      <>
        <p>Chaque membre s’interdit, sur le Service comme à l’occasion de toute rencontre qu’il y aurait initiée :</p>
        <ul>
          <li>
            tout comportement constitutif de <strong>harcèlement</strong>, de menace, de violence,
            d’agression sexuelle, de viol, de séquestration, de traite des êtres humains, de
            proxénétisme, ou de toute autre infraction pénale, ainsi que toute tentative de tels
            actes ;
          </li>
          <li>
            toute <strong>escroquerie</strong>, sollicitation ou obtention d’argent, de virement, de
            recharge téléphonique, de cryptomonnaie ou de tout avantage patrimonial, sous quelque
            prétexte que ce soit ;
          </li>
          <li>
            toute <strong>usurpation d’identité</strong>, publication de photographie d’un tiers ou
            dissimulation de la situation matrimoniale réelle ;
          </li>
          <li>
            la <strong>diffusion de contenus</strong> à caractère pornographique, pédopornographique,
            violent, haineux, discriminatoire, ou portant atteinte à la dignité humaine ;
          </li>
          <li>
            la <strong>divulgation</strong> ou la republication, hors du Service, de données, de
            photographies ou de conversations concernant un autre membre sans son accord — notamment
            à des fins de chantage ou de vengeance (« <em>revenge porn</em> ») ;
          </li>
          <li>
            toute utilisation commerciale, publicitaire ou de prospection du Service, et tout procédé
            automatisé d’extraction de données.
          </li>
        </ul>
        <p>
          Le membre demeure <strong>seul et personnellement responsable</strong>, civilement et
          pénalement, de ses contenus, de ses propos et de ses actes, en ligne comme hors ligne.
        </p>
      </>
    ),
  },
  {
    id: 'nature',
    titre: 'Article 5 — Nature du service : ce que Téranga fait, et ce qu’elle ne fait pas',
    corps: (
      <>
        <p>
          Téranga fournit un <strong>outil technique de mise en relation</strong>. Elle met à
          disposition un espace où des personnes majeures publient un profil et échangent si elles le
          souhaitent. Le Service ne constitue ni une agence matrimoniale au sens des réglementations
          qui encadrent cette activité, ni un service de garantie, de recommandation ou de
          certification des personnes.
        </p>
        <p>
          Téranga <strong>n’est pas partie</strong> aux relations qui se nouent entre membres. Elle
          n’intervient ni dans leur formation, ni dans leur contenu, ni dans leur issue.
        </p>
        <div className={styles.avertissement}>
          <p>
            <strong>Absence de vérification des antécédents.</strong> Nous le disons sans détour, car
            il serait déloyal de le taire : Téranga <strong>ne procède à aucune enquête d’antécédents
            judiciaires</strong>. Nous ne consultons aucun casier judiciaire, aucun fichier des auteurs
            d’infractions sexuelles ou violentes, aucun fichier de police. Nous n’avons ni accès légal
            ni moyen technique de le faire.
          </p>
          <p>
            Il en résulte qu’<strong>il ne peut être exclu qu’une personne inscrite sur le Service ait
            été condamnée, ou soit susceptible de commettre, des faits graves</strong> — violences,
            agression sexuelle, viol, escroquerie. Aucune mention, aucun badge, aucune ancienneté de
            compte ne doit être interprété comme une garantie de moralité, d’honnêteté ou
            d’innocuité d’un membre.
          </p>
        </div>
        <h3>5.1 — Ce que nous vérifions réellement</h3>
        <ul>
          <li>
            un <strong>contrôle du numéro de téléphone</strong> par code à usage unique, qui établit
            la maîtrise d’une ligne — non l’identité de son détenteur ;
          </li>
          <li>
            un <strong>contrôle technique du format des photographies</strong> (type et taille du
            fichier) au moment de leur envoi. Ce contrôle est automatique et porte sur le fichier,
            non sur son contenu : il ne vérifie ni que l’image représente le titulaire du compte, ni
            qu’elle n’a pas été empruntée ailleurs. <strong>Les photographies sont publiées
            immédiatement, sans examen préalable</strong> ; elles ne sont examinées par une personne
            qu’à la suite d’un signalement ;
          </li>
          <li>
            une <strong>analyse automatisée des messages</strong> (article 8.3), qui repose sur la
            détection de formulations typiques et laisse nécessairement passer ce qu’elle ne
            reconnaît pas.
          </li>
        </ul>
        <p>
          Nous n’exigeons <strong>aucune pièce d’identité</strong> et ne pratiquons aucune
          vérification biométrique ou par photographie en direct. Il en résulte qu’un profil peut
          être créé sous une <strong>fausse identité</strong>, avec la photographie d’un tiers.
        </p>
        <p>
          Ces dispositifs réduisent un risque ; ils ne le suppriment pas et ne sauraient être
          présentés comme tels. La mention « profil vérifié », lorsqu’elle apparaît, renvoie aux
          seules opérations décrites ci-dessus, à l’exclusion de toute autre.
        </p>
      </>
    ),
  },
  {
    id: 'rencontres',
    titre: 'Article 6 — Rencontres hors ligne',
    corps: (
      <>
        <p>
          La décision de passer d’un échange en ligne à une rencontre physique appartient
          <strong> exclusivement au membre</strong>. Elle procède de son libre arbitre et s’opère
          en dehors du Service, hors de tout espace contrôlé par Téranga.
        </p>
        <p>
          Téranga <strong>n’organise pas</strong>, n’encadre pas, ne supervise pas et n’accompagne pas
          les rencontres physiques entre membres. Elle n’en connaît ni le lieu, ni la date, ni le
          déroulement, et n’a aucun moyen d’y intervenir.
        </p>
        <div className={styles.encadre}>
          <p><strong>Précautions que nous recommandons instamment :</strong></p>
          <ul>
            <li>privilégier un premier rendez-vous en <strong>lieu public et fréquenté</strong>, de jour ;</li>
            <li>
              prévenir un proche du lieu, de l’heure et de l’identité de la personne rencontrée — le
              <strong> cercle de confiance</strong> du Service est prévu pour cela ;
            </li>
            <li>assurer soi-même son trajet aller et retour, sans dépendre de la personne rencontrée ;</li>
            <li>ne jamais remettre d’argent, de document d’identité ou de coordonnées bancaires ;</li>
            <li>ne jamais laisser une boisson sans surveillance ;</li>
            <li>interrompre la rencontre dès le premier malaise, sans avoir à se justifier.</li>
          </ul>
        </div>
        <div className={styles.avertissement}>
          <p>
            <strong>En cas de danger immédiat, contactez la police et les services de secours de
            votre pays.</strong> Téranga n’est pas un service d’urgence : un signalement adressé à la
            modération ne déclenche aucune intervention sur place, n’est pas relevé en continu, et
            ne remplace en aucun cas un dépôt de plainte.
          </p>
          {/*
            ⚠️ À FAIRE — dresser ici la liste des numéros d'urgence et des lignes
            d'écoute pour les violences, un par pays desservi, CHACUN VÉRIFIÉ
            auprès d'une source officielle avant publication.

            Volontairement AUCUN marqueur `aCompleter` visible dans ce bloc, à la
            différence des mentions légales : la personne qui lit ce paragraphe
            cherche peut-être un secours immédiat. Une case rouge « à compléter »
            à la place d'un numéro d'aide serait pire que la consigne générale
            ci-dessous, qui se suffit à elle-même. Un numéro faux le serait plus
            encore — d'où l'absence de toute liste tant qu'elle n'est pas vérifiée.
          */}
          <p>
            Depuis un pays de l’Union européenne, le <strong>112</strong> joint gratuitement les
            secours et la police, depuis n’importe quel téléphone. Ailleurs, composez le numéro
            d’urgence en vigueur là où vous vous trouvez ; en cas de doute, rendez-vous au poste de
            police ou au centre de santé le plus proche, qui sont tenus de recevoir votre plainte.
          </p>
          <p>
            Vous n’avez pas à être certaine ou certain de ce que vous avez vécu pour demander de
            l’aide, ni à attendre d’avoir des preuves. Un examen médical précoce protège vos droits,
            même si vous ne souhaitez pas porter plainte immédiatement.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'responsabilite',
    titre: 'Article 7 — Responsabilité',
    corps: (
      <>
        <h3>7.1 — Obligation de moyens</h3>
        <p>
          Téranga est tenue, au titre de l’exploitation du Service, d’une <strong>obligation de
          moyens</strong> et non de résultat. Elle s’engage à mettre en œuvre les diligences
          raisonnables qu’un professionnel avisé du même secteur mettrait en œuvre, notamment le
          dispositif de signalement et de modération décrit à l’article 8. Elle ne garantit ni la
          disponibilité ininterrompue du Service, ni la sincérité des profils, ni l’issue d’une
          quelconque mise en relation.
        </p>
        <h3>7.2 — Faits des membres</h3>
        <p>
          Les membres agissent de manière autonome et indépendante. Ils ne sont ni préposés, ni
          mandataires, ni représentants de Téranga, qui ne dispose sur eux d’aucun pouvoir de
          direction, de contrôle ni de surveillance. Les conditions de la responsabilité du fait
          d’autrui ne sont donc pas réunies.
        </p>
        <p>
          En conséquence, et dans toute la mesure permise par la loi, <strong>Téranga ne répond pas
          des faits commis par un membre ou un tiers</strong>, notamment :
        </p>
        <ul>
          <li>
            les <strong>violences, agressions sexuelles, viols, séquestrations, enlèvements,
            mutilations, atteintes à la vie</strong> et toute autre infraction contre les personnes
            commise à l’occasion ou à la suite d’une mise en relation ;
          </li>
          <li>
            le <strong>harcèlement</strong>, les menaces, le chantage, la diffusion non consentie
            d’images intimes ;
          </li>
          <li>
            les <strong>escroqueries</strong>, abus de confiance, extorsions et détournements de
            fonds, quel qu’en soit le montant ;
          </li>
          <li>
            les <strong>mariages frauduleux</strong>, unions contractées par dissimulation d’une
            situation matrimoniale existante, ou aux fins d’obtenir un titre de séjour ;
          </li>
          <li>
            plus généralement, tout <strong>préjudice corporel, moral ou patrimonial</strong> résultant
            du comportement d’un membre, y compris après la fermeture de son compte ou en dehors du
            Service.
          </li>
        </ul>
        <p>
          La victime de tels agissements dispose de l’intégralité de ses droits à l’encontre de leur
          <strong> auteur</strong>, dont la responsabilité civile et pénale personnelle demeure
          entière. Les présentes CGU n’ont ni pour objet ni pour effet d’y faire obstacle.
        </p>
        <h3>7.3 — Plafond d’indemnisation</h3>
        <p>
          Lorsque la responsabilité de Téranga est engagée pour un dommage autre que ceux visés au
          7.4, la réparation est limitée aux dommages directs et prévisibles, et ne peut excéder le
          montant total des sommes effectivement versées par le membre au cours des douze (12) mois
          précédant le fait générateur. Les dommages indirects — perte de chance, préjudice
          commercial, atteinte à l’image — ne donnent pas lieu à réparation.
        </p>
        <div className={styles.avertissement}>
          <h3 style={{ marginTop: 0 }}>7.4 — Réserves impératives</h3>
          <p>
            Par exception expresse à tout ce qui précède, <strong>aucune stipulation des présentes ne
            limite ni n’exclut la responsabilité de Téranga</strong> :
          </p>
          <ul>
            <li>en cas de <strong>dommage corporel</strong> ou d’atteinte à la vie ;</li>
            <li>en cas de <strong>faute lourde ou dolosive</strong> qui lui serait personnellement imputable ;</li>
            <li>
              lorsque, <strong>dûment informée</strong> d’un contenu ou d’un comportement
              manifestement illicite, elle s’est abstenue d’agir promptement pour le retirer ou en
              rendre l’accès impossible ;
            </li>
            <li>
              dans tous les autres cas où la loi applicable prohibe une telle limitation, notamment à
              l’égard du consommateur.
            </li>
          </ul>
          <p>
            Aucune clause des présentes ne saurait davantage exonérer quiconque de sa responsabilité
            pénale, laquelle est personnelle et d’ordre public.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'moderation',
    titre: 'Article 8 — Signalement, blocage et modération',
    corps: (
      <>
        <h3>8.1 — Signalement</h3>
        <p>
          Tout membre ou tiers peut signaler un profil, un contenu ou un comportement, depuis le
          bouton de signalement présent sur chaque profil et chaque conversation, ou par courriel à
          <MailLegal boite="signalement" />. Le signalement
          gagne à préciser l’identifiant du profil, les faits reprochés et leur date.
        </p>
        <p>
          Les signalements faisant état d’une atteinte à l’intégrité des personnes, de faits visant un
          mineur ou d’un risque imminent sont traités <strong>en priorité</strong>.
        </p>
        <h3>8.2 — Blocage</h3>
        <p>
          Chaque membre peut bloquer un autre membre à tout moment, sans motif ni préavis. Le blocage
          est immédiat et réciproque dans ses effets : il interrompt la conversation, interdit tout
          nouveau message et retire le profil de la découverte. Il ne requiert aucune validation.
        </p>
        <h3>8.3 — Modération automatisée des messages</h3>
        <p>
          Les messages font l’objet, avant remise, d’une analyse automatisée destinée à détecter les
          demandes d’argent caractéristiques de l’escroquerie sentimentale et les propos
          manifestement abusifs. Cette analyse est exécutée sur nos propres serveurs ; aucun message
          n’est transmis à un tiers à cette fin.
        </p>
        <p>
          Un message reconnu comme illicite est <strong>bloqué</strong> : il n’est remis à personne,
          mais conservé aux fins de modération et de preuve. Son auteur en est informé.
          Conformément à l’article 22 du RGPD, le membre qui estime un blocage injustifié peut en
          demander le <strong>réexamen par une personne physique</strong> à
          <MailLegal boite="moderation" />.
        </p>
        <p>
          Cette analyse est un filet, non un barrage : elle ne reconnaît que ce qu’elle a été conçue
          pour reconnaître. <strong>Elle ne dispense d’aucune vigilance.</strong>
        </p>
        <h3>8.4 — Absence d’obligation générale de surveillance</h3>
        <p>
          En sa qualité d’<strong>intermédiaire technique</strong>, Téranga stocke des contenus
          fournis par ses membres sans en être l’auteur et sans les sélectionner. Conformément à la
          législation applicable à l’hébergement de contenus, elle n’est soumise à aucune obligation
          générale de surveiller ce qu’elle stocke, ni de rechercher activement des faits illicites.
          En contrepartie, elle agit promptement dès qu’un contenu manifestement illicite lui est
          signalé — c’est la condition de ce régime, et l’article 8.1 en décrit le dispositif.
        </p>
        <h3>8.5 — Conservation des preuves et coopération</h3>
        <p>
          Les profils, messages et signalements liés à un signalement pour faits graves sont
          <strong> conservés</strong> dans les conditions prévues par la
          <a href="/confidentialite"> politique de confidentialité</a>, y compris après fermeture du
          compte, afin de pouvoir être produits en justice.
        </p>
        <p>
          Téranga <strong>coopère avec les autorités judiciaires et administratives</strong> et
          défère aux réquisitions régulièrement formées. Lorsqu’elle a connaissance de faits
          susceptibles de constituer un crime ou un délit contre les personnes, ou visant un mineur,
          elle procède au signalement qui lui incombe.
        </p>
      </>
    ),
  },
  {
    id: 'sanctions',
    titre: 'Article 9 — Sanctions',
    corps: (
      <>
        <p>
          En cas de manquement aux présentes, Téranga peut, selon la gravité des faits et de manière
          proportionnée : adresser un avertissement, retirer un contenu, suspendre temporairement le
          compte, ou le fermer définitivement.
        </p>
        <p>
          <strong>La fermeture immédiate et sans préavis</strong> est encourue en cas de faits visant
          un mineur, de violence, d’agression sexuelle, de harcèlement caractérisé, d’escroquerie ou
          d’usurpation d’identité.
        </p>
        <p>
          Le membre sanctionné est informé de la mesure et de ses motifs, et peut la contester à
          <MailLegal boite="moderation" /> ; la contestation
          est examinée par une personne physique. Aucune sanction n’ouvre droit à indemnité ni au
          remboursement des sommes versées lorsqu’elle procède d’un manquement du membre.
        </p>
      </>
    ),
  },
  {
    id: 'contenus',
    titre: 'Article 10 — Contenus des membres',
    corps: (
      <>
        <p>
          Le membre conserve la propriété de ses contenus. Il concède à Téranga, pour la seule durée
          de son inscription et aux seules fins d’exploitation du Service, une licence non exclusive
          de reproduction et de représentation de ses contenus sur le Service. Cette licence ne
          confère aucun droit d’exploitation publicitaire ou commerciale sans accord distinct et
          exprès.
        </p>
        <p>
          Le membre garantit détenir les droits sur les contenus publiés, et notamment disposer de
          l’accord de toute personne figurant sur une photographie.
        </p>
        <div className={styles.encadre}>
          <strong>Photographies privées.</strong> Le réglage « photos privées » restreint l’affichage
          des photographies aux autres membres. Il ne les chiffre pas et ne les rend pas
          techniquement inaccessibles : le fichier transite par le réseau et reste visible de la
          modération. Nous ne pouvons pas davantage empêcher qu’un tiers réalise une capture d’écran.
          Ne publiez aucune image que vous ne pourriez assumer si elle circulait.
        </div>
      </>
    ),
  },
  {
    id: 'payant',
    titre: 'Article 11 — Services payants',
    corps: (
      <>
        <p>
          Certaines prestations sont payantes, notamment l’<strong>accompagnement personnalisé</strong>
          assuré par les assistants. Leur prix, leur durée et leur contenu sont indiqués avant tout
          paiement. Les paiements sont traités par des prestataires tiers (mobile money, carte,
          PayPal, virement) ; Téranga ne conserve aucune donnée bancaire.
        </p>
        <h3>11.1 — Nature de l’accompagnement</h3>
        <p>
          L’accompagnement est une prestation de <strong>conseil</strong>, soumise à une obligation de
          moyens. Il ne garantit aucune rencontre, aucune union, aucun résultat. Les assistants ne
          sont ni des professionnels de santé, ni des avocats, ni des travailleurs sociaux, et leurs
          conseils ne se substituent pas à un avis médical, juridique ou à l’intervention des
          autorités.
        </p>
        <h3>11.2 — Droit de rétractation</h3>
        <p>
          Téranga vous <strong>accorde</strong>, quel que soit votre pays de résidence, un délai de
          <strong> quatorze (14) jours</strong> à compter de la souscription pour vous rétracter sans
          motif ni pénalité, par simple demande à <MailLegal boite="contact" />. Cet engagement est
          contractuel : il s’applique même là où la loi locale n’impose pas un tel délai, et il ne
          fait pas obstacle à un délai plus long que celle-ci vous accorderait.
        </p>
        <p>
          Lorsqu’il demande l’exécution immédiate de la prestation avant l’expiration de ce délai, il
          en est expressément informé : l’exécution complète avant la fin du délai lui fait perdre son
          droit de rétractation, et une exécution partielle donne lieu au paiement du prorata
          correspondant.
        </p>
        <h3>11.3 — Reconduction et résiliation</h3>
        <p>
          Les formules à durée déterminée ne se reconduisent pas tacitement, sauf mention contraire
          affichée avant paiement. Le cas échéant, le membre est informé de l’échéance en temps utile
          et peut résilier à tout moment depuis son compte, la résiliation prenant effet au terme de
          la période en cours.
        </p>
      </>
    ),
  },
  {
    id: 'propriete',
    titre: 'Article 12 — Propriété intellectuelle',
    corps: (
      <p>
        La marque Téranga, les logos, l’identité visuelle, les textes éditoriaux, les bases de données
        et le code du Service sont protégés et demeurent la propriété exclusive de l’éditeur. Toute
        reproduction, extraction ou réutilisation, totale ou substantielle, est interdite sans
        autorisation écrite préalable.
      </p>
    ),
  },
  {
    id: 'duree',
    titre: 'Article 13 — Durée, suspension et clôture du compte',
    corps: (
      <>
        <p>
          Le compte est ouvert pour une durée indéterminée. Le membre peut le mettre en pause ou le
          supprimer à tout moment depuis son profil, sans motif.
        </p>
        <p>
          La suppression entraîne le retrait du profil et son inaccessibilité aux autres membres.
          Certaines données sont néanmoins conservées, pour la durée et aux fins précisées par la
          <a href="/confidentialite"> politique de confidentialité</a> — notamment les éléments liés à
          un signalement, une obligation comptable ou un litige. Les articles 7, 8.5 et 15 survivent à
          la clôture du compte.
        </p>
      </>
    ),
  },
  {
    id: 'modification',
    titre: 'Article 14 — Modification des CGU',
    corps: (
      <p>
        Les présentes CGU peuvent être modifiées. Toute modification substantielle est portée à la
        connaissance des membres au moins <strong>trente (30) jours</strong> avant son entrée en
        vigueur. Le membre qui refuse les nouvelles conditions peut supprimer son compte avant cette
        date ; la poursuite de l’utilisation au-delà vaut acceptation. La version applicable est celle
        en vigueur au jour de l’utilisation, identifiée par la date figurant en tête du présent
        document.
      </p>
    ),
  },
  {
    id: 'litiges',
    titre: 'Article 15 — Droit applicable et règlement des litiges',
    corps: (
      <>
        <p>
          Les présentes CGU sont régies par le droit <span className={styles.aCompleter}>[À COMPLÉTER : droit applicable — celui du pays d’établissement de l’éditeur]</span>.
        </p>
        <p>
          En cas de différend, le membre est invité à saisir d’abord notre service à
          <MailLegal boite="contact" />, qui s’engage à répondre sous trente (30) jours. À défaut de
          solution, il peut recourir gratuitement à la médiation de la consommation :{' '}
          <span className={styles.aCompleter}>[À COMPLÉTER : médiateur ou organisme de règlement amiable compétent dans le pays d’établissement]</span>.
          Les membres résidant dans l’Union européenne disposent en outre de la plateforme européenne
          de règlement en ligne des litiges, et ceux dont le pays connaît un dispositif équivalent —
          médiateur sectoriel, autorité de régulation, association de consommateurs agréée — peuvent
          le saisir dans les mêmes conditions.
        </p>
        <p>
          À défaut d’accord amiable, le litige est porté devant les juridictions compétentes. Il est
          rappelé que le <strong>consommateur</strong> conserve, en toute hypothèse, la faculté de
          saisir la juridiction du lieu de son domicile, conformément aux règles d’ordre public qui
          lui sont applicables.
        </p>
        <p>
          Si l’une des stipulations des présentes était déclarée nulle ou non écrite, les autres
          conserveraient leur plein effet.
        </p>
      </>
    ),
  },
]

export default function CGU() {
  return (
    <PageLegale
      eyebrow="CONDITIONS GÉNÉRALES"
      titre="Conditions générales"
      titreAccent="d’utilisation"
      chapo="Ce que nous nous engageons à faire, ce que nous ne pouvons pas faire, et ce à quoi vous vous engagez en créant un compte. Les articles 5 à 7 concernent votre sécurité : lisez-les."
      version={`Version 1.0 — en vigueur au ${MAJ}.`}
      sections={sections}
    />
  )
}
