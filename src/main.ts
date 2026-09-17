/* =========================================================================
   main.ts — Hauptschleife, Oberflaeche, Eingabe.

   ZWEI ANSICHTEN
   --------------
   Automat     die Plattform, links die Muenzwahl, rechts der Schnellkauf.
   Upgrade-Baum der Skill Tree aus Dropfall, zum Ziehen und Zoomen.
   Der Automat laeuft in beiden Ansichten weiter — Auto-Einwurf und
   Muenzregen verdienen also auch, waehrend man im Baum einkauft.

   Das Spiel laeuft nur, solange das Fenster offen ist. Ein verborgener Tab
   bekommt keine Animationsbilder; beim Zurueckkommen wird der Zeitsprung
   gekappt, statt ihn nachzurechnen.
   ========================================================================= */

import "./fonts.css";
import "./style.css";

import { COINS, SONDER, zeichneMuenze, type CoinKind } from "./coins";
import { decorBoe, decorZeiger, drawDecorBack, drawDecorFront, type Rahmen } from "./decor";
import { truhenWert } from "./economy";
import { Machine, W } from "./machine";
import { laden, loeschen, neuerStand, speichern, type SaveData } from "./save";
import { grafik, initGrafik, setGrafik } from "./skin";
import { C, fmt, onSkinChange } from "./theme";
import { costOf, TreeView, type TreeNodeDef } from "./tree";
import { deriveStats, NODES, type Stats } from "./upgrades";

initGrafik();

let S: SaveData = laden();
let stats: Stats = deriveStats(S.levels);

type Ansicht = "automat" | "baum";
let ansicht: Ansicht = "automat";

/* ------------------------------------------------------------ Automat --- */

let vorratTimer = 0;
let autoTimer = stats.autoTakt;
let regenTimer = 0;
/** Einnahmen der letzten Sekunden, fuer die Rate. */
const einnahmen: Array<{ t: number; v: number }> = [];
let jetzt = 0;

function gutschreiben(v: number): void {
  S.geld += v;
  S.stats.verdient += v;
  einnahmen.push({ t: jetzt, v });
}

const machine = new Machine(() => stats, {
  gewinn: gutschreiben,
  comboEnde(anzahl, mult, bonus) {
    gutschreiben(bonus);
    S.stats.besteCombo = Math.max(S.stats.besteCombo, anzahl);
    if (mult >= 4) toast(`<b>Kaskade!</b> ${anzahl} Objekte · ×${mult.toFixed(1).replace(/\.0$/, "")} · +${fmt(bonus)}`, 2.6);
  },
  truhe(ergebnis, wert, zone) {
    if (ergebnis === "verloren") {
      toast("Die Truhe ist in den <b>Abgrund</b> gestürzt.", 2.6);
    } else {
      S.stats.truhen++;
      const fach = zone === "doppel" ? " im <b>Doppelfach</b>" : "";
      toast(`Schatztruhe geborgen${fach}: <b>+${fmt(wert)}</b> und ein Münzregen!`, 3);
    }
  },
  lieferung() {
    toast("<b>Schatzlieferung!</b> Eine neue Truhe landet.", 2);
  },
});

if (S.maschine) machine.laden(S.maschine);
else machine.befuellen();

/* ------------------------------------------------------------ Einwurf --- */

let zielX = W / 2;
let halten = false;
let haltenTimer = 0;
const HALTEN_TAKT = 0.15;

/**
 * Glueck: eine Kupfermuenze wird mit der Chance ihres Knotens zu einer
 * freigeschalteten Sondermuenze. Jede Sorte wuerfelt fuer sich, in
 * zufaelliger Reihenfolge — sonst gewaenne immer die erste.
 */
function glueck(kind: CoinKind): CoinKind {
  if (kind !== "kupfer") return kind;
  const sorten = SONDER.filter((k) => stats.coins[k].glueck > 0).sort(() => Math.random() - 0.5);
  for (const k of sorten) if (Math.random() < stats.coins[k].glueck) return k;
  return kind;
}

/** Was ein Einwurf dieser Sorte gerade kostet: aus dem Vorrat oder in Geld. */
function preis(kind: CoinKind): { vorrat: number; geld: number } {
  if (kind === "kupfer") return { vorrat: 1, geld: COINS.kupfer.preis };
  if (kind === "silber") return { vorrat: stats.silberVorrat, geld: COINS.silber.preis };
  return { vorrat: 0, geld: stats.coins[kind].preis };
}

