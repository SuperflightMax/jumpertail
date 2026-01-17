# tasks completed and pending acceptance
task description shall be moved here from TODO.md
output information must be added here for each task

## tasks below

### [S3-T0X] Debug Tail Viewer Layout + Platform Generator Controls

Status: implemented, pending acceptance.

Summary of changes
- Added `debug.html` as the editor entrypoint and kept `index.html` game-only.
- Arranged the Tail Viewer into Game → Layers → Rest columns with compact number inputs and numeric layer buttons.
- Moved the performance monitor onto the canvas with a dark backdrop for readability.
- Added a dedicated platform generator control block (without rare platform controls), platform color pickers, and mouse-wheel support for numeric tuning.

How to verify
1. Run `python -m http.server 8000` and open http://localhost:8000/debug.html.
2. Confirm:
   - Tail Viewer is visible on start and ordered Game → Layers → Rest.
   - Performance monitor is readable over the canvas.
   - Layer selector uses numbered buttons.
   - Mouse wheel over numeric fields increments/decrements values.
   - Platform generator controls update spacing/size behavior on new spawns.
   - Platform color pickers update platform palette.
3. Open http://localhost:8000/index.html and confirm only the game is visible.

### [S3-T0X] Tail V2 — Layered Pixel/Dot Particle Tail + (Optional) Viewer

Status: implemented, pending acceptance.

Summary of changes
- Replaced the single-layer tail emitter with a layered tail system (follow/aura/spark modes) that is fully configurable through `config.js`.
- Added grid snapping for dot-matrix / pixelized tail rendering and palette-aware color modes.
- Added an in-game Tail Viewer (toggle with `V`) for full tail tuning, progression preview/lock, and Save/Load/Reset.
- Updated documentation (VFX, CHANGELOG, HISTORY) to reflect Tail v2.

How to verify
1. Run `python -m http.server 8000` and open http://localhost:8000.
2. Jump across platforms and confirm:
   - Multiple tail layers are visible (core + outer + aura + sparks).
   - Grid snapping produces a pixel/dot vibe (adjust grid size in viewer).
   - Tail intensity grows per jump and dissolves on fall.
3. Press `V` to open Tail Viewer:
   - Toggle layers on/off.
   - Adjust global tail settings + layer controls (spawn, size, life, offsets, drift, gravity, color) and see changes live.
   - Use the progression preview to lock tail intensity while the viewer is open.
   - Edit progress stages, click `Save`, then `Load` to confirm persistence. Use `Reset` to restore defaults.
   - Confirm FPS and particle count display updates.

Notes
- Tail behavior thresholds and global multipliers are configured in `particles.tail.progressStages`.
- No new dependencies or architectural shifts.
