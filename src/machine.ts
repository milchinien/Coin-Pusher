/* =========================================================================
   machine.ts — Der Automat: Schieber, Einwurf, Kante, Ausgaenge, Truhe,
   und was die Sondermuenzen dabei anrichten.

   WELTKOORDINATEN
   ---------------
   Die Schiebeflaeche liegt bei x = 0..W und y = 0..D. Oben (y < 0) sitzt
   die Einwurfschiene, unten (y > D) die Auffangschale mit den Faechern.
   Alles wird in diesen Einheiten gerechnet und erst beim Zeichnen auf den
   Bildschirm skaliert.

   DER SPANNUNGSBOGEN
   ------------------
   Es soll immer ein begehrenswertes Objekt geben, das sich der Kante
   naehert. Liegt keine Truhe auf dem Feld, kommt nach der Lieferpause eine
   neue. Je naeher sie der Kante ist, desto deutlicher zeigt das Bild,
   WOHIN sie fallen wuerde — Doppelfach, Auszahlung oder Abgrund.

   SONDERMUENZEN
   -------------
   Beim Aufprall:  Gold, Riese (grosser Stoss), Klebe (verbindet Nachbarn),
                   Geist (landet weit vorn statt hinten).
   Auf dem Feld:   Magnet (zieht Nachbarn an, siehe physics.ts).
   Beim Fallen:    Spreng (stoesst die Nachbarschaft ueber die Kante),
                   Koenig (multipliziert die laufende Combo).
   Beim Einwurf:   Chaos wird zu einer zufaelligen anderen Sondermuenze.
   Wie stark, kommt aus `Stats.coins[kind].kraft`.
   ========================================================================= */

import { COINS, SONDER, zeichneMuenze, type CoinKind } from "./coins";
import type { FreiRect } from "./decor";
import { comboMult, truhenWert, zoneBei, zonen, type Zone } from "./economy";
import { World, type Body, type BodyKind } from "./physics";
import {
  C,
  clamp,
  easeOutCubic,
  extrudedCircle,
  extrudedRect,
  fmt,
  lerp,
  longShadowRect,
  mix,
  rgba,
  roundRectPath,
  sh,
  shade,
  SIGNAL,
} from "./theme";
import type { Stats } from "./upgrades";

/* ------------------------------------------------------------- Masse --- */

export const W = 440;
export const D = 520;
/** Tiefe der Einwurfschiene ueber der Flaeche. */
const RAIL = 62;
/** Tiefe der Auffangschale unter der Kante. */
const TRAY = 92;
/** Seitenwand des Gehaeuses. */
const RAND = 28;
const GEHAEUSE_OBEN = -RAIL - 16;
const GEHAEUSE_UNTEN = D + TRAY + 18;
/** Platz unter dem Gehaeuse fuer die Combo-Anzeige. */
const COMBO_PLATZ = 64;

/** Vorderkante des Schiebers in voller Ruhestellung. */
const SCHIEBER_BASIS = 70;
const SCHIEBER_HOEHE = 11;

/** Hoechster Zusatzfaktor, den Koenigsmuenzen einer Combo geben koennen. */
const KOENIG_DECKEL = 3;

/** So viele kleine Wertanzeigen duerfen gleichzeitig stehen. */
const MAX_KLEINE_POPS = 8;

/** Physiktakt. */
const H = 1 / 120;

/** Wieviel der Bildschirmbreite links und rechts fuer die Panels frei bleibt. */
const FREI_LINKS = 290;
const FREI_RECHTS = 380;
const FREI_OBEN = 70;
const FREI_UNTEN = 16;

/* ------------------------------------------------------------ Zustand --- */

interface Flug {
  kind: BodyKind;
  x: number;
  vonY: number;
  nachY: number;
  t: number;
  dauer: number;
  /** War eine Chaosmuenze — beim Flug blitzt sie noch bunt. */
  chaos?: boolean;
}

interface Fall {
  kind: BodyKind;
  x: number;
  y: number;
  zone: Zone;
  t: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  farbe: string;
  gross: boolean;
  t: number;
}

interface Welle {
  x: number;
  y: number;
  r: number;
  farbe: string;
  t: number;
}

export interface MachineHooks {
  /** Sofort gutgeschrieben: der Rohwert eines gefallenen Objekts. */
  gewinn(wert: number): void;
  /** Eine Combo ist abgelaufen und hat einen Bonus ueber ×1 gebracht. */
  comboEnde(anzahl: number, mult: number, bonus: number): void;
  truhe(ergebnis: "geborgen" | "verloren", wert: number, zone: Zone): void;
  lieferung(): void;
}

export interface MachineSave {
  koerper: Array<[BodyKind, number, number]>;
  truhenGeborgen: number;
  truhenTimer: number;
}

export interface Layout {
  scale: number;
  ox: number;
  oy: number;
}

export class Machine {
  world = new World(W, D);
  private phase = 0;
  private hubIndex = 0;
  private krit = false;
  private face = SCHIEBER_BASIS;
  private akku = 0;
  private zeit = 0;
  private stampfTimer = 0;
  private beben = 0;

  private fluege: Flug[] = [];
  private faelle: Fall[] = [];
  private pops: Pop[] = [];
  private wellen: Welle[] = [];
  private regen: CoinKind[] = [];
  private regenTimer = 0;

