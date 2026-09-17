/* =========================================================================
   theme.ts — Die visuelle Sprache. Uebernommen aus Dropfall.

   Drei Regeln, die fuer JEDEN Skin gelten:
     1. Flaechen sind flach — keine Verlaeufe, keine Weichzeichner.
     2. Alles ist extrudiert — Deckflaeche + abgedunkelter Sockel.
     3. Ein langer 45°-Schatten, der nach hinten ins Nichts auslaeuft.

   DREI SORTEN TOKEN
   -----------------
   SIGNAL  — Farben, die eine Spielinformation tragen: Muenzsorten, Truhe,
             die Ausgaenge. In BEIDEN Skins identisch — ein Skin darf das
             Bild umfaerben, aber nicht die Frage beantworten, wohin eine
             Muenze gerade faellt.
   WELT    — Grund, Linien, Schrift, Gehaeuse, Boden, Schieber. Pro Skin.
   AKZENT  — `teal`, `amber`, `pink`, `magenta` sind SLOT-NAMEN aus Dropfall,
             keine Farbtoene. Im Herbst ist `teal` Glutorange.
   ========================================================================= */

export type SkinName = "klassisch" | "herbst";

/** Der Abendhimmel im Herbst-Skin. Im Klassik-Skin ohne Wirkung. */
export type SkyMode = "baender" | "einfarbig" | "verlauf";

export interface Skin {
  name: SkinName;
  label: string;

  /* --- Grund und Schrift --- */
  bgDeep: string;
  bg: string;
  bgLift: string;
  line: string;
  lineDim: string;
  text: string;
  muted: string;

  /* --- Akzent-Slots --- */
  teal: string;
  tealDark: string;
  amber: string;
  amberDark: string;
  pink: string;
  pinkDark: string;
  magenta: string;
  magentaDark: string;

  /* --- Welt: Automat --- */
  /** Gehaeuse und Einwurfschiene — das Bauwerk. */
  frame: string;
  frameDark: string;
  /** Die Schiebeflaeche, zwei Dielentoene. */
  floor: string;
  floorAlt: string;
  /** Die Auffangschale unter der Kante. */
  tray: string;
  /** Der Schieber selbst. */
  pusher: string;
  pusherDark: string;

  faceEmpty: string;
  socketEmpty: string;
  tooltipBg: string;

  /* --- Schatten. Der WINKEL ist in beiden Skins 45°, nur der Ton wechselt. --- */
  shadowBase: string;
  shadow: string;
  shadowSoft: string;
}

/**
 * Farben, die eine Spielinformation tragen. Bewusst AUSSERHALB von `Skin`.
 */
export const SIGNAL = {
  truhe: "#9a5528",
  truheDark: "#5a2c10",
  truheBand: "#f0b53c",
  truheBandDark: "#b07a14",
  /** Ausgang Mitte — normale Auszahlung. */
  mitte: "#2ed3ae",
  mitteDark: "#1b9c80",
  /** Linkes Fach — verdoppelt. */
  doppel: "#f0b53c",
  doppelDark: "#b07a14",
  /** Seitliche Abgruende — verloren. */
  abgrund: "#e2453f",
  abgrundDark: "#9c221f",
  /** Reif um eine Truhe kurz vor der Kante. */
  spannung: "#f0b53c",
} as const;

function defineSkin(s: Omit<Skin, "shadow" | "shadowSoft">): Skin {
  return { ...s, shadow: rgba(s.shadowBase, 0.4), shadowSoft: rgba(s.shadowBase, 0.24) };
}

