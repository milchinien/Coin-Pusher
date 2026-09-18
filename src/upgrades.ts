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

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const sec = (v: number, d = 1) => `${v.toFixed(d)}s`;
const mal = (v: number) => `×${v.toFixed(2)}`;

/* ============================================================== Knoten === */

/** Was die Kraft-Stufen je Sondermuenze bewirken, als Text. */
const KRAFT_TEXT: Record<CoinKind, { titel: string; icon: string; text: string }> = {
  kupfer: { titel: "", icon: "", text: "" },
  silber: { titel: "", icon: "", text: "" },
  gold: { titel: "Impact", icon: "✸", text: "Bigger impact radius — it sweeps more coins aside." },
  riese: { titel: "Battering Ram", icon: "⬤", text: "Its impact shoves the pile even further forward." },
  magnet: { titel: "Field Strength", icon: "◎", text: "Wider reach and a stronger pull for the magnetic field." },
  spreng: { titel: "Blast Power", icon: "✹", text: "Bigger radius and a harder kick for the blast at the edge." },
  klebe: { titel: "Grip", icon: "⬢", text: "Glues more neighbors together and holds longer." },
  geist: { titel: "Phasing", icon: "◌", text: "Reappears even closer to the edge." },
  koenig: { titel: "Coronation", icon: "♛", text: "A stronger multiplier on the shared cascade." },
  chaos: { titel: "Disorder", icon: "✺", text: "The random effect hits harder." },
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
        `${c.kurz}<br><br>Adds the <b>${c.name}</b> to your coin bar.<br>Value <b>${c.wert}</b> · Cost per drop <b>${c.preis}</b>`,
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
        `${k.text} It's also worth more.<br><br>Power and value: <b>${mal(sonderKraft(l))}</b>`,
    },
    {
      id: `glueck_${kind}`,
      title: `${c.name.replace(/ Coin$/, "")} Luck`,
      icon: "✦",
      color: u.farbe,
      max: 4,
      baseCost: Math.round(u.kosten * 1.5),
      growth: 3.2,
      req: [[`coin_${kind}`, 1]],
      desc: (l) =>
        `Every <b>Copper</b> coin — even from Auto-Drop — has this chance to turn into a ${c.name} for free.<br><br>Chance: <b>${pct(sonderGlueck(l))}</b>`,
    },
  ];
}

