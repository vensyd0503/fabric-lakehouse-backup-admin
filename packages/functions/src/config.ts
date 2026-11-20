/**
 * Deployment configuration read from Rayfin function secrets.
 *
 * Names are declared in rayfin/rayfin.yml and typed by secrets.generated.ts.
 * Values are never stored in source. A single hyphen in ADLS_ARCHIVE_FOLDER
 * means the container root, so the secret is never an empty string.
 */

export const SECRET_NAMES = {
  notebookWorkspaceId: 'NOTEBOOK_WORKSPACE_ID',
  stagingWorkspaceId: 'STAGING_WORKSPACE_ID',
  stagingLakehouseId: 'STAGING_LAKEHOUSE_ID',
  adlsAccount: 'ADLS_ACCOUNT',
  adlsContainer: 'ADLS_CONTAINER',
  adlsArchiveFolder: 'ADLS_ARCHIVE_FOLDER',
  adminSubjects: 'ADMIN_SUBJECTS',
} as const;

export const ARCHIVE_ROOT_ID = 'archive';
/** Secret value that means "no prefix; use the container root". */
export const ARCHIVE_FOLDER_ROOT = '-';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT = /^[a-z0-9]{3,24}$/;
const CONTAINER = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

export interface SecretValues {
  NOTEBOOK_WORKSPACE_ID: string;
  STAGING_WORKSPACE_ID: string;
  STAGING_LAKEHOUSE_ID: string;
  ADLS_ACCOUNT: string;
  ADLS_CONTAINER: string;
  ADLS_ARCHIVE_FOLDER: string;
  ADMIN_SUBJECTS: string;
}

export interface ArchiveLocation {
  id: typeof ARCHIVE_ROOT_ID;
  label: string;
  account: string;
  container: string;
  /** Prefix inside the container. Empty means the container root. */
  folder: string;
}

export interface DeploymentConfig {
  notebookWorkspaceId: string;
  stagingWorkspaceId: string;
  stagingLakehouseId: string;
  archive: ArchiveLocation;
  adminSubjectsRaw: string;
}

export class DeploymentConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `Deployment configuration is incomplete or invalid: ${problems.join(' ')} Set the values with npm run setup, deploy the app, then run npx rayfin secret set --env-file rayfin/.env.secrets.`,
    );
    this.name = 'DeploymentConfigError';
    this.problems = problems;
  }
}

export function folderPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, '');
  if (trimmed === '' || trimmed === ARCHIVE_FOLDER_ROOT) return '';
  const parts = trimmed.split('/');
  if (parts.length > 10 || parts.some((part) => !SEGMENT.test(part) || part === '.' || part === '..')) {
    throw new Error('Folder names may only use letters, numbers, dot, dash and underscore.');
  }
  return parts.join('/');
}

/** Join the configured prefix with a path the browser chose. */
export function archiveDirectory(prefix: string, relative: string): string {
  const rel = folderPath(relative);
  if (prefix && rel) return `${prefix}/${rel}`;
  return prefix || rel;
}

/** Container URI the notebooks accept. The folder prefix is a separate parameter. */
export function containerUri(archive: ArchiveLocation): string {
  return `abfss://${archive.container}@${archive.account}.dfs.core.windows.net`;
}

/** Address shown in the folder browser. Includes the configured prefix. */
export function archiveUri(archive: ArchiveLocation): string {
  const base = containerUri(archive);
  return archive.folder ? `${base}/${archive.folder}` : base;
}

function guid(value: string, name: string, problems: string[]): string {
  const trimmed = value.trim();
  if (!GUID.test(trimmed)) {
    problems.push(`${name} must be a GUID.`);
    return '';
  }
  return trimmed.toLowerCase();
}

export function loadDeploymentConfig(secrets: SecretValues): DeploymentConfig {
  const problems: string[] = [];
  const notebookWorkspaceId = guid(secrets.NOTEBOOK_WORKSPACE_ID ?? '', SECRET_NAMES.notebookWorkspaceId, problems);
  const stagingWorkspaceId = guid(secrets.STAGING_WORKSPACE_ID ?? '', SECRET_NAMES.stagingWorkspaceId, problems);
  const stagingLakehouseId = guid(secrets.STAGING_LAKEHOUSE_ID ?? '', SECRET_NAMES.stagingLakehouseId, problems);

  const account = (secrets.ADLS_ACCOUNT ?? '').trim().toLowerCase();
  if (!ACCOUNT.test(account)) {
    problems.push(`${SECRET_NAMES.adlsAccount} must be 3 to 24 lowercase letters or digits.`);
  }
  const container = (secrets.ADLS_CONTAINER ?? '').trim().toLowerCase();
  if (!CONTAINER.test(container)) {
    problems.push(
      `${SECRET_NAMES.adlsContainer} must be 3 to 63 lowercase letters, digits or hyphens, and must not start or end with a hyphen.`,
    );
  }

  let folder = '';
  try {
    folder = folderPath(secrets.ADLS_ARCHIVE_FOLDER ?? '');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'It is not a valid folder prefix.';
    problems.push(`${SECRET_NAMES.adlsArchiveFolder}: ${detail}`);
  }

  if (problems.length > 0) throw new DeploymentConfigError(problems);

  const label = folder ? `${account} / ${container} / ${folder}` : `${account} / ${container}`;
  return {
    notebookWorkspaceId,
    stagingWorkspaceId,
    stagingLakehouseId,
    adminSubjectsRaw: secrets.ADMIN_SUBJECTS ?? '',
    archive: {
      id: ARCHIVE_ROOT_ID,
      label,
      account,
      container,
      folder,
    },
  };
}
