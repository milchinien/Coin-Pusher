/* =========================================================================
   physics.ts — Scheiben auf einer Schiebeflaeche.

   Draufsicht, zwei Dimensionen. Die Flaeche reicht von x = 0 bis W und von
   der Rueckwand (y = 0) bis zur Kante (y = D). Der Schieber ist eine Wand,
   deren Vorderseite auf `face` steht und sich bewegt; er hat unendliche
   Masse und schiebt, was vor ihm liegt.

   POSITIONSBASIERT
   ----------------
   Ein Muenzschieber ist ein dicht gepackter, fast ruhender Haufen. Kraefte
   und Impulse ueber lange Kontaktketten zu reichen, braucht winzige Schritte
   und zittert trotzdem. Hier werden stattdessen Ueberlappungen direkt
   aufgeloest und die Geschwindigkeit hinterher aus dem Weg abgeleitet.

   Die Koerper werden je Schritt nach y sortiert und in dieser Reihenfolge
   aufgeloest — vom Schieber zur Kante. So wandert ein Stoss in EINER
   Iteration durch die ganze Kette, statt eine Iteration je Muenze zu
   brauchen.

   Reibung ist schlicht eine starke Daempfung: Muenzen gleiten kaum nach.
   Schwere Koerper (Truhe, Riesenmuenze) daempfen staerker und weichen bei
   Kontakt weniger aus — sie muessen mehrfach angeschoben werden.

   ZWEI SONDERKRAEFTE
   ------------------
   Klebeverbindungen sind Abstandsbedingungen zwischen zwei Koerpern, die in
   denselben Iterationen aufgeloest werden wie die Ueberlappungen. Sie
   laufen nach einer Weile ab.
   Magnetfelder ziehen Nachbarn ueber die Geschwindigkeit heran, nicht ueber
   die Position — sonst klebten sie so hart wie der Kleber.
   ========================================================================= */

import { COINS, type CoinKind } from "./coins";

export type BodyKind = CoinKind | "truhe";

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  invMass: number;
  /** Daempfung je Sekunde. */
  drag: number;
  /** Vorheriger Ort, fuer die Geschwindigkeit nach der Aufloesung. */
  px: number;
  py: number;
  /** Platz in der y-Sortierung dieses Schritts. */
  o: number;
  /** Ueber die Kante gefallen oder entfernt. Verbindungen darauf gelten nicht mehr. */
  weg: boolean;
}

export interface Link {
  a: Body;
  b: Body;
  d: number;
  /** Restlaufzeit in Sekunden. */
  t: number;
}

export interface BodySpec {
  r: number;
  mass: number;
  drag: number;
}

export function specOf(kind: BodyKind): BodySpec {
  if (kind === "truhe") return { r: 30, mass: 14, drag: 22 };
  const c = COINS[kind];
  return { r: c.r, mass: c.masse, drag: c.drag };
}

const ITERATIONEN = 6;
const MAX_TEMPO = 340;
const ZELLE = 60;

export class World {
  bodies: Body[] = [];
  links: Link[] = [];
  private nextId = 1;
  private grid = new Map<number, Body[]>();

  /** Reichweite und Zugkraft der Magnetmuenzen. Setzt machine.ts aus dem Baum. */
  magnetRadius = 80;
  magnetZug = 260;

  constructor(
    readonly W: number,
    readonly D: number
  ) {}

