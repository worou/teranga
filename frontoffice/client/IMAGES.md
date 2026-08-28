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
    src: '/images/maries-dakar.webp',
    alt: 'Des mariés devant leur famille',
    legende: 'Des rencontres qui mènent au mariage',
    cadrage: 'center 30%',       // facultatif — voir « Recadrage »
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

Aucune des dix diapositives actuelles n'en porte : elles viennent toutes
d'Unsplash, qui n'exige pas d'attribution. Ce n'est donc pas un oubli si rien
ne s'affiche en haut à droite.

**Attention aux aperçus filigranés.** Unsplash+ est une offre payante : sans
abonnement, on n'obtient qu'un aperçu couvert d'un « Unsplash+ » répété — y
compris en faisant une capture d'écran de la page. Ce fichier-là n'est pas
sous licence, et le filigrane se verrait sur la bannière. Deux captures de ce
type ont déjà été écartées lors du premier versement d'images ; si une image
porte une mention en travers, elle ne va pas dans ce dossier.

## Format conseillé

- **Cadrage** : portrait ou carré (la bannière affiche en 4/5 sur ordinateur,
  3/2 sur mobile).
- **Largeur** : 1000 à 1400 px suffisent — au-delà, on fait payer aux visiteurs
  des pixels qu'ils ne verront pas.
- **Poids** : viser moins de 200 Ko par image. Convertir en `.webp` divise
  généralement le poids par deux à qualité égale.
- **Nom de fichier** : en minuscules, sans accent ni espace.

Les dix images en place ont été produites depuis les originaux avec `ffmpeg`,
en ramenant le petit côté à 1000 px, le grand plafonné à 1500 — soit
`1000:1500` pour un portrait 2/3, `1500:1000` pour un paysage 3/2 :

```bash
ffmpeg -i original.jpg -vf "scale=1000:1500:flags=lanczos" -c:v libwebp -quality 78 -compression_level 6 -frames:v 1 sortie.webp
```

`-frames:v 1` n'est pas décoratif : sans lui, ffmpeg peut choisir l'encodeur
`libwebp_anim` et livrer un conteneur animé au lieu d'une image fixe.

## Recadrage

Une même photo est rognée deux fois, différemment : en 4/5 sur ordinateur,
en 3/2 sur mobile. Le rognage part du centre, ce qui convient à la plupart des
images — mais coupe le sujet quand il n'y est pas : des mains en bas du cadre,
des visages en haut. Le champ `cadrage` déplace la fenêtre ; il prend une
valeur `object-position` CSS (`'center 30%'`, `'20% center'`).

La vérification prend deux minutes et vaut mieux qu'un doute :

```bash
# Ce que voit un visiteur sur ordinateur (4/5) puis sur mobile (3/2).
ffmpeg -i image.webp -vf "crop='min(iw,ih*4/5)':'min(ih,iw*5/4)'" apercu-4-5.png
ffmpeg -i image.webp -vf "crop='min(iw,ih*3/2)':'min(ih,iw*2/3)'" apercu-3-2.png
```

## Provenance des images en place

Toutes viennent d'Unsplash. Le nom d'origine contient l'identifiant de la
photo : c'est par lui qu'on retrouve la page source, donc la licence, le jour
où quelqu'un demandera d'où vient telle image.

| Fichier servi | Original Unsplash |
|---|---|
| `couple-rire-portrait.webp` | `asso-myron-4is8yIS7Qqg-unsplash.jpg` |
| `maries-voile-coucher-soleil.webp` | `jakob-owens-mLIurLmSRAY-unsplash.jpg` |
| `mains-jointes-alliances.webp` | `alfonso-lorenzetto-BTPLv4zvEbs-unsplash.jpg` |
| `couple-complice-foret.webp` | `carly-rae-hobbins-zNHOIzjJiyA-unsplash.jpg` |
| `couple-canape-salon.webp` | `no-revisions-iNK5CGCpD8U-unsplash.jpg` |
| `maries-etreinte-coucher-soleil.webp` | `jakob-owens-jbaF5N0uO0k-unsplash.jpg` |
| `mains-tenues-arbre.webp` | `d-ng-h-u-CCjgYjUudxE-unsplash.jpg` |
| `couple-tendresse-soiree.webp` | `one-zone-studio-9B4hD5joEk4-unsplash.jpg` |
| `maries-promenade-palmier.webp` | `jakob-owens-SiniLJkXhMc-unsplash.jpg` |
| `alliances-dorees.webp` | `sandy-millar-8vaQKYnawHw-unsplash.jpg` |
