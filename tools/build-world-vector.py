"""
Generates data/world-vector.json for WORLD PULSE.

Coastlines come from Natural Earth 1:110m "land" (public domain), decoded from
TopoJSON. Country attribution comes from the project's own data/worldgrid.json
(3-degree labelled cells), expanded to a finer raster by nearest-cell lookup.
Output is pre-projected into the app's existing SVG user space so that
data/countries.json centroids and bboxes keep working unchanged.
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# Natural Earth 1:110m "land" as TopoJSON (public domain), kept next to this
# script. Original source:
#   https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
LAND = os.path.join(HERE, 'land-110m.json')
GRID = os.path.join(REPO, 'data', 'worldgrid.json')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'data', 'world-vector.json')

CELL = 10.0          # svg units per 3-degree grid cell (matches map.js)
SUB = 8              # raster subdivisions per grid cell -> 0.375 deg
LON_MIN, LAT_MAX, DEG = -180.0, 84.0, 3.0

grid = json.load(open(GRID))
COLS, ROWS = grid['meta']['cols'], grid['meta']['rows']
W, H = COLS * SUB, ROWS * SUB           # 960 x 384
PX = CELL / SUB                          # svg units per raster cell = 1.25

# ---------------------------------------------------------------- topojson
topo = json.load(open(LAND))
ts, tt = topo['transform']['scale'], topo['transform']['translate']

def arc(i):
    rev = i < 0
    if rev: i = ~i
    x = y = 0
    pts = []
    for dx, dy in topo['arcs'][i]:
        x += dx; y += dy
        pts.append((x * ts[0] + tt[0], y * ts[1] + tt[1]))
    return pts[::-1] if rev else pts

def ring(idx):
    pts = []
    for i in idx:
        a = arc(i)
        pts.extend(a if not pts else a[1:])
    return pts

def split_antimeridian(pts):
    """Natural Earth closes a few rings across +/-180; cut them so a flat
    equirectangular scanline fill does not smear across the whole row."""
    if not any(abs(pts[k + 1][0] - pts[k][0]) > 180 for k in range(len(pts) - 1)):
        return [pts]
    pieces, cur = [], [pts[0]]
    for k in range(len(pts) - 1):
        if abs(pts[k + 1][0] - pts[k][0]) > 180:
            pieces.append(cur); cur = [pts[k + 1]]
        else:
            cur.append(pts[k + 1])
    pieces.append(cur)
    out = []
    for p in pieces:
        if len(p) < 3: continue
        if p[0] != p[-1]: p = p + [p[0]]
        out.append(p)
    return out

rings = []
for g in topo['objects']['land']['geometries']:
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    for poly in polys:
        for r in poly:
            rings.extend(split_antimeridian(ring(r)))
print('land rings', len(rings))

# ------------------------------------------------------------- rasterise
# raster cell (i, j): lon = LON_MIN + (i+0.5)*DEG/SUB, lat = LAT_MAX - (j+0.5)*DEG/SUB
land = np.zeros((H, W), dtype=bool)
step = DEG / SUB
edges = []
for r in rings:
    for k in range(len(r) - 1):
        x0, y0 = r[k]; x1, y1 = r[k + 1]
        if y0 != y1:
            edges.append((x0, y0, x1, y1))
E = np.array(edges)                     # x0 y0 x1 y1
for j in range(H):
    lat = LAT_MAX - (j + 0.5) * step
    m = ((E[:, 1] > lat) != (E[:, 3] > lat))
    if not m.any():
        continue
    e = E[m]
    xs = e[:, 0] + (lat - e[:, 1]) * (e[:, 2] - e[:, 0]) / (e[:, 3] - e[:, 1])
    xs.sort()
    cols = (xs - LON_MIN) / step - 0.5
    for a, b in zip(cols[0::2], cols[1::2]):
        lo = int(math.ceil(a - 1e-9)); hi = int(math.floor(b + 1e-9))
        if hi < 0 or lo >= W:
            continue
        land[j, max(0, lo):min(W, hi + 1)] = True
print('land cells', int(land.sum()))

# ------------------------------------------------- country attribution
cellcode = {}
for x, y, code in grid['cells']:
    cellcode[(x, y)] = code

owner = np.full((H, W), -1, dtype=np.int16)
codes = ['']
index = {'': 0}
def cid(c):
    if c not in index:
        index[c] = len(codes); codes.append(c)
    return index[c]

RAD = 2
offsets = sorted(((dx, dy) for dx in range(-RAD, RAD + 1) for dy in range(-RAD, RAD + 1)),
                 key=lambda o: o[0] * o[0] + o[1] * o[1])
ys, xs = np.nonzero(land)
for j, i in zip(ys, xs):
    gx, gy = i // SUB, j // SUB
    code = cellcode.get((gx, gy))
    if not code:
        for dx, dy in offsets:
            c = cellcode.get((gx + dx, gy + dy))
            if c:
                code = c; break
    owner[j, i] = cid(code or '')
print('codes', len(codes))

# ------------------------------------------------ region outlines
def outline(mask):
    """Boundary loops of a boolean raster region, in svg user units."""
    seg = {}
    ys_, xs_ = np.nonzero(mask)
    for j, i in zip(ys_, xs_):
        x0, y0, x1, y1 = i * PX, j * PX, (i + 1) * PX, (j + 1) * PX
        if j == 0 or not mask[j - 1, i]:      seg.setdefault((x0, y0), []).append((x1, y0))
        if i == W - 1 or not mask[j, i + 1]:  seg.setdefault((x1, y0), []).append((x1, y1))
        if j == H - 1 or not mask[j + 1, i]:  seg.setdefault((x1, y1), []).append((x0, y1))
        if i == 0 or not mask[j, i - 1]:      seg.setdefault((x0, y1), []).append((x0, y0))
    loops = []
    while seg:
        start = next(iter(seg))
        loop = [start]
        cur = start
        while True:
            nxt = seg.get(cur)
            if not nxt:
                break
            n = nxt.pop()
            if not nxt: del seg[cur]
            loop.append(n)
            cur = n
            if cur == start:
                break
        if len(loop) > 4:
            loops.append(loop)
    return loops

def dedupe_collinear(p):
    out = []
    n = len(p)
    for k in range(n - 1):
        a, b, c = p[k - 1], p[k], p[(k + 1) % (n - 1)]
        if (b[0] - a[0]) * (c[1] - b[1]) != (b[1] - a[1]) * (c[0] - b[0]):
            out.append(b)
    return out

def chaikin(p, it=2):
    for _ in range(it):
        q = []
        n = len(p)
        for k in range(n):
            a, b = p[k], p[(k + 1) % n]
            q.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            q.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        p = q
    return p

def rdp_open(p, eps):
    def rec(pts):
        if len(pts) < 3: return pts
        a, b = pts[0], pts[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, 0
        for k in range(1, len(pts) - 1):
            d = abs((pts[k][0] - a[0]) * dy - (pts[k][1] - a[1]) * dx) / L
            if d > best: best, bi = d, k
        if best <= eps: return [a, b]
        return rec(pts[:bi + 1])[:-1] + rec(pts[bi:])
    return rec(p)


def rdp_closed(p, eps):
    """RDP on a closed ring: split at the vertex farthest from p[0] first."""
    if len(p) < 5: return p
    a = p[0]
    far = max(range(len(p)), key=lambda k: (p[k][0] - a[0]) ** 2 + (p[k][1] - a[1]) ** 2)
    if far < 2 or far > len(p) - 2: return p
    return rdp_open(p[:far + 1], eps)[:-1] + rdp_open(p[far:] + [p[0]], eps)[:-1]

def path_of(loops, eps=0.45):
    d = []
    for loop in loops:
        pts = loop[:-1] if loop[0] == loop[-1] else loop
        if len(pts) < 4: continue
        pts = chaikin(pts, 2)          # rounds the raster staircase, not the shape
        pts = rdp_closed(pts, eps)
        if len(pts) < 3: continue
        d.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(d)

out_countries = []
areas = {}
for k, code in enumerate(codes):
    mask = owner == k
    n = int(mask.sum())
    if n == 0: continue
    loops = outline(mask)
    d = path_of(loops)
    if not d: continue
    ysk, xsk = np.nonzero(mask)
    entry = {
        'code': code,
        'd': d,
        'cx': round(float((xsk.mean() + 0.5) * PX), 1),
        'cy': round(float((ysk.mean() + 0.5) * PX), 1),
        'bbox': [round(float(xsk.min() * PX), 1), round(float(ysk.min() * PX), 1),
                 round(float((xsk.max() + 1) * PX), 1), round(float((ysk.max() + 1) * PX), 1)],
        'area': n,
    }
    out_countries.append(entry)
    areas[code] = n

out_countries.sort(key=lambda c: (c['code'] == '', c['code']))
doc = {
    'meta': {
        'note': 'Coastlines derived from Natural Earth 1:110m land (public domain). '
                'Country attribution from data/worldgrid.json. Pre-projected to the '
                'app SVG user space: x = (lon+180)/3*10, y = (84-lat)/3*10.',
        'projection': 'equirectangular',
        'width': COLS * CELL, 'height': ROWS * CELL,
        'lonMin': LON_MIN, 'latMax': LAT_MAX, 'deg': DEG, 'cell': CELL,
    },
    'countries': out_countries,
}
json.dump(doc, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB', 'countries', len(out_countries))
