import { CONFIG } from "./config.js";
import { ParticleSystem } from "./particlesystem.js";
import { LayeredParticleTail } from "./particletail.js";
import { spawnPlatformBurst } from "./particleplatform.js";
import { AssetManager } from "./assetmanager.js";
import { applyConfigOverrides } from "./configloader.js";

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
  assetManager: null,
  configInfo: null,
  render: {
    sceneCanvas: null,
    sceneCtx: null,
    pixelCanvas: null,
    pixelCtx: null,
    overlayCanvas: null,
    overlayCtx: null,
  },
  metrics: {
    frames: 0,
    frameTime: 0,
    fps: 0,
    particles: 0,
  },
};

class SoundSystem {
  constructor(config, assetManager) {
    this.enabled = config.enabled;
    this.volume = config.volume;
    this.started = false;
    this.assetManager = assetManager;
    this.background = assetManager.getAudioPool("background");
    this.sfx = {
      jump: assetManager.getAudioPool("jump"),
      platform: assetManager.getAudioPool("platform"),
      fall: assetManager.getAudioPool("fall"),
    };
    this.configurePool(this.background, { loop: true, volume: this.volume * 0.6 });
    this.configurePool(this.sfx.jump, { loop: false, volume: this.volume });
    this.configurePool(this.sfx.platform, { loop: false, volume: this.volume });
    this.configurePool(this.sfx.fall, { loop: false, volume: this.volume });
  }

  configurePool(pool, { loop, volume }) {
    pool.forEach((audio) => {
      audio.loop = loop;
      audio.volume = volume;
    });
  }

