const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  const int = Number.parseInt(value, 16);
  if (Number.isNaN(int)) return { r: 255, g: 255, b: 255 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => channel.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColors(colorA, colorB, t) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  return rgbToHex({
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  });
}

function snapToGrid(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function normalizeRange(range, fallback) {
  if (typeof range === "number") {
    return { min: range, max: range };
  }
  const min = Number.isFinite(range?.min) ? range.min : fallback;
  const max = Number.isFinite(range?.max) ? range.max : min;
  return { min, max };
}

function randomRange(range, fallback = 0) {
  const { min, max } = normalizeRange(range, fallback);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
  return min + Math.random() * (max - min);
}

export class LayeredParticleTail {
  constructor(system, config) {
    this.system = system;
    this.config = config;
    this.intensity = 0;
    this.layerStates = (config.layers || []).map(() => ({
      spawnAccumulator: 0,
    }));
  }

  reset() {
    this.intensity = 0;
    this.layerStates.forEach((state) => {
      state.spawnAccumulator = 0;
    });
  }

  boost(amount) {
    this.intensity = clamp(this.intensity + amount, 0, 1);
  }

  setIntensity(value) {
    this.intensity = clamp(value, 0, 1);
  }

  getIntensity() {
    return this.intensity;
  }

  update(dt, player, tailColor) {
    const layers = this.config.layers || [];
    if (layers.length === 0) return;

    const progress = this.intensity;
    const { spawnMul, lifeMul, sizeMul } = this.getProgressMultipliers(progress);
    const globalAlpha = this.config.globalAlpha ?? 1;
    const gridSize = this.config.gridSize ?? 0;
    const snap = this.config.snapToGrid && gridSize > 0;

    layers.forEach((layer, index) => {
      if (!layer.enabled) return;
      if (progress < (layer.enabledAt ?? 0)) return;

      const layerState = this.layerStates[index];
      if (!layerState) return;

      const baseRate = layer.baseSpawnRate ?? 0;
      const maxRate = layer.maxSpawnRate ?? baseRate;
      const rate =
        lerp(baseRate, maxRate, progress) *
        (layer.spawnMul ?? 1) *
        spawnMul;
      if (rate <= 0) return;

      layerState.spawnAccumulator += dt * rate;
      const maxSpawns = Math.ceil(rate * dt) + 1;
      let spawns = 0;

      while (layerState.spawnAccumulator >= 1 && spawns < maxSpawns) {
        layerState.spawnAccumulator -= 1;
        spawns += 1;
        this.spawnParticle({
          layer,
          player,
          tailColor,
          lifeMul,
          sizeMul,
          globalAlpha,
          snap,
          gridSize,
        });
      }
    });
  }

  getProgressMultipliers(progress) {
    const spawnMul = this.config.globalSpawnMul ?? 1;
    const lifeMul = this.config.globalLifeMul ?? 1;
    const sizeMul = this.config.globalSizeMul ?? 1;
    const stages = this.config.progressStages;
    if (!Array.isArray(stages) || stages.length === 0) {
      return { spawnMul, lifeMul, sizeMul };
    }

    const stage = stages.find(
      (entry) => progress >= entry.min && progress <= entry.max
    );
    if (!stage) return { spawnMul, lifeMul, sizeMul };

    return {
      spawnMul: spawnMul * (stage.spawnMul ?? 1),
      lifeMul: lifeMul * (stage.lifeMul ?? 1),
      sizeMul: sizeMul * (stage.sizeMul ?? 1),
    };
  }

  resolveColor(layer, tailColor) {
    const baseColor = tailColor ?? "#ffffff";
    const fixedFrom = layer.colorFrom ?? layer.color ?? baseColor;
    const fixedTo = layer.colorTo ?? layer.color ?? baseColor;
    if (layer.colorMode === "fixed") {
      return { from: fixedFrom, to: fixedTo };
    }
    if (layer.colorMode === "palette") {
      const palette = Array.isArray(layer.palette) ? layer.palette : [];
      if (palette.length === 0) return { from: fixedFrom, to: fixedTo };
      const first = palette[Math.floor(Math.random() * palette.length)];
      const second = palette[Math.floor(Math.random() * palette.length)];
      const third = palette[Math.floor(Math.random() * palette.length)];
      const fourth = palette[Math.floor(Math.random() * palette.length)];
      const mixedFrom = mixColors(first, second, Math.random());
      const mixedTo = mixColors(third, fourth, Math.random());
      const blend = clamp(layer.paletteBlend ?? 1, 0, 1);
      return {
        from: mixColors(baseColor, mixedFrom, blend),
        to: mixColors(baseColor, mixedTo, blend),
      };
    }
    return { from: baseColor, to: baseColor };
  }

  spawnParticle({ layer, player, tailColor, lifeMul, sizeMul, globalAlpha, snap, gridSize }) {
    const angle = Math.random() * TAU;
    const offsetRadius = layer.offsetRadius ?? 0;
    const offsetBias = clamp(layer.offsetBias ?? 0, 0, 1);
    const radius = offsetRadius * (offsetBias + Math.random() * (1 - offsetBias));
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;

    const followStrength =
      layer.followStrength ?? (layer.mode === "follow" ? 1 : 0);

    const speed = layer.speed ?? {};
    const vx = -player.vx * followStrength + randomRange(speed.vx, 0);
    const vy = -player.vy * followStrength + randomRange(speed.vy, 0);

    const life = randomRange(layer.life, 0.5) * lifeMul;
    const scaleFrom = randomRange(layer.scaleFrom, 2) * sizeMul;
    const scaleTo = randomRange(layer.scaleTo ?? layer.scaleFrom, scaleFrom) * sizeMul;
    const alphaFrom = randomRange(layer.alphaFrom, 1) * globalAlpha;
    const alphaTo = randomRange(layer.alphaTo ?? layer.alphaFrom, alphaFrom) * globalAlpha;
    const rotationFrom = toRadians(randomRange(layer.rotationFrom, 0));
    const rotationTo = toRadians(randomRange(layer.rotationTo ?? layer.rotationFrom, 0));
    const angularSpeed = toRadians(randomRange(layer.angularSpeed, 0));

    let x = player.x + offsetX;
    let y = player.y + offsetY;
    if (snap) {
      x = snapToGrid(x, gridSize);
      y = snapToGrid(y, gridSize);
    }

    const colors = this.resolveColor(layer, tailColor);

    this.system.spawn({
      x,
      y,
      vx,
      vy,
      ax: layer.gravity?.x ?? 0,
      ay: layer.gravity?.y ?? 0,
      airDrag: clamp(layer.airDrag ?? 0, 0, 1),
      life: Math.max(0.1, life),
      scaleFrom: Math.max(0.1, scaleFrom),
      scaleTo: Math.max(0.1, scaleTo),
      alphaFrom: clamp(alphaFrom, 0, 1),
      alphaTo: clamp(alphaTo, 0, 1),
      rotationFrom,
      rotationTo,
      angularSpeed,
      colorFrom: colors.from,
      colorTo: colors.to,
      texture: layer.texture ?? null,
      shape: layer.shape ?? "square",
    });
  }
}
