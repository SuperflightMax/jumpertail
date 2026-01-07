# CHANGELOG

Проектная история разработки.

Codex обязан заполнять его по этапам.

## Journal — Single runnable build (S1–S8 vertical slice)

- Started with a static, dependency-free browser build to keep deploy simple.
- Centralized all tuning into `config.js` so physics/platforms/tail/parallax/audio/difficulty are config-first.
- Implemented a single game loop: player physics, platform spawning, jump collisions, and ground reset.
- Added tail growth per jump + fade on fall; tied tail color to platform color.
- Added basic particles on platform jump with depth variance.
- Added parallax background layers to introduce vertical depth.
- Added optional audio system that stays silent if files are missing.
- Implemented fixed virtual resolution with height-fit scaling and input mapping to virtual coords.
- Kept UI minimal: only “click to jump” overlay.