const KLASSISCH = defineSkin({
  name: "klassisch",
  label: "Klassisch",

  bgDeep: "#241f30",
  bg: "#2e2a3d",
  bgLift: "#3a3550",
  line: "#57506b",
  lineDim: "#413b53",
  text: "#f4f1fa",
  muted: "#8b84a0",

  teal: "#2ed3ae",
  tealDark: "#1b9c80",
  amber: "#edb443",
  amberDark: "#b8871f",
  pink: "#f4506e",
  pinkDark: "#b93450",
  magenta: "#e4348f",
  magentaDark: "#a61f66",

  frame: "#2ed3ae",
  frameDark: "#1b9c80",
  floor: "#1d1829",
  floorAlt: "#211b2f",
  tray: "#15111f",
  pusher: "#e4348f",
  pusherDark: "#a61f66",

  faceEmpty: "#1b1528",
  socketEmpty: "#0f0b19",
  tooltipBg: "#14101f",

  shadowBase: "#0e0a16",
});

/*
 * HERBST — dunkles Holz, Terrakotta und Gold. Der Standard.
 */
const HERBST = defineSkin({
  name: "herbst",
  label: "Herbst",

  bgDeep: "#1b1210",
  bg: "#2b1a13",
  bgLift: "#3d2519",
  line: "#6d4529",
  lineDim: "#4a2e1d",
  text: "#fdf2e2",
  muted: "#b18b6d",

  teal: "#f2703c",
  tealDark: "#a83c12",
  amber: "#f0b53c",
  amberDark: "#b07a14",
  pink: "#e2453f",
  pinkDark: "#9c221f",
  magenta: "#c94a7a",
  magentaDark: "#8c2850",

  /* Terrakotta-Gehaeuse, dunkles Holz als Schiebeflaeche. */
  frame: "#b5623a",
  frameDark: "#7a3818",
  floor: "#2a1811",
  floorAlt: "#2f1b13",
  tray: "#180d09",
  pusher: "#f2703c",
  pusherDark: "#a83c12",

  faceEmpty: "#241610",
  socketEmpty: "#150c08",
  tooltipBg: "#1c110c",

  shadowBase: "#1a0803",
});

export const SKINS: Record<SkinName, Skin> = {
  klassisch: KLASSISCH,
  herbst: HERBST,
};

/**
 * Der aktive Skin. Bewusst `let`: ES-Module exportieren lebende Bindungen.
 * Nie auf Modulebene in eine Konstante kopieren — immer erst beim Zeichnen lesen.
 */
export let C: Skin = KLASSISCH;

let aktiv: SkinName = "klassisch";
const hoerer: Array<() => void> = [];

export const getSkin = (): SkinName => aktiv;

export function onSkinChange(fn: () => void): void {
  hoerer.push(fn);
}

export function setSkin(name: SkinName): void {
  if (name === aktiv) return;
  aktiv = name;
  C = SKINS[name];
  if (typeof document !== "undefined") document.documentElement.dataset.skin = name;
  for (const fn of hoerer) fn();
}

export type PaletteKey = "teal" | "amber" | "pink" | "magenta";

/**
 * Die Farbe eines Ast-Slots im aktuellen Skin. Als Funktion und nicht als
 * Tabelle, weil eine Tabelle den Skin einfrieren wuerde, der beim Laden
 * aktiv war.
 */
export function pal(key: PaletteKey): { top: string; base: string } {
  switch (key) {
    case "teal":
      return { top: C.teal, base: C.tealDark };
    case "amber":
      return { top: C.amber, base: C.amberDark };
    case "pink":
      return { top: C.pink, base: C.pinkDark };
    case "magenta":
      return { top: C.magenta, base: C.magentaDark };
  }
}

/** Schattenfarbe des aktiven Skins bei gegebener Deckkraft. */
export function sh(a: number): string {
  return rgba(C.shadowBase, a);
}

/* ------------------------------------------------------------- Farben --- */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/*
 * shade() und mix() geben wieder Hex zurueck, nicht rgb(). Nur so lassen sie
 * sich ineinander stecken — der Skill Tree blendet Farben ueber mehrere
 * Stufen ineinander und braucht das Ergebnis jeder Stufe als Eingabe der
 * naechsten.
 */
const toHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** amt < 0 dunkelt ab, amt > 0 hellt auf. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return toHex(f(r), f(g), f(b));
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Zieht eine Farbe Richtung ihres eigenen Grauwerts. t = 0 laesst sie, t = 1
 * macht sie farblos. Anders als Abdunkeln bleibt die HELLIGKEIT dabei
 * stehen — genau das braucht ein "ausgegraut", das den Ton noch erkennen
 * lassen soll.
 */
export function desaturate(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (l - v) * t)));
  return toHex(f(r), f(g), f(b));
}

/** Mischt zwei Hex-Farben. t = 0 -> a, t = 1 -> b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const f = (x: number, y: number) => Math.max(0, Math.min(255, Math.round(x + (y - x) * t)));
  return toHex(f(r1, r2), f(g1, g2), f(b1, b2));
}

/* -------------------------------------------------------------- Pfade --- */

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------- Lange Schatten --- */

/** Dieselbe Farbe, aber vollstaendig durchsichtig — das Ende des Verlaufs. */
export function transparent(color: string): string {
  const m = color.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  if (color.startsWith("#")) return rgba(color, 0);
  return "rgba(0, 0, 0, 0)";
}

/**
 * Sammelt `addPath(dx, dy)` über eine 45°-Diagonale und füllt einmal.
 * Ein einzelner fill() über überlappende Subpfade deckt gleichmäßig, statt
 * sich an den Überlappungen aufzudunkeln.
 *
 * Gefüllt wird mit einem Verlauf ENTLANG der Schattenachse: am Objekt volle
 * Deckung, am Ende nichts mehr. Ohne ihn bricht der Schatten auf voller
 * Deckkraft ab, und dieser Abriss liest sich als Kante eines Gegenstands,
 * der gar nicht da ist. Bis zum Rand des werfenden Objekts bleibt der
 * Verlauf auf voller Deckung — der Schatten soll direkt am Fuß am
 * dunkelsten sein, nicht schon auf halber Kraft aus dem Objekt treten.
 */
export function longShadow(
  ctx: CanvasRenderingContext2D,
  addPath: (dx: number, dy: number) => void,
  length: number,
  color: string = C.shadow,
  /**
   * Mittelpunkt des werfenden Objekts und sein Radius in Schattenrichtung.
   * Ohne Angabe bleibt der Schatten durchgehend deckend.
   */
  anchor?: { x: number; y: number; r: number },
  step = 1.5
): void {
  if (length <= 0) return;

  ctx.beginPath();
  for (let d = step; d <= length; d += step) addPath(d, d);

  if (anchor) {
    // Die Achse laeuft von der Objektmitte bis zur aeussersten Schattenecke,
    // damit der Verlauf genau dort bei null ankommt, wo der Schatten endet.
    const reichweite = length + anchor.r / Math.SQRT2;
    const achse = reichweite * Math.SQRT2;
    const g = ctx.createLinearGradient(
      anchor.x,
      anchor.y,
      anchor.x + reichweite,
      anchor.y + reichweite
    );
    g.addColorStop(0, color);
    g.addColorStop(Math.min(0.9, anchor.r / achse), color);
    g.addColorStop(1, transparent(color));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
}

/*
 * DER UMRISS STATT DES STAPELS
 *
 * `longShadow` legt die Form alle 1.5 px erneut auf die Diagonale und
 * füllt die Vereinigung EINMAL. Bei einem Knopfschatten von 86 px sind das
 * 57 Kopien eines Rundrechtecks je Knopf, mal 78 Knöpfe im Baum — der Pfad
 * allein kostete mehr als alles andere im Bild zusammen.
 *
 * Gebraucht wird davon nur die Hülle. Rundrechteck und Kreis sind konvex,
 * und die Vereinigung einer konvexen Form entlang einer Strecke ist exakt
 * ihre konvexe Hülle mit der verschobenen Kopie: die Rückseite der Form am
 * Anfang, die Vorderseite am Ende, dazwischen zwei gerade Tangenten. Das
 * sind sechs Bogenstücke statt Hunderter — dasselbe Bild, ein Bruchteil
 * der Arbeit. Die Trennstellen liegen dort, wo die Tangente parallel zur
 * Schattenrichtung läuft, also bei 3π/4 und 7π/4.
 *
 * Alle Bögen laufen mit wachsendem Winkel, also im selben Umlaufsinn wie
 * `roundRectPath`. Bei `nonzero` dürfen sich Teilpfade sonst gegenseitig
 * auslöschen.
 */

/** Rundrechteck, entlang (1,1) von `von` bis `bis` gezogen. Ein Teilpfad. */
function sweptRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  von: number,
  bis: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const P = Math.PI;
  // Eckmittelpunkte der ruhenden Form, um `von` verschoben.
  const lx = x + rr + von;
  const rx = x + w - rr + von;
  const ty = y + rr + von;
  const by = y + h - rr + von;
  const d = bis - von;

  ctx.arc(lx, by, rr, 0.75 * P, P); // untere linke Ecke, hintere Hälfte
  ctx.arc(lx, ty, rr, P, 1.5 * P); // obere linke Ecke
  ctx.arc(rx, ty, rr, 1.5 * P, 1.75 * P); // obere rechte Ecke bis zur Tangente
  ctx.arc(rx + d, ty + d, rr, 1.75 * P, 2 * P); // ... und weiter auf der Kopie
  ctx.arc(rx + d, by + d, rr, 0, 0.5 * P); // untere rechte Ecke
  ctx.arc(lx + d, by + d, rr, 0.5 * P, 0.75 * P); // zurück zur zweiten Tangente
  ctx.closePath();
}

