// Orbit Space fly-over — every frame is a pure function of time: seek(t, subframes).
(async function () {
'use strict';
const CFG = window.FILM_CONFIG;
const W = 1440, HS = 1152, F = 1880, CX = 720, CY = 576;
const layout = await (await fetch('assets/layout.json')).json();
const PH = layout.height, PAD = layout.pad, HERO_B = CFG.heroBottom;

// ---------- helpers ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const L = (t, a, b) => smoother((t - a) / (b - a));
const quadIO = u => { u = clamp(u, 0, 1); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); };
const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const pageToWorld = (px, py, z) => [px - 720, -py, z];

// ---------- camera: one speed curve, integrated ----------
function share(t) {                       // speed down the page as a share of cruise
  if (t < 0.6) return 0.5 * smoother(t / 0.6);
  if (t < 1.25) return 0.5;
  if (t < 1.6) return 0.5 + 0.5 * smoother((t - 1.25) / 0.35);
  if (t < 7.3) return 1.0;
  if (t < 8.3) return 1.0 - 0.88 * smoother((t - 7.3) / 1.0);
  return 0.12;
}
const DT = 1 / 4000, NT = Math.ceil(10 / DT) + 2;
const I = new Float64Array(NT);
for (let i = 1; i < NT; i++) I[i] = I[i - 1] + 0.5 * (share((i - 1) * DT) + share(i * DT)) * DT;
const integ = t => { const x = clamp(t, 0, 10) / DT, i = Math.floor(x), f = x - i; return lerp(I[i], I[i + 1], f); };
const LY0 = 520;                                           // hero, top half, with the photo card below centre
const footer = layout.pieces.find(p => p.id === 'footer-hub');
const FOOT_Y = footer.img.y + footer.img.height / 2;       // footer title sharp at 8.0
const CRUISE = (FOOT_Y - LY0) / integ(8.0);
const glideLy = t => LY0 + CRUISE * integ(t);
function tAtLy(ly) { let a = 0, b = 8.3; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if (glideLy(m) < ly) a = m; else b = m; } return a; }

// rise: trapezoid zoom speed in log scale
const vTrap = t => t < 7.75 ? 0 : t < 8.35 ? sstep(7.75, 8.35, t) : t < 8.95 ? 1 : t < 9.25 ? 1 - sstep(8.95, 9.25, t) : 0;
const P = new Float64Array(NT); for (let i = 1; i < NT; i++) P[i] = P[i - 1] + 0.5 * (vTrap((i - 1) * DT) + vTrap(i * DT)) * DT;
const PN = P[NT - 1];
const trapP = t => { const x = clamp(t, 0, 10) / DT, i = Math.floor(x), f = x - i; return lerp(P[i], P[i + 1], f) / PN; };
const S_OVER = (HS - 42 - 42) / PH;                        // whole page as one strip, bottom 42px above frame bottom
const D_OVER = F / S_OVER;
const S_END = 1018 / 1440;                                 // hero card 1018px wide
const dFlight = t => 1360 + 340 * (1 - Math.pow(1 - clamp(t / 8.2, 0, 1), 2));
const PHI0 = 56 * Math.PI / 180;

