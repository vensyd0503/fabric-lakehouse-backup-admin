import {
  AudienceType,
  UserDataFunctions,
  type AuthClaimsContext,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';
import { ADMIN_REQUIRED, decideRole, parseAdminSubjects, type AppRole, type RoleSource } from './admin.js';
import {
  ARCHIVE_ROOT_ID,
  DeploymentConfigError,
  SECRET_NAMES,
  archiveDirectory,
  archiveUri,
  containerUri,
  folderPath,
  loadDeploymentConfig,
  type DeploymentConfig,
  type SecretValues,
} from './config.js';
import { NOTEBOOK_NAMES } from './notebooks.js';

export type AppSchema = Record<string, never>;
type FabricCtx = RayfinContext<AppSchema, AudienceType.Fabric>;
type StorageCtx = RayfinContext<AppSchema, AudienceType.Storage>;

const udf = new UserDataFunctions();
const FABRIC_API = 'https://api.fabric.microsoft.com/v1';
const DFS_VERSION = '2023-11-03';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_LIST = /^[A-Za-z0-9_.,\s]*$/;
const TIMESTAMP = /^\d{12}$/;

type JobKind = 'backup' | 'restore';

// Dynamic claims are region-gated. When they run, appRole is authoritative.
// When they do not, mutating functions compare ADMIN_SUBJECTS with the caller.
udf.authClaims(
  async (ctx: AuthClaimsContext): Promise<{ appRole: string }> => {
    const listed = parseAdminSubjects(ctx.getSecret(SECRET_NAMES.adminSubjects) ?? '');
    const decision = decideRole({
      claimRole: null,
      userId: ctx.auth.userId,
      email: ctx.auth.email,
      adminSubjects: listed,
    });
    return { appRole: decision.role };
  },
);

function bearer(token: string): string {
  return ['Bearer', token].join(' ');
}

async function fabric(token: string, path: string, init?: RequestInit): Promise<Response> {
  return await fetch(path.startsWith('https://') ? path : `${FABRIC_API}${path}`, {
    ...init,
    headers: { Authorization: bearer(token), 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

async function fabricList<T>(token: string, path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  for (let page = 0; next && page < 20; page++) {
    const res = await fabric(token, next);
    if (!res.ok) throw new Error(`Fabric lookup failed (${res.status}).`);
    const body = (await res.json()) as { value?: T[]; continuationUri?: string | null };
    out.push(...(body.value ?? []));
    next = body.continuationUri ?? undefined;
  }
  return out;
}

function guid(value: string, label: string): string {
  if (!GUID.test(value)) throw new Error(`${label} is not a valid id.`);
  return value;
}

function readSecrets(ctx: RayfinContext<AppSchema>): SecretValues {
  try {
    return {
      NOTEBOOK_WORKSPACE_ID: ctx.Secrets.NOTEBOOK_WORKSPACE_ID,
      STAGING_WORKSPACE_ID: ctx.Secrets.STAGING_WORKSPACE_ID,
      STAGING_LAKEHOUSE_ID: ctx.Secrets.STAGING_LAKEHOUSE_ID,
      ADLS_ACCOUNT: ctx.Secrets.ADLS_ACCOUNT,
      ADLS_CONTAINER: ctx.Secrets.ADLS_CONTAINER,
      ADLS_ARCHIVE_FOLDER: ctx.Secrets.ADLS_ARCHIVE_FOLDER,
      ADMIN_SUBJECTS: ctx.Secrets.ADMIN_SUBJECTS,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'A required secret could not be read.';
    throw new DeploymentConfigError([detail]);
  }
}

function readConfig(ctx: RayfinContext<AppSchema>): DeploymentConfig {
  return loadDeploymentConfig(readSecrets(ctx));
}

function resolveRole(ctx: RayfinContext<AppSchema>): { role: AppRole; source: RoleSource } {
  try {
    const claims = ctx.getClaims();
    if (typeof claims.appRole === 'string' && claims.appRole.trim() !== '') {
      return decideRole({
        claimRole: claims.appRole,
        userId: ctx.user.id,
        email: claims.email,
        adminSubjects: [],
      });
    }
    const subjects = parseAdminSubjects(ctx.Secrets.ADMIN_SUBJECTS);
    return decideRole({
      claimRole: null,
      userId: ctx.user.id,
      email: typeof claims.email === 'string' ? claims.email : null,
      adminSubjects: subjects,
    });
  } catch {
    return decideRole({
      claimRole: null,
      userId: ctx.user.id,
      email: null,
      adminSubjects: parseAdminSubjects(ctx.Secrets.ADMIN_SUBJECTS),
    });
  }
}

function requireAdmin(ctx: RayfinContext<AppSchema>): void {
  if (resolveRole(ctx).role !== 'admin') throw new Error(ADMIN_REQUIRED);
}

function requireArchive(config: DeploymentConfig, rootId: string) {
  if (rootId !== ARCHIVE_ROOT_ID) throw new Error('Unknown storage location.');
  return config.archive;
}

function dfs(account: string, container: string): string {
  return `https://${account}.dfs.core.windows.net/${container}`;
}

async function dfsListDirs(token: string, account: string, container: string, dir: string): Promise<string[]> {
  const names: string[] = [];
  let continuation = '';
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ resource: 'filesystem', recursive: 'false' });
    if (dir) qs.set('directory', dir);
    if (continuation) qs.set('continuation', continuation);
    const res = await fetch(`${dfs(account, container)}?${qs.toString()}`, {
      headers: { Authorization: bearer(token), 'x-ms-version': DFS_VERSION },
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Storage listing failed (${res.status}).`);
    const body = (await res.json()) as { paths?: { name: string; isDirectory?: string | boolean }[] };
    for (const p of body.paths ?? []) {
      if (String(p.isDirectory) === 'true') names.push(p.name.split('/').pop() ?? p.name);
    }
    continuation = res.headers.get('x-ms-continuation') ?? '';
    if (!continuation) break;
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** List notebooks in the configured workspace and take the fixed display names. */
async function notebookIds(token: string, workspaceId: string): Promise<{ backup: string; restore: string }> {
  const items = await fabricList<{ id?: string; displayName?: string }>(
    token,
    `/workspaces/${workspaceId}/items?type=Notebook`,
  );
  const idFor = (name: string): string => {
    const matches = items.filter((item) => item.displayName === name && typeof item.id === 'string');
    if (matches.length === 1 && matches[0]?.id) return matches[0].id;
    if (matches.length === 0) {
      throw new Error(
        `Notebook '${name}' was not found in the notebook workspace. Import it with npm run setup:notebooks.`,
      );
    }
    throw new Error(`More than one notebook is named '${name}' in the notebook workspace. Leave only one.`);
  };
  idFor(NOTEBOOK_NAMES.engine);
  return { backup: idFor(NOTEBOOK_NAMES.backup), restore: idFor(NOTEBOOK_NAMES.restore) };
}

async function startJob(token: string, workspaceId: string, notebookId: string, values: Record<string, string | boolean>) {
  const parameters = Object.entries(values).map(([name, value]) => ({
    name,
    value,
    type: typeof value === 'boolean' ? 'Boolean' : 'Text',
  }));
  const res = await fabric(
    token,
    `/workspaces/${workspaceId}/notebooks/${notebookId}/jobs/execute/instances?beta=false`,
    { method: 'POST', body: JSON.stringify({ parameters }) },
  );
  if (res.status !== 202) throw new Error(`Fabric refused the run (${res.status}).`);
  const jobInstanceId = (res.headers.get('Location') ?? '').split('/').pop() ?? '';
  if (!GUID.test(jobInstanceId)) throw new Error('Fabric did not return a job instance.');
  return jobInstanceId;
}

function requestKey(kind: JobKind): string {
  return `app-${kind}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function jobKind(kind: string): JobKind {
  if (kind !== 'backup' && kind !== 'restore') throw new Error('Unknown job kind.');
  return kind;
}

udf.func(
  'getMyRole',
  async (ctx: RayfinContext<AppSchema>): Promise<{ role: string; source: string }> => {
    const decision = resolveRole(ctx);
    return { role: decision.role, source: decision.source };
  },
  [],
);

udf.func(
  'listWorkspaces',
  async (ctx: FabricCtx): Promise<{ id: string; name: string }[]> => {
    const items = await fabricList<{ id: string; displayName: string }>(ctx.Tokens.Fabric, '/workspaces');
    return items.map((w) => ({ id: w.id, name: w.displayName })).sort((a, b) => a.name.localeCompare(b.name));
  },
  [],
);

udf.func(
  'listLakehouses',
  async (ctx: FabricCtx, workspaceId: string): Promise<{ id: string; name: string }[]> => {
    const items = await fabricList<{ id: string; displayName: string }>(
      ctx.Tokens.Fabric,
      `/workspaces/${guid(workspaceId, 'Workspace')}/lakehouses`,
    );
    return items.map((l) => ({ id: l.id, name: l.displayName })).sort((a, b) => a.name.localeCompare(b.name));
  },
  [],
);

udf.func(
  'listArchiveRoots',
  async (ctx: RayfinContext<AppSchema>): Promise<{ id: string; label: string; uri: string }[]> => {
    const archive = readConfig(ctx).archive;
    return [{ id: archive.id, label: archive.label, uri: archiveUri(archive) }];
  },
  [],
);

udf.func(
  'listArchiveFolders',
  async (ctx: StorageCtx, rootId: string, path: string): Promise<{ path: string; folders: string[] }> => {
    const archive = requireArchive(readConfig(ctx), rootId);
    const relative = folderPath(path);
    return {
      path: relative,
      folders: await dfsListDirs(ctx.Tokens.Storage, archive.account, archive.container, archiveDirectory(archive.folder, relative)),
    };
  },
  [],
);

udf.func(
  'createArchiveFolder',
  async (ctx: StorageCtx, rootId: string, path: string): Promise<{ path: string }> => {
    requireAdmin(ctx);
    const archive = requireArchive(readConfig(ctx), rootId);
    const relative = folderPath(path);
    if (!relative) throw new Error('Enter a folder name.');
    const dir = archiveDirectory(archive.folder, relative);
    const res = await fetch(`${dfs(archive.account, archive.container)}/${dir}?resource=directory`, {
      method: 'PUT',
      headers: {
        Authorization: bearer(ctx.Tokens.Storage),
        'x-ms-version': DFS_VERSION,
        'If-None-Match': '*',
        'Content-Length': '0',
      },
    });
    if (res.status === 409) throw new Error('That folder already exists.');
    if (res.status !== 201) throw new Error(`Could not create the folder (${res.status}).`);
    return { path: relative };
  },
  [],
);

udf.func(
  'listBackupSets',
  async (ctx: StorageCtx, rootId: string, backupFolder: string): Promise<string[]> => {
    const archive = requireArchive(readConfig(ctx), rootId);
    const base = archiveDirectory(archive.folder, folderPath(backupFolder));
    const dirs = await dfsListDirs(
      ctx.Tokens.Storage,
      archive.account,
      archive.container,
      base ? `${base}/backups` : 'backups',
    );
    return dirs.filter((d) => TIMESTAMP.test(d)).sort().reverse();
  },
  [],
);

udf.func(
  'getBackupSet',
  async (
    ctx: StorageCtx,
    rootId: string,
    backupFolder: string,
    backupTimestamp: string,
  ): Promise<{
    complete: boolean;
    completedUtc: string | null;
    sourceWorkspaceName: string | null;
    sourceLakehouseName: string | null;
    tables: { schema: string; table: string; rows: number | null }[];
    filesCopied: boolean;
  }> => {
    const archive = requireArchive(readConfig(ctx), rootId);
    const base = archiveDirectory(archive.folder, folderPath(backupFolder));
    if (!TIMESTAMP.test(backupTimestamp)) throw new Error('Invalid backup timestamp.');
    const file = `${base ? `${base}/` : ''}backups/${backupTimestamp}/_manifest/manifest.json`;
    const res = await fetch(`${dfs(archive.account, archive.container)}/${file}`, {
      headers: { Authorization: bearer(ctx.Tokens.Storage), 'x-ms-version': DFS_VERSION },
    });
    if (res.status === 404) {
      return { complete: false, completedUtc: null, sourceWorkspaceName: null, sourceLakehouseName: null, tables: [], filesCopied: false };
    }
    if (!res.ok) throw new Error(`Could not read the backup manifest (${res.status}).`);
    const m = (await res.json()) as {
      status?: string;
      completed_utc?: string;
      source?: { workspace_name?: string; lakehouse_name?: string };
      files_copied?: boolean;
      tables?: { schema: string; table: string; rows?: number }[];
    };
    return {
      complete: m.status === 'complete',
      completedUtc: m.completed_utc ?? null,
      sourceWorkspaceName: m.source?.workspace_name ?? null,
      sourceLakehouseName: m.source?.lakehouse_name ?? null,
      tables: (m.tables ?? []).map((t) => ({ schema: t.schema, table: t.table, rows: t.rows ?? null })),
      filesCopied: Boolean(m.files_copied),
    };
  },
  [],
);

udf.func(
  'startBackup',
  async (
    ctx: FabricCtx,
    sourceWorkspaceId: string,
    sourceLakehouseId: string,
    rootId: string,
    backupFolder: string,
    onlyTables: string,
  ): Promise<{ jobInstanceId: string; requestKey: string }> => {
    requireAdmin(ctx);
    const config = readConfig(ctx);
    const archive = requireArchive(config, rootId);
    if (!NAME_LIST.test(onlyTables) || onlyTables.length > 2000) {
      throw new Error('Table filter may only contain names separated by commas.');
    }
    const notebooks = await notebookIds(ctx.Tokens.Fabric, config.notebookWorkspaceId);
    const key = requestKey('backup');
    const jobInstanceId = await startJob(ctx.Tokens.Fabric, config.notebookWorkspaceId, notebooks.backup, {
      source_workspace_id: guid(sourceWorkspaceId, 'Source workspace'),
      source_lakehouse_id: guid(sourceLakehouseId, 'Source lakehouse'),
      staging_workspace_id: config.stagingWorkspaceId,
      staging_lakehouse_id: config.stagingLakehouseId,
      archive_root_uri: containerUri(archive),
      backup_folder: archiveDirectory(archive.folder, folderPath(backupFolder)),
      only_tables: onlyTables.trim(),
      request_key: key,
      result_workspace_id: config.stagingWorkspaceId,
      result_lakehouse_id: config.stagingLakehouseId,
    });
    return { jobInstanceId, requestKey: key };
  },
  [],
);

udf.func(
  'startRestore',
  async (
    ctx: FabricCtx,
    mode: string,
    rootId: string,
    backupFolder: string,
    backupTimestamp: string,
    targetWorkspaceId: string,
    targetLakehouseId: string,
    restoreFiles: boolean,
    onlySchemas: string,
    onlyTables: string,
    cleanTarget: string,
    confirmTargetName: string,
    dryRun: boolean,
  ): Promise<{ jobInstanceId: string; requestKey: string }> => {
    requireAdmin(ctx);
    const config = readConfig(ctx);
    const archive = requireArchive(config, rootId);
    if (mode !== 'preview' && mode !== 'restore') throw new Error('Mode must be preview or restore.');
    if (!TIMESTAMP.test(backupTimestamp)) throw new Error('Pick a backup set.');
    if (!['', 'replace', 'all'].includes(cleanTarget)) throw new Error('Invalid cleanup option.');
    if (!NAME_LIST.test(onlyTables) || onlyTables.length > 2000) {
      throw new Error('Table filter may only contain names separated by commas.');
    }
    if (!NAME_LIST.test(onlySchemas) || onlySchemas.length > 2000) {
      throw new Error('Schema filter may only contain names separated by commas.');
    }
    if (targetLakehouseId === config.stagingLakehouseId) throw new Error('The staging lakehouse cannot be a restore target.');
    const notebooks = await notebookIds(ctx.Tokens.Fabric, config.notebookWorkspaceId);
    const key = requestKey('restore');
    const jobInstanceId = await startJob(ctx.Tokens.Fabric, config.notebookWorkspaceId, notebooks.restore, {
      mode,
      archive_root_uri: containerUri(archive),
      backup_folder: archiveDirectory(archive.folder, folderPath(backupFolder)),
      backup_timestamp: backupTimestamp,
      target_workspace_id: guid(targetWorkspaceId, 'Target workspace'),
      target_lakehouse_id: guid(targetLakehouseId, 'Target lakehouse'),
      restore_files: restoreFiles,
      only_schemas: onlySchemas.trim(),
      only_tables: onlyTables.trim(),
      clean_target: cleanTarget,
      confirm_target_name: confirmTargetName.slice(0, 256),
      dry_run: dryRun,
      request_key: key,
      result_workspace_id: config.stagingWorkspaceId,
      result_lakehouse_id: config.stagingLakehouseId,
    });
    return { jobInstanceId, requestKey: key };
  },
  [],
);

udf.func(
  'listRuns',
  async (
    ctx: FabricCtx,
    kind: string,
  ): Promise<{ id: string; status: string; startTimeUtc: string | null; endTimeUtc: string | null; failureMessage: string | null }[]> => {
    const config = readConfig(ctx);
    const notebooks = await notebookIds(ctx.Tokens.Fabric, config.notebookWorkspaceId);
    const notebookId = notebooks[jobKind(kind)];
    const items = await fabricList<{
      id: string;
      status: string;
      startTimeUtc?: string | null;
      endTimeUtc?: string | null;
      failureReason?: { message?: string } | null;
    }>(ctx.Tokens.Fabric, `/workspaces/${config.notebookWorkspaceId}/items/${notebookId}/jobs/instances`);
    return items
      .map((j) => ({
        id: j.id,
        status: j.status,
        startTimeUtc: j.startTimeUtc ?? null,
        endTimeUtc: j.endTimeUtc ?? null,
        failureMessage: j.failureReason?.message ?? null,
      }))
      .sort((a, b) => (b.startTimeUtc ?? '').localeCompare(a.startTimeUtc ?? ''))
      .slice(0, 20);
  },
  [],
);

udf.func(
  'getRun',
  async (
    ctx: FabricCtx,
    kind: string,
    jobInstanceId: string,
  ): Promise<{
    id: string;
    status: string;
    startTimeUtc: string | null;
    endTimeUtc: string | null;
    failureMessage: string | null;
    snapshotUrl: string | null;
    exitJson: string | null;
  }> => {
    const config = readConfig(ctx);
    const notebooks = await notebookIds(ctx.Tokens.Fabric, config.notebookWorkspaceId);
    const notebookId = notebooks[jobKind(kind)];
    // beta=true is the documented way to read exitValue today (notebook-public-api).
    const res = await fabric(
      ctx.Tokens.Fabric,
      `/workspaces/${config.notebookWorkspaceId}/notebooks/${notebookId}/jobs/execute/instances/${guid(jobInstanceId, 'Run')}?beta=true`,
    );
    if (!res.ok) throw new Error(`Could not read run (${res.status}).`);
    const j = (await res.json()) as {
      id: string;
      status: string;
      startTimeUtc?: string | null;
      endTimeUtc?: string | null;
      failureReason?: { message?: string } | null;
      properties?: { exitValue?: string; computeDetails?: { monitoringInfo?: { executionSnapshotUrl?: string } } };
    };
    return {
      id: j.id,
      status: j.status,
      startTimeUtc: j.startTimeUtc ?? null,
      endTimeUtc: j.endTimeUtc ?? null,
      failureMessage: j.failureReason?.message ?? null,
      snapshotUrl: j.properties?.computeDetails?.monitoringInfo?.executionSnapshotUrl ?? null,
      exitJson: j.properties?.exitValue ?? null,
    };
  },
  [],
);
