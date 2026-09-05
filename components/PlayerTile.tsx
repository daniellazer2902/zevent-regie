"use client";

import { useEffect, useRef, useState } from "react";
import type { Goal, Pov, Rect } from "@/lib/types";
import { loadTwitchSdk, parentDomains, type TwitchPlayer } from "@/lib/twitch";

type Props = {
  pov: Pov;
  index: number; // rang dans l'ordre d'affichage, pour l'identifiant de source
  rect: Rect;
  hidden: boolean;
  onPatch: (id: string, patch: Partial<Pov>) => void;
  onRemove: (id: string) => void;
  onSolo: (id: string) => void;
  onFocus: (id: string) => void;
  onFullscreen: (id: string) => void;
  onRefresh: (id: string) => void;
  isFullscreen: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  canMoveBack: boolean;
  canMoveForward: boolean;
  registerPlayer: (id: string, player: TwitchPlayer | null) => void;
  /** Écran tactile : sans survol, le bandeau s'ouvre et se ferme au toucher. */
  touch: boolean;
  overlayOpen: boolean;
  onToggleOverlay: (id: string) => void;
  goal: Goal | null;
  draggable: boolean;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, clientX: number, clientY: number) => void;
  onDragEnd: () => void;
};

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const STATUS_LABEL: Record<Pov["status"], string | null> = {
  loading: null, // l'invitation à lancer tient lieu d'indicateur
  playing: null,
  offline: "Hors ligne",
  ended: "Terminé",
};

