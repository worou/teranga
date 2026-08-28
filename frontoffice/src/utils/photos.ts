/**
 * Photos d'un membre telles qu'un AUTRE membre a le droit de les voir.
 *
 * Une seule définition, parce qu'il y a plusieurs surfaces publiques — le fil
 * de découverte, la fiche, les favoris, la liste des conversations — et qu'en
 * oublier une laisse fuir le visage qu'on promet de cacher. Le choix est porté
 * par `User.photosVisibility` et vaut pour tout le profil.
 *
 * Ne s'applique JAMAIS à ce qu'on renvoie au membre lui-même : il voit
 * toujours ses propres photos.
 */
export function photosVisibles<T>(membre: {
  photos?: T[] | null;
  photosVisibility?: string | null;
}): T[] {
  if (membre.photosVisibility === 'PRIVATE') return [];
  return membre.photos ?? [];
}
