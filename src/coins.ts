/* =========================================================================
   coins.ts — Die Muenzsorten: Masse, Wert, Preis, Aussehen.

   Alles, was eine Sorte AUSMACHT, steht hier an einer Stelle. Was sie im
   Spiel TUT (Magnetfeld, Explosion, Kleben …), steht in machine.ts, und wie
   stark sie es tut, kommt aus dem Upgrade-Baum (upgrades.ts).

   Die Farben sind SIGNAL: in beiden Skins gleich. Eine Sprengmuenze muss man
   im Haufen auf einen Blick finden, egal wie das Gehaeuse gerade aussieht.
   ========================================================================= */

import { extrudedCircle, rgba, shade } from "./theme";

export type CoinKind =
  | "kupfer"
  | "silber"
  | "gold"
  | "riese"
  | "magnet"
  | "spreng"
  | "klebe"
  | "geist"
  | "koenig"
  | "chaos";

export interface CoinInfo {
  name: string;
  /** Kurzbeschreibung fuer Muenzwahl und Baum. */
  kurz: string;
  r: number;
  masse: number;
  /** Daempfung je Sekunde — Reibung auf der Flaeche. */
  drag: number;
  /** Grundwert beim Fallen in die Auszahlung. */
  wert: number;
  /** Geldpreis je Einwurf. Kupfer und Silber kommen zuerst aus dem Vorrat. */
  preis: number;
  /** Stoss beim Aufprall. */
  stoss: number;
  top: string;
  base: string;
  ring: string;
}

export const COINS: Record<CoinKind, CoinInfo> = {
  kupfer: {
    name: "Kupfer",
    kurz: "Leicht und häufig.",
    r: 13, masse: 1, drag: 11, wert: 1, preis: 2, stoss: 55,
    top: "#e0874e", base: "#94481f", ring: "#b8612f",
  },
  silber: {
    name: "Silber",
    kurz: "Schwerer und wertvoller.",
    r: 15.5, masse: 2.6, drag: 12, wert: 4, preis: 6, stoss: 150,
    top: "#dcd8d0", base: "#8a857c", ring: "#aba69c",
  },
  gold: {
    name: "Gold",
    kurz: "Schiebt kleinere Münzen beim Aufprall weit zur Seite.",
    r: 16.5, masse: 3.4, drag: 12, wert: 12, preis: 16, stoss: 230,
    top: "#f5c542", base: "#a8720f", ring: "#d19a1f",
  },
  riese: {
    name: "Riesenmünze",
    kurz: "Ein schwerer Rammbock, der den halben Haufen verschiebt.",
    r: 27, masse: 12, drag: 14, wert: 45, preis: 55, stoss: 320,
    top: "#c98a4b", base: "#6e4118", ring: "#9d6630",
  },
  magnet: {
    name: "Magnetmünze",
    kurz: "Zieht nahe Münzen an und bildet Klumpen.",
    r: 15, masse: 2.2, drag: 12, wert: 6, preis: 14, stoss: 90,
    top: "#6fa8ff", base: "#2f5aa8", ring: "#e8e4f2",
  },
  spreng: {
    name: "Sprengmünze",
    kurz: "Stößt beim Fallen alles in ihrer Nähe über die Kante.",
    r: 15, masse: 1.8, drag: 11, wert: 5, preis: 15, stoss: 70,
    top: "#4a3b35", base: "#1f1612", ring: "#ff7a3d",
  },
  klebe: {
    name: "Klebemünze",
    kurz: "Verbindet Nachbarn zu einer Platte, die gemeinsam fällt.",
    r: 15, masse: 1.6, drag: 12, wert: 6, preis: 16, stoss: 60,
    top: "#86c96f", base: "#3e7a2e", ring: "#5fa84a",
  },
  geist: {
    name: "Geistermünze",
    kurz: "Gleitet durch den Haufen und erscheint weit vorne.",
    r: 14, masse: 1.2, drag: 11, wert: 8, preis: 20, stoss: 110,
    top: "#e9e3f7", base: "#8f7fc0", ring: "#b9acdf",
  },
  koenig: {
    name: "Königsmünze",
    kurz: "Multipliziert alle Münzen, die mit ihr gemeinsam fallen.",
    r: 18, masse: 3, drag: 12, wert: 30, preis: 70, stoss: 140,
    top: "#c94a7a", base: "#7a2448", ring: "#f0b53c",
  },
  chaos: {
    name: "Chaosmünze",
    kurz: "Nimmt bei jedem Einwurf den Effekt einer zufälligen Sondermünze an.",
    r: 15, masse: 2, drag: 12, wert: 10, preis: 24, stoss: 120,
    top: "#2ed3ae", base: "#1b6f5c", ring: "#e4348f",
  },
};

export const COIN_KINDS = Object.keys(COINS) as CoinKind[];

