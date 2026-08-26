# Images de la page d'accueil

Déposez ici les photographies utilisées par le diaporama de la bannière.

Tout fichier placé dans ce dossier est recopié tel quel dans `frontoffice/public/`
à chaque `npm run build`, et servi à l'adresse `/images/<nom-du-fichier>`.

> C'est le bon endroit, et le seul. `frontoffice/public/` est **entièrement
> effacé** à chaque build (`emptyOutDir: true`) : un fichier déposé directement
> là-bas disparaîtrait à la reconstruction suivante.

## Comment les brancher

Dans [`src/components/HeroSlideshow.tsx`](src/components/HeroSlideshow.tsx),
un seul tableau à modifier :

```ts
const DIAPOSITIVES: Diapositive[] = [
  {
    src: '/images/maries-dakar.jpg',
    alt: 'Des mariés devant leur famille',
    legende: 'Des rencontres qui mènent au mariage',
    credit: 'Image : Freepik',   // facultatif — voir ci-dessous
  },
]
```

Le diaporama s'adapte au nombre de diapositives. Rien d'autre à toucher.

## Deux règles, et elles ne sont pas décoratives

**1. Ne jamais nommer les personnes photographiées.**
Ni prénom, ni ville, ni date de mariage, ni citation. Une photo d'illustration
légendée « Mariama & Oumar, mariés en mars 2026 » n'est plus une illustration :
c'est un témoignage, et un témoignage inventé sur un site de rencontres est un
mensonge — sanctionné comme pratique commerciale trompeuse, et destructeur pour
la confiance sur un marché où l'arnaque sentimentale est une inquiétude réelle.

Les légendes parlent du **service**, jamais des gens : « Des rencontres qui
mènent au mariage », pas « Voici Fatou et son fiancé ».

**2. Vérifier la licence, et l'attribution qu'elle impose.**

| Source | Usage commercial | Attribution |
|---|---|---|
| Photos de vos propres membres | avec leur **accord écrit** | — |
| Unsplash | autorisé | non exigée |
| Pexels | autorisé | non exigée |
| Freepik — offre gratuite | autorisé | **obligatoire** |
| Freepik — offre Premium | autorisé | non exigée |

Pour une image Freepik gratuite, renseignez `credit: 'Image : Freepik'` :
la mention s'affiche discrètement sur la diapositive. L'omettre place le site
en infraction avec la licence.

## Format conseillé

- **Cadrage** : portrait ou carré (la bannière affiche en 4/5 sur ordinateur,
  3/2 sur mobile).
- **Largeur** : 1000 à 1400 px suffisent — au-delà, on fait payer aux visiteurs
  des pixels qu'ils ne verront pas.
- **Poids** : viser moins de 200 Ko par image. Convertir en `.webp` divise
  généralement le poids par deux à qualité égale.
- **Nom de fichier** : en minuscules, sans accent ni espace.
