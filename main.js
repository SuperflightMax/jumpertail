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
  const layerButtons = panel.querySelector("[data-layer-buttons]");
  const controls = panel.querySelector("[data-layer-controls]");
  const saveButton = panel.querySelector("[data-action=\"save\"]");
  const loadButton = panel.querySelector("[data-action=\"load\"]");
  const resetButton = panel.querySelector("[data-action=\"reset\"]");
  const dumpButton = panel.querySelector("[data-action=\"dump\"]");
  const snapToggle = panel.querySelector("[data-control=\"snapToGrid\"]");
  const gridInput = panel.querySelector("[data-control=\"gridSize\"]");
  const globalAlphaInput = panel.querySelector("[data-control=\"globalAlpha\"]");
  const globalSpawnInput = panel.querySelector("[data-control=\"globalSpawnMul\"]");
  const globalLifeInput = panel.querySelector("[data-control=\"globalLifeMul\"]");
  const globalSizeInput = panel.querySelector("[data-control=\"globalSizeMul\"]");
  const platformColorsWrap = panel.querySelector("[data-control=\"platformColors\"]");
  const platformWidthInput = panel.querySelector("[data-control=\"platformWidth\"]");
  const platformHeightInput = panel.querySelector("[data-control=\"platformHeight\"]");
  const platformHorizontalRangeInput = panel.querySelector(
    "[data-control=\"platformHorizontalRange\"]"
  );
  const platformMinGapInput = panel.querySelector("[data-control=\"platformMinGap\"]");
  const platformMaxGapInput = panel.querySelector("[data-control=\"platformMaxGap\"]");
  const platformStartCountInput = panel.querySelector("[data-control=\"platformStartCount\"]");
  const platformDestroyInput = panel.querySelector(
    "[data-control=\"platformDestroyOnJump\"]"
  );
  const platformRespawnInput = panel.querySelector(
    "[data-control=\"platformRespawnOnGround\"]"
  );
  const platformFadeInput = panel.querySelector("[data-control=\"platformFadeDuration\"]");
  const platformDescentInput = panel.querySelector("[data-control=\"platformDescentSpeed\"]");
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
  const performanceMonitor = document.querySelector("[data-performance-monitor]");
  const metrics = {
    fps: performanceMonitor?.querySelector("[data-metric=\"fps\"]"),
    particles: performanceMonitor?.querySelector("[data-metric=\"particles\"]"),
  };

  if (
    !layerButtons ||
    !controls ||
    !snapToggle ||
    !gridInput ||
    !globalAlphaInput ||
    !globalSpawnInput ||
    !globalLifeInput ||
    !globalSizeInput ||
    !platformColorsWrap ||
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
    !metrics.particles ||
    !platformWidthInput ||
    !platformHeightInput ||
    !platformHorizontalRangeInput ||
    !platformMinGapInput ||
    !platformMaxGapInput ||
    !platformStartCountInput ||
    !platformDestroyInput ||
    !platformRespawnInput ||
    !platformFadeInput ||
    !platformDescentInput
  ) {
    return null;
  }

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

  function clampNumber(value, min, max) {
    let next = value;
    if (Number.isFinite(min)) {
      next = Math.max(min, next);
    }
    if (Number.isFinite(max)) {
      next = Math.min(max, next);
    }
    return next;
  }

  function setNumberInput(input, { min, max, step, value }) {
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    if (step !== undefined) input.step = String(step);
    if (value !== undefined && value !== null) input.value = String(value);
  }

  const viewerState = {
    locked: panel.classList.contains("hidden") ? false : true,
    lockedProgress: tailEmitter?.getIntensity?.() ?? 0,
  };

  if (performanceMonitor) {
    performanceMonitor.classList.toggle("hidden", panel.classList.contains("hidden"));
  }

  function setLockedProgress(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    viewerState.lockedProgress = clamped;
    if (viewerState.locked) {
      tailEmitter.setIntensity(clamped);
    }
  }

  function refreshControls() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;

    setNumberInput(spawnInput, {
      min: 0,
      max: Math.max(layer.maxSpawnRate * 1.5, 120),
      step: 1,
      value: layer.baseSpawnRate ?? 0,
    });

    setNumberInput(maxSpawnInput, {
      min: 0,
      max: Math.max(layer.maxSpawnRate * 2, 200),
      step: 1,
      value: layer.maxSpawnRate ?? 0,
    });

    setNumberInput(sizeInput, { min: 0.5, max: 12, step: 0.1, value: layer.size ?? 1 });
    setNumberInput(sizeJitterInput, {
      min: 0,
      max: 6,
      step: 0.1,
      value: layer.sizeJitter ?? 0,
    });
    setNumberInput(lifeInput, { min: 0.1, max: 2, step: 0.05, value: layer.life ?? 0.5 });
    setNumberInput(lifeJitterInput, {
      min: 0,
      max: 1.5,
      step: 0.05,
      value: layer.lifeJitter ?? 0,
    });
    setNumberInput(alphaInput, { min: 0, max: 1, step: 0.01, value: layer.alpha ?? 1 });

    enabledInput.checked = Boolean(layer.enabled);
    setNumberInput(enabledAtInput, {
      min: 0,
      max: 1,
      step: 0.01,
      value: layer.enabledAt ?? 0,
    });

    modeSelect.value = layer.mode ?? "follow";
    shapeSelect.value = layer.shape ?? "square";
    colorModeSelect.value = layer.colorMode ?? "platform";
    colorInput.value = layer.color ?? "#ffffff";
    colorTextInput.value = layer.color ?? "#ffffff";
    paletteInput.value = Array.isArray(layer.palette) ? layer.palette.join(", ") : "";

    setNumberInput(paletteBlendInput, {
      min: 0,
      max: 1,
      step: 0.01,
      value: layer.paletteBlend ?? 0,
    });
    setNumberInput(followStrengthInput, {
      min: 0,
      max: 1.5,
      step: 0.01,
      value: layer.followStrength ?? 0,
    });
    setNumberInput(offsetRadiusInput, {
      min: 0,
      max: 40,
      step: 0.1,
      value: layer.offsetRadius ?? 0,
    });
    setNumberInput(offsetBiasInput, {
      min: 0,
      max: 1,
      step: 0.01,
      value: layer.offsetBias ?? 0,
    });
    setNumberInput(driftSpeedInput, {
      min: -200,
      max: 200,
      step: 1,
      value: layer.driftSpeed ?? 0,
    });
    setNumberInput(driftJitterInput, {
      min: 0,
      max: 4,
      step: 0.1,
      value: layer.driftJitter ?? 0,
    });
    setNumberInput(gravityInput, { min: -200, max: 200, step: 1, value: layer.gravity ?? 0 });
    setNumberInput(airPushInput, { min: -50, max: 50, step: 0.5, value: layer.airPush ?? 0 });

    snapToggle.checked = Boolean(tailConfig.snapToGrid);
    setNumberInput(gridInput, { min: 1, max: 8, step: 1, value: tailConfig.gridSize ?? 1 });
    setNumberInput(globalAlphaInput, {
      min: 0,
      max: 2,
      step: 0.05,
      value: tailConfig.globalAlpha ?? 1,
    });
    setNumberInput(globalSpawnInput, {
      min: 0,
      max: 3,
      step: 0.05,
      value: tailConfig.globalSpawnMul ?? 1,
    });
    setNumberInput(globalLifeInput, {
      min: 0,
      max: 3,
      step: 0.05,
      value: tailConfig.globalLifeMul ?? 1,
    });
    setNumberInput(globalSizeInput, {
      min: 0,
      max: 3,
      step: 0.05,
      value: tailConfig.globalSizeMul ?? 1,
    });
    setNumberInput(platformWidthInput, { min: 40, max: 260, step: 1, value: config.platforms.width });
    setNumberInput(platformHeightInput, {
      min: 8,
      max: 80,
      step: 1,
      value: config.platforms.height,
    });
    setNumberInput(platformHorizontalRangeInput, {
      min: 0,
      max: 0.9,
      step: 0.01,
      value: config.platforms.horizontalRange,
    });
    setNumberInput(platformMinGapInput, {
      min: 40,
      max: 600,
      step: 1,
      value: config.platforms.minGap,
    });
    setNumberInput(platformMaxGapInput, {
      min: 40,
      max: 600,
      step: 1,
      value: config.platforms.maxGap,
    });
    setNumberInput(platformStartCountInput, {
      min: 0,
      max: 40,
      step: 1,
      value: config.platforms.startCount,
    });
    platformDestroyInput.checked = Boolean(config.platforms.destroyOnJump);
    platformRespawnInput.checked = Boolean(config.platforms.respawnOnGround);
    setNumberInput(platformFadeInput, {
      min: 0,
      max: 2,
      step: 0.05,
      value: config.platforms.fadeDuration,
    });
    setNumberInput(platformDescentInput, {
      min: -300,
      max: 300,
      step: 1,
      value: config.platforms.descentSpeed,
    });
    renderPlatformColors();
    updateColorControls();
    setLockedProgress(viewerState.lockedProgress);
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

  function renderPlatformColors() {
    platformColorsWrap.innerHTML = "";
    const colors = Array.isArray(config.platforms.colors) ? config.platforms.colors : [];
    config.platforms.colors = colors;
    colors.forEach((color, index) => {
      const row = document.createElement("div");
      row.className = "tail-viewer__platform-color";
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = color;
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.value = color;
      colorInput.addEventListener("input", () => {
        config.platforms.colors[index] = colorInput.value;
        textInput.value = colorInput.value;
      });
      textInput.addEventListener("change", () => {
        config.platforms.colors[index] = textInput.value;
        if (textInput.value.startsWith("#")) {
          colorInput.value = textInput.value;
        }
      });
      row.appendChild(colorInput);
      row.appendChild(textInput);
      platformColorsWrap.appendChild(row);
    });
  }

  function refreshLayerList() {
    layerButtons.innerHTML = "";
    tailConfig.layers.forEach((layer, index) => {
      const name = layer.name ? ` ${layer.name}` : "";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tail-viewer__layer-button";
      if (index === activeIndex) {
        button.classList.add("is-active");
      }
      button.textContent = String(index + 1);
      button.title = `${index + 1}.${name} [${layer.mode}/${layer.shape}]`;
      button.addEventListener("click", () => {
        activeIndex = clampIndex(index, tailConfig.layers.length);
        refreshLayerList();
        refreshControls();
      });
      layerButtons.appendChild(button);
    });
  }

  function handleSpawnRateInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.baseSpawnRate = Number(spawnInput.value);
  }

  function handleMaxSpawnRateInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.maxSpawnRate = Number(maxSpawnInput.value);
  }

  function handleSizeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.size = Number(sizeInput.value);
  }

  function handleSizeJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.sizeJitter = Number(sizeJitterInput.value);
  }

  function handleLifeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.life = Number(lifeInput.value);
  }

  function handleLifeJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.lifeJitter = Number(lifeJitterInput.value);
  }

  function handleAlphaInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.alpha = Number(alphaInput.value);
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
  }

  function handleFollowStrengthInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.followStrength = Number(followStrengthInput.value);
  }

  function handleOffsetRadiusInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.offsetRadius = Number(offsetRadiusInput.value);
  }

  function handleOffsetBiasInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.offsetBias = Number(offsetBiasInput.value);
  }

  function handleDriftSpeedInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.driftSpeed = Number(driftSpeedInput.value);
  }

  function handleDriftJitterInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.driftJitter = Number(driftJitterInput.value);
  }

  function handleGravityInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.gravity = Number(gravityInput.value);
  }

  function handleAirPushInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.airPush = Number(airPushInput.value);
  }

  function handleSnapToggle() {
    tailConfig.snapToGrid = snapToggle.checked;
  }

  function handleGridInput() {
    tailConfig.gridSize = Number(gridInput.value);
  }

  function handleGlobalAlphaInput() {
    tailConfig.globalAlpha = Number(globalAlphaInput.value);
  }

  function handleGlobalSpawnInput() {
    tailConfig.globalSpawnMul = Number(globalSpawnInput.value);
  }

  function handleGlobalLifeInput() {
    tailConfig.globalLifeMul = Number(globalLifeInput.value);
  }

  function handleGlobalSizeInput() {
    tailConfig.globalSizeMul = Number(globalSizeInput.value);
  }

  function updateExistingPlatforms() {
    const width = config.platforms.width;
    const height = config.platforms.height;
    state.platforms.forEach((platform) => {
      platform.width = width;
      platform.height = height;
    });
  }

  function handlePlatformWidthInput() {
    const value = Number(platformWidthInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.width = value;
    updateExistingPlatforms();
  }

  function handlePlatformHeightInput() {
    const value = Number(platformHeightInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.height = value;
    updateExistingPlatforms();
  }

  function handlePlatformHorizontalRangeInput() {
    const value = Number(platformHorizontalRangeInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.horizontalRange = clampNumber(value, 0, 1);
    platformHorizontalRangeInput.value = String(config.platforms.horizontalRange);
  }

  function handlePlatformMinGapInput() {
    const value = Number(platformMinGapInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.minGap = value;
    if (config.platforms.minGap > config.platforms.maxGap) {
      config.platforms.maxGap = config.platforms.minGap;
      platformMaxGapInput.value = String(config.platforms.maxGap);
    }
  }

  function handlePlatformMaxGapInput() {
    const value = Number(platformMaxGapInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.maxGap = value;
    if (config.platforms.maxGap < config.platforms.minGap) {
      config.platforms.minGap = config.platforms.maxGap;
      platformMinGapInput.value = String(config.platforms.minGap);
    }
  }

  function handlePlatformStartCountInput() {
    const value = Number(platformStartCountInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.startCount = Math.max(0, Math.floor(value));
    platformStartCountInput.value = String(config.platforms.startCount);
  }

  function handlePlatformDestroyInput() {
    config.platforms.destroyOnJump = platformDestroyInput.checked;
  }

  function handlePlatformRespawnInput() {
    config.platforms.respawnOnGround = platformRespawnInput.checked;
  }

  function handlePlatformFadeInput() {
    const value = Number(platformFadeInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.fadeDuration = Math.max(0, value);
    platformFadeInput.value = String(config.platforms.fadeDuration);
  }

  function handlePlatformDescentInput() {
    const value = Number(platformDescentInput.value);
    if (!Number.isFinite(value)) return;
    config.platforms.descentSpeed = value;
  }

  function bindNumberInput(input, handler) {
    input.addEventListener("input", handler);
    input.addEventListener(
      "wheel",
      (event) => {
        if (document.activeElement !== input && !input.matches(":hover")) return;
        event.preventDefault();
        const step = Number.isFinite(Number(input.step)) ? Number(input.step) : 1;
        if (step === 0) return;
        const delta = event.deltaY < 0 ? step : -step;
        const current = Number(input.value);
        const rawValue = Number.isFinite(current) ? current + delta : delta;
        const min = input.min === "" ? undefined : Number(input.min);
        const max = input.max === "" ? undefined : Number(input.max);
        const next = clampNumber(
          rawValue,
          Number.isFinite(min) ? min : undefined,
          Number.isFinite(max) ? max : undefined
        );
        input.value = String(next);
        handler();
      },
      { passive: false }
    );
  }

  bindNumberInput(spawnInput, handleSpawnRateInput);
  bindNumberInput(maxSpawnInput, handleMaxSpawnRateInput);
  bindNumberInput(sizeInput, handleSizeInput);
  bindNumberInput(sizeJitterInput, handleSizeJitterInput);
  bindNumberInput(lifeInput, handleLifeInput);
  bindNumberInput(lifeJitterInput, handleLifeJitterInput);
  bindNumberInput(alphaInput, handleAlphaInput);
  enabledInput.addEventListener("change", handleEnabledInput);
  bindNumberInput(enabledAtInput, handleEnabledAtInput);
  modeSelect.addEventListener("change", handleModeSelect);
  shapeSelect.addEventListener("change", handleShapeSelect);
  colorModeSelect.addEventListener("change", handleColorModeSelect);
  colorInput.addEventListener("input", handleColorInput);
  colorTextInput.addEventListener("change", handleColorTextInput);
  paletteInput.addEventListener("change", handlePaletteInput);
  bindNumberInput(paletteBlendInput, handlePaletteBlendInput);
  bindNumberInput(followStrengthInput, handleFollowStrengthInput);
  bindNumberInput(offsetRadiusInput, handleOffsetRadiusInput);
  bindNumberInput(offsetBiasInput, handleOffsetBiasInput);
  bindNumberInput(driftSpeedInput, handleDriftSpeedInput);
  bindNumberInput(driftJitterInput, handleDriftJitterInput);
  bindNumberInput(gravityInput, handleGravityInput);
  bindNumberInput(airPushInput, handleAirPushInput);
  snapToggle.addEventListener("change", handleSnapToggle);
  bindNumberInput(gridInput, handleGridInput);
  bindNumberInput(globalAlphaInput, handleGlobalAlphaInput);
  bindNumberInput(globalSpawnInput, handleGlobalSpawnInput);
  bindNumberInput(globalLifeInput, handleGlobalLifeInput);
  bindNumberInput(globalSizeInput, handleGlobalSizeInput);
  bindNumberInput(platformWidthInput, handlePlatformWidthInput);
  bindNumberInput(platformHeightInput, handlePlatformHeightInput);
  bindNumberInput(platformHorizontalRangeInput, handlePlatformHorizontalRangeInput);
  bindNumberInput(platformMinGapInput, handlePlatformMinGapInput);
  bindNumberInput(platformMaxGapInput, handlePlatformMaxGapInput);
  bindNumberInput(platformStartCountInput, handlePlatformStartCountInput);
  platformDestroyInput.addEventListener("change", handlePlatformDestroyInput);
  platformRespawnInput.addEventListener("change", handlePlatformRespawnInput);
  bindNumberInput(platformFadeInput, handlePlatformFadeInput);
  bindNumberInput(platformDescentInput, handlePlatformDescentInput);

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

  function togglePanel() {
    panel.classList.toggle("hidden");
    if (performanceMonitor) {
      performanceMonitor.classList.toggle("hidden", panel.classList.contains("hidden"));
    }
    viewerState.locked = !panel.classList.contains("hidden");
    if (viewerState.locked) {
      viewerState.lockedProgress = tailEmitter?.getIntensity?.() ?? 0;
      setLockedProgress(viewerState.lockedProgress);
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