function einwerfen(): boolean {
  const kind = S.muenze;
  const p = preis(kind);
  if (p.vorrat > 0 && S.vorrat >= p.vorrat) {
    S.vorrat -= p.vorrat;
  } else if (S.geld >= p.geld) {
    S.geld -= p.geld;
  } else {
    toast(p.vorrat > 0 ? "Der Vorrat ist leer und das Geld reicht nicht." : "Dafür reicht das Geld nicht.", 1.4);
    return false;
  }
  S.stats.eingeworfen++;
  machine.einwerfen(glueck(kind), zielX);
  return true;
}

/* ------------------------------------------------------------ Canvas --- */

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let dpr = 1;

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

/* -------------------------------------------------------------- Baum --- */

/** Rand um den Baum, auf dem das Laub liegt — in Welteinheiten. */
const LAUB_RAND_UM_BAUM = 420;

const tree = new TreeView(NODES, {
  getLevel: (id) => S.levels[id] ?? 0,
  getCurrency: () => S.geld,
  onBuy: (id, cost) => {
    S.geld -= cost;
    kaufeStufe(id);
  },
  onHover: (def, x, y) => showTooltip(def, x, y),
});

/** Eine Stufe gutschreiben — gemeinsam fuer Baum und Schnellkauf. */
function kaufeStufe(id: string): void {
  const stufe = (S.levels[id] ?? 0) + 1;
  S.levels[id] = stufe;
  stats = deriveStats(S.levels);

  if (id.startsWith("coin_")) {
    const kind = id.slice(5) as CoinKind;
    baueMuenzwahl();
    toast(`Neue Münze: <b>${COINS[kind].name}</b> &mdash; Taste ${taste(kind)} in der Münzwahl.`, 3.5);
  } else if (id === "auto" && stufe === 1) {
    autoTimer = stats.autoTakt;
    toast("<b>Auto-Einwurf</b> läuft — der Automat wirft jetzt selbst ein.", 2.4);
  } else if (id === "regen" && stufe === 1) {
    regenTimer = 0;
    toast("<b>Münzregen</b> eingerichtet.", 2.4);
  }
  schnellSig = "";
  speichern(stand());
}

/* ----------------------------------------------------------- Tooltip --- */

const elTooltip = document.getElementById("tooltip")!;

function showTooltip(def: TreeNodeDef | null, sx: number, sy: number, links = false): void {
  if (!def) {
    elTooltip.classList.add("hidden");
    return;
  }
  const lvl = S.levels[def.id] ?? 0;
  const maxed = lvl >= def.max;
  const unlocked = tree.isUnlocked(def);
  const cost = costOf(def, lvl);
  const affordable = S.geld >= cost;
  const missing = tree.missingReq(def);
  const preisText = `<span class="coin-glyph coin-glyph--klein"></span> ${fmt(cost)}`;

  let footer: string;
  if (maxed) footer = `<div class="tt-cost tt-cost--max">${def.max === 1 ? "FREIGESCHALTET" : "MAX"}</div>`;
  else if (!unlocked) footer = `<div class="tt-cost tt-cost--no">GESPERRT</div>`;
  else if (affordable) footer = `<div class="tt-cost tt-cost--ok">${cost === 0 ? "GRATIS" : preisText} &nbsp;·&nbsp; KAUFEN</div>`;
  else footer = `<div class="tt-cost tt-cost--no">${preisText}</div>`;

  const level = `<div class="tt-level${lvl > 0 ? "" : " tt-level--off"}">${lvl} / ${def.max}</div>`;

  elTooltip.innerHTML = `
    <div class="tt-body">
      <div class="tt-head">
        <div class="tt-title">${def.title}</div>
        ${level}
      </div>
      <div class="tt-desc">${def.desc(lvl).replace(/<b>/g, "<em>").replace(/<\/b>/g, "</em>")}</div>
      ${missing ? `<div class="tt-locked">${missing}</div>` : ""}
    </div>
    ${footer}`;
  elTooltip.classList.remove("hidden");

  const r = elTooltip.getBoundingClientRect();
  let x = links ? sx - r.width - 18 : sx + 26;
  if (x + r.width > window.innerWidth - 16) x = sx - r.width - 26;
  const y = Math.max(16, Math.min(window.innerHeight - r.height - 16, sy - r.height / 2));
  elTooltip.style.left = `${x}px`;
  elTooltip.style.top = `${y}px`;
}