  start() {
    if (this.started || !this.enabled) return;
    this.started = true;
    this.background.forEach((audio) => {
      audio.currentTime = 0;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function updateCamera() {
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
  updateCamera();
  updatePlatforms(dt);
  updateParticles(dt);
  updateTail(dt);
  updateMetrics(dt);
  if (state.running) {
    maybeRescuePlatform();
  }
}

function renderParallax(renderCtx) {
  state.parallaxLayers.forEach((layer) => {
    renderCtx.fillStyle = layer.color;
    renderCtx.fillRect(
      0,
      state.cameraY,
      CONFIG.viewport.virtualWidth,
      CONFIG.viewport.virtualHeight
    );
    layer.dots.forEach((dot) => {
      const y = ((dot.y + state.cameraY * layer.speed) % (CONFIG.viewport.virtualHeight * 2) +
        CONFIG.viewport.virtualHeight * 2) %
        (CONFIG.viewport.virtualHeight * 2);
      renderCtx.fillStyle = `${layer.dotColor}${Math.floor(dot.alpha * 255).toString(16).padStart(2, "0")}`;
      renderCtx.beginPath();
      renderCtx.arc(dot.x, y, dot.size, 0, Math.PI * 2);
      renderCtx.fill();
    });
  });
}

function renderPlatforms(renderCtx) {
  state.platforms.forEach((platform) => {
    if (platform.destroyed) return;
    if (platform.alpha <= 0) return;
    renderCtx.globalAlpha = platform.alpha;
    renderCtx.fillStyle = platform.color;
    renderCtx.fillRect(platform.x, platform.y, platform.width, platform.height);
    renderCtx.globalAlpha = 1;
  });
}

function renderParticles(renderCtx) {
  state.particleSystem.render(renderCtx);
}

function renderPlayer(renderCtx) {
  renderCtx.fillStyle = CONFIG.player.color;
  renderCtx.beginPath();
  renderCtx.arc(state.player.x, state.player.y, state.player.radius, 0, Math.PI * 2);
  renderCtx.fill();
}

function renderGround(renderCtx) {
  renderCtx.fillStyle = CONFIG.ground.color;
  renderCtx.fillRect(0, CONFIG.viewport.virtualHeight - CONFIG.ground.height, CONFIG.viewport.virtualWidth, CONFIG.ground.height);
}

function renderScene() {
  const renderCtx = state.render.sceneCtx;
  renderCtx.setTransform(1, 0, 0, 1, 0, 0);
  renderCtx.clearRect(0, 0, CONFIG.viewport.virtualWidth, CONFIG.viewport.virtualHeight);
  renderCtx.save();
  renderCtx.translate(0, -state.cameraY);
  renderCtx.fillStyle = CONFIG.viewport.backgroundColor;
  renderCtx.fillRect(0, state.cameraY, CONFIG.viewport.virtualWidth, CONFIG.viewport.virtualHeight);
  renderParallax(renderCtx);
  renderParticles(renderCtx);
  renderPlatforms(renderCtx);
  renderPlayer(renderCtx);
  renderGround(renderCtx);
  renderCtx.restore();
}

function shouldPixelate() {
  return CONFIG.pixelOverlay.enabled && CONFIG.pixelOverlay.gridSize > 1;
}

function renderPixelated() {
  const { pixelCanvas, pixelCtx, sceneCanvas } = state.render;
  pixelCtx.setTransform(1, 0, 0, 1, 0, 0);
  pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
  pixelCtx.imageSmoothingEnabled = true;
  pixelCtx.drawImage(sceneCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pixelCanvas, 0, 0, canvas.width, canvas.height);
}

function renderDirect() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(state.render.sceneCanvas, 0, 0, canvas.width, canvas.height);
}

function renderPixelOverlayMask() {
  if (!CONFIG.pixelOverlay.enabled) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(state.render.overlayCanvas, 0, 0);
}

function render() {
  renderScene();
  if (shouldPixelate()) {
    renderPixelated();
  } else {
    renderDirect();
  }
  renderPixelOverlayMask();
}

function loop(timestamp) {
  const time = timestamp / 1000;
  const dt = Math.min(0.033, time - state.lastTime || 0);
  state.lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function updatePixelCanvas() {
  const { pixelCanvas } = state.render;
  const gridSize = clamp(CONFIG.pixelOverlay.gridSize ?? 1, 1, 10);
  const width = Math.max(1, Math.floor(canvas.width / gridSize));
  const height = Math.max(1, Math.floor(canvas.height / gridSize));
  pixelCanvas.width = width;
  pixelCanvas.height = height;
}

function parsePattern(pattern) {
  if (!pattern) return [];
  return pattern
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function updatePixelOverlayMask() {
  const { overlayCanvas, overlayCtx } = state.render;
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (!CONFIG.pixelOverlay.enabled) return;

  const gridSize = clamp(CONFIG.pixelOverlay.gridSize ?? 1, 1, 10);
  const rows = parsePattern(CONFIG.pixelOverlay.pattern);
  if (rows.length === 0) return;
  const rowCount = rows.length;
  const colCount = Math.max(...rows.map((row) => row.length));
  if (colCount <= 0) return;

  overlayCtx.fillStyle = "#000000";
  for (let y = 0; y < overlayCanvas.height; y += gridSize) {
    const rowIndex = Math.floor((y / gridSize) % rowCount);
    const row = rows[rowIndex];
    for (let x = 0; x < overlayCanvas.width; x += gridSize) {
      const colIndex = Math.floor((x / gridSize) % colCount);
      const cell = row[colIndex % row.length] ?? "0";
      if (cell === "_") {
        overlayCtx.fillRect(x, y, gridSize, gridSize);
      }
    }
  }
}

function resize() {
  const scale = window.innerHeight / CONFIG.viewport.virtualHeight;
  const displayWidth = CONFIG.viewport.virtualWidth * scale;
  canvas.width = displayWidth;
  canvas.height = window.innerHeight;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  state.scale = scale;
  updatePixelCanvas();
  updatePixelOverlayMask();
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
  const pixelOverlayEnabledInput = panel.querySelector("[data-control=\"pixelOverlayEnabled\"]");
  const pixelOverlayGridInput = panel.querySelector("[data-control=\"pixelOverlayGrid\"]");
  const pixelOverlayPresetSelect = panel.querySelector("[data-control=\"pixelOverlayPreset\"]");
  const pixelOverlayPatternInput = panel.querySelector("[data-control=\"pixelOverlayPattern\"]");
  const configSelect = panel.querySelector("[data-control=\"configSelect\"]");
  const configReload = panel.querySelector("[data-action=\"configReload\"]");
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
  const lifeMinInput = panel.querySelector("[data-control=\"lifeMin\"]");
  const lifeMaxInput = panel.querySelector("[data-control=\"lifeMax\"]");
  const scaleFromMinInput = panel.querySelector("[data-control=\"scaleFromMin\"]");
  const scaleFromMaxInput = panel.querySelector("[data-control=\"scaleFromMax\"]");
  const scaleToMinInput = panel.querySelector("[data-control=\"scaleToMin\"]");
  const scaleToMaxInput = panel.querySelector("[data-control=\"scaleToMax\"]");
  const alphaFromMinInput = panel.querySelector("[data-control=\"alphaFromMin\"]");
  const alphaFromMaxInput = panel.querySelector("[data-control=\"alphaFromMax\"]");
  const alphaToMinInput = panel.querySelector("[data-control=\"alphaToMin\"]");
  const alphaToMaxInput = panel.querySelector("[data-control=\"alphaToMax\"]");
  const rotationFromMinInput = panel.querySelector("[data-control=\"rotationFromMin\"]");
  const rotationFromMaxInput = panel.querySelector("[data-control=\"rotationFromMax\"]");
  const rotationToMinInput = panel.querySelector("[data-control=\"rotationToMin\"]");
  const rotationToMaxInput = panel.querySelector("[data-control=\"rotationToMax\"]");
  const angularSpeedMinInput = panel.querySelector("[data-control=\"angularSpeedMin\"]");
  const angularSpeedMaxInput = panel.querySelector("[data-control=\"angularSpeedMax\"]");
  const enabledInput = panel.querySelector("[data-control=\"layerEnabled\"]");
  const enabledAtInput = panel.querySelector("[data-control=\"enabledAt\"]");
  const modeSelect = panel.querySelector("[data-control=\"mode\"]");
  const shapeSelect = panel.querySelector("[data-control=\"shape\"]");
  const textureSelect = panel.querySelector("[data-control=\"texture\"]");
  const colorModeSelect = panel.querySelector("[data-control=\"colorMode\"]");
  const colorFromInput = panel.querySelector("[data-control=\"colorFrom\"]");
  const colorFromTextInput = panel.querySelector("[data-control=\"colorFromText\"]");
  const colorToInput = panel.querySelector("[data-control=\"colorTo\"]");
  const colorToTextInput = panel.querySelector("[data-control=\"colorToText\"]");
  const paletteInput = panel.querySelector("[data-control=\"palette\"]");
  const paletteBlendInput = panel.querySelector("[data-control=\"paletteBlend\"]");
  const speedModeSelect = panel.querySelector("[data-control=\"speedMode\"]");
  const speedVxMinInput = panel.querySelector("[data-control=\"speedVxMin\"]");
  const speedVxMaxInput = panel.querySelector("[data-control=\"speedVxMax\"]");
  const speedVyMinInput = panel.querySelector("[data-control=\"speedVyMin\"]");
  const speedVyMaxInput = panel.querySelector("[data-control=\"speedVyMax\"]");
  const speedAngleStartInput = panel.querySelector("[data-control=\"speedAngleStart\"]");
  const speedAngleEndInput = panel.querySelector("[data-control=\"speedAngleEnd\"]");
  const speedMinInput = panel.querySelector("[data-control=\"speedMin\"]");
  const speedMaxInput = panel.querySelector("[data-control=\"speedMax\"]");
  const followStrengthInput = panel.querySelector("[data-control=\"followStrength\"]");
  const offsetRadiusInput = panel.querySelector("[data-control=\"offsetRadius\"]");
  const offsetBiasInput = panel.querySelector("[data-control=\"offsetBias\"]");
  const gravityXInput = panel.querySelector("[data-control=\"gravityX\"]");
  const gravityYInput = panel.querySelector("[data-control=\"gravityY\"]");
  const airDragInput = panel.querySelector("[data-control=\"airDrag\"]");
  const fixedColorRows = panel.querySelectorAll("[data-color-fixed]");
  const paletteRows = panel.querySelectorAll("[data-color-palette]");
  const speedModeSections = panel.querySelectorAll("[data-speed-mode]");
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
    !lifeMinInput ||
    !lifeMaxInput ||
    !scaleFromMinInput ||
    !scaleFromMaxInput ||
    !scaleToMinInput ||
    !scaleToMaxInput ||
    !alphaFromMinInput ||
    !alphaFromMaxInput ||
    !alphaToMinInput ||
    !alphaToMaxInput ||
    !rotationFromMinInput ||
    !rotationFromMaxInput ||
    !rotationToMinInput ||
    !rotationToMaxInput ||
    !angularSpeedMinInput ||
    !angularSpeedMaxInput ||
    !enabledInput ||
    !enabledAtInput ||
    !modeSelect ||
    !shapeSelect ||
    !textureSelect ||
    !colorModeSelect ||
    !colorFromInput ||
    !colorFromTextInput ||
    !colorToInput ||
    !colorToTextInput ||
    !paletteInput ||
    !paletteBlendInput ||
    !speedModeSelect ||
    !speedVxMinInput ||
    !speedVxMaxInput ||
    !speedVyMinInput ||
    !speedVyMaxInput ||
    !speedAngleStartInput ||
    !speedAngleEndInput ||
    !speedMinInput ||
    !speedMaxInput ||
    !followStrengthInput ||
    !offsetRadiusInput ||
    !offsetBiasInput ||
    !gravityXInput ||
    !gravityYInput ||
    !airDragInput ||
    fixedColorRows.length === 0 ||
    paletteRows.length === 0 ||
    speedModeSections.length === 0 ||
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
    !platformDescentInput ||
    !pixelOverlayEnabledInput ||
    !pixelOverlayGridInput ||
    !pixelOverlayPresetSelect ||
    !pixelOverlayPatternInput ||
    !configSelect ||
    !configReload
  ) {
    return null;
  }

  const defaultTailConfig = JSON.parse(JSON.stringify(tailConfig));
  const viewerState = {
    locked: panel.classList.contains("hidden") ? false : true,
    lockedProgress: tailEmitter?.getIntensity?.() ?? 0,
    speedModes: {},
    speedAngles: {},
  };

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

  function ensureRange(range, fallbackMin, fallbackMax) {
    if (typeof range === "number") {
      return { min: range, max: range };
    }
    if (!range || typeof range !== "object") {
      return { min: fallbackMin, max: fallbackMax ?? fallbackMin };
    }
    return {
      min: Number.isFinite(range.min) ? range.min : fallbackMin,
      max: Number.isFinite(range.max) ? range.max : range.min ?? fallbackMin,
    };
  }

  function setRangeInputs(range, minInput, maxInput, options = {}) {
    setNumberInput(minInput, { ...options, value: range.min });
    setNumberInput(maxInput, { ...options, value: range.max });
  }

  function getSpeedMode(layerIndex) {
    return viewerState.speedModes[layerIndex] ?? "vector";
  }

  function setSpeedMode(layerIndex, mode) {
    viewerState.speedModes[layerIndex] = mode;
  }

  function normalizeAngle(radians) {
    const twoPi = Math.PI * 2;
    return ((radians % twoPi) + twoPi) % twoPi;
  }

  function angleInRange(angle, start, end) {
    if (start <= end) {
      return angle >= start && angle <= end;
    }
    return angle >= start || angle <= end;
  }

  function trigBounds(start, end, fn, criticals) {
    const points = [start, end, ...criticals];
    const values = points
      .filter((point) => angleInRange(point, start, end))
      .map((point) => fn(point));
    if (values.length === 0) {
      values.push(fn(start), fn(end));
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  function applyDirectionalSpeed(layer) {
    const angles = viewerState.speedAngles[activeIndex] ?? {
      start: -30,
      end: 30,
      min: 0,
      max: 0,
    };
    const startRad = normalizeAngle((angles.start * Math.PI) / 180);
    const endRad = normalizeAngle((angles.end * Math.PI) / 180);
    const speedMin = Math.max(0, angles.min);
    const speedMax = Math.max(speedMin, angles.max);

    const cosBounds = trigBounds(startRad, endRad, Math.cos, [0, Math.PI]);
    const sinBounds = trigBounds(startRad, endRad, Math.sin, [Math.PI / 2, (3 * Math.PI) / 2]);

    const vxCandidates = [
      cosBounds.min * speedMin,
      cosBounds.min * speedMax,
      cosBounds.max * speedMin,
      cosBounds.max * speedMax,
    ];
    const vyCandidates = [
      sinBounds.min * speedMin,
      sinBounds.min * speedMax,
      sinBounds.max * speedMin,
      sinBounds.max * speedMax,
    ];

    layer.speed = {
      vx: { min: Math.min(...vxCandidates), max: Math.max(...vxCandidates) },
      vy: { min: Math.min(...vyCandidates), max: Math.max(...vyCandidates) },
    };
  }

  function refreshSpeedMode() {
    const mode = getSpeedMode(activeIndex);
    speedModeSelect.value = mode;
    speedModeSections.forEach((section) => {
      section.style.display = section.dataset.speedMode === mode ? "flex" : "none";
    });
  }

  function setLockedProgress(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    viewerState.lockedProgress = clamped;
    if (viewerState.locked) {
      tailEmitter.setIntensity(clamped);
    }
  }

  if (performanceMonitor) {
    performanceMonitor.classList.toggle("hidden", panel.classList.contains("hidden"));
  }

  function refreshControls() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;

    const lifeRange = ensureRange(layer.life, 0.1, 1);
    const scaleFromRange = ensureRange(layer.scaleFrom, 1, 1);
    const scaleToRange = ensureRange(layer.scaleTo ?? layer.scaleFrom, scaleFromRange.min, scaleFromRange.max);
    const alphaFromRange = ensureRange(layer.alphaFrom, 0, 1);
    const alphaToRange = ensureRange(layer.alphaTo ?? layer.alphaFrom, alphaFromRange.min, alphaFromRange.max);
    const rotationFromRange = ensureRange(layer.rotationFrom, 0, 0);
    const rotationToRange = ensureRange(layer.rotationTo ?? layer.rotationFrom, rotationFromRange.min, rotationFromRange.max);
    const angularSpeedRange = ensureRange(layer.angularSpeed, 0, 0);

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

    setRangeInputs(lifeRange, lifeMinInput, lifeMaxInput, { min: 0.1, max: 5, step: 0.05 });
    setRangeInputs(scaleFromRange, scaleFromMinInput, scaleFromMaxInput, { min: 0.1, max: 20, step: 0.1 });
    setRangeInputs(scaleToRange, scaleToMinInput, scaleToMaxInput, { min: 0.1, max: 20, step: 0.1 });
    setRangeInputs(alphaFromRange, alphaFromMinInput, alphaFromMaxInput, { min: 0, max: 1, step: 0.01 });
    setRangeInputs(alphaToRange, alphaToMinInput, alphaToMaxInput, { min: 0, max: 1, step: 0.01 });
    setRangeInputs(rotationFromRange, rotationFromMinInput, rotationFromMaxInput, { min: -360, max: 360, step: 1 });
    setRangeInputs(rotationToRange, rotationToMinInput, rotationToMaxInput, { min: -360, max: 360, step: 1 });
    setRangeInputs(angularSpeedRange, angularSpeedMinInput, angularSpeedMaxInput, { min: -720, max: 720, step: 1 });

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
    const colorFrom = layer.colorFrom ?? layer.color ?? "#ffffff";
    const colorTo = layer.colorTo ?? layer.color ?? "#ffffff";
    colorFromInput.value = colorFrom;
    colorFromTextInput.value = colorFrom;
    colorToInput.value = colorTo;
    colorToTextInput.value = colorTo;
    paletteInput.value = Array.isArray(layer.palette) ? layer.palette.join(", ") : "";

    setNumberInput(paletteBlendInput, {
      min: 0,
      max: 1,
      step: 0.01,
      value: layer.paletteBlend ?? 0,
    });

    const speedRange = layer.speed ?? { vx: { min: 0, max: 0 }, vy: { min: 0, max: 0 } };
    const vxRange = ensureRange(speedRange.vx, 0, 0);
    const vyRange = ensureRange(speedRange.vy, 0, 0);
    setRangeInputs(vxRange, speedVxMinInput, speedVxMaxInput, { min: -500, max: 500, step: 1 });
    setRangeInputs(vyRange, speedVyMinInput, speedVyMaxInput, { min: -500, max: 500, step: 1 });

    if (!viewerState.speedAngles[activeIndex]) {
      viewerState.speedAngles[activeIndex] = {
        start: -30,
        end: 30,
        min: 0,
        max: Math.max(Math.abs(vxRange.min), Math.abs(vxRange.max), Math.abs(vyRange.min), Math.abs(vyRange.max)),
      };
    }

    const speedAngles = viewerState.speedAngles[activeIndex];
    setNumberInput(speedAngleStartInput, { min: -180, max: 180, step: 1, value: speedAngles.start });
    setNumberInput(speedAngleEndInput, { min: -180, max: 180, step: 1, value: speedAngles.end });
    setNumberInput(speedMinInput, { min: 0, max: 500, step: 1, value: speedAngles.min });
    setNumberInput(speedMaxInput, { min: 0, max: 500, step: 1, value: speedAngles.max });

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
    setNumberInput(gravityXInput, { min: -200, max: 200, step: 1, value: layer.gravity?.x ?? 0 });
    setNumberInput(gravityYInput, { min: -200, max: 200, step: 1, value: layer.gravity?.y ?? 0 });
    setNumberInput(airDragInput, { min: 0, max: 1, step: 0.01, value: layer.airDrag ?? 0 });

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
    refreshSpeedMode();
    updateTextureOptions();

    pixelOverlayEnabledInput.checked = Boolean(config.pixelOverlay.enabled);
    setNumberInput(pixelOverlayGridInput, { min: 1, max: 10, step: 1, value: config.pixelOverlay.gridSize });
    updatePixelOverlayPresets();
    pixelOverlayPatternInput.value = config.pixelOverlay.pattern ?? "";

    updateConfigSelect();
    setLockedProgress(viewerState.lockedProgress);
  }

  function updateColorControls() {
    const mode = colorModeSelect.value;
    fixedColorRows.forEach((row) => {
      row.style.display = mode === "fixed" ? "grid" : "none";
    });
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

  function updateRangeFromInputs(target, minInput, maxInput) {
    const minValue = Number(minInput.value);
    const maxValue = Number(maxInput.value);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return;
    if (minValue > maxValue) {
      target.min = maxValue;
      target.max = minValue;
      minInput.value = String(target.min);
      maxInput.value = String(target.max);
      return;
    }
    target.min = minValue;
    target.max = maxValue;
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

  function handleLifeRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.life = ensureRange(layer.life, 0.1, 1);
    updateRangeFromInputs(layer.life, lifeMinInput, lifeMaxInput);
  }

  function handleScaleFromRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.scaleFrom = ensureRange(layer.scaleFrom, 1, 1);
    updateRangeFromInputs(layer.scaleFrom, scaleFromMinInput, scaleFromMaxInput);
  }

  function handleScaleToRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.scaleTo = ensureRange(layer.scaleTo, 1, 1);
    updateRangeFromInputs(layer.scaleTo, scaleToMinInput, scaleToMaxInput);
  }

  function handleAlphaFromRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.alphaFrom = ensureRange(layer.alphaFrom, 1, 1);
    updateRangeFromInputs(layer.alphaFrom, alphaFromMinInput, alphaFromMaxInput);
  }

  function handleAlphaToRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.alphaTo = ensureRange(layer.alphaTo, 1, 1);
    updateRangeFromInputs(layer.alphaTo, alphaToMinInput, alphaToMaxInput);
  }

  function handleRotationFromRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.rotationFrom = ensureRange(layer.rotationFrom, 0, 0);
    updateRangeFromInputs(layer.rotationFrom, rotationFromMinInput, rotationFromMaxInput);
  }

  function handleRotationToRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.rotationTo = ensureRange(layer.rotationTo, 0, 0);
    updateRangeFromInputs(layer.rotationTo, rotationToMinInput, rotationToMaxInput);
  }

  function handleAngularSpeedRangeInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.angularSpeed = ensureRange(layer.angularSpeed, 0, 0);
    updateRangeFromInputs(layer.angularSpeed, angularSpeedMinInput, angularSpeedMaxInput);
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

  function handleTextureSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    const value = textureSelect.value;
    layer.texture = value === "none" ? null : value;
  }

  function handleColorModeSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorMode = colorModeSelect.value;
    updateColorControls();
    refreshLayerList();
  }

  function handleColorFromInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorFrom = colorFromInput.value;
    colorFromTextInput.value = colorFromInput.value;
  }

  function handleColorFromTextInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorFrom = colorFromTextInput.value;
    if (colorFromTextInput.value.startsWith("#")) {
      colorFromInput.value = colorFromTextInput.value;
    }
  }

  function handleColorToInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorTo = colorToInput.value;
    colorToTextInput.value = colorToInput.value;
  }

  function handleColorToTextInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.colorTo = colorToTextInput.value;
    if (colorToTextInput.value.startsWith("#")) {
      colorToInput.value = colorToTextInput.value;
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

  function handleSpeedModeSelect() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    setSpeedMode(activeIndex, speedModeSelect.value);
    if (speedModeSelect.value === "direction") {
      applyDirectionalSpeed(layer);
    }
    refreshSpeedMode();
  }

  function handleSpeedVectorInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    if (!layer.speed) {
      layer.speed = { vx: { min: 0, max: 0 }, vy: { min: 0, max: 0 } };
    }
    layer.speed.vx = ensureRange(layer.speed.vx, 0, 0);
    layer.speed.vy = ensureRange(layer.speed.vy, 0, 0);
    updateRangeFromInputs(layer.speed.vx, speedVxMinInput, speedVxMaxInput);
    updateRangeFromInputs(layer.speed.vy, speedVyMinInput, speedVyMaxInput);
  }

  function handleSpeedDirectionInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    viewerState.speedAngles[activeIndex] = {
      start: Number(speedAngleStartInput.value),
      end: Number(speedAngleEndInput.value),
      min: Number(speedMinInput.value),
      max: Number(speedMaxInput.value),
    };
    applyDirectionalSpeed(layer);
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

  function handleGravityInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.gravity = {
      x: Number(gravityXInput.value),
      y: Number(gravityYInput.value),
    };
  }

  function handleAirDragInput() {
    const layer = tailConfig.layers[activeIndex];
    if (!layer) return;
    layer.airDrag = Number(airDragInput.value);
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

  function handlePixelOverlayEnabledInput() {
    config.pixelOverlay.enabled = pixelOverlayEnabledInput.checked;
    updatePixelCanvas();
    updatePixelOverlayMask();
  }

  function handlePixelOverlayGridInput() {
    const value = Number(pixelOverlayGridInput.value);
    if (!Number.isFinite(value)) return;
    config.pixelOverlay.gridSize = clampNumber(value, 1, 10);
    pixelOverlayGridInput.value = String(config.pixelOverlay.gridSize);
    updatePixelCanvas();
    updatePixelOverlayMask();
  }

  function handlePixelOverlayPresetSelect() {
    const preset = pixelOverlayPresetSelect.value;
    if (!preset || preset === "custom") return;
    config.pixelOverlay.pattern = config.pixelOverlay.presets[preset] ?? config.pixelOverlay.pattern;
    pixelOverlayPatternInput.value = config.pixelOverlay.pattern;
    updatePixelOverlayMask();
  }

  function handlePixelOverlayPatternInput() {
    config.pixelOverlay.pattern = pixelOverlayPatternInput.value;
    updatePixelOverlayMask();
  }

  function updatePixelOverlayPresets() {
    const presets = config.pixelOverlay.presets ?? {};
    pixelOverlayPresetSelect.innerHTML = "";
    const customOption = document.createElement("option");
    customOption.value = "custom";
    customOption.textContent = "Custom";
    pixelOverlayPresetSelect.appendChild(customOption);
    Object.keys(presets).forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key;
      pixelOverlayPresetSelect.appendChild(option);
    });
    pixelOverlayPresetSelect.value = "custom";
  }

  function updateConfigSelect() {
    const available = config.configFiles?.available ?? [];
    const selectedPath = state.configInfo?.selectedPath ?? config.configFiles?.defaultPath;
    configSelect.innerHTML = "";
    available.forEach((path) => {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = path;
      if (path === selectedPath) {
        option.selected = true;
      }
      configSelect.appendChild(option);
    });
  }

  function updateTextureOptions() {
    const textures = state.assetManager?.getAvailableParticleTextures?.() ?? [];
    textureSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "none";
    textureSelect.appendChild(noneOption);
    textures.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      textureSelect.appendChild(option);
    });
    textureSelect.value = layerHasTexture() ? tailConfig.layers[activeIndex].texture : "none";
  }

  function layerHasTexture() {
    const layer = tailConfig.layers[activeIndex];
    return layer?.texture && layer.texture !== "none";
  }

  function bindNumberInput(input, handler) {
    input.addEventListener("input", handler);
    input.addEventListener(
      "wheel",
      (event) => {
        if (document.activeElement !== input && !input.matches(":hover")) return;
        event.preventDefault();
        let step = 1;
        if (event.altKey) {
          step *= 0.1;
        }
        if (event.ctrlKey) {
          step *= 10;
        }
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
  bindNumberInput(lifeMinInput, handleLifeRangeInput);
  bindNumberInput(lifeMaxInput, handleLifeRangeInput);
  bindNumberInput(scaleFromMinInput, handleScaleFromRangeInput);
  bindNumberInput(scaleFromMaxInput, handleScaleFromRangeInput);
  bindNumberInput(scaleToMinInput, handleScaleToRangeInput);
  bindNumberInput(scaleToMaxInput, handleScaleToRangeInput);
  bindNumberInput(alphaFromMinInput, handleAlphaFromRangeInput);
  bindNumberInput(alphaFromMaxInput, handleAlphaFromRangeInput);
  bindNumberInput(alphaToMinInput, handleAlphaToRangeInput);
  bindNumberInput(alphaToMaxInput, handleAlphaToRangeInput);
  bindNumberInput(rotationFromMinInput, handleRotationFromRangeInput);
  bindNumberInput(rotationFromMaxInput, handleRotationFromRangeInput);
  bindNumberInput(rotationToMinInput, handleRotationToRangeInput);
  bindNumberInput(rotationToMaxInput, handleRotationToRangeInput);
  bindNumberInput(angularSpeedMinInput, handleAngularSpeedRangeInput);
  bindNumberInput(angularSpeedMaxInput, handleAngularSpeedRangeInput);
  enabledInput.addEventListener("change", handleEnabledInput);
  bindNumberInput(enabledAtInput, handleEnabledAtInput);
  modeSelect.addEventListener("change", handleModeSelect);
  shapeSelect.addEventListener("change", handleShapeSelect);
  textureSelect.addEventListener("change", handleTextureSelect);
  colorModeSelect.addEventListener("change", handleColorModeSelect);
  colorFromInput.addEventListener("input", handleColorFromInput);
  colorFromTextInput.addEventListener("change", handleColorFromTextInput);
  colorToInput.addEventListener("input", handleColorToInput);
  colorToTextInput.addEventListener("change", handleColorToTextInput);
  paletteInput.addEventListener("change", handlePaletteInput);
  bindNumberInput(paletteBlendInput, handlePaletteBlendInput);
  speedModeSelect.addEventListener("change", handleSpeedModeSelect);
  bindNumberInput(speedVxMinInput, handleSpeedVectorInput);
  bindNumberInput(speedVxMaxInput, handleSpeedVectorInput);
  bindNumberInput(speedVyMinInput, handleSpeedVectorInput);
  bindNumberInput(speedVyMaxInput, handleSpeedVectorInput);
  bindNumberInput(speedAngleStartInput, handleSpeedDirectionInput);
  bindNumberInput(speedAngleEndInput, handleSpeedDirectionInput);
  bindNumberInput(speedMinInput, handleSpeedDirectionInput);
  bindNumberInput(speedMaxInput, handleSpeedDirectionInput);
  bindNumberInput(followStrengthInput, handleFollowStrengthInput);
  bindNumberInput(offsetRadiusInput, handleOffsetRadiusInput);
  bindNumberInput(offsetBiasInput, handleOffsetBiasInput);
  bindNumberInput(gravityXInput, handleGravityInput);
  bindNumberInput(gravityYInput, handleGravityInput);
  bindNumberInput(airDragInput, handleAirDragInput);
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
  pixelOverlayEnabledInput.addEventListener("change", handlePixelOverlayEnabledInput);
  bindNumberInput(pixelOverlayGridInput, handlePixelOverlayGridInput);
  pixelOverlayPresetSelect.addEventListener("change", handlePixelOverlayPresetSelect);
  pixelOverlayPatternInput.addEventListener("input", handlePixelOverlayPatternInput);

  configSelect.addEventListener("change", () => {
    const selected = configSelect.value;
    if (!selected) return;
    localStorage.setItem(config.configFiles.storageKey ?? "selectedConfigPath", selected);
    window.location.reload();
  });

  configReload.addEventListener("click", () => {
    window.location.reload();
  });

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
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    togglePanel();
  });

  refreshLayerList();
  refreshControls();
  return { panel, tailEmitter, state: viewerState, metrics };
}

