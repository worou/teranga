/**
 * Réglages du client déterminés à la construction.
 *
 * `SUBSCRIPTIONS_ENABLED` doit refléter le `SUBSCRIPTIONS_ENABLED` du serveur.
 * Deux valeurs sont nécessaires parce que la page d'accueil publique est rendue
 * avant toute authentification : elle ne peut pas lire le drapeau via l'API.
 * Sur les écrans connectés, c'est la réponse de `GET /users/me`
 * (`subscriptionsEnabled`) qui fait foi — le serveur reste seul juge.
 *
 * Version 1 : désactivé. Accès complet et gratuit pour tout le monde.
 */
export const SUBSCRIPTIONS_ENABLED =
  import.meta.env.VITE_SUBSCRIPTIONS_ENABLED === 'true'
