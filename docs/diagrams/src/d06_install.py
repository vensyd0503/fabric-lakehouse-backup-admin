from svglib import *
s = Svg(1200, 1000)

# banner
s.add(f'<rect x="30" y="20" width="1140" height="46" rx="10" fill="{AMB_L}" stroke="{AMB}" stroke-width="1.6"/>')
s.text(48, 48, "`npm run setup` writes local files only. `setup:notebooks` imports by name. `rayfin up` and `rayfin secret set` are CLI commands.", 13, AMB_D)
# legend
s.add(f'<rect x="50" y="86" width="26" height="14" rx="4" fill="{AMB_L}" stroke="{AMB}" stroke-width="1.6" stroke-dasharray="4 3"/>')
s.text(84, 98, "setup script or name lookup", 12, MUTED)
s.add(f'<rect x="300" y="86" width="26" height="14" rx="4" fill="{BLUE_L}" stroke="{BLUE}" stroke-width="1.6"/>')
s.text(334, 98, "existing Rayfin CLI command", 12, MUTED)
s.add(f'<rect x="570" y="86" width="26" height="14" rx="4" fill="{TEAL_L}" stroke="{TEAL}" stroke-width="1.6"/>')
s.text(604, 98, "the running app", 12, MUTED)

X, W = 50, 600
RX, RW = 710, 440
PROP = dict(fill=AMB_L, stroke=AMB, tcolor=AMB_D, dash="7 4")
EXIST = dict(fill=BLUE_L, stroke=BLUE)
# prerequisites strip (top)
s.box(50, 118, 1100, 62, "Before step 1", [], fill="#ffffff", stroke=GREY_B, tcolor=LINE, tsize=14, dash="6 4")
s.text(66, 164, "Tenant settings, a Fabric capacity, the ADLS account and container, and the app identity's roles are set up first (sections 1 to 3 of this guide).", 12.5, INK)
y = 204

def step(n, title, lines, style, gap=26, last=False):
    global y
    b = card(s, X, y, W, title, lines, num=n, **style)
    top = y
    if not last:
        s.arrow([(X + W / 2, b), (X + W / 2, b + gap)], "g", sw=2)
    y = b + gap
    return top, b

t1, b1 = step(1, "npm run setup  (the wizard)",
   ["Asks for, with no network calls:", "•  app title and icon (PNG)", "•  notebook workspace", "•  staging / control workspace + lakehouse",
    "•  ADLS account, container and folder", "•  admin UPNs or object ids (ADMIN_SUBJECTS)"], PROP)
t2, b2 = step(2, "npm run setup:notebooks",
   ["Imports the 3 notebooks into the chosen notebook workspace,", "by their exact names (the runners %run the engine by name):",
    "nb_backup_restore_adls_v6, nb_backup_run, nb_restore_run"], PROP)
t3, b3 = step(3, "npx rayfin up   (first deploy)",
   ["Builds the UI and functions, creates the app item and hosts it.", "${VAR} values in rayfin.yml come from rayfin/.env."], EXIST)
t4, b4 = step(4, "npx rayfin secret set --env-file rayfin/.env.secrets",
   ["Stores the IDs and ADLS values where the functions can read them.", "Needs the app deployed first. The file stays gitignored."], EXIST)
t5, b5 = step(5, "Functions read ctx.Secrets and find the notebooks by name",
   ["At run time the functions list the notebook workspace and look up", "nb_backup_run and nb_restore_run by exact name, so notebook IDs", "are never typed in or compiled into the code."], PROP)
t6, b6 = step(6, "The app runs with no code edits",
   ["Open the hosting URL, sign in as an admin, pick a lakehouse and back it up.", "Title and icon come from the setup step."], dict(fill=TEAL_L, stroke=TEAL), last=True)

# right: produced files
f1 = card(s, RX, t1, RW, "rayfin/.env  (branding and port)",
   ["DEV_PORT is interpolated in rayfin.yml.", "VITE_APP_TITLE, VITE_APP_SUBTITLE and VITE_APP_ICON", "are read by the frontend build. Gitignored."],
   fill="#ffffff", stroke=GREY_B, tcolor=LINE)
f2 = card(s, RX, f1 + 16, RW, "rayfin/.env.secrets  (IDs and ADLS values)",
   ["NOTEBOOK_WORKSPACE_ID, STAGING_WORKSPACE_ID,", "STAGING_LAKEHOUSE_ID, ADLS_ACCOUNT, ADLS_CONTAINER,", "ADLS_ARCHIVE_FOLDER (- = container root), ADMIN_SUBJECTS.", "Git-ignored. Apply with secret set; then you may delete it."],
   fill="#ffffff", stroke=GREY_B, tcolor=LINE)
s.arrow([(X + W + 2, t1 + 50), (RX - 2, t1 + 50)], "g", dash="5 4", sw=1.8)
s.arrow([(X + W + 2, t1 + 150), (RX - 2, f1 + 16 + 50)], "g", dash="5 4", sw=1.8)
s.text(X + W + 10, t1 + 44, "writes", 11.5, MUTED, 600, halo=True)

ry = f2 + 14
ry = card(s, RX, max(t2, ry), RW, "Who runs it",
   ["The installer, signed in. They need a Contributor-level", "role on the notebook workspace (only Contributor is", "confirmed). Fabric REST import; no data is touched."],
   fill="#ffffff", stroke=GREY_B, tcolor=LINE) + 14
ry = card(s, RX, max(t3 + 20, ry), RW, "Open point (UNVERIFIED)",
   ["Whether rayfin up accepts secret names that have no value", "yet. Safe order: deploy, secret set, and run rayfin up", "again if the CLI regenerates secrets.generated.ts."],
   fill="#fff8e1", stroke="#d4a017", tcolor="#6b4e00") + 14
ry = card(s, RX, max(t4 + 20, ry), RW, "Check it",
   ["npx rayfin --json secret list shows the names set", "(values are not shown)."],
   fill="#ffffff", stroke=GREY_B, tcolor=LINE) + 14
bottom = card(s, RX, max(t5 + 10, ry), RW, "Admin gate",
   ["startBackup, startRestore and createArchiveFolder check", "the server. appRole comes from dynamic claims, or from", "ADMIN_SUBJECTS when claims are not minted."],
   fill="#ffffff", stroke=GREY_B, tcolor=LINE)
s.h = int(max(y, bottom) + 16)
s.save("../install-flow.svg")
