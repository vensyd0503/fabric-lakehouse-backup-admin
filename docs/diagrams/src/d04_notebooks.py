from svglib import *
s = Svg(1200, 1100)

# ---------------- left: runner ----------------
s.group(30, 24, 530, 810, "RUNNER NOTEBOOK  ·  nb_backup_run and nb_restore_run (same shape)", fill=BLUE_XL, stroke=BLUE)
X, W = 50, 490
y = 62
ys = {}
def step(n, title, lines, fill=BLUE_L, stroke=BLUE, key=None, last=False):
    global y
    b = card(s, X, y, W, title, lines, fill=fill, stroke=stroke, num=n)
    if key: ys[key] = (y, b)
    if not last:
        s.arrow([(X + W / 2, b), (X + W / 2, b + 20)], "b", sw=2)
    y = b + 20
step(1, "Parameters cell  (cell tag \"parameters\")",
     ["Defaults that the job request overrides by name. IDs are", "GUID text, lists are comma strings, flags are Boolean.", "nb_backup_run has 15 parameters, nb_restore_run has 16."])
step(2, "%run nb_backup_restore_adls_v6",
     ["Loads the engine's functions into the session. The item", "name must match exactly, in the same workspace."])
step(3, "Shared helpers  (identical in both runners)",
     ["RunnerError(code, message): a problem the caller can act on.", "GUID / boolean / request_key checks, archive address rule,", "container probe, _capture() copies engine prints and logs,", "_write_result_file() writes the result JSON to the control", "lakehouse."])
step(4, "validate_backup_params()  /  validate_restore_params()",
     ["Every guard runs before anything is written (reads only):", "formats, staging ≠ source, lakehouse lookups, container", "reachable. Restore also needs a complete manifest and the", "exact confirm name when it will delete."])
step(5, "Main block: call the engine, build RESULT",
     ["backup: backup_lakehouse_to_archive, or reuse a finished", "backup when the same backup_timestamp already completed", "for this source.", "restore: preview_restore, then the real restore if asked.", "RunnerError → its error.code; any other error → backup_failed", "or restore_failed (modified_target \"unknown\" if a restore", "had started)."], key="main")
step(6, "Result delivery",
     ["1. write Files/rayfin_runs/<runner>/<request_key>.json", "    (if a control lakehouse was given)", "2. print RESULT_JSON <json>", "3. failed and fail_on_error: raise RAYFIN_RESULT <json>,", "    so the job ends Failed", "4. notebookutils.notebook.exit(<json>)"],
     fill=TEAL_L, stroke=TEAL, last=True)

# ---------------- right: engine ----------------
s.group(690, 24, 480, 810, "ENGINE  ·  nb_backup_restore_adls_v6  (functions only)", fill="#f8f9fc", stroke=BLUE)
EX, EW = 710, 440
ey = 62
eys = {}
def ecard(key, title, lines, fill=BLUE_L, stroke=BLUE, mono=False):
    global ey
    b = card(s, EX, ey, EW, title, lines, fill=fill, stroke=stroke, size=12.5, tsize=14)
    eys[key] = (ey, b)
    ey = b + 16
ecard("backup", "backup_lakehouse_to_archive()",
      ["Plan the tables, copy each one, copy Files, write the", "manifest last, clean up staging. Raises on any failed check."])
ecard("restore", "Restore side",
      ["preview_restore()  read-only, returns the clashes", "clean_target_for_restore()  mode, confirm name, dry_run", "restore_from_archive()  cleanup, copy, register, Files", "restore_files_from_archive()  top-level Files, no overwrite"])
ecard("copy", "Copy method",
      ["exclude_flag_supported()  probes fastcp in the staging", "lakehouse", "copy_table_without_metadata()  fastcp with", "--exclude-path=_metadata, or (fallback) a staged copy that", "removes _metadata first"], fill="#ffffff", stroke=GREY_B)
ecard("inspect", "Inspect the archive",
      ["list_archive_backups()  folders, manifest present or not", "verify_archive_backup()  re-read tables, compare to manifest", "latest_complete_backup()  (the runners do not use it)"], fill="#ffffff", stroke=GREY_B)
ecard("helpers", "Helpers",
      ["lakehouse_root, normalize_archive_uri, check_timestamp,", "run_root_of, manifest_path_of, read_json, child_dirs,", "delta_state (version, numFiles, size), lakehouse_info,", "shortcut_paths, fabric_get (Fabric REST, retries 429 / 5xx)"], fill="#ffffff", stroke=GREY_B)

# arrows runner -> engine
my0, my1 = ys["main"]
sx = X + W
s.add(f'<path d="M{sx} {my0+40} L{sx+60} {my0+40}" stroke="{BLUE}" stroke-width="2" fill="none"/>')
b0, b1 = eys["backup"]; r0, r1 = eys["restore"]
s.arrow([(sx + 60, my0 + 40), (sx + 60, b0 + 40), (EX - 2, b0 + 40)], "b", sw=2)
s.arrow([(sx + 60, my0 + 40), (sx + 60, r0 + 40), (EX - 2, r0 + 40)], "b", sw=2)
s.text(sx + 8, b0 + 34, ["nb_backup_run"], 11.5, BLUE_D, 600, halo=True)
s.text(sx + 8, r0 + 34, ["nb_restore_run"], 11.5, BLUE_D, 600, halo=True)

# ---------------- bottom: rules ----------------
GH = int(max(y, ey) + 10 - 24)
s.parts = [p.replace('height="810"', f'height="{GH}"') for p in s.parts]
ry = 24 + GH + 22
s.box(30, ry, 1140, 150, "Rules the engine follows (each found by testing on the write-once container)", [], fill=AMB_L, stroke=AMB, tcolor=AMB_D, tsize=14)
s.text(50, ry + 52, ["•  Everything written to the archive goes through fastcp. fs.put and fs.cp fail there and leave empty files that cannot be deleted.",
                     "•  Tables are copied without their _metadata folder (the copy could not be queried through a shortcut). _delta_log, and so time travel, is kept.",
                     "•  The manifest is written last. A backup folder without a manifest is incomplete and restore ignores it.",
                     "•  Nothing in the archive is overwritten or deleted. A failed run stays; the next run uses a new timestamp.",
                     "•  Not covered: shortcuts (skipped, listed in the manifest), anything outside Tables and Files, permissions, SQL endpoint views."], 12.5, INK, 400, lh=18)
ly = ry + 168
s.box(30, ly, 1140, 56, None, [], fill="#ffffff", stroke=GREY_B, dash="6 4")
s.text(46, ly + 23, ["**Interactive fallback (not used by the app):** nb_backup_form, nb_restore_form and the two *_executor notebooks keep the original",
                     "widget-driven flow. The executors %run the engine and then their form notebook."], 12.5, INK, 400, lh=17.5)
s.h = ly + 76
s.save("../04-notebook-internals.svg")
