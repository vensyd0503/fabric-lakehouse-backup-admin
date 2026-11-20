from svglib import *
s = Svg(1200, 900)

# tree
s.group(30, 24, 700, 520, "ADLS GEN2 ARCHIVE  ·  what one backup leaves behind", fill=AMB_L, stroke=AMB, tcolor=AMB_D)
tree = [
    (0, "<container>/", "archive_root_uri (the account + container the app allows)"),
    (1, "<backup_folder>/", "optional; nested with /, created from the UI"),
    (2, "backups/", ""),
    (3, "202611201030/", "one folder per backup (UTC minute), never reused"),
    (4, "Tables/", ""),
    (5, "<schema>/", "\"dbo\" when the lakehouse has no schemas"),
    (6, "<table>/", "one Delta table"),
    (7, "_delta_log/", "kept, so table history survives"),
    (7, "part-*.parquet", "no _metadata folder"),
    (4, "Files/", "only if copy_files is on and Files is not empty"),
    (4, "_manifest/manifest.json", "written LAST: present = backup complete"),
    (3, "202611210200/ …", "the next backup, a new folder"),
]
y = 84
for depth, name, note in tree:
    x = 54 + depth * 22
    s.text(x, y, name, 13.5, "#4a2c00" if name.startswith("_manifest") else INK, 700 if depth in (3,) or name.startswith("_manifest") else 500, mono=True)
    if note:
        s.text(54 + 8 * 22 + 38 if depth >= 7 else 54 + 9 * 22 + 12, y, note, 12, MUTED) if False else None
    y += 34
# notes in a right column inside the group
yy = 84
for depth, name, note in tree:
    if note:
        s.text(352, yy, note, 12.5, MUTED)
    yy += 34
# guide lines

# manifest card
s.group(760, 24, 410, 520, "_manifest/manifest.json", fill=TEAL_XL, stroke=TEAL)
s.text(780, 66, [
    "status            \"complete\"",
    "backup_timestamp  \"202611201030\"",
    "started_utc, completed_utc",
    "source            workspace_id, lakehouse_id,",
    "                  workspace_name, lakehouse_name,",
    "                  has_schemas",
    "archive_run_root  …/backups/<ts>",
    "copy_method       fastcp_exclude | staged",
    "files_copied      true | false",
    "verify_counts     true | false",
    "tables[]          schema, table, version,",
    "                  numFiles, sizeInBytes, rows?",
    "skipped_shortcuts[]",
    "skipped_non_delta[]",
], 12, INK, 400, lh=19.5, mono=True)
s.box(780, 360, 370, 164, "Who reads it", [
    "App (getBackupSet): table list, row counts,",
    "Files flag, source names, completed time.",
    "A 404 means the set is incomplete.",
    "Restore: version, numFiles and sizeInBytes",
    "are checked after every table copy.",
    "Runner: builds the result summary."], fill="#ffffff", stroke=TEAL, tcolor=TEAL_D, size=12.5)

# onelake paths
s.group(30, 570, 1140, 250, "ONELAKE  ·  paths the notebooks touch (always full abfss paths; no default lakehouse is attached)", fill="#fafafa", stroke=GREY_B, tcolor=LINE)
s.cyl(54, 612, 330, 186, "Source / Target lakehouse", [
    "backup reads  Tables/<schema>/<table>",
    "and Files/  (shortcuts are skipped)",
    "",
    "restore writes the same layout:",
    "tables are registered with CREATE TABLE",
    "… USING DELTA LOCATION; Files top-level",
    "items are copied, never overwritten"], size=12.5)
s.cyl(412, 612, 350, 186, "Staging / control lakehouse", [
    "Files/backup_staging/<ts>/",
    "temporary: capability probe and the staged-copy",
    "fallback; removed when the backup ends",
    "",
    "Files/rayfin_runs/<runner>/<request_key>.json",
    "the result JSON copy; kept",
    "(the app reads the job's exit value instead)"], size=12.5)
s.box(790, 612, 356, 186, "Guard rails", [
    "Staging may not equal the source, and the",
    "app refuses it as a restore target.",
    "The result lakehouse may not be the source",
    "(backup) or the target (restore).",
    "Restore never overwrites: items in the way",
    "must be cleaned first, with the exact",
    "lakehouse name typed to confirm."], fill="#ffffff", stroke=GREY_B, tcolor=LINE, size=12.5)
s.h = 850
s.save("../05-archive-layout.svg")