/** Kreis, entlang (1,1) gezogen: eine Kapsel. Ein Teilpfad. */
function sweptCirclePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  von: number,
  bis: number
): void {
  const P = Math.PI;
  const d = bis - von;
  ctx.arc(cx + von, cy + von, radius, 0.75 * P, 1.75 * P);
  ctx.arc(cx + von + d, cy + von + d, radius, 1.75 * P, 0.75 * P);
  ctx.closePath();
}

/**
 * Füllt einen fertigen Schattenpfad mit dem Verlauf entlang der Achse —
 * dieselbe Rechnung wie in `longShadow`, nur ohne den Stapel davor.
 */
function fillLongShadow(
  ctx: CanvasRenderingContext2D,
  color: string,
  anchor: { x: number; y: number; r: number },
  length: number
): void {
  const reichweite = length + anchor.r / Math.SQRT2;
  const achse = reichweite * Math.SQRT2;
  const g = ctx.createLinearGradient(
    anchor.x,
    anchor.y,
    anchor.x + reichweite,
    anchor.y + reichweite
  );
  g.addColorStop(0, color);
  g.addColorStop(Math.min(0.9, anchor.r / achse), color);
  g.addColorStop(1, transparent(color));
  ctx.fillStyle = g;
  ctx.fill();
}

export function longShadowRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  length: number,
  color: string = C.shadow,
  /** Wo der Schatten unter dem Objekt hervortritt — wie in `longShadow`. */
  step = 1.5
): void {
  // Wie im Stapel: unter `step` gaebe es nicht einmal eine erste Kopie.
  if (length < step) return;
  ctx.beginPath();
  sweptRoundRectPath(ctx, x, y, w, h, r, step, length);
  // Der Radius in Schattenrichtung ist die auf die 45°-Achse projizierte
  // Ecke — bis dorthin steckt der Schatten noch unter dem Rechteck.
  fillLongShadow(ctx, color, { x: x + w / 2, y: y + h / 2, r: (w / 2 + h / 2) / Math.SQRT2 }, length);
}

