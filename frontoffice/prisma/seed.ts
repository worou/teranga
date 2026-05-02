/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Téranga database...');

  // Clean existing (dev only)
  await prisma.message.deleteMany();
  await prisma.match.deleteMany();
  await prisma.like.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('Password123!', 10);

  // ========== WOMEN (free) ==========
  const women = [
    {
      phone: '+221771000001',
      firstName: 'Aminata',
      lastName: 'Diop',
      birthDate: new Date('1995-03-14'),
      gender: 'FEMALE',
      intent: 'MARRIAGE',
      religion: 'MUSLIM',
      city: 'Dakar',
      country: 'SN',
      profession: 'Enseignante',
      bio: "Passionnée par l'éducation et la famille. Je cherche un homme avec des valeurs.",
      photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80',
    },
    {
      phone: '+221771000002',
      firstName: 'Fatou',
      lastName: 'Sow',
      birthDate: new Date('1992-07-22'),
      gender: 'FEMALE',
      intent: 'MARRIAGE',
      religion: 'MUSLIM',
      city: 'Dakar',
      country: 'SN',
      profession: 'Pharmacienne',
      bio: 'Mère d\'une fille. Je cherche une relation stable et sincère.',
      hasChildren: true,
      photo: 'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=600&q=80',
    },
    {
      phone: '+2250701000003',
      firstName: 'Clarisse',
      lastName: 'Kouassi',
      birthDate: new Date('1996-11-03'),
      gender: 'FEMALE',
      intent: 'SERIOUS_RELATIONSHIP',
      religion: 'CHRISTIAN',
      city: 'Abidjan',
      country: 'CI',
      profession: 'Architecte',
      bio: 'J\'aime l\'art, la cuisine ivoirienne et les longues conversations.',
      photo: 'https://images.unsplash.com/photo-1609234656388-0ff363383899?w=600&q=80',
    },
  ];

  // ========== MEN (need subscription for messaging) ==========
  const men = [
    {
      phone: '+221771000101',
      firstName: 'Ibrahim',
      lastName: 'Ndiaye',
      birthDate: new Date('1990-05-18'),
      gender: 'MALE',
      intent: 'MARRIAGE',
      religion: 'MUSLIM',
      city: 'Dakar',
      country: 'SN',
      profession: 'Ingénieur télécom',
      bio: "Cofondateur d'une start-up. Je cherche à fonder un foyer sur des bases solides.",
      photo: 'https://images.unsplash.com/photo-1507152832244-10d45c7eda57?w=600&q=80',
      subscribed: true,
    },
    {
      phone: '+221771000102',
      firstName: 'Mamadou',
      lastName: 'Ba',
      birthDate: new Date('1988-09-30'),
      gender: 'MALE',
      intent: 'MARRIAGE',
      religion: 'MUSLIM',
      city: 'Dakar',
      country: 'SN',
      profession: 'Médecin',
      bio: 'Médecin urgentiste. La famille est ma priorité.',
      photo: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=600&q=80',
      subscribed: false,
    },
    {
      phone: '+2250701000103',
      firstName: 'Jean-Paul',
      lastName: 'Yao',
      birthDate: new Date('1989-02-11'),
      gender: 'MALE',
      intent: 'MARRIAGE',
      religion: 'CHRISTIAN',
      city: 'Abidjan',
      country: 'CI',
      profession: 'Avocat',
      bio: 'Avocat en droit des affaires. J\'aime la musique, les voyages, les enfants.',
      photo: 'https://images.unsplash.com/photo-1581803118522-7b72a50f7e9f?w=600&q=80',
      subscribed: true,
    },
  ];

  const createdWomen = [];
  for (const w of women) {
    const u = await prisma.user.create({
      data: {
        phone: w.phone,
        passwordHash: password,
        firstName: w.firstName,
        lastName: w.lastName,
        birthDate: w.birthDate,
        gender: w.gender as any,
        intent: w.intent as any,
        religion: w.religion as any,
        city: w.city,
        country: w.country,
        profession: w.profession,
        bio: w.bio,
        hasChildren: w.hasChildren || false,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isVerified: true,
        phoneVerified: true,
        biometricVerified: true,
        photos: {
          create: [{ url: w.photo, order: 0, isMain: true, moderationStatus: 'VERIFIED' }],
        },
        subscription: {
          create: { plan: 'FREE', status: 'ACTIVE' },
        },
      },
    });
    createdWomen.push(u);
    console.log(`  ✓ Femme créée: ${u.firstName} ${u.lastName}`);
  }

  const createdMen = [];
  for (const m of men) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);

    const u = await prisma.user.create({
      data: {
        phone: m.phone,
        passwordHash: password,
        firstName: m.firstName,
        lastName: m.lastName,
        birthDate: m.birthDate,
        gender: m.gender as any,
        intent: m.intent as any,
        religion: m.religion as any,
        city: m.city,
        country: m.country,
        profession: m.profession,
        bio: m.bio,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        isVerified: true,
        phoneVerified: true,
        biometricVerified: true,
        photos: {
          create: [{ url: m.photo, order: 0, isMain: true, moderationStatus: 'VERIFIED' }],
        },
        subscription: {
          create: m.subscribed
            ? { plan: 'STANDARD', status: 'ACTIVE', startsAt: new Date(), expiresAt }
            : { plan: 'FREE', status: 'ACTIVE' },
        },
      },
    });
    createdMen.push(u);
    console.log(
      `  ✓ Homme créé: ${u.firstName} ${u.lastName} ${m.subscribed ? '(abonné STANDARD)' : '(free)'}`,
    );
  }

  // ========== MATCHES ==========
  const orderIds = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

  // Aminata <3 Ibrahim (both like each other)
  await prisma.like.create({
    data: { senderId: createdWomen[0].id, receiverId: createdMen[0].id },
  });
  await prisma.like.create({
    data: { senderId: createdMen[0].id, receiverId: createdWomen[0].id },
  });
  const [a1, a2] = orderIds(createdWomen[0].id, createdMen[0].id);
  const match1 = await prisma.match.create({
    data: { userAId: a1, userBId: a2, status: 'MATCHED' },
  });

  // Seed messages for match1
  await prisma.message.createMany({
    data: [
      {
        matchId: match1.id,
        senderId: createdMen[0].id,
        content: 'Bonjour Aminata, votre profil m\'a beaucoup touché.',
        createdAt: new Date(Date.now() - 3600 * 1000),
      },
      {
        matchId: match1.id,
        senderId: createdMen[0].id,
        content: 'Vous êtes enseignante ? Dans quel domaine ?',
        createdAt: new Date(Date.now() - 3400 * 1000),
      },
      {
        matchId: match1.id,
        senderId: createdWomen[0].id,
        content: 'Bonjour Ibrahim ! J\'enseigne les mathématiques au lycée.',
        createdAt: new Date(Date.now() - 3000 * 1000),
        readAt: new Date(Date.now() - 2900 * 1000),
      },
    ],
  });

  // Clarisse <3 Jean-Paul
  await prisma.like.create({
    data: { senderId: createdWomen[2].id, receiverId: createdMen[2].id },
  });
  await prisma.like.create({
    data: { senderId: createdMen[2].id, receiverId: createdWomen[2].id },
  });
  const [b1, b2] = orderIds(createdWomen[2].id, createdMen[2].id);
  await prisma.match.create({
    data: { userAId: b1, userBId: b2, status: 'MATCHED' },
  });

  // ========== EVENTS ==========
  await prisma.event.create({
    data: {
      title: 'Café Téranga — Dakar',
      description:
        'Rencontrez 10 célibataires sérieux autour d\'un café. Ambiance conviviale et respectueuse.',
      type: 'IN_PERSON',
      city: 'Dakar',
      country: 'SN',
      venueAddress: 'Café Le Ngor, Almadies',
      startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 3 * 3600 * 1000),
      maxParticipants: 20,
      coverImageUrl: 'https://images.unsplash.com/photo-1559305616-3f99cd43e353?w=800',
    },
  });

  await prisma.event.create({
    data: {
      title: 'Visio : Communiquer dans le couple',
      description:
        'Atelier animé par une thérapeute conjugale. 1h30 d\'échanges et de conseils.',
      type: 'VIRTUAL',
      startsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000 + 5400 * 1000),
      maxParticipants: 50,
      virtualLink: 'https://meet.teranga.africa/abc-def-ghi',
      coverImageUrl: 'https://images.unsplash.com/photo-1528901166007-3784c7dd3653?w=800',
    },
  });

  console.log('✅ Seeding terminé.');
  console.log('\n📱 Comptes de test (mot de passe: Password123!) :');
  console.log('   Femmes : +221771000001 (Aminata), +221771000002 (Fatou), +2250701000003 (Clarisse)');
  console.log('   Hommes : +221771000101 (Ibrahim, abonné), +221771000102 (Mamadou, free), +2250701000103 (Jean-Paul, abonné)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
