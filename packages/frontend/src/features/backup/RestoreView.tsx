import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACTIVE_STATUSES,
  describeError,
  getBackupSet,
  listBackupSets,
  parseResult,
  startRestore,
  type ArchiveRoot,
  type BackupSet,
  type NamedItem,
  type RestoreInput,
  type RunDetail,
  type RunnerResult,
} from './api';
import { FolderBrowser } from './FolderBrowser';
import { LakehousePicker, type LakehouseRef } from './LakehousePicker';
import { RunsPanel, type RunsPanelHandle } from './RunsPanel';
import { formatBackupTimestamp, formatTime } from './format';
import { ErrorNote, Loading, Stat, Step, cardClass, dangerButton, fieldClass, primaryButton, quietButton } from './ui';

const OUTCOMES: Record<string, string> = {
  nothing_in_the_way: 'Nothing in the way. The restore can go ahead.',
  will_stop_target_not_empty: 'The target already has some of these tables or files. Pick a cleanup option to continue.',
  will_delete_then_restore: 'Clashing tables and files will be deleted, then restored.',
  will_delete_everything_then_restore: 'Everything in the target will be deleted, then restored.',
};

type Scope = 'full' | 'schemas' | 'tables';
const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: 'full', label: 'Full restore', hint: 'Deletes every table and all Files in the target, then restores everything in the backup.' },
  { value: 'schemas', label: 'Selected schemas', hint: 'Deletes those schemas’ tables in the target, then restores them. Files are not touched.' },
  { value: 'tables', label: 'Selected tables', hint: 'Deletes those tables in the target, then restores them. Files are not touched.' },
];
const tableKey = (t: { schema: string; table: string }) => `${t.schema}.${t.table}`;

function labelForRun(r: RunnerResult | null): string | null {
  return r?.mode ? modeLabel(r) : null;
}

function modeLabel(r: RunnerResult): string {
  if (r.mode === 'restore' && r.dry_run === false) return 'Restore';
  if (r.mode === 'restore') return 'Dry run';
  return 'Preview';
}

