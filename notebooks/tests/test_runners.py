import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harness import *
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (("  -> " + str(extra)[:300]) if not cond else ""))
    if not cond: fails.append(name)

BK = dict(source_workspace_id=SRC[0], source_lakehouse_id=SRC[1], staging_workspace_id=STG[0], staging_lakehouse_id=STG[1],
          archive_root_uri=ARCH, backup_folder="dev-sales", request_key="req-1")
def backup(**over):
    ns, fs, spark, exits = make_env(); p = dict(BK); p.update(over)
    if "_pre" in p: p.pop("_pre")(fs)
    r, exc, out = run_runner("nb_backup_run.ipynb", p, ns, exits)
    return r, exc, out, fs, spark, ns

# ---------------- backup ----------------
r, exc, out, fs, spark, ns = backup()
j = json.loads(r) if r else None
check("backup: exits with JSON", j is not None, (exc, out[-500:]))
check("backup: succeeded", j and j["status"] == "succeeded", j)
check("backup: ts 12 digits", j and re.fullmatch(r"\d{12}", j["backup_timestamp"]))
check("backup: 3 tables, schemas", j and j["tables_backed_up"] == 3 and j["schemas"] == ["dbo", "sales"], j)
check("backup: shortcut skipped", j and j["skipped_shortcuts"] == ["Tables/dbo/linked"], j)
check("backup: non-delta skipped", j and j["skipped_non_delta"] == ["Tables/dbo/notdelta"], j)
check("backup: files included, rows", j and j["files_included"] is True and j["rows_total"] == 30, j)
check("backup: request_key echoed", j and j["request_key"] == "req-1")
check("backup: manifest in archive", j and fs.exists(j["backup_location"] + "/_manifest/manifest.json"))
check("backup: no _metadata in archive", not any("/_metadata/" in f for f in fs.files if f.startswith(ARCH)))
check("backup: staging cleaned", not any("backup_staging" in f for f in fs.files))
check("backup: RESULT_JSON printed", "RESULT_JSON " in out)

ts = j["backup_timestamp"]
# idempotent retry with same explicit timestamp
ns2, fs2, sp2, ex2 = make_env()
r1, e1, o1 = run_runner("nb_backup_run.ipynb", dict(BK, backup_timestamp="202601011200"), ns2, ex2)
j1 = json.loads(r1); check("backup: explicit ts ok", j1["status"] == "succeeded" and j1["backup_timestamp"] == "202601011200" and j1["already_existed"] is False, j1)
ns3 = {"spark": sp2, "__name__": "nb"}; ex2.clear()
r2, e2, o2 = run_runner("nb_backup_run.ipynb", dict(BK, backup_timestamp="202601011200"), ns3, ex2)
j2 = json.loads(r2); check("backup: retry same ts -> idempotent success", j2["status"] == "succeeded" and j2["already_existed"] is True, j2)
puts_before = len(fs2.puts)
# same ts but different source lakehouse id present in manifest -> conflict (simulate by editing manifest)
mp = ARCH + "/dev-sales/backups/202601011200/_manifest/manifest.json"
m = json.loads(fs2.files[mp]); m["source"]["lakehouse_id"] = "zzz"; fs2.files[mp] = json.dumps(m)
ex2.clear(); r3, e3, o3 = run_runner("nb_backup_run.ipynb", dict(BK, backup_timestamp="202601011200", fail_on_error=False), {"spark": sp2, "__name__": "nb"}, ex2)
j3 = json.loads(r3); check("backup: ts conflict detected", j3["status"] == "failed" and j3["error"]["code"] == "timestamp_conflict", j3)

# validation failures -> raise (fail_on_error True) with RAYFIN_RESULT; JSON via fail_on_error False
def expect_fail(name, code, **over):
    r, exc, out, fs, spark, ns = backup(**over)
    check(name + " (raises, job Failed)", exc is not None and "RAYFIN_RESULT " in str(exc), (exc, r))
    if exc:
        jj = json.loads(str(exc).split("RAYFIN_RESULT ", 1)[1]); check(name + " code=" + code, jj["error"]["code"] == code, jj)
        check(name + " nothing written to archive", not [f for f in fs.files if f.startswith(ARCH + "/dev-sales")])
        return jj
    return None
