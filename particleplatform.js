export function spawnPlatformBurst(system, config, platform) {
  for (let i = 0; i < config.burstCount; i += 1) {
    const angle = (Math.random() - 0.5) * config.spread;
    const speed =
      config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = config.life + (Math.random() * 2 - 1) * config.lifeJitter;
    const size = config.size + (Math.random() * 2 - 1) * config.sizeJitter;

    system.spawn({
      x: platform.x + platform.width / 2,
      y: platform.y,
      vx,
      vy,
      ax: 0,
      ay: config.gravity + config.airPush,
      size: Math.max(1, size),
      life: Math.max(0.1, life),
      color: platform.color,
      alpha: config.alpha,
      shape: config.shape,
    });
  }
}
