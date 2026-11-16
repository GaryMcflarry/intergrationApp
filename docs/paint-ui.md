# Paint UI

A painterly component kit for Astrum: gouache-style surfaces, brush-cut edges and paint-like motion. It is made from CSS and generated SVG filters only: no images, no fonts or scripts from the network. It ships with the app under `app/paint/` and is opt-in; the island does not use it yet.

Open the gallery while Astrum runs: <http://127.0.0.1:43210/paint/gallery.html>.

The look is inspired by hand-painted board-game art (loose brushwork, deep ink frames, solid colour tabs). The kit is original: it copies no game's art, names, icons or layouts.

## Use it on a page

```html
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="paint/paint.css">
<body class="pt">
  ...
  <script src="paint/paint.js"></script>
  <script src="your-page.js"></script>   <!-- calls Paint.init() -->
</body>
```

`Paint.init()` adds the SVG filters the rough edges use (once per page), paints every `[data-pt-scene]`, and wires the toggles, sliders, splashes and `[data-pt-reveal]` reveals. It is safe to call again after adding new elements.

## Components

| Class | What it is |
|---|---|
| `pt-card` + `pt-card__art`, `__body`, `__side` | A dark card framing a painted scene |
| `pt-number` | A big outlined number badge |
| `pt-diamond` + `pt-diamond__icon` | A painted diamond badge with a round icon chip |
| `pt-caption` | A white caption scroll with an ink outline |
| `pt-actions` > `pt-action` + `pt-action__chip` | A stack of brush-swatch tabs, each with an icon chip |
| `pt-btn` (`--light`, `--ghost`) | A brush-swatch button: a lighter stroke sweeps across on hover |
| `pt-chip` (`aria-pressed`) | A small swatch for filters and tabs |
| `pt-panel` (`--paper`) + `pt-panel__title` | A painted panel with a cut edge and canvas grain |
| `pt-toggle` (`role="switch"`, `aria-checked`) | A blob of paint sliding along a groove; fires `pt-change` |
| `pt-slider` (`input type="range"`) | A brushed track whose filled part follows the value |
| `pt-input`, `pt-field` | Ink on paper, an underline that fills with colour on focus |
| `pt-surface`, `pt-rough` | Canvas grain and brush streaks on any element; a hand-cut edge |

Colour any of them with an accent class: `pt-blue`, `pt-purple`, `pt-orange`, `pt-green`, `pt-yellow`, `pt-red`, `pt-sea`, `pt-violet`, `pt-moss`, `pt-ember` (or set `--pt-fill` yourself).

## Scenes

`<div class="pt-card__art" data-pt-scene="valley"></div>`, or `Paint.scene(el, 'coast')`. The scenes are `valley`, `coast` and `dusk`: layered shapes roughed up by the gouache filter (a large warp, plus streaky gaps where a dry brush skipped). Clouds and water drift slowly.

## Motion

| Effect | How |
|---|---|
| Painted in by a dry-brush wipe | `data-pt-reveal` (as it scrolls into view, staggered) or the class `pt-reveal` |
| A wash (wet paint soaking in) | the class `pt-wash` |
| An ink line drawn round an element | `Paint.ink(el, colour?)` |
| A splash where you press | automatic on `pt-btn`, `pt-action`, `pt-chip` (`Paint.splash(el, x, y)`) |
| Paint that runs on hover | `pt-drip` with a `<span class="pt-drip__bead">` inside |
| Wet paint: an edge that keeps moving | `data-pt-wet` or `Paint.wet(el, true / false)` |
| A toast on painted paper | `Paint.toast(text, { color: 'green', ms: 3200 })` |

Every animation stops for people who prefer reduced motion, and `Paint.wet()` does nothing then.

## Performance

The filters are cheap on small elements. Wet paint changes a filter eight times a second, so use it on a few small elements, not on large panels. The scene filter is the heaviest; a few cards on screen are fine.
