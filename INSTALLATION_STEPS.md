# Publishing the Backup Restore app to Fabric

The commands to publish this Rayfin app to Fabric, in order. Run them from the repo root. The Rayfin CLI is installed in the project, not globally, so always prefix it with `npx`.

Before these steps, `npm run setup` wrote `rayfin/.env` and `rayfin/.env.secrets`, and `npm run setup:notebooks` imported the three notebooks into the notebook workspace.

## Prerequisite: archive storage role

The identity that runs or deploys the app must hold the **Storage Blob Data Contributor** role on the ADLS Gen2 storage account that holds the archive. That is the app item owner, which is the Fabric app identity that deployed functions run as.

Assign it at **storage account scope**, not container scope. Contributor is needed because the app creates folders, not just lists them.

```sh
az role assignment create --assignee <app-owner-object-id> --role "Storage Blob Data Contributor" --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.Storage/storageAccounts/<storage-account>
```

When the role is missing, browsing the archive folder shows "Can't reach the app's functions. Check you're online and try again." instead of a clear storage error.

[Call Azure Blob Storage](https://rayfin.ai/docs/functions/connections#call-azure-blob-storage) says to grant the app identity the Azure Storage data role.

## 1. Sign in to Fabric

```sh
npx rayfin login
```

Opens the browser to sign in. Check that the user and tenant it prints are the tenant that owns your Fabric workspace.

## 2. Deploy the app

```sh
npx rayfin up
```

Builds and deploys the runtime, functions and static hosting. At the workspace prompt, "Use new workspace [Recommended]" auto-created `backup-admin-<timestamp>-<suffix>` and assigned it to your capacity. Look for that name, not "backup-admin", in the portal. It records the workspace and item IDs in `rayfin/.env` and backs up the old file to `rayfin/.env.bak`.

## 3. Upload the app secrets

```sh
npx rayfin secret set --env-file rayfin/.env.secrets
```

Uploads every `KEY=VALUE` line in `rayfin/.env.secrets`, a gitignored file that must never be committed. There are seven keys: `NOTEBOOK_WORKSPACE_ID`, `STAGING_WORKSPACE_ID`, `STAGING_LAKEHOUSE_ID`, `ADLS_ACCOUNT`, `ADLS_CONTAINER`, `ADLS_ARCHIVE_FOLDER` and `ADMIN_SUBJECTS`. A new value can take a few minutes to reach the deployed functions, so the first backup straight after this may fail briefly. In `ADMIN_SUBJECTS`, include your Entra object ID as well as your UPN (comma-separated), because dynamic claims may only give the function the object ID.

## 4. Verify the secret names

```sh
npx rayfin --json secret list
```

Lists the uploaded secret names and timestamps, never the values. All seven should appear, and they should match the `secrets:` list in `rayfin/rayfin.yml`.

Sources: Rayfin 2.0 docs `reference/cli/secret.md`, `deploy/secrets.md`, `deploy/rayfin-up.md`.
