import { useEffect, useState } from 'react';
import { ArrowRight, Database, HardDrive, Table2 } from 'lucide-react';
import type { JobKind, Run } from './api';
import { parseUtc } from './format';

/** Typical duration of finished runs of this kind (median, ms). Null when there's no history. */
function typicalDuration(runs: Run[] | null, excludeId: string): number | null {
  const done = (runs ?? [])
    .filter((r) => r.id !== excludeId && r.status === 'Completed' && r.startTimeUtc && r.endTimeUtc)
    .map((r) => parseUtc(r.endTimeUtc as string).getTime() - parseUtc(r.startTimeUtc as string).getTime())
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  return done.length ? done[Math.floor(done.length / 2)] : null;
}

function Endpoint({ icon: Icon, label }: { icon: typeof Database; label: string }) {
  return (
    <div className="flex w-[calc(var(--spacing-800)*2)] shrink-0 flex-col items-center gap-100 text-center">
      <span className="flex items-center justify-center rounded-lg bg-muted p-200">
        <Icon aria-hidden className="icon-size-400 text-primary" />
      </span>
      <span className="text-200 text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Decorative copy animation plus an estimated progress bar for a running job.
 * The Fabric job API gives no percentage, so the bar is time-based and capped at 95%.
 */
export function TransferProgress({ kind, startTimeUtc, runs, runId }: { kind: JobKind; startTimeUtc: string | null; runs: Run[] | null; runId: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const lakehouse = { icon: Database, label: 'Lakehouse' };
  const storage = { icon: HardDrive, label: 'ADLS archive' };
  const [from, to] = kind === 'backup' ? [lakehouse, storage] : [storage, lakehouse];

  const typical = typicalDuration(runs, runId);
  const elapsed = startTimeUtc ? Math.max(0, now - parseUtc(startTimeUtc).getTime()) : 0;
  const pct = typical && startTimeUtc ? Math.min(95, Math.round((elapsed / typical) * 100)) : null;
  const remainingMin = typical && pct !== null && pct < 95 ? Math.max(1, Math.round((typical - elapsed) / 60_000)) : null;
  const verb = kind === 'backup' ? 'Copying Delta tables to the archive' : 'Restoring Delta tables from the archive';

  return (
    <div className="flex flex-col gap-300">
      <div aria-hidden className="flex items-center gap-300">
        <Endpoint {...from} />
        <div className="relative h-[calc(var(--spacing-800)*1.25)] flex-1">
          <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-border" />
          <ArrowRight className="absolute right-0 top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground" />
          {[0, 0.8, 1.6].map((delay) => (
            <span key={delay} className="xfer-chip" style={{ animationDelay: `${delay}s` }}>
              <Table2 className="icon-size-300 text-primary" />
            </span>
          ))}
        </div>
        <Endpoint {...to} />
      </div>

      <div className="flex flex-col gap-100">
        <div className="flex items-baseline justify-between gap-300 text-200">
          <span>{verb}…</span>
          <span className="text-muted-foreground">
            {pct === null ? 'No earlier runs to estimate from' : remainingMin ? `About ${remainingMin} min left (estimate)` : 'Finishing up…'}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${verb}, estimated progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          className="relative h-[calc(var(--spacing-100)*1.5)] overflow-hidden rounded-full bg-muted"
        >
          {pct === null ? (
            <div className="xfer-bar-indeterminate rounded-full bg-primary" />
          ) : (
            <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}
