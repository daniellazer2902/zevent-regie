export type PovStatus = "loading" | "playing" | "offline" | "ended";

export type Pov = {
  /** Identifiant stable, indépendant du login : réorganiser ne doit jamais recréer le lecteur. */
  id: string;
  /** Identifiant Twitch, clé des paliers de dons. Inconnu tant que la liste n'est pas arrivée. */
  twitchId: string | null;
  login: string;
  display: string;
  avatar: string | null;
  volume: number; // 0 → 1
  muted: boolean;
  status: PovStatus;
};

export type LayoutMode = "grid" | "focus" | "fullscreen";

export type Streamer = {
  twitchId: string;
  login: string;
  display: string;
  avatar: string | null;
  online: boolean;
  viewers: number;
  donation: string;
  donationValue: number;
};

export type StreamersPayload = {
  streamers: Streamer[];
  totalDonation: string;
  totalDonationValue: number;
  totalViewers: string;
  totalViewersValue: number;
  fetchedAt: number;
};

/** Les compteurs seuls, suivis de près sans retélécharger la liste. */
export type Pulse = {
  totalDonation: string;
  totalDonationValue: number;
  totalViewers: string;
  totalViewersValue: number;
};

export type HistoryEntry = {
  twitchId?: string | null;
  login: string;
  display: string;
  avatar: string | null;
  seenAt: number;
};

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Valeurs en pixels plutôt qu'en pourcentages (colonne unique défilante). */
  px?: boolean;
};

/** Un palier de dons d'une source. */
export type GoalStep = {
  title: string;
  amount: string;
  amountValue: number;
  reached: boolean;
};

/** Les paliers de dons d'une source, et où elle en est. */
export type Goal = {
  donation: string;
  donationValue: number;
  reached: number;
  total: number;
  progress: number; // 0 → 100 vers le prochain palier
  nextTitle: string | null;
  nextAmount: string | null;
  steps: GoalStep[];
};
