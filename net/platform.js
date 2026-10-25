/**
 * Déclare le résultat d'une partie terminée au projet Supabase central de
 * Revanche Game (comptes, profils, statistiques). Optionnel : sans ces
 * variables, 10000 fonctionne exactement comme avant. Voir docs/PLATFORM.md
 * dans le repo revanche-games-web.
 */

function platformConfig() {
  const url = process.env.PLATFORM_SUPABASE_URL;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * @param {{ roomCode: string, finishedAt: number, players: Array<{
 *   user_id: string|null, guest_label: string|null,
 *   outcome: 'win'|'loss'|'draw', score: number|null, position: number|null
 * }> }} params
 */
export function reportMatchResult(params) {
  const config = platformConfig();
  if (!config) return;
  if (!params.players.some((p) => p.user_id)) return; // personne de la plateforme dans cette partie

  (async () => {
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/record_game_result`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_game_slug: '10000',
          p_idempotency_key: `10000:${params.roomCode}:${params.finishedAt}`,
          p_room_code: params.roomCode,
          p_raw_payload: null,
          p_players: params.players,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[platform] record_game_result failed', response.status, body);
      }
    } catch (error) {
      // Une panne de la plateforme centrale ne doit jamais interrompre une partie en cours.
      console.error('[platform] record_game_result error', error);
    }
  })();
}
