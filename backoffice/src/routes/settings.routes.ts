import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../config/prisma';

/**
 * Réglages d'exploitation. Un seul pour l'instant : la maintenance.
 *
 * Le frontoffice lit ce même enregistrement, dans la même base — c'est le seul
 * canal partagé par les deux applications, qui sont deux processus Passenger
 * distincts avec chacun sa racine.
 *
 * IMPORTANT : ces routes vivent dans le BACKOFFICE, que le mode maintenance ne
 * ferme jamais. C'est ce qui garantit qu'on peut toujours rouvrir le site. Si
 * l'interrupteur habitait le frontoffice, l'activer couperait la branche sur
 * laquelle il est assis et il ne resterait que le SSH.
 */
const router = Router();
router.use(requireAdmin);

const CLE = 'maintenance';

type Etat = { actif: boolean; message: string };

async function lire(): Promise<Etat> {
  const l = await prisma.setting.findUnique({ where: { key: CLE } });
  if (!l) return { actif: false, message: '' };
  try {
    const v = JSON.parse(l.value);
    return { actif: !!v.actif, message: String(v.message ?? '') };
  } catch {
    return { actif: false, message: '' };
  }
}

/** GET /api/admin/settings/maintenance */
router.get(
  '/maintenance',
  asyncHandler(async (_req, res) => {
    res.json(await lire());
  }),
);

/** PUT /api/admin/settings/maintenance — { actif, message? } */
router.put(
  '/maintenance',
  asyncHandler(async (req, res) => {
    const actif = req.body?.actif === true;
    const message = String(req.body?.message ?? '').trim().slice(0, 500);
    const value = JSON.stringify({ actif, message });
    await prisma.setting.upsert({
      where: { key: CLE },
      create: { key: CLE, value },
      update: { value },
    });
    // Le frontoffice relit son drapeau au plus toutes les 15 secondes : on le
    // dit à l'appelant plutôt que de le laisser croire à un échec et cliquer
    // deux fois.
    res.json({ actif, message, delaiSecondes: 15 });
  }),
);

export default router;
