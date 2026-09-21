import { readFileSync } from "node:fs";

export interface Config {
  enabled: boolean;
  paddingX: number;
  background: "theme" | string | number;
}
export const defaults: Config = { enabled: true, paddingX: 1, background: "theme" };

export function parseConfig(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是 JSON 对象");
  const data = value as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`未知配置项：${key}`);
  }
  const config = { ...defaults, ...data } as Config;
  if (typeof config.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
  if (!Number.isInteger(config.paddingX) || config.paddingX < 1 || config.paddingX > 8) {
    throw new Error("paddingX 必须是 1–8 的整数");
  }
  const bg = config.background;
  if (!(bg === "theme" || (typeof bg === "string" && /^#[\da-f]{6}$/i.test(bg)) ||
    (typeof bg === "number" && Number.isInteger(bg) && bg >= 0 && bg <= 255))) {
    throw new Error("background 必须是 theme、#RRGGBB 或 0–255");
  }
  return config;
}

export function loadConfig(path: string): Config {
  try { return parseConfig(JSON.parse(readFileSync(path, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaults };
    throw error;
  }
}
