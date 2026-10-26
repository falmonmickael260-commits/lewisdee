/**
 * Code de partie reçu en paramètre d'URL `rg_room`, quand la coquille Revanche
 * Games ouvre ce jeu à la suite d'une invitation acceptée.
 *
 * Même principe que `rg_token` (voir platformToken.js) : lu une fois à
 * l'ouverture, mis en cache en `sessionStorage`, puis retiré de l'URL visible.
 * Le cache couvre un rechargement avant d'avoir rejoint ; il est consommé dès
 * qu'on entre dans une partie, pour qu'une invitation ancienne ne ramène pas
 * le joueur dans une partie déjà finie.
 *
 * Aucune confiance accordée à cette valeur : c'est le serveur du jeu qui dira
 * si la partie existe encore et si elle accepte un joueur de plus.
 */

const STORAGE_KEY = 'rg_room';
let cached;

/** Majuscules, sans séparateurs — la forme attendue par le champ « code ». */
function normalize(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

export function getIncomingRoomCode() {
  if (cached !== undefined) return cached;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('rg_room');

  if (fromUrl) {
    const code = normalize(fromUrl);
    // Le paramètre est retiré même s'il est illisible : il n'a rien à faire
    // dans la barre d'adresse, ni dans un lien partagé ensuite.
    params.delete('rg_room');
    const clean = window.location.pathname + (params.size ? `?${params}` : '');
    window.history.replaceState({}, '', clean);

    if (code.length >= 3) {
      try {
        sessionStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* navigation privée — valeur gardée en mémoire */
      }
      cached = code;
      return cached;
    }

    cached = null;
    return null;
  }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    cached = stored && stored.length >= 3 ? stored : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Oublie l'invitation, une fois le joueur entré dans une partie. */
export function clearIncomingRoomCode() {
  cached = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à nettoyer */
  }
}
