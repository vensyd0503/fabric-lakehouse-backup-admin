from svglib import *
W = 1200
s = Svg(W, 1500)

# ---------- phase 1: app -------------------------------------------------
s.group(30, 24, 1140, 214, "IN THE APP  ·  React UI + Rayfin functions (app identity)")
xs = [46 + i * 222 for i in range(5)]
bw = 194
items = [
    ("Pick the archive", ["listArchiveRoots,", "listArchiveFolders:", "container + folder"], TEAL_L, TEAL, None),
    ("Pick a backup", ["listBackupSets (newest", "first); getBackupSet", "reads _manifest/", "manifest.json"], TEAL_L, TEAL, None),
    ("Pick target + scope", ["Everything → all (and", "Files, if backed up)", "A subset → replace", "Staging lakehouse refused"], TEAL_L, TEAL, None),
    ("Preview restore", ["OPTIONAL. mode =", "preview, dry_run = true.", "Type the target name if", "the scope deletes data."], "#ffffff", TEAL, "6 4"),
    ("Restore…", ["Type the target name to", "confirm. mode = restore,", "dry_run = false. Works", "without a preview."], "#fdecea", RED, None),
]
for i, (t, ls, f, st, d) in enumerate(items):
    s.box(xs[i], 62, bw, 150, t, ls, fill=f, stroke=st, size=12.5, num="ABCDE"[i], dash=d)
    if i < 4:
        s.arrow([(xs[i] + bw + 2, 137), (xs[i + 1] - 3, 137)], "t", sw=2)

# ---------- phase 2: notebook ---------------------------------------------
s.group(30, 252, 1140, 1190, "NOTEBOOK WORKSPACE  ·  nb_restore_run (runner) + nb_backup_restore_adls_v6 (engine)", fill=BLUE_XL, stroke=BLUE)
X, WM = 50, 600
yy = 300
s.box(X, yy, 1100, 130, "Validate: reads only, any failure ends the run as failed with an error.code", [], fill=BLUE_L, stroke=BLUE, tsize=14, num=1)
s.text(X + 40, yy + 52, ["•  mode is preview or restore; dry_run, restore_files are booleans", "•  target workspace / lakehouse are GUIDs; timestamp is 12 digits", "•  clean_target is blank, replace or all; all + filters is rejected", "•  archive address is valid and the container root can be listed"], 12.5, INK, 400, lh=17.5)
s.text(X + 570, yy + 52, ["•  manifest exists and says complete (else backup_incomplete)", "•  target lakehouse resolves via Fabric REST (lakehouse_not_found)", "•  restore mode + cleanup: confirm_target_name must equal the", "    lakehouse name exactly, case-sensitive (confirmation_mismatch)"], 12.5, INK, 400, lh=17.5)
bottom = yy + 130
yy = bottom + 22
s.arrow([(X + 300, bottom), (X + 300, yy)], "b", sw=2)
b = card(s, X, yy, WM, "preview_restore: read-only",
         ["Reads the manifest and looks at the target. A clash is a table (or a top-level", "Files name) the backup would write that already exists there."], num=2)
s.arrow([(X + 300, b), (X + 300, b + 22)], "b", sw=2)
yy = b + 22
b = card(s, X, yy, WM, "Cleanup plan (only if clean_target is set and the name matches)",
         ["clean_target_for_restore(dry_run = true) lists what would be deleted:", "cleanup_plan, or cleanup_plan_error (for example a shortcut is in the way)."], num=3)
s.arrow([(X + 300, b), (X + 300, b + 24)], "b", sw=2)
dcy = b + 24 + 48
s.diamond(X + 300, dcy, 330, 96, ["mode = preview", "or dry_run = true?"])
# yes branch
s.arrow([(X + 465, dcy), (720, dcy)], "a", sw=2)
s.text(X + 480, dcy - 8, "yes", 12.5, AMB_D, 700)
card(s, 720, dcy - 70, 430, "Finish: nothing was changed",
     ["status = succeeded, modified_target = false.", "Result carries outcome (nothing_in_the_way,", "will_stop_target_not_empty, will_delete_then_restore,", "will_delete_everything_then_restore), clashes", "and the cleanup plan. The UI shows this as the preview."],
     fill="#fff8e1", stroke=AMB, tcolor=AMB_D)
