/* Prueft das Baum-Layout: engste Knotenpaare, Kreuzungen, Ausdehnung. */
import { layoutTree, parentOf } from "../src/layout";
import { NODES } from "../src/upgrades";

const t0 = performance.now();
const pos = layoutTree(NODES);
console.log(`Layout: ${NODES.length} Knoten in ${(performance.now() - t0).toFixed(0)} ms`);

const ids = NODES.map((n) => n.id);
const fehlt = NODES.filter((n) => !pos.has(n.id)).map((n) => n.id);
if (fehlt.length) console.log("OHNE LAGE (Elternknoten fehlt?):", fehlt.join(", "));
for (const n of NODES) for (const [r] of n.req ?? []) if (!ids.includes(r)) console.log(`UNBEKANNTE VORAUSSETZUNG ${n.id} -> ${r}`);

let engste: Array<[number, string, string]> = [];
for (let i = 0; i < NODES.length; i++)
  for (let j = i + 1; j < NODES.length; j++) {
    const a = pos.get(NODES[i].id)!;
    const b = pos.get(NODES[j].id)!;
    engste.push([Math.hypot(a.x - b.x, a.y - b.y), NODES[i].id, NODES[j].id]);
  }
engste.sort((a, b) => a[0] - b[0]);
console.log("Engste Paare:", engste.slice(0, 4).map(([d, a, b]) => `${a}/${b} ${d.toFixed(0)}`).join(" · "));

const kanten = NODES.filter((n) => parentOf(n)).map((n) => [parentOf(n)!, n.id] as const);
const P = (id: string) => pos.get(id)!;
const o = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
let kreuz = 0;
for (let i = 0; i < kanten.length; i++)
  for (let j = i + 1; j < kanten.length; j++) {
    const [a1, b1] = kanten[i];
    const [a2, b2] = kanten[j];
    if (new Set([a1, b1, a2, b2]).size < 4) continue;
    if (o(P(a1), P(b1), P(a2)) !== o(P(a1), P(b1), P(b2)) && o(P(a2), P(b2), P(a1)) !== o(P(a2), P(b2), P(b1))) kreuz++;
  }
console.log("Kreuzungen:", kreuz);
const xs = [...pos.values()].map((p) => p.x);
const ys = [...pos.values()].map((p) => p.y);
console.log(`Ausdehnung ${Math.round(Math.max(...xs) - Math.min(...xs))} x ${Math.round(Math.max(...ys) - Math.min(...ys))}`);
