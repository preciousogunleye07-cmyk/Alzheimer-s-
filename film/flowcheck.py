# Optical-flow check on rendered frames (sampled at 30fps): the glide speed down the page must never dip
# during the flight, and the scale must never turn into a zoom-in.
import cv2, numpy as np, glob, sys
fr = sorted(glob.glob(sys.argv[1] + '/f_*.png'))
step = 2  # 60fps frames -> 30fps preview
prev = None; rows = []
for i in range(0, min(len(fr), int(8.3 * 60)), step):
    g = cv2.cvtColor(cv2.resize(cv2.imread(fr[i]), (720, 576)), cv2.COLOR_BGR2GRAY)
    if prev is not None:
        f = cv2.calcOpticalFlowFarneback(prev, g, None, 0.5, 4, 25, 3, 7, 1.5, 0)
        band = f[200:430, 160:560]                    # middle of frame (in focus)
        vy = -np.median(band[..., 1]) * 2 * 30        # px/s upward on the full-size frame
        ys, xs = np.mgrid[0:576, 0:720]
        div = np.median(((xs - 360) * f[..., 0] + (ys - 288) * f[..., 1])[150:500] / np.maximum(1, ((xs - 360)**2 + (ys - 288)**2)[150:500]))
        rows.append((i / 60, vy, div))
    prev = g
v = np.array([r[1] for r in rows]); t = np.array([r[0] for r in rows])
for r in rows[::6]: print(f"t={r[0]:5.2f}  upward {r[1]:7.1f} px/s  scale-rate {r[2]*30:+.4f}/s")
cr = (t > 1.7) & (t < 7.25)
dips = [(round(a,2), round(b,1)) for a, b, c in zip(t[1:], v[1:], np.diff(v)) if 1.7 < a < 7.25 and b < 0.85 * np.median(v[cr])]
print('cruise median', round(float(np.median(v[cr])), 1), 'min', round(float(v[cr].min()), 1), 'max', round(float(v[cr].max()), 1))
print('dips >15% below cruise:', dips or 'none')