export default function PlayerTile({
  pov,
  index,
  rect,
  hidden,
  onPatch,
  onRemove,
  onSolo,
  onFocus,
  onFullscreen,
  onRefresh,
  isFullscreen,
  onMove,
  canMoveBack,
  canMoveForward,
  registerPlayer,
  touch,
  overlayOpen,
  onToggleOverlay,
  goal,
  draggable,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  const started = useRef(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const currentStepRef = useRef<HTMLLIElement | null>(null);

  // Point de saisie d'un glisser : le déplacement ne démarre qu'au-delà d'un
  // seuil, pour ne pas confondre un simple clic avec un déplacement.
  const grabbedAt = useRef<{ x: number; y: number } | null>(null);
  const captured = useRef(false);

  // Les valeurs courantes, lues depuis les gestionnaires d'événements Twitch
  // sans faire dépendre la création du lecteur de chaque changement de volume.
  const stateRef = useRef({ volume: pov.volume, muted: pov.muted });
  stateRef.current = { volume: pov.volume, muted: pov.muted };

  const audible = !pov.muted && pov.volume > 0 && pov.status === "playing";

  // Création du lecteur. Une seule fois par source, sauf demande explicite de
  // relance : le démonter reviendrait à recharger le flux et à perdre les
  // réglages.
  useEffect(() => {
    let cancelled = false;
    started.current = false;
    const mount = mountRef.current;
    if (!mount) return;

    loadTwitchSdk()
      .then((Twitch) => {
        if (cancelled || !mountRef.current) return;

        const player = new Twitch.Player(mountRef.current, {
          channel: pov.login,
          parent: parentDomains(),
          width: "100%",
          height: "100%",
          autoplay: true,
          muted: true, // imposé par les navigateurs : le son démarre toujours coupé
          controls: false,
        });
        playerRef.current = player;

        const apply = () => {
          const { volume, muted } = stateRef.current;
          try {
            player.setMuted(muted);
            player.setVolume(volume);
          } catch {
            // Le lecteur n'est pas encore prêt à recevoir des ordres.
          }
        };

        const onPlaying = () => {
          started.current = true;
          apply();
          onPatch(pov.id, { status: "playing" });
        };

        registerPlayer(pov.id, player);
        player.addEventListener(Twitch.Player.READY, apply);
        player.addEventListener(Twitch.Player.PLAYING, onPlaying);
        player.addEventListener(Twitch.Player.ONLINE, () => {
          started.current = false;
          onPatch(pov.id, { status: "loading" });
        });
        player.addEventListener(Twitch.Player.OFFLINE, () => {
          started.current = false;
          onPatch(pov.id, { status: "offline" });
        });
        player.addEventListener(Twitch.Player.ENDED, () => {
          started.current = false;
          onPatch(pov.id, { status: "ended" });
        });
      })
      .catch(() => onPatch(pov.id, { status: "offline" }));

    return () => {
      cancelled = true;
      registerPlayer(pov.id, null);
      try {
        playerRef.current?.destroy?.();
      } catch {
        // Le SDK peut avoir déjà retiré son iframe.
      }
      playerRef.current = null;
      if (mount) mount.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pov.id, pov.login, pov.nonce]);

  useEffect(() => {
    try {
      playerRef.current?.setVolume(pov.volume);
    } catch {}
  }, [pov.volume]);

  useEffect(() => {
    try {
      playerRef.current?.setMuted(pov.muted);
    } catch {}
  }, [pov.muted]);

  // scrollIntoView ferait défiler tous les conteneurs parents, y compris la
  // page elle-même. On positionne donc la liste à la main.
  useEffect(() => {
    if (!goalsOpen) return;
    const step = currentStepRef.current;
    const list = step?.parentElement;
    if (!step || !list) return;
    list.scrollTop = step.offsetTop - list.clientHeight / 2 + step.offsetHeight / 2;
  }, [goalsOpen]);

  const statusLabel = STATUS_LABEL[pov.status];
  const num = String(index + 1).padStart(2, "0");

  const DRAG_THRESHOLD = 6; // pixels

  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    grabbedAt.current = { x: e.clientX, y: e.clientY };
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = grabbedAt.current;
    if (!from) return;
    // Un relâchement qui atterrit ailleurs — sur un bouton du bandeau, hors de
    // la case — laisserait la prise armée, et le survol suivant déclencherait
    // un déplacement involontaire. Sans bouton enfoncé, il n'y a pas de glisser.
    if (e.buttons === 0) {
      grabbedAt.current = null;
      return;
    }
    if (!captured.current) {
      const distance = Math.hypot(e.clientX - from.x, e.clientY - from.y);
      if (distance < DRAG_THRESHOLD) return;
      // La capture n'est prise qu'une fois le déplacement engagé : la poser dès
      // l'appui empêcherait le navigateur de composer un double-clic.
      // Elle garde ensuite le pointeur lié à cette case, même au-dessus des
      // autres lecteurs qui, eux, n'envoient aucun événement à la page.
      e.currentTarget.setPointerCapture(e.pointerId);
      captured.current = true;
      onDragStart(pov.id);
    }
    onDragMove(pov.id, e.clientX, e.clientY);
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    grabbedAt.current = null;
    if (captured.current) {
      captured.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Le pointeur avait déjà rendu la main.
      }
      onDragEnd();
    }
  };

  const unit = rect.px ? "px" : "%";

  const surfaceHandlers = {
    onPointerDown: grab,
    onPointerMove: move,
    onPointerUp: release,
    onPointerCancel: release,
    onDoubleClick: () => onFocus(pov.id),
    onClick: touch ? () => onToggleOverlay(pov.id) : undefined,
  };

  return (
    <div
      className="tile"
      data-live={audible}
      data-hidden={hidden}
      data-drag={dragging}
      data-playing={pov.status === "playing"}
      data-draggable={draggable}
      data-overlay={overlayOpen}
      // Cliquer un réglage laisse le focus dessus, ce qui garderait le bandeau
      // ouvert après le départ du pointeur. On rend la main en quittant la case.
      onMouseLeave={(e) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && e.currentTarget.contains(active)) active.blur();
      }}
      style={{
        left: `${rect.left}${unit}`,
        top: `${rect.top}${unit}`,
        width: `${rect.width}${unit}`,
        height: `${rect.height}${unit}`,
      }}
    >
      <div className="tile-inner">
        <div className="player" ref={mountRef} />

        {/* Le lecteur Twitch s'exécute dans un processus séparé : il n'envoie
            aucun événement souris à cette page. Sans cette couche, ni le
            bandeau de contrôle ni le glisser ne fonctionneraient.

            Tant que la source ne joue pas, la couche prend la forme d'un cadre
            et laisse une ouverture au centre : Chrome n'accorde le droit de
            lire qu'à un clic atterrissant dans le lecteur lui-même, et c'est
            là que Twitch place son bouton de lecture. Une fois le flux lancé,
            la couche recouvre tout et protège d'une mise en pause accidentelle. */}
        {pov.status === "playing" ? (
          <div className="hit" {...surfaceHandlers} aria-hidden="true" />
        ) : (
          <>
            <div className="hit-strip top" {...surfaceHandlers} aria-hidden="true" />
            <div className="hit-strip bottom" {...surfaceHandlers} aria-hidden="true" />
            <div className="hit-strip left" {...surfaceHandlers} aria-hidden="true" />
            <div className="hit-strip right" {...surfaceHandlers} aria-hidden="true" />
          </>
        )}

        {(pov.status === "offline" || pov.status === "ended") && (
          <div className="offline-card">
            <span className="label">
              {pov.status === "offline" ? "Source hors ligne" : "Diffusion terminée"}
            </span>
            <span className="mono">{pov.login}</span>
          </div>
        )}

        {goal && goal.total > 0 && (
          <button
            className="goals-pill"
            aria-expanded={goalsOpen}
            onClick={() => setGoalsOpen((v) => !v)}
            title={`Paliers de dons de ${pov.display}`}
          >
            Goals <span className="count">{goal.reached}/{goal.total}</span>
          </button>
        )}

        {goal && goalsOpen && (
          <div className="goals-panel" onWheel={(e) => e.stopPropagation()}>
            <div className="goals-head">
              <span className="label">Paliers de dons</span>
              <span className="mono">{goal.donation}</span>
              <button className="close" onClick={() => setGoalsOpen(false)} aria-label="Fermer les paliers">
                ×
              </button>
            </div>
            <ol className="goals-list">
              {goal.steps.map((step, i) => {
                const current = !step.reached && i === goal.reached;
                return (
                  <li
                    key={`${step.amountValue}-${i}`}
                    className="goal-step"
                    data-reached={step.reached}
                    data-current={current}
                    ref={current ? currentStepRef : undefined}
                  >
                    <span className="dot" aria-hidden="true" />
                    <span className="body">
                      <span className="title">{step.title}</span>
                      <span className="amount">Montant requis : {step.amount}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="slug">
          <span className="num">SRC {num}</span>
          <span className="who">{pov.display}</span>
        </div>

        {audible && <div className="vu" style={{ width: `${Math.round(pov.volume * 100)}%` }} />}

        {statusLabel && <div className="badge">{statusLabel}</div>}

        <div className="overlay">
          <div className="overlay-id">
            {pov.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pov.avatar} alt="" />
            ) : (
              <span className="noavatar" />
            )}
            <span className="who">
              <span className="n">{pov.display}</span>
              <span className="m">
                SRC {num} ·{" "}
                <a
                  className="channel"
                  href={`https://www.twitch.tv/${pov.login}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Ouvrir la chaîne de ${pov.display} sur Twitch`}
                >
                  twitch.tv/{pov.login}
                </a>
                {goal && <b> · {goal.donation}</b>}
              </span>
            </span>
          </div>

          <div className="overlay-row">
            <button className="btn" onClick={() => onSolo(pov.id)} title="Ne garder que cette source audible">
              Solo
            </button>
            <button
              className="btn tally"
              aria-pressed={!pov.muted}
              onClick={() => onPatch(pov.id, { muted: !pov.muted })}
              title={pov.muted ? "Activer le son de cette source" : "Couper le son de cette source"}
            >
              {pov.muted ? "Son" : "Coupé"}
            </button>
            <div className="fader">
              <input
                type="range"
                className={audible ? "live" : ""}
                min={0}
                max={100}
                value={Math.round(pov.volume * 100)}
                aria-label={`Volume de ${pov.display}`}
                onChange={(e) => {
                  const volume = Number(e.target.value) / 100;
                  onPatch(pov.id, { volume, ...(volume > 0 ? { muted: false } : {}) });
                }}
              />
              <span className="mono" style={{ width: 26, textAlign: "right" }}>
                {Math.round(pov.volume * 100)}
              </span>
            </div>
          </div>

          <div className="overlay-row">
            <button
              className="btn icon-only"
              onClick={() => onRefresh(pov.id)}
              aria-label={`Relancer le flux de ${pov.display}`}
              title="Relancer ce flux — utile s'il s'est figé ou coupé"
            >
              <RefreshIcon />
            </button>
            <button
              className="btn icon-only"
              onClick={() => onFocus(pov.id)}
              aria-label={`Agrandir ${pov.display}`}
              title="Agrandir cette source"
            >
              <ExpandIcon />
            </button>
            <button
              className="btn icon-only"
              aria-pressed={isFullscreen}
              onClick={() => onFullscreen(pov.id)}
              aria-label={
                isFullscreen ? "Revenir à la grille" : `Afficher ${pov.display} plein cadre`
              }
              title={
                isFullscreen
                  ? "Revenir à la grille"
                  : "Occuper tout l'écran — les autres sources restent audibles"
              }
            >
              <FullscreenIcon />
            </button>
            <button
              className="btn"
              disabled={!canMoveBack}
              onClick={() => onMove(pov.id, -1)}
              title="Déplacer vers la gauche"
            >
              ←
            </button>
            <button
              className="btn"
              disabled={!canMoveForward}
              onClick={() => onMove(pov.id, 1)}
              title="Déplacer vers la droite"
            >
              →
            </button>
            <button
              className="btn icon-only"
              onClick={() => onRemove(pov.id)}
              aria-label={`Retirer ${pov.display} du mur`}
              title="Retirer cette source du mur"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
