import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { config } from '../config';
import { lireDocumentation } from '../services/documentation.service';
import { repondre, repondreParDocumentation, claudeActif } from '../services/chatbot.service';

/**
 * L'aide et l'assistance automatique — ouvertes aux visiteurs.
 *
 * Pas de `requireAuth` : quelqu'un qui hésite à s'inscrire doit pouvoir demander
 * comment le site fonctionne, et une aide réservée aux membres ne sert
 * précisément pas ceux qui en ont le plus besoin.
 *
 * Mais ouvrir au public un point d'entrée qui appelle un modèle payant, c'est
 * publier un robinet. D'où deux garde-fous distincts, qui ne protègent pas de la
 * même chose :
 *
 *   — Le limiteur par adresse IP : contre l'abus d'un visiteur. Il ne fonctionne
 *     que parce que `TRUST_PROXY` est réglé ; sans cela, derrière Passenger,
 *     toutes les requêtes porteraient la même adresse et le seau serait commun.
 *
 *   — Le plafond journalier : contre la facture. Même réparti sur mille adresses,
 *     l'usage s'arrête au nombre d'appels prévu. Le service ne tombe pas pour
 *     autant : il retombe sur la recherche par mots-clés, qui ne coûte rien.
 */
const router = Router();

/** Dix questions par heure et par adresse. De quoi chercher, pas de quoi miner. */
const limiteur = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Trop de questions. Réessayez dans une heure, ou consultez la page d’aide.',
  },
});

/**
 * Compteur journalier des appels au modèle.
 *
 * En mémoire, donc remis à zéro au redémarrage, et non partagé si le serveur
 * venait à tourner en plusieurs exemplaires. C'est assumé : il borne une
 * facture, il ne garde pas un trésor. Un compteur en base coûterait une écriture
 * par question pour une garantie dont personne n'a besoin ici.
 */
let appelsDuJour = 0;
let jourCourant = new Date().toDateString();

function budgetDisponible(): boolean {
  const aujourdhui = new Date().toDateString();
  if (aujourdhui !== jourCourant) {
    jourCourant = aujourdhui;
    appelsDuJour = 0;
  }
  return appelsDuJour < config.chatbot.dailyMax;
}

/**
 * @openapi
 * /aide/documentation:
 *   get:
 *     tags: [Aide]
 *     summary: La documentation du site
 *     responses:
 *       200: { description: "Sections de la documentation" }
 */
router.get(
  '/aide/documentation',
  asyncHandler(async (req, res) => {
    // `?categorie=conseils` sert la page publique de conseils ; sans filtre,
    // tout est rendu. Cette route est de la LECTURE : le cloisonnement qui
    // compte est celui du chatbot, appliqué dans `chercher` et
    // `documentationEnTexte`.
    const demandee = String(req.query.categorie || '');
    const sections = await lireDocumentation();
    const filtrees =
      demandee === 'aide' || demandee === 'conseils'
        ? sections.filter((s) => (s.categorie ?? 'aide') === demandee)
        : sections;

    res.json({
      data: filtrees.map((s) => ({
        id: s.id,
        categorie: s.categorie ?? 'aide',
        titre: s.titre,
        contenu: s.contenu,
      })),
    });
  }),
);

/**
 * @openapi
 * /aide/question:
 *   post:
 *     tags: [Aide]
 *     summary: Poser une question à l'assistance automatique
 *     responses:
 *       200: { description: "Réponse, et sections de documentation associées" }
 *       400: { description: "Question absente ou trop longue" }
 *       429: { description: "Trop de questions depuis cette adresse" }
 */
router.post(
  '/aide/question',
  limiteur,
  asyncHandler(async (req, res) => {
    const question = String(req.body?.question ?? '').trim();

    if (!question) throw AppError.badRequest('Posez votre question.');
    // Une question d'aide tient en une phrase. La borne écarte surtout les
    // envois de texte massifs, qui ne cherchent pas une réponse mais à faire
    // gonfler la facture.
    if (question.length > 500) {
      throw AppError.badRequest('Question trop longue : allez à l’essentiel, en une phrase ou deux.');
    }

    // Budget épuisé : on ne refuse pas la question, on répond sans le modèle.
    // Appel direct plutôt que `repondre`, qui tenterait d'abord l'appel réseau
    // que le budget interdit justement.
    if (claudeActif() && !budgetDisponible()) {
      return res.json(await repondreParDocumentation(question));
    }

    if (claudeActif()) appelsDuJour += 1;
    res.json(await repondre(question));
  }),
);

export default router;
