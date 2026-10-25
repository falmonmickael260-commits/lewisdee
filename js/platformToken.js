/**
 * Jeton d'identité Revanche Game, reçu en paramètre d'URL `rg_token` quand la
 * coquille ouvre cette page dans une iframe. Mis en cache en `sessionStorage`
 * et retiré de l'URL visible. Jamais vérifié ici : seule la signature côté
 * serveur fait foi. Un jeton absent ou invalide retombe sur un joueur invité.
 */

const STORAGE_KEY = 'rg_token';
let cached;

export function getIncomingPlatformToken() {
  if (cached !== undefined) return cached;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('rg_token');

  if (fromUrl) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      /* navigation privée — on garde juste la valeur en mémoire */
    }
    params.delete('rg_token');
    const clean = window.location.pathname + (params.size ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
    cached = fromUrl;
    return cached;
  }

  try {
    cached = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

/** Lecture non vérifiée du pseudonyme, uniquement pour l'affichage. */
export function peekPlatformUsername(token) {
  if (!token) return null;
  const [payloadB64] = token.split('.');
  if (!payloadB64) return null;
  try {
    const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.username === 'string' ? payload.username : null;
  } catch {
    return null;
  }
}