const ROH: TreeNodeDef[] = [
  /* ================================================= Start ============= */
  {
    id: "automat",
    title: "The Machine",
    icon: "▣",
    color: "teal",
    max: 1,
    baseCost: 0,
    growth: 1,
    desc: () =>
      `Your coin pusher. Drop coins, shove the pile over the edge and buy every upgrade from here.<br><br><b>Every branch starts here.</b>`,
  },

  /* ================================================= Einwurf ============ */
  {
    id: "vorrat",
    title: "Coin Supply",
    icon: "≡",
    color: "amber",
    max: 5,
    baseCost: 12,
    growth: 2.0,
    req: [["automat", 1]],
    desc: (l) => `More room in your coin supply.<br><br>Capacity: <b>${vorratGroesse(l)}</b>`,
  },
  {
    id: "nachschub",
    title: "Refill",
    icon: "↻",
    color: "amber",
    max: 5,
    baseCost: 20,
    growth: 2.1,
    req: [["vorrat", 1]],
    desc: (l) => `Your supply refills faster.<br><br>One coin every <b>${sec(vorratTakt(l), 2)}</b>`,
  },
  {
    id: "regen",
    title: "Coin Shower",
    icon: "⁂",
    color: "amber",
    max: 4,
    baseCost: 6000,
    growth: 3.2,
    req: [["nachschub", 3]],
    desc: (l) =>
      `Every so often, a burst of free Copper coins rains onto the board.<br><br>${
        l > 0 ? `Every <b>${sec(regenTakt(l), 0)}</b> · <b>${regenMenge(l)}</b> coins` : "Not active yet"
      }`,
  },
  {
    id: "auto",
    title: "Auto-Drop",
    icon: "▼",
    color: "amber",
    max: 5,
    baseCost: 40,
    growth: 2.3,
    req: [["vorrat", 1]],
    desc: (l) =>
      `The machine drops Copper coins from your supply by itself — never for cash.<br><br>${
        l > 0 ? `One coin every <b>${sec(autoTakt(l), 2)}</b>` : "Not active yet"
      }`,
  },
  {
    id: "autoziel",
    title: "Auto-Aim",
    icon: "⌖",
    color: "amber",
    max: 1,
    baseCost: 450,
    growth: 1,
    req: [["auto", 2]],
    desc: () =>
      `When a chest is on the board, Auto-Drop usually aims <b>right behind it</b>.`,
  },
  {
    id: "zwilling",
    title: "Twin Chute",
    icon: "⇊",
    color: "amber",
    max: 4,
    baseCost: 2500,
    growth: 3,
    req: [["autoziel", 1]],
    desc: (l) =>
      `Each Auto-Drop has this chance to send a <b>second coin</b> from your supply right after it.<br><br>Chance: <b>${pct(autoZweite(l))}</b>`,
  },

  /* ================================================= Schieber =========== */
  {
    id: "tempo",
    title: "Pusher Speed",
    icon: "»",
    color: "teal",
    max: 5,
    baseCost: 15,
    growth: 2.0,
    req: [["automat", 1]],
    desc: (l) => `The pusher moves faster.<br><br>Speed: <b>${mal(tempo(l))}</b>`,
  },
  {
    id: "hub",
    title: "Push Reach",
    icon: "↧",
    color: "teal",
    max: 5,
    baseCost: 25,
    growth: 2.1,
    req: [["tempo", 1]],
    desc: (l) => `The pusher reaches further forward.<br><br>Stroke: <b>${hub(l)}</b>`,
  },
  {
    id: "krit",
    title: "Critical Push",
    icon: "⚡",
    color: "teal",
    max: 4,
    baseCost: 400,
    growth: 3,
    req: [["hub", 2]],
    desc: (l) =>
      `Each stroke has this chance to reach <b>60% further</b>.<br><br>Chance: <b>${pct(kritChance(l))}</b>`,
  },
  {
    id: "langarm",
    title: "Long Arm",
    icon: "⟹",
    color: "teal",
    max: 1,
    baseCost: 120000,
    growth: 1,
    capstone: true,
    req: [["krit", 4]],
    desc: () => `A Critical Push now reaches <b>120%</b> further instead of 60%.`,
  },
  {
    id: "stampf",
    title: "Stomper",
    icon: "⇓",
    color: "teal",
    max: 4,
    baseCost: 1500,
    growth: 3,
    req: [["tempo", 3]],
    desc: (l) =>
      `Every so often, the board jolts forward. Anything teetering on the edge falls.<br><br>${
        l > 0 ? `Every <b>${sec(stampfTakt(l))}</b> · Force <b>${stampfKraft(l)}</b>` : "Not active yet"
      }`,
  },

  /* ================================================= Auszahlung ========= */
  {
    id: "praegung",
    title: "Minting",
    icon: "◆",
    color: "pink",
    max: 6,
    baseCost: 30,
    growth: 2.2,
    req: [["automat", 1]],
    desc: (l) => `Every coin is worth more when it falls.<br><br>Value: <b>${mal(praegung(l))}</b>`,
  },
  {
    id: "schutz",
    title: "Side Guards",
    icon: "▥",
    color: "pink",
    max: 5,
    baseCost: 50,
    growth: 2.3,
    req: [["praegung", 1]],
    desc: (l) => `The side gutters get narrower.<br><br>Width per gutter: <b>${pct(abgrund(l), 1)}</b>`,
  },
  {
    id: "doppelfach",
    title: "Wide Double Slot",
    icon: "×2",
    color: "pink",
    max: 4,
    baseCost: 140,
    growth: 2.4,
    req: [["schutz", 1]],
    desc: (l) => `The Double Slot gets wider.<br><br>Width: <b>${pct(doppelBreite(l), 1)}</b>`,
  },
  {
    id: "auffang",
    title: "Safety Net",
    icon: "⊻",
    color: "pink",
    max: 3,
    baseCost: 800,
    growth: 3.2,
    req: [["schutz", 2]],
    desc: (l) =>
      `Coins that fall into a gutter still pay out part of their value.<br><br>Share: <b>${pct(auffang(l))}</b>`,
  },
  {
    id: "fenster",
    title: "Cascade Window",
    icon: "⧗",
    color: "pink",
    max: 4,
    baseCost: 80,
    growth: 2.3,
    req: [["praegung", 1]],
    desc: (l) =>
      `A combo stays open longer — more coins count as “falling together.”<br><br>Window: <b>${sec(comboFenster(l), 2)}</b>`,
  },
  {
    id: "kaskade",
    title: "Cascade Bonus",
    icon: "≋",
    color: "pink",
    max: 5,
    baseCost: 900,
    growth: 3,
    req: [["fenster", 2]],
    desc: (l) =>
      `Every combo of ×2 or more gets an extra boost.<br><br>Combo multiplier: <b>${mal(1 + comboBonus(l))}</b>`,
  },
  {
    id: "goldkante",
    title: "Golden Edge",
    icon: "×3",
    color: "pink",
    max: 1,
    baseCost: 200000,
    growth: 1,
    capstone: true,
    req: [["kaskade", 5]],
    desc: () => `The Double Slot now pays <b>triple</b> instead of double.`,
  },

  /* ================================================= Truhe ============== */
  {
    id: "truhenwert",
    title: "Treasure Lore",
    icon: "▤",
    color: "magenta",
    max: 5,
    baseCost: 100,
    growth: 2.3,
    req: [["automat", 1]],
    desc: (l) => `Treasure chests are worth more.<br><br>Chest value: <b>${mal(truheWert(l))}</b>`,
  },
  {
    id: "lieferung",
    title: "Express Delivery",
    icon: "⇣",
    color: "magenta",
    max: 4,
    baseCost: 160,
    growth: 2.2,
    req: [["truhenwert", 1]],
    desc: (l) => `After a chest, the next one arrives sooner.<br><br>Delay: <b>${sec(truhePause(l))}</b>`,
  },
  {
    id: "fuellung",
    title: "Packed Chests",
    icon: "⁘",
    color: "magenta",
    max: 4,
    baseCost: 260,
    growth: 2.4,
    req: [["truhenwert", 2]],
    desc: (l) => `A cashed-in chest rains down more coins.<br><br>Coins: <b>${truheRegen(l)}</b>`,
  },
  {
    id: "juwelen",
    title: "Jewel Find",
    icon: "◈",
    color: "magenta",
    max: 3,
    baseCost: 20000,
    growth: 3.5,
    req: [["fuellung", 2]],
    desc: (l) =>
      `Each coin from a chest has this chance to become one of your unlocked <b>special coins</b>.<br><br>Chance: <b>${pct(truheJuwel(l))}</b>`,
  },

  /* ================================================= Münzen ============= */
  {
    id: "silberschacht",
    title: "Silver Chute",
    icon: "◇",
    color: "amber",
    max: 2,
    baseCost: 35,
    growth: 3,
    req: [["automat", 1]],
    desc: (l) =>
      `A Silver coin takes fewer coins from your supply.<br><br>Cost: <b>${silberVorrat(l)}</b> from supply`,
  },
  {
    id: "feinsilber",
    title: "Fine Silver",
    icon: "✧",
    color: "amber",
    max: 4,
    baseCost: 90,
    growth: 2.3,
    req: [["silberschacht", 1]],
    desc: (l) => `Silver coins are worth more.<br><br>Value: <b>${mal(silberWert(l))}</b>`,
  },
  {
    id: "werkstatt",
    title: "Coin Workshop",
    icon: "⚒",
    color: "magenta",
    max: 1,
    baseCost: 120,
    growth: 1,
    req: [["silberschacht", 1]],
    desc: () =>
      `Opens the workshop for <b>special coins</b>. From here you unlock Gold, Magnet and Bomb Coins — and through them, all the rest.`,
  },
  {
    id: "praegerei",
    title: "Coin Mint",
    icon: "%",
    color: "magenta",
    max: 4,
    baseCost: 5000,
    growth: 3.2,
    req: [["werkstatt", 1]],
    desc: (l) => `All special coins cost less cash to drop.<br><br>Price: <b>${mal(praegerei(l))}</b>`,
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