export function longShadowCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  length: number,
  color: string = C.shadow,
  step = 1.5
): void {
  if (length < step) return;
  ctx.beginPath();
  sweptCirclePath(ctx, cx, cy, radius, step, length);
  fillLongShadow(ctx, color, { x: cx, y: cy, r: radius }, length);
}

/* --------------------------------------------------- Extrudierte Formen --- */

/**
 * Ein Koerper aus Deckflaeche und Seitenwand.
 *
 * Die Wand ist NICHT dieselbe Form noch einmal, nur tiefer gesetzt — sie ist
 * die Spur, die die Deckflaeche auf ihrem Weg nach unten hinterlaesst. Fuer
 * ein abgerundetes Rechteck ist diese Spur wieder ein abgerundetes Rechteck,
 * nur um die Wandhoehe laenger. Deshalb genuegt ein Pfad.
 *
 * Der Unterschied faellt erst am Kreis auf, und dort dann sofort: eine bloss
 * nach unten versetzte Kreisscheibe laeuft links und rechts auf null Hoehe
 * aus. Statt eines Zylinders sieht man eine Sichel, die unter der Scheibe
 * hervorlugt — flach und schmutzig. Die Spur dagegen ist eine Kapsel und hat
 * ueber die ganze Breite dieselbe Wandhoehe.
 */
export function extrudedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  top: string,
  base: string,
  depth = 6,
  /**
   * Wie weit die Deckflaeche in ihren Sockel gedrueckt ist, in Pixeln. Der
   * Sockel bleibt stehen, nur der Deckel faehrt herunter — genau so gibt ein
   * echter Knopf nach. Negative Werte heben den Deckel an; die Wand waechst
   * dann mit, der Knopf steigt aus seinem Sockel.
   */
  sink = 0
): void {
  const topY = y + sink;
  const wall = Math.max(0, depth - sink);

  ctx.beginPath();
  roundRectPath(ctx, x, topY, w, h + wall, r);
  ctx.fillStyle = base;
  ctx.fill();

  ctx.beginPath();
  roundRectPath(ctx, x, topY, w, h, r);
  ctx.fillStyle = top;
  ctx.fill();
}

export function extrudedCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  top: string,
  base: string,
  depth = 6,
  /** Siehe extrudedRect: der Deckel sinkt, der Sockel bleibt. */
  sink = 0
): void {
  // Ein Kreis ist ein abgerundetes Quadrat mit r = halbe Kantenlaenge —
  // damit gilt hier dieselbe Spur, und die Wand wird zur Kapsel.
  extrudedRect(
    ctx,
    cx - radius,
    cy - radius,
    radius * 2,
    radius * 2,
    radius,
    top,
    base,
    depth,
    sink
  );
}

export function outlineRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width = 2.5,
  fill?: string
): void {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/* -------------------------------------------------------- Formatierung --- */

const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) {
    if (n < 10) return n < 1 ? n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") : n.toFixed(1).replace(/\.0$/, "");
    return Math.floor(n).toString();
  }
  let tier = 0;
  let v = n;
  while (v >= 1000 && tier < UNITS.length - 1) {
    v /= 1000;
    tier++;
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.replace(/\.?0+$/, "") + UNITS[tier];
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `0:${String(sec).padStart(2, "0")}`;
}

/* -------------------------------------------------------------- Utils --- */

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------- Easing --- */

/**
 * Schiebt `v` um `step` in Richtung `to` und haelt dort an. Anders als eine
 * exponentielle Annaeherung kommt der Wert wirklich AN — was gebraucht wird,
 * wenn er ein Fortschritt von 0 bis 1 ist, den eine Kurve weiterverarbeitet.
 */
export function approach(v: number, to: number, step: number): number {
  return v < to ? Math.min(to, v + step) : Math.max(to, v - step);
}

/** Schnell los, weich aus — der Standard fuer "etwas erscheint". */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Weich an beiden Enden — fuer Formwechsel, die niemand anstossen sieht. */
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
