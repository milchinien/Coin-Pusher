/* =========================================================================
   upgrades.ts — Der Upgrade-Baum.

   Aufbau und Formsprache stammen aus Dropfall (tree.ts, layout.ts). Hier
   stehen nur die KNOTEN und was aus ihren Stufen fuer das Spiel folgt.

   DIE AESTE, im Uhrzeigersinn ab dem Startknoten

     Einwurf      ◆ gelb    Vorrat, Nachschub, Auto-Einwurf, Muenzregen
     Schieber     ◆ glut    Tempo, Hub, kritischer Schub, Stampfer
     Auszahlung   ◆ rot     Praegung, Seitenschutz, Doppelfach, Kaskaden
     Truhe        ◆ beere   Wert, Lieferung, Fuellung, Juwelen
     Muenzen      ◆ gemischt  Silber und die Muenzwerkstatt, an der die acht
                            Sondermuenzen haengen

   JEDE SONDERMUENZE HAT DREI KNOTEN

     Freischalten  (1 Stufe)  Die Muenze erscheint in der Muenzwahl.
     Kraft         (4 Stufen) Wert und Effektstaerke dieser Muenze.
     Glueck        (4 Stufen) Chance, dass eine Kupfermuenze — auch aus dem
                              Auto-Einwurf — ohne Aufpreis zu dieser Sorte
                              wird. So tragen Sondermuenzen auch das Idle.

   Bezahlt wird alles in Geld.

   LAYOUT: Hier stehen KEINE Koordinaten. layout.ts rechnet die Lage aus der
   Baumstruktur. Die ERSTE Voraussetzung jedes Knotens bestimmt, woran er
   haengt; die Reihenfolge der Definitionen bestimmt die Richtung.
   ========================================================================= */

import { COINS, SONDER, type CoinKind } from "./coins";
import type { TreeNodeDef } from "./tree";

export type Levels = Record<string, number>;

/* ============================================================ Formeln ===

   Jede Wirkung steht genau einmal als Funktion hier. Beschreibungstext und
   deriveStats rufen dieselbe Funktion — so koennen Text und Wirkung nicht
   auseinanderlaufen.                                                       */

const vorratGroesse = (l: number) => 15 + 6 * l;
const vorratTakt = (l: number) => 1.6 * Math.pow(0.84, l);
const autoTakt = (l: number) => (l > 0 ? 3.2 * Math.pow(0.76, l - 1) : 0);
const autoZweite = (l: number) => 0.25 * l;
const regenTakt = (l: number) => (l > 0 ? 50 * Math.pow(0.8, l - 1) : 0);
const regenMenge = (l: number) => 10 + 5 * l;

const tempo = (l: number) => 1 + 0.12 * l;
const hub = (l: number) => 62 + 9 * l;
const kritChance = (l: number) => 0.08 * l;
const stampfTakt = (l: number) => (l > 0 ? 12 * Math.pow(0.8, l - 1) : 0);
const stampfKraft = (l: number) => 30 + 12 * l;

const praegung = (l: number) => 1 + 0.25 * l;
const abgrund = (l: number) => 0.13 - 0.019 * l;
const doppelBreite = (l: number) => 0.2 + 0.035 * l;
const auffang = (l: number) => 0.25 * l;
const comboFenster = (l: number) => 1.5 + 0.25 * l;
const comboBonus = (l: number) => 0.2 * l;

const truheWert = (l: number) => 1 + 0.35 * l;
const truhePause = (l: number) => 14 * Math.pow(0.78, l);
const truheRegen = (l: number) => 14 + 6 * l;
const truheJuwel = (l: number) => 0.1 * l;

const silberVorrat = (l: number) => 3 - l;
const silberWert = (l: number) => 1 + 0.25 * l;
const praegerei = (l: number) => Math.pow(0.85, l);