/* --------------------------------------------------------------- HUD --- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const elGeld = $("geld");
const elRate = $("rate");
const elVorrat = $("vorrat");
const elVorratBar = $("vorratBar");
const elTruhe = $("truhe");
const elShop = $("shopList");
const elToast = $("toast");
const elCoins = $("coinChoice");

let toastTimer = 0;
function toast(html: string, dauer: number): void {
  elToast.innerHTML = html;
  elToast.classList.remove("hidden");
  elToast.style.opacity = "1";
  toastTimer = dauer;
}

/* --- Muenzwahl --- */

const TASTEN_REIHE: CoinKind[] = ["kupfer", "silber", ...SONDER];
const taste = (kind: CoinKind): string => `${(TASTEN_REIHE.indexOf(kind) + 1) % 10}`;

interface MuenzKnopf {
  kind: CoinKind;
  el: HTMLButtonElement;
  kosten: HTMLElement;
}
let muenzKnoepfe: MuenzKnopf[] = [];

function baueMuenzwahl(): void {
  elCoins.innerHTML = "";
  muenzKnoepfe = [];
  for (const kind of TASTEN_REIHE) {
    if (!stats.coins[kind].frei) continue;
    const el = document.createElement("button");
    el.className = "coin-btn";
    el.title = `${COINS[kind].name}: ${COINS[kind].kurz}`;
    el.innerHTML = `<span class="coin-key">${taste(kind)}</span>
      <canvas class="coin-canvas" width="68" height="68"></canvas>
      <span class="coin-name">${COINS[kind].name.replace("münze", "")}</span>
      <span class="coin-cost"></span>`;
    const cv = el.querySelector("canvas")!;
    const c2 = cv.getContext("2d")!;
    c2.scale(2, 2);
    const s = Math.min(1, 13 / COINS[kind].r);
    zeichneMuenze(c2, kind, 17, 17 + COINS[kind].r * s * 0.2 + 2, s);
    el.addEventListener("click", () => waehleMuenze(kind));
    elCoins.appendChild(el);
    muenzKnoepfe.push({ kind, el, kosten: el.querySelector(".coin-cost")! });
  }
  if (!stats.coins[S.muenze].frei) S.muenze = "kupfer";
  waehleMuenze(S.muenze);
}

function waehleMuenze(kind: CoinKind): void {
  if (!stats.coins[kind].frei) return;
  S.muenze = kind;
  for (const b of muenzKnoepfe) b.el.classList.toggle("is-on", b.kind === kind);
}

baueMuenzwahl();

/* --- Schnellkauf --- */

interface Zeile {
  def: TreeNodeDef;
  el: HTMLButtonElement;
}
let zeilen: Zeile[] = [];
let schnellSig = "";
const SCHNELL_TASTEN = ["Q", "W", "E", "R"];

/** Die gerade kaufbaren Knoten, billigste zuerst. */
function kandidaten(): TreeNodeDef[] {
  return NODES.filter((d) => (S.levels[d.id] ?? 0) < d.max && tree.isUnlocked(d))
    .sort((a, b) => costOf(a, S.levels[a.id] ?? 0) - costOf(b, S.levels[b.id] ?? 0))
    .slice(0, SCHNELL_TASTEN.length);
}

function kaufeSchnell(def: TreeNodeDef): void {
  const lv = S.levels[def.id] ?? 0;
  const k = costOf(def, lv);
  if (lv >= def.max || S.geld < k) return;
  S.geld -= k;
  kaufeStufe(def.id);
}

