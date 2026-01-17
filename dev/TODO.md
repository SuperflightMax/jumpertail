# TASKS

## [S3-T0X] Tail V2 — Layered Pixel/Dot Particle Tail + (Optional) Viewer

Goal

Сделать хвост главным фетиш-визуалом: многослойный, растущий по прогрессу, настраиваемый из config.js, в стиле ретро-аркады (pixel/dot-matrix vibe). Хвост должен работать как след + уметь добавлять ауру вокруг игрока отдельным слоем.

Must-have visual results (what it should look like)

X слоёв хвоста (X задаётся конфигом), где каждый слой может быть:

FOLLOW (строгий след по траектории)

AURA (облако вокруг игрока)

SPARK (редкие искры/акценты с разлётом)

Вложенные цвета (как “огонь/павлин”):

core слой плотный/яркий

outer слой более широкий/мягкий/прозрачный

optional accent слой (редкие “блёстки”)

Dot-matrix / pixel-grid ощущение:

все частицы снапятся к сетке gridSize (2..6)

shape слоя: "square" или "circle" (circle = “диоды” как на рефе)

Прогресс хвоста:

на успешных прыжках хвост становится “богаче” (интенсивность/спавн/длина/слои)

при падении хвост растворяется (как сейчас), но корректно для всех слоёв

Implementation constraints

НЕ добавлять зависимости, НЕ шейдеры

использовать текущий ParticleSystem + пул

всё тюнинговать через config.js

без перестройки архитектуры игры

Required config changes (config.js)

Заменить particles.tail на структуру вида:

particles.tail.gridSize (number)

particles.tail.snapToGrid (bool)

particles.tail.layers (array), где каждый слой:

enabled (bool)

mode: "follow" | "aura" | "spark"

baseSpawnRate, maxSpawnRate

life, lifeJitter

size, sizeJitter

alpha

shape: "square" | "circle"

offsetRadius, offsetBias (для aura/follow разброса)

followStrength (для follow)

driftSpeed, driftJitter

gravity, airPush

colorMode: "platform" | "fixed" | "palette"

если fixed: color

если palette: palette: [ "#...","#..." ] + paletteBlend (0..1)

Color behaviour (важно)

входной tailColor из игры остаётся (как сейчас)

каждый слой решает сам как его использовать:

platform: берём tailColor как есть

fixed: всегда цвет слоя

palette: выбираем/мешаем цвета из палитры слоя, но с привязкой к tailColor (хотя бы через mix)

(Суть: чтобы можно было сделать “ядро белое/синее, оболочка красно-жёлтая, искры фиолетовые”, и всё это ещё реагировало на цвет платформ.)

Code changes
1) Replace ParticleTailEmitter with LayeredParticleTail

новый класс в particletail.js (или новый файл, если аккуратнее), который:

держит layers[]

общий intensity/progress (как сейчас boost())

метод update(dt, player, tailColor)

внутри спавнит частицы по слоям, используя конфиг слоя

2) Grid snapping

Добавить утилиту (локально в tail файле или маленький helper) и применять на spawn:

если snapToGrid:

x = round(x / gridSize) * gridSize

y = round(y / gridSize) * gridSize

3) Integration

main.js должен продолжить работать:

state.tailEmitter.reset()

state.tailEmitter.boost(amount)

state.tailEmitter.update(dt, player, tailColor)

т.е. сохранить внешний интерфейс (или адаптировать минимально в одном месте).

Optional (nice, если успеешь без боли): Tail Viewer / Editor

Минимальный “вьювер” прямо в игре:

горячая клавиша V включает overlay/debug-панель

показывает текущий список слоёв (enabled/mode/shape)

4–6 слайдеров для активного слоя (spawnRate, size, life, alpha, gridSize)

изменения применяются live (в рантайме)

можно сохранить текущие настройки в localStorage и/или вывести JSON в console

Важно: это опционально, если начинает раздуваться — пропустить.

Definition of Done (acceptance)

В config.js можно задать layers: [...] с любым количеством слоёв — и хвост реально меняется.

Видно “вложенность” (core+outer), и можно сделать dot-matrix (circle + grid snap).

При прыжках хвост усиливается/растёт; при падении растворяется для всех слоёв.

Ничего не сломано в текущем геймлупе; FPS не превращается в слайдшоу на дефолтных значениях.

Docs updates (required)

docs/VFX.md: описать новую реализацию layered tail + как настраивать слои

docs/CHANGELOG.md: краткая запись “Tail v2 layered”

### base progress template 

Progress	globalSpawnMul	globalLifeMul	globalSizeMul	Комментарий
0.00–0.15	0.40	0.70	0.80	Хвост есть, но скромный
0.15–0.30	0.60	0.85	0.90	“О, что-то растёт”
0.30–0.50	0.80	1.00	1.00	Базовый комфорт
0.50–0.70	1.00	1.10	1.05	Уже красиво
0.70–0.90	1.25	1.25	1.15	Павлин включается
0.90–1.00	1.50	1.40	1.25	ВАУ-режим
Слои — включение и усиление
Layer 1 — CORE
Progress	Enabled	Spawn	Size	Alpha
0.00	✅	base	0.9×	0.7×
0.30	✅	mid	1.0×	1.0×
0.70	✅	max	1.1×	1.1×
Layer 2 — INNER
Progress	Enabled	OffsetRadius	Alpha	Комментарий
0.10	✅	0.6	0.4	Появляется
0.40	✅	0.9	0.55	Толще
0.80	✅	1.2	0.65	Плотный
Layer 3 — OUTER
Progress	Enabled	Spawn	Size	Alpha
0.35	✅	base	0.9×	0.15
0.55	✅	mid	1.0×	0.22
0.85	✅	max	1.2×	0.30
Layer 4 — AURA
Progress	Enabled	OffsetRadius	Drift	Alpha
< 0.60	❌	–	–	–
0.60	✅	7	0.8×	0.12
0.80	✅	10	1.0×	0.18
0.95	✅	14	1.2×	0.25
Layer 5 — ACCENT SPARKS
Progress	Enabled	Spawn	DriftSpeed	Комментарий
< 0.75	❌	–	–	–
0.75	✅	low	0.8×	Редкие
0.90	✅	mid	1.0×	Блёстки
0.98	✅	high	1.2×	“Нихуя себе”
Реакции на события (коротко, но важно)