/** Die Sondermuenzen — alles ausser Kupfer und Silber. Reihenfolge = Freischaltreihenfolge. */
export const SONDER: CoinKind[] = ["gold", "magnet", "spreng", "riese", "klebe", "geist", "koenig", "chaos"];

/* ------------------------------------------------------------ Zeichnen --- */

/** Hoehe einer Muenze als extrudierte Scheibe. */
export const MUENZ_HOEHE = 5;

/**
 * Eine Muenze von oben. (x, y) ist der Fusspunkt auf der Flaeche; die
 * Deckflaeche sitzt um die Muenzhoehe darueber. `s` skaliert (Flug, Fall).
 */
export function zeichneMuenze(
  ctx: CanvasRenderingContext2D,
  kind: CoinKind,
  x: number,
  y: number,
  s = 1,
  zeit = 0
): void {
  const c = COINS[kind];
  const r = c.r * s;
  const h = MUENZ_HOEHE * s;
  const my = y - h;

  if (kind === "geist") ctx.globalAlpha *= 0.82;
  extrudedCircle(ctx, x, my, r, c.top, c.base, h);

  if (kind === "chaos") {
    // Vier harte Viertel statt eines Verlaufs — Chaos, aber flach.
    const farben = ["#2ed3ae", "#f0b53c", "#e4348f", "#6fa8ff"];
    const dreh = zeit * 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, my);
      ctx.arc(x, my, r, dreh + (i * Math.PI) / 2, dreh + ((i + 1) * Math.PI) / 2);
      ctx.closePath();
      ctx.fillStyle = farben[i];
      ctx.fill();
    }
  }

  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = c.ring;
  ring(ctx, x, my, r * 0.66);

  switch (kind) {
    case "silber":
      raute(ctx, x, my, r * 0.28, c.ring);
      break;
    case "gold":
      ring(ctx, x, my, r * 0.4);
      raute(ctx, x, my, r * 0.2, c.base);
      break;
    case "riese":
      ctx.lineWidth = 3 * s;
      ring(ctx, x, my, r * 0.42);
      ctx.fillStyle = c.base;
      ctx.beginPath();
      ctx.arc(x, my, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "magnet": {
      // Hufeisen: ein dicker Bogen mit zwei hellen Polen.
      ctx.lineWidth = 3.5 * s;
      ctx.strokeStyle = "#e2453f";
      ctx.beginPath();
      ctx.arc(x, my + r * 0.05, r * 0.36, Math.PI * 0.05, Math.PI * 0.95, true);
      ctx.stroke();
      ctx.fillStyle = "#fdf2e2";
      ctx.fillRect(x - r * 0.46, my, r * 0.2, r * 0.18);
      ctx.fillRect(x + r * 0.26, my, r * 0.2, r * 0.18);
      break;
    }
    case "spreng":
      ctx.fillStyle = "#ff7a3d";
      ctx.beginPath();
      ctx.arc(x, my, r * 0.22 * (1 + 0.15 * Math.sin(zeit * 9)), 0, Math.PI * 2);
      ctx.fill();
      break;
    case "klebe":
      ctx.fillStyle = shade(c.top, 0.35);
      ctx.beginPath();
      ctx.arc(x - r * 0.2, my - r * 0.12, r * 0.16, 0, Math.PI * 2);
      ctx.arc(x + r * 0.22, my + r * 0.14, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "geist":
      ctx.fillStyle = c.base;
      ctx.beginPath();
      ctx.arc(x - r * 0.2, my - r * 0.05, r * 0.1, 0, Math.PI * 2);
      ctx.arc(x + r * 0.2, my - r * 0.05, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "koenig": {
      // Eine Krone aus drei Zacken.
      const k = r * 0.34;
      ctx.beginPath();
      ctx.moveTo(x - k, my + k * 0.6);
      ctx.lineTo(x - k, my - k * 0.4);
      ctx.lineTo(x - k * 0.5, my);
      ctx.lineTo(x, my - k * 0.7);
      ctx.lineTo(x + k * 0.5, my);
      ctx.lineTo(x + k, my - k * 0.4);
      ctx.lineTo(x + k, my + k * 0.6);
      ctx.closePath();
      ctx.fillStyle = c.ring;
      ctx.fill();
      break;
    }
    case "chaos":
      ctx.fillStyle = "#1c110c";
      ctx.beginPath();
      ctx.arc(x, my, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba("#fdf2e2", 0.95);
      ctx.font = `800 ${Math.round(r * 0.42)}px Nunito, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", x, my + 0.5);
      break;
  }
  if (kind === "geist") ctx.globalAlpha /= 0.82;
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function raute(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, farbe: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - k);
  ctx.lineTo(x + k, y);
  ctx.lineTo(x, y + k);
  ctx.lineTo(x - k, y);
  ctx.closePath();
  ctx.fillStyle = farbe;
  ctx.fill();
}
