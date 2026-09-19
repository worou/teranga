/**
 * Adresses de contact citées par les documents légaux.
 *
 * ⚠️ À FAIRE AVANT LA MISE EN LIGNE — ces quatre boîtes doivent exister et
 * être relevées. Aucune n'est configurée dans le dépôt à ce jour.
 *
 * LE DOMAINE EST `teranga.re`, celui du site en production. Une première
 * version de ce fichier portait `teranga.africa`, repris de
 * `frontoffice/.env.example` (CORS_ORIGIN) et de la configuration Swagger :
 * ce domaine N'EXISTE PAS (NXDOMAIN). Les quatre canaux de signalement
 * renvoyaient donc dans le vide. Ces deux références du dépôt restent à
 * corriger ; ne pas les reprendre comme source.
 *
 * Ce n'est pas un détail cosmétique. Publier un canal de signalement qui
 * rebondit est PIRE que de ne pas en publier : l'article 16 du DSA et
 * l'article 6 de la LCEN font du dispositif de notification la condition même
 * du statut d'hébergeur. Une adresse morte transforme une protection en aveu
 * de défaillance, et la CGU comme la politique de confidentialité s'engagent
 * par ailleurs sur des délais de réponse (un mois pour le DPO).
 *
 * Elles sont réunies ici pour qu'un seul fichier suffise à les corriger — par
 * exemple pour tout renvoyer vers une boîte unique, si les quatre ne peuvent
 * pas être créées tout de suite. Un alias suffit ; ce qui compte est que
 * quelqu'un lise.
 */
export const BOITES = {
  /** Signalement de contenus et comportements illicites. Priorité absolue. */
  signalement: 'signalement@teranga.re',
  /** Contestation d'une décision de modération (réexamen humain, art. 22 RGPD). */
  moderation: 'moderation@teranga.re',
  /** Délégué à la protection des données — exercice des droits RGPD. */
  dpo: 'dpo@teranga.re',
  /** Contact général, rétractation, réclamation préalable. */
  contact: 'contact@teranga.re',
} as const

/** Lien `mailto:` vers l'une des boîtes ci-dessus, affichant l'adresse. */
export function MailLegal({ boite }: { boite: keyof typeof BOITES }) {
  const adresse = BOITES[boite]
  return <a href={`mailto:${adresse}`}>{adresse}</a>
}