  combo = { anzahl: 0, topf: 0, timer: 0, koenig: 0 };
  /** Nachleuchten der letzten grossen Combo, fuer die Anzeige. */
  private comboNach = { text: "", t: 0 };

  truhenGeborgen = 0;
  truhenTimer = 3;

  /** Zielposition auf der Schiene, Weltkoordinate. null = kein Zeiger. */
  aimX: number | null = null;

  constructor(
    private stats: () => Stats,
    private hooks: MachineHooks
  ) {}

  /* ----------------------------------------------------------- Start --- */

  /** Ein frischer Automat: eine gut gefuellte Flaeche und eine Truhe darauf. */
  befuellen(): void {
    this.world.bodies = [];
    this.world.links = [];
    const hub = this.stats().hub;
    const vorne = SCHIEBER_BASIS + hub + 20;
    for (let i = 0; i < 300; i++) {
      const kind: CoinKind = Math.random() < 0.08 ? "silber" : "kupfer";
      this.world.add(kind, 16 + Math.random() * (W - 32), vorne + Math.random() * (D - vorne));
    }
    this.world.add("truhe", W * 0.55, D * 0.66);
    // Vorab ein paar Huebe laufen lassen, bis der Haufen dicht liegt und an
    // der Kante steht. Ein lockerer Haufen wird erst verdichtet, bevor vorn
    // etwas faellt — die ersten Einwuerfe saehen dann wirkungslos aus.
    // Was dabei herunterfaellt, zaehlt nicht.
    let phase = 0;
    for (let i = 0; i < 120 * 10; i++) {
      phase += ((Math.PI * 2) / 3.4) * H;
      const face = i < 90 ? SCHIEBER_BASIS : SCHIEBER_BASIS + hub * (0.5 - 0.5 * Math.cos(phase));
      this.world.step(H, face);
    }
    if (!this.truheAufFeld) this.world.add("truhe", W * 0.5, D * 0.6);
    this.phase = phase;
    this.hubIndex = Math.floor(phase / (Math.PI * 2));
    for (const b of this.world.bodies) b.vx = b.vy = 0;
  }

  laden(s: MachineSave): void {
    this.world.bodies = [];
    this.world.links = [];
    for (const [kind, x, y] of s.koerper) {
      if (kind !== "truhe" && !(kind in COINS)) continue;
      this.world.add(kind, x, y);
    }
    this.truhenGeborgen = s.truhenGeborgen;
    this.truhenTimer = s.truhenTimer;
  }

  speichern(): MachineSave {
    const koerper: MachineSave["koerper"] = this.world.bodies.map((b) => [
      b.kind,
      Math.round(b.x * 10) / 10,
      Math.round(b.y * 10) / 10,
    ]);
    // Was gerade in der Luft ist, landet im Spielstand schon auf der Flaeche.
    for (const f of this.fluege) koerper.push([f.kind, f.x, f.nachY]);
    return { koerper, truhenGeborgen: this.truhenGeborgen, truhenTimer: this.truhenTimer };
  }

  /* --------------------------------------------------------- Einwurf --- */

  private hinterSchieber(): number {
    return SCHIEBER_BASIS + this.stats().hub;
  }

  /** Wirft eine Muenze an Position x ein. Chaos wird hier schon aufgeloest. */
  einwerfen(kind: CoinKind, x: number): void {
    let chaos = false;
    if (kind === "chaos") {
      chaos = true;
      const andere = SONDER.filter((k) => k !== "chaos");
      kind = andere[(Math.random() * andere.length) | 0];
    }
    const r = COINS[kind].r;
    const zx = clamp(x + (Math.random() - 0.5) * 10, r, W - r);

    let nachY = this.hinterSchieber() + 14 + Math.random() * 30;
    if (kind === "geist") {
      // Gleitet durch den Haufen: je mehr Kraft, desto naeher an der Kante.
      const k = this.kraft("geist", chaos);
      nachY = clamp(D - 170 / Math.sqrt(k) + Math.random() * 30, this.hinterSchieber() + 20, D - 40);
    }
    this.fluege.push({ kind, x: zx, vonY: -RAIL / 2, nachY, t: 0, dauer: 0.26 + nachY / 1400, chaos });
  }

  /** Mehrere Muenzen von oben auf die Flaeche, gestaffelt. */
  regnen(kinds: CoinKind[]): void {
    this.regen.push(...kinds);
    if (this.regenTimer <= 0) this.regenTimer = 0.05;
  }

  /** Eine Zielposition fuer den automatischen Einwurf. */
  autoZiel(): number {
    const t = this.truheAufFeld;
    if (t && this.stats().autoZiel && Math.random() < 0.75) {
      return clamp(t.x + (Math.random() - 0.5) * 70, 20, W - 20);
    }
    return 30 + Math.random() * (W - 60);
  }

  get truheAufFeld(): Body | undefined {
    return this.world.bodies.find((b) => b.kind === "truhe");
  }

  private get truheUnterwegs(): boolean {
    return this.fluege.some((f) => f.kind === "truhe");
  }

  /** Sekunden bis zur naechsten Lieferung, oder null, wenn eine Truhe im Spiel ist. */
  get naechsteTruhe(): number | null {
    return this.truheAufFeld || this.truheUnterwegs ? null : Math.max(0, this.truhenTimer);
  }

