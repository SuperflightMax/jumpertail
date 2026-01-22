# HISTORY

- Added Windows batch scripts to launch the local server and open the game or debug viewer.
- Updated config loading to auto-apply `configs/default.json` (player uses external-only when present) and switched Tail Viewer Save/Load/Reset to file download/upload with a progression slider, removing config file selection and Dump JSON.
- Reordered the debug layout into Game → Layers → Rest columns, moved the performance monitor onto the canvas, and added platform color pickers.
- Updated platform lifecycle and camera behavior for a more playable climb flow:
  - consistent ground/platform spacing,
  - respawn-on-ground with fades,
  - optional platform descent,
  - bidirectional camera tracking.
- Split the Tail Viewer into left/right editor panels with compact number inputs, a layer dropdown, and platform generator controls, plus a dedicated `debug.html` entrypoint.
- Clamped camera scrolling to keep the ground anchored at the bottom edge.
- Swapped the tail to a comet-like particle trail and refactored particles into dedicated system/effect modules.
- Implemented Tail v2 layered tail with grid snapping, palette-aware colors, and a live tail viewer for tuning.
- Added a Tail Viewer progression preview and intensity lock to help debug tail stages.
- Expanded the Tail Viewer with full tail controls, editable stages, and performance monitoring.
- Reworked particle configs with min/max ranges, vector speeds, transitions, texture selection, and a configurable pixel overlay plus external JSON overrides.
- Fixed AssetManager audio preloading to skip non-array config entries and avoid startup exceptions.
- Refined particles with angle/magnitude speeds, base size scaling, texture tinting, and platform explosion controls in the viewer.
