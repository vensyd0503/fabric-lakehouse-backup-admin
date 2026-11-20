import { useRef, useState } from 'react';
import { ChevronRight, Folder, FolderPlus, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createArchiveFolder, describeError, listArchiveFolders, type ArchiveRoot } from './api';
import { ErrorNote, Loading, fieldClass, linkButton, primaryButton, quietButton } from './ui';

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

/** Browse an allow-listed ADLS container, pick a folder or create one. */
export function FolderBrowser({
  id,
  roots,
  rootId,
  path,
  allowCreate,
  onSelect,
}: {
  id: string;
  roots: ArchiveRoot[];
  rootId: string;
  path: string;
  allowCreate: boolean;
  onSelect: (rootId: string, path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [browseRoot, setBrowseRoot] = useState(rootId);
  const [browsePath, setBrowsePath] = useState(path);
  const [folders, setFolders] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const newInput = useRef<HTMLInputElement>(null);

  const root = roots.find((r) => r.id === rootId);
  const browseRootInfo = roots.find((r) => r.id === browseRoot);

  const go = (nextRoot: string, nextPath: string) => {
    setBrowseRoot(nextRoot);
    setBrowsePath(nextPath);
    setFolders(null);
    setError(null);
    listArchiveFolders(nextRoot, nextPath).then(
      (r) => setFolders(r.folders),
      (e: unknown) => setError(describeError(e)),
    );
  };

  const openBrowser = (focusNew = false) => {
    setOpen(true);
    setCreateError(null);
    go(rootId || roots[0]?.id || '', path);
    if (focusNew) requestAnimationFrame(() => newInput.current?.focus());
  };

  const join = (...parts: string[]) => parts.filter(Boolean).join('/');
  const segments = browsePath ? browsePath.split('/') : [];

  const create = async () => {
    const name = newName.trim();
    if (!SEGMENT.test(name)) {
      setCreateError('Use letters, numbers, dot, dash or underscore.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createArchiveFolder(browseRoot, join(browsePath, name));
      setNewName('');
      go(browseRoot, created.path);
    } catch (e) {
      setCreateError(describeError(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-200">
      <div className="flex flex-col gap-100">
        <span id={`${id}-label`} className="text-200 font-medium">Archive folder</span>
        <div className="flex items-center gap-200 rounded-md border border-input bg-muted px-300 py-200">
          <HardDrive aria-hidden className="icon-size-200 shrink-0 text-muted-foreground" />
          <span aria-labelledby={`${id}-label`} className="flex-1 break-all font-monospace text-200">
            {root ? join(root.uri, path) || root.uri : 'No storage location'}
            {!path && <span className="font-base text-muted-foreground"> (container root)</span>}
          </span>
          {!open && (
            <>
              <button type="button" onClick={() => openBrowser()} disabled={roots.length === 0} className={linkButton}>
                Browse
              </button>
              {allowCreate && (
                <button type="button" onClick={() => openBrowser(true)} disabled={roots.length === 0} className={linkButton}>
                  New folder
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-300 rounded-lg border border-border p-300">
          {roots.length > 1 && (
            <div className="flex flex-col gap-100">
              <label htmlFor={`${id}-root`} className="text-200 font-medium">Storage container</label>
              <select id={`${id}-root`} value={browseRoot} onChange={(e) => go(e.target.value, '')} className={fieldClass}>
                {roots.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          <nav aria-label="Folder path" className="flex flex-wrap items-center gap-100 text-200">
            <button type="button" onClick={() => go(browseRoot, '')} className={linkButton}>
              {browseRootInfo?.label.split(' / ').pop() ?? 'root'}
            </button>
            {segments.map((seg, i) => (
              <span key={`${seg}-${i}`} className="inline-flex items-center gap-100">
                <ChevronRight aria-hidden className="icon-size-100 text-muted-foreground" />
                {i === segments.length - 1 ? (
                  <span aria-current="location" className="font-medium">{seg}</span>
                ) : (
                  <button type="button" onClick={() => go(browseRoot, segments.slice(0, i + 1).join('/'))} className={linkButton}>
                    {seg}
                  </button>
                )}
              </span>
            ))}
          </nav>

          {error ? (
            <ErrorNote message={error} onRetry={() => go(browseRoot, browsePath)} />
          ) : folders === null ? (
            <Loading label="Loading folders…" />
          ) : folders.length === 0 ? (
            <p className="text-200 text-muted-foreground">No sub-folders here.</p>
          ) : (
            <ul aria-label="Sub-folders" className="flex max-h-[calc(var(--spacing-800)*7)] flex-col overflow-y-auto rounded-md border border-border">
              {folders.map((f) => {
                const safe = SEGMENT.test(f);
                return (
                  <li key={f} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      disabled={!safe}
                      onClick={() => go(browseRoot, join(browsePath, f))}
                      title={safe ? undefined : 'This folder name is not supported'}
                      className={cn(
                        'flex w-full items-center gap-200 px-300 py-200 text-left text-200 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                        f === 'backups' && 'font-medium',
                      )}
                    >
                      <Folder aria-hidden className="icon-size-200 shrink-0 text-primary" />
                      <span className="flex-1 break-all">{f}</span>
                      <ChevronRight aria-hidden className="icon-size-100 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {allowCreate && (
            <div className="flex flex-col gap-100">
              <label htmlFor={`${id}-new`} className="text-200 font-medium">
                New folder in {browsePath ? `“${segments[segments.length - 1]}”` : 'the container root'}
              </label>
              <div className="flex gap-200">
                <input
                  ref={newInput}
                  id={`${id}-new`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void create();
                    }
                  }}
                  placeholder="e.g. lh_silver_weekly"
                  className={fieldClass}
                />
                <button type="button" onClick={() => void create()} disabled={creating || !newName.trim()} className={quietButton}>
                  <FolderPlus aria-hidden className="icon-size-200" /> {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
              {createError && <ErrorNote message={createError} />}
            </div>
          )}

          <div className="flex flex-wrap gap-200">
            <button
              type="button"
              onClick={() => {
                onSelect(browseRoot, browsePath);
                setOpen(false);
              }}
              className={primaryButton}
            >
              Use {browsePath ? `“${segments[segments.length - 1]}”` : 'container root'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={quietButton}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
