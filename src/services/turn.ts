/**
 * SPEAQ TURN credentials helper - native side (iOS / Android via react-native-webrtc).
 *
 * Identical contract to PWA helper at speaq-web-build/src/app/app/turn.ts.
 * Cross-platform contract: 02 Areas/SPEAQ/SPEAQ_TURN_Contract_v1.md
 *
 * Status (2026-05-03): NOT YET CALLED from src/services/call.ts. Will be wired in
 * during native fix after Apple-approval of TestFlight 1.0.4(5). Until then,
 * native iOS/Android continues to use STUN-only iceServers (existing behaviour).
 *
 * Test coverage: test/cross-platform-turn.test.mjs (8/8 PASS proves PWA + native
 * helpers parse identical shapes from the relay endpoint).
 */

interface IceConfigResponse {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  ttl: number;
}

interface CachedConfig {
  iceServers: IceConfigResponse["iceServers"];
  fetchedAt: number;
  ttlSeconds: number;
}

let cached: CachedConfig | null = null;

const RELAY_BASE = "https://relay.thespeaq.com";

const STUN_ONLY_FALLBACK: IceConfigResponse["iceServers"] = [
  { urls: "stun:turn.thespeaq.com:3478" },
];

const REFRESH_BUFFER_SECONDS = 30;

/**
 * Get ICE servers (STUN + TURN with credentials) for an outgoing or
 * incoming WebRTC call. Caches credentials until just before expiry.
 * Always resolves; never throws.
 */
export async function getIceServers(speaqId: string): Promise<IceConfigResponse["iceServers"]> {
  if (!speaqId) return STUN_ONLY_FALLBACK;

  const now = Date.now();
  if (
    cached &&
    now < cached.fetchedAt + (cached.ttlSeconds - REFRESH_BUFFER_SECONDS) * 1000
  ) {
    return cached.iceServers;
  }

  // Mobile networks (LTE/5G) frequently return DNS NXDOMAIN on a cold cache
  // for the first HTTPS request, even when the WebSocket to the same host is
  // already established. Retry with a short backoff so the second or third
  // attempt has a warm DNS cache. Without this, the iPhone falls back to
  // STUN-only and ICE never reaches `connected` over symmetric NAT.
  const attempts = [0, 600, 1500];
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await new Promise((r) => setTimeout(r, attempts[i]));
    try {
      const res = await fetch(`${RELAY_BASE}/api/v1/turn-credentials`, {
        method: "GET",
        headers: { "X-Speaq-Id": speaqId },
      });
      if (!res.ok) continue;
      const data: IceConfigResponse = await res.json();
      if (!Array.isArray(data?.iceServers) || data.iceServers.length === 0) continue;
      cached = {
        iceServers: data.iceServers,
        fetchedAt: now,
        ttlSeconds: typeof data.ttl === "number" && data.ttl > 0 ? data.ttl : 300,
      };
      return cached.iceServers;
    } catch {
      // Try again with backoff; the DNS cache typically warms after the first
      // failed request.
    }
  }
  return STUN_ONLY_FALLBACK;
}

export function clearIceServersCache(): void {
  cached = null;
}