const sonderKraft = (l: number) => 1 + 0.3 * l;
const sonderGlueck = (l: number) => 0.0075 * l;

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)} %`;
const sec = (v: number, d = 1) => `${v.toFixed(d)} s`;
const mal = (v: number) => `×${v.toFixed(2)}`;

/* ============================================================== Knoten === */

/** Was die Kraft-Stufen je Sondermuenze bewirken, als Text. */
const KRAFT_TEXT: Record<CoinKind, { titel: string; icon: string; text: string }> = {
  kupfer: { titel: "", icon: "", text: "" },
  silber: { titel: "", icon: "", text: "" },
  gold: { titel: "Wucht", icon: "✸", text: "Größerer Aufprallradius — sie fegt mehr Münzen zur Seite." },
  riese: { titel: "Rammbock", icon: "⬤", text: "Ihr Aufprall schiebt den Haufen noch weiter nach vorn." },
  magnet: { titel: "Feldstärke", icon: "◎", text: "Größere Reichweite und stärkerer Zug des Magnetfelds." },
  spreng: { titel: "Sprengkraft", icon: "✹", text: "Größerer Radius und stärkerer Stoß der Explosion an der Kante." },
  klebe: { titel: "Haftung", icon: "⬢", text: "Klebt mehr Nachbarn zusammen und hält länger." },
  geist: { titel: "Durchlässigkeit", icon: "◌", text: "Taucht noch näher an der Kante wieder auf." },
  koenig: { titel: "Krönung", icon: "♛", text: "Stärkerer Multiplikator auf die gemeinsame Kaskade." },
  chaos: { titel: "Unordnung", icon: "✺", text: "Der zufällige Effekt fällt stärker aus." },
};

const UNLOCK: Record<CoinKind, { kosten: number; icon: string; farbe: TreeNodeDef["color"] }> = {
  kupfer: { kosten: 0, icon: "", farbe: "amber" },
  silber: { kosten: 0, icon: "", farbe: "amber" },
  gold: { kosten: 300, icon: "◉", farbe: "amber" },
  magnet: { kosten: 1500, icon: "∪", farbe: "teal" },
  spreng: { kosten: 4000, icon: "✹", farbe: "pink" },
  riese: { kosten: 12000, icon: "⬤", farbe: "amber" },
  klebe: { kosten: 30000, icon: "⬢", farbe: "teal" },
  geist: { kosten: 80000, icon: "◌", farbe: "magenta" },
  koenig: { kosten: 250000, icon: "♛", farbe: "magenta" },
  chaos: { kosten: 600000, icon: "✺", farbe: "pink" },
};

/** Woran die Freischaltung einer Sondermuenze haengt. Bestimmt die Aeste im Bild. */
const ELTERN: Record<CoinKind, string> = {
  kupfer: "",
  silber: "",
  gold: "werkstatt",
  magnet: "werkstatt",
  spreng: "werkstatt",
  riese: "coin_gold",
  klebe: "coin_magnet",
  geist: "coin_magnet",
  koenig: "coin_riese",
  chaos: "coin_spreng",
};

function sonderKnoten(kind: CoinKind): TreeNodeDef[] {
  const c = COINS[kind];
  const u = UNLOCK[kind];
  const k = KRAFT_TEXT[kind];
  return [
    {
      id: `coin_${kind}`,
      title: c.name,
      icon: u.icon,
      color: u.farbe,
      max: 1,
      baseCost: u.kosten,
      growth: 1,
      req: [[ELTERN[kind], 1]],
      desc: () =>
        `${c.kurz}<br><br>Schaltet die <b>${c.name}</b> in der Münzwahl frei.<br>Wert <b>${c.wert}</b> · Preis je Einwurf <b>${c.preis}</b>`,
    },
    {
      id: `kraft_${kind}`,
      title: k.titel,
      icon: k.icon,
      color: u.farbe,
      max: 4,
      baseCost: Math.round(u.kosten * 0.6),
      growth: 3,
      req: [[`coin_${kind}`, 1]],
      desc: (l) =>
        `${k.text} Die ${c.name} ist außerdem mehr wert.<br><br>Kraft und Wert: <b>${mal(sonderKraft(l))}</b>`,
    },
    {
      id: `glueck_${kind}`,
      title: `${c.name.replace("münze", "")}glück`,
      icon: "✦",
      color: u.farbe,
      max: 4,
      baseCost: Math.round(u.kosten * 1.5),
      growth: 3.2,
      req: [[`coin_${kind}`, 1]],
      desc: (l) =>
        `Jede <b>Kupfermünze</b> — auch aus dem Auto-Einwurf — wird mit dieser Chance ohne Aufpreis zur ${c.name}.<br><br>Chance: <b>${pct(sonderGlueck(l))}</b>`,
    },
  ];
}

const ROH: TreeNodeDef[] = [
  /* ================================================= Start ============= */
  {
    id: "automat",
    title: "Der Automat",
    icon: "▣",
    color: "teal",
    max: 1,
    baseCost: 0,
    growth: 1,
    desc: () =>
      `Dein Münzschieber. Wirf Münzen ein, schiebe den Haufen über die Kante und kaufe von hier aus jeden Ausbau.<br><br><b>Jeder Ast beginnt hier.</b>`,
  },

  /* ================================================= Einwurf ============ */
  {
    id: "vorrat",
    title: "Münzvorrat",
    icon: "≡",
    color: "amber",
    max: 5,
    baseCost: 12,
    growth: 2.0,
    req: [["automat", 1]],
    desc: (l) => `Mehr Plätze im Münzvorrat.<br><br>Plätze: <b>${vorratGroesse(l)}</b>`,
  },
  {
    id: "nachschub",
    title: "Nachschub",
    icon: "↻",
    color: "amber",
    max: 5,
    baseCost: 20,
    growth: 2.1,
    req: [["vorrat", 1]],
    desc: (l) => `Der Vorrat füllt sich schneller.<br><br>Eine Münze alle <b>${sec(vorratTakt(l), 2)}</b>`,
  },
  {
    id: "regen",
    title: "Münzregen",
    icon: "⁂",
    color: "amber",
    max: 4,
    baseCost: 6000,
    growth: 3.2,
    req: [["nachschub", 3]],
    desc: (l) =>
      `In festen Abständen regnet ein Schwall Kupfermünzen gratis auf die Plattform.<br><br>${
        l > 0 ? `Alle <b>${sec(regenTakt(l), 0)}</b> · <b>${regenMenge(l)}</b> Münzen` : "Noch aus"
      }`,
  },
  {
    id: "auto",
    title: "Auto-Einwurf",
    icon: "▼",
    color: "amber",
    max: 5,
    baseCost: 40,
    growth: 2.3,
    req: [["vorrat", 1]],
    desc: (l) =>
      `Der Automat wirft selbst Kupfermünzen aus dem Vorrat ein — nie gegen Geld.<br><br>${
        l > 0 ? `Eine Münze alle <b>${sec(autoTakt(l), 2)}</b>` : "Noch aus"
      }`,
  },
  {
    id: "autoziel",
    title: "Zielautomatik",
    icon: "⌖",
    color: "amber",
    max: 1,
    baseCost: 450,
    growth: 1,
    req: [["auto", 2]],
    desc: () =>
      `Liegt eine Truhe auf dem Feld, zielt der Auto-Einwurf meistens <b>genau hinter sie</b>.`,
  },
  {
    id: "zwilling",
    title: "Zwillingsschacht",
    icon: "⇊",
    color: "amber",
    max: 4,
    baseCost: 2500,
    growth: 3,
    req: [["autoziel", 1]],
    desc: (l) =>
      `Jeder automatische Einwurf wirft mit dieser Chance eine <b>zweite Münze</b> aus dem Vorrat hinterher.<br><br>Chance: <b>${pct(autoZweite(l))}</b>`,
  },

  /* ================================================= Schieber =========== */
  {
    id: "tempo",
    title: "Schiebertempo",
    icon: "»",
    color: "teal",
    max: 5,
    baseCost: 15,
    growth: 2.0,
    req: [["automat", 1]],
    desc: (l) => `Der Schieber fährt schneller.<br><br>Tempo: <b>${mal(tempo(l))}</b>`,
  },
  {
    id: "hub",
    title: "Schubtiefe",
    icon: "↧",
    color: "teal",
    max: 5,
    baseCost: 25,
    growth: 2.1,
    req: [["tempo", 1]],
    desc: (l) => `Der Schieber fährt weiter vor.<br><br>Hub: <b>${hub(l)}</b>`,
  },
  {
    id: "krit",
    title: "Kritischer Schub",
    icon: "⚡",
    color: "teal",
    max: 4,
    baseCost: 400,
    growth: 3,
    req: [["hub", 2]],
    desc: (l) =>
      `Jeder Hub hat diese Chance, <b>60 % weiter</b> vorzufahren.<br><br>Chance: <b>${pct(kritChance(l))}</b>`,
  },
  {
    id: "langarm",
    title: "Langer Arm",
    icon: "⟹",
    color: "teal",
    max: 1,
    baseCost: 120000,
    growth: 1,
    capstone: true,
    req: [["krit", 4]],
    desc: () => `Ein kritischer Schub fährt nicht mehr 60 %, sondern <b>120 %</b> weiter vor.`,
  },
  {
    id: "stampf",
    title: "Stampfer",
    icon: "⇓",
    color: "teal",
    max: 4,
    baseCost: 1500,
    growth: 3,
    req: [["tempo", 3]],
    desc: (l) =>
      `Die Plattform bebt in festen Abständen kurz nach vorn. Was an der Kante wackelt, fällt.<br><br>${
        l > 0 ? `Alle <b>${sec(stampfTakt(l))}</b> · Stoß <b>${stampfKraft(l)}</b>` : "Noch aus"
      }`,
  },

  /* ================================================= Auszahlung ========= */
  {
    id: "praegung",
    title: "Prägung",
    icon: "◆",
    color: "pink",
    max: 6,
    baseCost: 30,
    growth: 2.2,
    req: [["automat", 1]],
    desc: (l) => `Jede Münze ist beim Fallen mehr wert.<br><br>Wert: <b>${mal(praegung(l))}</b>`,
  },
  {
    id: "schutz",
    title: "Seitenschutz",
    icon: "▥",
    color: "pink",
    max: 5,
    baseCost: 50,
    growth: 2.3,
    req: [["praegung", 1]],
    desc: (l) => `Die seitlichen Abgründe werden schmaler.<br><br>Breite je Abgrund: <b>${pct(abgrund(l), 1)}</b>`,
  },
  {
    id: "doppelfach",
    title: "Breites Doppelfach",
    icon: "×2",
    color: "pink",
    max: 4,
    baseCost: 140,
    growth: 2.4,
    req: [["schutz", 1]],
    desc: (l) => `Das Doppelfach wird breiter.<br><br>Breite: <b>${pct(doppelBreite(l), 1)}</b>`,
  },
  {
    id: "auffang",
    title: "Auffangnetz",
    icon: "⊻",
    color: "pink",
    max: 3,
    baseCost: 800,
    growth: 3.2,
    req: [["schutz", 2]],
    desc: (l) =>
      `Münzen, die in einen Abgrund fallen, zahlen noch einen Teil ihres Werts aus.<br><br>Anteil: <b>${pct(auffang(l))}</b>`,
  },
  {
    id: "fenster",
    title: "Kaskadenfenster",
    icon: "⧗",
    color: "pink",
    max: 4,
    baseCost: 80,
    growth: 2.3,
    req: [["praegung", 1]],
    desc: (l) =>
      `Eine Combo bleibt länger offen — mehr Münzen zählen als „gemeinsam gefallen“.<br><br>Fenster: <b>${sec(comboFenster(l), 2)}</b>`,
  },
  {
    id: "kaskade",
    title: "Kaskadenbonus",
    icon: "≋",
    color: "pink",
    max: 5,
    baseCost: 900,
    growth: 3,
    req: [["fenster", 2]],
    desc: (l) =>
      `Jede Combo ab ×2 wird zusätzlich verstärkt.<br><br>Combo-Multiplikator: <b>${mal(1 + comboBonus(l))}</b>`,
  },
  {
    id: "goldkante",
    title: "Goldene Kante",
    icon: "×3",
    color: "pink",
    max: 1,
    baseCost: 200000,
    growth: 1,
    capstone: true,
    req: [["kaskade", 5]],
    desc: () => `Das Doppelfach zahlt nicht mehr das Doppelte, sondern das <b>Dreifache</b>.`,
  },

  /* ================================================= Truhe ============== */
  {
    id: "truhenwert",
    title: "Schatzkunde",
    icon: "▤",
    color: "magenta",
    max: 5,
    baseCost: 100,
    growth: 2.3,
    req: [["automat", 1]],
    desc: (l) => `Schatztruhen sind mehr wert.<br><br>Truhenwert: <b>${mal(truheWert(l))}</b>`,
  },
  {
    id: "lieferung",
    title: "Expresslieferung",
    icon: "⇣",
    color: "magenta",
    max: 4,
    baseCost: 160,
    growth: 2.2,
    req: [["truhenwert", 1]],
    desc: (l) => `Nach einer Truhe kommt die nächste schneller.<br><br>Pause: <b>${sec(truhePause(l))}</b>`,
  },
  {
    id: "fuellung",
    title: "Prall gefüllt",
    icon: "⁘",
    color: "magenta",
    max: 4,
    baseCost: 260,
    growth: 2.4,
    req: [["truhenwert", 2]],
    desc: (l) => `Eine geborgene Truhe lässt mehr Münzen regnen.<br><br>Münzen: <b>${truheRegen(l)}</b>`,
  },
  {
    id: "juwelen",
    title: "Juwelenfund",
    icon: "◈",
    color: "magenta",
    max: 3,
    baseCost: 20000,
    growth: 3.5,
    req: [["fuellung", 2]],
    desc: (l) =>
      `Jede Münze aus einer Truhe wird mit dieser Chance zu einer deiner freigeschalteten <b>Sondermünzen</b>.<br><br>Chance: <b>${pct(truheJuwel(l))}</b>`,
  },

  /* ================================================= Münzen ============= */
  {
    id: "silberschacht",
    title: "Silberschacht",
    icon: "◇",
    color: "amber",
    max: 2,
    baseCost: 35,
    growth: 3,
    req: [["automat", 1]],
    desc: (l) =>
      `Eine Silbermünze kostet weniger Plätze aus dem Vorrat.<br><br>Kosten: <b>${silberVorrat(l)}</b> aus dem Vorrat`,
  },
  {
    id: "feinsilber",
    title: "Feinsilber",
    icon: "✧",
    color: "amber",
    max: 4,
    baseCost: 90,
    growth: 2.3,
    req: [["silberschacht", 1]],
    desc: (l) => `Silbermünzen sind mehr wert.<br><br>Wert: <b>${mal(silberWert(l))}</b>`,
  },
  {
    id: "werkstatt",
    title: "Münzwerkstatt",
    icon: "⚒",
    color: "magenta",
    max: 1,
    baseCost: 120,
    growth: 1,
    req: [["silberschacht", 1]],
    desc: () =>
      `Öffnet die Werkstatt für <b>Sondermünzen</b>. Von hier aus schaltest du Gold-, Magnet- und Sprengmünzen frei — und über sie die übrigen.`,
  },
  {
    id: "praegerei",
    title: "Münzprägerei",
    icon: "%",
    color: "magenta",
    max: 4,
    baseCost: 5000,
    growth: 3.2,
    req: [["werkstatt", 1]],
    desc: (l) => `Alle Sondermünzen kosten beim Einwurf weniger Geld.<br><br>Preis: <b>${mal(praegerei(l))}</b>`,
  },
  ...SONDER.flatMap(sonderKnoten),
];

/*
 * TIEFE KOSTET
 *
 * Die Preise oben sind die Preise eines Knotens direkt am Stamm. Je tiefer
 * ein Knoten im Baum haengt, desto teurer wird er — um TIEFEN_FAKTOR je
 * Ebene ab der zweiten. Ohne das kaufte ein Bot (tools/balance-check.ts)
 * den halben Baum innerhalb von fuenf Minuten: jeder Ast vervielfacht das
 * Einkommen, und die tiefen Knoten kosteten kaum mehr als die flachen.
 */
const TIEFEN_FAKTOR = 1.9;

function tiefe(id: string, nach: Map<string, TreeNodeDef>): number {
  const d = nach.get(id);
  const eltern = d?.req?.[0]?.[0];
  return eltern ? 1 + tiefe(eltern, nach) : 0;
}

const NACH_ID = new Map(ROH.map((d) => [d.id, d]));

export const NODES: TreeNodeDef[] = ROH.map((d) => {
  const t = tiefe(d.id, NACH_ID);
  if (t < 2 || d.baseCost === 0) return d;
  return { ...d, baseCost: Math.round(d.baseCost * Math.pow(TIEFEN_FAKTOR, t - 1)) };
});

/* ============================================================== Stats === */

export interface CoinStats {
  frei: boolean;
  /** Multiplikator auf Grundwert — ohne die allgemeine Praegung. */
  wert: number;
  /** Effektstaerke, 1 = Grundwert. */
  kraft: number;
  /** Chance, dass eine Kupfermuenze zu dieser Sorte wird. */
  glueck: number;
  preis: number;
}

export interface Stats {
  vorratGroesse: number;
  vorratTakt: number;
  /** Sekunden je Auto-Einwurf, 0 = aus. */
  autoTakt: number;
  autoZiel: boolean;
  autoZweite: number;
  /** Sekunden je Muenzregen, 0 = aus. */
  regenTakt: number;
  regenMenge: number;

  tempo: number;
  hub: number;
  kritChance: number;
  kritFaktor: number;
  /** Sekunden je Stampfer, 0 = aus. */
  stampfTakt: number;
  stampfKraft: number;

  wertMult: number;
  abgrund: number;
  doppelBreite: number;
  doppelMult: number;
  auffang: number;
  comboFenster: number;
  comboBonus: number;

  truheWert: number;
  truhePause: number;
  truheRegen: number;
  truheJuwel: number;

  silberVorrat: number;
  coins: Record<CoinKind, CoinStats>;
}

export function deriveStats(lv: Levels): Stats {
  const L = (id: string) => lv[id] ?? 0;
  const rabatt = praegerei(L("praegerei"));

  const coins = {} as Record<CoinKind, CoinStats>;
  for (const kind of Object.keys(COINS) as CoinKind[]) {
    const sonder = SONDER.includes(kind);
    const kraft = sonder ? sonderKraft(L(`kraft_${kind}`)) : 1;
    coins[kind] = {
      frei: sonder ? L(`coin_${kind}`) > 0 : true,
      wert: kind === "silber" ? silberWert(L("feinsilber")) : kraft,
      kraft,
      glueck: sonder && L(`coin_${kind}`) > 0 ? sonderGlueck(L(`glueck_${kind}`)) : 0,
      preis: Math.max(1, Math.round(COINS[kind].preis * (sonder ? rabatt : 1))),
    };
  }

  return {
    vorratGroesse: vorratGroesse(L("vorrat")),
    vorratTakt: vorratTakt(L("nachschub")),
    autoTakt: autoTakt(L("auto")),
    autoZiel: L("autoziel") > 0,
    autoZweite: autoZweite(L("zwilling")),
    regenTakt: regenTakt(L("regen")),
    regenMenge: regenMenge(L("regen")),

    tempo: tempo(L("tempo")),
    hub: hub(L("hub")),
    kritChance: kritChance(L("krit")),
    kritFaktor: L("langarm") > 0 ? 2.2 : 1.6,
    stampfTakt: stampfTakt(L("stampf")),
    stampfKraft: stampfKraft(L("stampf")),

    wertMult: praegung(L("praegung")),
    abgrund: abgrund(L("schutz")),
    doppelBreite: doppelBreite(L("doppelfach")),
    doppelMult: L("goldkante") > 0 ? 3 : 2,
    auffang: auffang(L("auffang")),
    comboFenster: comboFenster(L("fenster")),
    comboBonus: comboBonus(L("kaskade")),

    truheWert: truheWert(L("truhenwert")),
    truhePause: truhePause(L("lieferung")),
    truheRegen: truheRegen(L("fuellung")),
    truheJuwel: truheJuwel(L("juwelen")),

    silberVorrat: silberVorrat(L("silberschacht")),
    coins,
  };
}
