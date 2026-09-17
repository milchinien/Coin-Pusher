/* Kopflos: ein einfacher Bot spielt den Automaten und kauft sich durch den Baum.

   Er wirft im Vorrats-Takt Kupfer ein, kauft immer den billigsten kaufbaren
   Knoten und wirft ab und zu die teuerste freigeschaltete Sondermuenze, wenn
   er sich das leisten kann. Das ist kein guter Spieler — es ist ein
   Messstab: Wann ist welcher Knoten gekauft, wie schnell waechst das Geld?

   Aufruf: TAKT=0.5 MINUTEN=30 node <gebundelt>                              */
import { COINS, SONDER, type CoinKind } from "../src/coins";
import { Machine, W } from "../src/machine";
import { costOf } from "../src/tree";
import { deriveStats, NODES, type Levels } from "../src/upgrades";

const MINUTEN = Number(process.env.MINUTEN ?? 30);
const TAKT = Number(process.env.TAKT ?? 0.6);

const levels: Levels = { automat: 1 };
let stats = deriveStats(levels);
let geld = 0;
let vorrat = 15;
let t = 0;
let vorratTimer = 0;
let autoTimer = 0;
let regenTimer = 0;
let truhen = 0;
let besteCombo = 1;
const kaeufe: string[] = [];

const m = new Machine(() => stats, {
  gewinn: (v) => (geld += v),
  comboEnde: (_n, mult, bonus) => {
    geld += bonus;
    besteCombo = Math.max(besteCombo, mult);
  },
  truhe: (e) => {
    if (e === "geborgen") truhen++;
  },
  lieferung: () => {},
});
m.befuellen();

const offen = (id: string) => {
  const d = NODES.find((n) => n.id === id)!;
  return (d.req ?? []).every(([r, l]) => (levels[r] ?? 0) >= l);
};

const glueck = (kind: CoinKind): CoinKind => {
  if (kind !== "kupfer") return kind;
  for (const k of SONDER) if (Math.random() < stats.coins[k].glueck) return k;
  return kind;
};

const dt = 1 / 30;
let naechster = 0;
const t0 = performance.now();
for (let i = 0; i < (MINUTEN * 60) / dt; i++) {
  t += dt;

  vorratTimer += dt;
  while (vorratTimer >= stats.vorratTakt && vorrat < stats.vorratGroesse) {
    vorratTimer -= stats.vorratTakt;
    vorrat++;
  }
  if (vorrat >= stats.vorratGroesse) vorratTimer = 0;

  if (t >= naechster) {
    naechster += TAKT;
    if (vorrat >= 1) {
      vorrat--;
      m.einwerfen(glueck("kupfer"), 30 + Math.random() * (W - 60));
    }
    // Die teuerste freigeschaltete Sondermuenze, wenn sie weniger als 5 % des Geldes kostet.
    const sonder = SONDER.filter((k) => stats.coins[k].frei).reverse()[0];
    if (sonder && stats.coins[sonder].preis < geld * 0.05) {
      geld -= stats.coins[sonder].preis;
      m.einwerfen(sonder, 30 + Math.random() * (W - 60));
    }
  }
  if (stats.autoTakt > 0) {
    autoTimer += dt;
    if (autoTimer >= stats.autoTakt) {
      autoTimer = 0;
      const n = Math.random() < stats.autoZweite ? 2 : 1;
      for (let j = 0; j < n && vorrat >= 1; j++) {
        vorrat--;
        m.einwerfen(glueck("kupfer"), m.autoZiel());
      }
    }
  }
  if (stats.regenTakt > 0) {
    regenTimer += dt;
    if (regenTimer >= stats.regenTakt) {
      regenTimer = 0;
      m.regnen(Array.from({ length: stats.regenMenge }, () => glueck("kupfer")));
    }
  }

  m.update(dt);

  // Einkaufen: billigster kaufbarer Knoten.
  for (;;) {
    const kand = NODES.filter((d) => (levels[d.id] ?? 0) < d.max && offen(d.id)).sort(
      (a, b) => costOf(a, levels[a.id] ?? 0) - costOf(b, levels[b.id] ?? 0)
    )[0];
    if (!kand) break;
    const k = costOf(kand, levels[kand.id] ?? 0);
    if (geld < k) break;
    geld -= k;
    levels[kand.id] = (levels[kand.id] ?? 0) + 1;
    stats = deriveStats(levels);
    if (kand.max === 1 || levels[kand.id] === kand.max) kaeufe.push(`${(t / 60).toFixed(1)}m ${kand.id}${kand.max > 1 ? " (max)" : ""}`);
  }

  if (i % Math.round(300 / dt) === 0 && i > 0) {
    const gekauft = NODES.reduce((a, d) => a + (levels[d.id] ?? 0), 0);
    const gesamt = NODES.reduce((a, d) => a + d.max, 0);
    console.log(
      `t=${(t / 60).toFixed(0)}m geld=${Math.round(geld)} stufen=${gekauft}/${gesamt} koerper=${m.world.bodies.length} truhen=${truhen} besteCombo=×${besteCombo.toFixed(1)}`
    );
  }
}
console.log("\nMeilensteine:\n  " + kaeufe.join("\n  "));
console.log(`\nRechenzeit ${((performance.now() - t0) / 1000).toFixed(1)} s`);
void COINS;
