import { useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { describeError, startBackup, type ArchiveRoot, type NamedItem, type RunnerResult } from './api';
import { FolderBrowser } from './FolderBrowser';
import { LakehousePicker, type LakehouseRef } from './LakehousePicker';
import { RunsPanel, type RunsPanelHandle } from './RunsPanel';
import { ErrorNote, Stat, Step, cardClass, fieldClass, primaryButton, quietButton } from './ui';

function BackupResult({ result }: { result: RunnerResult }) {
  if (result.tables_backed_up === undefined) return null;
  return (
    <>
      <dl className="grid grid-cols-2 gap-400 sm:grid-cols-4">
        <Stat label="Tables" value={(result.tables_backed_up ?? 0).toLocaleString('en-AU')} />
        <Stat label="Rows" value={(result.rows_total ?? 0).toLocaleString('en-AU')} />
        <Stat label="Duration" value={`${((result.duration_seconds ?? 0) / 60).toFixed(1)} min`} />
        <Stat label="Skipped shortcuts" value={(result.skipped_shortcuts_count ?? 0).toLocaleString('en-AU')} />
      </dl>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-400 gap-y-200 border-t border-border pt-400 text-200">
        <dt className="text-muted-foreground">Source</dt>
        <dd>{`${result.source?.workspace_name ?? '?'} / ${result.source?.lakehouse_name ?? '?'}`}</dd>
        <dt className="text-muted-foreground">Backup set</dt>
        <dd className="break-all font-monospace">{result.backup_location}</dd>
        <dt className="text-muted-foreground">Request key</dt>
        <dd className="font-monospace">{result.request_key}</dd>
      </dl>
    </>
  );
}

export function BackupView({
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
  const [source, setSource] = useState<LakehouseRef | null>(null);
  const [rootId, setRootId] = useState(roots[0]?.id ?? '');
  const [folder, setFolder] = useState('');
  const [onlyTables, setOnlyTables] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const runs = useRef<RunsPanelHandle>(null);

  const ready = Boolean(source && rootId);

  const onStart = async () => {
    if (!source || !canAdmin) return;
    setStarting(true);
    setStartError(null);
    try {
      const { jobInstanceId } = await startBackup({
        sourceWorkspaceId: source.workspaceId,
        sourceLakehouseId: source.lakehouseId,
        rootId,
        backupFolder: folder,
        onlyTables,
      });
      setConfirming(false);
      runs.current?.focus(jobInstanceId);
    } catch (e) {
      setStartError(describeError(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="grid gap-500 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <section aria-labelledby="new-backup" className={`${cardClass} self-start`}>
        <div>
          <h2 id="new-backup" className="font-heading text-400 font-semibold">New backup</h2>
          <p className="text-200 text-muted-foreground">Copies a lakehouse's Delta tables and Files to an ADLS archive folder.</p>
        </div>
        <form
          className="flex flex-col gap-500"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && canAdmin) setConfirming(true);
          }}
        >
          <Step n={1} title="Source lakehouse">
            <LakehousePicker
              id="bk-src"
              workspaces={workspaces}
              workspacesError={workspacesError}
              onRetryWorkspaces={onRetryWorkspaces}
              onChange={(v) => {
                setSource(v);
                setConfirming(false);
              }}
            />
          </Step>

          <Step n={2} title="Destination">
            {roots.length === 0 ? (
              <p className="text-200 text-muted-foreground">No storage locations are configured.</p>
            ) : (
              <FolderBrowser
                id="bk-dest"
                roots={roots}
                rootId={rootId}
                path={folder}
                allowCreate={canAdmin}
                onSelect={(r, p) => {
                  setRootId(r);
                  setFolder(p);
                  setConfirming(false);
                }}
              />
            )}
            <p className="text-200 text-muted-foreground">
              Each run writes a new <span className="font-monospace">backups/&lt;timestamp&gt;</span> set inside this folder.
            </p>
          </Step>

          <Step n={3} title="Options">
            <div className="flex flex-col gap-100">
              <label htmlFor="bk-tables" className="text-200 font-medium">
                Only these tables <span className="font-regular text-muted-foreground">(optional)</span>
              </label>
              <input
                id="bk-tables"
                value={onlyTables}
                onChange={(e) => {
                  setOnlyTables(e.target.value);
                  setConfirming(false);
                }}
                placeholder="Leave empty for all tables"
                aria-describedby="bk-tables-hint"
                className={fieldClass}
              />
              <p id="bk-tables-hint" className="text-200 text-muted-foreground">Comma-separated table names.</p>
            </div>
          </Step>

          {readOnly && (
            <p id="bk-admin" className="text-200 text-muted-foreground">
              An admin has to start a backup. You can still review runs.
            </p>
          )}

          {startError && <ErrorNote message={startError} />}

          {confirming && source ? (
            <div role="group" aria-labelledby="bk-confirm" className="flex flex-col gap-300 rounded-lg border border-warning bg-muted p-400">
              <p id="bk-confirm" className="text-300 font-medium">
                Back up {source.workspaceName} / {source.lakehouseName}?
              </p>
              <p className="text-200 text-muted-foreground">
                It runs a Spark notebook on your Fabric capacity. A 53-table lakehouse took about 7 minutes in testing.
              </p>
              <div className="flex gap-200">
                <button type="button" onClick={() => void onStart()} disabled={starting || !canAdmin} className={primaryButton} autoFocus>
                  {starting ? <Loader2 aria-hidden className="icon-size-200 animate-spin" /> : <Play aria-hidden className="icon-size-200" />}
                  {starting ? 'Starting…' : 'Yes, start backup'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={starting} className={quietButton}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="submit" disabled={!ready || !canAdmin} aria-describedby={readOnly ? 'bk-admin' : undefined} className={primaryButton}>
              <Play aria-hidden className="icon-size-200" /> Start backup
            </button>
          )}
        </form>
      </section>

      <RunsPanel
        ref={runs}
        kind="backup"
        title="Backup runs"
        emptyText="No backups yet."
        renderResult={(result) => <BackupResult result={result} />}
      />
    </div>
  );
}