yy = dcy + 48 + 26
s.arrow([(X + 300, dcy + 48), (X + 300, yy)], "b", sw=2)
s.text(X + 312, dcy + 48 + 18, "no: a real restore", 12.5, RED, 700)
b = card(s, X, yy, WM, "Guards: nothing touched if one fails",
         ["clashes but no clean_target  →  target_not_empty", "cleanup plan error  →  cleanup_blocked"], num=4)
s.arrow([(X + 300, b), (X + 300, b + 22)], "b", sw=2)
yy = b + 22
b = card(s, X, yy, WM, "Cleanup (only if clean_target = replace | all)",
         ["First re-reads every table in the backup and compares it with the manifest.", "Shortcuts are never deleted. Then DROP TABLE and delete each folder;", "stops the whole restore if a folder cannot be deleted."],
         fill="#fdecea", stroke=RED, num=5)
card(s, 720, yy + 4, 430, "What each option deletes",
     ["replace: only the tables (and top-level Files", "names) that the backup puts back.", "all: every table in the target, plus everything", "under Files when Files are being restored."],
     fill="#ffffff", stroke=GREY_B, tcolor=LINE)
s.arrow([(X + 300, b), (X + 300, b + 22)], "b", sw=2)
yy = b + 22
b = card(s, X, yy, WM, "Copy and register each table",
         ["Destination folders must be absent; Files names must not clash.", "For each table: fastcp from the archive; version, file count and size must equal", "the manifest; CREATE SCHEMA IF NOT EXISTS; CREATE TABLE … USING DELTA", "LOCATION; SELECT 1 proves it can be read."], size=12.5, num=6)
card(s, 720, yy + 4, 430, "If registration fails",
     ["The data stays in place and the table is", "reported as copied_registration_failed.", "It needs a manual CREATE TABLE … LOCATION."],
     fill="#ffffff", stroke=GREY_B, tcolor=LINE)
s.arrow([(X + 300, b), (X + 300, b + 22)], "b", sw=2)
yy = b + 22
b = card(s, X, yy, WM, "Files (if restore_files and the backup holds Files)",
         ["Each top-level item is copied (fastcp or cp). Nothing is overwritten."], num=7)
s.arrow([(X + 300, b), (X + 300, b + 22)], "b", sw=2)
yy = b + 22
b = card(s, X, yy, WM, "Result",
         ["status: succeeded | completed_with_problems | failed", "modified_target: true | false | \"unknown\" (stopped part-way)", "Exit JSON, plus a copy at Files/rayfin_runs/nb_restore_run/<request_key>.json"],
         fill=TEAL_L, stroke=TEAL, tcolor=TEAL_D, num=8)
card(s, 720, yy + 4, 430, "Reading the result in the app",
     ["The UI polls getRun every 20 s. getRun reads", "properties.exitValue (beta job-instance endpoint)", "and the Runs panel labels the run Preview,", "Dry run or Restore from that JSON."],
     fill=TEAL_L, stroke=TEAL, tcolor=TEAL_D)
s.h = int(b + 40)
# fix group height
s.parts = [p.replace('height="1190"', f'height="{int(b + 40 - 252 - 12)}"') for p in s.parts]
s.arrow([(xs[3] + 97, 213), (xs[3] + 97, 296)], "t", sw=2.2)
s.arrow([(xs[4] + 97, 213), (xs[4] + 97, 296)], "r", sw=2.2)
s.text(xs[3] + 108, 262, "starts nb_restore_run", 12, TEAL_D, 600, halo=True)
s.text(xs[4] + 108, 262, "same job, real run", 12, RED, 600, halo=True)
s.save("../03-restore-flow.svg")
