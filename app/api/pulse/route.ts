import { NextResponse } from "next/server";
import { getZevent } from "@/lib/zevent";

/**
 * Les seuls compteurs qui bougent vite : cagnotte et viewers.
 * Quelques centaines d'octets, contre 80 Ko pour la liste complète — c'est ce
 * qui rend un rafraîchissement toutes les dix secondes indolore.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { totalDonation, totalDonationValue, totalViewers, totalViewersValue } =
      await getZevent();
    return NextResponse.json(
      { totalDonation, totalDonationValue, totalViewers, totalViewersValue },
      { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json({ error: "Compteurs indisponibles" }, { status: 502 });
  }
}
