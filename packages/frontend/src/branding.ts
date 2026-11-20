import { BRANDING_DEFAULTS } from '@rayfin-app/shared';

function fromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/** Build-time branding from rayfin/.env. Defaults keep a fresh clone runnable. */
export const APP_TITLE = fromEnv(import.meta.env.VITE_APP_TITLE, BRANDING_DEFAULTS.title);
export const APP_SUBTITLE = fromEnv(import.meta.env.VITE_APP_SUBTITLE, BRANDING_DEFAULTS.subtitle);
export const APP_ICON = fromEnv(import.meta.env.VITE_APP_ICON, BRANDING_DEFAULTS.icon);
