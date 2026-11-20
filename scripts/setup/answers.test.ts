import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECRET_NAMES } from '../../packages/functions/src/config.ts';
import {
  answersFromRecord,
  mergeLocalSettings,
  parseDotenv,
  renderEnvFile,
  renderSecretsFile,
  validateAnswers,
} from './answers.ts';

const sample = answersFromRecord({
  title: 'Contoso Backup',
  subtitle: 'Lakehouse archive for Contoso',
  iconPath: 'brand/icon.png',
  notebookWorkspaceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  stagingWorkspaceId: '11111111-2222-3333-4444-555555555555',
  stagingLakehouseId: '66666666-7777-8888-9999-aaaaaaaaaaaa',
  adlsAccount: 'contosobackups',
  adlsContainer: 'lakehouse-backups',
  archiveFolder: 'finance/prod',
  adminSubjects: 'admin@contoso.example, 00000000-0000-0000-0000-000000000001',
  devPort: '5173',
});

describe('setup answer files', () => {
  it('writes branding to rayfin/.env and ids to the secrets file', () => {
    const env = parseDotenv(renderEnvFile(sample));
    const secrets = parseDotenv(renderSecretsFile(sample));
    assert.equal(env.VITE_APP_TITLE, 'Contoso Backup');
    assert.equal(env.VITE_APP_SUBTITLE, 'Lakehouse archive for Contoso');
    assert.equal(env.VITE_APP_ICON, 'app-icon.png');
    assert.equal(env.DEV_PORT, '5173');
    assert.equal(secrets.NOTEBOOK_WORKSPACE_ID, sample.notebookWorkspaceId);
    assert.equal(secrets.STAGING_WORKSPACE_ID, sample.stagingWorkspaceId);
    assert.equal(secrets.STAGING_LAKEHOUSE_ID, sample.stagingLakehouseId);
    assert.equal(secrets.ADLS_ACCOUNT, 'contosobackups');
    assert.equal(secrets.ADLS_CONTAINER, 'lakehouse-backups');
    assert.equal(secrets.ADLS_ARCHIVE_FOLDER, 'finance/prod');
    assert.equal(secrets.ADMIN_SUBJECTS, sample.adminSubjects);
    assert.equal(env.ADLS_ACCOUNT, undefined);
    assert.equal(secrets.VITE_APP_TITLE, undefined);
    assert.deepEqual(Object.keys(secrets).sort(), Object.values(SECRET_NAMES).sort());
  });

  it('stores a hyphen when the archive folder is blank', () => {
    const secrets = parseDotenv(renderSecretsFile({ ...sample, archiveFolder: '  ' }));
    assert.equal(secrets.ADLS_ARCHIVE_FOLDER, '-');
  });

  it('rejects a setup with no admin subject', () => {
    const problems = validateAnswers({ ...sample, adminSubjects: ' , ' });
    assert.ok(problems.some((problem) => problem.includes('admin')));
  });

  it('merges secret values into local.settings.json without dropping other keys', () => {
    const existing = JSON.stringify({
      IsEncrypted: false,
      Values: { AzureWebJobsStorage: 'kept', FUNCTIONS_WORKER_RUNTIME: 'node', CUSTOM: 'yes' },
    });
    const merged = JSON.parse(mergeLocalSettings(existing, sample)) as { Values: Record<string, string> };
    assert.equal(merged.Values.CUSTOM, 'yes');
    assert.equal(merged.Values.AzureWebJobsStorage, 'kept');
    assert.equal(merged.Values.NOTEBOOK_WORKSPACE_ID, sample.notebookWorkspaceId);
    assert.equal(merged.Values.ADMIN_SUBJECTS, sample.adminSubjects);
  });
});