  /** Chaos traegt seine eigene Kraft zusaetzlich auf den geliehenen Effekt. */
  private kraft(kind: CoinKind, chaos = false): number {
    const s = this.stats().coins;
    return s[kind].kraft * (chaos ? s.chaos.kraft : 1);
  }

  /* ---------------------------------------------------------- Update --- */

  update(dt: number): void {
    const st = this.stats();
    this.zeit += dt;

    this.world.magnetRadius = 80 * Math.sqrt(st.coins.magnet.kraft);
    this.world.magnetZug = 260 * st.coins.magnet.kraft;

    this.akku += dt;
    let schritte = 0;
    while (this.akku >= H && schritte < 12) {
      this.akku -= H;
      schritte++;
      this.phase += ((Math.PI * 2) / 3.4) * st.tempo * H;
      // Ein neuer Hub beginnt immer in Ruhestellung — dort darf sich seine
      // Laenge aendern, ohne dass der Schieber springt.
      const index = Math.floor(this.phase / (Math.PI * 2));
      if (index !== this.hubIndex) {
        this.hubIndex = index;
        this.krit = Math.random() < st.kritChance;
      }
      const hub = st.hub * (this.krit ? st.kritFaktor : 1);
      this.face = SCHIEBER_BASIS + hub * (0.5 - 0.5 * Math.cos(this.phase));
      for (const b of this.world.step(H, this.face)) this.gefallen(b, st);
    }
    if (schritte === 12) this.akku = 0;

    // Stampfer.
    if (st.stampfTakt > 0) {
      this.stampfTimer += dt;
      if (this.stampfTimer >= st.stampfTakt) {
        this.stampfTimer = 0;
        this.beben = 0.28;
        for (const b of this.world.bodies) {
          b.vy += st.stampfKraft * (0.6 + Math.random() * 0.8) * Math.min(1, b.invMass * 2);
          b.vx += (Math.random() - 0.5) * st.stampfKraft * 0.5;
        }
      }
    }
    if (this.beben > 0) this.beben -= dt;

    // Einwuerfe in der Luft.
    for (const f of this.fluege) {
      f.t += dt;
      if (f.t >= f.dauer) this.landen(f);
    }
    this.fluege = this.fluege.filter((f) => f.t < f.dauer);

    // Schatzlieferung.
    if (!this.truheAufFeld && !this.truheUnterwegs) {
      this.truhenTimer -= dt;
      if (this.truhenTimer <= 0) {
        const nachY = this.hinterSchieber() + 110 + Math.random() * 70;
        this.fluege.push({
          kind: "truhe",
          x: W * (0.3 + Math.random() * 0.4),
          vonY: GEHAEUSE_OBEN - 520,
          nachY,
          t: 0,
          dauer: 0.85,
        });
        this.hooks.lieferung();
      }
    }

    // Muenzregen, aus einer Truhe oder aus dem Baum.
    if (this.regen.length) {
      this.regenTimer -= dt;
      while (this.regen.length && this.regenTimer <= 0) {
        const kind = this.regen.shift()!;
        this.regenTimer += 0.07;
        const x = 20 + Math.random() * (W - 40);
        const nachY = this.hinterSchieber() + 20 + Math.random() * 120;
        this.fluege.push({ kind, x, vonY: GEHAEUSE_OBEN - 200, nachY, t: 0, dauer: 0.5 });
      }
    }

    // Combo.
    if (this.combo.anzahl > 0) {
      this.combo.timer -= dt;
      if (this.combo.timer <= 0) this.comboSchliessen(st);
    }
    if (this.comboNach.t > 0) this.comboNach.t -= dt;

    for (const f of this.faelle) f.t += dt;
    this.faelle = this.faelle.filter((f) => f.t < 0.55);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < (p.gross ? 1.8 : 1));
    for (const w of this.wellen) w.t += dt;
    this.wellen = this.wellen.filter((w) => w.t < 0.5);
  }

  private landen(f: Flug): void {
    const body = this.world.add(f.kind, f.x, f.nachY, 0, 40);
    if (f.kind === "truhe") {
      this.world.impulse(f.x, f.nachY, 120, 190);
      return;
    }
    const kind = f.kind;
    const info = COINS[kind];
    const k = this.kraft(kind, f.chaos);

    switch (kind) {
      case "gold":
        this.world.impulse(f.x, f.nachY, 95 * Math.sqrt(k), info.stoss);
        this.welle(f.x, f.nachY, 95 * Math.sqrt(k), SIGNAL.doppel);
        break;
      case "riese":
        this.world.impulse(f.x, f.nachY, 150, info.stoss * k);
        this.welle(f.x, f.nachY, 150, info.top);
        break;
      case "klebe": {
        const n = Math.round(4 + 2 * k);
        const nah = this.world
          .nachbarn(f.x, f.nachY, info.r + 20, body)
          .filter((b) => b.kind !== "truhe")
          .slice(0, n);
        for (const b of nah) this.world.link(body, b, 14 * k);
        // Auch die Nachbarn untereinander, sonst ist es ein Stern und keine Platte.
        for (let i = 0; i + 1 < nah.length; i++) this.world.link(nah[i], nah[i + 1], 14 * k);
        this.welle(f.x, f.nachY, info.r + 20, info.top);
        break;
      }
      case "geist":
        this.world.impulse(f.x, f.nachY, 60, info.stoss * k);
        this.welle(f.x, f.nachY, 50, info.base);
        break;
      default:
        this.world.impulse(f.x, f.nachY, info.r * 4, info.stoss);
    }
  }

  private gefallen(b: Body, st: Stats): void {
    // Was an der Kante neben dem Gefallenen lag, verliert seinen Halt und
    // rutscht ein Stueck nach. So fallen Muenzen in Klumpen statt einzeln —
    // und erst Klumpen machen eine Combo.
    const zug = b.kind === "truhe" || b.kind === "riese" ? 90 : 38;
    for (const n of this.world.bodies) {
      if (n.y < D - 46 || Math.abs(n.x - b.x) > b.r + n.r + 8) continue;
      n.vy += zug * (0.6 + Math.random() * 0.5);
    }
    // Was an ihr klebte, wird mitgerissen.
    for (const l of this.world.links) {
      const partner = l.a === b ? l.b : l.b === b ? l.a : null;
      if (partner && !partner.weg) partner.vy += 150;
    }

    const zone = zoneBei(b.x / W, st.abgrund, st.doppelBreite);
    this.faelle.push({ kind: b.kind, x: b.x, y: b.y, zone, t: 0 });
    const popY = D + 6;
    const zoneMult = zone === "doppel" ? st.doppelMult : zone === "mitte" ? 1 : 0;

    if (b.kind === "truhe") {
      this.truhenTimer = st.truhePause;
      if (zone === "abgrund") {
        this.hooks.truhe("verloren", 0, zone);
        this.pop({ x: b.x, y: popY - 30, text: "Truhe verloren", farbe: SIGNAL.abgrund, gross: true });
        return;
      }
      const wert = Math.round(truhenWert(this.truhenGeborgen) * st.truheWert * zoneMult);
      this.truhenGeborgen++;
      const frei = SONDER.filter((k) => st.coins[k].frei);
      const regen: CoinKind[] = [];
      for (let i = 0; i < st.truheRegen; i++) {
        regen.push(frei.length && Math.random() < st.truheJuwel ? frei[(Math.random() * frei.length) | 0] : "kupfer");
      }
      this.regnen(regen);
      this.regenTimer = 0.35;
      this.hooks.gewinn(wert);
      this.hooks.truhe("geborgen", wert, zone);
      this.zaehle(wert, st);
      this.pop({ x: b.x, y: popY - 30, text: `+${fmt(wert)}`, farbe: SIGNAL.truheBand, gross: true });
      return;
    }

    const kind = b.kind;

    // Effekte beim Fallen gelten auch im Abgrund — die Explosion fragt nicht,
    // wo sie hinfaellt.
    if (kind === "spreng") {
      const k = st.coins.spreng.kraft;
      const R = 95 * Math.sqrt(k);
      for (const n of this.world.bodies) {
        const dx = n.x - b.x;
        const dy = n.y - D;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const s = (1 - d / R) * 300 * k * Math.min(1, n.invMass * 1.5);
        n.vy += s;
        n.vx += Math.sign(dx) * s * 0.35;
      }
      this.welle(b.x, D - 10, R, COINS.spreng.ring);
      this.pop({ x: b.x, y: popY - 40, text: "BUMM", farbe: COINS.spreng.ring, gross: true });
    }
    if (kind === "koenig" && zone !== "abgrund") {
      this.combo.koenig += st.coins.koenig.kraft;
      this.pop({ x: b.x, y: popY - 40, text: "♛", farbe: COINS.koenig.ring, gross: true });
    }

    const roh = COINS[kind].wert * st.coins[kind].wert * st.wertMult;
    if (zone === "abgrund") {
      if (st.auffang > 0) {
        const wert = roh * st.auffang;
        this.hooks.gewinn(wert);
        this.pop({ x: b.x, y: popY, text: `+${fmt(wert)}`, farbe: SIGNAL.abgrund, gross: false });
      } else {
        this.pop({ x: b.x, y: popY, text: "✕", farbe: SIGNAL.abgrund, gross: false });
      }
      return;
    }
    const wert = roh * zoneMult;
    this.hooks.gewinn(wert);
    this.zaehle(wert, st);
    this.pop({
      x: b.x,
      y: popY,
      text: `+${fmt(wert)}`,
      farbe: zone === "doppel" ? SIGNAL.doppel : kind === "kupfer" ? C.text : COINS[kind].top,
      gross: false,
    });
  }

  /**
   * Kleine Wertanzeigen werden gedeckelt. Bei einer Kaskade fallen dreissig
   * Muenzen in einer Sekunde; dreissig Zahlen uebereinander sind keine
   * Information mehr, sondern ein Fleck. Die grosse Combo-Zeile unter dem
   * Automaten erzaehlt dann die Geschichte.
   */
  private pop(p: Omit<Pop, "t">): void {
    if (!p.gross && this.pops.filter((q) => !q.gross).length >= MAX_KLEINE_POPS) return;
    this.pops.push({ ...p, t: 0 });
  }

  private zaehle(wert: number, st: Stats): void {
    this.combo.anzahl++;
    this.combo.topf += wert;
    this.combo.timer = st.comboFenster;
  }

  /** Aktueller Gesamtmultiplikator der laufenden Combo. */
  comboFaktor(st: Stats = this.stats()): number {
    const basis = comboMult(this.combo.anzahl);
    const bonus = basis > 1 ? 1 + st.comboBonus : 1;
    // Koenigsmuenzen addieren sich, aber gedeckelt: drei Kronen in einer
    // Kaskade waeren sonst ein Vielfaches des ganzen Baums wert.
    return basis * bonus * (1 + Math.min(KOENIG_DECKEL, this.combo.koenig));
  }

  private comboSchliessen(st: Stats): void {
    const mult = this.comboFaktor(st);
    if (mult > 1.001) {
      const bonus = this.combo.topf * (mult - 1);
      this.hooks.comboEnde(this.combo.anzahl, mult, bonus);
      this.comboNach = { text: `COMBO ×${fmtMult(mult)}  +${fmt(bonus)}`, t: 1.8 };
    }
    this.combo = { anzahl: 0, topf: 0, timer: 0, koenig: 0 };
  }

  private welle(x: number, y: number, r: number, farbe: string): void {
    this.wellen.push({ x, y, r, farbe, t: 0 });
  }

  /* ---------------------------------------------------------- Layout --- */

  layout(vw: number, vh: number): Layout {
    const weltB = W + RAND * 2;
    const weltH = GEHAEUSE_UNTEN - GEHAEUSE_OBEN + COMBO_PLATZ;
    const links = vw > 1100 ? FREI_LINKS : 20;
    const rechts = vw > 1100 ? FREI_RECHTS : 20;
    const verfB = Math.max(200, vw - links - rechts);
    const verfH = Math.max(200, vh - FREI_OBEN - FREI_UNTEN);
    const scale = Math.min(verfB / weltB, verfH / weltH, 1.6);
    const mitteX = links + verfB / 2;
    return {
      scale,
      ox: mitteX - (W / 2) * scale,
      oy: FREI_OBEN + (verfH - weltH * scale) / 2 - GEHAEUSE_OBEN * scale,
    };
  }

  bounds(vw: number, vh: number): FreiRect {
    const L = this.layout(vw, vh);
    const x = L.ox + (-RAND - 10) * L.scale;
    const y = L.oy + (GEHAEUSE_OBEN - 10) * L.scale;
    return {
      x,
      y,
      w: (W + RAND * 2 + 90) * L.scale,
      h: (GEHAEUSE_UNTEN - GEHAEUSE_OBEN + COMBO_PLATZ + 60) * L.scale,
    };
  }

  /** Bildschirm -> Welt. `null`, wenn der Punkt nicht ueber dem Automaten liegt. */
  zielAus(sx: number, sy: number, vw: number, vh: number): number | null {
    const L = this.layout(vw, vh);
    const x = (sx - L.ox) / L.scale;
    const y = (sy - L.oy) / L.scale;
    if (x < -RAND || x > W + RAND || y < GEHAEUSE_OBEN - 40 || y > GEHAEUSE_UNTEN) return null;
    return clamp(x, 14, W - 14);
  }

  /* --------------------------------------------------------- Zeichnen --- */

  render(ctx: CanvasRenderingContext2D, vw: number, vh: number): void {
    const L = this.layout(vw, vh);
    const st = this.stats();
    ctx.save();
    // Der Stampfer ruckelt das ganze Gehaeuse kurz.
    const ruck = this.beben > 0 ? Math.sin(this.beben * 60) * 3 * (this.beben / 0.28) : 0;
    ctx.translate(L.ox, L.oy + ruck);
    ctx.scale(L.scale, L.scale);

    this.zeichneGehaeuse(ctx);

    // Alles, was auf der Flaeche Schatten wirft, bleibt in der Mulde.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, D + TRAY);
    ctx.clip();
    this.zeichneSchale(ctx, st);
    this.zeichneSchieber(ctx);
    this.zeichneSchatten(ctx);
    ctx.restore();

    this.zeichneVerbindungen(ctx);
    this.zeichneMagnetfelder(ctx);
    this.zeichneKoerper(ctx);
    this.zeichneFaelle(ctx);
    this.zeichneWellen(ctx);
    this.zeichneSchiene(ctx);
    this.zeichneSpannung(ctx, st);
    this.zeichneFluege(ctx);
    this.zeichneZiel(ctx);
    this.zeichnePops(ctx);
    this.zeichneCombo(ctx, st);

    ctx.restore();
  }

  private zeichneGehaeuse(ctx: CanvasRenderingContext2D): void {
    const x = -RAND;
    const y = GEHAEUSE_OBEN;
    const w = W + RAND * 2;
    const h = GEHAEUSE_UNTEN - GEHAEUSE_OBEN;
    longShadowRect(ctx, x, y, w, h + 14, 26, 70);
    extrudedRect(ctx, x, y, w, h, 26, C.frame, C.frameDark, 14);

    // Die Mulde: ein dunkles Loch im Gehaeuse.
    ctx.beginPath();
    roundRectPath(ctx, -4, -4, W + 8, D + TRAY + 8, 10);
    ctx.fillStyle = C.frameDark;
    ctx.fill();

    // Dielen laufen in Schubrichtung.
    const diele = 55;
    for (let i = 0; i * diele < W; i++) {
      ctx.fillStyle = i % 2 === 0 ? C.floor : C.floorAlt;
      ctx.fillRect(i * diele, 0, Math.min(diele, W - i * diele), D);
    }
  }

  private zeichneSchale(ctx: CanvasRenderingContext2D, st: Stats): void {
    ctx.fillStyle = C.tray;
    ctx.fillRect(0, D, W, TRAY);

    const truhe = this.truheAufFeld;
    const truheZone = truhe && truhe.y > D - 170 ? zoneBei(truhe.x / W, st.abgrund, st.doppelBreite) : null;
    const puls = 0.5 + 0.5 * Math.sin(this.zeit * 7);
    const liste = zonen(st.abgrund, st.doppelBreite);

    for (const z of liste) {
      const x0 = z.von * W;
      const x1 = z.bis * W;
      const bw = x1 - x0;
      const hervor = truhe && truheZone === z.zone && truhe.x >= x0 - 30 && truhe.x <= x1 + 30;

      if (z.zone === "abgrund") {
        // Warnstreifen: harte Diagonalen, kein Verlauf.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, D, bw, TRAY);
        ctx.clip();
        ctx.fillStyle = shade(C.tray, -0.5);
        ctx.fillRect(x0, D, bw, TRAY);
        ctx.fillStyle = rgba(SIGNAL.abgrund, hervor ? 0.25 + 0.2 * puls : 0.16);
        for (let s = -TRAY; s < bw + TRAY; s += 22) {
          ctx.beginPath();
          ctx.moveTo(x0 + s, D);
          ctx.lineTo(x0 + s + 10, D);
          ctx.lineTo(x0 + s + 10 + TRAY, D + TRAY);
          ctx.lineTo(x0 + s + TRAY, D + TRAY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      const farbe = z.zone === "doppel" ? SIGNAL.doppel : SIGNAL.mitte;
      ctx.fillStyle = rgba(farbe, hervor ? 0.16 + 0.14 * puls : 0.1);
      ctx.fillRect(x0, D, bw, TRAY);

      ctx.fillStyle = rgba(farbe, hervor ? 1 : 0.75);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (z.zone === "doppel") {
        ctx.font = "800 30px Nunito, sans-serif";
        ctx.fillText(`×${st.doppelMult}`, x0 + bw / 2, D + TRAY / 2 + 6);
      } else {
        ctx.font = "800 15px Nunito, sans-serif";
        ctx.fillText("A U S Z A H L U N G", x0 + bw / 2, D + TRAY / 2 + 6);
      }
    }

    // Trennwaende zwischen den Faechern: kleine extrudierte Stege.
    for (const z of liste) {
      if (z.von <= 0) continue;
      extrudedRect(ctx, z.von * W - 3, D + 12, 6, TRAY - 18, 3, C.frame, C.frameDark, 5);
    }

    // Die Lippe an der Kante.
    ctx.fillStyle = shade(C.floor, 0.12);
    ctx.fillRect(0, D - 2, W, 4);
    ctx.fillStyle = sh(0.5);
    ctx.fillRect(0, D + 2, W, 8);
  }

  private zeichneSchieber(ctx: CanvasRenderingContext2D): void {
    const face = this.face;
    const top = GEHAEUSE_OBEN;
    // Ein kritischer Hub glueht: die Deckflaeche laeuft Richtung Gold.
    const glut = this.krit ? 0.35 + 0.15 * Math.sin(this.zeit * 20) : 0;
    const deck = glut > 0 ? mix(C.pusher, C.amber, glut) : C.pusher;
    longShadowRect(ctx, 0, top, W, face - top, 2, 24);
    extrudedRect(ctx, 0, top, W, face - top - SCHIEBER_HOEHE, 3, deck, C.pusherDark, SCHIEBER_HOEHE);
    ctx.fillStyle = shade(deck, -0.14);
    ctx.fillRect(0, face - SCHIEBER_HOEHE - 22, W, 4);
    ctx.fillRect(0, face - SCHIEBER_HOEHE - 40, W, 4);
  }

  private zeichneSchatten(ctx: CanvasRenderingContext2D): void {
    // Alle Muenzschatten in EINEM Pfad: ueberlappende Kapseln decken dann
    // gleichmaessig, statt sich zu verdunkeln — und es ist ein fill() statt
    // zweihundert.
    const P = Math.PI;
    const L = 9;
    ctx.beginPath();
    for (const b of this.world.bodies) {
      if (b.kind === "truhe") continue;
      const cy = b.y - 2.5;
      ctx.moveTo(b.x + Math.cos(0.75 * P) * b.r, cy + Math.sin(0.75 * P) * b.r);
      ctx.arc(b.x, cy, b.r, 0.75 * P, 1.75 * P);
      ctx.arc(b.x + L, cy + L, b.r, 1.75 * P, 0.75 * P);
      ctx.closePath();
    }
    ctx.fillStyle = sh(0.34);
    ctx.fill();

    const t = this.truheAufFeld;
    if (t) longShadowRect(ctx, t.x - 32, t.y - 34, 64, 58, 8, 30);
  }

  /** Klebeverbindungen als kurze gruene Stege unter den Muenzen. */
  private zeichneVerbindungen(ctx: CanvasRenderingContext2D): void {
    if (!this.world.links.length) return;
    ctx.lineCap = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = rgba(COINS.klebe.top, 0.55);
    ctx.beginPath();
    for (const l of this.world.links) {
      ctx.moveTo(l.a.x, l.a.y - 5);
      ctx.lineTo(l.b.x, l.b.y - 5);
    }
    ctx.stroke();
  }

  private zeichneMagnetfelder(ctx: CanvasRenderingContext2D): void {
    const R = this.world.magnetRadius;
    for (const b of this.world.bodies) {
      if (b.kind !== "magnet") continue;
      const k = (this.zeit * 0.8 + b.id * 0.13) % 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 5, lerp(R, b.r + 4, k), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(COINS.magnet.top, 0.35 * k);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private zeichneKoerper(ctx: CanvasRenderingContext2D): void {
    // world.bodies ist nach y sortiert: hintere Koerper zuerst, vordere
    // ueberdecken ihre Seitenwand.
    for (const b of this.world.bodies) this.zeichneKoerperBei(ctx, b.kind, b.x, b.y, 1, 1);
  }

  private zeichneKoerperBei(
    ctx: CanvasRenderingContext2D,
    kind: BodyKind,
    x: number,
    y: number,
    s: number,
    alpha: number
  ): void {
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (kind === "truhe") zeichneTruhe(ctx, x, y, s);
    else zeichneMuenze(ctx, kind, x, y, s, this.zeit);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  private zeichneFaelle(ctx: CanvasRenderingContext2D): void {
    for (const f of this.faelle) {
      const p = clamp(f.t / 0.55, 0, 1);
      const e = p * p;
      if (f.zone === "abgrund") {
        this.zeichneKoerperBei(ctx, f.kind, f.x, f.y + e * 40, 1 - 0.8 * p, 1 - p);
      } else {
        this.zeichneKoerperBei(ctx, f.kind, f.x, f.y + e * (TRAY * 0.6), 1 - 0.25 * p, 1 - e);
      }
    }
  }

  private zeichneWellen(ctx: CanvasRenderingContext2D): void {
    for (const w of this.wellen) {
      const k = w.t / 0.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y - 5, w.r * easeOutCubic(k), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(w.farbe, 0.8 * (1 - k));
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.stroke();
    }
  }

  private zeichneSchiene(ctx: CanvasRenderingContext2D): void {
    // Die Schiene liegt ueber dem hinteren Ende des Schiebers — er faehrt
    // unter ihr heraus.
    extrudedRect(ctx, -RAND, GEHAEUSE_OBEN, W + RAND * 2, -GEHAEUSE_OBEN - 6, 26, C.frame, C.frameDark, 9);
    ctx.beginPath();
    roundRectPath(ctx, 6, -RAIL + 4, W - 12, 26, 13);
    ctx.fillStyle = shade(C.frameDark, -0.45);
    ctx.fill();
  }

  private zeichneZiel(ctx: CanvasRenderingContext2D): void {
    if (this.aimX === null) return;
    const x = this.aimX;
    const landY = this.hinterSchieber() + 28;
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = rgba(C.text, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, -RAIL + 30);
    ctx.lineTo(x, landY);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, landY, 13, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(C.text, 0.55);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Der Wagen auf der Schiene.
    extrudedCircle(ctx, x, -RAIL + 15, 11, C.text, shade(C.text, -0.45), 4);
    ctx.beginPath();
    ctx.moveTo(x - 5, -RAIL + 12);
    ctx.lineTo(x + 5, -RAIL + 12);
    ctx.lineTo(x, -RAIL + 19);
    ctx.closePath();
    ctx.fillStyle = C.bgDeep;
    ctx.fill();
  }

  private zeichneFluege(ctx: CanvasRenderingContext2D): void {
    for (const f of this.fluege) {
      const p = clamp(f.t / f.dauer, 0, 1);
      if (f.kind === "truhe") {
        const e = p * p;
        const y = lerp(f.vonY, f.nachY, e);
        const hoch = 1 - e;
        ctx.beginPath();
        roundRectPath(ctx, f.x - 32 + 20 * hoch, f.nachY - 30 + 20 * hoch, 64, 50, 8);
        ctx.fillStyle = sh(0.1 + 0.3 * e);
        ctx.fill();
        this.zeichneKoerperBei(ctx, "truhe", f.x, y, 1 + 0.35 * hoch, 1);
        continue;
      }
      const e = easeOutCubic(p);
      const y = lerp(f.vonY, f.nachY, e);
      const hoch = Math.sin(Math.PI * p);
      const r = COINS[f.kind].r;
      ctx.beginPath();
      ctx.arc(f.x + 6 + hoch * 14, y + 6 + hoch * 14, r, 0, Math.PI * 2);
      ctx.fillStyle = sh(0.25);
      ctx.fill();
      // Die Geistermuenze gleitet halb durchsichtig ueber den Haufen.
      const alpha = f.kind === "geist" ? 0.35 + 0.65 * p : 1;
      // Eine Chaosmuenze zeigt im ersten Teil des Flugs noch ihr Chaos.
      const kind: BodyKind = f.chaos && p < 0.45 ? "chaos" : f.kind;
      this.zeichneKoerperBei(ctx, kind, f.x, y, 1 + 0.3 * hoch, alpha);
    }
  }

  /** Die Truhe kurz vor der Kante: Reif, Pfeil zum Fach, das sie treffen wuerde. */
  private zeichneSpannung(ctx: CanvasRenderingContext2D, st: Stats): void {
    const t = this.truheAufFeld;
    if (!t) return;
    const nah = clamp((t.y - (D - 170)) / 140, 0, 1);
    if (nah <= 0) return;
    const zone = zoneBei(t.x / W, st.abgrund, st.doppelBreite);
    const farbe = zone === "abgrund" ? SIGNAL.abgrund : zone === "doppel" ? SIGNAL.doppel : SIGNAL.mitte;
    const puls = 0.5 + 0.5 * Math.sin(this.zeit * (5 + nah * 8));

    ctx.beginPath();
    ctx.arc(t.x, t.y - 6, 46 + puls * 5 * nah, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(SIGNAL.spannung, 0.35 + 0.5 * nah);
    ctx.lineWidth = 3;
    ctx.stroke();

    if (nah > 0.35) {
      const y = D + 20 + puls * 6;
      ctx.beginPath();
      ctx.moveTo(t.x - 12, y);
      ctx.lineTo(t.x + 12, y);
      ctx.lineTo(t.x, y + 14);
      ctx.closePath();
      ctx.fillStyle = farbe;
      ctx.fill();
    }
  }

  private zeichnePops(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.pops) {
      const dauer = p.gross ? 1.8 : 1;
      const k = p.t / dauer;
      const y = p.y + TRAY * 0.45 - easeOutCubic(Math.min(1, k * 1.6)) * (p.gross ? 70 : 34);
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = p.gross ? "800 32px Nunito, sans-serif" : "800 17px Nunito, sans-serif";
      ctx.fillStyle = sh(0.6 * a);
      ctx.fillText(p.text, p.x + 2, y + 2);
      ctx.fillStyle = rgba(p.farbe, a);
      ctx.fillText(p.text, p.x, y);
    }
  }

  private zeichneCombo(ctx: CanvasRenderingContext2D, st: Stats): void {
    const y = GEHAEUSE_UNTEN + 14 + COMBO_PLATZ / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (this.combo.anzahl > 0) {
      const mult = this.comboFaktor(st);
      const farbe = mult >= 8 ? C.magenta : mult >= 2 ? C.amber : C.muted;
      const text = `${this.combo.anzahl} × fallend   ·   COMBO ×${fmtMult(mult)}`;
      const s = mult > 1 ? 1 + Math.min(0.35, this.combo.timer / st.comboFenster / 6) : 1;
      ctx.font = `800 ${Math.round(20 * s)}px Nunito, sans-serif`;
      ctx.fillStyle = sh(0.5);
      ctx.fillText(text, W / 2 + 2, y + 2);
      ctx.fillStyle = farbe;
      ctx.fillText(text, W / 2, y);
      const bw = 180 * clamp(this.combo.timer / st.comboFenster, 0, 1);
      ctx.fillStyle = rgba(farbe, 0.7);
      ctx.fillRect(W / 2 - bw / 2, y + 18, bw, 4);
    } else if (this.comboNach.t > 0) {
      const a = Math.min(1, this.comboNach.t / 0.5);
      ctx.font = "800 26px Nunito, sans-serif";
      ctx.fillStyle = sh(0.5 * a);
      ctx.fillText(this.comboNach.text, W / 2 + 2, y + 2);
      ctx.fillStyle = rgba(C.amber, a);
      ctx.fillText(this.comboNach.text, W / 2, y);
    }
  }
}

/** Multiplikator ohne ueberfluessige Nachkommastellen: 2, 2.4, 6.72 -> 6.7. */
function fmtMult(m: number): string {
  return Number.isInteger(m) ? `${m}` : m.toFixed(1).replace(/\.0$/, "");
}

/* ------------------------------------------------------------- Formen --- */

function zeichneTruhe(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const w = 64 * s;
  const h = 46 * s;
  const tiefe = 12 * s;
  const x0 = x - w / 2;
  const y0 = y - h / 2 - tiefe / 2;
  extrudedRect(ctx, x0, y0, w, h, 8 * s, SIGNAL.truhe, SIGNAL.truheDark, tiefe);
  ctx.fillStyle = shade(SIGNAL.truhe, -0.18);
  ctx.fillRect(x0, y0 + h * 0.36, w, 3 * s);
  ctx.fillStyle = SIGNAL.truheBand;
  ctx.fillRect(x0 + w * 0.2, y0, 7 * s, h);
  ctx.fillRect(x0 + w * 0.8 - 7 * s, y0, 7 * s, h);
  extrudedRect(ctx, x - 7 * s, y0 + h * 0.36 - 5 * s, 14 * s, 14 * s, 3 * s, SIGNAL.truheBand, SIGNAL.truheBandDark, 3 * s);
  ctx.fillStyle = SIGNAL.truheDark;
  ctx.fillRect(x - 1.5 * s, y0 + h * 0.36 - 1 * s, 3 * s, 6 * s);
}
