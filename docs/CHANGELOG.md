# CHANGELOG

Проектная история разработки.

Codex обязан заполнять его по этапам.

## Journal — Single runnable build (S1–S8 vertical slice)

- Added a Tail Viewer progression preview bar that locks tail intensity while the viewer is open.
- Added Tail v2 layered tail with grid-snapped particles, per-layer color modes, and an in-game tail viewer for live tuning.
- Fixed initial platform spacing to match configured gaps and prevent ground overlap.
- Added configurable platform respawn on ground contact, with quick fade in/out and optional descent speed.
- Enabled bidirectional camera follow with ground clamp and improved platform spawning above the screen.
- Clamped camera scrolling so the ground stays locked to the bottom edge.
- Smoothed visual fades with eased alpha for platforms, particles, and tail segments.
- Started with a static, dependency-free browser build to keep deploy simple.
- Centralized all tuning into `config.js` so physics/platforms/tail/parallax/audio/difficulty are config-first.
- Implemented a single game loop: player physics, platform spawning, jump collisions, and ground reset.
- Added tail growth per jump + fade on fall; tied tail color to platform color.
- Added basic particles on platform jump with depth variance.
- Replaced the line tail with a comet-style particle trail using a pooled particle system and dedicated effect scripts.
- Added parallax background layers to introduce vertical depth.
- Added optional audio system that stays silent if files are missing.
- Implemented fixed virtual resolution with height-fit scaling and input mapping to virtual coords.
- Kept UI minimal: only “click to jump” overlay.
