import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideRole, parseAdminSubjects } from '../../packages/functions/src/admin.ts';

const subjects = parseAdminSubjects('Admin@Contoso.example, 00000000-0000-0000-0000-000000000001');

describe('admin gate', () => {
  it('parses UPNs and object ids', () => {
    assert.deepEqual(subjects, ['admin@contoso.example', '00000000-0000-0000-0000-000000000001']);
  });

  it('trusts a minted admin claim over the subject list', () => {
    const decision = decideRole({
      claimRole: 'admin',
      userId: 'someone-else',
      email: 'other@contoso.example',
      adminSubjects: [],
    });
    assert.deepEqual(decision, { role: 'admin', source: 'claims' });
  });

  it('keeps a minted user claim even when the subject list would match', () => {
    const decision = decideRole({
      claimRole: 'user',
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'admin@contoso.example',
      adminSubjects: subjects,
    });
    assert.deepEqual(decision, { role: 'user', source: 'claims' });
  });

  it('falls back to object id or email when claims were not minted', () => {
    assert.equal(
      decideRole({ claimRole: null, userId: '00000000-0000-0000-0000-000000000001', email: null, adminSubjects: subjects }).role,
      'admin',
    );
    assert.equal(
      decideRole({ claimRole: null, userId: 'other', email: 'ADMIN@contoso.example', adminSubjects: subjects }).role,
      'admin',
    );
    assert.equal(
      decideRole({ claimRole: null, userId: 'other', email: 'reader@contoso.example', adminSubjects: subjects }).role,
      'user',
    );
  });

  it('fails closed when the admin list is empty', () => {
    const decision = decideRole({
      claimRole: null,
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'admin@contoso.example',
      adminSubjects: [],
    });
    assert.equal(decision.role, 'user');
    assert.equal(decision.source, 'subjects');
  });
});
