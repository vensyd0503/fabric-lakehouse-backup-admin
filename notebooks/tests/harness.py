import sys, types, json, re, os, glob, copy, io, contextlib, logging
import pathlib
NBDIR = str(pathlib.Path(__file__).resolve().parent.parent) + '/'

# ---------- in-memory OneLake / ADLS ----------
class Info:
    def __init__(s, path, isDir): s.path = path; s.name = path.rsplit('/', 1)[-1] + ('/' if isDir else ''); s.isDir = isDir
class MemFS:
    def __init__(s): s.files = {}; s.dirs = set(); s.puts = []; s.deletes = []; s.unreachable = set()
    def _chk(s, p):
        for u in s.unreachable:
            if p.startswith(u): raise Exception("AuthorizationPermissionMismatch " + p)
    def _norm(s, p): return p.rstrip('/')
    def mkdirs(s, p):
        p = s._norm(p); s._chk(p)
        parts = p.split('/'); 
        for i in range(3, len(parts) + 1): s.dirs.add('/'.join(parts[:i]))
        return True
    def put(s, p, content, overwrite=False):
        p = s._norm(p); s._chk(p); s.mkdirs(p.rsplit('/', 1)[0]); s.files[p] = content; s.puts.append(p)
    def exists(s, p):
        p = s._norm(p); s._chk(p)
        return p in s.files or p in s.dirs or any(f.startswith(p + '/') for f in s.files)
    def ls(s, p):
        p = s._norm(p); s._chk(p)
        if not s.exists(p) and not re.fullmatch(r'abfss://[^/]+', p): raise Exception("PathNotFound " + p)
        out = {}
        for f in list(s.files) + list(s.dirs):
            if f.startswith(p + '/'):
                rest = f[len(p) + 1:]; first = rest.split('/')[0]
                out[first] = ('/' in rest) or (f in s.dirs)
        return [Info(p + '/' + k, d) for k, d in sorted(out.items())]
    def rm(s, p, rec=False):
        p = s._norm(p); s.deletes.append(p)
        for f in [f for f in s.files if f == p or f.startswith(p + '/')]: del s.files[f]
        for d in [d for d in s.dirs if d == p or d.startswith(p + '/')]: s.dirs.discard(d)
    def cp(s, a, b, rec=False): s.files[s._norm(b)] = s.files[s._norm(a)]
    def fastcp(s, src, dst, recurse=True, extraConfigs=None):
        dst = s._norm(dst); s._chk(dst)
        excl = '_metadata' if extraConfigs and '--exclude-path=_metadata' in extraConfigs.get('flags', '') else None
        if src.startswith('file:'):
            base = src[5:].rstrip('/'); name = os.path.basename(base)
            for root, _d, fs_ in os.walk(base):
                for fn in fs_:
                    rel = os.path.relpath(os.path.join(root, fn), base)
                    s.files[f"{dst}/{name}/{rel}"] = open(os.path.join(root, fn)).read()
            s.dirs.add(f"{dst}/{name}"); return
        src = s._norm(src); name = src.rsplit('/', 1)[-1]
        s.dirs.add(dst)
        for f in [f for f in s.files if f.startswith(src + '/')]:
            rel = f[len(src) + 1:]
            if excl and rel.split('/')[0] == excl: continue
            s.files[f"{dst}/{name}/{rel}"] = s.files[f]
        for d in [d for d in s.dirs if d.startswith(src + '/') or d == src]:
            if excl and d[len(src) + 1:].split('/')[0] == excl: continue
            s.dirs.add(f"{dst}/{name}" + d[len(src):])
        s.dirs.add(f"{dst}/{name}")

class Row(dict):
    def __getitem__(s, k): return dict.__getitem__(s, k)
class _First:
    def __init__(s, v): s.v = v
    def first(s): return s.v
class FakeSpark:
    def __init__(s, fs): s.fs = fs; s.sql_log = []; s.read = types.SimpleNamespace(text=s._text, format=s._format); s.fail_register = set()
    def _text(s, path, wholetext=True): return _First([s.fs.files[path]])
    def _format(s, f): return types.SimpleNamespace(load=lambda p: types.SimpleNamespace(count=lambda: 10))
    def sql(s, q):
        s.sql_log.append(q)
        if any(f in q for f in s.fail_register) and q.startswith("CREATE TABLE"): raise Exception("registration boom")
        return types.SimpleNamespace(collect=lambda: [])
def delta_state_of(fs, path):
    logs = [f for f in fs.files if f.startswith(path + '/_delta_log/')]
    data = [f for f in fs.files if f.startswith(path + '/') and '/_delta_log/' not in f and '/_metadata/' not in f]
    return len(logs) - 1, len(data), sum(len(fs.files[f]) for f in data)
class FakeDeltaTable:
    fs = None
    def __init__(s, path): s.path = path
    @classmethod
    def forPath(cls, spark, path): return cls(path)
    def detail(s):
        v, n, z = delta_state_of(FakeDeltaTable.fs, s.path); return _First({"numFiles": n, "sizeInBytes": z})
    def history(s, n): v, _, _ = delta_state_of(FakeDeltaTable.fs, s.path); return _First({"version": v})

WS = {"11111111-1111-1111-1111-111111111111": "Dev WS", "22222222-2222-2222-2222-222222222222": "Stage WS",
      "33333333-3333-3333-3333-333333333333": "Target WS", "44444444-4444-4444-4444-444444444444": "Control WS"}