expect_fail("backup: staging == source", "staging_is_source", staging_workspace_id=SRC[0], staging_lakehouse_id=SRC[1])
expect_fail("backup: bad guid", "invalid_parameter", source_workspace_id="not-a-guid")
expect_fail("backup: empty ids", "invalid_parameter", source_lakehouse_id="")
expect_fail("backup: bad archive uri", "invalid_parameter", archive_root_uri="https://x.blob.core.windows.net/c")
expect_fail("backup: bad folder", "invalid_parameter", backup_folder="../evil")
expect_fail("backup: bad timestamp", "invalid_parameter", backup_timestamp="2026-01")
expect_fail("backup: copy_files not bool", "invalid_parameter", copy_files="maybe")
expect_fail("backup: unknown lakehouse", "lakehouse_not_found", source_lakehouse_id="99999999-9999-9999-9999-999999999999")
expect_fail("backup: container unreachable (blocking)", "container_unreachable", _pre=lambda fs: fs.unreachable.add(ARCH))
expect_fail("backup: result lh == source", "invalid_parameter", result_workspace_id=SRC[0], result_lakehouse_id=SRC[1])
jj = expect_fail("backup: invalid request_key", "invalid_parameter", request_key="bad key!")
r, exc, out, fs, spark, ns = backup(staging_workspace_id=SRC[0], staging_lakehouse_id=SRC[1], fail_on_error=False)
check("backup: fail_on_error=False exits with JSON", r and json.loads(r)["status"] == "failed" and json.loads(r)["request_key"] == "req-1", (r, exc))
r, exc, out, fs, spark, ns = backup(copy_files="false", verify_counts="false")
jb = json.loads(r); check("backup: string bools coerced", jb["status"] == "succeeded" and jb["files_included"] is False and jb["rows_total"] is None, jb)
# engine failure mid-way -> backup_failed + log tail
def boom(fs):
    orig = fs.fastcp
    def f(src, dst, rec=True, extraConfigs=None):
        if "customers" in src and dst.startswith(ARCH): raise Exception("copy exploded")
        return orig(src, dst, rec, extraConfigs)
    fs.fastcp = f
r, exc, out, fs, spark, ns = backup(_pre=boom, fail_on_error=False)
jb = json.loads(r); check("backup: engine failure reported", jb["status"] == "failed" and jb["error"]["code"] == "backup_failed" and "copy exploded" in jb["error"]["message"], jb)
check("backup: failure carries report/log", any("BACKUP FAILED" in l for l in jb.get("report", [])) and jb.get("log_tail"), jb)
check("backup: failed run left no manifest", not [f for f in fs.files if f.endswith("manifest.json")])
# result file
r, exc, out, fs, spark, ns = backup(result_workspace_id=CTL[0], result_lakehouse_id=CTL[1])
jb = json.loads(r); rf = jb.get("result_file")
check("backup: result file written in control lakehouse", rf and rf in fs.files and rf.endswith("/Files/rayfin_runs/nb_backup_run/req-1.json") and json.loads(fs.files[rf])["status"] == "succeeded", jb)

# ---------------- restore ----------------
def fresh_backup_env():
    ns, fs, spark, exits = make_env()
    r, e, o = run_runner("nb_backup_run.ipynb", dict(BK, backup_timestamp="202601011200"), ns, exits)
    assert json.loads(r)["status"] == "succeeded", (r, e)
    return fs, spark
RS = dict(archive_root_uri=ARCH, backup_folder="dev-sales", backup_timestamp="202601011200",
          target_workspace_id=TGT[0], target_lakehouse_id=TGT[1], request_key="rq-1")
def restore(fs, spark, **over):
    ns = {"spark": spark, "__name__": "nb"}; exits = []
    nu = sys.modules["notebookutils"]; nu.notebook.exit = lambda v: (exits.append(v), (_ for _ in ()).throw(ExitSignal(v)))[0]
    p = dict(RS); p.update(over)
    r, exc, out = run_runner("nb_restore_run.ipynb", p, ns, exits)
    return r, exc, out