Landing (платформа)
progress += smallBoost, хвост кратко “пульсирует” (spawnRate ×1.2 на 0.15с)

Combo / streak
быстрее двигаемся по таблице вверх

Fall / death
progress → 0 за 0.4–0.6с (fade всех слоёв)

Главное правило 

❗ Не интерполировать всё подряд.
Сначала включать слои, потом усиливать параметры.

### Default preset example

particles: {
  // ...
  tail: {
    snapToGrid: true,
    gridSize: 3,              // 2..6: меньше = “плавнее”, больше = “жирнее ретро”
    maxParticles: 2000,       // общий пул (если у тебя пул на всю игру — игнор)

    // общий множитель, чтоб быстро тюнить “вау”
    globalAlpha: 1.0,
    globalSpawnMul: 1.0,
    globalLifeMul: 1.0,
    globalSizeMul: 1.0,

    layers: [
      // 1) CORE — плотное “ядро”, холодное
      {
        enabled: true,
        mode: "follow",           // follow / aura / spark
        shape: "circle",          // circle = dot-matrix диоды
        colorMode: "fixed",       // platform / fixed / palette
        color: "#CFE9FF",

        baseSpawnRate: 120,
        maxSpawnRate: 260,
        life: 0.45,
        lifeJitter: 0.20,
        size: 2.0,
        sizeJitter: 0.35,
        alpha: 0.85,

        followStrength: 1.0,      // 1.0 = липко к траектории
        offsetRadius: 0.0,
        offsetBias: 0.0,
        driftSpeed: 0.0,
        driftJitter: 0.0,
        gravity: 0.0,
        airPush: 0.0
      },

      // 2) INNER — “внутренний огонь” / цвет платформы, квадратный пиксель
      {
        enabled: true,
        mode: "follow",
        shape: "square",
        colorMode: "platform",

        baseSpawnRate: 90,
        maxSpawnRate: 220,
        life: 0.55,
        lifeJitter: 0.25,
        size: 3.0,
        sizeJitter: 0.6,
        alpha: 0.55,

        followStrength: 0.95,
        offsetRadius: 0.8,        // небольшая “толщина”
        offsetBias: 0.0,
        driftSpeed: 10.0,
        driftJitter: 0.5,
        gravity: 0.0,
        airPush: 0.0
      },

      // 3) OUTER — тёплая оболочка (огонь/павлин), мягкая и широкая
      {
        enabled: true,
        mode: "follow",
        shape: "circle",
        colorMode: "palette",
        palette: ["#FF3B30", "#FFB020", "#FFE66D"], // красный→оранж→жёлтый
        paletteBlend: 0.65,                          // насколько “мешаться” между цветами

        baseSpawnRate: 55,
        maxSpawnRate: 140,
        life: 0.70,
        lifeJitter: 0.35,
        size: 5.0,
        sizeJitter: 1.2,
        alpha: 0.22,

        followStrength: 0.90,
        offsetRadius: 1.6,
        offsetBias: 0.0,
        driftSpeed: 18.0,
        driftJitter: 0.8,
        gravity: 0.0,
        airPush: 0.0
      },

      // 4) AURA — атмосфера вокруг игрока (включай как “павлинье сияние”)
      {
        enabled: true,
        mode: "aura",
        shape: "circle",
        colorMode: "palette",
        palette: ["#5AF7FF", "#7C4DFF", "#FF4FD8"], // неон холодный/фиолет/розовый
        paletteBlend: 0.45,

        baseSpawnRate: 35,
        maxSpawnRate: 90,
        life: 0.80,
        lifeJitter: 0.40,
        size: 4.0,
        sizeJitter: 1.0,
        alpha: 0.18,

        // aura-параметры
        offsetRadius: 10.0,       // радиус облака вокруг игрока
        offsetBias: 0.0,
        driftSpeed: 22.0,
        driftJitter: 1.0,
        gravity: -12.0,           // слегка “вверх” (отрицательная гравитация)
        airPush: 0.15
      },

      // 5) ACCENT SPARKS — редкие “блёстки”/искры, дают “уникальность”
      {
        enabled: true,
        mode: "spark",
        shape: "square",
        colorMode: "fixed",
        color: "#FFFFFF",

        baseSpawnRate: 6,
        maxSpawnRate: 22,
        life: 0.35,
        lifeJitter: 0.25,
        size: 3.0,
        sizeJitter: 1.0,
        alpha: 0.75,

        // spark-логика: разлёт наружу
        offsetRadius: 2.0,
        offsetBias: 0.0,
        driftSpeed: 80.0,
        driftJitter: 1.2,
        gravity: 35.0,
        airPush: 0.0
      }
    ]
  }
}


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
