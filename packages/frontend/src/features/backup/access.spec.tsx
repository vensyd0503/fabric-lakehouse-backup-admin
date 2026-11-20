import type { OpaqueSession } from '@microsoft/rayfin-auth';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Root } from '../../Root';
import type { AuthConfig, IAuthService } from '../../services/rayfin-auth.service';

const getMyRole = vi.fn(async () => ({ role: 'user', source: 'subjects' }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    getMyRole: () => getMyRole(),
    listWorkspaces: vi.fn(async () => []),
    listArchiveRoots: vi.fn(async () => [{ id: 'archive', label: 'account / container', uri: 'abfss://container@account.dfs.core.windows.net' }]),
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(),
    startBackup: vi.fn(),
    startRestore: vi.fn(),
  };
});

const authenticated: OpaqueSession = {
  user: null,
  isAuthenticated: true,
  isAnonymous: false,
};

function service(config: AuthConfig = { kind: 'ready' }): IAuthService {
  return {
    config,
    canSignIn: true,
    resolveSession: vi.fn(async () => authenticated),
    signIn: vi.fn(async () => authenticated),
  };
}

describe('admin actions in the console', () => {
  beforeEach(() => {
    getMyRole.mockReset();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it('hides backup and restore actions from a read-only user', async () => {
    getMyRole.mockResolvedValue({ role: 'user', source: 'subjects' });
    render(<Root rayfinAuthService={service()} />);
    expect(await screen.findByText('An admin has to start a backup. You can still review runs.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start backup' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Restore' })).toBeVisible();
  });

  it('leaves the backup action available to an admin', async () => {
    getMyRole.mockResolvedValue({ role: 'admin', source: 'claims' });
    render(<Root rayfinAuthService={service()} />);
    expect(await screen.findByRole('button', { name: 'Start backup' })).toBeVisible();
    expect(screen.queryByText('An admin has to start a backup. You can still review runs.')).toBeNull();
  });
});
