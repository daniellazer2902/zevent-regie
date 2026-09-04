import type { LayoutMode, Rect } from "./types";

const TILE_ASPECT = 16 / 9;

/**
 * Choisit le nombre de colonnes qui donne les plus grandes vignettes possibles.
 *
 * Chaque case garde le rapport 16/9 : la vignette est donc limitée soit par la
 * largeur de sa case, soit par sa hauteur. On retient l'agencement qui maximise
 * l'aire réellement affichée, et à aire égale celui qui laisse le moins de
 * cases vides.
 */
export function columnsFor(count: number, wallAspect: number): number {
  if (count <= 1) return 1;
  const wallWidth = Math.max(wallAspect, 0.1);
  const wallHeight = 1;

  let best = 1;
  let bestArea = -1;
  let bestWaste = Infinity;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellWidth = wallWidth / cols;
    const cellHeight = wallHeight / rows;
    const tileWidth = Math.min(cellWidth, cellHeight * TILE_ASPECT);
    const area = tileWidth * (tileWidth / TILE_ASPECT);
    const waste = cols * rows - count;

    if (area > bestArea + 1e-9 || (Math.abs(area - bestArea) < 1e-9 && waste < bestWaste)) {
      bestArea = area;
      bestWaste = waste;
      best = cols;
    }
  }
  return best;
}

const STRIP_WIDTH = 22; // largeur du bandeau de vignettes en mode focus, en %

/**
 * Hauteur d'une vignette du bandeau, en % de la hauteur du mur, pour qu'elle
 * garde exactement le rapport 16/9 de l'image diffusée.
 */
export function stripItemHeight(wallAspect: number): number {
  return (STRIP_WIDTH * wallAspect) / TILE_ASPECT;
}

/** De combien le bandeau peut défiler, en % de la hauteur du mur. */
export function stripScrollRange(count: number, wallAspect: number): number {
  const total = Math.max(count - 1, 0) * stripItemHeight(wallAspect);
  return Math.max(0, total - 100);
}

/** Le bandeau occupe-t-il la droite du mur ? */
export function stripLeftEdge(): number {
  return 100 - STRIP_WIDTH;
}

/**
 * Position de chaque POV, en pourcentages du mur.
 *
 * Les cases ne sont jamais déplacées dans le DOM : seule leur géométrie change.
 * Déplacer un nœud contenant une iframe la ferait recharger, ce qui coûterait
 * plusieurs secondes de flux et réinitialiserait le son.
 */
export function computeRects(
  order: string[],
  mode: LayoutMode,
  focusedId: string | null,
  wallAspect: number,
  stripOffset = 0
): Record<string, Rect> {
  const rects: Record<string, Rect> = {};
  const n = order.length;
  if (n === 0) return rects;

  const cols = columnsFor(n, wallAspect);
  const rows = Math.ceil(n / cols);
  const gridRect = (i: number): Rect => ({
    left: (i % cols) * (100 / cols),
    top: Math.floor(i / cols) * (100 / rows),
    width: 100 / cols,
    height: 100 / rows,
  });

  const focus = focusedId && order.includes(focusedId) ? focusedId : order[0];

  if (mode === "grid" || n === 1) {
    order.forEach((id, i) => (rects[id] = gridRect(i)));
    return rects;
  }

  if (mode === "fullscreen") {
    // Les sources non retenues gardent leur géométrie de grille : elles restent
    // décodées et audibles, simplement masquées derrière la source affichée.
    order.forEach((id, i) => (rects[id] = gridRect(i)));
    rects[focus] = { left: 0, top: 0, width: 100, height: 100 };
    return rects;
  }

  // focus : une grande source à gauche, les autres en bandeau à droite.
  // Les vignettes du bandeau gardent le rapport 16/9 — sinon elles s'entourent
  // de bandes noires — et le bandeau défile quand elles ne tiennent plus.
  const others = order.filter((id) => id !== focus);
  rects[focus] = { left: 0, top: 0, width: 100 - STRIP_WIDTH, height: 100 };
  const itemHeight = stripItemHeight(wallAspect);
  others.forEach((id, i) => {
    rects[id] = {
      left: 100 - STRIP_WIDTH,
      top: i * itemHeight - stripOffset,
      width: STRIP_WIDTH,
      height: itemHeight,
    };
  });
  return rects;
}
