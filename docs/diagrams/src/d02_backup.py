from svglib import *
cols = [(90, "Admin · UI", "React app", "app"),
        (240, "Functions", "app identity", "app"),
        (390, "Fabric REST", "jobs API", "nb"),
        (540, "nb_backup_run", "runner", "nb"),
        (690, "Engine", "adls_v6 notebook", "nb"),
        (840, "Source", "lakehouse", "store"),
        (990, "Staging / control", "lakehouse", "store"),
        (1140, "ADLS archive", "write-once", "arch")]
q = Seq(1230, cols, colw=136)
S = q.s
SRC, STG, ADLS = 5, 6, 7

q.note(0, 1, ["Admin picks the source lakehouse, ADLS folder and an optional table filter, then clicks Backup"], size=12, w=560)
q.msg(0, 1, "startBackup(source, root, folder, tables)", kind="t")
q.note(1, 1, ["Checks GUIDs and table list, picks the root from the", "allow-list, makes request_key = app-backup-<UTC time>"], size=12, w=330)
q.msg(1, 2, ["POST …/notebooks/{nb_backup_run}/jobs/execute/instances", "source_*, staging_*, archive_root_uri, backup_folder, only_tables, request_key, result_*"], kind="t", align="start", lsize=12.5)
q.msg(2, 1, "202 + Location = jobInstanceId", dashed=True, kind="t")
q.msg(1, 0, "jobInstanceId (run shows in the Runs panel)", dashed=True, kind="t")
y_poll_note = q.y
q.msg(2, 3, "start Spark session, run the notebook as the app identity", kind="b", align="start")

q.note(3, 3, ["**Validate** (reads only): GUIDs, staging ≠ source,", "abfss address + folder name, timestamp format"], size=12, w=300)
q.msg(3, 2, "GET workspace + lakehouse for source and staging", kind="b", align="start")
q.msg(3, 7, "list the container root (must be reachable)", kind="b", align="start")
q.msg(3, 4, "backup_lakehouse_to_archive(…)", kind="b")

q.msg(4, 7, "backups/<ts> must not exist yet (new UTC minute)", kind="b", align="start")
q.msg(4, 2, "GET lakehouse info, list source shortcuts", kind="b")
q.msg(4, 5, "list Tables/ (and schemas)", kind="b")
q.note(4, 4, ["**Plan:** Delta tables only. Shortcuts and non-Delta folders", "are skipped and listed in the manifest."], size=12, w=300)
q.msg(4, 6, "create Files/backup_staging/<ts>; probe: can fastcp skip _metadata?", kind="b", align="start")

y0 = q.y - 2
q.y += 22
q.msg(4, 5, "read Delta state: version, files, size", kind="b")
q.msg(4, 7, ["fastcp table to backups/<ts>/Tables/<schema>/<table>", "(copy without _metadata)"], kind="b", align="start")
q.note(4, 4, ["**Checks:** source unchanged during copy; copy has the same", "version, files, size; optional row count match (verify_counts)"], size=12, w=330)
y1 = q.y - 4
q.region(y0, y1, 560, 1186, "for each table", BLUE)
q.gap(6)
q.msg(4, 7, "fastcp Files/ to backups/<ts>/Files  (if copy_files and not empty)", kind="b", align="start")
q.msg(4, 7, ["write _manifest/manifest.json LAST", "(temp file, fastcp, then re-read and checked)"], kind="b", align="start")
q.msg(4, 6, "delete Files/backup_staging/<ts>", kind="b", align="start")
q.msg(4, 3, "timestamp (manifest present = complete)", dashed=True, kind="b")
q.msg(3, 6, "write Files/rayfin_runs/nb_backup_run/<request_key>.json", kind="b", align="start")
q.msg(3, 2, ["notebook.exit(result JSON): status, tables_backed_up, backup_location …", "(on failure: raise RAYFIN_RESULT <json>, so the job ends Failed)"], kind="b", align="start", dashed=True)

q.gap(10)
yp0 = q.y
q.y += 24
q.msg(0, 1, "getRun('backup', jobInstanceId)", kind="t")
q.msg(1, 2, "GET …/jobs/execute/instances/{id}?beta=true", kind="t", align="start")
q.msg(2, 1, "status, failureReason, properties.exitValue", dashed=True, kind="t", align="start")
q.msg(1, 0, "status + parsed result shown to the admin", dashed=True, kind="t")
yp1 = q.y - 2
q.region(yp0, yp1, 20, 560, "from step 4: UI polls every 20 s, up to 90 times (~30 min)", TEAL)
q.finish("../02-backup-flow.svg")
