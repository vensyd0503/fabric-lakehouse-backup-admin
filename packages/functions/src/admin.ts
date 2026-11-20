/**
 * Two roles. Admin may back up, restore and create archive folders.
 * User is read-only. A minted appRole claim is authoritative. When dynamic
 * claims were not minted, fall back to ADMIN_SUBJECTS (object id or email).
 */

export type AppRole = 'admin' | 'user';
export type RoleSource = 'claims' | 'subjects';

export function parseAdminSubjects(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const normalized = part.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

export function decideRole(input: {
  /** App role from dynamic claims, or null when those claims were not minted. */
  claimRole: string | null;
  userId: string;
  email: string | null;
  adminSubjects: readonly string[];
}): { role: AppRole; source: RoleSource } {
  if (input.claimRole !== null) {
    const role = input.claimRole.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
    return { role, source: 'claims' };
  }
  const subjects = new Set(input.adminSubjects.map((subject) => subject.trim().toLowerCase()).filter(Boolean));
  const candidates = [input.userId, input.email ?? '']
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const role = candidates.some((candidate) => subjects.has(candidate)) ? 'admin' : 'user';
  return { role, source: 'subjects' };
}

export const ADMIN_REQUIRED = 'You need the admin role to back up, restore, or create archive folders.';
