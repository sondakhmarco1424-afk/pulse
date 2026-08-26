type PulseRuntimeConfig = Record<string, string | undefined>;

declare global {
  interface Window {
    __PULSE_CONFIG__?: PulseRuntimeConfig;
  }
}

const buildConfig = (import.meta as any).env || {};

export function configValue(key: string): string {
  const runtimeConfig = typeof window !== 'undefined' ? window.__PULSE_CONFIG__ : undefined;
  const value = runtimeConfig && Object.prototype.hasOwnProperty.call(runtimeConfig, key)
    ? runtimeConfig[key]
    : buildConfig[key];

  return String(value || '').trim();
}

export function configFlag(key: string, fallback = false): boolean {
  const value = configValue(key).toLowerCase();
  if (!value) return fallback;
  return value === 'true';
}

