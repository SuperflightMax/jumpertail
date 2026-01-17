# tasks completed and pending acceptance
task description shall be moved here from TODO.md
output information must be added here for each task

## tasks below

### [S3-T0X] Tail V2 — Layered Pixel/Dot Particle Tail + (Optional) Viewer

Status: implemented, pending acceptance.

Summary of changes
- Replaced the single-layer tail emitter with a layered tail system (follow/aura/spark modes) that is fully configurable through `config.js`.
- Added grid snapping for dot-matrix / pixelized tail rendering and palette-aware color modes.
- Added an in-game Tail Viewer (toggle with `V`) for live tuning and localStorage save.
- Updated documentation (VFX, CHANGELOG, HISTORY) to reflect Tail v2.

How to verify
1. Run `python -m http.server 8000` and open http://localhost:8000.
2. Jump across platforms and confirm:
   - Multiple tail layers are visible (core + outer + aura + sparks).
   - Grid snapping produces a pixel/dot vibe (adjust grid size in viewer).
   - Tail intensity grows per jump and dissolves on fall.
3. Press `V` to open Tail Viewer:
   - Toggle layers on/off.
   - Adjust spawn/size/life/alpha/grid size sliders and see changes live.
   - Click `Save` and reload the page to confirm persistence.

Notes
- Tail behavior thresholds and global multipliers are configured in `particles.tail.progressStages`.
- No new dependencies or architectural shifts.
