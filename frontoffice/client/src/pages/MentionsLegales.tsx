import PageLegale, { type SectionLegale } from '../components/PageLegale'
import styles from './Legal.module.css'
import { MailLegal } from '../components/MailLegal'

/**
 * Mentions légales.
 *
 * Document d'IDENTIFICATION, pas de responsabilité : qui édite, qui dirige la
 * publication, qui héberge, à qui l'on s'adresse. Les clauses de responsabilité
 * sont dans les CGU — c'est là qu'elles ont une valeur contractuelle, une page
 * d'information ne liant personne.
 *
 * RÉDIGÉ SANS ANCRAGE NATIONAL — le service dessert seize pays. On énonce les
 * obligations, jamais le numéro d'article qui les porte dans un droit donné.
 *
 * Les blocs `[À COMPLÉTER]` sont volontairement voyants : l'obligation
 * d'identifier l'éditeur d'un service en ligne existe dans tous ces pays, y est
 * généralement assortie de sanctions pénales, et ne se satisfait pas d'une
 * approximation. Ces valeurs ne pouvaient pas être déduites du dépôt ; elles
 * doivent être saisies avant mise en ligne.
 */

const MAJ = '19 septembre 2026'

const sections: SectionLegale[] = [
  {
    id: 'editeur',
    titre: 'Éditeur du site',
    corps: (
      <>
        <p>Le site et l’application Téranga sont édités par :</p>
        <div className={styles.encadre}>
          <ul>
            <li><strong>Dénomination sociale</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : raison sociale]</span></li>
            <li><strong>Forme juridique</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : SAS, SARL, SUARL…]</span></li>
            <li><strong>Capital social</strong> : <span className={styles.aCompleter}>[À COMPLÉTER]</span></li>
            <li><strong>Siège social</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : adresse postale complète]</span></li>
            <li><strong>Immatriculation</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : RCS / RCCM et numéro]</span></li>
            <li><strong>Numéro de TVA intracommunautaire</strong> : <span className={styles.aCompleter}>[À COMPLÉTER, le cas échéant]</span></li>
            <li><strong>Téléphone</strong> : <span className={styles.aCompleter}>[À COMPLÉTER]</span></li>
            <li><strong>Courriel</strong> : <MailLegal boite="contact" /></li>
          </ul>
        </div>
        <p>
          <strong>Directeur de la publication</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : nom et prénom du représentant légal]</span>.
        </p>
        <p>
          Si l’activité est exercée par une personne physique, seuls le nom, le prénom et le domicile
          sont exigés ; en cas d’activité non professionnelle, l’anonymat est possible à condition
          d’avoir communiqué son identité à l’hébergeur.
        </p>
      </>
    ),
  },
  {
    id: 'hebergeur',
    titre: 'Hébergeur',
    corps: (
      <>
        <p>Le site est hébergé par :</p>
        <div className={styles.encadre}>
          <ul>
            <li><strong>Société</strong> : o2switch SAS</li>
            <li><strong>Siège social</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : recopier l’adresse et le numéro RCS exacts depuis les mentions légales du site o2switch.com — ne pas les écrire de mémoire]</span></li>
            <li><strong>Site</strong> : <a href="https://www.o2switch.fr" target="_blank" rel="noreferrer">www.o2switch.fr</a></li>
          </ul>
        </div>
        <p>
          Les données sont hébergées sur des serveurs situés en France, donc sur le territoire de
          l’Union européenne.
        </p>
      </>
    ),
  },
  {
    id: 'activite',
    titre: 'Nature de l’activité',
    corps: (
      <>
        <p>
          Téranga est un service de <strong>mise en relation en ligne</strong> à finalité
          matrimoniale, destiné aux personnes majeures d’Afrique de l’Ouest francophone et de la
          diaspora.
        </p>
        <p>
          S’agissant des contenus publiés par les membres, l’éditeur agit en qualité
          d’<strong>intermédiaire technique</strong> — hébergeur : il les stocke sans en être
          l’auteur, sans les sélectionner et sans exercer sur eux de contrôle a priori. Ce régime,
          que connaissent les législations de l’ensemble des pays desservis, a pour contrepartie le
          retrait prompt de tout contenu manifestement illicite qui lui est signalé. Il agit en
          qualité d’<strong>éditeur</strong> pour ses seuls contenus propres — pages de
          présentation, conseils, documentation.
        </p>
        <p>
          Le service ne constitue pas une agence matrimoniale au sens des réglementations qui
          encadrent cette activité : aucune prestation de rapprochement individualisé n’est vendue au
          titre de l’inscription.
        </p>
      </>
    ),
  },
  {
    id: 'signaler',
    titre: 'Signaler un contenu illicite',
    corps: (
      <>
        <p>
          Un dispositif de signalement est accessible depuis chaque profil et chaque conversation.
          Il constitue la voie la plus rapide et doit être privilégié.
        </p>
        <div className={styles.encadre}>
          <p><strong>Par courriel</strong> : <MailLegal boite="signalement" /></p>
          <p>
            Pour être pleinement utile, une notification gagne à comporter : la date, l’identification
            précise du contenu ou du profil en cause (identifiant, URL), la description des faits et
            leur qualification, ainsi que les coordonnées du notifiant.
          </p>
        </div>
        <div className={styles.avertissement}>
          <strong>Urgence.</strong> Ce canal n’est pas un service d’urgence, n’est pas relevé en
          continu et ne déclenche aucune intervention sur place. En cas de danger immédiat,
          contactez la police et les secours de votre pays — le <strong>112</strong> depuis l’Union
          européenne. L’<a href="/conditions-generales#rencontres">article 6 des CGU</a> détaille les
          précautions à prendre avant et pendant une rencontre.
        </div>
        <p>
          Signaler comme illicite un contenu que l’on sait licite, afin d’en obtenir le retrait, est
          une faute susceptible d’engager la responsabilité de son auteur, et constitue une
          infraction dans plusieurs des pays desservis.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    titre: 'Données personnelles',
    corps: (
      <>
        <p>
          Le traitement des données personnelles est décrit par la
          <a href="/confidentialite"> politique de confidentialité</a>, qui précise les finalités, les
          bases légales, les destinataires, les durées de conservation et les modalités d’exercice
          des droits.
        </p>
        <p>
          <strong>Délégué à la protection des données</strong> : <MailLegal boite="dpo" />.
        </p>
        <p>
          <strong>Autorité de contrôle</strong> : <span className={styles.aCompleter}>[À COMPLÉTER : l’autorité de protection des données compétente dans le pays d’établissement de l’éditeur]</span>.
          Vous pouvez également saisir celle de votre propre pays de résidence, lorsqu’il en existe
          une.
        </p>
      </>
    ),
  },
  {
    id: 'propriete',
    titre: 'Propriété intellectuelle',
    corps: (
      <p>
        La marque Téranga, le logo, l’identité visuelle, les textes, les photographies éditoriales,
        la structure du site et son code source sont protégés par le droit de la propriété
        intellectuelle et demeurent la propriété exclusive de l’éditeur ou de ses concédants. Toute
        reproduction, représentation, adaptation ou extraction, totale ou partielle, faite sans
        autorisation écrite préalable, constitue une contrefaçon.
      </p>
    ),
  },
  {
    id: 'cgu',
    titre: 'Conditions d’utilisation et responsabilité',
    corps: (
      <>
        <p>
          L’utilisation du service est régie par les
          <a href="/conditions-generales"> conditions générales d’utilisation</a>, qui en constituent
          le cadre contractuel.
        </p>
        <div className={styles.avertissement}>
          <strong>Sécurité des rencontres.</strong> Téranga ne procède à aucune vérification des
          antécédents judiciaires de ses membres et n’encadre pas les rencontres physiques. Les
          <a href="/conditions-generales#nature"> articles 5</a>,
          <a href="/conditions-generales#rencontres"> 6</a> et
          <a href="/conditions-generales#responsabilite"> 7</a> des CGU exposent précisément la
          portée de nos engagements et leurs limites. Leur lecture est vivement recommandée avant
          toute rencontre.
        </div>
      </>
    ),
  },
  {
    id: 'cookies',
    titre: 'Cookies et traceurs',
    corps: (
      <p>
        Le service dépose les traceurs strictement nécessaires à son fonctionnement — maintien de la
        session, sécurité — qui sont dispensés de consentement. Tout traceur de mesure d’audience ou
        de publicité, s’il venait à être ajouté, ferait l’objet d’un recueil préalable du
        consentement. Le détail figure dans la <a href="/confidentialite#cookies">politique de
        confidentialité</a>.
      </p>
    ),
  },
]

export default function MentionsLegales() {
  return (
    <PageLegale
      eyebrow="MENTIONS LÉGALES"
      titre="Mentions"
      titreAccent="légales"
      chapo="Qui édite ce service, qui l’héberge, et comment nous joindre — y compris pour signaler un contenu ou un comportement."
      version={`Dernière mise à jour : ${MAJ}.`}
      sections={sections}
    />
  )
}