function updateSchnellkauf(): void {
  const liste = kandidaten();
  const sig = liste.map((d) => `${d.id}:${S.levels[d.id] ?? 0}:${S.geld >= costOf(d, S.levels[d.id] ?? 0)}`).join("|");
  if (sig === schnellSig) return;
  schnellSig = sig;

  elShop.innerHTML = "";
  zeilen = [];
  if (!liste.length) {
    elShop.innerHTML = `<p class="shop-empty">Alles Erreichbare ist gekauft. Im Upgrade-Baum wartet der Rest.</p>`;
    return;
  }
  liste.forEach((def, i) => {
    const lv = S.levels[def.id] ?? 0;
    const k = costOf(def, lv);
    const el = document.createElement("button");
    el.className = "shop-row" + (S.geld >= k ? " is-ready" : "");
    el.innerHTML = `
      <span class="shop-icon shop-icon--${def.color}" aria-hidden="true">${def.icon}</span>
      <span class="shop-info">
        <span class="shop-name">${def.title} <span class="shop-lv">${def.max > 1 ? `${lv}/${def.max}` : "neu"}</span></span>
        <span class="shop-eff">${kurztext(def, lv)}</span>
      </span>
      <span class="shop-cost">${fmt(k)}</span>
      <span class="shop-key">${SCHNELL_TASTEN[i]}</span>`;
    el.addEventListener("click", () => kaufeSchnell(def));
    el.addEventListener("mouseenter", () => {
      const r = el.getBoundingClientRect();
      showTooltip(def, r.left, r.top + r.height / 2, true);
    });
    el.addEventListener("mouseleave", () => showTooltip(null, 0, 0));
    elShop.appendChild(el);
    zeilen.push({ def, el });
  });
}

/** Der erste Satz der Beschreibung, ohne Auszeichnung — fuer die schmale Zeile. */
function kurztext(def: TreeNodeDef, lv: number): string {
  const t = def.desc(lv).split("<br>")[0].replace(/<[^>]+>/g, "");
  return t.length > 64 ? t.slice(0, 62) + " …" : t;
}

function updateHud(): void {
  elGeld.textContent = fmt(Math.floor(S.geld));

  while (einnahmen.length && einnahmen[0].t < jetzt - 10) einnahmen.shift();
  const summe = einnahmen.reduce((a, e) => a + e.v, 0);
  elRate.textContent = `${fmt(summe / 10)} /s`;

  const cap = stats.vorratGroesse;
  elVorrat.textContent = `${Math.floor(S.vorrat)} / ${cap}`;
  const anteil = S.vorrat >= cap ? 1 : vorratTimer / stats.vorratTakt;
  elVorratBar.style.transform = `scaleX(${anteil})`;

  const t = machine.truheAufFeld;
  const n = machine.naechsteTruhe;
  elTruhe.innerHTML = t
    ? `Auf dem Feld · Wert <b>${fmt(truhenWert(machine.truhenGeborgen) * stats.truheWert)}</b>`
    : n === null
      ? "Landet gerade …"
      : `Nächste Lieferung in <b>${Math.ceil(n)} s</b>`;

  for (const b of muenzKnoepfe) {
    const p = preis(b.kind);
    const ausVorrat = p.vorrat > 0 && S.vorrat >= p.vorrat;
    b.kosten.textContent = ausVorrat ? `${p.vorrat} Vorrat` : `${fmt(p.geld)} Geld`;
    b.el.classList.toggle("is-poor", !ausVorrat && S.geld < p.geld);
  }
}

/* ----------------------------------------------------------- Ansichten --- */

const elViewAutomat = $("viewAutomat");
const elViewBaum = $("viewBaum");

function zeige(neu: Ansicht): void {
  ansicht = neu;
  elViewAutomat.classList.toggle("is-on", neu === "automat");
  elViewBaum.classList.toggle("is-on", neu === "baum");
  $("coinPanel").classList.toggle("hidden", neu !== "automat");
  $("shopPanel").classList.toggle("hidden", neu !== "automat");
  $("treeHint").classList.toggle("hidden", neu !== "baum");
  machine.aimX = null;
  halten = false;
  tree.clearHover();
  showTooltip(null, 0, 0);
  canvas.style.cursor = neu === "baum" ? "grab" : "default";
  schnellSig = "";
}

elViewAutomat.addEventListener("click", () => zeige("automat"));
elViewBaum.addEventListener("click", () => zeige("baum"));
$("openTree").addEventListener("click", () => zeige("baum"));

/* ------------------------------------------------------------ Eingabe --- */

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (ansicht === "baum") {
    tree.pointerDown(e.clientX, e.clientY);
    canvas.style.cursor = "grabbing";
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ohne Capture klappt alles bis auf das Ziehen ausserhalb des Fensters */
    }
    return;
  }
  if (machine.aimX === null) return;
  einwerfen();
  halten = true;
  haltenTimer = HALTEN_TAKT * 2;
});

