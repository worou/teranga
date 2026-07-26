/**
 * Crée (ou réactive) le compte administrateur initial.
 *
 *   npx ts-node --transpile-only prisma/seedAdmin.ts
 *
 * Email : ADMIN_SEED_EMAIL (à définir dans .env ; défaut admin@example.com).
 * Mot de passe : ADMIN_SEED_PASSWORD si fourni, sinon un mot de passe fort est
 * généré et AFFICHÉ une seule fois. Le hash bcrypt seul est stocké en base.
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma';

/** Mot de passe fort lisible (sans caractères ambigus). */
function generatePassword(len = 16): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%&*';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const email = (process.env.ADMIN_SEED_EMAIL || 'admin@example.com').trim().toLowerCase();
  const provided = process.env.ADMIN_SEED_PASSWORD?.trim();
  const password = provided && provided.length >= 8 ? provided : generatePassword();
  const generated = !(provided && provided.length >= 8);

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    create: { email, passwordHash, name: 'Administrateur', role: 'SUPERADMIN', isActive: true },
    update: { passwordHash, isActive: true }, // réinitialise le mot de passe
  });

  console.log('\n✅ Administrateur prêt :');
  console.log(`   Email    : ${admin.email}`);
  console.log(`   Rôle     : ${admin.role}`);
  if (generated) {
    console.log(`   Mot de passe (À NOTER, affiché une seule fois) : ${password}`);
  } else {
    console.log('   Mot de passe : (celui fourni via ADMIN_SEED_PASSWORD)');
  }
  console.log('   → Connexion : http://localhost:3001  (à changer après la 1re connexion)\n');
}

main()
  .catch((e) => {
    console.error('Seed admin échoué :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
