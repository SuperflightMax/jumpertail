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

export function spawnPlatformBurst(system, config, platform) {
  const speed = config.speed ?? {};
  for (let i = 0; i < config.burstCount; i += 1) {
    const vx = randomRange(speed.vx, 0);
    const vy = randomRange(speed.vy, 0);
    const life = randomRange(config.life, 0.5);
    const scaleFrom = randomRange(config.scaleFrom, 2);
    const scaleTo = randomRange(config.scaleTo ?? config.scaleFrom, scaleFrom);
    const alphaFrom = randomRange(config.alphaFrom, 1);
    const alphaTo = randomRange(config.alphaTo ?? config.alphaFrom, alphaFrom);
    const rotationFrom = toRadians(randomRange(config.rotationFrom, 0));
    const rotationTo = toRadians(randomRange(config.rotationTo ?? config.rotationFrom, 0));
    const angularSpeed = toRadians(randomRange(config.angularSpeed, 0));

    system.spawn({
      x: platform.x + platform.width / 2,
      y: platform.y,
      vx,
      vy,
      ax: config.gravity?.x ?? 0,
      ay: config.gravity?.y ?? 0,
      airDrag: clamp(config.airDrag ?? 0, 0, 1),
      life: Math.max(0.1, life),
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
