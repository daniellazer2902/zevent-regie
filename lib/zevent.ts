import type { Streamer, StreamersPayload } from "./types";

/**
 * Accès unique à l'API publique du ZEvent.
 *
 * Elle n'émet aucun en-tête CORS : le navigateur ne peut pas l'appeler
 * directement. Ce relais est donc structurel, pas un confort.
 *
 * Une seule réponse alimente les deux routes : la liste complète, lourde et
 * lente à bouger, et les compteurs, légers et suivis de près. Le cache court
 * garantit qu'on n'interroge jamais le ZEvent plus de six fois par minute,
 * quel que soit le nombre de personnes connectées à la régie.
 */

const SOURCE = "https://zevent.fr/api/";
const TTL = 10_000;

type ZeventStreamer = {
  twitch_id?: string;
  twitch?: string;
  display?: string;
  profileUrl?: string;
  online?: boolean;
  viewersAmount?: { number?: number };
  donationAmount?: { number?: number; formatted?: string };
};

type ZeventPayload = {
  live?: ZeventStreamer[];
  donationAmount?: { number?: number; formatted?: string };
  viewersCount?: { number?: number; formatted?: string };
};

let cache: { payload: StreamersPayload; at: number } | null = null;
let inFlight: Promise<StreamersPayload> | null = null;

async function refresh(): Promise<StreamersPayload> {
  const res = await fetch(SOURCE, {
    headers: { accept: "application/json", "user-agent": "zevent-regie" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ZEvent a répondu ${res.status}`);

  const data = (await res.json()) as ZeventPayload;
  const streamers: Streamer[] = (data.live ?? [])
    .filter((s): s is ZeventStreamer & { twitch: string } => Boolean(s.twitch))
    .map((s) => ({
      twitchId: s.twitch_id ?? "",
      login: s.twitch,
      display: s.display || s.twitch,
      avatar: s.profileUrl ?? null,
      online: Boolean(s.online),
      viewers: s.viewersAmount?.number ?? 0,
      donation: s.donationAmount?.formatted ?? "0 €",
      donationValue: s.donationAmount?.number ?? 0,
    }))
    .sort((a, b) => b.viewers - a.viewers);

  const payload: StreamersPayload = {
    streamers,
    totalDonation: data.donationAmount?.formatted ?? "—",
    totalDonationValue: data.donationAmount?.number ?? 0,
    totalViewers: data.viewersCount?.formatted ?? "—",
    totalViewersValue: data.viewersCount?.number ?? 0,
    fetchedAt: Date.now(),
  };
  cache = { payload, at: Date.now() };
  return payload;
}

export async function getZevent(): Promise<StreamersPayload> {
  if (cache && Date.now() - cache.at < TTL) return cache.payload;
  // Plusieurs requêtes simultanées ne déclenchent qu'un seul appel sortant.
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  try {
    return await inFlight;
  } catch (error) {
    // Une donnée périmée reste plus utile qu'une erreur : la régie continue
    // de fonctionner même si le ZEvent ne répond plus.
    if (cache) return cache.payload;
    throw error;
  }
}
