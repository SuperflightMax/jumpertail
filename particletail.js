export class ParticleTailEmitter {
  constructor(system, config) {
    this.system = system;
    this.config = config;
    this.spawnAccumulator = 0;
    this.intensity = 0;
  }

  reset() {
    this.spawnAccumulator = 0;
    this.intensity = 0;
  }

  boost(amount) {
    this.intensity = Math.min(1, this.intensity + amount);
  }

  update(dt, player, color) {
    const rate =
      this.config.baseSpawnRate +
      (this.config.maxSpawnRate - this.config.baseSpawnRate) * this.intensity;
    this.spawnAccumulator += dt * rate;
    const maxSpawns = Math.ceil(rate * dt) + 1;
    let spawns = 0;

    while (this.spawnAccumulator >= 1 && spawns < maxSpawns) {
      this.spawnAccumulator -= 1;
      spawns += 1;
      this.spawnParticle(player, color);
    }
  }

  spawnParticle(player, color) {
    const angle = Math.random() * Math.PI * 2;
    const radius =
      this.config.offsetRadius *
      (this.config.offsetBias + Math.random() * (1 - this.config.offsetBias));
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed =
      this.config.driftSpeed + (Math.random() * 2 - 1) * this.config.driftJitter;

    const vx = -player.vx * this.config.followStrength + Math.cos(driftAngle) * driftSpeed;
    const vy = -player.vy * this.config.followStrength + Math.sin(driftAngle) * driftSpeed;

    const life = this.config.life + (Math.random() * 2 - 1) * this.config.lifeJitter;
    const size = this.config.size + (Math.random() * 2 - 1) * this.config.sizeJitter;

    this.system.spawn({
      x: player.x + offsetX,
      y: player.y + offsetY,
      vx,
      vy,
      ax: 0,
      ay: this.config.gravity + this.config.airPush,
      size: Math.max(1, size),
      life: Math.max(0.1, life),
      color,
      alpha: this.config.alpha,
      shape: this.config.shape,
    });
  }
}
