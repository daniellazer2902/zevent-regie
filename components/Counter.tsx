"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  suffix?: string;
  className?: string;
};

const FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const DURATION = 700; // ms

/**
 * Compteur qui rejoint sa nouvelle valeur au lieu de sauter dessus.
 *
 * Sur une cagnotte qui grimpe, voir les chiffres défiler dit quelque chose que
 * le nombre seul ne dit pas : que ça bouge, maintenant.
 */
export default function Counter({ value, suffix = "", className }: Props) {
  const [shown, setShown] = useState(value);
  const [bumping, setBumping] = useState(false);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (value === from.current) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    from.current = value;
    setBumping(true);

    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      // Décélération : rapide au départ, posé à l'arrivée.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + delta * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else setBumping(false);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return (
    <span className={className} data-bump={bumping}>
      {FORMAT.format(shown)}
      {suffix}
    </span>
  );
}
