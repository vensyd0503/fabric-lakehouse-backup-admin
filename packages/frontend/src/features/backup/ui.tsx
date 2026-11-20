import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVE_STATUSES } from './api';

export const fieldClass =
  'w-full rounded-md border border-input bg-card px-300 py-200 text-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60';
export const primaryButton =
  'inline-flex items-center justify-center gap-200 rounded-md bg-primary px-400 py-200 text-300 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const dangerButton =
  'inline-flex items-center justify-center gap-200 rounded-md bg-destructive px-400 py-200 text-300 font-semibold text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const quietButton =
  'inline-flex items-center justify-center gap-200 rounded-md border border-border px-400 py-200 text-300 font-medium hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const linkButton =
  'inline-flex items-center gap-100 text-200 font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring';
export const cardClass = 'flex flex-col gap-400 rounded-xl border border-border bg-card p-500';

export function StatusPill({ status }: { status: string }) {
  const active = ACTIVE_STATUSES.has(status);
  const ok = status === 'Completed';
  const bad = status === 'Failed' || status === 'Cancelled';
  const Icon = active ? Loader2 : ok ? CheckCircle2 : bad ? XCircle : CircleDashed;
  const label = status === 'NotStarted' ? 'Queued' : status === 'InProgress' ? 'Running' : status;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-100 rounded-full border px-200 py-100 text-[length:var(--text-200)] font-medium',
        active && 'border-warning text-warning',
        ok && 'border-success text-success',
        bad && 'border-destructive text-destructive',
        !active && !ok && !bad && 'border-border text-muted-foreground',
      )}
    >
      <Icon aria-hidden className={cn('icon-size-100', active && 'animate-spin')} />
      {label}
    </span>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-200 rounded-lg border border-destructive p-300 text-200">
      <AlertTriangle aria-hidden className="icon-size-200 mt-100 shrink-0 text-destructive" />
      <p className="flex-1 break-words">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={linkButton}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-200 text-200 text-muted-foreground">
      <Loader2 aria-hidden className="icon-size-200 animate-spin" /> {label}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-100">
      <dt className="text-200 text-muted-foreground">{label}</dt>
      <dd className="font-numeric text-500 font-medium">{value}</dd>
    </div>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-300">
      <legend className="mb-200 flex items-center gap-200 text-300 font-semibold">
        <span aria-hidden className="inline-flex icon-size-500 items-center justify-center rounded-full bg-accent font-numeric text-200 text-accent-foreground">
          {n}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
