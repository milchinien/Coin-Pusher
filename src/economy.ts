/* =========================================================================
   economy.ts — Ausgaenge, Combo, Truhe.

   Alles, was eine Zahl ist und keine Grafik. Kein DOM, kein Canvas — damit
   sich die Balance kopflos durchrechnen laesst. Was der Upgrade-Baum an
   diesen Zahlen dreht, steht in upgrades.ts.
   ========================================================================= */

/* ------------------------------------------------------------ Ausgaenge --- */

export type Zone = "abgrund" | "doppel" | "mitte";

export const ZONE_NAME: Record<Zone, string> = {
  abgrund: "Abgrund",
  doppel: "Doppelfach",
  mitte: "Auszahlung",
};

/**
 * Die Kante von links nach rechts: Abgrund | Doppelfach | Mitte | Abgrund.
 * Das Doppelfach liegt bewusst am Rand und neben einem Abgrund — wer auf
 * die Verdopplung zielt, riskiert den Verlust.
 *
 * `abgrund` und `doppel` sind Anteile der Kantenbreite.
 */
export function zonen(abgrund: number, doppel: number): Array<{ zone: Zone; von: number; bis: number }> {
  return [
    { zone: "abgrund", von: 0, bis: abgrund },
    { zone: "doppel", von: abgrund, bis: abgrund + doppel },
    { zone: "mitte", von: abgrund + doppel, bis: 1 - abgrund },
    { zone: "abgrund", von: 1 - abgrund, bis: 1 },
  ];
}

export function zoneBei(fx: number, abgrund: number, doppel: number): Zone {
  for (const z of zonen(abgrund, doppel)) if (fx < z.bis) return z.zone;
  return "abgrund";
}

/* ------------------------------------------------------------- Truhe --- */

/**
 * Grundwert der naechsten Truhe. Waechst mit jeder geborgenen — aber
 * polynomiell, nicht geometrisch. Mit 1.35^n war die hundertste Truhe
 * Billionen wert, und weil Truhen ohne jeden Kauf immer weiter kommen,
 * wuchs das Geld dann exponentiell mit der blossen Spielzeit.
 */
export function truhenWert(geborgen: number): number {
  return Math.round(50 * Math.pow(1 + geborgen, 1.35));
}

/* ------------------------------------------------------------- Combo --- */

export function comboMult(anzahl: number): number {
  if (anzahl >= 40) return 16;
  if (anzahl >= 20) return 8;
  if (anzahl >= 10) return 4;
  if (anzahl >= 5) return 2;
  return 1;
}