function camState(t) {
  if (t < 9.25) {
    const D = Math.exp(Math.log(dFlight(t)) + (Math.log(D_OVER) - Math.log(1700)) * trapP(t));
    const phi = PHI0 * (1 - sstep(8.15, 8.95, t));
    let ly = glideLy(t);
    if (t > 8.3) {
      const a = 534 * D / (F * Math.cos(phi) + 534 * Math.sin(phi));   // page bottom held at y = 1110
      ly = lerp(ly, PH - a, sstep(8.3, 8.65, t));
    }
    return { ly, D, phi };
  }
  if (t < 9.47) { const s = S_OVER * (1 + 0.035 * sstep(9.25, 9.47, t)); return { ly: PH / 2, D: F / s, phi: 0 }; }
  const s1 = S_OVER * 1.035, topY0 = CY - s1 * PH / 2;
  if (t < 9.97) {
    const u = (t - 9.47) / 0.5;
    const s = Math.exp(lerp(Math.log(s1), Math.log(S_END), quadIO(u)));
    const topY = lerp(topY0, 283, sstep(0.5, 1, u));
    return { ly: (CY - topY) / s, D: F / s, phi: 0 };
  }
  const u = (t - 9.97) / 4.53;
  const s = S_END * (1 + 0.02 * quadIO(u));
  const yc = HERO_B / 2, scy = 283 + yc * S_END;
  return { ly: yc - (scy - CY) / s, D: F / s, phi: 0 };
}
function camera(t) {
  const st = camState(t), sp = Math.sin(st.phi), cp = Math.cos(st.phi);
  const T = v3(0, -st.ly, 0);
  const C = add(T, mul(v3(0, -sp, cp), st.D));
  return { ...st, T, C, f: v3(0, sp, -cp), r: v3(1, 0, 0), u: v3(0, cp, sp) };
}
const toWorldFromScreen = (cam, sx, sy, depth) =>
  add(add(add(cam.C, mul(cam.f, depth)), mul(cam.r, (sx - CX) * depth / F)), mul(cam.u, (CY - sy) * depth / F));

// ---------- lifted pieces ----------
const pieces = layout.pieces.map(p => ({ ...p, cx: p.img.x + p.img.width / 2, cy: p.img.y + p.img.height / 2 }));
const byId = Object.fromEntries(pieces.map(p => [p.id, p]));
const siwesPhoto = byId['siwes-photo'];
const SIWES_T = siwesPhoto ? tAtLy(siwesPhoto.cy - 760) : 99;

function pieceState(p, t) {
  const id = p.id; let z = 0, th = 0, dx = 0, edge = 0;
  const down = L(t, 3.2, 6.0);
  let m;
  if (id === 'hero-card') z = 30;
  else if (id === 'hero-btn') z = 16;
  else if (id === 'hero-btn2') z = 14;
  else if (id === 'chip-rotate') { const l = L(t, 0.1, 1.2); z = lerp(lerp(6, 72, l), 8, down); th = 30 * l * (1 - down); }
  else if (id === 'chip-start') { const l = L(t, 0.3, 1.35); z = lerp(lerp(4, 62, l), 6, down); th = 30 * l * (1 - down); }
  else if ((m = id.match(/^course-photo-(\d)/))) { const i = +m[1], s = 1.35 + 0.12 * i, l = L(t, s, s + 1.2); z = lerp(28, [112, 128, 104][i], l); th = 46 * l; }
  else if ((m = id.match(/^course-chip-(\d)/))) { const i = +m[1], l = L(t, 1.4, 2.5); z = lerp(32, [196, 206][i], l); th = 54 * l; dx = (i ? 140 : -300) * l; }
  else if (id.startsWith('course-')) z = 24;
  else if ((m = id.match(/^why-(\d+)/))) z = 18 + (+m[1] % 3) * 4;
  else if (id === 'testimonial') { const l = L(t, 5.45, 6.3); z = lerp(22, 112, l); th = 30 * l; edge = 34 * l; }
  else if (id === 'siwes-card') z = 14;
  else if (id === 'siwes-photo') { const l = L(t, SIWES_T, SIWES_T + 1.0); z = lerp(18, 104, l); th = 42 * l; }
  else if (id.startsWith('faq-')) z = 12;
  else if (id === 'footer-hub') z = 18;
  // dive: everything below the hero fades into the haze, then is cut
  const below = p.cy > HERO_B;
  const fade = below ? sstep(9.47, 9.72, t) : 0;
  const alpha = below && t > 9.76 ? 0 : 1;
  return { z, th: th * Math.PI / 180, dx, edge, fade, alpha };
}
function pieceQuad(p, s) {
  const w = p.img.width, h = p.img.height;
  const C0 = pageToWorld(p.cx + s.dx, p.cy, s.z);
  const Ex = v3(w, 0, 0), Ey = v3(0, -Math.cos(s.th) * h, -Math.sin(s.th) * h);
  return { P0: sub(sub(C0, mul(Ex, 0.5)), mul(Ey, 0.5)), Ex, Ey };
}
const zUnder = (p, t) => p.parent && byId[p.parent] ? pieceState(byId[p.parent], t).z : 0;

