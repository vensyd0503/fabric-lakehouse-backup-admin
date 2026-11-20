import { useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { describeError, listLakehouses, type NamedItem } from './api';
import { ErrorNote, fieldClass } from './ui';

export type LakehouseRef = {
  workspaceId: string;
  workspaceName: string;
  lakehouseId: string;
  lakehouseName: string;
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Type a workspace name, then a lakehouse name; both resolve to ids from Fabric. */
export function LakehousePicker({
  id,
  workspaces,
  workspacesError,
  onRetryWorkspaces,
  onChange,
}: {
  id: string;
  workspaces: NamedItem[] | null;
  workspacesError: string | null;
  onRetryWorkspaces: () => void;
  onChange: (value: LakehouseRef | null) => void;
}) {
  const [wsText, setWsText] = useState('');
  const [lhText, setLhText] = useState('');
  const [lakehouses, setLakehouses] = useState<NamedItem[] | null>(null);
  const [loadingLh, setLoadingLh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestWs = useRef('');

  const ws = workspaces?.find((w) => sameName(w.name, wsText));
  const lh = lakehouses?.find((l) => sameName(l.name, lhText));

  const loadLakehouses = (workspaceId: string) => {
    latestWs.current = workspaceId;
    setLakehouses(null);
    setError(null);
    setLoadingLh(true);
    listLakehouses(workspaceId)
      .then(
        (list) => {
          if (latestWs.current === workspaceId) setLakehouses(list);
        },
        (e: unknown) => {
          if (latestWs.current === workspaceId) setError(describeError(e));
        },
      )
      .finally(() => {
        if (latestWs.current === workspaceId) setLoadingLh(false);
      });
  };

  const onWorkspace = (text: string) => {
    setWsText(text);
    setLhText('');
    onChange(null);
    const match = workspaces?.find((w) => sameName(w.name, text));
    if (match) loadLakehouses(match.id);
    else {
      latestWs.current = '';
      setLakehouses(null);
      setLoadingLh(false);
    }
  };

  const onLakehouse = (text: string) => {
    setLhText(text);
    const match = lakehouses?.find((l) => sameName(l.name, text));
    onChange(
      ws && match ? { workspaceId: ws.id, workspaceName: ws.name, lakehouseId: match.id, lakehouseName: match.name } : null,
    );
  };

  return (
    <div className="grid gap-300 sm:grid-cols-2">
      <div className="flex flex-col gap-100">
        <label htmlFor={`${id}-ws`} className="text-200 font-medium">Workspace</label>
        <input
          id={`${id}-ws`}
          list={`${id}-ws-list`}
          value={wsText}
          onChange={(e) => onWorkspace(e.target.value)}
          placeholder={workspaces ? 'Start typing a name' : 'Loading workspaces…'}
          disabled={!workspaces}
          autoComplete="off"
          aria-describedby={`${id}-ws-hint`}
          className={fieldClass}
        />
        <datalist id={`${id}-ws-list`}>
          {workspaces?.map((w) => <option key={w.id} value={w.name} />)}
        </datalist>
        <p id={`${id}-ws-hint`} className="flex items-center gap-100 text-200 text-muted-foreground">
          {ws ? (
            <>
              <CheckCircle2 aria-hidden className="icon-size-100 text-success" /> Found
            </>
          ) : wsText ? (
            'No exact match yet'
          ) : (
            `${workspaces?.length ?? 0} workspaces you can access`
          )}
        </p>
      </div>

      <div className="flex flex-col gap-100">
        <label htmlFor={`${id}-lh`} className="text-200 font-medium">Lakehouse</label>
        <input
          id={`${id}-lh`}
          list={`${id}-lh-list`}
          value={lhText}
          onChange={(e) => onLakehouse(e.target.value)}
          placeholder={!ws ? 'Pick a workspace first' : loadingLh ? 'Loading lakehouses…' : 'Start typing a name'}
          disabled={!ws || !lakehouses}
          autoComplete="off"
          aria-describedby={`${id}-lh-hint`}
          className={fieldClass}
        />
        <datalist id={`${id}-lh-list`}>
          {lakehouses?.map((l) => <option key={l.id} value={l.name} />)}
        </datalist>
        <p id={`${id}-lh-hint`} className="flex items-center gap-100 text-200 text-muted-foreground">
          {lh ? (
            <>
              <CheckCircle2 aria-hidden className="icon-size-100 text-success" /> Found
            </>
          ) : lakehouses && lakehouses.length === 0 ? (
            'No lakehouses in this workspace'
          ) : lhText ? (
            'No exact match yet'
          ) : lakehouses ? (
            `${lakehouses.length} lakehouses`
          ) : (
            ' '
          )}
        </p>
      </div>

      {workspacesError && (
        <div className="sm:col-span-2">
          <ErrorNote message={workspacesError} onRetry={onRetryWorkspaces} />
        </div>
      )}
      {error && ws && (
        <div className="sm:col-span-2">
          <ErrorNote message={error} onRetry={() => loadLakehouses(ws.id)} />
        </div>
      )}
    </div>
  );
}
