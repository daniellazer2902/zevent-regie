"use client";

import type { Pov } from "@/lib/types";

type Props = {
  povs: Pov[]; // dans l'ordre d'affichage
  onPatch: (id: string, patch: Partial<Pov>) => void;
  onMuteAll: () => void;
};

export default function MixBar({ povs, onPatch, onMuteAll }: Props) {
  const audible = povs.filter((p) => !p.muted && p.volume > 0);

  return (
    <footer className="mix" aria-label="Mixage audio">
      <div className="mix-title">
        <span className="label">Mixage</span>
        <span className="mono">
          {audible.length} / {povs.length} audibles
        </span>
      </div>

      {audible.length === 0 ? (
        <p className="mix-empty">
          Aucune source audible. Survolez une vignette et activez son son : chaque niveau
          se règle indépendamment.
        </p>
      ) : (
        audible.map((pov) => {
          const num = String(povs.indexOf(pov) + 1).padStart(2, "0");
          return (
            <div className="strip" key={pov.id}>
              <div className="strip-head">
                <span className="num">SRC {num}</span>
                <span className="n">{pov.display}</span>
                <span className="lvl">{Math.round(pov.volume * 100)}</span>
              </div>
              <div className="strip-row">
                <input
                  type="range"
                  className="live"
                  min={0}
                  max={100}
                  value={Math.round(pov.volume * 100)}
                  aria-label={`Volume de ${pov.display}`}
                  onChange={(e) => onPatch(pov.id, { volume: Number(e.target.value) / 100 })}
                />
                <button
                  className="btn"
                  onClick={() => onPatch(pov.id, { muted: true })}
                  title={`Couper ${pov.display}`}
                >
                  Couper
                </button>
              </div>
            </div>
          );
        })
      )}

      {audible.length > 0 && (
        <button className="btn" onClick={onMuteAll} style={{ marginLeft: "auto" }}>
          Tout couper
        </button>
      )}
    </footer>
  );
}
