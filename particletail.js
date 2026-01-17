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
    if (layer.colorMode === "fixed") {
      return layer.color ?? baseColor;
    }
    if (layer.colorMode === "palette") {
      const palette = Array.isArray(layer.palette) ? layer.palette : [];
      if (palette.length === 0) return baseColor;
      const first = palette[Math.floor(Math.random() * palette.length)];
      const second = palette[Math.floor(Math.random() * palette.length)];
      const mixedPalette = mixColors(first, second, Math.random());
      const blend = clamp(layer.paletteBlend ?? 1, 0, 1);
      return mixColors(baseColor, mixedPalette, blend);
    }
    return baseColor;
  }

  spawnParticle({ layer, player, tailColor, lifeMul, sizeMul, globalAlpha, snap, gridSize }) {
    const angle = Math.random() * TAU;
    const offsetRadius = layer.offsetRadius ?? 0;
    const offsetBias = clamp(layer.offsetBias ?? 0, 0, 1);
    const radius = offsetRadius * (offsetBias + Math.random() * (1 - offsetBias));
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;

    const driftAngle = Math.random() * TAU;
    const driftSpeed =
      (layer.driftSpeed ?? 0) + (Math.random() * 2 - 1) * (layer.driftJitter ?? 0);
    const followStrength =
      layer.followStrength ?? (layer.mode === "follow" ? 1 : 0);

    const vx =
      -player.vx * followStrength + Math.cos(driftAngle) * driftSpeed;
    const vy =
      -player.vy * followStrength + Math.sin(driftAngle) * driftSpeed;

    const life =
      (layer.life ?? 0.5) + (Math.random() * 2 - 1) * (layer.lifeJitter ?? 0);
    const size =
      (layer.size ?? 2) + (Math.random() * 2 - 1) * (layer.sizeJitter ?? 0);

    let x = player.x + offsetX;
    let y = player.y + offsetY;
    if (snap) {
      x = snapToGrid(x, gridSize);
      y = snapToGrid(y, gridSize);
    }

    this.system.spawn({
      x,
      y,
      vx,
      vy,
      ax: 0,
      ay: (layer.gravity ?? 0) + (layer.airPush ?? 0),
      size: Math.max(1, size * sizeMul),
      life: Math.max(0.1, life * lifeMul),
      color: this.resolveColor(layer, tailColor),
      alpha: (layer.alpha ?? 1) * globalAlpha,
      shape: layer.shape ?? "square",
    });
  }
}