def snapshot(fs): return (dict(fs.files), set(fs.dirs))

fs, spark = fresh_backup_env()
snap = snapshot(fs); sql0 = len(spark.sql_log)
r, exc, out = restore(fs, spark)
j = json.loads(r) if r else None
check("restore preview: default mode", j and j["mode"] == "preview" and j["status"] == "succeeded", (exc, out[-400:]))
check("restore preview: counts/outcome", j and j["tables_to_restore"] == 3 and j["outcome"] == "nothing_in_the_way" and j["clashes"] == [], j)
check("restore preview: target names", j and j["target"]["lakehouse_name"] == "TargetLH" and j["backup"]["source_lakehouse_name"] == "Sales", j)
check("restore preview: report lines", j and any(l.startswith("Tables to restore") for l in j["report"]), j)
check("restore preview: modifies nothing", snapshot(fs) == snap and len(spark.sql_log) == sql0 and j["modified_target"] is False)
# preview with clean replace and no/ wrong confirm
r, exc, out = restore(fs, spark, clean_target="replace", confirm_target_name="targetlh")
j = json.loads(r); check("restore preview: confirm mismatch reported, no plan", j["confirm_matches"] is False and j["cleanup_plan"] is None, j)
check("restore preview: still read only", snapshot(fs) == snap)

# real restore, dry_run default True -> no change
r, exc, out = restore(fs, spark, mode="restore")
j = json.loads(r); check("restore: dry_run default changes nothing", j["status"] == "succeeded" and j["dry_run"] is True and j["modified_target"] is False and snapshot(fs) == snap, j)

# real restore into empty target
r, exc, out = restore(fs, spark, mode="restore", dry_run=False)
j = json.loads(r) if r else None
check("restore: succeeded", j and j["status"] == "succeeded" and j["tables_restored"] == 3 and j["tables_registration_failed"] == 0, (exc, j, out[-600:]))
check("restore: files restored", j and j["files_restored"] is True and any(f.endswith("/Files/docs/a.txt") and TGT[1] in f for f in fs.files))
check("restore: tables copied+registered", j and all(t["outcome"] == "restored" for t in j["tables"]) and any(q.startswith("CREATE TABLE") for q in spark.sql_log))
check("restore: modified flag", j and j["modified_target"] is True)

# second restore: target now has clashes, no clean -> target_not_empty (job fails), nothing changes
snap2 = snapshot(fs)
r, exc, out = restore(fs, spark, mode="restore", dry_run=False)
check("restore: not-empty target refused", exc is not None and "target_not_empty" in str(exc) and snapshot(fs) == snap2, (exc, r))
# preview shows clashes
r, exc, out = restore(fs, spark, clean_target="replace", confirm_target_name="TargetLH")
j = json.loads(r); check("restore preview: clashes + cleanup plan", j["outcome"] == "will_delete_then_restore" and j["clashes_count"] >= 3 and j["cleanup_plan"] and all(p["action"] == "would delete" for p in j["cleanup_plan"]), j)
check("restore preview(clean): read only", snapshot(fs) == snap2)
# confirm mismatch in restore mode -> refuse
for bad in ["", "targetlh", "TargetLH "[:-1] + "x"]:
    r, exc, out = restore(fs, spark, mode="restore", dry_run=False, clean_target="replace", confirm_target_name=bad)
    check(f"restore: confirm {bad!r} rejected, nothing deleted", exc is not None and "confirmation_mismatch" in str(exc) and snapshot(fs) == snap2, (exc, r))
