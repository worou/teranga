import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';

/**
 * Mode maintenance — le site est fermé, le backoffice reste ouvert.
 *
 * ─── OÙ CE GARDE DOIT ÊTRE MONTÉ ─────────────────────────────────────────
 *
 * AVANT `express.static`. Celui-ci sert `index.html` pour `/` tout seul : posé
 * après, le garde ne verrait jamais la page d'accueil, c'est-à-dire justement
 * ce qu'on cherche à remplacer.
 *
 * ─── CE QUI PASSE MALGRÉ TOUT ────────────────────────────────────────────
 *
 *   `/health`        — la supervision doit continuer de répondre, sinon on ne
 *                      distingue plus « en maintenance » de « tombé ».
 *   `/.well-known/`  — Let's Encrypt y dépose un jeton et le relit pour
 *                      renouveler le certificat. Le bloquer pendant une
 *                      fenêtre de maintenance ferait échouer le renouvellement
 *                      — une panne bien pire que celle qu'on organise.
 *
 * Tout le reste est fermé, `/api/v1/auth` compris : laisser quelqu'un se
 * connecter à une application qu'on est en train de mettre à jour promet un
 * service qu'on ne rend pas. C'est un choix, pas un oubli.
 *
 * LE BACKOFFICE N'EST PAS CONCERNÉ : c'est une application Passenger distincte,
 * montée sur `/admin`, dont les requêtes n'atteignent jamais ce processus.
 * C'est ce qui garantit qu'on peut toujours rouvrir le site — sans quoi le
 * seul retour serait le SSH.
 */

const CLE = 'maintenance';

/**
 * Le drapeau est relu au plus une fois toutes les 15 secondes.
 *
 * Sans ce cache, chaque requête — y compris chaque image — coûterait une
 * requête SQL, sur un hébergement où l'utilisateur MySQL est plafonné à 35
 * connexions. Le prix à payer est symétrique et doit être annoncé à
 * l'administrateur : l'ouverture comme la fermeture prennent effet en une
 * quinzaine de secondes, pas instantanément.
 */
const TTL_MS = 15_000;
let cache: { actif: boolean; message: string } = { actif: false, message: '' };
let luA = 0;

export type EtatMaintenance = { actif: boolean; message: string };

/** Lecture directe, sans cache — pour le backoffice, qui doit voir le vrai. */
export async function lireMaintenance(): Promise<EtatMaintenance> {
  const ligne = await prisma.setting.findUnique({ where: { key: CLE } });
  if (!ligne) return { actif: false, message: '' };
  try {
    const v = JSON.parse(ligne.value);
    return { actif: !!v.actif, message: String(v.message ?? '') };
  } catch {
    return { actif: false, message: '' };
  }
}

async function etatCache(): Promise<EtatMaintenance> {
  const maintenant = Date.now();
  if (maintenant - luA < TTL_MS) return cache;
  luA = maintenant;
  try {
    cache = await lireMaintenance();
  } catch {
    // Base injoignable : on ne ferme pas le site pour autant. Une panne de
    // lecture du drapeau ne doit pas se transformer en panne totale.
  }
  return cache;
}

/**
 * Page servie aux visiteurs. Embarquée dans le code, et non déposée dans
 * `public/` : ce dossier est ENTIÈREMENT vidé à chaque `vite build`
 * (`emptyOutDir`), et il l'est justement pendant un déploiement — le moment
 * précis où cette page doit s'afficher.
 */
function pageMaintenance(message: string): string {
  const texte = message.trim() || 'Nous améliorons Téranga. Le site sera de retour dans quelques instants.';
  const echappe = texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Téranga — maintenance</title>
<style>
  :root { --sand:#F5E6D3; --cream:#FDF8F0; --ocre:#D49060; --ocre-deep:#B8691A; --terra-deep:#5B2E0C; --ink:#2B1605; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         background:var(--cream); color:var(--ink);
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .carte { max-width:520px; text-align:center; }
  .logo { font-family: Georgia, 'Times New Roman', serif; font-size:34px; font-weight:500; color:var(--terra-deep); margin-bottom:6px; }
  .logo em { font-style:italic; color:var(--ocre-deep); }
  .baseline { font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--ocre-deep); opacity:.85; margin-bottom:34px; }
  h1 { font-family: Georgia, serif; font-weight:500; font-size:26px; margin:0 0 14px; }
  p { font-size:15px; line-height:1.6; color:#4A2A12; margin:0 auto; max-width:420px; }
  .barre { margin:32px auto 0; width:120px; height:4px; border-radius:2px; background:rgba(184,105,26,.2); overflow:hidden; }
  .barre span { display:block; width:40%; height:100%; border-radius:2px; background:var(--ocre-deep); animation:va 1.4s ease-in-out infinite; }
  @keyframes va { 0%{transform:translateX(-100%)} 100%{transform:translateX(250%)} }
  @media (prefers-reduced-motion: reduce) { .barre span { animation:none; width:100% } }
</style>
</head>
<body>
  <div class="carte">
    <div class="logo">Tér<em>anga</em></div>
    <div class="baseline">La rencontre, autrement</div>
    <h1>Le site est en maintenance</h1>
    <p>${echappe}</p>
    <div class="barre"><span></span></div>
  </div>
</body>
</html>`;
}

export async function maintenance(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/health' || req.path.startsWith('/.well-known/')) return next();

  const etat = await etatCache();
  if (!etat.actif) return next();

  // 503, jamais 200 : un 200 dit aux moteurs de recherche que le site EST
  // cette page, et l'indexation en pâtit durablement. `Retry-After` donne un
  // ordre de grandeur aux robots comme aux clients.
  res.setHeader('Retry-After', '600');
  res.setHeader('Cache-Control', 'no-store');

  if (req.path.startsWith('/api/')) {
    res.status(503).json({
      statusCode: 503,
      error: 'Service Unavailable',
      message: etat.message.trim() || 'Le site est en maintenance. Réessayez dans quelques instants.',
      details: { code: 'MAINTENANCE' },
    });
    return;
  }

  res.status(503).type('html').send(pageMaintenance(etat.message));
}
