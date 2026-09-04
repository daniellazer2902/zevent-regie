import { NextResponse } from "next/server";
import type { Goal } from "@/lib/types";

/**
 * Paliers de dons, groupés en un seul appel.
 *
 * L'API du ZEvent expose une fiche par streamer. Interroger huit fiches depuis
 * le navigateur ferait huit requêtes ; les rassembler ici n'en laisse qu'une,
 * et le cache évite de solliciter le ZEvent une fois par spectateur.
 */

const TTL = 20_000;
const MAX_IDS = 24;

type Entry = { goal: Goal; at: number };
const cache = new Map<string, Entry>();

type ZeventGoal = { amountRequired?: { number?: number; formatted?: string }; title?: string };
type ZeventStreamerPayload = {
  donationAmount?: { number?: number; formatted?: string };
  donationGoal?: { goals?: ZeventGoal[] };
};

export const dynamic = "force-dynamic";

async function fetchGoal(twitchId: string): Promise<Goal | null> {
  const known = cache.get(twitchId);
  if (known && Date.now() - known.at < TTL) return known.goal;

  try {
    const res = await fetch(`https://api.zevent.fr/streamer/${encodeURIComponent(twitchId)}`, {
      headers: { accept: "application/json", "user-agent": "zevent-regie" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(String(res.status));

    const data = (await res.json()) as ZeventStreamerPayload;
    const current = data.donationAmount?.number ?? 0;
    const steps = (data.donationGoal?.goals ?? [])
      .filter((g): g is ZeventGoal & { amountRequired: { number: number } } =>
        typeof g.amountRequired?.number === "number"
      )
      .sort((a, b) => a.amountRequired.number - b.amountRequired.number);

    const next = steps.find((g) => g.amountRequired.number > current) ?? null;
    const target = next?.amountRequired.number ?? 0;

    const goal: Goal = {
      donation: data.donationAmount?.formatted ?? "0 €",
      donationValue: current,
      reached: steps.filter((g) => g.amountRequired.number <= current).length,
      total: steps.length,
      progress: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 100,
      nextTitle: next?.title ?? null,
      nextAmount: next?.amountRequired.formatted ?? null,
      steps: steps.map((g) => ({
        title: g.title ?? "Palier",
        amount: g.amountRequired.formatted ?? `${g.amountRequired.number} €`,
        amountValue: g.amountRequired.number,
        reached: g.amountRequired.number <= current,
      })),
    };
    cache.set(twitchId, { goal, at: Date.now() });
    return goal;
  } catch {
    // Une fiche périmée vaut mieux qu'un trou dans l'affichage.
    return known?.goal ?? null;
  }
}

export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) return NextResponse.json({});

  const results = await Promise.all(ids.map(async (id) => [id, await fetchGoal(id)] as const));
  const goals: Record<string, Goal> = {};
  for (const [id, goal] of results) if (goal) goals[id] = goal;

  return NextResponse.json(goals, {
    headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=60" },
  });
}
