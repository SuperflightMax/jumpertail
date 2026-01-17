import { CONFIG } from "./config.js";
import { ParticleSystem } from "./particlesystem.js";
import { LayeredParticleTail } from "./particletail.js";
import { spawnPlatformBurst } from "./particleplatform.js";

const canvas = document.getElementById("game-canvas");
const overlay = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const state = {
  running: false,
  lastTime: 0,
  pointerX: CONFIG.viewport.virtualWidth / 2,
  pointerActive: false,
  cameraY: 0,
  cameraTargetY: 0,
  player: null,
  platforms: [],
  tailColor: CONFIG.platforms.colors[0],
  tailEmitter: null,
  particleSystem: null,
  nextPlatformY: 0,
  lastPlatformY: 0,
  usedRescueAt: -Infinity,
  audio: null,
  parallaxLayers: [],
  tailViewer: null,
  metrics: {
    frames: 0,
    frameTime: 0,
    fps: 0,
    particles: 0,
  },
};

class SoundSystem {
  constructor(config) {
    this.enabled = config.enabled;
    this.volume = config.volume;
    this.background = this.createPool(config.background, true);
    this.sfx = {
      jump: this.createPool(config.jump),
      platform: this.createPool(config.platform),
      fall: this.createPool(config.fall),
    };
    this.started = false;
  }

