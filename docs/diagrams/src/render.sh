#!/bin/sh
# usage: render.sh file.svg  -> file.png at 2x using headless Chrome
f="$1"; w=$(sed -n 's/.*<svg[^>]* width="\([0-9]*\)".*/\1/p' "$f" | head -1); h=$(sed -n 's/.*<svg[^>]* height="\([0-9]*\)".*/\1/p' "$f" | head -1)
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=${w},${h} --default-background-color=FFFFFFFF --screenshot="${f%.svg}.png" "file://$(readlink -f "$f")" >/dev/null 2>&1
