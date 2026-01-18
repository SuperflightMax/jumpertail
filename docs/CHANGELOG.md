# CHANGELOG

Проектная история разработки.

Codex обязан заполнять его по этапам.

## Journal — Single runnable build (S1–S8 vertical slice)

- Updated config loading to always autoload `configs/default.json`, with the player build using external config only; refreshed the Tail Viewer with file download/upload Save/Load/Reset, a progression slider, and removed the config files UI/Dump JSON.
- Switched particle speeds to angle/magnitude ranges, added base size + scale multipliers, and tinted textures with color transitions.
- Added platform explosion controls to the viewer, including speed/rotation ranges, shape/texture, and color overrides.
- Updated air drag to apply per-step velocity reduction (`v *= 1 - airDrag`) and disabled rotation-to when angular speed is active.
- Fixed AssetManager audio preload to ignore non-array config keys (prevents startup exception).
- Reworked particle configs to use min/max ranges, vector speeds, and full transitions (color/alpha/scale/rotation) with texture selection and air drag.
- Added AssetManager with preload/lazy options, plus external JSON config overrides and selectable config files.
- Added a pixel overlay pass with configurable grid size and pattern presets, plus viewer controls for all new particle settings.
- Reordered the debug layout into Game → Layers → Rest columns, moved the performance monitor onto the canvas, and added platform color pickers.
- Split the Tail Viewer into left/right debug panels with a compact dropdown selector, platform generator block, and mouse-wheel-friendly number inputs, plus added `debug.html` as an editor entrypoint.
- Expanded the Tail Viewer with full tail controls, editable progress stages, save/load/reset, and FPS/particle monitoring.
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
