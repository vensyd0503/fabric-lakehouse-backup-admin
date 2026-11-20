import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DeploymentConfigError,
  archiveDirectory,
  archiveUri,
  containerUri,
  loadDeploymentConfig,
  type SecretValues,
} from '../../packages/functions/src/config.ts';

const secrets: SecretValues = {
  NOTEBOOK_WORKSPACE_ID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
  STAGING_WORKSPACE_ID: '11111111-2222-3333-4444-555555555555',
  STAGING_LAKEHOUSE_ID: '66666666-7777-8888-9999-AAAAAAAAAAAA',
  ADLS_ACCOUNT: 'ContosoBackups',
  ADLS_CONTAINER: 'lakehouse-backups',
  ADLS_ARCHIVE_FOLDER: 'finance/prod',
  ADMIN_SUBJECTS: 'admin@contoso.example',
};

describe('deployment config', () => {
  it('normalises a complete secret bag', () => {
    const config = loadDeploymentConfig(secrets);
    assert.equal(config.notebookWorkspaceId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.equal(config.stagingLakehouseId, '66666666-7777-8888-9999-aaaaaaaaaaaa');
    assert.equal(config.archive.account, 'contosobackups');
    assert.equal(config.archive.folder, 'finance/prod');
    assert.equal(config.archive.id, 'archive');
    assert.equal(containerUri(config.archive), 'abfss://lakehouse-backups@contosobackups.dfs.core.windows.net');
    assert.equal(archiveUri(config.archive), `${containerUri(config.archive)}/finance/prod`);
    assert.equal(archiveDirectory(config.archive.folder, 'team'), 'finance/prod/team');
  });

  it('treats a hyphen archive folder as the container root', () => {
    const config = loadDeploymentConfig({ ...secrets, ADLS_ARCHIVE_FOLDER: '-' });
    assert.equal(config.archive.folder, '');
    assert.equal(archiveDirectory(config.archive.folder, 'team'), 'team');
    assert.equal(archiveUri(config.archive), containerUri(config.archive));
  });

  it('names every missing or invalid secret in one error', () => {
    assert.throws(
      () =>
        loadDeploymentConfig({
          ...secrets,
          NOTEBOOK_WORKSPACE_ID: 'not-a-guid',
          ADLS_ACCOUNT: 'no',
          ADLS_CONTAINER: '-bad-',
        }),
      (error: unknown) => {
        assert.ok(error instanceof DeploymentConfigError);
        assert.match(error.message, /NOTEBOOK_WORKSPACE_ID/);
        assert.match(error.message, /ADLS_ACCOUNT/);
        assert.match(error.message, /ADLS_CONTAINER/);
        assert.match(error.message, /npm run setup/);
        return true;
      },
    );
  });

  it('rejects a folder prefix that climbs out of the container', () => {
    assert.throws(() => loadDeploymentConfig({ ...secrets, ADLS_ARCHIVE_FOLDER: 'finance/../other' }), DeploymentConfigError);
  });
});
