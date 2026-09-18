import { prisma } from '../config/prisma';
import { DOCUMENTATION, type SectionDoc } from '../documentation/contenu';

/**
 * La documentation du site, et la recherche qui l'exploite.
 *
 * OÙ VIT LA DOCUMENTATION
 *
 * Dans la table `Setting`, sous la clé `documentation` — la même table que
 * l'interrupteur de maintenance, et pour la même raison : elle est partagée par
 * le frontoffice et le backoffice, qui sont deux processus distincts. On peut
 * donc corriger une réponse depuis l'administration, sans redéploiement.
 *
 * `src/documentation/contenu.ts` n'en est que la semence, rejouable.
 *
 * LE CACHE
 *
 * Quinze secondes, comme la maintenance. La documentation change quelques fois
 * par mois ; l'interroger à chaque question ferait une lecture de base par
 * message de chatbot, pour un contenu qui ne bouge pas.
 */

const CLE = 'documentation';
const CACHE_MS = 15_000;

let cache: { sections: SectionDoc[]; lu: number } | null = null;

/**
 * Lecture de la documentation vivante.
 *
 * Repli sur la semence si la base est muette ou illisible : une aide qui
 * disparaît parce qu'une ligne manque en base serait une panne de plus au
 * moment où quelqu'un cherche justement de l'aide.
 */
export async function lireDocumentation(): Promise<SectionDoc[]> {
  if (cache && Date.now() - cache.lu < CACHE_MS) return cache.sections;

  let sections = DOCUMENTATION;
  try {
    const ligne = await prisma.setting.findUnique({ where: { key: CLE } });
    if (ligne) {
      const brut = JSON.parse(ligne.value);
      if (Array.isArray(brut) && brut.length > 0) sections = brut as SectionDoc[];
    }
  } catch {
    // Base injoignable ou JSON corrompu : la semence fait l'affaire.
  }

  cache = { sections, lu: Date.now() };
  return sections;
}

/** Vide le cache — appelé après une écriture, pour ne pas attendre 15 s. */
export function oublierDocumentation(): void {
  cache = null;
}

/**
 * Normalisation pour la comparaison : minuscules, sans accents, sans
 * ponctuation.
 *
 * Indispensable ici : personne ne tape « comment désactiver mon compte ? » avec
 * les accents sur un clavier de téléphone, et « desactiver » doit trouver
 * « désactiver ».
 */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mots trop courants pour distinguer quoi que ce soit. Sans cette liste,
 * « comment je fais pour… » rapproche la question de toutes les sections à la
 * fois, et le meilleur score ne veut plus rien dire.
 */
const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'au',
  'aux', 'en', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'mon',
  'ma', 'mes', 'son', 'sa', 'ses', 'ce', 'cet', 'cette', 'que', 'qui', 'quoi',
  'est', 'sont', 'ai', 'as', 'avoir', 'etre', 'fais', 'faire', 'peut', 'peux',
  'pour', 'par', 'sur', 'dans', 'avec', 'pas', 'ne', 'plus', 'comment',
  'pourquoi', 'quand', 'ou', 'combien', 'quel', 'quelle', 'y', 'se', 'sur',
]);

function motsUtiles(texte: string): string[] {
  return normaliser(texte)
    .split(' ')
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
}

export interface Resultat {
  section: SectionDoc;
  score: number;
}

/**
 * Recherche par mots-clés.
 *
 * Trois poids, du plus sûr au plus faible : un mot-clé déclaré vaut le plus —
 * c'est une intention écrite exprès pour être trouvée ; le titre vient ensuite ;
 * le corps du texte compte le moins, parce qu'un mot peut s'y trouver par
 * hasard.
 *
 * Ce n'est pas de la compréhension. Une question formulée avec des mots absents
 * de la documentation ne trouvera rien, et c'est la limite assumée de ce chemin
 * tant que Claude n'est pas branché : mieux vaut ne rien répondre qu'inventer.
 */
export async function chercher(question: string, maxi = 3): Promise<Resultat[]> {
  const sections = await lireDocumentation();
  const mots = motsUtiles(question);
  if (mots.length === 0) return [];

  const resultats = sections.map((section) => {
    const cles = (section.motsCles || []).map(normaliser).join(' ');
    const titre = normaliser(section.titre);
    const corps = normaliser(section.contenu);

    let score = 0;
    for (const mot of mots) {
      if (cles.includes(mot)) score += 5;
      if (titre.includes(mot)) score += 3;
      else if (corps.includes(mot)) score += 1;
    }
    // Rapporté au nombre de mots : sans cela, une question longue obtient
    // mécaniquement un score élevé sur n'importe quelle section.
    return { section, score: score / mots.length };
  });

  return resultats
    .filter((r) => r.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxi);
}

/** La documentation entière, mise à plat — ce que lit le modèle. */
export async function documentationEnTexte(): Promise<string> {
  const sections = await lireDocumentation();
  return sections
    .map((s) => `## ${s.titre}\n\n${s.contenu}`)
    .join('\n\n---\n\n');
}
