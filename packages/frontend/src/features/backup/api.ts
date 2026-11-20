import { FunctionsError } from '@microsoft/rayfin-functions';
import { NetworkError } from '@microsoft/rayfin-client';
import type { AppFunctionsSchema } from '@rayfin-app/functions/types';
import { getRayfinClient } from '@/lib/rayfin-client';

type Out<K extends keyof AppFunctionsSchema> = AppFunctionsSchema[K]['output'];
type In<K extends keyof AppFunctionsSchema> = AppFunctionsSchema[K]['input'];

export type JobKind = 'backup' | 'restore';
export type NamedItem = Out<'listWorkspaces'>[number];
export type ArchiveRoot = Out<'listArchiveRoots'>[number];
export type BackupSet = Out<'getBackupSet'>;
export type Run = Out<'listRuns'>[number];
export type RunDetail = Out<'getRun'>;
export type RestoreInput = In<'startRestore'>;

export const ACTIVE_STATUSES = new Set(['NotStarted', 'InProgress']);

const fns = async () => (await getRayfinClient()).functions;

export const getMyRole = async () => (await fns()).getMyRole.invoke();
export const listWorkspaces = async () => (await fns()).listWorkspaces.invoke();
export const listLakehouses = async (workspaceId: string) => (await fns()).listLakehouses.invoke({ workspaceId });
export const listArchiveRoots = async () => (await fns()).listArchiveRoots.invoke();
export const listArchiveFolders = async (rootId: string, path: string) =>
  (await fns()).listArchiveFolders.invoke({ rootId, path });
export const createArchiveFolder = async (rootId: string, path: string) =>
  (await fns()).createArchiveFolder.invoke({ rootId, path });
export const listBackupSets = async (rootId: string, backupFolder: string) =>
  (await fns()).listBackupSets.invoke({ rootId, backupFolder });
export const getBackupSet = async (rootId: string, backupFolder: string, backupTimestamp: string) =>
  (await fns()).getBackupSet.invoke({ rootId, backupFolder, backupTimestamp });
export const startBackup = async (input: In<'startBackup'>) => (await fns()).startBackup.invoke(input);
export const startRestore = async (input: RestoreInput) => (await fns()).startRestore.invoke(input);
export const listRuns = async (kind: JobKind) => (await fns()).listRuns.invoke({ kind });
export const getRun = async (kind: JobKind, jobInstanceId: string) =>
  (await fns()).getRun.invoke({ kind, jobInstanceId });

/** Short, user-safe message. Never surfaces tokens or stack traces. */
export function describeError(error: unknown): string {
  if (error instanceof NetworkError) return "Can't reach the app's functions. Check you're online and try again.";
  if (error instanceof FunctionsError) {
    const msg = error.message.split('\n')[0] ?? '';
    return msg.length > 0 && msg.length < 200 ? msg : 'The function call failed.';
  }
  return 'Something went wrong. Try again.';
}

/** Runner exit JSON (see nb runner README "Exit JSON"). Fields are optional on purpose. */
export type RunnerResult = {
  status?: string;
  request_key?: string;
  error?: { code?: string; message?: string } | null;
  duration_seconds?: number;
  // backup
  source?: { workspace_name?: string; lakehouse_name?: string };
  backup_timestamp?: string;
  backup_location?: string;
  tables_backed_up?: number;
  rows_total?: number;
  files_included?: boolean;
  skipped_shortcuts_count?: number;
  // restore
  mode?: string;
  dry_run?: boolean | null;
  modified_target?: boolean | string;
  target?: { workspace_name?: string; lakehouse_name?: string };
  backup?: { source_workspace_name?: string; source_lakehouse_name?: string };
  tables_to_restore?: number;
  clashes?: { path: string; kind: string }[];
  clashes_count?: number;
  outcome?: string;
  cleanup_plan?: { path: string; action: string }[] | null;
  cleanup_plan_error?: string | null;
  confirm_matches?: boolean;
  tables_restored?: number;
  tables_registration_failed?: number;
  files_restored?: boolean;
};

/** Reads the exit value, or the RAYFIN_RESULT JSON a failed runner puts in its error text. */
export function parseResult(detail: RunDetail): RunnerResult | null {
  const raw =
    detail.exitJson ??
    (detail.failureMessage?.includes('RAYFIN_RESULT ')
      ? detail.failureMessage.slice(detail.failureMessage.indexOf('RAYFIN_RESULT ') + 14)
      : null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunnerResult;
  } catch {
    return null;
  }
}