  createPool(urls = [], loop = false) {
    if (!this.enabled || urls.length === 0) return [];
    return urls.map((url) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      audio.loop = loop;
      audio.volume = this.volume;
      return audio;
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.background.forEach((audio) => {
      audio.volume = this.volume * 0.6;
      audio.play().catch(() => undefined);
    });
  }

  play(key) {
    if (!this.enabled) return;
    const pool = this.sfx[key];
    if (!pool || pool.length === 0) return;
    const audio = pool[Math.floor(Math.random() * pool.length)];
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }
}

function createPlayer() {
  return {
    x: CONFIG.viewport.virtualWidth / 2,
    y: CONFIG.viewport.virtualHeight - CONFIG.ground.height - 80,
    vx: 0,
    vy: 0,
    radius: CONFIG.player.radius,
  };
}

function createPlatform(x, y, color, rare = false, options = {}) {
  return {
    x,
    y,
    width: CONFIG.platforms.width,
    height: CONFIG.platforms.height,
    color,
    rare,
    destroyed: false,
    alpha: options.alpha ?? 1,
    fade: options.fade ?? null,
    collidable: options.collidable ?? true,
  };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function getPlatformGap() {
  return (
    CONFIG.platforms.minGap +
    Math.random() * (CONFIG.platforms.maxGap - CONFIG.platforms.minGap)
  );
}

function startPlatformFade(platform, mode) {
  if (CONFIG.platforms.fadeDuration <= 0) {
    platform.alpha = mode === "in" ? 1 : 0;
    platform.fade = null;
    return;
  }
  platform.fade = { mode, elapsed: 0 };
  if (mode === "in") {
    platform.alpha = 0;
  } else {
    platform.alpha = Math.min(1, platform.alpha ?? 1);
  }
}

function createStartPlatform({ fadeIn = false } = {}) {
  const startGap = getPlatformGap();
  const groundTop = CONFIG.viewport.virtualHeight - CONFIG.ground.height;
  const startY = groundTop - startGap;
  const platform = createPlatform(
    CONFIG.viewport.virtualWidth / 2 - CONFIG.platforms.width / 2,
    startY,
    CONFIG.platforms.colors[0]
  );
  if (fadeIn) {
    startPlatformFade(platform, "in");
  }
  return { platform, startY };
}

function resetGame() {
  state.player = createPlayer();
  state.platforms = [];
  state.tailColor = CONFIG.platforms.colors[0];
  state.tailEmitter.reset();
  state.particleSystem.clear();
  state.cameraY = 0;
  state.cameraTargetY = 0;
  state.usedRescueAt = -Infinity;

  const { platform: startPlatform, startY } = createStartPlatform();
  state.nextPlatformY = startY;
  state.lastPlatformY = startY;
  state.platforms.push(startPlatform);

  for (let i = 0; i < CONFIG.platforms.startCount; i += 1) {
    spawnNextPlatform();
  }
}

function spawnNextPlatform({ fadeIn = false } = {}) {
  const gap = getPlatformGap();
  state.nextPlatformY -= gap;
  const range = CONFIG.viewport.virtualWidth * CONFIG.platforms.horizontalRange;
  const x =
    CONFIG.viewport.virtualWidth / 2 + (Math.random() * 2 - 1) * range -
    CONFIG.platforms.width / 2;
  const isRare = Math.random() < CONFIG.platforms.rareChance;
  const color = isRare
    ? CONFIG.platforms.rareColor
    : CONFIG.platforms.colors[
        Math.floor(Math.random() * CONFIG.platforms.colors.length)
      ];
  const platform = createPlatform(x, state.nextPlatformY, color, isRare);
  if (fadeIn) {
    startPlatformFade(platform, "in");
  }
  state.platforms.push(platform);
}

function updatePlatforms(dt) {
  const buffer = CONFIG.viewport.virtualHeight * 1.6;
  const descentSpeed = CONFIG.platforms.descentSpeed;
  if (descentSpeed > 0) {
    state.platforms.forEach((platform) => {
      platform.y += descentSpeed * dt;
    });
    state.nextPlatformY += descentSpeed * dt;
    state.lastPlatformY += descentSpeed * dt;
  }

  const groundTop = CONFIG.viewport.virtualHeight - CONFIG.ground.height;
  const groundVisible =
    state.cameraY <= groundTop &&
    state.cameraY + CONFIG.viewport.virtualHeight >= groundTop;
  const descentCullY = groundVisible
    ? groundTop + CONFIG.platforms.height * 0.5
    : state.cameraY + CONFIG.viewport.virtualHeight * 1.5;

  state.platforms.forEach((platform) => {
    if (!platform.fade) return;
    const duration = Math.max(CONFIG.platforms.fadeDuration, 0.001);
    platform.fade.elapsed += dt;
    const t = Math.min(1, platform.fade.elapsed / duration);
    const eased = easeOutCubic(t);
    platform.alpha = platform.fade.mode === "in" ? eased : 1 - eased;
    if (t >= 1) {
      if (platform.fade.mode === "out") {
        platform.alpha = 0;
      }
      platform.fade = null;
    }
  });

  state.platforms = state.platforms.filter((platform) => {
    if (platform.alpha <= 0 && !platform.fade) return false;
    if (platform.y > descentCullY) return false;
    return (
      platform.y < state.cameraY + buffer &&
      platform.y > state.cameraY - buffer
    );
  });
  while (state.nextPlatformY > state.cameraY - buffer) {
    spawnNextPlatform();
  }
}

function respawnPlatforms() {
  if (!CONFIG.platforms.respawnOnGround) return;

  if (CONFIG.platforms.fadeDuration > 0) {
    state.platforms.forEach((platform) => {
      platform.collidable = false;
      if (platform.fade?.mode !== "out") {
        startPlatformFade(platform, "out");
      }
    });
  } else {
    state.platforms = [];
  }

  const { platform: startPlatform, startY } = createStartPlatform({ fadeIn: true });
  state.nextPlatformY = startY;
  state.lastPlatformY = startY;
  state.platforms.push(startPlatform);
  for (let i = 0; i < CONFIG.platforms.startCount; i += 1) {
    spawnNextPlatform({ fadeIn: true });
  }
}

function updateParticles(dt) {
  state.particleSystem.update(dt);
}

function initParallax() {
  state.parallaxLayers = CONFIG.parallax.layers.map((layer) => {
    const dots = Array.from({ length: layer.dotCount }).map(() => ({
      x: Math.random() * CONFIG.viewport.virtualWidth,
      y: Math.random() * CONFIG.viewport.virtualHeight * 2,
      size: 2 + Math.random() * 3,
      alpha: 0.3 + Math.random() * 0.5,
    }));
    return { ...layer, dots };
  });
}

function updateCamera(dt) {
  const groundY =
    CONFIG.viewport.virtualHeight - CONFIG.ground.height - state.player.radius;
  let targetY =
    state.player.y - CONFIG.viewport.virtualHeight * CONFIG.camera.targetScreenY;
  if (state.player.y >= groundY) {
    targetY = 0;
  }
  state.cameraTargetY = Math.min(0, targetY);
  state.cameraY += (state.cameraTargetY - state.cameraY) * CONFIG.camera.smooth;
}

function updatePlayer(dt) {
  const player = state.player;
  const pointerDelta = state.pointerX - player.x;
  const targetVX =
    (Math.min(Math.abs(pointerDelta), CONFIG.input.maxPointerDelta) /
      CONFIG.input.maxPointerDelta) *
    CONFIG.physics.moveSpeed *
    Math.sign(pointerDelta || 1);
  player.vx += (targetVX - player.vx) * CONFIG.input.horizontalFollow;

  player.vy = Math.min(player.vy + CONFIG.physics.gravity * dt, CONFIG.physics.maxFallSpeed);
  const prevY = player.y;
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  player.x = Math.max(player.radius, Math.min(CONFIG.viewport.virtualWidth - player.radius, player.x));

  const groundY = CONFIG.viewport.virtualHeight - CONFIG.ground.height - player.radius;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    if (state.running) {
      state.tailEmitter.reset();
      state.audio.play("fall");
      state.running = false;
      overlay.classList.remove("hidden");
      respawnPlatforms();
    }
  }

  if (player.vy > 0) {
    const landing = state.platforms.find((platform) => {
      if (platform.destroyed || platform.collidable === false) return false;
      const withinX =
        player.x + player.radius > platform.x &&
        player.x - player.radius < platform.x + platform.width;
      const crossingY =
        prevY + player.radius <= platform.y &&
        player.y + player.radius >= platform.y;
      return withinX && crossingY;
    });

    if (landing) {
      player.y = landing.y - player.radius;
      player.vy = -CONFIG.physics.jumpVelocity;
      state.tailColor = landing.color;
      state.tailEmitter.boost(CONFIG.particles.tail.growthPerJump);
      state.audio.play("jump");
      spawnPlatformBurst(state.particleSystem, CONFIG.particles.platform, landing);

      if (CONFIG.platforms.destroyOnJump || CONFIG.difficulty.mode === "hard") {
        landing.destroyed = true;
      }

      if (landing.rare) {
        state.tailEmitter.boost(CONFIG.particles.tail.growthPerJump);
      }
    }
  }
}

function maybeRescuePlatform() {
  if (CONFIG.difficulty.mode !== "soft") return;
  const now = performance.now() / 1000;
  if (now - state.usedRescueAt < CONFIG.difficulty.rescueCooldown) return;
  const player = state.player;
  const belowScreen = player.y - state.cameraY > CONFIG.viewport.virtualHeight * 0.9;
  if (!belowScreen) return;
  if (Math.random() > CONFIG.difficulty.rescuePlatformChance) return;

  const rescue = createPlatform(
    player.x - CONFIG.platforms.width / 2,
    player.y + 140,
    CONFIG.platforms.colors[0]
  );
  state.platforms.push(rescue);
  state.usedRescueAt = now;
}

function updateTail(dt) {
  if (!state.running) return;
  if (state.tailViewer?.state?.locked) {
    state.tailEmitter.setIntensity(state.tailViewer.state.lockedProgress);
  }
  state.tailEmitter.update(dt, state.player, state.tailColor);
}

function updateMetrics(dt) {
  state.metrics.frames += 1;
  state.metrics.frameTime += dt;
  if (state.metrics.frameTime >= 0.5) {
    state.metrics.fps = state.metrics.frames / state.metrics.frameTime;
    state.metrics.frames = 0;
    state.metrics.frameTime = 0;
    state.metrics.particles = state.particleSystem.countAlive();
    if (state.tailViewer?.metrics) {
      state.tailViewer.metrics.fps.textContent = state.metrics.fps.toFixed(0);
      state.tailViewer.metrics.particles.textContent = `${state.metrics.particles}/${CONFIG.particles.poolSize}`;
    }
  }
}

function update(dt) {
  if (state.running) {
    updatePlayer(dt);
  }
  updateCamera(dt);
  updatePlatforms(dt);
  updateParticles(dt);
  updateTail(dt);
  updateMetrics(dt);
  if (state.running) {
    maybeRescuePlatform();
  }
}

function renderParallax() {
  state.parallaxLayers.forEach((layer) => {
    ctx.fillStyle = layer.color;
    ctx.fillRect(
      0,
      state.cameraY,
      CONFIG.viewport.virtualWidth,
      CONFIG.viewport.virtualHeight
    );
    layer.dots.forEach((dot) => {
      const y = ((dot.y + state.cameraY * layer.speed) % (CONFIG.viewport.virtualHeight * 2) +
        CONFIG.viewport.virtualHeight * 2) %
        (CONFIG.viewport.virtualHeight * 2);
      ctx.fillStyle = `${layer.dotColor}${Math.floor(dot.alpha * 255).toString(16).padStart(2, "0")}`;
      ctx.beginPath();
      ctx.arc(dot.x, y, dot.size, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function renderPlatforms() {
  state.platforms.forEach((platform) => {
    if (platform.destroyed) return;
    if (platform.alpha <= 0) return;
    ctx.globalAlpha = platform.alpha;
    ctx.fillStyle = platform.color;
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.globalAlpha = 1;
  });
}

function renderParticles() {
  state.particleSystem.render(ctx);
}

function renderPlayer() {
  ctx.fillStyle = CONFIG.player.color;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI * 2);
  ctx.fill();
}

function renderGround() {
  ctx.fillStyle = CONFIG.ground.color;
  ctx.fillRect(0, CONFIG.viewport.virtualHeight - CONFIG.ground.height, CONFIG.viewport.virtualWidth, CONFIG.ground.height);
}

function render() {
  ctx.save();
  ctx.scale(state.scale, state.scale);
  ctx.translate(0, -state.cameraY);
  ctx.fillStyle = CONFIG.viewport.backgroundColor;
  ctx.fillRect(0, state.cameraY, CONFIG.viewport.virtualWidth, CONFIG.viewport.virtualHeight);
  renderParallax();
  renderParticles();
  renderPlatforms();
  renderPlayer();
  renderGround();
  ctx.restore();
}

function loop(timestamp) {
  const time = timestamp / 1000;
  const dt = Math.min(0.033, time - state.lastTime || 0);
  state.lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function resize() {
  const scale = window.innerHeight / CONFIG.viewport.virtualHeight;
  const displayWidth = CONFIG.viewport.virtualWidth * scale;
  canvas.width = displayWidth;
  canvas.height = window.innerHeight;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  state.scale = scale;
}

function toVirtualCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / state.scale;
  const y = (clientY - rect.top) / state.scale + state.cameraY;
  return { x, y };
}

function onPointerMove(event) {
  const point = event.touches ? event.touches[0] : event;
  const coords = toVirtualCoords(point.clientX, point.clientY);
  state.pointerX = coords.x;
}

function onPointerDown(event) {
  if (!state.running) {
    state.running = true;
    state.audio.start();
    state.player.vy = -CONFIG.physics.jumpVelocity;
    overlay.classList.add("hidden");
  }
  onPointerMove(event);
}

function setupInput() {
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("mousedown", onPointerDown);
  window.addEventListener("touchstart", onPointerDown, { passive: true });
}

function applyTailOverrides(tailConfig, overrides) {
  if (!overrides || typeof overrides !== "object") return;
  const scalarKeys = [
    "snapToGrid",
    "gridSize",
    "globalAlpha",
    "globalSpawnMul",
    "globalLifeMul",
    "globalSizeMul",
  ];
  scalarKeys.forEach((key) => {
    const value = overrides[key];
    if (typeof value === "number" || typeof value === "boolean") {
      tailConfig[key] = value;
    }
  });

  if (Array.isArray(overrides.layers)) {
    tailConfig.layers = overrides.layers.map((layer, index) => ({
      ...tailConfig.layers[index],
      ...layer,
    }));
  }
}

function initTailViewer(config, tailEmitter) {
  const tailConfig = config.particles.tail;
  const viewerConfig = tailConfig.viewer ?? { enabled: false };
  if (!viewerConfig.enabled) return null;

  const panel = document.getElementById("tail-viewer");
  if (!panel) return null;

  const storageKey = viewerConfig.storageKey ?? "tailViewerConfig";
  const layerList = panel.querySelector("[data-layer-list]");
  const controls = panel.querySelector("[data-layer-controls]");
  const saveButton = panel.querySelector("[data-action=\"save\"]");
  const loadButton = panel.querySelector("[data-action=\"load\"]");
  const resetButton = panel.querySelector("[data-action=\"reset\"]");
  const dumpButton = panel.querySelector("[data-action=\"dump\"]");
  const stageBar = panel.querySelector("[data-stage-bar]");
  const stageLabel = panel.querySelector("[data-progress-stage]");
  const stageList = panel.querySelector("[data-stage-list]");
  const addStageButton = panel.querySelector("[data-action=\"add-stage\"]");
  const progressInput = panel.querySelector("[data-control=\"progress\"]");
  const snapToggle = panel.querySelector("[data-control=\"snapToGrid\"]");
  const gridInput = panel.querySelector("[data-control=\"gridSize\"]");
  const globalAlphaInput = panel.querySelector("[data-control=\"globalAlpha\"]");
  const globalSpawnInput = panel.querySelector("[data-control=\"globalSpawnMul\"]");
  const globalLifeInput = panel.querySelector("[data-control=\"globalLifeMul\"]");
  const globalSizeInput = panel.querySelector("[data-control=\"globalSizeMul\"]");
  const spawnInput = panel.querySelector("[data-control=\"spawnRate\"]");
  const maxSpawnInput = panel.querySelector("[data-control=\"maxSpawnRate\"]");
  const sizeInput = panel.querySelector("[data-control=\"size\"]");
  const sizeJitterInput = panel.querySelector("[data-control=\"sizeJitter\"]");
  const lifeInput = panel.querySelector("[data-control=\"life\"]");
  const lifeJitterInput = panel.querySelector("[data-control=\"lifeJitter\"]");
  const alphaInput = panel.querySelector("[data-control=\"alpha\"]");
  const enabledInput = panel.querySelector("[data-control=\"layerEnabled\"]");
  const enabledAtInput = panel.querySelector("[data-control=\"enabledAt\"]");
  const modeSelect = panel.querySelector("[data-control=\"mode\"]");
  const shapeSelect = panel.querySelector("[data-control=\"shape\"]");
  const colorModeSelect = panel.querySelector("[data-control=\"colorMode\"]");
  const colorInput = panel.querySelector("[data-control=\"color\"]");
  const colorTextInput = panel.querySelector("[data-control=\"colorText\"]");
  const paletteInput = panel.querySelector("[data-control=\"palette\"]");
  const paletteBlendInput = panel.querySelector("[data-control=\"paletteBlend\"]");
  const followStrengthInput = panel.querySelector("[data-control=\"followStrength\"]");
  const offsetRadiusInput = panel.querySelector("[data-control=\"offsetRadius\"]");
  const offsetBiasInput = panel.querySelector("[data-control=\"offsetBias\"]");
  const driftSpeedInput = panel.querySelector("[data-control=\"driftSpeed\"]");
  const driftJitterInput = panel.querySelector("[data-control=\"driftJitter\"]");
  const gravityInput = panel.querySelector("[data-control=\"gravity\"]");
  const airPushInput = panel.querySelector("[data-control=\"airPush\"]");
  const fixedColorRow = panel.querySelector("[data-color-fixed]");
  const paletteRows = panel.querySelectorAll("[data-color-palette]");
  const metrics = {
    fps: panel.querySelector("[data-metric=\"fps\"]"),
    particles: panel.querySelector("[data-metric=\"particles\"]"),
  };

  if (
    !layerList ||
    !controls ||
    !stageBar ||
    !stageList ||
    !addStageButton ||
    !progressInput ||
    !snapToggle ||
    !gridInput ||
    !globalAlphaInput ||
    !globalSpawnInput ||
    !globalLifeInput ||
    !globalSizeInput ||
    !spawnInput ||
    !maxSpawnInput ||
    !sizeInput ||
    !sizeJitterInput ||
    !lifeInput ||
    !lifeJitterInput ||
    !alphaInput ||
    !enabledInput ||
    !enabledAtInput ||
    !modeSelect ||
    !shapeSelect ||
    !colorModeSelect ||
    !colorInput ||
    !colorTextInput ||
    !paletteInput ||
    !paletteBlendInput ||
    !followStrengthInput ||
    !offsetRadiusInput ||
    !offsetBiasInput ||
    !driftSpeedInput ||
    !driftJitterInput ||
    !gravityInput ||
    !airPushInput ||
    !fixedColorRow ||
    paletteRows.length === 0 ||
    !metrics.fps ||
    !metrics.particles
  ) {
    return null;
  }

  const valueLabels = {
    progress: panel.querySelector("[data-value=\"progress\"]"),
    gridSize: panel.querySelector("[data-value=\"gridSize\"]"),
    spawnRate: panel.querySelector("[data-value=\"spawnRate\"]"),
    maxSpawnRate: panel.querySelector("[data-value=\"maxSpawnRate\"]"),
    size: panel.querySelector("[data-value=\"size\"]"),
    sizeJitter: panel.querySelector("[data-value=\"sizeJitter\"]"),
    life: panel.querySelector("[data-value=\"life\"]"),
    lifeJitter: panel.querySelector("[data-value=\"lifeJitter\"]"),
    alpha: panel.querySelector("[data-value=\"alpha\"]"),
    enabledAt: panel.querySelector("[data-value=\"enabledAt\"]"),
    paletteBlend: panel.querySelector("[data-value=\"paletteBlend\"]"),
    followStrength: panel.querySelector("[data-value=\"followStrength\"]"),
    offsetRadius: panel.querySelector("[data-value=\"offsetRadius\"]"),
    offsetBias: panel.querySelector("[data-value=\"offsetBias\"]"),
    driftSpeed: panel.querySelector("[data-value=\"driftSpeed\"]"),
    driftJitter: panel.querySelector("[data-value=\"driftJitter\"]"),
    gravity: panel.querySelector("[data-value=\"gravity\"]"),
    airPush: panel.querySelector("[data-value=\"airPush\"]"),
    globalAlpha: panel.querySelector("[data-value=\"globalAlpha\"]"),
    globalSpawnMul: panel.querySelector("[data-value=\"globalSpawnMul\"]"),
    globalLifeMul: panel.querySelector("[data-value=\"globalLifeMul\"]"),
    globalSizeMul: panel.querySelector("[data-value=\"globalSizeMul\"]"),
  };

  const multipliers = {
    spawn: panel.querySelector("[data-mul=\"spawn\"]"),
    life: panel.querySelector("[data-mul=\"life\"]"),
    size: panel.querySelector("[data-mul=\"size\"]"),
  };

  const defaultTailConfig = JSON.parse(JSON.stringify(tailConfig));

  function applyTailConfig(nextConfig) {
    const viewer = tailConfig.viewer;
    Object.keys(tailConfig).forEach((key) => {
      delete tailConfig[key];
    });
    Object.assign(tailConfig, nextConfig);
    tailConfig.viewer = viewer;
    if (tailEmitter) {
      tailEmitter.layerStates = tailConfig.layers.map(() => ({ spawnAccumulator: 0 }));
    }
    refreshStageList();
    refreshLayerList();
    refreshControls();
  }

  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      applyTailConfig(JSON.parse(saved));
    } catch (error) {
      console.warn("Tail viewer config load failed.", error);
    }
  }

  let activeIndex = clampIndex(
    viewerConfig.defaultLayerIndex ?? 0,
    tailConfig.layers.length
  );

  function clampIndex(index, length) {
    if (length === 0) return 0;
    return Math.max(0, Math.min(length - 1, index));
  }

  function formatValue(value, digits = 2) {
    if (typeof value === "number") {
      return value.toFixed(digits);
    }
    return String(value ?? "");
  }

  function resolveProgressStage(progress) {
    const stages = tailConfig.progressStages;
    if (!Array.isArray(stages) || stages.length === 0) {
      return null;
    }
    return stages.find((stage) => progress >= stage.min && progress <= stage.max) ?? null;
  }

  function refreshStageBar(progress) {
    stageBar.innerHTML = "";
    const stages = tailConfig.progressStages;
    if (!Array.isArray(stages) || stages.length === 0) return;

    stages.forEach((stage) => {
      const segment = document.createElement("button");
      segment.type = "button";
      segment.className = "tail-viewer__stage-segment";
      const mid = (stage.min + stage.max) / 2;
      segment.style.flex = String(Math.max(0.1, stage.max - stage.min));
      if (progress >= stage.min && progress <= stage.max) {
        segment.classList.add("is-active");
      }
      segment.addEventListener("click", () => {
        updateProgress(mid);
      });
      stageBar.appendChild(segment);
    });
  }

  const viewerState = {
    locked: panel.classList.contains("hidden") ? false : true,
    lockedProgress: tailEmitter?.getIntensity?.() ?? 0,
  };

  function updateMultipliers(progress) {
    const stage = resolveProgressStage(progress);
    const globalSpawn = tailConfig.globalSpawnMul ?? 1;
    const globalLife = tailConfig.globalLifeMul ?? 1;
    const globalSize = tailConfig.globalSizeMul ?? 1;
    const spawnMul = globalSpawn * (stage?.spawnMul ?? 1);
    const lifeMul = globalLife * (stage?.lifeMul ?? 1);
    const sizeMul = globalSize * (stage?.sizeMul ?? 1);

    multipliers.spawn.textContent = `spawn ×${formatValue(spawnMul, 2)}`;
    multipliers.life.textContent = `life ×${formatValue(lifeMul, 2)}`;
    multipliers.size.textContent = `size ×${formatValue(sizeMul, 2)}`;

    if (stageLabel) {
      stageLabel.textContent = stage
        ? `${formatValue(stage.min, 2)}–${formatValue(stage.max, 2)}`
        : "no stage";
    }
  }

  function updateProgress(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    progressInput.value = String(clamped);
    valueLabels.progress.textContent = formatValue(clamped, 2);
    refreshStageBar(clamped);
    updateMultipliers(clamped);
    viewerState.lockedProgress = clamped;
    if (viewerState.locked) {
      tailEmitter.setIntensity(clamped);
    }
  }

  function refreshControls() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;

    spawnInput.min = "0";
    spawnInput.max = String(Math.max(layer.maxSpawnRate * 1.5, 120));
    spawnInput.step = "1";
    spawnInput.value = String(layer.baseSpawnRate ?? 0);

    maxSpawnInput.min = "0";
    maxSpawnInput.max = String(Math.max(layer.maxSpawnRate * 2, 200));
    maxSpawnInput.step = "1";
    maxSpawnInput.value = String(layer.maxSpawnRate ?? 0);

    sizeInput.min = "0.5";
    sizeInput.max = "12";
    sizeInput.step = "0.1";
    sizeInput.value = String(layer.size ?? 1);

    sizeJitterInput.min = "0";
    sizeJitterInput.max = "6";
    sizeJitterInput.step = "0.1";
    sizeJitterInput.value = String(layer.sizeJitter ?? 0);

    lifeInput.min = "0.1";
    lifeInput.max = "2";
    lifeInput.step = "0.05";
    lifeInput.value = String(layer.life ?? 0.5);

    lifeJitterInput.min = "0";
    lifeJitterInput.max = "1.5";
    lifeJitterInput.step = "0.05";
    lifeJitterInput.value = String(layer.lifeJitter ?? 0);

    alphaInput.min = "0";
    alphaInput.max = "1";
    alphaInput.step = "0.01";
    alphaInput.value = String(layer.alpha ?? 1);

    enabledInput.checked = Boolean(layer.enabled);
    enabledAtInput.min = "0";
    enabledAtInput.max = "1";
    enabledAtInput.step = "0.01";
    enabledAtInput.value = String(layer.enabledAt ?? 0);

    modeSelect.value = layer.mode ?? "follow";
    shapeSelect.value = layer.shape ?? "square";
    colorModeSelect.value = layer.colorMode ?? "platform";
    colorInput.value = layer.color ?? "#ffffff";
    colorTextInput.value = layer.color ?? "#ffffff";
    paletteInput.value = Array.isArray(layer.palette) ? layer.palette.join(", ") : "";

    paletteBlendInput.min = "0";
    paletteBlendInput.max = "1";
    paletteBlendInput.step = "0.01";
    paletteBlendInput.value = String(layer.paletteBlend ?? 0);

    followStrengthInput.min = "0";
    followStrengthInput.max = "1.5";
    followStrengthInput.step = "0.01";
    followStrengthInput.value = String(layer.followStrength ?? 0);

    offsetRadiusInput.min = "0";
    offsetRadiusInput.max = "40";
    offsetRadiusInput.step = "0.1";
    offsetRadiusInput.value = String(layer.offsetRadius ?? 0);

    offsetBiasInput.min = "0";
    offsetBiasInput.max = "1";
    offsetBiasInput.step = "0.01";
    offsetBiasInput.value = String(layer.offsetBias ?? 0);

    driftSpeedInput.min = "-200";
    driftSpeedInput.max = "200";
    driftSpeedInput.step = "1";
    driftSpeedInput.value = String(layer.driftSpeed ?? 0);

    driftJitterInput.min = "0";
    driftJitterInput.max = "4";
    driftJitterInput.step = "0.1";
    driftJitterInput.value = String(layer.driftJitter ?? 0);

    gravityInput.min = "-200";
    gravityInput.max = "200";
    gravityInput.step = "1";
    gravityInput.value = String(layer.gravity ?? 0);

    airPushInput.min = "-50";
    airPushInput.max = "50";
    airPushInput.step = "0.5";
    airPushInput.value = String(layer.airPush ?? 0);

    snapToggle.checked = Boolean(tailConfig.snapToGrid);
    gridInput.min = "1";
    gridInput.max = "8";
    gridInput.step = "1";
    gridInput.value = String(tailConfig.gridSize ?? 1);

    globalAlphaInput.min = "0";
    globalAlphaInput.max = "2";
    globalAlphaInput.step = "0.05";
    globalAlphaInput.value = String(tailConfig.globalAlpha ?? 1);

    globalSpawnInput.min = "0";
    globalSpawnInput.max = "3";
    globalSpawnInput.step = "0.05";
    globalSpawnInput.value = String(tailConfig.globalSpawnMul ?? 1);

    globalLifeInput.min = "0";
    globalLifeInput.max = "3";
    globalLifeInput.step = "0.05";
    globalLifeInput.value = String(tailConfig.globalLifeMul ?? 1);

    globalSizeInput.min = "0";
    globalSizeInput.max = "3";
    globalSizeInput.step = "0.05";
    globalSizeInput.value = String(tailConfig.globalSizeMul ?? 1);

    progressInput.min = "0";
    progressInput.max = "1";
    progressInput.step = "0.01";

    valueLabels.spawnRate.textContent = formatValue(Number(spawnInput.value), 0);
    valueLabels.maxSpawnRate.textContent = formatValue(Number(maxSpawnInput.value), 0);
    valueLabels.size.textContent = formatValue(Number(sizeInput.value), 2);
    valueLabels.sizeJitter.textContent = formatValue(Number(sizeJitterInput.value), 2);
    valueLabels.life.textContent = formatValue(Number(lifeInput.value), 2);
    valueLabels.lifeJitter.textContent = formatValue(Number(lifeJitterInput.value), 2);
    valueLabels.alpha.textContent = formatValue(Number(alphaInput.value), 2);
    valueLabels.enabledAt.textContent = formatValue(Number(enabledAtInput.value), 2);
    valueLabels.paletteBlend.textContent = formatValue(Number(paletteBlendInput.value), 2);
    valueLabels.followStrength.textContent = formatValue(Number(followStrengthInput.value), 2);
    valueLabels.offsetRadius.textContent = formatValue(Number(offsetRadiusInput.value), 1);
    valueLabels.offsetBias.textContent = formatValue(Number(offsetBiasInput.value), 2);
    valueLabels.driftSpeed.textContent = formatValue(Number(driftSpeedInput.value), 1);
    valueLabels.driftJitter.textContent = formatValue(Number(driftJitterInput.value), 2);
    valueLabels.gravity.textContent = formatValue(Number(gravityInput.value), 1);
    valueLabels.airPush.textContent = formatValue(Number(airPushInput.value), 2);
    valueLabels.gridSize.textContent = formatValue(Number(gridInput.value), 0);
    valueLabels.globalAlpha.textContent = formatValue(Number(globalAlphaInput.value), 2);
    valueLabels.globalSpawnMul.textContent = formatValue(Number(globalSpawnInput.value), 2);
    valueLabels.globalLifeMul.textContent = formatValue(Number(globalLifeInput.value), 2);
    valueLabels.globalSizeMul.textContent = formatValue(Number(globalSizeInput.value), 2);
    updateColorControls();
    updateProgress(viewerState.lockedProgress);
  }

  function refreshStageList() {
    stageList.innerHTML = "";
    const stages = tailConfig.progressStages ?? [];
    stages.forEach((stage, index) => {
      const row = document.createElement("div");
      row.className = "tail-viewer__stage-row";
      row.dataset.index = String(index);
      const fields = [
        { key: "min", value: stage.min ?? 0 },
        { key: "max", value: stage.max ?? 0 },
        { key: "spawnMul", value: stage.spawnMul ?? 1 },
        { key: "lifeMul", value: stage.lifeMul ?? 1 },
        { key: "sizeMul", value: stage.sizeMul ?? 1 },
      ];
      fields.forEach((field) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.01";
        input.value = String(field.value);
        input.dataset.key = field.key;
        input.addEventListener("change", () => {
          const numeric = Number(input.value);
          stage[field.key] = Number.isFinite(numeric) ? numeric : stage[field.key];
          refreshStageBar(viewerState.lockedProgress);
          updateMultipliers(viewerState.lockedProgress);
        });
        row.appendChild(input);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        tailConfig.progressStages.splice(index, 1);
        refreshStageList();
        refreshStageBar(viewerState.lockedProgress);
        updateMultipliers(viewerState.lockedProgress);
      });
      row.appendChild(remove);
      stageList.appendChild(row);
    });
  }

  function updateColorControls() {
    const mode = colorModeSelect.value;
    if (fixedColorRow) {
      fixedColorRow.style.display = mode === "fixed" ? "grid" : "none";
    }
    paletteRows.forEach((row) => {
      row.style.display = mode === "palette" ? "grid" : "none";
    });
  }

  function refreshLayerList() {
    layerList.innerHTML = "";
    tailConfig.layers.forEach((layer, index) => {
      const row = document.createElement("div");
      row.className = "tail-viewer__layer-row";
      row.dataset.index = String(index);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(layer.enabled);
      checkbox.className = "tail-viewer__layer-toggle";
      checkbox.addEventListener("change", () => {
        layer.enabled = checkbox.checked;
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tail-viewer__layer-button";
      if (index === activeIndex) {
        button.classList.add("is-active");
      }
      const name = layer.name ? ` ${layer.name}` : "";
      button.textContent = `${index + 1}.${name} [${layer.mode}/${layer.shape}]`;
      button.addEventListener("click", () => {
        activeIndex = clampIndex(index, tailConfig.layers.length);
        refreshLayerList();
        refreshControls();
      });
      row.appendChild(checkbox);
      row.appendChild(button);
      layerList.appendChild(row);
    });
  }

  function updateSliderValue(input, label, digits = 2) {
    if (label) {
      label.textContent = formatValue(Number(input.value), digits);
    }
  }

  function handleSpawnRateInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.baseSpawnRate = Number(spawnInput.value);
    updateSliderValue(spawnInput, valueLabels.spawnRate, 0);
  }

  function handleMaxSpawnRateInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.maxSpawnRate = Number(maxSpawnInput.value);
    updateSliderValue(maxSpawnInput, valueLabels.maxSpawnRate, 0);
  }

  function handleSizeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.size = Number(sizeInput.value);
    updateSliderValue(sizeInput, valueLabels.size, 2);
  }

  function handleSizeJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.sizeJitter = Number(sizeJitterInput.value);
    updateSliderValue(sizeJitterInput, valueLabels.sizeJitter, 2);
  }

