const dateFmt = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

// Fabric returns UTC timestamps without a zone suffix; treat them as UTC.
export function parseUtc(utc: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(utc) ? utc : `${utc}Z`);
}

export function formatTime(utc: string | null): string {
  return utc ? dateFmt.format(parseUtc(utc)) : '—';
}

/** 202611200240 (UTC) to a local date and time. */
export function formatBackupTimestamp(ts: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return m ? dateFmt.format(new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`)) : ts;
}

export function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const ms = (end ? parseUtc(end) : new Date()).getTime() - parseUtc(start).getTime();
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