function RestoreResult({ result }: { result: RunnerResult }) {
  const real = result.mode === 'restore' && result.dry_run === false;
  const clashes = result.clashes ?? [];
  const plan = result.cleanup_plan ?? [];
  return (
    <>
      <p className="text-300">
        <span className="font-semibold">{modeLabel(result)}</span>
        {result.target && <> into {`${result.target.workspace_name ?? '?'} / ${result.target.lakehouse_name ?? '?'}`}</>}
        {result.backup_timestamp && <> from the {formatBackupTimestamp(result.backup_timestamp)} backup</>}
      </p>
      {result.outcome && (
        <p
          className={cn(
            'flex items-start gap-200 rounded-lg border p-300 text-200',
            result.outcome === 'will_stop_target_not_empty' ? 'border-warning' : 'border-border',
          )}
        >
          {result.outcome === 'nothing_in_the_way' ? (
            <CheckCircle2 aria-hidden className="icon-size-200 mt-100 shrink-0 text-success" />
          ) : (
            <AlertTriangle aria-hidden className="icon-size-200 mt-100 shrink-0 text-warning" />
          )}
          {OUTCOMES[result.outcome] ?? result.outcome}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-400 sm:grid-cols-4">
        <Stat label="Tables to restore" value={String(result.tables_to_restore ?? '—')} />
        <Stat label="Clashes" value={String(result.clashes_count ?? clashes.length)} />
        {real && <Stat label="Restored" value={String(result.tables_restored ?? 0)} />}
        {real && <Stat label="Need re-registering" value={String(result.tables_registration_failed ?? 0)} />}
      </dl>
      {clashes.length > 0 && (
        <details className="text-200">
          <summary className="cursor-pointer font-medium">Clashing items ({result.clashes_count ?? clashes.length})</summary>
          <ul className="mt-200 flex flex-col gap-100 font-monospace">
            {clashes.slice(0, 50).map((c) => (
              <li key={c.path}>{c.path}</li>
            ))}
          </ul>
        </details>
      )}
      {plan.length > 0 && (
        <details className="text-200">
          <summary className="cursor-pointer font-medium">Cleanup plan ({plan.length})</summary>
          <ul className="mt-200 flex flex-col gap-100 font-monospace">
            {plan.slice(0, 50).map((p) => (
              <li key={p.path}>
                {p.action}: {p.path}
              </li>
            ))}
          </ul>
        </details>
      )}
      {result.cleanup_plan_error && <ErrorNote message={result.cleanup_plan_error} />}
    </>
  );
}

type Preview = { signature: string; jobId: string; detail: RunDetail | null };

export function RestoreView({
  workspaces,
  workspacesError,
  onRetryWorkspaces,
  roots,
  canAdmin,
  readOnly,
}: {
  workspaces: NamedItem[] | null;
  workspacesError: string | null;
  onRetryWorkspaces: () => void;
  roots: ArchiveRoot[];
  canAdmin: boolean;
  readOnly: boolean;
}) {
  const [rootId, setRootId] = useState(roots[0]?.id ?? '');
  const [folder, setFolder] = useState<string | null>(null);
  const [sets, setSets] = useState<string[] | null>(null);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState('');
  const [manifest, setManifest] = useState<BackupSet | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [target, setTarget] = useState<LakehouseRef | null>(null);
  const [scope, setScope] = useState<Scope>('full');
  const [selSchemas, setSelSchemas] = useState<Set<string>>(new Set());
  const [selTables, setSelTables] = useState<Set<string>>(new Set());
  const [confirmName, setConfirmName] = useState('');
  const [finalName, setFinalName] = useState('');
  const [confirming, setConfirming] = useState<'preview' | 'restore' | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const runs = useRef<RunsPanelHandle>(null);
  const latestTs = useRef('');

  const loadSets = (r: string, f: string, preselect?: string) => {
    setSets(null);
    setSetsError(null);
    setTimestamp('');
    setManifest(null);
    listBackupSets(r, f).then(
      (list) => {
        setSets(list);
        const pick = preselect && list.includes(preselect) ? preselect : list.length === 1 ? list[0] : undefined;
        if (pick) pickSetIn(r, f, pick);
      },
      (e: unknown) => setSetsError(describeError(e)),
    );
  };

  /** Accept the backup folder, its "backups" folder, or a single set inside it. */
  const normalise = (p: string): { base: string; ts?: string } => {
    const m = /^(?:(.*)\/)?backups(?:\/(\d{12})(?:\/.*)?)?$/.exec(p);
    return m ? { base: m[1] ?? '', ts: m[2] } : { base: p };
  };

  const pickSet = (ts: string) => pickSetIn(rootId, folder ?? '', ts);

  function pickSetIn(r: string, f: string, ts: string) {
    setTimestamp(ts);
    setManifest(null);
    setManifestError(null);
    latestTs.current = ts;
    getBackupSet(r, f, ts).then(
      (m) => {
        if (latestTs.current !== ts) return;
        setManifest(m);
        setSelSchemas(new Set());
        setSelTables(new Set());
      },
      (e: unknown) => {
        if (latestTs.current === ts) setManifestError(describeError(e));
      },
    );
  }


  // What the runner will do, derived from the scope. The engine keeps a table when
  // (schema in only_schemas or blank) AND (table in only_tables or blank) - bare names.
  const allTables = manifest?.tables ?? [];
  const schemaNames = [...new Set(allTables.map((t) => t.schema))].sort();
  const pickedTables = allTables.filter((t) => selTables.has(tableKey(t)));
  const onlySchemas =
    scope === 'schemas' ? [...selSchemas].sort().join(',') : scope === 'tables' ? [...new Set(pickedTables.map((t) => t.schema))].join(',') : '';
  const onlyTables = scope === 'tables' ? [...new Set(pickedTables.map((t) => t.table))].join(',') : '';
  const cleanTarget = scope === 'full' ? 'all' : 'replace';
  const restoreFiles = scope === 'full' && Boolean(manifest?.filesCopied);
  const schemaSet = new Set(onlySchemas.split(',').filter(Boolean));
  const tableSet = new Set(onlyTables.split(',').filter(Boolean));
  const effective =
    scope === 'full' ? allTables : allTables.filter((t) => schemaSet.has(t.schema) && (scope === 'schemas' || tableSet.has(t.table)));
  const extras = scope === 'tables' ? effective.filter((t) => !selTables.has(tableKey(t))) : [];
  const selectionEmpty = scope !== 'full' && effective.length === 0;

  const toggle = (set: Set<string>, key: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
    touch();
  };

  const input: RestoreInput | null =
    folder !== null && timestamp && manifest?.complete && target && !selectionEmpty
      ? {
          mode: 'preview',
          rootId,
          backupFolder: folder,
          backupTimestamp: timestamp,
          targetWorkspaceId: target.workspaceId,
          targetLakehouseId: target.lakehouseId,
          restoreFiles,
          onlySchemas,
          onlyTables,
          cleanTarget,
          confirmTargetName: confirmName,
          dryRun: true,
        }
      : null;
  const signature = input ? JSON.stringify(input) : '';

  const previewResult = preview?.detail ? parseResult(preview.detail) : null;
  const previewCurrent = preview !== null && preview.signature === signature;
  const previewRunning = previewCurrent && (!preview.detail || ACTIVE_STATUSES.has(preview.detail.status));
  const previewOk =
    previewCurrent &&
    preview.detail?.status === 'Completed' &&
    previewResult?.status === 'succeeded' &&
    previewResult.outcome !== 'will_stop_target_not_empty' &&
    !previewResult.cleanup_plan_error;
  const cleanupNeedsName = target !== null && confirmName !== target.lakehouseName;
  const missing =
    folder === null ? 'Pick an archive folder.'
    : !timestamp ? 'Pick a backup set in step 1.'
    : !manifest ? 'Reading the backup set…'
    : !manifest.complete ? 'This backup set is incomplete and can’t be restored.'
    : !target ? 'Pick the target workspace and lakehouse in step 2.'
    : selectionEmpty ? 'Select at least one schema or table in step 3.'
    : cleanupNeedsName ? 'Type the target lakehouse name exactly in step 3.'
    : null;
  const restoreNameOk = target !== null && finalName === target.lakehouseName;
  const sameAsSource =
    manifest && target && manifest.sourceLakehouseName === target.lakehouseName && manifest.sourceWorkspaceName === target.workspaceName;

  const touch = () => setConfirming(null);

  const run = async (mode: 'preview' | 'restore') => {
    if (!input || !canAdmin) return;
    setStarting(true);
    setStartError(null);
    try {
      const body: RestoreInput =
        mode === 'preview' ? input : { ...input, mode: 'restore', dryRun: false };
      const { jobInstanceId } = await startRestore(body);
      if (mode === 'preview') setPreview({ signature, jobId: jobInstanceId, detail: null });
      else setPreview(null);
      setConfirming(null);
      runs.current?.focus(jobInstanceId, mode === 'preview' ? 'Preview' : 'Restore');
    } catch (e) {
      setStartError(describeError(e));
    } finally {
      setStarting(false);
    }
  };

  const rowsTotal = manifest?.tables.reduce((n, t) => n + (t.rows ?? 0), 0) ?? 0;

  return (
    <div className="grid gap-500 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <section aria-labelledby="new-restore" className={`${cardClass} self-start`}>
        <div>
          <h2 id="new-restore" className="font-heading text-400 font-semibold">Restore a backup</h2>
          <p className="text-200 text-muted-foreground">
            Preview to see exactly what will be deleted, or restore straight away. Both ask you to type the target name.
          </p>
        </div>

        <div className="flex flex-col gap-500">
          <Step n={1} title="Backup set">
            {roots.length === 0 ? (
              <p className="text-200 text-muted-foreground">No storage locations are configured.</p>
            ) : (
              <FolderBrowser
                id="rs-src"
                roots={roots}
                rootId={rootId}
                path={folder ?? ''}
                allowCreate={false}
                onSelect={(r, p) => {
                  const { base, ts } = normalise(p);
                  setRootId(r);
                  setFolder(base);
                  touch();
                  loadSets(r, base, ts);
                }}
              />
            )}
            {folder === null ? (
              <p className="text-200 text-muted-foreground">Browse to a backup folder, its <span className="font-monospace">backups</span> folder, or a single backup set.</p>
            ) : setsError ? (
              <ErrorNote message={setsError} onRetry={() => loadSets(rootId, folder)} />
            ) : sets === null ? (
              <Loading label="Looking for backups…" />
            ) : sets.length === 0 ? (
              <p className="text-200 text-muted-foreground">No backups found here. Pick a folder that contains <span className="font-monospace">backups</span>, or a backup set inside it.</p>
            ) : (
              <div role="radiogroup" aria-label="Backup sets" className="flex max-h-[calc(var(--spacing-800)*7)] flex-col overflow-y-auto rounded-md border border-border">
                {sets.map((ts) => (
                  <label
                    key={ts}
                    className={cn(
                      'flex cursor-pointer items-center gap-300 border-b border-border px-300 py-200 text-200 last:border-b-0 hover:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring',
                      ts === timestamp && 'bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="backup-set"
                      value={ts}
                      checked={ts === timestamp}
                      onChange={() => {
                        touch();
                        pickSet(ts);
                      }}
                      className="accent-primary"
                    />
                    <span className="flex-1">{formatBackupTimestamp(ts)}</span>
                    <span className="font-monospace text-muted-foreground">{ts}</span>
                  </label>
                ))}
              </div>
            )}
            {manifestError && <ErrorNote message={manifestError} onRetry={() => pickSet(timestamp)} />}
            {timestamp && !manifest && !manifestError && <Loading label="Reading the backup manifest…" />}
            {manifest && !manifest.complete && (
              <ErrorNote message="This backup set is incomplete (no finished manifest), so it can't be restored." />
            )}
            {manifest?.complete && (
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-400 gap-y-100 rounded-md bg-muted p-300 text-200">
                <dt className="text-muted-foreground">Taken from</dt>
                <dd>{`${manifest.sourceWorkspaceName ?? '?'} / ${manifest.sourceLakehouseName ?? '?'}`}</dd>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>{formatTime(manifest.completedUtc)}</dd>
                <dt className="text-muted-foreground">Contents</dt>
                <dd>
                  {manifest.tables.length} tables, {rowsTotal.toLocaleString('en-AU')} rows
                  {manifest.filesCopied ? ', plus Files' : ', no Files'}
                </dd>
              </dl>
            )}
          </Step>

          <Step n={2} title="Restore into">
            <LakehousePicker
              id="rs-target"
              workspaces={workspaces}
              workspacesError={workspacesError}
              onRetryWorkspaces={onRetryWorkspaces}
              onChange={(v) => {
                setTarget(v);
                setConfirmName('');
                touch();
              }}
            />
            {sameAsSource && (
              <p className="flex items-start gap-200 text-200 text-warning">
                <AlertTriangle aria-hidden className="icon-size-200 mt-100 shrink-0" /> This is the lakehouse the backup was taken from.
              </p>
            )}
          </Step>

          <Step n={3} title="What to restore">
            <div role="radiogroup" aria-label="What to restore" className="flex flex-col gap-200">
              {SCOPES.map((c) => (
                <label key={c.value} className="flex items-start gap-200 text-200">
                  <input
                    type="radio"
                    name="scope"
                    value={c.value}
                    checked={scope === c.value}
                    onChange={() => {
                      setScope(c.value);
                      touch();
                    }}
                    className="mt-100 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className={cn('font-medium', c.value === 'full' && 'text-destructive')}>{c.label}</span>
                    <span className="text-muted-foreground">{c.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {!manifest?.complete && scope !== 'full' && (
              <p className="text-200 text-muted-foreground">Pick a backup set to see its schemas and tables.</p>
            )}

            {manifest?.complete && scope === 'full' && (
              <p className="text-200 text-muted-foreground">
                Restores all {allTables.length} tables{manifest.filesCopied ? ' and Files' : '. This backup has no Files, so the target’s Files are left alone'}.
              </p>
            )}

            {manifest?.complete && scope === 'schemas' && (
              <fieldset className="flex flex-col gap-100 rounded-md border border-border p-300">
                <legend className="px-100 text-200 font-medium">Schemas</legend>
                {schemaNames.map((s) => (
                  <label key={s} className="flex items-center gap-200 text-200">
                    <input type="checkbox" checked={selSchemas.has(s)} onChange={() => toggle(selSchemas, s, setSelSchemas)} className="accent-primary" />
                    <span className="flex-1 font-monospace">{s}</span>
                    <span className="text-muted-foreground">{allTables.filter((t) => t.schema === s).length} tables</span>
                  </label>
                ))}
              </fieldset>
            )}

            {manifest?.complete && scope === 'tables' && (
              <div className="flex max-h-[calc(var(--spacing-800)*9)] flex-col gap-300 overflow-y-auto rounded-md border border-border p-300">
                {schemaNames.map((s) => (
                  <fieldset key={s} className="flex flex-col gap-100">
                    <legend className="text-200 font-medium font-monospace">{s}</legend>
                    {allTables
                      .filter((t) => t.schema === s)
                      .map((t) => (
                        <label key={tableKey(t)} className="flex items-center gap-200 pl-300 text-200">
                          <input
                            type="checkbox"
                            checked={selTables.has(tableKey(t))}
                            onChange={() => toggle(selTables, tableKey(t), setSelTables)}
                            className="accent-primary"
                          />
                          <span className="flex-1 break-all font-monospace">{t.table}</span>
                          {t.rows !== null && <span className="text-muted-foreground">{t.rows.toLocaleString('en-AU')} rows</span>}
                        </label>
                      ))}
                  </fieldset>
                ))}
              </div>
            )}

            {manifest?.complete && scope !== 'full' && (
              <p aria-live="polite" className="text-200 text-muted-foreground">
                {selectionEmpty ? 'Nothing selected yet.' : `${effective.length} table${effective.length === 1 ? '' : 's'} will be deleted in the target (where present) and restored.`}
              </p>
            )}
            {extras.length > 0 && (
              <p className="flex items-start gap-200 text-200 text-warning">
                <AlertTriangle aria-hidden className="icon-size-200 mt-100 shrink-0" />
                <span>
                  The runner matches table names across the chosen schemas, so these will be included too:{' '}
                  <span className="font-monospace">{extras.map(tableKey).join(', ')}</span>
                </span>
              </p>
            )}

            {(
              <div className="flex flex-col gap-100">
                <label htmlFor="rs-confirm-name" className="text-200 font-medium">
                  Type the target lakehouse name to allow deletes
                </label>
                <input
                  id="rs-confirm-name"
                  value={confirmName}
                  onChange={(e) => {
                    setConfirmName(e.target.value);
                    touch();
                  }}
                  placeholder={target?.lakehouseName ?? 'Pick a target first'}
                  disabled={!target}
                  autoComplete="off"
                  className={fieldClass}
                />
              </div>
            )}
          </Step>

          {startError && <ErrorNote message={startError} />}

          {/* Preview status */}
          {previewCurrent && (
            <div aria-live="polite" className="rounded-lg border border-border p-300 text-200">
              {previewRunning ? (
                <Loading label="Preview running. Results show on the right." />
              ) : previewOk ? (
                <p className="flex items-center gap-200">
                  <CheckCircle2 aria-hidden className="icon-size-200 text-success" /> Preview passed. You can restore now.
                </p>
              ) : (
                <p className="flex items-center gap-200">
                  <AlertTriangle aria-hidden className="icon-size-200 text-warning" /> Preview found a blocker. Check the result, change the options and preview again.
                </p>
              )}
            </div>
          )}

          {readOnly && (
            <p id="rs-admin" className="text-200 text-muted-foreground">
              An admin has to preview or restore. You can still browse backups and review runs.
            </p>
          )}

          {confirming === 'preview' && (
            <div role="group" aria-labelledby="rs-confirm-preview" className="flex flex-col gap-300 rounded-lg border border-warning bg-muted p-400">
              <p id="rs-confirm-preview" className="text-300 font-medium">Run a restore preview?</p>
              <p className="text-200 text-muted-foreground">Read-only, but it runs a Spark notebook on your Fabric capacity.</p>
              <div className="flex gap-200">
                <button type="button" onClick={() => void run('preview')} disabled={starting} className={primaryButton} autoFocus>
                  {starting ? <Loader2 aria-hidden className="icon-size-200 animate-spin" /> : <Eye aria-hidden className="icon-size-200" />}
                  {starting ? 'Starting…' : 'Yes, preview'}
                </button>
                <button type="button" onClick={touch} disabled={starting} className={quietButton}>Cancel</button>
              </div>
            </div>
          )}

          {confirming === 'restore' && target && (
            <div role="group" aria-labelledby="rs-confirm-restore" className="flex flex-col gap-300 rounded-lg border border-destructive bg-muted p-400">
              <p id="rs-confirm-restore" className="text-300 font-medium">
                Restore into {target.workspaceName} / {target.lakehouseName}?
              </p>
              <p className="text-200 text-muted-foreground">
                {previewOk
                  ? 'This deletes what the preview listed, then restores.'
                  : scope === 'full'
                    ? `No preview was run. This deletes every table${restoreFiles ? ' and all Files' : ''} in ${target.lakehouseName}, then restores everything in the backup.`
                    : `No preview was run. This deletes ${effective.length} table${effective.length === 1 ? '' : 's'} in ${target.lakehouseName} where present, then restores them.`}{' '}
                It can't be undone from this app.
              </p>
              <div className="flex flex-col gap-100">
                <label htmlFor="rs-final-name" className="text-200 font-medium">Type {target.lakehouseName} to confirm</label>
                <input
                  id="rs-final-name"
                  value={finalName}
                  onChange={(e) => setFinalName(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  className={fieldClass}
                />
              </div>
              <div className="flex gap-200">
                <button type="button" onClick={() => void run('restore')} disabled={starting || !restoreNameOk} className={dangerButton}>
                  {starting ? <Loader2 aria-hidden className="icon-size-200 animate-spin" /> : <RotateCcw aria-hidden className="icon-size-200" />}
                  {starting ? 'Starting…' : 'Restore now'}
                </button>
                <button type="button" onClick={touch} disabled={starting} className={quietButton}>Cancel</button>
              </div>
            </div>
          )}

          {confirming === null && (
            <div className="flex flex-wrap gap-200">
              <button
                type="button"
                onClick={() => setConfirming('preview')}
                disabled={!canAdmin || !input || cleanupNeedsName || previewRunning}
                aria-describedby={readOnly ? 'rs-admin' : undefined}
                className={previewOk ? quietButton : primaryButton}
              >
                <Eye aria-hidden className="icon-size-200" /> {previewCurrent ? 'Preview again' : 'Preview restore'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinalName('');
                  setConfirming('restore');
                }}
                disabled={!canAdmin || !input || cleanupNeedsName || previewRunning || starting}
                className={dangerButton}
              >
                <RotateCcw aria-hidden className="icon-size-200" /> Restore…
              </button>
              {missing && (
                <p aria-live="polite" className="basis-full text-200 text-muted-foreground">{missing}</p>
              )}
            </div>
          )}
        </div>
      </section>

      <RunsPanel
        ref={runs}
        kind="restore"
        title="Restore runs"
        emptyText="No restores or previews yet."
        renderResult={(result) => <RestoreResult result={result} />}
        labelFor={labelForRun}
        onDetail={(d) => setPreview((p) => (p && p.jobId === d.id ? { ...p, detail: d } : p))}
      />
    </div>
  );
}