// ---------- logo tiles ----------
const TILE_START = [[512, 414], [512, 446], [928, 414], [928, 446]];
const TILE_HANG = [[-60, 150, 150, 196], [110, -40, 90, 148], [1500, 140, 140, 186], [1330, -50, 100, 142]];
function tileState(i, t, cam) {
  if (t < 3.0) {
    const l = L(t, 0.1 + 0.08 * i, 1.1 + 0.08 * i), lz = smoother(Math.pow(clamp((t - 0.1 - 0.08 * i) / 1.0, 0, 1), 0.7));
    const trail = 300 * L(t, 1.2, 2.4);
    const px = lerp(TILE_START[i][0], TILE_HANG[i][0], l), py = lerp(TILE_START[i][1], TILE_HANG[i][1], l) + trail;
    return { P: pageToWorld(px, py, lerp(1, TILE_HANG[i][2], lz)), size: lerp(32, TILE_HANG[i][3], l), flat: 1 - lz, vis: 1 };
  }
  if (i === 0 && t > 4.75 && t < 6.05) {           // one tile drifts past the left edge, close and blurred
    const u = (t - 4.75) / 1.3;
    const sx = lerp(-330, 130, Math.sin(Math.PI * u)) - 120 * u, sy = lerp(1080, 430, u), depth = lerp(360, 560, u);
    return { P: toWorldFromScreen(cam, sx, sy, depth), size: 230 * depth / F * (F / 560), flat: 0, vis: 1, screen: true };
  }
  if (t > 9.5) {                                    // end card
    const ent = 1 - smoother((t - 9.5) / 0.47);
    const dr = [4 * Math.sin(t * 0.9 + i), 3 * Math.cos(t * 0.7 + 2 * i)];
    const D = cam.D, S = [
      { sx: 196, sy: 276, depth: D - 420, px: 150, ex: [-0.6, -1] },
      { sx: 1240, sy: 282, depth: D - 30, px: 140, ex: [0.6, -1] },
      { sx: 140, sy: 1085, depth: 560, px: 420, ex: [-0.5, 1] },
      { sx: 1310, sy: 1060, depth: 620, px: 380, ex: [0.5, 1] }][i];
    const sx = S.sx + S.ex[0] * 520 * ent + dr[0], sy = S.sy + S.ex[1] * 520 * ent + dr[1];
    return { P: toWorldFromScreen(cam, sx, sy, S.depth), size: S.px * S.depth / F, flat: 0, vis: 1 };
  }
  return { vis: 0 };
}
function tileQuad(st, cam) {
  const s = st.size, f = st.flat;
  const ex = norm(add(mul(cam.r, 1 - f), mul(v3(1, 0, 0), f)));
  const ey = norm(add(mul(mul(cam.u, -1), 1 - f), mul(v3(0, -1, 0), f)));
  const Ex = mul(ex, s), Ey = mul(ey, s);
  return { P0: sub(sub(st.P, mul(Ex, 0.5)), mul(Ey, 0.5)), Ex, Ey };
}

// ---------- focus: whatever crosses the middle of the frame ----------
function focusRaw(t) {
  const cam = camera(t);
  let best = cam.D;
  for (const p of pieces) {
    const s = pieceState(p, t); if (!s.alpha) continue;
    const q = pieceQuad(p, s), n = cross(q.Ex, q.Ey), den = dot(cam.f, n);
    if (Math.abs(den) < 1e-6) continue;
    const lam = dot(sub(q.P0, cam.C), n) / den; if (lam <= 0 || lam >= best) continue;
    const H = add(cam.C, mul(cam.f, lam)), d = sub(H, q.P0);
    const u = dot(d, q.Ex) / dot(q.Ex, q.Ex), v = dot(d, q.Ey) / dot(q.Ey, q.Ey);
    const pu = PAD / p.img.width, pv = PAD / p.img.height;
    if (u > pu && u < 1 - pu && v > pv && v < 1 - pv) best = lam;
  }
  // opening: hold the mockup sharp, then hand over to the frame centre
  const k = sstep(0.6, 1.7, t);
  if (k < 1) {
    const hp = pageToWorld(720, 660, 30), mock = dot(sub(hp, cam.C), cam.f);
    best = lerp(mock, best, k);
  }
  return best;
}
function focus(t) { let s = 0; for (let k = 0; k < 8; k++) s += focusRaw(Math.max(0, t - k * 0.04)); return s / 8; }