# all + filters
r, exc, out = restore(fs, spark, mode="restore", dry_run=False, clean_target="all", confirm_target_name="TargetLH", only_tables="orders")
check("restore: 'all' + filters rejected", exc is not None and "cannot be combined" in str(exc) and snapshot(fs) == snap2, (exc, r))
r, exc, out = restore(fs, spark, mode="preview", clean_target="all", only_schemas="dbo")
check("restore: 'all' + filters rejected in preview too", exc is not None and "cannot be combined" in str(exc))
# bad clean value
r, exc, out = restore(fs, spark, clean_target="everything")
check("restore: bad clean_target rejected", exc is not None and "clean_target must be" in str(exc))
# restore with replace + exact confirm -> deletes and restores
before_del = len(fs.deletes)
r, exc, out = restore(fs, spark, mode="restore", dry_run=False, clean_target="replace", confirm_target_name="TargetLH")
j = json.loads(r) if r else None
check("restore: replace + exact confirm works", j and j["status"] == "succeeded" and j["tables_restored"] == 3 and len(fs.deletes) > before_del, (exc, j, out[-800:]))
check("restore: cleanup_plan recorded", j and j["cleanup_plan"] and j["cleanup_plan"][0]["action"] == "would delete", j)
# incomplete backup
fs3, sp3 = fresh_backup_env()
del fs3.files[ARCH + "/dev-sales/backups/202601011200/_manifest/manifest.json"]
r, exc, out = restore(fs3, sp3)
check("restore: incomplete backup rejected", exc is not None and "backup_incomplete" in str(exc), (exc, r))
r, exc, out = restore(fs3, sp3, backup_timestamp="209901010000", fail_on_error=False)
check("restore: missing backup -> backup_incomplete JSON", json.loads(r)["error"]["code"] == "backup_incomplete", r)
r, exc, out = restore(fs3, sp3, backup_timestamp="")
check("restore: blank timestamp rejected", exc is not None and "12 digits" in str(exc))
# unreachable container, unknown target, mode invalid
fs4, sp4 = fresh_backup_env(); fs4.unreachable.add(ARCH)
r, exc, out = restore(fs4, sp4); check("restore: container unreachable blocks", exc is not None and "container_unreachable" in str(exc), (exc, r))
fs5, sp5 = fresh_backup_env()
r, exc, out = restore(fs5, sp5, target_lakehouse_id="99999999-9999-9999-9999-999999999999"); check("restore: unknown target", exc is not None and "lakehouse_not_found" in str(exc))
r, exc, out = restore(fs5, sp5, mode="delete"); check("restore: invalid mode", exc is not None and "mode must be" in str(exc))
r, exc, out = restore(fs5, sp5, result_workspace_id=TGT[0], result_lakehouse_id=TGT[1]); check("restore: result lh == target rejected", exc is not None and "result lakehouse" in str(exc).lower())
# registration failure -> completed_with_problems
fs6, sp6 = fresh_backup_env(); sp6.fail_register.add("`region`")
r, exc, out = restore(fs6, sp6, mode="restore", dry_run=False)
j = json.loads(r) if r else None
check("restore: 'copied, registration failed' surfaced", j and j["status"] == "completed_with_problems" and j["tables_registration_failed"] == 1
      and any(t["outcome"] == "copied_registration_failed" and t["status"].startswith("copied, registration failed") for t in j["tables"]), (exc, j))
# filters + unmatched
fs7, sp7 = fresh_backup_env()
r, exc, out = restore(fs7, sp7, only_tables="orders, nope", only_schemas="dbo")
j = json.loads(r); check("restore preview: filters + unmatched", j["tables_to_restore"] == 1 and j["unmatched_tables"] == ["nope"], j)
# flat (no schema) target: names unique, fine
r, exc, out = restore(fs7, sp7, target_lakehouse_id="dddddddd-dddd-dddd-dddd-dddddddddddd", only_schemas="dbo")
j = json.loads(r) if r else None; check("restore preview: schema-less target", j and j["target"]["has_schemas"] is False, (exc, j))
# restore failing mid-way -> modified_target unknown
fs8, sp8 = fresh_backup_env(); orig = fs8.fastcp
def bad_fastcp(src, dst, rec=True, extraConfigs=None):
    if "customers" in src and TGT[1] in dst: raise Exception("restore copy exploded")
    return orig(src, dst, rec, extraConfigs)
fs8.fastcp = bad_fastcp
r, exc, out = restore(fs8, sp8, mode="restore", dry_run=False, fail_on_error=False)
j = json.loads(r); check("restore: engine failure -> failed + modified_target unknown", j["status"] == "failed" and j["error"]["code"] == "restore_failed" and j["modified_target"] == "unknown", j)
print("\nFAILED:" if fails else "\nALL PASSED", fails)