  function handleLifeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.life = Number(lifeInput.value);
    updateSliderValue(lifeInput, valueLabels.life, 2);
  }

  function handleLifeJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.lifeJitter = Number(lifeJitterInput.value);
    updateSliderValue(lifeJitterInput, valueLabels.lifeJitter, 2);
  }

  function handleAlphaInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.alpha = Number(alphaInput.value);
    updateSliderValue(alphaInput, valueLabels.alpha, 2);
  }

  function handleEnabledInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.enabled = enabledInput.checked;
  }

  function handleEnabledAtInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.enabledAt = Number(enabledAtInput.value);
    updateSliderValue(enabledAtInput, valueLabels.enabledAt, 2);
  }

  function handleModeSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.mode = modeSelect.value;
    refreshLayerList();
  }

  function handleShapeSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.shape = shapeSelect.value;
    refreshLayerList();
  }

  function handleColorModeSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorMode = colorModeSelect.value;
    updateColorControls();
    refreshLayerList();
  }

  function handleColorInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.color = colorInput.value;
    colorTextInput.value = colorInput.value;
  }

  function handleColorTextInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.color = colorTextInput.value;
    if (colorTextInput.value.startsWith("#")) {
      colorInput.value = colorTextInput.value;
    }
  }

  function handlePaletteInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.palette = paletteInput.value
      .split(",")
      .map((color) => color.trim())
      .filter(Boolean);
  }

  function handlePaletteBlendInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.paletteBlend = Number(paletteBlendInput.value);
    updateSliderValue(paletteBlendInput, valueLabels.paletteBlend, 2);
  }

  function handleFollowStrengthInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.followStrength = Number(followStrengthInput.value);
    updateSliderValue(followStrengthInput, valueLabels.followStrength, 2);
  }

  function handleOffsetRadiusInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.offsetRadius = Number(offsetRadiusInput.value);
    updateSliderValue(offsetRadiusInput, valueLabels.offsetRadius, 1);
  }

  function handleOffsetBiasInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.offsetBias = Number(offsetBiasInput.value);
    updateSliderValue(offsetBiasInput, valueLabels.offsetBias, 2);
  }

  function handleDriftSpeedInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.driftSpeed = Number(driftSpeedInput.value);
    updateSliderValue(driftSpeedInput, valueLabels.driftSpeed, 1);
  }

  function handleDriftJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.driftJitter = Number(driftJitterInput.value);
    updateSliderValue(driftJitterInput, valueLabels.driftJitter, 2);
  }

  function handleGravityInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.gravity = Number(gravityInput.value);
    updateSliderValue(gravityInput, valueLabels.gravity, 1);
  }

  function handleAirPushInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.airPush = Number(airPushInput.value);
    updateSliderValue(airPushInput, valueLabels.airPush, 2);
  }

  function handleSnapToggle() {
    tailConfig.snapToGrid = snapToggle.checked;
  }

  function handleGridInput() {
    tailConfig.gridSize = Number(gridInput.value);
    updateSliderValue(gridInput, valueLabels.gridSize, 0);
  }

  function handleGlobalAlphaInput() {
    tailConfig.globalAlpha = Number(globalAlphaInput.value);
    updateSliderValue(globalAlphaInput, valueLabels.globalAlpha, 2);
  }

  function handleGlobalSpawnInput() {
    tailConfig.globalSpawnMul = Number(globalSpawnInput.value);
    updateSliderValue(globalSpawnInput, valueLabels.globalSpawnMul, 2);
    updateMultipliers(viewerState.lockedProgress);
  }

  function handleGlobalLifeInput() {
    tailConfig.globalLifeMul = Number(globalLifeInput.value);
    updateSliderValue(globalLifeInput, valueLabels.globalLifeMul, 2);
    updateMultipliers(viewerState.lockedProgress);
  }

  function handleGlobalSizeInput() {
    tailConfig.globalSizeMul = Number(globalSizeInput.value);
    updateSliderValue(globalSizeInput, valueLabels.globalSizeMul, 2);
    updateMultipliers(viewerState.lockedProgress);
  }

  function handleProgressInput() {
    updateProgress(Number(progressInput.value));
  }

  spawnInput.addEventListener("input", handleSpawnRateInput);
  maxSpawnInput.addEventListener("input", handleMaxSpawnRateInput);
  sizeInput.addEventListener("input", handleSizeInput);
  sizeJitterInput.addEventListener("input", handleSizeJitterInput);
  lifeInput.addEventListener("input", handleLifeInput);
  lifeJitterInput.addEventListener("input", handleLifeJitterInput);
  alphaInput.addEventListener("input", handleAlphaInput);
  enabledInput.addEventListener("change", handleEnabledInput);
  enabledAtInput.addEventListener("input", handleEnabledAtInput);
  modeSelect.addEventListener("change", handleModeSelect);
  shapeSelect.addEventListener("change", handleShapeSelect);
  colorModeSelect.addEventListener("change", handleColorModeSelect);
  colorInput.addEventListener("input", handleColorInput);
  colorTextInput.addEventListener("change", handleColorTextInput);
  paletteInput.addEventListener("change", handlePaletteInput);
  paletteBlendInput.addEventListener("input", handlePaletteBlendInput);
  followStrengthInput.addEventListener("input", handleFollowStrengthInput);
  offsetRadiusInput.addEventListener("input", handleOffsetRadiusInput);
  offsetBiasInput.addEventListener("input", handleOffsetBiasInput);
  driftSpeedInput.addEventListener("input", handleDriftSpeedInput);
  driftJitterInput.addEventListener("input", handleDriftJitterInput);
  gravityInput.addEventListener("input", handleGravityInput);
  airPushInput.addEventListener("input", handleAirPushInput);
  snapToggle.addEventListener("change", handleSnapToggle);
  gridInput.addEventListener("input", handleGridInput);
  globalAlphaInput.addEventListener("input", handleGlobalAlphaInput);
  globalSpawnInput.addEventListener("input", handleGlobalSpawnInput);
  globalLifeInput.addEventListener("input", handleGlobalLifeInput);
  globalSizeInput.addEventListener("input", handleGlobalSizeInput);
  progressInput.addEventListener("input", handleProgressInput);

  saveButton?.addEventListener("click", () => {
    localStorage.setItem(storageKey, JSON.stringify(tailConfig));
  });

  loadButton?.addEventListener("click", () => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    try {
      applyTailConfig(JSON.parse(stored));
    } catch (error) {
      console.warn("Tail viewer config load failed.", error);
    }
  });

  resetButton?.addEventListener("click", () => {
    applyTailConfig(JSON.parse(JSON.stringify(defaultTailConfig)));
  });

  dumpButton?.addEventListener("click", () => {
    console.log("Tail config:", JSON.stringify(tailConfig, null, 2));
  });

  addStageButton?.addEventListener("click", () => {
    tailConfig.progressStages = tailConfig.progressStages ?? [];
    tailConfig.progressStages.push({
      min: 0,
      max: 1,
      spawnMul: 1,
      lifeMul: 1,
      sizeMul: 1,
    });
    refreshStageList();
    refreshStageBar(viewerState.lockedProgress);
    updateMultipliers(viewerState.lockedProgress);
  });

  function togglePanel() {
    panel.classList.toggle("hidden");
    viewerState.locked = !panel.classList.contains("hidden");
    if (viewerState.locked) {
      viewerState.lockedProgress = tailEmitter?.getIntensity?.() ?? 0;
      updateProgress(viewerState.lockedProgress);
    } else if (tailEmitter) {
      tailEmitter.setIntensity(viewerState.lockedProgress);
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "v") return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    togglePanel();
  });

  refreshStageList();
  refreshLayerList();
  refreshControls();
  return { panel, tailEmitter, state: viewerState, metrics };
}

function init() {
  state.audio = new SoundSystem(CONFIG.audio);
  state.particleSystem = new ParticleSystem({ maxParticles: CONFIG.particles.poolSize });
  state.tailEmitter = new LayeredParticleTail(state.particleSystem, CONFIG.particles.tail);
  initParallax();
  state.tailViewer = initTailViewer(CONFIG, state.tailEmitter);
  resize();
  resetGame();
  setupInput();
  window.addEventListener("resize", resize);
  requestAnimationFrame(loop);
}

init();