function initRenderSurfaces() {
  const sceneCanvas = document.createElement("canvas");
  sceneCanvas.width = CONFIG.viewport.virtualWidth;
  sceneCanvas.height = CONFIG.viewport.virtualHeight;
  const sceneCtx = sceneCanvas.getContext("2d");

  const pixelCanvas = document.createElement("canvas");
  const pixelCtx = pixelCanvas.getContext("2d");

  const overlayCanvas = document.createElement("canvas");
  const overlayCtx = overlayCanvas.getContext("2d");

  state.render = {
    sceneCanvas,
    sceneCtx,
    pixelCanvas,
    pixelCtx,
    overlayCanvas,
    overlayCtx,
  };
}

function init() {
  state.audio = new SoundSystem(CONFIG.audio, state.assetManager);
  state.particleSystem = new ParticleSystem({
    maxParticles: CONFIG.particles.poolSize,
    assetManager: state.assetManager,
  });
  state.tailEmitter = new LayeredParticleTail(state.particleSystem, CONFIG.particles.tail);
  initParallax();
  initRenderSurfaces();
  state.tailViewer = initTailViewer(CONFIG, state.tailEmitter);
  resize();
  resetGame();
  setupInput();
  window.addEventListener("resize", resize);
  requestAnimationFrame(loop);
}

async function boot() {
  state.configInfo = await applyConfigOverrides(CONFIG, CONFIG.configFiles);
  state.assetManager = new AssetManager({ ...CONFIG.assets, audio: CONFIG.audio });
  if (CONFIG.assets.preload) {
    await state.assetManager.preloadAll();
  }
  init();
}

boot();
