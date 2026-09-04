"use client";

import { useMemo, useState } from "react";
import type { HistoryEntry, Streamer, StreamersPayload } from "@/lib/types";

type Props = {
  data: StreamersPayload | null;
  error: string | null;
  history: HistoryEntry[];
  activeLogins: Set<string>;
  onAdd: (streamer: {
    login: string;
    display: string;
    avatar: string | null;
    twitchId?: string | null;
  }) => void;
  onClearHistory: () => void;
};

type Sort = "viewers" | "donation" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "viewers", label: "Viewers" },
  { key: "donation", label: "Dons" },
  { key: "name", label: "A→Z" },
];

function formatViewers(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : String(n);
}

export default function Sources({
  data,
  error,
  history,
  activeLogins,
  onAdd,
  onClearHistory,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("viewers");

  const online = useMemo(() => (data?.streamers ?? []).filter((s) => s.online), [data]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? online.filter(
          (s) => s.display.toLowerCase().includes(needle) || s.login.toLowerCase().includes(needle)
        )
      : online;
    const sorted = [...filtered];
    if (sort === "viewers") sorted.sort((a, b) => b.viewers - a.viewers);
    if (sort === "donation") sorted.sort((a, b) => b.donationValue - a.donationValue);
    if (sort === "name") sorted.sort((a, b) => a.display.localeCompare(b.display, "fr"));
    return sorted;
  }, [online, query, sort]);

  const recent = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? history.filter(
          (h) => h.display.toLowerCase().includes(needle) || h.login.toLowerCase().includes(needle)
        )
      : history;
    return list.slice(0, 8);
  }, [history, query]);

  return (
    <aside className="sources" aria-label="Sources disponibles">
      <div className="sources-head">
        <input
          className="search"
          type="search"
          placeholder="Chercher un streamer"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher un streamer du ZEvent"
        />
        <div className="sort-row">
          <span className="label">Trier par</span>
          <div className="segmented">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className="btn"
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="scroll">
        {recent.length > 0 && (
          <>
            <div className="group-head">
              <span className="label">Déjà regardés</span>
              <button className="link" onClick={onClearHistory}>
                Effacer
              </button>
            </div>
            {recent.map((h) => (
              <SourceRow
                key={`h-${h.login}`}
                twitchId={h.twitchId ?? null}
                login={h.login}
                display={h.display}
                avatar={h.avatar}
                right={<span className="v">rejoindre</span>}
                disabled={activeLogins.has(h.login)}
                onAdd={onAdd}
              />
            ))}
          </>
        )}

        <div className="group-head">
          <span className="label">En direct</span>
          <span className="count mono">{results.length}</span>
        </div>

        {error && <p className="empty">{error}</p>}

        {!error && !data && <p className="empty">Chargement de la liste des streamers…</p>}

        {!error && data && results.length === 0 && (
          <p className="empty">
            Aucun streamer ne correspond à « {query} ». Essayez une autre orthographe.
          </p>
        )}

        {results.map((s: Streamer) => (
          <SourceRow
            key={s.login}
            twitchId={s.twitchId}
            login={s.login}
            display={s.display}
            avatar={s.avatar}
            right={
              <>
                <span className="v">{formatViewers(s.viewers)}</span>
                <span className="d">{s.donation}</span>
              </>
            }
            disabled={activeLogins.has(s.login)}
            onAdd={onAdd}
          />
        ))}
      </div>
    </aside>
  );
}

function SourceRow({
  twitchId,
  login,
  display,
  avatar,
  right,
  disabled,
  onAdd,
}: {
  twitchId: string | null;
  login: string;
  display: string;
  avatar: string | null;
  right: React.ReactNode;
  disabled: boolean;
  onAdd: Props["onAdd"];
}) {
  return (
    <button
      className="src"
      disabled={disabled}
      onClick={() => onAdd({ login, display, avatar, twitchId })}
      title={disabled ? `${display} est déjà sur le mur` : `Ajouter ${display} au mur`}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" loading="lazy" />
      ) : (
        <span className="noavatar" />
      )}
      <span className="src-name">{display}</span>
      <span className="src-meta">{right}</span>
    </button>
  );
}
