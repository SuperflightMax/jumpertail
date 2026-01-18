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

export class ParticleSystem {
  constructor({ maxParticles, assetManager }) {
    this.maxParticles = maxParticles;
    this.assetManager = assetManager;
    this.particles = Array.from({ length: maxParticles }).map(() => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      airDrag: 0,
      life: 0,
      maxLife: 0,
      age: 0,
      size: 1,
      scaleFrom: 1,
      scaleTo: 1,
      alphaFrom: 1,
      alphaTo: 1,
      rotationFrom: 0,
      rotationTo: 0,
      angularSpeed: 0,
      colorFrom: "#ffffff",
      colorTo: "#ffffff",
      texture: null,
      shape: "square",
    }));
    this.freeIndices = [];
    for (let i = maxParticles - 1; i >= 0; i -= 1) {
      this.freeIndices.push(i);
    }
  }

  spawn(config) {
    if (this.freeIndices.length === 0) return false;
    const index = this.freeIndices.pop();
    const particle = this.particles[index];
    particle.alive = true;
    particle.x = config.x;
    particle.y = config.y;
    particle.vx = config.vx;
    particle.vy = config.vy;
    particle.ax = config.ax ?? 0;
    particle.ay = config.ay ?? 0;
    particle.airDrag = config.airDrag ?? 0;
    particle.life = config.life;
    particle.maxLife = config.life;
    particle.age = 0;
    particle.size = config.size ?? 1;
    particle.scaleFrom = config.scaleFrom ?? 1;
    particle.scaleTo = config.scaleTo ?? particle.scaleFrom ?? 1;
    particle.alphaFrom = config.alphaFrom ?? 1;
    particle.alphaTo = config.alphaTo ?? particle.alphaFrom ?? 1;
    particle.rotationFrom = config.rotationFrom ?? 0;
    particle.rotationTo = config.rotationTo ?? particle.rotationFrom ?? 0;
    particle.angularSpeed = config.angularSpeed ?? 0;
    particle.colorFrom = config.colorFrom ?? "#ffffff";
    particle.colorTo = config.colorTo ?? particle.colorFrom ?? "#ffffff";
    particle.texture = config.texture ?? null;
    particle.shape = config.shape ?? "square";
    return true;
  }

  clear() {
    this.freeIndices = [];
    this.particles.forEach((particle, index) => {
      particle.alive = false;
      this.freeIndices.push(index);
    });
  }

  update(dt) {
    this.particles.forEach((particle, index) => {
      if (!particle.alive) return;
      const dragMultiplier = 1 - (particle.airDrag ?? 0);
      particle.vx *= dragMultiplier;
      particle.vy *= dragMultiplier;
      particle.vx += particle.ax * dt;
      particle.vy += particle.ay * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.age += dt;
      if (particle.life <= 0) {
        particle.alive = false;
        this.freeIndices.push(index);
      }
    });
  }

  countAlive() {
    let alive = 0;
    this.particles.forEach((particle) => {
      if (particle.alive) alive += 1;
    });
    return alive;
  }

  render(ctx) {
    this.particles.forEach((particle) => {
      if (!particle.alive) return;
      const t = particle.maxLife > 0 ? 1 - particle.life / particle.maxLife : 1;
      const alpha = lerp(particle.alphaFrom, particle.alphaTo, t);
      if (alpha <= 0) return;
      const scale = Math.max(0.1, lerp(particle.scaleFrom, particle.scaleTo, t));
      const rotation =
        lerp(particle.rotationFrom, particle.rotationTo, t) +
        particle.angularSpeed * particle.age;
      const color = mixColors(particle.colorFrom, particle.colorTo, t);
      const texture = particle.texture
        ? this.assetManager?.getParticleTexture?.(particle.texture)
        : null;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(particle.x, particle.y);
      if (rotation) {
        ctx.rotate(rotation);
      }
      const size = particle.size * scale;
      if (texture) {
        ctx.drawImage(texture, -size / 2, -size / 2, size, size);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = color;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      } else if (particle.shape === "circle") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();
    });
  }
}
