/**
 * Read who a Fabric access token belongs to, without calling Azure or Fabric.
 * The token is a JWT; only the payload is decoded, and the signature is not checked.
 */

export interface TokenAccount {
  account: string;
  tenantId: string;
}

export function fabricTokenArgs(tenant?: string): string[] {
  const args = [
    'account',
    'get-access-token',
    '--resource',
    'https://api.fabric.microsoft.com',
    '--query',
    'accessToken',
    '-o',
    'tsv',
  ];
  if (tenant) args.push('--tenant', tenant);
  return args;
}

export function accountFromAccessToken(token: string): TokenAccount {
  const payload = jwtPayload(token);
  const account =
    claim(payload, 'upn') ||
    claim(payload, 'preferred_username') ||
    claim(payload, 'unique_name') ||
    '(no upn claim)';
  return { account, tenantId: claim(payload, 'tid') || '(no tid claim)' };
}

export function fabricAccessHint(input: {
  status: number;
  action: string;
  account: string;
  tenantId: string;
  requestedTenant?: string;
}): string {
  const loginTenant = hintTenant(input.requestedTenant, input.tenantId);
  return [
    `${input.action} failed (${input.status}).`,
    `Signed in as ${input.account} (tenant ${input.tenantId}).`,
    'That is the wrong tenant or account, or this account has no access to the workspace.',
    'Sign in to the workspace tenant and run this again:',
    `  az login --tenant ${loginTenant} --allow-no-subscriptions`,
    `  npm run setup:notebooks -- --tenant ${loginTenant}`,
  ].join('\n');
}

function hintTenant(requested: string | undefined, tenantId: string): string {
  if (requested && requested.trim()) return requested.trim();
  if (/^[0-9a-f-]{36}$/i.test(tenantId) || tenantId.includes('.')) return tenantId;
  return '<tenant>';
}

function claim(payload: Record<string, unknown>, name: string): string {
  const value = payload[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function jwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  const body = parts[1];
  if (!body) throw new Error('The access token is not a JWT, so the signed-in account could not be read.');
  let json: string;
  try {
    json = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    throw new Error('The access token payload could not be decoded.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('The access token payload is not JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The access token payload is not an object.');
  }
  return parsed as Record<string, unknown>;
}
