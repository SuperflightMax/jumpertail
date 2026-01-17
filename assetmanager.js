const DEFAULT_SKIN = "default";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

export class AssetManager {
  constructor(config) {
    this.preload = Boolean(config?.preload);
    this.skin = config?.skin ?? DEFAULT_SKIN;
    this.particleBasePath = config?.particles?.basePath ?? "";
    this.particleSets = config?.particles?.sets ?? { [DEFAULT_SKIN]: [] };
    this.audioConfig = config?.audio ?? null;
    this.textures = new Map();
    this.texturePromises = new Map();
    this.audioPools = new Map();
  }

  async preloadAll() {
    const textures = this.getAvailableParticleTextures();
    await Promise.all(textures.map((name) => this.loadParticleTexture(name)));
    if (this.audioConfig) {
      Object.keys(this.audioConfig)
        .filter((key) => Array.isArray(this.audioConfig[key]))
        .forEach((key) => {
          this.getAudioPool(key);
        });
    }
  }

  getAvailableParticleTextures(skin = this.skin) {
    const set = this.particleSets[skin] ?? this.particleSets[DEFAULT_SKIN] ?? [];
    return Array.from(new Set(set));
  }

  getParticleTexture(name, skin = this.skin) {
    if (!name) return null;
    const key = `${skin}:${name}`;
    if (this.textures.has(key)) return this.textures.get(key);
    if (!this.texturePromises.has(key)) {
      this.loadParticleTexture(name, skin).catch(() => undefined);
    }
    return this.textures.get(key) ?? null;
  }

  async loadParticleTexture(name, skin = this.skin) {
    if (!name) return null;
    const available = this.getAvailableParticleTextures(skin);
    if (!available.includes(name)) {
      if (skin !== DEFAULT_SKIN) {
        return this.loadParticleTexture(name, DEFAULT_SKIN);
      }
      return null;
    }
    const key = `${skin}:${name}`;
    if (this.textures.has(key)) return this.textures.get(key);
    if (this.texturePromises.has(key)) return this.texturePromises.get(key);

    const url = `${this.particleBasePath}${name}`;
    const promise = loadImage(url)
      .then((image) => {
        this.textures.set(key, image);
        return image;
      })
      .catch((error) => {
        console.warn(error.message);
        return null;
      })
      .finally(() => {
        this.texturePromises.delete(key);
      });

    this.texturePromises.set(key, promise);
    return promise;
  }

  getAudioPool(key) {
    if (!this.audioConfig) return [];
    if (this.audioPools.has(key)) return this.audioPools.get(key);
    const urls = this.audioConfig[key];
    if (!Array.isArray(urls)) return [];
    const pool = urls.map((url) => {
      const audio = new Audio(url);
      audio.preload = "auto";
      return audio;
    });
    this.audioPools.set(key, pool);
    return pool;
  }
}
