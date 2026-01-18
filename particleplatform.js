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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function angleBetween(min, max) {
  const start = toRadians(min);
  const end = toRadians(max);
  const delta = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return start + Math.random() * (delta || Math.PI * 2);
}

export function spawnPlatformBurst(system, config, platform) {
  const speed = config.speed ?? {};
  for (let i = 0; i < config.burstCount; i += 1) {
    const legacyVx = speed.vx;
    const legacyVy = speed.vy;
    const legacyMagnitude = legacyVx || legacyVy
      ? Math.max(
          Math.abs(legacyVx?.min ?? 0),
          Math.abs(legacyVx?.max ?? 0),
          Math.abs(legacyVy?.min ?? 0),
          Math.abs(legacyVy?.max ?? 0)
        )
      : 0;
    const angle = angleBetween(speed.angle?.min ?? -180, speed.angle?.max ?? 180);
    const magnitude = randomRange(speed.magnitude, legacyMagnitude);
    const vx = Math.cos(angle) * magnitude;
    const vy = Math.sin(angle) * magnitude;
    const life = randomRange(config.life, 0.5);
    const scaleFrom = randomRange(config.scaleFrom, 2);
    const scaleTo = randomRange(config.scaleTo ?? config.scaleFrom, scaleFrom);
    const alphaFrom = randomRange(config.alphaFrom, 1);
    const alphaTo = randomRange(config.alphaTo ?? config.alphaFrom, alphaFrom);
    const rotationFrom = toRadians(randomRange(config.rotationFrom, 0));
    const angularSpeed = toRadians(randomRange(config.angularSpeed, 0));
    const rotationTo =
      Math.abs(angularSpeed) > 0.0001
        ? rotationFrom
        : toRadians(randomRange(config.rotationTo ?? config.rotationFrom, 0));

    system.spawn({
      x: platform.x + platform.width / 2,
      y: platform.y,
      vx,
      vy,
      ax: config.gravity?.x ?? 0,
      ay: config.gravity?.y ?? 0,
      airDrag: config.airDrag ?? 0,
      life: Math.max(0.1, life),
      size: Math.max(0.1, config.size ?? 3),
      scaleFrom: Math.max(0.1, scaleFrom),
      scaleTo: Math.max(0.1, scaleTo),
      alphaFrom: clamp(alphaFrom, 0, 1),
      alphaTo: clamp(alphaTo, 0, 1),
      rotationFrom,
      rotationTo,
      angularSpeed,
      colorFrom: config.colorFrom ?? platform.color,
      colorTo: config.colorTo ?? platform.color,
      texture: config.texture ?? null,
      shape: config.shape ?? "square",
    });
  }
}
