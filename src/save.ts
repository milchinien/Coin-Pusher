/* =========================================================================
   save.ts — Spielstand.

   Gespeichert wird auch die Lage jeder Muenze auf der Flaeche. Ein
   Muenzschieber lebt davon, dass die Truhe beim Zurueckkommen noch genau
   dort an der Kante haengt, wo man sie verlassen hat.

   Das Aussehen steht NICHT hier, sondern in skin.ts — wer den Spielstand
   loescht, will sein Aussehen nicht neu einstellen.

   v1 -> v2: Die vier festen Upgrades sind dem Upgrade-Baum gewichen. Ein
   v1-Stand wird nicht umgerechnet; es war ein Prototyp mit einer Handvoll
   Kaeufen, und der neue Baum hat andere Stufen und Preise.
   ========================================================================= */

import { COINS, type CoinKind } from "./coins";
import type { MachineSave } from "./machine";
import type { Levels } from "./upgrades";

export const SAVE_KEY = "reliktenschieber.save.v2";

export interface SaveData {
  geld: number;
  vorrat: number;
  levels: Levels;
  muenze: CoinKind;
  stats: { eingeworfen: number; verdient: number; truhen: number; besteCombo: number };
  maschine: MachineSave | null;
}

export function neuerStand(): SaveData {
  return {
    geld: 0,
    vorrat: 15,
    // Der Startknoten gehoert einem von Anfang an.
    levels: { automat: 1 },
    muenze: "kupfer",
    stats: { eingeworfen: 0, verdient: 0, truhen: 0, besteCombo: 0 },
    maschine: null,
  };
}

export function laden(): SaveData {
  const stand = neuerStand();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return stand;
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (typeof d.geld === "number" && isFinite(d.geld)) stand.geld = d.geld;
    if (typeof d.vorrat === "number") stand.vorrat = d.vorrat;
    if (d.levels && typeof d.levels === "object") {
      for (const [k, v] of Object.entries(d.levels)) if (typeof v === "number") stand.levels[k] = v;
      stand.levels.automat = 1;
    }
    if (typeof d.muenze === "string" && d.muenze in COINS) stand.muenze = d.muenze as CoinKind;
    if (d.stats) stand.stats = { ...stand.stats, ...d.stats };
    if (d.maschine && Array.isArray(d.maschine.koerper)) stand.maschine = d.maschine;
  } catch {
    /* Kaputter oder gesperrter Speicher — dann eben ein frischer Automat. */
  }
  return stand;
}

export function speichern(d: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    /* Speicher gesperrt — der Stand gilt dann nur fuer diese Sitzung. */
  }
}

export function loeschen(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* egal */
  }
}
