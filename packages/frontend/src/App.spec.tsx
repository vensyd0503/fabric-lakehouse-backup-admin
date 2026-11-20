//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// The backup console calls app functions; stub them for render tests.
vi.mock('@/features/backup/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/backup/api')>();
  return {
    ...actual,
    listWorkspaces: vi.fn(async () => []),
    listArchiveRoots: vi.fn(async () => []),
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(),
    startBackup: vi.fn(),
    startRestore: vi.fn(),
  };
});

import App from '@/App';

describe('App', () => {
  it('renders without throwing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('mounts content into the document', () => {
    render(<App />);
    expect(document.body).not.toBeEmptyDOMElement();
  });
});