// ---------- GL ----------
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
gl.getExtension('EXT_color_buffer_float');
const ANISO = gl.getExtension('EXT_texture_filter_anisotropic');
const MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);

function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + src); return s; }
function prog(vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}
const COMMON = `#version 300 es
precision highp float;
uniform vec3 uC, uR, uU, uF; uniform float uFocal;
vec3 floorCol(vec2 pix) {
  vec2 q = (pix - vec2(720.0, 576.0)) / vec2(720.0, 576.0);
  float g = clamp(length(q) / 1.41421, 0.0, 1.0);
  return mix(vec3(0.9765, 0.9843, 0.9843), vec3(0.9490, 0.9529, 0.9647), smoothstep(0.0, 1.0, g));
}
float sdRR(vec2 p, vec4 r, float rad) { vec2 c = (r.xy + r.zw) * 0.5, h = (r.zw - r.xy) * 0.5; vec2 q = abs(p - c) - h + rad; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad; }
vec2 pixOf(vec4 fc) { return vec2(fc.x, 1152.0 - fc.y); }
`;
const VS_QUAD = COMMON + `
layout(location=0) in vec2 aUV;
uniform vec3 uP0, uEx, uEy;
out vec2 vUV; out float vZ; out vec3 vW;
void main() {
  vec3 P = uP0 + aUV.x * uEx + aUV.y * uEy;
  vec3 d = P - uC;
  float xv = dot(d, uR), yv = dot(d, uU), zv = dot(d, uF);
  vUV = aUV; vZ = zv; vW = P;
  gl_Position = vec4(uFocal * xv / 720.0, uFocal * yv / 576.0, zv - 20.0, zv);
}`;
const VS_FULL = `#version 300 es
out vec2 vUV;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FS_FLOOR = COMMON + `
uniform vec4 uMaskRect; uniform float uMaskR, uShadowK;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oD;
void main() {
  vec2 pix = pixOf(gl_FragCoord);
  vec3 dir = uF + uR * (pix.x - 720.0) / uFocal + uU * (576.0 - pix.y) / uFocal;
  float t = -uC.z / min(dir.z, -1e-4);
  vec3 P = uC + t * dir;
  vec2 pg = vec2(P.x + 720.0, -P.y);
  float sd = sdRR(pg - vec2(0.0, 16.0), uMaskRect, uMaskR);
  float s = 0.16 * exp(-max(sd, 0.0) / 120.0) + 0.10 * exp(-max(sd, 0.0) / 30.0);
  s *= smoothstep(-40.0, 10.0, sd) * 0.6 + 0.4;
  vec3 col = mix(floorCol(pix), vec3(0.102, 0.129, 0.2), s * uShadowK);
  oC = vec4(col, 1.0); oD = vec4(t, 0.0, 0.0, 1.0);
}`;
const FS_QUAD = COMMON + `
in vec2 vUV; in float vZ; in vec3 vW;
uniform sampler2D uTex; uniform vec2 uUV0, uUV1;
uniform int uMode;            // 0 texture, 1 shadow, 2 solid
uniform float uAlpha, uFade;
uniform vec3 uColor;
uniform vec2 uBlurUV; uniform float uBlurLod, uShadowA;
uniform int uMask; uniform vec4 uMaskRect; uniform float uMaskR, uBelowFade, uHeroB;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oD;
void main() {
  vec2 uv = mix(uUV0, uUV1, vUV);
  vec4 c;
  if (uMode == 0) {
    c = texture(uTex, uv);
    if (uMask == 0) {
    vec2 e = smoothstep(vec2(0.0), fwidth(uv) * 1.5, uv) * smoothstep(vec2(0.0), fwidth(uv) * 1.5, 1.0 - uv);
    c *= e.x * e.y;
    }
  } else if (uMode == 1) {
    float a = 0.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j)) * 0.5 * uBlurUV;
      float w = exp(-0.5 * float(i * i + j * j) / 1.6);
      vec2 q = uv + o;
      float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
      a += textureLod(uTex, q, uBlurLod).a * w * inside;
    }
    a /= 13.17;
    c = vec4(vec3(0.102, 0.129, 0.2) * a * uShadowA, a * uShadowA);
  } else {
    c = vec4(uColor, 1.0);
  }
  vec3 haze = floorCol(pixOf(gl_FragCoord));
  if (uMask == 1) {
    vec2 pg = vec2(vW.x + 720.0, -vW.y);
    float sd = sdRR(pg, uMaskRect, uMaskR);
    float m = clamp(0.5 - sd / max(fwidth(sd), 1e-3), 0.0, 1.0);
    c *= m;
    float bf = uBelowFade * smoothstep(uHeroB - 4.0, uHeroB + 4.0, pg.y);
    c.rgb = mix(c.rgb, haze * c.a, bf);
  }
  c.rgb = mix(c.rgb, haze * c.a, uFade);
  c *= uAlpha;
  oC = c; oD = vec4(vZ * c.a, 0.0, 0.0, c.a);
}`;
const FS_COC = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uDep; uniform float uFocus;
out vec4 o;
void main() {
  vec4 d = texture(uDep, vUV); float z = d.r / max(d.a, 1e-4);
  float c = z < uFocus ? min(120.0, 75.0 * (uFocus - z) / z) : -min(120.0, 6.0 * (z - uFocus) / z);
  o = vec4(c, max(c, 0.0), 0.0, 1.0);
}`;
const FS_DOF = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uCol, uCoc; uniform vec2 uRes; uniform float uWeight, uSeed;
out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
void main() {
  float own = textureLod(uCoc, vUV, 0.0).r, ownR = abs(own);
  float fg = max(textureLod(uCoc, vUV, 3.0).g * 2.5, max(textureLod(uCoc, vUV, 5.0).g * 4.0, textureLod(uCoc, vUV, 6.0).g * 6.0));
  float Rs = clamp(max(ownR, fg), 0.0, 120.0);
  if (Rs < 0.75) { o = textureLod(uCol, vUV, 0.0) * uWeight; return; }
  vec4 c0 = textureLod(uCol, vUV, log2(max(1.0, ownR * 0.3)));
  float lod = max(0.0, log2(max(1.0, Rs * 0.3)) - 1.5);
  float k = clamp(own / 10.0, 0.0, 1.0);          // centre is itself a blurred foreground
  float rot = h(gl_FragCoord.xy) * 6.2831853;
  vec4 acc = c0; float n = 1.0;
  for (int i = 0; i < 40; i++) {
    float rr = Rs * sqrt((float(i) + 0.5) / 40.0), a = float(i) * 2.39996323 + rot;
    vec2 uv = vUV + vec2(cos(a), sin(a)) * rr / uRes;
    vec4 c = textureLod(uCol, uv, lod);
    float tc = textureLod(uCoc, uv, min(lod, 1.0)).r, tR = abs(tc);
    if (tc > own + 0.5) {                          // nearer tap: it scatters over us if its disc reaches
      float w = clamp(tR - rr + 1.5, 0.0, 1.0);
      acc += mix(c0, c, w);
    } else {                                       // farther tap
      float w = clamp(min(tR, ownR) - rr + 1.5, 0.0, 1.0);
      acc += mix(mix(c0, c, w), c, k * clamp(ownR - rr + 1.5, 0.0, 1.0));
    }
    n += 1.0;
  }
  o = acc / n * uWeight;
}`;
const FS_PRESENT = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uAcc; out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
uniform sampler2D uDbg; uniform int uDebug;
void main() { vec3 c = texture(uAcc, vUV).rgb; if (uDebug == 1) { vec2 k = texture(uDbg, vUV).rg; c = vec3(max(k.r,0.0)/120.0, max(-k.r,0.0)/20.0, k.g/120.0); } c += (h(gl_FragCoord.xy) - 0.5) / 255.0; o = vec4(c, 1.0); }`;

