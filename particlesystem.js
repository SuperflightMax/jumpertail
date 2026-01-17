export class ParticleSystem {
  constructor({ maxParticles }) {
    this.maxParticles = maxParticles;
    this.particles = Array.from({ length: maxParticles }).map(() => ({
      alive: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      size: 1,
      life: 0,
      maxLife: 0,
      color: "#ffffff",
      alpha: 1,
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
    particle.size = config.size;
    particle.life = config.life;
    particle.maxLife = config.life;
    particle.color = config.color;
    particle.alpha = config.alpha ?? 1;
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
      particle.vx += particle.ax * dt;
      particle.vy += particle.ay * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
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
      const t = Math.max(0, particle.life / particle.maxLife);
      const alpha = t * particle.alpha;
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      if (particle.shape === "circle") {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const size = particle.size;
        ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
      }
    });
    ctx.globalAlpha = 1;
  }
}
