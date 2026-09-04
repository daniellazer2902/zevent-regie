import { NextResponse } from "next/server";
import { getZevent } from "@/lib/zevent";

/** Liste complète des streamers. Lourde, elle ne bouge que lentement. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getZevent();
    return NextResponse.json(payload, {
      headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      { error: `Liste des streamers indisponible : ${message}` },
      { status: 502 }
    );
  }
}