const P_FLOOR = prog(VS_FULL, FS_FLOOR), P_QUAD = prog(VS_QUAD, FS_QUAD), P_COC = prog(VS_FULL, FS_COC), P_DOF = prog(VS_FULL, FS_DOF), P_PRES = prog(VS_FULL, FS_PRESENT);
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function rt(fmt, ifmt, type, mips) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  const levels = mips ? Math.floor(Math.log2(Math.max(W, HS))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, ifmt, W, HS);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const colTex = rt(gl.RGBA, gl.RGBA16F, gl.HALF_FLOAT, true), depTex = rt(gl.RGBA, gl.RGBA16F, gl.HALF_FLOAT, false);
const cocTex = rt(gl.RG, gl.RG16F, gl.HALF_FLOAT, true), accTex = rt(gl.RGBA, gl.RGBA16F, gl.HALF_FLOAT, false);
function fbo(texs) {
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
  return f;
}
const sceneFB = fbo([colTex, depTex]), cocFB = fbo([cocTex]), accFB = fbo([accTex]);

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function texFrom(src) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (ANISO) gl.texParameterf(gl.TEXTURE_2D, ANISO.TEXTURE_MAX_ANISOTROPY_EXT, 16);
  return t;
}
// page chunks (split further if the GPU's texture limit is small)
const chunks = [];
for (const c of layout.chunks) {
  const img = await loadImg('assets/' + c.file);
  if (img.height <= MAXTEX) { chunks.push({ y: c.y, h: c.h, tex: texFrom(img) }); continue; }
  const parts = Math.ceil(img.height / MAXTEX);
  for (let k = 0; k < parts; k++) {
    const cv = document.createElement('canvas'), ph = Math.ceil(img.height / parts);
    cv.width = img.width; cv.height = Math.min(ph, img.height - k * ph);
    cv.getContext('2d').drawImage(img, 0, -k * ph);
    chunks.push({ y: c.y + k * ph / layout.scale, h: cv.height / layout.scale, tex: texFrom(cv) });
  }
}
for (const p of pieces) p.tex = texFrom(await loadImg('assets/' + p.file));
// logo tile texture
const logoSvg = await (await fetch('assets/logo.svg')).text();
const logoImg = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg.replace('<svg ', '<svg width="600" height="525" ')));
const tileCv = document.createElement('canvas'); tileCv.width = tileCv.height = 512;
{
  const g = tileCv.getContext('2d'), r = 112, m = 8;
  g.beginPath(); g.roundRect(m, m, 512 - 2 * m, 512 - 2 * m, r);
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#221d33'); gr.addColorStop(1, '#14111e');
  g.fillStyle = gr; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(192,132,252,0.35)'; g.stroke();
  const lw = 330, lh = lw * 525 / 600; g.drawImage(logoImg, (512 - lw) / 2, (512 - lh) / 2 + 6, lw, lh);
}
const tileTex = texFrom(tileCv);
const whiteTex = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); return t; })();

