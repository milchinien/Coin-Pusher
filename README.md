# Reliktenschieber

Ein Münzschieber als Idle-Spiel im Browser. Münzen gezielt einwerfen, den Haufen
über die Kante schieben, Schatztruhen bergen und den Automaten über einen
Upgrade-Baum ausbauen.

Design System, Skill-Tree-Ansicht und Herbst-Deko stammen aus
[Dropfall](https://github.com/milchinien/Dropfall).

## Spielen

```bash
pnpm install
pnpm dev      # http://localhost:5275
pnpm build    # statische Fassung in dist/, relativ verlinkt
```

**Bedienung:** Maus über den Automaten zielen, Klicken oder Halten wirft ein,
Leertaste wirft an die letzte Zielposition. Tasten 1–0 wählen die Münze, Q–R
kaufen im Schnellkauf, Tab wechselt zwischen Automat und Upgrade-Baum.

## Was drin ist

- **Eigene 2D-Scheibenphysik** (`src/physics.ts`): positionsbasiert, nach y
  sortiert aufgelöst, damit ein Schub in einem Durchgang durch den ganzen
  Haufen wandert. Dazu Klebeverbindungen und Magnetfelder.
- **Ausgänge** an der Kante: Abgrund · Doppelfach · Auszahlung · Abgrund.
- **Schatztruhe** als Spannungsbogen: schwer, mehrfach anzuschieben, zeigt kurz
  vor der Kante, in welches Fach sie fallen würde.
- **Combo** für gemeinsam fallende Objekte (5 → ×2, 10 → ×4, 20 → ×8, 40 → ×16).
- **Zehn Münzarten**: Kupfer, Silber, Gold, Riesen-, Magnet-, Spreng-, Klebe-,
  Geister-, Königs- und Chaosmünze.
- **Upgrade-Baum** mit 51 Knoten in fünf Ästen (Einwurf, Schieber, Auszahlung,
  Truhe, Münzen), bezahlt in Geld. Jede Sondermünze hat Freischalten, Kraft und
  Glück.
- **Zwei Skins**: Herbst (Standard) und Klassisch.

Das Spiel läuft nur, solange das Fenster offen ist. Der Spielstand liegt im
`localStorage`, einschließlich der Lage jeder Münze auf der Plattform.

## Werkzeuge

Kopflos mit esbuild bündeln und mit Node ausführen:

- `tools/balance-check.ts` — ein Bot spielt den Automaten und kauft sich durch
  den Baum (`MINUTEN=90 TAKT=0.6`). Zeigt Geldverlauf und Meilensteine.
- `tools/layout-check.ts` — prüft das Baum-Layout auf Kreuzungen und Abstände.
