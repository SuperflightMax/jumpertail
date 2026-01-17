function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (value && typeof value === "object") {
    const cloned = {};
    Object.keys(value).forEach((key) => {
      cloned[key] = deepClone(value[key]);
    });
    return cloned;
  }
  return value;
}

function mergeInto(target, source) {
  if (!source || typeof source !== "object") return target;
  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (Array.isArray(value)) {
      target[key] = value.map((item) => deepClone(item));
      return;
    }
    if (value && typeof value === "object") {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      mergeInto(target[key], value);
      return;
    }
    target[key] = value;
  });
  return target;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Config load failed (${response.status}): ${path}`);
  }
  return response.json();
}

export async function applyConfigOverrides(baseConfig, configFiles) {
  const defaultPath = configFiles?.defaultPath;
  const available = configFiles?.available ?? [];
  const storageKey = configFiles?.storageKey ?? "selectedConfigPath";
  let selectedPath = null;

  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(storageKey);
    if (stored && available.includes(stored)) {
      selectedPath = stored;
    }
  }
  if (!selectedPath && defaultPath) {
    selectedPath = defaultPath;
  }

  if (selectedPath) {
    try {
      const overrides = await fetchJson(selectedPath);
      mergeInto(baseConfig, overrides);
    } catch (error) {
      console.warn(error.message);
    }
  }

  return {
    config: baseConfig,
    selectedPath,
    storageKey,
    available,
  };
}
