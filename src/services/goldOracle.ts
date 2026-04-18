/**
 * Read-only client for the speaq-gold-feed oracle.
 *
 * Mirrors the PWA client in speaq-web/src/app/app/wallet-oracle.ts so the
 * native wallet shows the same market snapshot next to the protocol's
 * floor peg (1 QC = 0.01 gram gold). Fails silently and caches for 5
 * minutes in AsyncStorage so we don't beat on Cloud Run and so offline
 * users still see a recent figure.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type GoldOracleSnapshot = {
  usdPerGram: number;
  usdPerTroyOunce: number;
  timestamp: string;
  sourcesUsed: string[];
  sourcesFailed: string[];
};

const ORACLE_URL = "https://speaq-gold-feed-244491980730.europe-west1.run.app/v1/price";
const CACHE_KEY = "speaq_gold_oracle_cache_v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchLiveGoldPrice(): Promise<GoldOracleSnapshot | null> {
  const cached = await readCache();
  if (cached) return cached;
  try {
    const res = await fetch(ORACLE_URL);
    if (!res.ok) return null;
    const data = await res.json();
    if (
      typeof data?.price_usd_per_gram !== "number"
      || typeof data?.price_usd_per_troy_ounce !== "number"
    ) return null;
    const snap: GoldOracleSnapshot = {
      usdPerGram: data.price_usd_per_gram,
      usdPerTroyOunce: data.price_usd_per_troy_ounce,
      timestamp: data.timestamp ?? new Date().toISOString(),
      sourcesUsed: Array.isArray(data.sources_used) ? data.sources_used : [],
      sourcesFailed: Array.isArray(data.sources_failed) ? data.sources_failed : [],
    };
    await writeCache(snap);
    return snap;
  } catch {
    return null;
  }
}

async function readCache(): Promise<GoldOracleSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: GoldOracleSnapshot };
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

async function writeCache(value: GoldOracleSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {}
}

export function formatRelativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
