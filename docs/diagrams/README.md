# Diagrams

Drawn for the Lakehouse Backup & Restore Admin app. Each diagram is a PNG (2x, for embedding) and an SVG (scalable).
They were checked against `packages/functions/src/function_app.ts`, `packages/frontend/src/features/backup/` and the
notebooks in `notebooks/`.

| File | Shows |
|---|---|
| `01-architecture` | App workspace (UI + functions as the app identity), notebook workspace, OneLake lakehouses, ADLS archive, and which calls go where. |
| `02-backup-flow` | One backup, from the click to the archive and the polling that reads the result. |
| `03-restore-flow` | One restore: pick a backup, optional preview, typed confirmation, cleanup, copy, register, result. |
| `04-notebook-internals` | How a runner notebook is built, the engine's function groups, and the rules the engine follows. |
| `05-archive-layout` | What a backup looks like in ADLS, the manifest, and the OneLake paths the notebooks use. |
| `install-flow` | Install path: setup wizard, notebook import, first deploy, secrets, runtime lookup by name. |

## Regenerating

The SVGs are written by small Python scripts in `src/` (standard library only), and rendered to PNG with headless Chrome.

```sh
cd docs/diagrams/src
for f in d0*.py; do python3 "$f"; done        # writes ../0N-*.svg
for f in ../0*.svg; do ./render.sh "$f"; done  # writes ../0N-*.png at 2x (needs google-chrome)
```

If you change the app or the notebooks, update the matching script and re-run it.
