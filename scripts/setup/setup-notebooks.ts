/**
 * Import the three runner notebooks into the workspace named by NOTEBOOK_WORKSPACE_ID.
 *
 * Uses the installer's own Fabric token (FABRIC_ACCESS_TOKEN, or Azure CLI).
 * Does not start a notebook or read lakehouse data. Run it yourself; the
 * authoring agent must not.
 *
 * The Create Notebook and Update Notebook Definition calls follow the public
 * Fabric REST shape. Whether update overwrites an existing definition has not
 * been executed against a tenant from this repository.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseDotenv } from './answers.ts';
import { accountFromAccessToken, fabricAccessHint, fabricTokenArgs, type TokenAccount } from './notebook-auth.ts';
import { REQUIRED_NOTEBOOKS } from '../../packages/functions/src/notebooks.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FABRIC_API = 'https://api.fabric.microsoft.com/v1';

interface FabricItem {
  id?: string;
  displayName?: string;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function workspaceId(): string {
  const fromEnv = process.env.NOTEBOOK_WORKSPACE_ID?.trim();
  if (fromEnv) return fromEnv;
  const secretsPath = resolve(root, 'rayfin/.env.secrets');
  if (!existsSync(secretsPath)) {
    fail('NOTEBOOK_WORKSPACE_ID is not set. Run npm run setup or export NOTEBOOK_WORKSPACE_ID.');
  }
  const parsed = parseDotenv(readFileSync(secretsPath, 'utf8'));
  const id = parsed.NOTEBOOK_WORKSPACE_ID?.trim();
  if (!id) fail(`NOTEBOOK_WORKSPACE_ID is missing from ${secretsPath}.`);
  return id;
}

function tenantFlag(): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith('--tenant='));
  if (inline) {
    const value = inline.slice('--tenant='.length).trim();
    if (!value) fail('--tenant needs a tenant id or domain.');
    return value;
  }
  const index = process.argv.indexOf('--tenant');
  if (index === -1) return undefined;
  const value = process.argv[index + 1]?.trim();
  if (!value || value.startsWith('-')) fail('--tenant needs a tenant id or domain.');
  return value;
}

function accessToken(tenant: string | undefined): string {
  const supplied = process.env.FABRIC_ACCESS_TOKEN?.trim();
  if (supplied) {
    if (tenant) process.stderr.write('--tenant is ignored because FABRIC_ACCESS_TOKEN is set.\n');
    return supplied;
  }
  const result = spawnSync('az', fabricTokenArgs(tenant), { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'Azure CLI failed.').split('\n')[0];
    const login = tenant ? `az login --tenant ${tenant} --allow-no-subscriptions` : 'az login --tenant <tenant> --allow-no-subscriptions';
    fail(`Could not get a Fabric token from Azure CLI (${detail}). Sign in with ${login}, or set FABRIC_ACCESS_TOKEN.`);
  }
  const token = result.stdout.trim();
  if (!token) fail('Azure CLI returned an empty Fabric token.');
  return token;
}

function failHttp(action: string, status: number, who: TokenAccount, requestedTenant: string | undefined): never {
  if (status === 401 || status === 403) {
    fail(fabricAccessHint({ status, action, account: who.account, tenantId: who.tenantId, requestedTenant }));
  }
  fail(`${action} failed (${status}).`);
}

async function fabric(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(path.startsWith('https://') ? path : `${FABRIC_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function listNotebooks(
  token: string,
  workspace: string,
  who: TokenAccount,
  requestedTenant: string | undefined,
): Promise<FabricItem[]> {
  const items: FabricItem[] = [];
  let next: string | undefined = `/workspaces/${workspace}/items?type=Notebook`;
  for (let page = 0; next && page < 20; page++) {
    const response = await fabric(token, next);
    if (!response.ok) failHttp('Listing notebooks', response.status, who, requestedTenant);
    const body = (await response.json()) as { value?: FabricItem[]; continuationUri?: string | null };
    items.push(...(body.value ?? []));
    next = body.continuationUri ?? undefined;
  }
  return items;
}

function definition(displayName: string, ipynb: Buffer): { format: string; parts: { path: string; payload: string; payloadType: string }[] } {
  const platform = Buffer.from(
    JSON.stringify({
      $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
      metadata: { type: 'Notebook', displayName },
      config: { version: '2.0', logicalId: randomUUID() },
    }),
  ).toString('base64');
  return {
    format: 'ipynb',
    parts: [
      { path: 'notebook-content.ipynb', payload: ipynb.toString('base64'), payloadType: 'InlineBase64' },
      { path: '.platform', payload: platform, payloadType: 'InlineBase64' },
    ],
  };
}

async function waitForOperation(
  token: string,
  response: Response,
  who: TokenAccount,
  requestedTenant: string | undefined,
): Promise<void> {
  if (response.status !== 202) return;
  let url = response.headers.get('Location') ?? '';
  if (!url) fail('Fabric accepted the notebook request but did not return an operation URL.');
  for (let attempt = 0; attempt < 30; attempt++) {
    const retry = Number(response.headers.get('retry-after') ?? '2');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(retry, 10) * 1000));
    const poll = await fabric(token, url);
    if (poll.status === 202) {
      url = poll.headers.get('Location') || url;
      continue;
    }
    if (!poll.ok) failHttp('Notebook operation', poll.status, who, requestedTenant);
    const body = (await poll.json()) as { status?: string; error?: { message?: string } };
    if (body.status === 'Succeeded' || body.status === 'Completed') return;
    if (body.status === 'Failed') fail(body.error?.message || 'Notebook operation failed.');
    if (body.status && body.status !== 'Running' && body.status !== 'NotStarted') {
      fail(`Notebook operation ended with status ${body.status}.`);
    }
  }
  fail('Notebook operation did not finish. Check the workspace in Fabric before retrying.');
}

async function importOne(
  token: string,
  workspace: string,
  name: string,
  existing: FabricItem | undefined,
  who: TokenAccount,
  requestedTenant: string | undefined,
): Promise<void> {
  const file = resolve(root, 'notebooks', `${name}.ipynb`);
  if (!existsSync(file)) fail(`Missing notebook file notebooks/${name}.ipynb.`);
  const body = { definition: definition(name, readFileSync(file)) };
  const path = existing?.id
    ? `/workspaces/${workspace}/notebooks/${existing.id}/updateDefinition`
    : `/workspaces/${workspace}/notebooks`;
  const payload = existing?.id ? body : { displayName: name, ...body };
  const response = await fabric(token, path, { method: 'POST', body: JSON.stringify(payload) });
  if (response.status === 202) {
    await waitForOperation(token, response, who, requestedTenant);
    return;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) failHttp(`Import of ${name}`, response.status, who, requestedTenant);
    let detail = '';
    try {
      const parsed = (await response.json()) as { message?: string; errorCode?: string };
      detail = parsed.message || parsed.errorCode || '';
    } catch {
      detail = '';
    }
    fail(`Import of ${name} failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}.`);
  }
}

async function main(): Promise<void> {
  const requestedTenant = tenantFlag();
  const workspace = workspaceId();
  const token = accessToken(requestedTenant);
  const who = accountFromAccessToken(token);
  process.stdout.write(`Signed in as ${who.account} (tenant ${who.tenantId}).\n`);
  const existing = await listNotebooks(token, workspace, who, requestedTenant);
  for (const name of REQUIRED_NOTEBOOKS) {
    const found = existing.filter((item) => item.displayName === name);
    if (found.length > 1) fail(`More than one notebook is named ${name}. Rename the extras, then run this again.`);
    await importOne(token, workspace, name, found[0], who, requestedTenant);
    process.stdout.write(`${found[0] ? 'Updated' : 'Imported'} ${name}\n`);
  }
  process.stdout.write('Notebooks are in the workspace. No job was started.\n');
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirect) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Notebook import failed.'}\n`);
    process.exit(1);
  });
}
