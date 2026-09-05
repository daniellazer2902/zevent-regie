"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Counter from "./Counter";
import MixBar from "./MixBar";
import PlayerTile from "./PlayerTile";
import Sources from "./Sources";
import { computeRects, stripLeftEdge, stripScrollRange } from "@/lib/layout";
import { clearHistory, pushHistory, readHistory } from "@/lib/storage";
import type { TwitchPlayer } from "@/lib/twitch";
import type { Goal, HistoryEntry, LayoutMode, Pov, Pulse, Rect, StreamersPayload } from "@/lib/types";

const REPO_URL = "https://github.com/daniellazer2902/zevent-regie";

const DEFAULT_VOLUME = 0.5;
const MAX_FROM_URL = 24;

const MODES: { key: LayoutMode; label: string; title: string }[] = [
  { key: "grid", label: "Grille", title: "Toutes les sources à taille égale" },
  { key: "focus", label: "Focus", title: "Une source agrandie, les autres en bandeau" },
  { key: "fullscreen", label: "Plein", title: "Une source plein cadre, les autres restent audibles" },
];

let counter = 0;
function newId(): string {
  counter += 1;
  return `pov-${counter}`;
}

export default function Regie() {
  // povs n'est jamais réordonné : l'ordre d'affichage vit dans `order`.
  // Déplacer un nœud contenant une iframe la ferait recharger.
  const [povs, setPovs] = useState<Pov[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [data, setData] = useState<StreamersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [wall, setWall] = useState({ width: 1280, height: 720 });
  const [copied, setCopied] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [goals, setGoals] = useState<Record<string, Goal>>({});
  const [stripOffset, setStripOffset] = useState(0);
  const [openOverlay, setOpenOverlay] = useState<string | null>(null);

  const wallRef = useRef<HTMLElement | null>(null);
  const hydrated = useRef(false);
  // Miroir de povs, pour refuser un doublon sans passer par un updater.
  const povsRef = useRef<Pov[]>([]);
  povsRef.current = povs;
  // Ordre et géométrie courants, lus pendant un glisser sans recréer les
  // gestionnaires d'événements à chaque déplacement du pointeur.
  const orderRef = useRef<string[]>([]);
  const rectsRef = useRef<Record<string, Rect>>({});
  // Les lecteurs Twitch vivants, pour pouvoir tous les lancer d'un seul geste.
  const players = useRef(new Map<string, TwitchPlayer>());
  // Dernière position connue du pointeur pendant un glisser, et défilement
  // courant du bandeau : lus par le minuteur de défilement automatique.
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const stripOffsetRef = useRef(0);

  const byId = useMemo(() => new Map(povs.map((p) => [p.id, p])), [povs]);
  const ordered = useMemo(
    () => order.map((id) => byId.get(id)).filter((p): p is Pov => Boolean(p)),
    [order, byId]
  );
  const activeLogins = useMemo(() => new Set(povs.map((p) => p.login)), [povs]);

  // Sous cette largeur, une grille devient illisible : les sources s'empilent
  // et le mur défile au doigt.
  const stacked = wall.width < 760;

  /* ---------- Actions ---------- */

  const addPov = useCallback(
    (streamer: { login: string; display: string; avatar: string | null; twitchId?: string | null }) => {
      const login = streamer.login.toLowerCase();
      if (povsRef.current.some((p) => p.login === login)) return;

      const display = streamer.display || login;
      const pov: Pov = {
        id: newId(),
        twitchId: streamer.twitchId ?? null,
        login,
        display,
        avatar: streamer.avatar,
        volume: DEFAULT_VOLUME,
        muted: true, // une source arrive toujours muette
        status: "loading",
        nonce: 0,
      };

      setPovs((prev) => (prev.some((p) => p.login === login) ? prev : [...prev, pov]));
      setOrder((prev) => (prev.includes(pov.id) ? prev : [...prev, pov.id]));
      setHistory(pushHistory({ login, display, avatar: streamer.avatar, twitchId: pov.twitchId }));
    },
    []
  );

  const removePov = useCallback((id: string) => {
    setPovs((prev) => prev.filter((p) => p.id !== id));
    setOrder((prev) => prev.filter((x) => x !== id));
    setFocusedId((f) => (f === id ? null : f));
  }, []);

  const patchPov = useCallback((id: string, patch: Partial<Pov>) => {
    setPovs((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        const same = (Object.keys(patch) as (keyof Pov)[]).every((k) => {
          const a = p[k];
          const b = merged[k];
          return Array.isArray(a) && Array.isArray(b) ? a.join() === b.join() : a === b;
        });
        if (same) return p;
        changed = true;
        return merged;
      });
      return changed ? next : prev;
    });
  }, []);

  const soloPov = useCallback((id: string) => {
    setPovs((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, muted: false, volume: p.volume > 0 ? p.volume : DEFAULT_VOLUME }
          : { ...p, muted: true }
      )
    );
  }, []);

  const muteAll = useCallback(() => {
    setPovs((prev) => prev.map((p) => (p.muted ? p : { ...p, muted: true })));
  }, []);

  /**
   * Reconstruit le lecteur d'une source.
   *
   * Un flux figé ne repart jamais seul : ni la mise en arrière-plan du
   * navigateur sur téléphone, ni un script bloqué, ni un stream redémarré ne
   * réveillent l'iframe. Seule une reconstruction complète le fait.
   */
  const refreshPov = useCallback((id: string) => {
    setPovs((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nonce: p.nonce + 1, status: "loading" } : p))
    );
  }, []);

  const movePov = useCallback((id: string, direction: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  /* ---------- Démarrage de la lecture ---------- */

  const registerPlayer = useCallback((id: string, player: TwitchPlayer | null) => {
    if (player) players.current.set(id, player);
    else players.current.delete(id);
  }, []);

  /* ---------- Glisser-déposer dans la grille ---------- */

  const reorderTo = useCallback((id: string, target: number) => {
    setOrder((prev) => {
      const from = prev.indexOf(id);
      if (from < 0 || target < 0 || target >= prev.length || from === target) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(target, 0, id);
      return next;
    });
  }, []);

  // Sur écran tactile, un appui ouvre le bandeau d'une source et referme celui
  // de la précédente : sans survol, il faut bien un geste pour les appeler.
  const toggleOverlay = useCallback(
    (id: string) => setOpenOverlay((prev) => (prev === id ? null : id)),
    []
  );

  const onDragStart = useCallback((id: string) => setDragId(id), []);
  const onDragEnd = useCallback(() => {
    setDragId(null);
    dragPointer.current = null;
  }, []);

  // La source suivie glisse d'emplacement en emplacement : on cherche la case
  // survolée, et l'ordre change aussitôt. Les autres vignettes s'écartent
  // toutes seules, sans jamais bouger dans le DOM.
  const dropAt = useCallback(
    (id: string, clientX: number, clientY: number) => {
      const wall = wallRef.current;
      if (!wall) return;
      const box = wall.getBoundingClientRect();
      const x = ((clientX - box.left) / box.width) * 100;
      const y = ((clientY - box.top) / box.height) * 100;
      const target = orderRef.current.findIndex((pid) => {
        const r = rectsRef.current[pid];
        return (
          r &&
          x >= r.left &&
          x < r.left + r.width &&
          y >= r.top &&
          y < r.top + r.height
        );
      });
      if (target >= 0) reorderTo(id, target);
    },
    [reorderTo]
  );

  const onDragMove = useCallback(
    (id: string, clientX: number, clientY: number) => {
      dragPointer.current = { x: clientX, y: clientY };
      dropAt(id, clientX, clientY);
    },
    [dropAt]
  );

  /**
   * En mode focus, tenir une vignette contre le haut ou le bas du bandeau le
   * fait défiler. Sans cela, on ne pourrait réordonner qu'entre les quatre
   * vignettes visibles, et jamais remonter une source venue du bas.
   */
  useEffect(() => {
    if (!dragId || mode !== "focus") return;
    const EDGE = 15; // bande sensible, en % de la hauteur du mur
    const STEP = 2.6; // avance par battement, en % de la hauteur du mur

    const timer = window.setInterval(() => {
      const wall = wallRef.current;
      const pointer = dragPointer.current;
      if (!wall || !pointer) return;

      const box = wall.getBoundingClientRect();
      const x = ((pointer.x - box.left) / box.width) * 100;
      if (x < stripLeftEdge()) return;

      const y = ((pointer.y - box.top) / box.height) * 100;
      const range = stripScrollRange(orderRef.current.length, box.width / box.height);
      const current = stripOffsetRef.current;

      let next = current;
      if (y < EDGE) next = Math.max(0, current - STEP);
      else if (y > 100 - EDGE) next = Math.min(range, current + STEP);
      if (next === current) return;

      setStripOffset(next);
      stripOffsetRef.current = next;
      // Les vignettes viennent de bouger sous le pointeur : on réévalue la cible.
      dropAt(dragId, pointer.x, pointer.y);
    }, 80);

    return () => window.clearInterval(timer);
  }, [dragId, mode, dropAt]);

  // Un second appel sur la même source ramène à la grille : la bascule doit
  // se défaire par le geste qui l'a faite.
  const enlarge = useCallback(
    (id: string) => {
      if (mode !== "grid" && focusedId === id) {
        setMode("grid");
        return;
      }
      setFocusedId(id);
      setMode((m) => (m === "grid" ? "focus" : m));
    },
    [mode, focusedId]
  );

  const toggleFullscreen = useCallback(
    (id: string) => {
      if (mode === "fullscreen" && focusedId === id) {
        setMode("grid");
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
      setFocusedId(id);
      setMode("fullscreen");
      // Sur un téléphone, « plein cadre » doit vouloir dire plein écran :
      // sinon la barre du navigateur mange le tiers de l'image.
      if (stacked && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    },
    [mode, focusedId, stacked]
  );

  /* ---------- Composition partagée par l'URL ---------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const logins = (params.get("pov") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, MAX_FROM_URL);

    if (logins.length) {
      const seeded: Pov[] = [];
      for (const login of logins) {
        if (seeded.some((p) => p.login === login)) continue;
        seeded.push({
          id: newId(),
          twitchId: null,
          login,
          display: login,
          avatar: null,
          volume: DEFAULT_VOLUME,
          muted: true,
          status: "loading",
          nonce: 0,
        });
      }
      setPovs(seeded);
      setOrder(seeded.map((p) => p.id));
    }
    setHistory(readHistory());
    // Sur un écran étroit, le panneau des sources recouvre le mur : il part fermé.
    if (window.innerWidth < 760) setSourcesOpen(false);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const logins = order.map((id) => byId.get(id)?.login).filter(Boolean) as string[];
    const url = new URL(window.location.href);
    if (logins.length) url.searchParams.set("pov", logins.join(","));
    else url.searchParams.delete("pov");
    window.history.replaceState(null, "", url.toString());
  }, [order, byId]);

  /* ---------- Liste des streamers ---------- */

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/streamers");
        const payload = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(payload?.error ?? `Réponse ${res.status}`);
        setData(payload as StreamersPayload);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(
          e instanceof Error
            ? `Liste indisponible : ${e.message}`
            : "Liste des streamers indisponible."
        );
      }
    };
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Les compteurs pesent quelques centaines d'octets contre 80 Ko pour la
  // liste : on peut donc les suivre de bien plus pres.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/pulse");
        if (!res.ok) return;
        const payload = (await res.json()) as Pulse;
        if (alive) setPulse(payload);
      } catch {
        // Un compteur qui saute un battement n'a pas à être signalé.
      }
    };
    tick();
    const timer = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Une composition venue d'une URL ne connaît que des logins : on complète
  // les noms et les avatars dès que la liste du ZEvent arrive.
  useEffect(() => {
    if (!data) return;
    setPovs((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.avatar && p.twitchId) return p;
        const s = data.streamers.find((x) => x.login === p.login);
        if (!s) return p;
        changed = true;
        return { ...p, display: s.display, avatar: s.avatar, twitchId: s.twitchId || null };
      });
      return changed ? next : prev;
    });
  }, [data]);

  // Paliers de dons des sources affichées, groupés en une seule requête.
  const goalIds = useMemo(
    () => povs.map((p) => p.twitchId).filter((id): id is string => Boolean(id)).sort().join(","),
    [povs]
  );

  useEffect(() => {
    if (!goalIds) {
      setGoals({});
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/goals?ids=${goalIds}`);
        if (!res.ok) return;
        const payload = (await res.json()) as Record<string, Goal>;
        if (alive) setGoals(payload);
      } catch {
        // Les paliers sont un complément : leur absence ne casse rien.
      }
    };
    tick();
    const timer = setInterval(tick, 20_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [goalIds]);

  /* ---------- Géométrie du mur ---------- */

  useEffect(() => {
    const node = wallRef.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setWall((prev) =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
            ? prev
            : { width, height }
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { rects, contentHeight } = useMemo(
    () => computeRects({ order, mode, focusedId, wall, stripOffset, stacked }),
    [order, mode, focusedId, wall, stripOffset, stacked]
  );

  // Le bandeau du mode focus revient en haut dès qu'on change de source mise
  // en avant ou de disposition.
  useEffect(() => setStripOffset(0), [mode, focusedId]);

  // Molette au-dessus du bandeau : on fait défiler les vignettes en attente.
  const onWallWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      if (mode !== "focus" || stacked) return;
      // Un panneau de paliers ouvert gère son propre défilement.
      if ((e.target as HTMLElement).closest?.(".goals-panel")) return;
      const wall = wallRef.current;
      if (!wall) return;
      const box = wall.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * 100;
      if (x < stripLeftEdge()) return;
      const range = stripScrollRange(orderRef.current.length, box.width / box.height);
      if (range <= 0) return;
      const step = (e.deltaY / box.height) * 100;
      setStripOffset((prev) => Math.min(range, Math.max(0, prev + step)));
    },
    [mode]
  );
  orderRef.current = order;
  rectsRef.current = rects;
  stripOffsetRef.current = stripOffset;

  const shownId = focusedId && order.includes(focusedId) ? focusedId : order[0];

  // Les compteurs viennent du sondage court, la liste complete sert de secours
  // le temps du premier battement.
  const donation = pulse?.totalDonationValue ?? data?.totalDonationValue ?? null;
  const viewers = pulse?.totalViewersValue ?? data?.totalViewersValue ?? null;

  /* ---------- Raccourcis clavier ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= "1" && e.key <= "9") {
        const pov = ordered[Number(e.key) - 1];
        if (pov) soloPov(pov.id);
      } else if (e.key === "0") {
        muteAll();
      } else if (e.key.toLowerCase() === "g") setMode("grid");
      else if (e.key.toLowerCase() === "f") setMode("focus");
      else if (e.key.toLowerCase() === "p") setMode("fullscreen");
      else if (e.key.toLowerCase() === "s") setSourcesOpen((v) => !v);
      else if (e.key === "Escape") setMode("grid");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, soloPov, muteAll]);

  /* ---------- Partage ---------- */

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  const toggleScreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  return (
    <div className="app" data-mode={mode}>
      <header className="head">
        <div className="wordmark">
          ZEvent <b>Régie</b> <span>multiviewer</span>
        </div>

        <div className="head-tools">
          <button className="btn" aria-pressed={sourcesOpen} onClick={() => setSourcesOpen((v) => !v)}>
            Sources
          </button>

          <div className="segmented">
            {MODES.map((m) => (
              <button
                key={m.key}
                className="btn"
                aria-pressed={mode === m.key}
                title={m.title}
                disabled={povs.length === 0}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button className="btn" onClick={muteAll} disabled={povs.length === 0}>
            Tout couper
          </button>
          <button className="btn" onClick={share} disabled={povs.length === 0}>
            {copied ? "Lien copié" : "Partager"}
          </button>
          <button className="btn" onClick={toggleScreen} title="Passer le navigateur en plein écran">
            Plein écran
          </button>
        </div>

        <a
          className="credit"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          title="Code source : installez votre propre régie"
        >
          Créé par Daniel
        </a>

        <div className="head-stats">
          <div className="stat">
            <span className="label">Sources</span>
            <span className="value">{String(povs.length).padStart(2, "0")}</span>
          </div>
          <div className="stat">
            <span className="label">Viewers ZEvent</span>
            {viewers === null ? (
              <span className="value">—</span>
            ) : (
              <Counter className="value" value={viewers} />
            )}
          </div>
          <div className="stat">
            <span className="label">Cagnotte</span>
            {donation === null ? (
              <span className="value brand">—</span>
            ) : (
              <Counter className="value brand" value={donation} suffix=" €" />
            )}
          </div>
        </div>
      </header>

      <div className="body">
        {sourcesOpen && (
          <Sources
            data={data}
            error={error}
            history={history}
            activeLogins={activeLogins}
            onAdd={addPov}
            onClearHistory={() => setHistory(clearHistory())}
          />
        )}

        <main className="wall" ref={wallRef} onWheel={onWallWheel} data-stacked={stacked}>
          {mode === "fullscreen" && povs.length > 0 && (
            <button className="leave-full" onClick={() => setMode("grid")}>
              Quitter le plein cadre
            </button>
          )}

          {povs.length === 0 && (
            <div className="start">
              <h1>Composez votre mur</h1>
              <p>
                Ajoutez les streamers du ZEvent depuis le panneau de gauche. La grille
                s’organise toute seule, quel que soit leur nombre.
              </p>
              <p>
                Une source ajoutée attend un clic en son centre pour démarrer, et arrive
                muette. Ouvrez ses réglages pour le volume ou la relance, glissez-la pour
                la déplacer, et sa pastille <b>Goals</b> montre ses paliers de dons.
              </p>
              <p className="hint">
                1–9 son exclusif · 0 tout couper · G grille · F focus · P plein · S sources
              </p>
            </div>
          )}

          {/* L'ordre du DOM suit l'ordre d'insertion et ne change jamais.
              Seule la géométrie bouge, sinon les lecteurs se rechargeraient. */}
          {contentHeight > 0 && (
            <div className="wall-spacer" style={{ height: contentHeight }} aria-hidden="true" />
          )}

          {povs.map((pov) => {
            const index = order.indexOf(pov.id);
            const rect = rects[pov.id];
            if (!rect) return null;
            return (
              <PlayerTile
                key={pov.id}
                pov={pov}
                index={index}
                rect={rect}
                hidden={mode === "fullscreen" && pov.id !== shownId}
                onPatch={patchPov}
                onRemove={removePov}
                onSolo={soloPov}
                onFocus={enlarge}
                onFullscreen={toggleFullscreen}
                onRefresh={refreshPov}
                isFullscreen={mode === "fullscreen" && shownId === pov.id}
                onMove={movePov}
                canMoveBack={index > 0}
                canMoveForward={index >= 0 && index < order.length - 1}
                draggable={
                  !stacked &&
                  order.length > 1 &&
                  (mode === "grid" || (mode === "focus" && pov.id !== shownId))
                }
                dragging={dragId === pov.id}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                registerPlayer={registerPlayer}
                touch={stacked}
                overlayOpen={openOverlay === pov.id}
                onToggleOverlay={toggleOverlay}
                goal={pov.twitchId ? goals[pov.twitchId] ?? null : null}
              />
            );
          })}
        </main>
      </div>

      <MixBar povs={ordered} onPatch={patchPov} onMuteAll={muteAll} />
    </div>
  );
}
