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
  isFullscreen: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
  canMoveBack: boolean;
  canMoveForward: boolean;
  registerPlayer: (id: string, player: TwitchPlayer | null) => void;
  goal: Goal | null;
  draggable: boolean;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, clientX: number, clientY: number) => void;
  onDragEnd: () => void;
};

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
  isFullscreen,
  onMove,
  canMoveBack,
  canMoveForward,
  registerPlayer,
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

  // Les valeurs courantes, lues depuis les gestionnaires d'événements Twitch
  // sans faire dépendre la création du lecteur de chaque changement de volume.
  // Point de saisie d'un glisser : le déplacement ne démarre qu'au-delà d'un
  // seuil, pour ne pas confondre un simple clic avec un déplacement.
  const grabbedAt = useRef<{ x: number; y: number } | null>(null);
  const captured = useRef(false);

  const stateRef = useRef({ volume: pov.volume, muted: pov.muted });
  stateRef.current = { volume: pov.volume, muted: pov.muted };

  const audible = !pov.muted && pov.volume > 0 && pov.status === "playing";

  // Création du lecteur. Une seule fois par POV : le démonter reviendrait à
  // recharger le flux et à perdre les réglages.
  useEffect(() => {
    let cancelled = false;
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
  }, [pov.id, pov.login]);

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

  const surfaceHandlers = {
    onPointerDown: grab,
    onPointerMove: move,
    onPointerUp: release,
    onPointerCancel: release,
    onDoubleClick: () => onFocus(pov.id),
  };

  return (
    <div
      className="tile"
      data-live={audible}
      data-hidden={hidden}
      data-drag={dragging}
      data-playing={pov.status === "playing"}
      data-draggable={draggable}
      // Cliquer un réglage laisse le focus dessus, ce qui garderait le bandeau
      // ouvert après le départ du pointeur. On rend la main en quittant la case.
      onMouseLeave={(e) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && e.currentTarget.contains(active)) active.blur();
      }}
      style={{
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
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
                SRC {num} · twitch.tv/{pov.login}
                {goal && <b> · {goal.donation}</b>}
              </span>
            </span>
          </div>



          <div className="overlay-row">
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
            <button className="btn" onClick={() => onSolo(pov.id)} title="Ne garder que cette source audible">
              Solo
            </button>
          </div>

          <div className="overlay-row">
            <button className="btn" onClick={() => onFocus(pov.id)} title="Agrandir cette source">
              Agrandir
            </button>
            <button
              className="btn"
              aria-pressed={isFullscreen}
              onClick={() => onFullscreen(pov.id)}
              title={
                isFullscreen
                  ? "Revenir à la grille"
                  : "Occuper tout le mur — les autres sources restent audibles"
              }
            >
              ⛶ Plein cadre
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
            <button className="btn" onClick={() => onRemove(pov.id)} title="Retirer cette source du mur">
              Retirer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