  add(kind: BodyKind, x: number, y: number, vx = 0, vy = 0): Body {
    const s = specOf(kind);
    const b: Body = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx,
      vy,
      r: s.r,
      invMass: 1 / s.mass,
      drag: s.drag,
      px: x,
      py: y,
      o: 0,
      weg: false,
    };
    this.bodies.push(b);
    return b;
  }

  link(a: Body, b: Body, dauer: number): void {
    this.links.push({ a, b, d: Math.hypot(b.x - a.x, b.y - a.y), t: dauer });
  }

  /** Alle Nachbarn innerhalb von `radius` um einen Punkt, ohne `ohne`. */
  nachbarn(x: number, y: number, radius: number, ohne?: Body): Body[] {
    const out: Body[] = [];
    for (const b of this.bodies) {
      if (b === ohne) continue;
      if (Math.hypot(b.x - x, b.y - y) < radius + b.r) out.push(b);
    }
    return out;
  }

  /**
   * Stoss nach aussen, etwa beim Aufprall einer Muenze. Leichte Koerper
   * fliegen weiter als schwere.
   */
  impulse(x: number, y: number, radius: number, strength: number): void {
    for (const b of this.bodies) {
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d >= radius || d < 0.001) continue;
      const k = (1 - d / radius) * strength * Math.min(1, b.invMass * 1.2);
      b.vx += (dx / d) * k;
      b.vy += (dy / d) * k;
    }
  }

  /**
   * Ein Schritt. `face` ist die Vorderkante des Schiebers. Gibt die Koerper
   * zurueck, die ueber die Kante gekippt sind — sie sind danach entfernt.
   */
  step(dt: number, face: number): Body[] {
    const { W } = this;

    this.magnetfelder(dt);

    for (const b of this.bodies) {
      const damp = Math.exp(-b.drag * dt);
      b.vx *= damp;
      b.vy *= damp;
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    this.bodies.sort((a, b) => a.y - b.y);
    for (let i = 0; i < this.bodies.length; i++) this.bodies[i].o = i;
    this.buildGrid();

    for (let it = 0; it < ITERATIONEN; it++) {
      for (const a of this.bodies) {
        // Schieber und Seitenwaende sind unbeweglich.
        if (a.y - a.r < face) a.y = face + a.r;
        if (a.x < a.r) a.x = a.r;
        else if (a.x > W - a.r) a.x = W - a.r;

        const cx = Math.floor(a.x / ZELLE);
        const cy = Math.floor(a.y / ZELLE);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const cell = this.grid.get(key(gx, gy));
            if (!cell) continue;
            for (const b of cell) {
              // Jedes Paar einmal, und zwar vom Schieber her gesehen.
              if (b.o <= a.o) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const min = a.r + b.r;
              const d2 = dx * dx + dy * dy;
              if (d2 >= min * min) continue;
              let d = Math.sqrt(d2);
              let nx: number;
              let ny: number;
              if (d < 0.0001) {
                // Genau aufeinander: in eine zufaellige Richtung trennen.
                const w = Math.random() * Math.PI * 2;
                nx = Math.cos(w);
                ny = Math.sin(w);
                d = 0;
              } else {
                nx = dx / d;
                ny = dy / d;
              }
              const corr = min - d;
              const sum = a.invMass + b.invMass;
              const wa = a.invMass / sum;
              const wb = b.invMass / sum;
              a.x -= nx * corr * wa;
              a.y -= ny * corr * wa;
              b.x += nx * corr * wb;
              b.y += ny * corr * wb;
            }
          }
        }
      }
      this.verbindungen();
    }

    const fallen: Body[] = [];
    const inv = 1 / dt;
    for (const b of this.bodies) {
      // Letzte Klammer: Nach der Kette darf nichts im Schieber stecken.
      if (b.y - b.r < face) b.y = face + b.r;
      b.vx = clampAbs((b.x - b.px) * inv, MAX_TEMPO);
      b.vy = clampAbs((b.y - b.py) * inv, MAX_TEMPO);
      // Gekippt ist, wessen Mitte ueber der Kante steht.
      if (b.y > this.D) {
        b.weg = true;
        fallen.push(b);
      }
    }
    if (fallen.length) this.bodies = this.bodies.filter((b) => !b.weg);

    for (const l of this.links) l.t -= dt;
    this.links = this.links.filter((l) => l.t > 0 && !l.a.weg && !l.b.weg);
    return fallen;
  }

  /** Entfernt einen Koerper ausserhalb eines Schritts. */
  entferne(b: Body): void {
    b.weg = true;
    this.bodies = this.bodies.filter((x) => x !== b);
    this.links = this.links.filter((l) => l.a !== b && l.b !== b);
  }

  private verbindungen(): void {
    for (const l of this.links) {
      const { a, b } = l;
      if (a.weg || b.weg) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      // Nur halb nachgeben: eine Platte darf sich ein wenig verwinden, sonst
      // zittert sie gegen die Ueberlappungen an.
      const diff = ((d - l.d) / d) * 0.5;
      const sum = a.invMass + b.invMass;
      const wa = a.invMass / sum;
      const wb = b.invMass / sum;
      a.x += dx * diff * wa;
      a.y += dy * diff * wa;
      b.x -= dx * diff * wb;
      b.y -= dy * diff * wb;
    }
  }

  private magnetfelder(dt: number): void {
    const R = this.magnetRadius;
    for (const m of this.bodies) {
      if (m.kind !== "magnet") continue;
      for (const b of this.bodies) {
        if (b === m || b.kind === "truhe") continue;
        const dx = m.x - b.x;
        const dy = m.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d >= R || d < m.r + b.r) continue;
        const k = this.magnetZug * (1 - d / R) * dt;
        b.vx += (dx / d) * k;
        b.vy += (dy / d) * k;
      }
    }
  }

  private buildGrid(): void {
    this.grid.clear();
    for (const b of this.bodies) {
      const k = key(Math.floor(b.x / ZELLE), Math.floor(b.y / ZELLE));
      let cell = this.grid.get(k);
      if (!cell) {
        cell = [];
        this.grid.set(k, cell);
      }
      cell.push(b);
    }
  }
}

const key = (x: number, y: number): number => (x + 64) * 4096 + (y + 64);
const clampAbs = (v: number, m: number): number => (v > m ? m : v < -m ? -m : v);
