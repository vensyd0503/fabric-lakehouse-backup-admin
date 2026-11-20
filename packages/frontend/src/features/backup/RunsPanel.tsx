import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACTIVE_STATUSES,
  describeError,
  getRun,
  listRuns,
  parseResult,
  type JobKind,
  type Run,
  type RunDetail,
  type RunnerResult,
} from "./api";
import { formatDuration, formatTime } from "./format";
import { ErrorNote, Loading, StatusPill, cardClass, quietButton } from "./ui";
import { TransferProgress } from "./TransferProgress";

const POLL_MS = 20_000;
const MAX_POLLS = 90; // ~30 minutes, then the user refreshes by hand

export type RunsPanelHandle = {
  focus: (jobInstanceId: string, label?: string) => void;
};

type Props = {
  kind: JobKind;
  title: string;
  emptyText: string;
  renderResult: (result: RunnerResult, detail: RunDetail) => ReactNode;
  onDetail?: (detail: RunDetail) => void;
  /** Optional per-run label (e.g. Preview / Restore) read from the run's result. */
  labelFor?: (result: RunnerResult | null) => string | null;
};

const LABEL_LOOKUPS = 15;
/** Failed and cancelled runs are hidden from the list unless asked for. */
const HIDDEN_STATUSES = new Set(["Failed", "Cancelled"]);