LH = {("11111111-1111-1111-1111-111111111111", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"): ("Sales", True),
      ("22222222-2222-2222-2222-222222222222", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"): ("Stage", True),
      ("33333333-3333-3333-3333-333333333333", "cccccccc-cccc-cccc-cccc-cccccccccccc"): ("TargetLH", True),
      ("33333333-3333-3333-3333-333333333333", "dddddddd-dddd-dddd-dddd-dddddddddddd"): ("Flat", False),
      ("44444444-4444-4444-4444-444444444444", "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"): ("Control", True)}
SRC = ("11111111-1111-1111-1111-111111111111", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
STG = ("22222222-2222-2222-2222-222222222222", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
TGT = ("33333333-3333-3333-3333-333333333333", "cccccccc-cccc-cccc-cccc-cccccccccccc")
CTL = ("44444444-4444-4444-4444-444444444444", "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
SHORTCUTS = {SRC: [{"path": "Tables/dbo", "name": "linked"}]}
ONELAKE = "onelake.dfs.fabric.microsoft.com"
ARCH = "abfss://bk@acct.dfs.core.windows.net"

class Resp:
    def __init__(s, data, code=200): s._d = data; s.status_code = code; s.headers = {}
    def raise_for_status(s):
        if s.status_code >= 400: raise Exception(f"HTTP {s.status_code}")
    def json(s): return s._d

class ExitSignal(Exception): pass

def make_env():
    fs = MemFS(); spark = FakeSpark(fs); FakeDeltaTable.fs = fs
    exits = []
    def exit_(v): exits.append(v); raise ExitSignal(v)
    nu = types.ModuleType("notebookutils"); nu.fs = fs
    nu.credentials = types.SimpleNamespace(getToken=lambda a: "T")
    nu.conf = types.SimpleNamespace(get=lambda k: "https://" + ONELAKE)
    nu.notebook = types.SimpleNamespace(exit=exit_)
    sys.modules["notebookutils"] = nu
    requests = types.ModuleType("requests")
    def get(url, headers=None, params=None, timeout=None):
        path = url.split("/v1/")[1]; parts = path.split('/')
        if parts[0] == "workspaces" and len(parts) == 2:
            return Resp({"displayName": WS[parts[1]]}) if parts[1] in WS else Resp({}, 404)
        if parts[2] == "lakehouses" and len(parts) == 4:
            k = (parts[1], parts[3])
            if k not in LH: return Resp({}, 404)
            return Resp({"displayName": LH[k][0], "properties": {"defaultSchema": "dbo"} if LH[k][1] else {}})
        if parts[2] == "items" and parts[4] == "shortcuts":
            return Resp({"value": SHORTCUTS.get((parts[1], parts[3]), [])})
        return Resp({}, 404)
    requests.get = get; sys.modules["requests"] = requests
    delta = types.ModuleType("delta"); dt = types.ModuleType("delta.tables"); dt.DeltaTable = FakeDeltaTable
    sys.modules["delta"] = delta; sys.modules["delta.tables"] = dt
    ns = {"spark": spark, "__name__": "nb"}
    # table fixtures in the source
    root = f"abfss://{SRC[0]}@{ONELAKE}/{SRC[1]}"
    for sch, tbl in [("dbo", "orders"), ("dbo", "customers"), ("sales", "region")]:
        base = f"{root}/Tables/{sch}/{tbl}"
        fs.files[base + "/_delta_log/0.json"] = "{}"; fs.files[base + "/_delta_log/1.json"] = "{}"
        fs.files[base + "/part-0.parquet"] = "x" * 50; fs.files[base + "/_metadata/m"] = "m"
    fs.files[f"{root}/Tables/dbo/notdelta/readme.txt"] = "hi"
    fs.files[f"{root}/Tables/dbo/linked/_delta_log/0.json"] = "{}"
    fs.files[f"{root}/Files/docs/a.txt"] = "A"; fs.files[f"{root}/Files/b.csv"] = "B"
    for k in (STG, TGT, CTL): fs.mkdirs(f"abfss://{k[0]}@{ONELAKE}/{k[1]}/Files")
    fs.mkdirs(ARCH)
    return ns, fs, spark, exits

def cell_sources(nbname):
    nb = json.load(open(NBDIR + nbname)); return nb, [''.join(c['source']) for c in nb['cells'] if c['cell_type'] == 'code']

def run_runner(nbname, params, ns, exits, pre=None):
    """Run a runner like Fabric: params cell, then the injected override cell, then the rest. %run -> exec engine cells."""
    nb, srcs = cell_sources(nbname)
    engine_nb, engine = cell_sources("nb_backup_restore_adls_v6.ipynb")
    defaults, run_cell, rest = srcs[0], srcs[1], srcs[2:]
    assert run_cell.strip() == "%run nb_backup_restore_adls_v6"
    exec(compile(defaults, 'params', 'exec'), ns)
    for k, v in params.items():
        assert k in ns, "unknown parameter " + k
        ns[k] = v
    for i, c in enumerate(engine): exec(compile(c, f'engine{i}', 'exec'), ns)
    out = io.StringIO(); exc = None
    with contextlib.redirect_stdout(out):
        try:
            for i, c in enumerate(rest): exec(compile(c, f'{nbname}:{i}', 'exec'), ns)
        except ExitSignal: pass
        except Exception as e: exc = e
    return exits[-1] if exits and exc is None else None, exc, out.getvalue()
