# Camera-only check on the flat diagnostic render (node render.js frames with FLAT=1):
# the page is one plane, so a homography between frames is exactly the camera motion.
# Reports page motion at the fixed frame centre and the local scale change there.
import cv2, numpy as np, glob, sys
fr = sorted(glob.glob(sys.argv[1] + '/f_*.png')); fps = int(sys.argv[2]) if len(sys.argv) > 2 else 30
orb = cv2.ORB_create(4000); bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
rows = []; prev = None
for i, f in enumerate(fr):
    g = cv2.imread(f, 0); k, d = orb.detectAndCompute(g, None)
    if prev is not None and d is not None and prev[1] is not None:
        m = bf.match(prev[1], d)
        a = np.float32([prev[0][x.queryIdx].pt for x in m]); b = np.float32([k[x.trainIdx].pt for x in m])
        H, inl = cv2.findHomography(a, b, cv2.RANSAC, 2.0)
        c = np.float32([[[720, 576]], [[720, 676]]]); w = cv2.perspectiveTransform(c, H)[:, 0]
        vy = -(w[0, 1] - 576) * fps; sc = np.linalg.norm(w[1] - w[0]) / 100
        rows.append((i / fps, vy, (sc - 1) * fps, int(inl.sum())))
    prev = (k, d)
t = np.array([r[0] for r in rows]); v = np.array([r[1] for r in rows]); s = np.array([r[2] for r in rows])
for r in rows[::5]: print(f"t={r[0]:5.2f}  centre moves up {r[1]:7.1f} px/s  scale {r[2]:+.3f}/s  inliers {r[3]}")
cr = (t > 1.7) & (t < 7.25); med = np.median(v[cr])
print('cruise median', round(med, 1), 'min', round(v[cr].min(), 1), 'max', round(v[cr].max(), 1))
fl = t < 8.2
print('dips >15% below cruise (1.7-7.25 s):', [round(x, 2) for x in t[cr][v[cr] < 0.85 * med]] or 'none')
print('frames where image grows (zoom-in) during flight:', [round(x, 2) for x in t[fl][s[fl] > 0.02]] or 'none')
