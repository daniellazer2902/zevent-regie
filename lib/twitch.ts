/**
 * Chargement du SDK Twitch et petite façade autour de Twitch.Player.
 *
 * Une iframe écrite à la main n'est pas pilotable : l'isolation cross-origin
 * interdit tout accès. Le SDK construit la même iframe et expose un pont
 * officiel, seul moyen d'agir sur le son et la qualité.
 */

export type TwitchPlayer = {
  play(): void;
  pause(): void;
  setVolume(level: number): void;
  getVolume(): number;
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  setQuality(quality: string): void;
  getQualities(): unknown[];
  setChannel(channel: string): void;
  addEventListener(event: string, handler: () => void): void;
  removeEventListener?(event: string, handler: () => void): void;
  destroy?(): void;
};

type TwitchGlobal = {
  Player: {
    new (element: string | HTMLElement, options: Record<string, unknown>): TwitchPlayer;
    READY: string;
    PLAYING: string;
    OFFLINE: string;
    ONLINE: string;
    ENDED: string;
    PAUSE: string;
  };
};

declare global {
  interface Window {
    Twitch?: TwitchGlobal;
  }
}

const SDK_URL = "https://player.twitch.tv/js/embed/v1.js";
let sdkPromise: Promise<TwitchGlobal> | null = null;

export function loadTwitchSdk(): Promise<TwitchGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SDK Twitch indisponible côté serveur"));
  }
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.Twitch?.Player) resolve(window.Twitch);
      else reject(new Error("SDK Twitch chargé mais incomplet"));
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", () => reject(new Error("Chargement du SDK Twitch impossible")));
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return sdkPromise;
}

/**
 * Le domaine hôte doit être déclaré à Twitch. On le lit à l'exécution, ce qui
 * rend le même build valide en local et une fois déployé.
 */
export function parentDomains(): string[] {
  if (typeof window === "undefined") return ["localhost"];
  const host = window.location.hostname;
  return host === "localhost" ? ["localhost"] : [host, "localhost"];
}
