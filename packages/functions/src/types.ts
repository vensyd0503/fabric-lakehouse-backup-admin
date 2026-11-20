/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  getMyRole: {
    input: Record<string, never>;
    output: { role: string; source: string };
  };
  listWorkspaces: {
    input: Record<string, never>;
    output: { id: string; name: string }[];
  };
  listLakehouses: {
    input: { workspaceId: string };
    output: { id: string; name: string }[];
  };
  listArchiveRoots: {
    input: Record<string, never>;
    output: { id: string; label: string; uri: string }[];
  };
  listArchiveFolders: {
    input: { rootId: string; path: string };
    output: { path: string; folders: string[] };
  };
  createArchiveFolder: {
    input: { rootId: string; path: string };
    output: { path: string };
  };
  listBackupSets: {
    input: { rootId: string; backupFolder: string };
    output: string[];
  };
  getBackupSet: {
    input: { rootId: string; backupFolder: string; backupTimestamp: string };
    output: { complete: boolean; completedUtc: null | string; sourceWorkspaceName: null | string; sourceLakehouseName: null | string; tables: { schema: string; table: string; rows: null | number }[]; filesCopied: boolean };
  };
  startBackup: {
    input: { sourceWorkspaceId: string; sourceLakehouseId: string; rootId: string; backupFolder: string; onlyTables: string };
    output: { jobInstanceId: string; requestKey: string };
  };
  startRestore: {
    input: { mode: string; rootId: string; backupFolder: string; backupTimestamp: string; targetWorkspaceId: string; targetLakehouseId: string; restoreFiles: boolean; onlySchemas: string; onlyTables: string; cleanTarget: string; confirmTargetName: string; dryRun: boolean };
    output: { jobInstanceId: string; requestKey: string };
  };
  listRuns: {
    input: { kind: string };
    output: { id: string; status: string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string }[];
  };
  getRun: {
    input: { kind: string; jobInstanceId: string };
    output: { id: string; status: string; startTimeUtc: null | string; endTimeUtc: null | string; failureMessage: null | string; snapshotUrl: null | string; exitJson: null | string };
  };
};
