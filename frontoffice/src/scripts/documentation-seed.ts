import { prisma } from '../config/prisma';
import { DOCUMENTATION } from '../documentation/contenu';

/**
 * Pose la documentation initiale en base.
 *
 *   node dist/scripts/documentation-seed.js            → n'écrit que si absente
 *   node dist/scripts/documentation-seed.js --remplacer → écrase la version en base
 *
 * Le défaut est PRUDENT, et c'est le point de ce script : une fois la
 * documentation confiée au backoffice, elle vit sa vie. La rejouer sans le dire
 * écraserait les corrections apportées depuis — probablement celles qui
 * comptent le plus, puisqu'elles répondent à de vraies questions.
 *
 * `--remplacer` existe pour deux cas : la restauration après un accident, et la
 * réinitialisation délibérée.
 */
async function main() {
  const remplacer = process.argv.includes('--remplacer');
  const CLE = 'documentation';

  const existante = await prisma.setting.findUnique({ where: { key: CLE } });

  if (existante && !remplacer) {
    let nb = '?';
    try {
      nb = String(JSON.parse(existante.value).length);
    } catch {
      nb = 'illisible';
    }
    console.log(`Documentation déjà en base (${nb} sections). Rien fait.`);
    console.log('Pour l’écraser malgré tout : --remplacer');
    return;
  }

  const value = JSON.stringify(DOCUMENTATION);
  await prisma.setting.upsert({
    where: { key: CLE },
    update: { value },
    create: { key: CLE, value },
  });

  console.log(
    `${existante ? 'Documentation remplacée' : 'Documentation posée'} : ` +
      `${DOCUMENTATION.length} sections, ${value.length} caractères.`,
  );
  console.log('Elle s’édite désormais depuis le backoffice, sans redéploiement.');
}

main()
  .catch((e) => {
    console.error('Échec :', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
