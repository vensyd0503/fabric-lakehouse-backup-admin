/**
 * Maps setup answers onto rayfin/.env and rayfin/.env.secrets.
 * Pure: no filesystem or network. The wizard and the tests both use it.
 */
import { ARCHIVE_FOLDER_ROOT, SECRET_NAMES } from '../../packages/functions/src/config.ts';
import { BRANDING_DEFAULTS } from '../../packages/shared/src/branding.ts';

export { BRANDING_DEFAULTS };

export const ENV_KEYS = {
  devPort: 'DEV_PORT',
  title: 'VITE_APP_TITLE',
  subtitle: 'VITE_APP_SUBTITLE',
  icon: 'VITE_APP_ICON',
} as const;

export interface SetupAnswers {
  title: string;
  subtitle: string;
  /** Path to a PNG on the installer's machine. Empty keeps the built-in icon. */
  iconPath: string;
  notebookWorkspaceId: string;
  stagingWorkspaceId: string;
  stagingLakehouseId: string;
  adlsAccount: string;
  adlsContainer: string;
  /** Empty means the container root. Stored as a hyphen so the secret is non-empty. */
  archiveFolder: string;
  adminSubjects: string;
  devPort: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Quote values the way `rayfin secret set --env-file` documents: surrounding quotes are stripped, escapes are not. */
export function dotenvValue(value: string): string {
  if (value === '') return '""';
  if (/["\r\n]/.test(value)) {
    throw new Error('Values cannot contain quotes or line breaks.');
  }
  if (/[\s#]/.test(value)) return `"${value}"`;
  return value;
}

export function brandingFromDotenv(text: string): { title: string; subtitle: string; icon: string } {
  const env = parseDotenv(text);
  const title = env[ENV_KEYS.title]?.trim();
  const subtitle = env[ENV_KEYS.subtitle]?.trim();
  const icon = env[ENV_KEYS.icon]?.trim();
  return {
    title: title || BRANDING_DEFAULTS.title,
    subtitle: subtitle || BRANDING_DEFAULTS.subtitle,
    icon: icon || BRANDING_DEFAULTS.icon,
  };
}

function textField(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function answersFromRecord(record: Record<string, unknown>): SetupAnswers {
  return {
    title: textField(record.title, BRANDING_DEFAULTS.title) || BRANDING_DEFAULTS.title,
    subtitle: textField(record.subtitle, BRANDING_DEFAULTS.subtitle) || BRANDING_DEFAULTS.subtitle,
    iconPath: textField(record.iconPath),
    notebookWorkspaceId: textField(record.notebookWorkspaceId),
    stagingWorkspaceId: textField(record.stagingWorkspaceId),
    stagingLakehouseId: textField(record.stagingLakehouseId),
    adlsAccount: textField(record.adlsAccount).toLowerCase(),
    adlsContainer: textField(record.adlsContainer).toLowerCase(),
    archiveFolder: textField(record.archiveFolder),
    adminSubjects: textField(record.adminSubjects),
    devPort: textField(record.devPort, '5173') || '5173',
  };
}

export function answersFromEnv(env: Record<string, string | undefined>): SetupAnswers {
  return answersFromRecord({
    title: env.SETUP_TITLE,
    subtitle: env.SETUP_SUBTITLE,
    iconPath: env.SETUP_ICON_PATH,
    notebookWorkspaceId: env.NOTEBOOK_WORKSPACE_ID,
    stagingWorkspaceId: env.STAGING_WORKSPACE_ID,
    stagingLakehouseId: env.STAGING_LAKEHOUSE_ID,
    adlsAccount: env.ADLS_ACCOUNT,
    adlsContainer: env.ADLS_CONTAINER,
    archiveFolder: env.ADLS_ARCHIVE_FOLDER,
    adminSubjects: env.ADMIN_SUBJECTS,
    devPort: env.DEV_PORT,
  });
}

export function validateAnswers(answers: SetupAnswers): string[] {
  const problems: string[] = [];
  if (!answers.title.trim()) problems.push('App title is required.');
  if (!answers.subtitle.trim()) problems.push('Subtitle is required.');
  if (!GUID.test(answers.notebookWorkspaceId)) problems.push('Notebook workspace id must be a GUID.');
  if (!GUID.test(answers.stagingWorkspaceId)) problems.push('Staging workspace id must be a GUID.');
  if (!GUID.test(answers.stagingLakehouseId)) problems.push('Staging lakehouse id must be a GUID.');
  if (!/^[a-z0-9]{3,24}$/.test(answers.adlsAccount)) {
    problems.push('ADLS account must be 3 to 24 lowercase letters or digits.');
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(answers.adlsContainer)) {
    problems.push('ADLS container must be 3 to 63 lowercase letters, digits or hyphens.');
  }
  if (answers.archiveFolder.includes('"') || answers.archiveFolder.includes('\n')) {
    problems.push('Archive folder cannot contain quotes or line breaks.');
  }
  const subjects = answers.adminSubjects.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  if (subjects.length === 0) problems.push('Enter at least one admin UPN or Entra object id.');
  if (!/^\d+$/.test(answers.devPort) || Number(answers.devPort) < 1 || Number(answers.devPort) > 65535) {
    problems.push('Dev port must be a number from 1 to 65535.');
  }
  for (const value of [answers.title, answers.subtitle, answers.adminSubjects]) {
    if (/["\r\n]/.test(value)) problems.push('Answers cannot contain quotes or line breaks.');
  }
  return problems;
}

function line(key: string, value: string): string {
  return `${key}=${dotenvValue(value)}`;
}

export function renderEnvFile(answers: SetupAnswers): string {
  return [
    '# Written by npm run setup. Gitignored. Safe to edit and re-run the frontend build.',
    '# rayfin.yml reads DEV_PORT. The frontend build reads the VITE_APP_* values.',
    line(ENV_KEYS.devPort, answers.devPort),
    line(ENV_KEYS.title, answers.title),
    line(ENV_KEYS.subtitle, answers.subtitle),
    line(ENV_KEYS.icon, BRANDING_DEFAULTS.icon),
    '',
  ].join('\n');
}

export function secretLines(answers: SetupAnswers): Record<string, string> {
  const folder = answers.archiveFolder.trim().replace(/^\/+|\/+$/g, '');
  return {
    [SECRET_NAMES.notebookWorkspaceId]: answers.notebookWorkspaceId.trim(),
    [SECRET_NAMES.stagingWorkspaceId]: answers.stagingWorkspaceId.trim(),
    [SECRET_NAMES.stagingLakehouseId]: answers.stagingLakehouseId.trim(),
    [SECRET_NAMES.adlsAccount]: answers.adlsAccount.trim(),
    [SECRET_NAMES.adlsContainer]: answers.adlsContainer.trim(),
    [SECRET_NAMES.adlsArchiveFolder]: folder === '' ? ARCHIVE_FOLDER_ROOT : folder,
    [SECRET_NAMES.adminSubjects]: answers.adminSubjects.trim(),
  };
}

export function renderSecretsFile(answers: SetupAnswers): string {
  const values = secretLines(answers);
  const body = Object.entries(values).map(([key, value]) => line(key, value));
  return [
    '# Written by npm run setup. Gitignored. Do not commit.',
    '# After the first deploy: npx rayfin secret set --env-file rayfin/.env.secrets',
    ...body,
    '',
  ].join('\n');
}

export function mergeLocalSettings(existing: string | null, answers: SetupAnswers): string {
  let parsed: { IsEncrypted?: boolean; Values?: Record<string, string> } = {};
  if (existing && existing.trim()) {
    const value: unknown = JSON.parse(existing);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as { IsEncrypted?: boolean; Values?: Record<string, string> };
    }
  }
  const values = { ...(parsed.Values ?? {}) };
  for (const [key, value] of Object.entries(secretLines(answers))) values[key] = value;
  if (!values.AzureWebJobsStorage) values.AzureWebJobsStorage = '';
  if (!values.FUNCTIONS_WORKER_RUNTIME) values.FUNCTIONS_WORKER_RUNTIME = 'node';
  return `${JSON.stringify({ IsEncrypted: parsed.IsEncrypted ?? false, Values: values }, null, 2)}\n`;
}