canvas.addEventListener("pointermove", (e) => {
  decorZeiger(e.clientX, e.clientY);
  if (ansicht === "baum") {
    tree.pointerMove(e.clientX, e.clientY);
    return;
  }
  const x = machine.zielAus(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
  machine.aimX = x;
  if (x !== null) zielX = x;
  canvas.style.cursor = x !== null ? "pointer" : "default";
});

canvas.addEventListener("pointerup", (e) => {
  halten = false;
  if (ansicht !== "baum") return;
  tree.pointerUp(e.clientX, e.clientY, e.pointerType !== "mouse");
  tree.pointerMove(e.clientX, e.clientY);
  canvas.style.cursor = "grab";
});

canvas.addEventListener("pointerleave", () => {
  machine.aimX = null;
  halten = false;
});

window.addEventListener("pointerup", () => {
  halten = false;
});

canvas.addEventListener(
  "wheel",
  (e) => {
    if (ansicht !== "baum") return;
    e.preventDefault();
    tree.wheel(e.clientX, e.clientY, e.deltaY);
    decorBoe(e.clientX, e.clientY, e.deltaY < 0 ? 70 : -55);
    tree.pointerMove(e.clientX, e.clientY);
  },
  { passive: false }
);

/* ---------------------------------------------------------- Tastatur --- */

function drueck(el: HTMLElement): void {
  el.classList.add("is-pressed");
  setTimeout(() => el.classList.remove("is-pressed"), 110);
}

window.addEventListener("keydown", (e) => {
  if (!elModal.classList.contains("hidden")) {
    if (e.key === "Escape") elModal.classList.add("hidden");
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    zeige(ansicht === "automat" ? "baum" : "automat");
    return;
  }
  if (e.key === "Escape" && ansicht === "baum") return zeige("automat");
  if (ansicht !== "automat") return;

  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) einwerfen();
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    const i = (Number(e.key) + 9) % 10;
    const kind = TASTEN_REIHE[i];
    if (kind) waehleMuenze(kind);
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "a") zielX = Math.max(14, zielX - 22);
  if (e.key === "ArrowRight" || e.key === "d") zielX = Math.min(W - 14, zielX + 22);
  const i = SCHNELL_TASTEN.indexOf(e.key.toUpperCase());
  if (i >= 0 && zeilen[i]) {
    drueck(zeilen[i].el);
    kaufeSchnell(zeilen[i].def);
  }
});

/* ------------------------------------------------------ Einstellungen --- */

const elModal = $("modal");
$("settings").addEventListener("click", () => {
  syncEinstellungen();
  elModal.classList.remove("hidden");
});
$("closeModal").addEventListener("click", () => elModal.classList.add("hidden"));
elModal.addEventListener("click", (e) => {
  if (e.target === elModal) elModal.classList.add("hidden");
});

function syncEinstellungen(): void {
  const g = grafik();
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-skin]"))
    b.classList.toggle("is-on", b.dataset.skin === g.skin);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-himmel]"))
    b.classList.toggle("is-on", b.dataset.himmel === g.himmel);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-laub]"))
    b.classList.toggle("is-on", b.dataset.laub === g.laub);
  const herbst = g.skin === "herbst";
  $("setHimmel").classList.toggle("is-off", !herbst);
  $("setLaub").classList.toggle("is-off", !herbst);
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-skin]"))
  b.addEventListener("click", () => {
    setGrafik({ skin: b.dataset.skin as "herbst" | "klassisch" });
    syncEinstellungen();
  });
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-himmel]"))
  b.addEventListener("click", () => {
    setGrafik({ himmel: b.dataset.himmel as "baender" | "einfarbig" | "verlauf" });
    syncEinstellungen();
  });
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-laub]"))
  b.addEventListener("click", () => {
    setGrafik({ laub: b.dataset.laub as "aus" | "wenig" | "normal" });
    syncEinstellungen();
  });

onSkinChange(() => {
  schnellSig = "";
});

let wipeScharf = false;
const elWipe = $("wipe");
elWipe.addEventListener("click", () => {
  if (!wipeScharf) {
    wipeScharf = true;
    elWipe.textContent = "Wirklich löschen?";
    setTimeout(() => {
      wipeScharf = false;
      elWipe.textContent = "Spielstand löschen";
    }, 3000);
    return;
  }
  loeschen();
  S = neuerStand();
  stats = deriveStats(S.levels);
  machine.truhenGeborgen = 0;
  machine.truhenTimer = 3;
  machine.befuellen();
  baueMuenzwahl();
  schnellSig = "";
  wipeScharf = false;
  elWipe.textContent = "Spielstand löschen";
  elModal.classList.add("hidden");
  speichern(stand());
  toast("Neuer Automat aufgestellt.", 2);
});

