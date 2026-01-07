import { CONFIG } from "./config.js";

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
  particles: [],
  tail: [],
  tailMax: CONFIG.tail.maxLength,
  tailColor: CONFIG.platforms.colors[0],
  tailFading: false,
  nextPlatformY: 0,
  lastPlatformY: 0,
  usedRescueAt: -Infinity,
  audio: null,
  parallaxLayers: [],
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
  state.particles = [];
  state.tail = [];
  state.tailMax = CONFIG.tail.maxLength;
  state.tailColor = CONFIG.platforms.colors[0];
  state.tailFading = false;
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

function addTailPoint(x, y, color) {
  if (state.tailFading) return;
  const last = state.tail[state.tail.length - 1];
  if (last) {
    const dx = x - last.x;
    const dy = y - last.y;
    if (Math.hypot(dx, dy) < CONFIG.tail.segmentSpacing) return;
  }
  state.tail.push({ x, y, color, alpha: CONFIG.tail.baseAlpha });
  if (state.tail.length > state.tailMax) {
    state.tail.splice(0, state.tail.length - state.tailMax);
  }
}

function fadeTail(dt) {
  const fadeAmount = CONFIG.tail.fadePerSecond * dt;
  state.tailMax = Math.max(0, state.tailMax - fadeAmount);
  if (state.tail.length > state.tailMax) {
    state.tail.splice(0, state.tail.length - Math.floor(state.tailMax));
  }
  if (state.tail.length === 0) {
    state.tailFading = false;
  }
}

function spawnParticles(platform) {
  const count = CONFIG.particles.burstCount;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed =
      CONFIG.particles.minSpeed +
      Math.random() * (CONFIG.particles.maxSpeed - CONFIG.particles.minSpeed);
    const depth = Math.random() < CONFIG.particles.farLayerChance ? 0.6 : 1;
    state.particles.push({
      x: platform.x + platform.width / 2,
      y: platform.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: CONFIG.particles.life,
      color: platform.color,
      size: CONFIG.particles.size,
      depth,
    });
  }
}

function updateParticles(dt) {
  state.particles.forEach((p) => {
    p.vy += CONFIG.particles.gravity * dt * p.depth;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  state.particles = state.particles.filter((p) => p.life > 0);
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
  state.cameraTargetY = Math.max(0, targetY);
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
      state.tailFading = true;
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
      state.tailMax += CONFIG.tail.growPerJump;
      state.tailColor = landing.color;
      state.audio.play("jump");
      spawnParticles(landing);

      if (CONFIG.platforms.destroyOnJump || CONFIG.difficulty.mode === "hard") {
        landing.destroyed = true;
      }

      if (landing.rare) {
        state.tailMax += CONFIG.tail.growPerJump;
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
  addTailPoint(state.player.x, state.player.y, state.tailColor);
  if (state.tailFading) {
    fadeTail(dt);
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
  state.particles.forEach((p) => {
    const alpha = easeOutCubic(Math.max(0, p.life / CONFIG.particles.life));
    ctx.fillStyle = `${p.color}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.depth, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderTail() {
  if (state.tail.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < state.tail.length; i += 1) {
    const a = state.tail[i - 1];
    const b = state.tail[i];
    const alpha = easeOutCubic(i / state.tail.length) * CONFIG.tail.baseAlpha;
    ctx.strokeStyle = `${b.color}${Math.floor(alpha * 255).toString(16).padStart(2, "0")}`;
    ctx.lineWidth = CONFIG.tail.width * (i / state.tail.length);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
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
  renderTail();
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

function init() {
  state.audio = new SoundSystem(CONFIG.audio);
  initParallax();
  resize();
  resetGame();
  setupInput();
  window.addEventListener("resize", resize);
  requestAnimationFrame(loop);
}

init();
