import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { accountFromAccessToken, fabricAccessHint, fabricTokenArgs } from './notebook-auth.ts';

function token(payload: Record<string, unknown>): string {
  const part = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(payload)}.sig`;
}

describe('notebook import auth', () => {
  it('reads upn and tid from the token and does not need the signature', () => {
    const who = accountFromAccessToken(
      token({ upn: 'admin@contoso.example', tid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', unique_name: 'other@contoso.example' }),
    );
    assert.deepEqual(who, {
      account: 'admin@contoso.example',
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
  });

  it('falls back to preferred_username when upn is absent', () => {
    const who = accountFromAccessToken(token({ preferred_username: 'admin@fabrikam.example', tid: 'fabrikam.example' }));
    assert.equal(who.account, 'admin@fabrikam.example');
    assert.equal(who.tenantId, 'fabrikam.example');
  });

  it('passes --tenant through to az account get-access-token', () => {
    assert.deepEqual(fabricTokenArgs('contoso.onmicrosoft.com').slice(-2), ['--tenant', 'contoso.onmicrosoft.com']);
    assert.equal(fabricTokenArgs().includes('--tenant'), false);
    assert.ok(fabricTokenArgs().includes('--resource'));
    assert.ok(fabricTokenArgs().includes('https://api.fabric.microsoft.com'));
  });

  it('explains a 401 with the account, the tenant, and the az login command', () => {
    const hint = fabricAccessHint({
      status: 401,
      action: 'Listing notebooks',
      account: 'admin@other.example',
      tenantId: '11111111-2222-3333-4444-555555555555',
    });
    assert.match(hint, /Listing notebooks failed \(401\)/);
    assert.match(hint, /admin@other\.example/);
    assert.match(hint, /11111111-2222-3333-4444-555555555555/);
    assert.match(hint, /wrong tenant or account/);
    assert.match(hint, /no access to the workspace/);
    assert.match(hint, /az login --tenant 11111111-2222-3333-4444-555555555555 --allow-no-subscriptions/);
    assert.match(hint, /npm run setup:notebooks -- --tenant 11111111-2222-3333-4444-555555555555/);
  });

  it('uses the requested tenant in the login hint when one was passed', () => {
    const hint = fabricAccessHint({
      status: 403,
      action: 'Import of nb_backup_run',
      account: 'admin@other.example',
      tenantId: '11111111-2222-3333-4444-555555555555',
      requestedTenant: 'contoso.onmicrosoft.com',
    });
    assert.match(hint, /failed \(403\)/);
    assert.match(hint, /az login --tenant contoso\.onmicrosoft\.com --allow-no-subscriptions/);
  });
});
