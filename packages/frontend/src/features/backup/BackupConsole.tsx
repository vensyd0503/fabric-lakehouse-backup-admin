import { useCallback, useEffect, useState } from 'react';
import { Archive, DatabaseBackup, Moon, RotateCcw, Sun } from 'lucide-react';
import { APP_ICON, APP_SUBTITLE, APP_TITLE } from '@/branding';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/theme.context';
import { describeError, getMyRole, listArchiveRoots, listWorkspaces, type ArchiveRoot, type NamedItem } from './api';
import { BackupView } from './BackupView';
import { RestoreView } from './RestoreView';
import { ErrorNote, Loading } from './ui';

type Tab = 'restore' | 'backup';
const TABS: { id: Tab; label: string; icon: typeof Archive }[] = [
  { id: 'backup', label: 'Backup', icon: DatabaseBackup },
  { id: 'restore', label: 'Restore', icon: RotateCcw },
];

export default function BackupConsole() {
  const { isDark, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('backup');
  const [workspaces, setWorkspaces] = useState<NamedItem[] | null>(null);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [roots, setRoots] = useState<ArchiveRoot[] | null>(null);
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);

  const loadWorkspaces = useCallback(
    () =>
      listWorkspaces().then(
        (list) => {
          setWorkspaces(list);
          setWorkspacesError(null);
        },
        (e: unknown) => setWorkspacesError(describeError(e)),
      ),
    [],
  );

  const loadRoots = useCallback(
    () =>
      listArchiveRoots().then(
        (list) => {
          setRoots(list);
          setRootsError(null);
        },
        (e: unknown) => setRootsError(describeError(e)),
      ),
    [],
  );

  useEffect(() => {
    document.title = APP_TITLE;
    void loadWorkspaces();
    void loadRoots();
    void getMyRole().then(
      (mine) => setRole(mine.role === 'admin' ? 'admin' : 'user'),
      () => setRole('user'),
    );
  }, [loadWorkspaces, loadRoots]);

  const canAdmin = role === 'admin';

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  const shared = {
    workspaces,
    workspacesError,
    onRetryWorkspaces: () => void loadWorkspaces(),
    canAdmin,
    readOnly: role === 'user',
  };

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-500 gap-y-300 px-500 py-300">
          <div className="flex items-center gap-300">
            <img
              src={`${import.meta.env.BASE_URL}${APP_ICON}`}
              alt=""
              aria-hidden
              className="size-800 shrink-0 rounded-full"
            />
            <div>
              <h1 className="font-heading text-400 font-semibold">{APP_TITLE}</h1>
              <p className="text-200 text-muted-foreground">{APP_SUBTITLE}</p>
            </div>
          </div>
          <div role="tablist" aria-label="Console sections" className="flex gap-100 rounded-lg bg-muted p-100">
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    'inline-flex items-center gap-200 rounded-md px-400 py-200 text-300 font-medium focus-visible:outline-2 focus-visible:outline-ring',
                    selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden className="icon-size-200" /> {t.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto rounded-md p-200 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
          >
            {isDark ? <Sun aria-hidden className="icon-size-300" /> : <Moon aria-hidden className="icon-size-300" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-500 py-600">
        {rootsError ? (
          <ErrorNote message={rootsError} onRetry={() => void loadRoots()} />
        ) : roots === null ? (
          <Loading label="Loading…" />
        ) : (
          <>
            <div id="panel-backup" role="tabpanel" aria-labelledby="tab-backup" hidden={tab !== 'backup'}>
              <BackupView {...shared} roots={roots} />
            </div>
            <div id="panel-restore" role="tabpanel" aria-labelledby="tab-restore" hidden={tab !== 'restore'}>
              <RestoreView {...shared} roots={roots} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