export const RunsPanel = forwardRef<RunsPanelHandle, Props>(function RunsPanel(
  { kind, title, emptyText, renderResult, onDetail, labelFor },
  ref,
) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pollsLeft, setPollsLeft] = useState(MAX_POLLS);
  const selectedRef = useRef<string | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);
  const onDetailRef = useRef(onDetail);
  onDetailRef.current = onDetail;
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [showFailed, setShowFailed] = useState(false);
  const requested = useRef(new Set<string>());

  // Finished runs never change, so each one's label is looked up once.
  useEffect(() => {
    if (!labelFor || !runs) return;
    runs
      .filter(
        (r) => !ACTIVE_STATUSES.has(r.status) && !requested.current.has(r.id),
      )
      .slice(0, LABEL_LOOKUPS)
      .forEach((r) => {
        requested.current.add(r.id);
        getRun(kind, r.id).then(
          (d) => {
            const label = labelFor(parseResult(d));
            if (label) setLabels((m) => ({ ...m, [r.id]: label }));
          },
          () => requested.current.delete(r.id),
        );
      });
  }, [runs, kind, labelFor]);

  const loadDetail = useCallback(
    (id: string) =>
      getRun(kind, id).then(
        (d) => {
          if (selectedRef.current !== id) return;
          setDetail(d);
          setDetailError(null);
          onDetailRef.current?.(d);
        },
        (e: unknown) => {
          if (selectedRef.current === id) setDetailError(describeError(e));
        },
      ),
    [kind],
  );

  const selectRun = useCallback(
    (id: string) => {
      selectedRef.current = id;
      setSelectedId(id);
      setDetail(null);
      setDetailError(null);
      void loadDetail(id);
    },
    [loadDetail],
  );

  const loadRuns = useCallback(
    () =>
      listRuns(kind)
        .then(
          (list) => {
            setRuns(list);
            setRunsError(null);
            if (!selectedRef.current && list[0]) selectRun(list[0].id);
          },
          (e: unknown) => setRunsError(describeError(e)),
        )
        .finally(() => setRefreshing(false)),
    [kind, selectRun],
  );

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (id: string, label?: string) => {
        if (label) setLabels((m) => ({ ...m, [id]: label }));
        setPollsLeft(MAX_POLLS);
        selectRun(id);
        void loadRuns();
      },
    }),
    [selectRun, loadRuns],
  );

  const anyActive =
    (runs ?? []).some((r) => ACTIVE_STATUSES.has(r.status)) ||
    (detail ? ACTIVE_STATUSES.has(detail.status) : false);
  useEffect(() => {
    window.clearTimeout(pollTimer.current);
    if (!anyActive || pollsLeft <= 0) return;
    pollTimer.current = window.setTimeout(() => {
      setPollsLeft((n) => n - 1);
      void loadRuns();
      if (selectedRef.current) void loadDetail(selectedRef.current);
    }, POLL_MS);
    return () => window.clearTimeout(pollTimer.current);
  }, [anyActive, pollsLeft, runs, detail, loadRuns, loadDetail]);

  const refreshAll = () => {
    setPollsLeft(MAX_POLLS);
    setRefreshing(true);
    void loadRuns();
    if (selectedRef.current) void loadDetail(selectedRef.current);
  };

  const result = detail ? parseResult(detail) : null;
  const headingId = `${kind}-runs`;
  const failedCount = (runs ?? []).filter((r) =>
    HIDDEN_STATUSES.has(r.status),
  ).length;
  const shownRuns = (runs ?? []).filter(
    (r) => showFailed || !HIDDEN_STATUSES.has(r.status) || r.id === selectedId,
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-400">
      <div className="flex items-center gap-300">
        <h2
          id={headingId}
          className="flex-1 font-heading text-400 font-semibold"
        >
          {title}
        </h2>
        {anyActive && (
          <span className="text-200 text-muted-foreground">
            {pollsLeft > 0
              ? "Auto-refreshing every 20s"
              : "Auto-refresh paused"}
          </span>
        )}
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className={quietButton}
        >
          <RefreshCw
            aria-hidden
            className={cn("icon-size-200", refreshing && "animate-spin")}
          />{" "}
          Refresh
        </button>
      </div>

      {selectedId && (
        <article aria-live="polite" className={cardClass}>
          {detailError ? (
            <ErrorNote
              message={detailError}
              onRetry={() => void loadDetail(selectedId)}
            />
          ) : !detail ? (
            <Loading label="Loading run…" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-300">
                <StatusPill status={detail.status} />
                <span className="text-200 text-muted-foreground">
                  Started {formatTime(detail.startTimeUtc)} ·{" "}
                  {formatDuration(detail.startTimeUtc, detail.endTimeUtc)}
                </span>
                {detail.snapshotUrl && (
                  <a
                    href={detail.snapshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-100 text-200 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Open in Fabric{" "}
                    <ExternalLink aria-hidden className="icon-size-100" />
                  </a>
                )}
              </div>
              {result ? (
                <>
                  {renderResult(result, detail)}
                  {result.error?.message && (
                    <ErrorNote
                      message={`${result.error.code ? `${result.error.code}: ` : ""}${result.error.message}`}
                    />
                  )}
                </>
              ) : ACTIVE_STATUSES.has(detail.status) ? (
                <>
                  <TransferProgress
                    kind={kind}
                    startTimeUtc={detail.startTimeUtc}
                    runs={runs}
                    runId={detail.id}
                  />
                  <p className="text-200 text-muted-foreground">
                    Results appear here when the notebook finishes.
                  </p>
                </>
              ) : (
                <p className="break-words text-200 text-muted-foreground">
                  {detail.failureMessage?.slice(0, 400) ??
                    "This run returned no summary."}
                </p>
              )}
            </>
          )}
        </article>
      )}

      {runsError ? (
        <ErrorNote message={runsError} onRetry={refreshAll} />
      ) : runs === null ? (
        <Loading label="Loading runs…" />
      ) : (
        <div className="flex flex-col gap-200">
          {shownRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-500 text-center text-200 text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <ul
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
              aria-label={`Recent ${kind} runs`}
            >
              {shownRuns.map((r) => (
                <li
                  key={r.id}
                  className="border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => selectRun(r.id)}
                    aria-current={r.id === selectedId ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-300 px-400 py-300 text-left hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      r.id === selectedId && "bg-accent",
                    )}
                  >
                    <StatusPill status={r.status} />
                    {labelFor && (
                      <span
                        className={cn(
                          "w-[calc(var(--spacing-800)*1.75)] shrink-0 text-200 font-medium",
                          labels[r.id] === "Restore"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {labels[r.id] ?? "…"}
                      </span>
                    )}
                    <span className="flex-1 text-200">
                      {formatTime(r.startTimeUtc)}
                    </span>
                    <span className="font-numeric text-200 text-muted-foreground">
                      {formatDuration(r.startTimeUtc, r.endTimeUtc)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowFailed((v) => !v)}
              aria-pressed={showFailed}
              className="self-end text-200 font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {showFailed ? "Hide failed" : `Show failed (${failedCount})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
});
