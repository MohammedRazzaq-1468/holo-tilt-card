# Aurora Shard — Holo Tilt Card

A standalone HTML/CSS holographic trading card with pointer-driven tilt, moving foil glare, and a press-to-flash interaction.

## Run locally

Open index.html in a modern browser. The page loads styles.css and script.js from the same folder. Google Fonts are optional; the page has system-font fallbacks.

The card respects the operating system's reduced-motion preference.

## Chladni Plate experiment

Open chladni-plate.html to view the interactive Chladni plate. The reusable
component markup is in that page, with its namespaced styles and ES module in
components/chladni-plate/. To embed it elsewhere, reuse the .cpl-wrap markup
and call mountChladniPlate(root, options) from the component module. Optional
settings are grains, dot, amp, and modes.
