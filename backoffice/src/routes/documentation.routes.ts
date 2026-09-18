import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

/**
 * L'édition de la documentation du site.
 *
 * C'est elle que lit l'assistance automatique du frontoffice. Corriger une
 * réponse ici suffit : le frontoffice relit la clé toutes les quinze secondes,
 * il n'y a rien à redéployer. C'est tout l'intérêt de l'avoir mise en base
 * plutôt que dans le code.
 *
 * Une section mal écrite se propage à tout le monde, puisque le modèle la
 * recopie fidèlement. D'où les validations ci-dessous : mieux vaut refuser un
 * enregistrement que publier une réponse vide.
 */
const router = Router();
router.use(requireAdmin);

const CLE = 'documentation';

interface Section {
  id: string;
  /** 'aide' est donnee au chatbot ; 'conseils' ne l'est jamais. */
  categorie: 'aide' | 'conseils';
  titre: string;
  motsCles: string[];
  contenu: string;
}

/** GET /api/admin/documentation */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const ligne = await prisma.setting.findUnique({ where: { key: CLE } });
    if (!ligne) return res.json({ sections: [] });
    try {
      const sections = JSON.parse(ligne.value);
      res.json({ sections: Array.isArray(sections) ? sections : [] });
    } catch {
      res.json({ sections: [], illisible: true });
    }
  }),
);

/**
 * PUT /api/admin/documentation — { sections: [...] }
 *
 * Remplacement intégral, pas de fusion. L'écran envoie ce qu'il affiche ;
 * fusionner obligerait à deviner ce qu'une absence signifie — une suppression
 * voulue, ou un champ que l'écran n'a pas envoyé ?
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const brut = req.body?.sections;
    if (!Array.isArray(brut)) throw AppError.badRequest('Format attendu : une liste de sections.');
    if (brut.length === 0) {
      throw AppError.badRequest(
        'Une documentation vide priverait l’assistance de toute réponse. Gardez au moins une section.',
      );
    }

    const vus = new Set<string>();
    const sections: Section[] = brut.map((s: any, i: number) => {
      const id = String(s?.id ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const titre = String(s?.titre ?? '').trim();
      const contenu = String(s?.contenu ?? '').trim();

      if (!id) throw AppError.badRequest(`Section ${i + 1} : identifiant manquant.`);
      // Deux sections de même identifiant : la seconde écraserait la première à
      // la prochaine lecture, sans que personne ne comprenne pourquoi.
      if (vus.has(id)) throw AppError.badRequest(`Identifiant en double : « ${id} ».`);
      vus.add(id);

      if (!titre) throw AppError.badRequest(`Section « ${id} » : titre manquant.`);
      if (!contenu) throw AppError.badRequest(`Section « ${id} » : contenu vide.`);

      const motsCles = (Array.isArray(s?.motsCles) ? s.motsCles : String(s?.motsCles ?? '').split(','))
        .map((m: any) => String(m).trim().toLowerCase())
        .filter(Boolean);

      // Toute valeur inconnue retombe sur 'aide'. Se tromper dans ce sens est
      // sans danger : au pire une section de conseil rejoint le contexte du
      // chatbot. L'inverse — une page d'aide classee en conseil — la
      // retirerait silencieusement de ses reponses.
      const categorie = s?.categorie === 'conseils' ? 'conseils' : 'aide';
      return { id, categorie, titre, motsCles, contenu };
    });

    const value = JSON.stringify(sections);
    await prisma.setting.upsert({
      where: { key: CLE },
      update: { value },
      create: { key: CLE, value },
    });

    res.json({ saved: true, sections: sections.length, delaiSecondes: 15 });
  }),
);

export default router;
