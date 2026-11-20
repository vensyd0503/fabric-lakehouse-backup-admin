/** Display names the runners `%run`. They are fixed; deployment config supplies the workspace. */
export const NOTEBOOK_NAMES = {
  engine: 'nb_backup_restore_adls_v6',
  backup: 'nb_backup_run',
  restore: 'nb_restore_run',
} as const;

export const REQUIRED_NOTEBOOKS = [
  NOTEBOOK_NAMES.engine,
  NOTEBOOK_NAMES.backup,
  NOTEBOOK_NAMES.restore,
] as const;
