"""Tiny SVG helper used to draw the backup-admin diagrams (no dependencies)."""
from html import escape

FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
TEAL, TEAL_D, TEAL_L, TEAL_XL = "#117865", "#0b5b4d", "#e7f5f2", "#f4fbf9"
BLUE, BLUE_D, BLUE_L, BLUE_XL = "#2f6fb3", "#1b4a7c", "#eaf1fb", "#f5f9fe"
AMB, AMB_D, AMB_L = "#c77700", "#6b3f00", "#fff4e0"
RED, RED_L = "#b42318", "#fdecea"
INK, MUTED, LINE, GREY_L, GREY_B = "#1f2933", "#5b6b7a", "#52606d", "#f3f4f6", "#9aa7b4"


class Svg:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []
        self.defs = []
        for name, col in (("t", TEAL), ("b", BLUE), ("g", LINE), ("a", AMB), ("r", RED)):
            self.defs.append(
                f'<marker id="ar{name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                f'orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{col}"/></marker>')

    def add(self, s):
        self.parts.append(s)

    # text ---------------------------------------------------------------
    def text(self, x, y, lines, size=14, color=INK, weight=400, anchor="start", lh=None, mono=False, halo=False):
        if isinstance(lines, str):
            lines = [lines]
        lines = [l or '\u00a0' for l in lines]
        lh = lh or size * 1.35
        fam = "ui-monospace, 'DejaVu Sans Mono', Menlo, monospace" if mono else FONT
        out = [f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" fill="{color}" '
               f'font-weight="{weight}" text-anchor="{anchor}"' + (' xml:space="preserve" style="white-space:pre"' if mono else '') + (' stroke="#ffffff" stroke-width="4" stroke-linejoin="round" paint-order="stroke"' if halo else '') + '>']
        for i, ln in enumerate(lines):
            out.append(f'<tspan x="{x}" dy="{0 if i == 0 else lh}">{self.rich(ln)}</tspan>')
        out.append("</text>")
        self.add("".join(out))

    @staticmethod
    def rich(s):
        # **bold** and `code` inline markup
        import re
        s = escape(s)
        s = re.sub(r"\*\*(.+?)\*\*", r'<tspan font-weight="700">\1</tspan>', s)
        s = re.sub(r"`(.+?)`", lambda m: "<tspan font-family=\"ui-monospace,'DejaVu Sans Mono',Menlo,monospace\" font-size=\"0.9em\">" + m.group(1) + "</tspan>", s)
        return s

    # shapes -------------------------------------------------------------
    def box(self, x, y, w, h, title=None, lines=(), fill=TEAL_L, stroke=TEAL, tcolor=None, size=13,
            tsize=15, rx=10, sw=1.6, dash=None, align="start", lcolor=None, num=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')
        tx = x + 14 if align == "start" else x + w / 2
        ty = y + 12 + tsize
        if num is not None:
            self.add(f'<circle cx="{x+20}" cy="{y+h/2 if not title else y+10+tsize*0.62}" r="11" fill="{stroke}"/>')
            self.text(x + 20, (y + h / 2 if not title else y + 10 + tsize * 0.62) + 4.5, str(num), 12.5, "#fff", 700, "middle")
            tx = x + 40 if align == "start" else tx
        if title:
            self.text(tx, ty, title, tsize, tcolor or stroke, 700, align if align != "start" else "start")
            ty += 6
        if lines:
            self.text(tx, ty + size * 1.1, list(lines), size, lcolor or INK, 400, align, lh=size * 1.4)

    def group(self, x, y, w, h, title, fill=TEAL_XL, stroke=TEAL, tcolor=None):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
        self.text(x + 16, y + 26, title, 13, tcolor or stroke, 700)

    def cyl(self, x, y, w, h, title, lines=(), fill=GREY_L, stroke=LINE, size=12.5, tcolor=None):
        ry = 11
        self.add(f'<path d="M{x} {y+ry} v{h-2*ry} a{w/2} {ry} 0 0 0 {w} 0 v-{h-2*ry} a{w/2} {ry} 0 0 0 -{w} 0z" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
        self.add(f'<path d="M{x} {y+ry} a{w/2} {ry} 0 0 0 {w} 0" fill="none" stroke="{stroke}" stroke-width="1.6"/>')
        self.text(x + w / 2, y + ry + 30, title, 14.5, tcolor or INK, 700, "middle")
        if lines:
            self.text(x + w / 2, y + ry + 30 + size * 1.5, list(lines), size, MUTED, 400, "middle", lh=size * 1.38)

    def pill(self, x, y, w, h, title, lines=(), fill="#ffffff", stroke=TEAL):
        self.box(x, y, w, h, title, lines, fill=fill, stroke=stroke, rx=h / 2, align="middle", tsize=15, size=12.5)

    def diamond(self, cx, cy, w, h, lines, fill="#fff8e1", stroke=AMB, size=13):
        self.add(f'<path d="M{cx} {cy-h/2} L{cx+w/2} {cy} L{cx} {cy+h/2} L{cx-w/2} {cy}z" fill="{fill}" stroke="{stroke}" stroke-width="1.6"/>')
        n = len(lines)
        self.text(cx, cy - (n - 1) * size * 0.68 + 4.5, lines, size, "#4a2c00", 600, "middle", lh=size * 1.35)

    # connectors -----------------------------------------------------------
    def arrow(self, pts, kind="g", dash=None, sw=2.0, label=None, lpos=None, lsize=12, lalign="middle",
              lcolor=None, both=False, lw=None):
        col = {"t": TEAL, "b": BLUE, "g": LINE, "a": AMB, "r": RED}[kind]
        d = "M" + " L".join(f"{x} {y}" for x, y in pts)
        dd = f' stroke-dasharray="{dash}"' if dash else ""
        ms = f' marker-start="url(#ar{kind})"' if both else ""
        self.add(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linejoin="round"{dd} marker-end="url(#ar{kind})"{ms}/>')
        if label:
            lx, ly = lpos
            lines = [label] if isinstance(label, str) else list(label)
            lines = [l or '\u00a0' for l in lines]
            lh = lsize * 1.35
            wmax = lw or max(len(__import__("re").sub(r"\*\*|`", "", l)) for l in lines) * lsize * 0.56 + 10
            hh = lh * len(lines) + 6
            bx = lx - wmax / 2 if lalign == "middle" else lx - 4
            self.add(f'<rect x="{bx}" y="{ly - lsize - 2}" width="{wmax}" height="{hh}" rx="4" fill="#ffffff" fill-opacity="0.94"/>')
            self.text(lx if lalign == "middle" else lx + 1, ly, lines, lsize, lcolor or col if kind != "g" else (lcolor or INK),
                      500, lalign, lh=lh)

    def save(self, path):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
               f'<defs>{"".join(self.defs)}</defs><rect width="100%" height="100%" fill="#ffffff"/>' + "".join(self.parts) + "</svg>")
        open(path, "w").write(svg)


class Seq:
    """Sequence-diagram layout on top of Svg."""
    def __init__(self, w, cols, top=30, bottom_pad=40, colw=128):
        self.cols, self.colw, self.top = cols, colw, top
        self.s = Svg(w, 4000)
        self.xs = [c[0] for c in cols]
        self.y = top + 76
        self.life = []
        self.n = 0

    def x(self, i):
        return self.xs[i]

    def head(self, y, fill_stroke):
        for (x, title, sub, kind) in self.cols:
            fill, stroke = {"app": (TEAL_L, TEAL), "nb": (BLUE_L, BLUE), "store": (GREY_L, LINE), "arch": (AMB_L, AMB)}[kind]
            self.s.box(x - self.colw / 2, y, self.colw, 56, title, [sub] if sub else [], fill=fill, stroke=stroke,
                       align="middle", tsize=13, size=11, rx=8)

    def gap(self, h=10):
        self.y += h

    def msg(self, a, b, label, dashed=False, kind="g", num=True, above=True, align=None, lsize=12.5):
        lines = [label] if isinstance(label, str) else list(label)
        lh = lsize * 1.38
        self.y += lh * len(lines) + 8
        y = self.y
        xa, xb = self.x(a), self.x(b)
        d = 1 if xb > xa else -1
        pts = [(xa + 3 * d, y), (xb - 3 * d, y)]
        if a == b:
            pts = [(xa + 3, y), (xa + 40, y), (xa + 40, y + 18), (xa + 3, y + 18)]
        s = self.s
        ly = y - 6 - lh * (len(lines) - 1)
        if a != b:
            col = {"g": LINE, "t": TEAL, "b": BLUE, "a": AMB}[kind]
            s.arrow(pts, kind, dash="6 4" if dashed else None, sw=1.8)
            midx = (xa + xb) / 2
            import re as _re
            wtxt = max(len(_re.sub(r"\*\*|`", "", l)) for l in lines) * lsize * 0.56
            if align is None and wtxt > abs(xb - xa) - 50:
                align = "start"
            if align == "start":
                tx, anchor = (xa + 28 if d == 1 else min(xa, xb) + 10), "start"
            else:
                tx, anchor = midx, "middle"
            if num:
                self.n += 1
                s.add(f'<circle cx="{xa + 14*d}" cy="{y}" r="9.5" fill="{col}"/>')
                s.text(xa + 14 * d, y + 4, str(self.n), 11, "#fff", 700, "middle")
            s.text(tx, ly, lines, lsize, INK, 500, anchor, lh=lh, halo=True)
        self.y += 14
        return y

    def note(self, a, b, lines, fill="#fff8e1", stroke="#d4a017", size=12, title=None, pad=10, w=None):
        xa, xb = self.x(a), self.x(b)
        x0 = min(xa, xb) - (self.colw / 2 - 6)
        x1 = max(xa, xb) + (self.colw / 2 - 6)
        if w:
            x1 = x0 + w
        lh = size * 1.4
        allines = ([f"**{title}**"] if title else []) + list(lines)
        h = lh * len(allines) + pad * 2 - 2
        self.y += 6
        s = self.s
        s.add(f'<rect x="{x0}" y="{self.y}" width="{x1-x0}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>')
        s.text(x0 + 10, self.y + pad + size * 0.9, allines, size, "#3d2f00" if fill == "#fff8e1" else INK, 400, lh=lh)
        self.y += h + 12

    def region(self, y0, y1, x0, x1, label, color=TEAL):
        s = self.s
        s.add(f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" rx="10" fill="none" stroke="{color}" stroke-width="1.5" stroke-dasharray="7 5"/>')
        w = len(label) * 7.2 + 20
        s.add(f'<rect x="{x0}" y="{y0}" width="{w}" height="22" rx="6" fill="{color}"/>')
        s.text(x0 + 10, y0 + 15.5, label, 12, "#fff", 700)

    def finish(self, path, foot=30):
        s = self.s
        top = self.top
        H = int(self.y + foot)
        for x in self.xs:
            s.parts.insert(0, f'<line x1="{x}" y1="{top+56}" x2="{x}" y2="{H-10}" stroke="#c5d0db" stroke-width="1.4" stroke-dasharray="5 5"/>')
        self.head(top, None)
        s.h = H
        s.save(path)


def card(s, x, y, w, title, lines, fill=BLUE_L, stroke=BLUE, size=12.5, tsize=14, bullets=False, tcolor=None, num=None, dash=None):
    lh = size * 1.4
    h = int(14 + tsize + 8 + len(lines) * lh + 10)
    s.box(x, y, w, h, title, lines, fill=fill, stroke=stroke, size=size, tsize=tsize, tcolor=tcolor, num=num, dash=dash)
    return y + h
