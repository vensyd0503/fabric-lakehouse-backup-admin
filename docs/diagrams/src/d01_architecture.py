from svglib import *
s = Svg(1200, 800)

s.pill(40, 28, 270, 58, "Admin", ["browser, Fabric sign-in"])

s.group(30, 112, 300, 450, "APP WORKSPACE  ·  Fabric App item")
s.box(50, 150, 260, 120, "React UI", ["static hosting", "Backup tab · Restore tab", "Runs panel (polls every 20 s)"])
s.box(50, 318, 260, 224, "Rayfin functions (11)",
      ["Run as the **app identity**:", "`ctx.Tokens.Fabric` for Fabric REST", "`ctx.Tokens.Storage` for ADLS DFS", "",
       "Server-side config the browser", "cannot change: runner notebook IDs,", "staging / control lakehouse,", "ADLS account + container allow-list"],
      size=12.5)
s.arrow([(285, 86), (285, 150)], "g", label="HTTPS", lpos=(296, 124), lalign="start", lw=54)
s.arrow([(180, 270), (180, 318)], "t", label="invoke", lpos=(180, 300), lw=52)

s.group(490, 112, 300, 450, "NOTEBOOK WORKSPACE  ·  one workspace", fill=BLUE_XL, stroke=BLUE)
s.box(510, 150, 260, 150, "nb_backup_run / nb_restore_run",
      ["Headless runners", "Parameters cell → validate →", "call engine → result JSON"],
      fill=BLUE_L, stroke=BLUE, tsize=14, size=12.5)
s.box(510, 360, 260, 182, "nb_backup_restore_adls_v6",
      ["The engine: functions only", "backup_lakehouse_to_archive", "restore_from_archive", "preview_restore", "clean_target_for_restore"],
      fill=BLUE_L, stroke=BLUE, tsize=14, size=12.5)
s.arrow([(640, 300), (640, 360)], "b", label="%run", lpos=(640, 335), lw=48)

s.arrow([(310, 400), (352, 400), (352, 225), (510, 225)], "t", sw=2.6)
s.text(362, 262, ["**Fabric REST**", "list workspaces,", "lakehouses; start job;", "list runs; get run", "+ exit value"], 11.5, TEAL_D, 500, lh=15.5)
s.add(f'<rect x="352" y="214" width="3" height="3" fill="none"/>')

s.group(970, 112, 200, 450, "ONELAKE", fill="#fafafa", stroke=GREY_B, tcolor=LINE)
s.cyl(990, 150, 160, 100, "Source", ["lakehouse", "read in a backup"])
s.cyl(990, 282, 160, 120, "Staging / control", ["lakehouse", "fastcp probe, temp copy,", "result JSON file"], size=12)
s.cyl(990, 432, 160, 100, "Target", ["lakehouse", "written by a restore"])
s.add(f'<path d="M770 451 L865 451" stroke="{BLUE}" stroke-width="2" fill="none"/>')
s.add(f'<path d="M865 200 L865 482" stroke="{BLUE}" stroke-width="2" fill="none"/>')
s.arrow([(865, 200), (990, 200)], "b", label=["read tables", "+ Files"], lpos=(928, 186), lsize=11.5, lw=84)
s.arrow([(865, 342), (990, 342)], "b", label=["staging,", "result file"], lpos=(928, 328), lsize=11.5, lw=84)
s.arrow([(865, 482), (990, 482)], "b", label=["delete, copy,", "register"], lpos=(928, 468), lsize=11.5, lw=84)

s.cyl(490, 636, 680, 112, "ADLS Gen2 archive  (write-once)",
      ["<container>/<backup_folder>/backups/<YYYYMMDDHHMM>/  →  Tables/ · Files/ · _manifest/manifest.json",
       "Nothing in it is overwritten or deleted. Each backup gets a new timestamped folder."],
      fill=AMB_L, stroke=AMB, size=12.5, tcolor=AMB_D)
s.arrow([(640, 542), (640, 636)], "b", sw=2.6,
        label=["**fastcp**: write a backup,", "read it back on restore"], lpos=(656, 590), lsize=11.5, lalign="start", lw=170)
s.arrow([(180, 542), (180, 700), (490, 700)], "t", sw=2.6)
s.text(200, 664, ["**ADLS DFS REST**: list folders + backups,", "read manifest, create folder"], 11.5, TEAL_D, 500, lh=15.5)

s.add(f'<path d="M30 780 L70 780" stroke="{TEAL}" stroke-width="2.6"/>')
s.text(78, 784, "calls made by the functions (app identity)", 12, MUTED)
s.add(f'<path d="M370 780 L410 780" stroke="{BLUE}" stroke-width="2.6"/>')
s.text(418, 784, "calls made by the notebooks (the job runs as the same identity)", 12, MUTED)
s.save("../01-architecture.svg")
