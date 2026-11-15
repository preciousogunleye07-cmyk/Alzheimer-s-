// Render stills or the full film.
//   node render.js stills 0,1.6,2.5,5,6.5,9.3,11 [subframes]
//   node render.js film [fps=60] [subframes=16] [audio.mp3]
//   add --gpu to use the real GPU (Windows: d3d11 ANGLE)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync, spawn } = require('child_process');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const GPU = process.argv.includes('--gpu');
const ROOT = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const flags = GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
                    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args: flags, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1152 }, deviceScaleFactor: 1 });
  p.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
  await p.goto(`http://localhost:${port}/index.html${process.env.FLAT ? '?flat' : ''}`);
  await p.waitForFunction(() => window.filmReady || window.filmError, null, { timeout: 300000 });
  const err = await p.evaluate(() => window.filmError); if (err) { console.log(err); process.exit(1); }
  console.log('cruise px/s', (await p.evaluate(() => window.filmInfo.cruise)).toFixed(1));
  const stage = await p.$('#stage');
  const mode = args[0] || 'stills';
  if (mode === 'stills') {
    const times = (args[1] || '0,1.6,2.5,5,6.5,9.3,11').split(',').map(Number);
    const N = +(args[2] || 6);
    fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
    for (const t of times) {
      const t0 = Date.now();
      await p.evaluate(([t, N, d]) => { window.DEBUG_COC = d; return window.seek(t, N); }, [t, N, !!process.env.DEBUG_COC]);
      const f = path.join(ROOT, 'stills', `${process.env.DEBUG_COC ? 'coc' : 'still'}_${t.toFixed(2)}s.png`);
      await stage.screenshot({ path: f });
      console.log(f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  } else if (mode === 'frames') {
    // node render.js frames <start> <end> <fps> <subframes>  -> frames/f_00000.png
    const [a, e, fps, N] = [+args[1], +args[2], +(args[3] || 60), +(args[4] || 16)];
    fs.mkdirSync(path.join(ROOT, process.env.OUT || 'frames'), { recursive: true });
    const T0 = Date.now();
    for (let i = a; i < e; i++) {
      const f = path.join(ROOT, process.env.OUT || 'frames', `f_${String(i).padStart(5, '0')}.png`);
      if (fs.existsSync(f)) continue;
      await p.evaluate(([t, N]) => window.seek(t, N), [i / fps, N]);
      await p.screenshot({ path: f + '.tmp.png', clip: { x: 0, y: 0, width: 1440, height: 1152 }, timeout: 0 }); fs.renameSync(f + '.tmp.png', f);
      if (i % 20 === 0) console.log(`frame ${i} [${a}-${e})  ${((Date.now() - T0) / 1000).toFixed(0)}s`);
    }
  } else {
    const fps = +(args[1] || 60), N = +(args[2] || 16), audio = args[3];
    const frames = Math.round(14.5 * fps);
    const out = path.join(ROOT, `orbitspace_flyover_${fps}fps.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      ...(audio ? ['-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const T0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await p.evaluate(([t, N]) => window.seek(t, N), [i / fps, N]);
      const buf = await stage.screenshot({ type: 'png' });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 30 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - T0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('wrote', out);
  }
  await b.close(); server.close();
})();
