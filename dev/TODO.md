# TASKS (Generated)
## Stage S1 — Base Jump Game (Playable Core)

- [S1-T01] Project boot & playable entrypoint
- [S1-T02] Player entity with basic physics (gravity + jump)
- [S1-T03] Input mapping: mouse/touch move + tap/click jump
- [S1-T04] Platform spawning and collision with jump response
- [S1-T05] Ground/kill plane and restart loop
- [S1-T06] Minimal rendering of player + platforms
- [S1-T07] Basic game loop timing and update order

## Stage S2 — Destruction & Feedback

- [S2-T01] Platform destruction trigger on successful jump
- [S2-T02] Simple destruction visual effects (non-particle ok)
- [S2-T03] Jump feedback (screen/anim micro-response)
- [S2-T04] Optional sound hooks for jump/destruction events
- [S2-T05] Tuning of jump feel after destruction feedback

## Stage S3 — Tail v1 (Visual Progression)

- [S3-T01] Tail data structure to follow player trajectory
- [S3-T02] Render tail trail with growth over jumps
- [S3-T03] Tail growth logic tied to successful jumps
- [S3-T04] Tail fade/dissolve sequence on fall
- [S3-T05] Ensure no tail at ground/reset state

## Stage S4 — Color & Platform Influence

- [S4-T01] Colored platform variants in generator
- [S4-T02] Tail color accumulation model
- [S4-T03] Tail rendering with multi-color segments
- [S4-T04] Rare/bright platform definition & spawn rate
- [S4-T05] Visual feedback when rare platform collected

## Stage S5 — Depth & Parallax

- [S5-T01] Multi-layer background setup (2–3 layers)
- [S5-T02] Parallax movement mapping to camera/player
- [S5-T03] Depth channel for some particles/tail elements
- [S5-T04] Render ordering & blending for depth
- [S5-T05] Tuning for depth readability and performance

## Stage S6 — Difficulty Modes

- [S6-T01] Difficulty mode config (soft/hard)
- [S6-T02] Soft mode: fall recovery rules
- [S6-T03] Hard mode: fall-to-ground rules
- [S6-T04] Mode selection mechanism (config flag)
- [S6-T05] Balance pass for both modes

## Stage S7 — Audio Atmosphere

- [S7-T01] Audio event API (Sound.play by event key)
- [S7-T02] Background loop playback management
- [S7-T03] SFX mapping for jump/destruction/tail growth
- [S7-T04] Asset-optional behavior (silent when missing)
- [S7-T05] Mix/volume balance pass

## Stage S8 — Polish & Presentation

- [S8-T01] Input feel smoothing and responsiveness tuning
- [S8-T02] Start prompt: "click to jump" minimal UI
- [S8-T03] Resize/viewport scaling stability pass
- [S8-T04] Visual bug fixes and artifact cleanup
- [S8-T05] Gameplay balance and flow polish

## Stage S9 — Experimental / Optional

- [S9-T01] PNG particle shape support (optional)
- [S9-T02] Alternative tail styles/variants
- [S9-T03] Optional visual themes or palettes
- [S9-T04] Experimental VFX layers/treatments
- [S9-T05] Evaluate performance impact of experiments

# Technical Questions / Unknowns
- S1: Which runtime/engine is assumed for the prototype (canvas, WebGL, existing framework)?
- S1: Is there an existing build/serve pipeline that the game must integrate with?
- S2: Are there any existing assets for destruction or should placeholders be generated procedurally?
- S3: Preferred tail rendering technique (simple line, sprite trail, particle strip)?
- S4: How should platform color influence be accumulated (blend, discrete segments, dominant color)?
- S5: Parallax layers: are there any approved background assets or should we use procedural placeholders?
- S6: Soft mode recovery rules—what constitutes a "save" (platform persists, grace window, auto-bounce)?
- S7: Audio assets availability and formats; should we implement preload or lazy loading?
- S8: Target aspect ratio and canonical virtual resolution values to lock in.
- S9: Any hard constraints on optional experiments to avoid derailing core feel?

# High-Level Solution Proposals
- S1: Build a minimal game loop with a single player entity, platform list, and collision checks in virtual coordinates; render with basic shapes and keep input mapping simple.
- S1: Keep configuration centralized (physics, platform spacing, jump power) and inject into systems to avoid magic numbers.
- S1: Implement input as normalized horizontal pointer tracking + tap-to-jump to respect minimal UI constraints.
- S2: Use a lightweight destruction effect (e.g., platform fragments or burst lines) tied to jump events; keep it optional if assets are missing.
- S2: Introduce event hooks for audio and visuals without adding new dependencies.
- S3: Maintain a trail buffer of recent player positions; render as a growing strip or stacked sprites to convey progression.
- S3: On fall, decrease tail opacity or trim the buffer over time until reset.
- S4: Tag platforms with color metadata and propagate it into tail segments for a multi-color trail.
- S4: Implement rare platform variants with a low spawn probability and stronger color contribution.
- S5: Create 2–3 background layers with differing scroll ratios; tie movement to camera/player vertical progression for depth.
- S5: Route a subset of particles/tail bits into a "far" layer rendered with smaller scale and lower opacity.
- S6: Add a difficulty flag in config; soft mode can preserve some platforms or allow brief recovery, hard mode enforces full fall.
- S6: Keep mode logic localized to fall handling to avoid cross-cutting changes.
- S7: Implement a simple Sound.play(eventKey) dispatcher; map events to asset lists with random selection when multiple files exist.
- S7: Design audio to be entirely optional, no crashes if assets are missing.
- S8: Add a minimal start prompt overlay; hide it once the first jump occurs.
- S8: Use a fixed virtual resolution with fit-to-height scaling and centered canvas to preserve composition.
- S9: Offer optional visual experiments behind config flags to avoid disrupting the core loop.
- S9: Compare visual impact vs performance; keep rollback paths easy.

# Risks / Gotchas
- Input feels wrong if pointer mapping is inconsistent across screen sizes; validate with fixed virtual coordinates.
- Tail rendering can become expensive if the trail buffer grows unbounded; cap length and fade smoothly.
- Parallax layers can distract from gameplay if contrast is too high; keep them subtle.
- Soft mode can feel unclear if recovery rules are ambiguous; ensure visual cues or simple rules.
- Optional audio/asset loading can break the boot flow; keep missing-asset handling explicit.
- Resize logic can break composition; test portrait and desktop aspect ratios.
- Visual effects can overwhelm clarity; prioritize readability of platforms and player.