/* ---------------------------------------------------------- Speichern --- */

function stand(): SaveData {
  return { ...S, maschine: machine.speichern() };
}

setInterval(() => speichern(stand()), 5000);
window.addEventListener("beforeunload", () => speichern(stand()));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) speichern(stand());
});

/* ------------------------------------------------------------ Schleife --- */

let letzte = performance.now();

function frame(now: number): void {
  // Gekappt: ein verborgener Tab soll beim Zurueckkommen nicht nachrechnen.
  const dt = Math.min(0.1, (now - letzte) / 1000);
  letzte = now;
  jetzt += dt;

  // Vorrat fuellt sich.
  const cap = stats.vorratGroesse;
  if (S.vorrat < cap) {
    vorratTimer += dt;
    while (vorratTimer >= stats.vorratTakt && S.vorrat < cap) {
      vorratTimer -= stats.vorratTakt;
      S.vorrat++;
    }
  } else {
    vorratTimer = 0;
    S.vorrat = Math.min(S.vorrat, cap);
  }

  // Auto-Einwurf nimmt nur aus dem Vorrat, nie vom Geld.
  if (stats.autoTakt > 0) {
    autoTimer -= dt;
    if (autoTimer <= 0) {
      autoTimer += stats.autoTakt;
      const anzahl = Math.random() < stats.autoZweite ? 2 : 1;
      for (let i = 0; i < anzahl && S.vorrat >= 1; i++) {
        S.vorrat--;
        S.stats.eingeworfen++;
        machine.einwerfen(glueck("kupfer"), machine.autoZiel());
      }
    }
  }

  // Muenzregen aus dem Baum.
  if (stats.regenTakt > 0) {
    regenTimer += dt;
    if (regenTimer >= stats.regenTakt) {
      regenTimer = 0;
      machine.regnen(Array.from({ length: stats.regenMenge }, () => glueck("kupfer")));
      toast("<b>Münzregen!</b>", 1.4);
    }
  }

  // Gedrueckt halten wirft weiter ein.
  if (halten && machine.aimX !== null) {
    haltenTimer -= dt;
    if (haltenTimer <= 0) {
      haltenTimer += HALTEN_TAKT;
      if (!einwerfen()) halten = false;
    }
  }

  machine.update(dt);

  resize();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, vw, vh);

  if (ansicht === "automat") {
    const frei = machine.bounds(vw, vh);
    const rahmen: Rahmen = { id: "arena", ox: 0, oy: 0, scale: 1, welt: { x: 0, y: 0, w: vw, h: vh } };
    drawDecorBack(ctx, rahmen, vw, vh, dt, frei);
    // Ohne Zeiger ueber dem Automaten zeigt die Schiene trotzdem, wohin die
    // Leertaste einwirft.
    const zeigerDa = machine.aimX !== null;
    if (!zeigerDa) machine.aimX = zielX;
    machine.render(ctx, vw, vh);
    if (!zeigerDa) machine.aimX = null;
    drawDecorFront(ctx, rahmen, vw, vh, dt, frei);
    updateSchnellkauf();
  } else {
    // Im Baum liegt das Laub in der Welt der Knoepfe und zoomt mit.
    const cam = tree.camera(vw, vh);
    const b = tree.worldBounds();
    const rahmen: Rahmen = {
      id: "baum",
      ox: cam.x,
      oy: cam.y,
      scale: cam.zoom,
      welt: {
        x: b.x - LAUB_RAND_UM_BAUM,
        y: b.y - LAUB_RAND_UM_BAUM,
        w: b.w + LAUB_RAND_UM_BAUM * 2,
        h: b.h + LAUB_RAND_UM_BAUM * 2,
      },
    };
    drawDecorBack(ctx, rahmen, vw, vh, dt, null);
    tree.render(ctx, vw, vh, dt);
    drawDecorFront(ctx, rahmen, vw, vh, dt, null);
  }

  updateHud();

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) {
      elToast.style.opacity = "0";
      setTimeout(() => {
        if (toastTimer <= 0) elToast.classList.add("hidden");
      }, 400);
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