// ---------- title card DOM ----------
document.getElementById('badgeLogo').innerHTML = logoSvg.replace('<svg ', '<svg width="30" height="26" ');
document.getElementById('badgeName').textContent = CFG.brand;
const mkWords = (el, s) => s.split(' ').map((w, i, a) => { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = w + (i < a.length - 1 ? ' ' : ''); el.appendChild(sp); return sp; });
const w1 = mkWords(document.getElementById('l1'), CFG.line1), w2 = mkWords(document.getElementById('l2'), CFG.line2);
await document.fonts.ready;
function titleAt(t) {
  document.getElementById('badge').style.opacity = sstep(10.02, 10.32, t);
  const word = (el, start) => {
    const p = clamp((t - start) / 0.34, 0, 1), e = 1 - Math.pow(1 - p, 3);
    el.style.opacity = clamp(e * 1.4, 0, 1); el.style.transform = `translateY(${16 * (1 - e)}px)`; el.style.filter = e < 1 ? `blur(${12 * (1 - e)}px)` : 'none';
  };
  w1.forEach((el, k) => word(el, 10.12 + 0.06 * k));
  w2.forEach((el, k) => word(el, 10.36 + 0.05 * k));
}

// ---------- draw ----------
function setCam(u, cam) {
  gl.uniform3fv(u.uC, cam.C); gl.uniform3fv(u.uR, cam.r); gl.uniform3fv(u.uU, cam.u); gl.uniform3fv(u.uF, cam.f); gl.uniform1f(u.uFocal, F);
}
function maskAt(t) {
  const bottom = lerp(PH, HERO_B, sstep(9.6, 9.92, t));
  const r = lerp(24, 38 / S_END, sstep(9.47, 9.97, t));
  return { rect: [0, 0, 1440, bottom], r };
}
function drawScene(t) {
  const cam = camera(t), mask = maskAt(t), belowFade = sstep(9.47, 9.72, t);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFB); gl.viewport(0, 0, W, HS);
  gl.disable(gl.BLEND);
  gl.useProgram(P_FLOOR.p); setCam(P_FLOOR.u, cam);
  gl.uniform4fv(P_FLOOR.u.uMaskRect, mask.rect); gl.uniform1f(P_FLOOR.u.uMaskR, mask.r); gl.uniform1f(P_FLOOR.u.uShadowK, 1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const U = P_QUAD.u; gl.useProgram(P_QUAD.p); setCam(U, cam); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uTex, 0);
  const quad = (q, o) => {
    gl.uniform3fv(U.uP0, q.P0); gl.uniform3fv(U.uEx, q.Ex); gl.uniform3fv(U.uEy, q.Ey);
    gl.uniform2fv(U.uUV0, o.uv0 || [0, 0]); gl.uniform2fv(U.uUV1, o.uv1 || [1, 1]);
    gl.uniform1i(U.uMode, o.mode || 0); gl.uniform1f(U.uAlpha, o.alpha ?? 1); gl.uniform1f(U.uFade, o.fade || 0);
    gl.uniform3fv(U.uColor, o.color || [1, 1, 1]);
    gl.uniform2fv(U.uBlurUV, o.blurUV || [0, 0]); gl.uniform1f(U.uBlurLod, o.blurLod || 0); gl.uniform1f(U.uShadowA, o.shadowA || 0);
    gl.uniform1i(U.uMask, o.mask ? 1 : 0); gl.uniform4fv(U.uMaskRect, mask.rect); gl.uniform1f(U.uMaskR, mask.r);
    gl.uniform1f(U.uBelowFade, belowFade); gl.uniform1f(U.uHeroB, HERO_B);
    gl.bindTexture(gl.TEXTURE_2D, o.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  for (const c of chunks) quad({ P0: pageToWorld(0, c.y, 0), Ex: v3(1440, 0, 0), Ey: v3(0, -c.h, 0) }, { tex: c.tex, mask: true });

  const items = [];
  const shadowItem = (tex, cx, cy, w, h, zrel, zu, opts) => {
    const b = 7 + 0.5 * zrel, m = b * 1.6;
    const sx = cx + 0.10 * zrel, sy = cy + 4 + 0.36 * zrel;
    const q = { P0: pageToWorld(sx - w / 2 - m, sy - h / 2 - m, zu + 0.2), Ex: v3(w + 2 * m, 0, 0), Ey: v3(0, -(h + 2 * m), 0) };
    items.push({ z: zu + 0.1, q, o: { tex, mode: 1, uv0: [-m / w, -m / h], uv1: [1 + m / w, 1 + m / h], blurUV: [b / w, b / h], blurLod: Math.log2(Math.max(1, b * 2 * Math.max(1, 512 / Math.max(w, h)) / 3)), shadowA: 0.26 * (opts.k ?? 1), alpha: opts.alpha ?? 1 } });
  };
  for (const p of pieces) {
    const s = pieceState(p, t); if (!s.alpha) continue;
    const q = pieceQuad(p, s), zu = zUnder(p, t), zrel = s.z - zu;
    shadowItem(p.tex, p.cx + s.dx, p.cy, p.img.width, p.img.height * Math.cos(s.th), zrel, zu, { k: 1 - s.fade });
    if (s.edge > 0.5) {
      const n = v3(0, -Math.sin(s.th), Math.cos(s.th));
      // the card's real bottom edge (inside the 28px padding), extruded backwards: a white slab edge
      const inset = PAD + 14;                     // keep clear of the rounded corners
      const P0 = add(add(q.P0, mul(q.Ex, inset / p.img.width)), mul(q.Ey, 1 - PAD / p.img.height));
      const Ex = mul(q.Ex, 1 - 2 * inset / p.img.width);
      items.push({ z: s.z - 0.05, q: { P0, Ex, Ey: mul(n, -s.edge) }, o: { tex: whiteTex, mode: 2, color: [1, 1, 1], fade: s.fade } });
    }
    items.push({ z: s.z, q, o: { tex: p.tex, fade: s.fade } });
  }
  for (let i = 0; i < 4; i++) {
    const st = tileState(i, t, cam); if (!st.vis) continue;
    const q = tileQuad(st, cam);
    if (st.P[2] < 520 && !st.screen) {
      const px = st.P[0] + 720, py = -st.P[1];
      shadowItem(tileTex, px, py, st.size, st.size * (st.flat + (1 - st.flat) * 0.35), st.P[2], 0, { k: 0.9 });
    }
    items.push({ z: st.P[2], q, o: { tex: tileTex } });
  }
  items.sort((a, b) => a.z - b.z);
  for (const it of items) quad(it.q, it.o);
  return cam;
}
function renderFrame(t, N = 1, shutter = 0.7) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, accFB); gl.viewport(0, 0, W, HS); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  for (let k = 0; k < N; k++) {
    const ts = N === 1 ? t : t + ((k + 0.5) / N - 0.5) * shutter / 60;
    drawScene(ts);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, colTex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cocFB);
    gl.useProgram(P_COC.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, depTex); gl.uniform1i(P_COC.u.uDep, 0);
    gl.uniform1f(P_COC.u.uFocus, focus(ts)); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, cocTex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accFB);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P_DOF.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colTex); gl.uniform1i(P_DOF.u.uCol, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cocTex); gl.uniform1i(P_DOF.u.uCoc, 1);
    gl.uniform2f(P_DOF.u.uRes, W, HS); gl.uniform1f(P_DOF.u.uSeed, k * 1.618 + (ts % 1)); gl.uniform1f(P_DOF.u.uWeight, 1 / N);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
  }
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, HS);
  gl.useProgram(P_PRES.p); gl.bindTexture(gl.TEXTURE_2D, accTex); gl.uniform1i(P_PRES.u.uAcc, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cocTex); gl.uniform1i(P_PRES.u.uDbg, 1); gl.uniform1i(P_PRES.u.uDebug, window.DEBUG_COC ? 1 : 0); gl.activeTexture(gl.TEXTURE0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  titleAt(t);
  gl.finish();
}
window.seek = (t, N = 1, shutter = 0.7) => { renderFrame(t, N, shutter); return true; };
window.filmInfo = { duration: 14.5, fps: 60, cruise: CRUISE, camState, glideLy, focus, PH };
window.filmReady = true;
// live preview when opened directly (?play)
if (location.search.includes('play')) {
  const t0 = performance.now();
  const loop = () => { const t = ((performance.now() - t0) / 1000) % 14.5; renderFrame(t, 1); requestAnimationFrame(loop); };
  loop();
} else renderFrame(0, 1);
})().catch(e => { window.filmError = String(e && e.stack || e); console.error(e); });
