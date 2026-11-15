// Step 1: capture orbitspace.academy as a flat page + lifted pieces + layout.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL_ = process.argv[2] || 'https://www.orbitspace.academy';
const OUT = __dirname + '/assets';
const PAD = 28, CHUNK = 2048;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'load', timeout: 90000 });
  await p.waitForTimeout(2500);
  for (let y = 0; y < 9000; y += 300) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(200); }
  await p.waitForTimeout(2000);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1500);
  // wait for the rotating word to read "Into Software." fully settled
  await p.waitForFunction(() => {
    const s = document.querySelector('.text-rotate-sr-only');
    if (!s || !/Software/.test(s.textContent)) return false;
    return [...document.querySelectorAll('.text-rotate-element')].every(e => /translateY\(0(%|px)?\)|none|^$/.test(e.style.transform || ''));
  }, null, { timeout: 60000, polling: 50 }).catch(() => console.log('rotate word: timeout, freezing anyway'));
  // freeze: kill timers, rAF, animations, transitions
  await p.evaluate(() => {
    const hi = setTimeout(() => {}, 0); for (let i = 0; i <= hi + 1000; i++) { clearTimeout(i); clearInterval(i); }
    window.requestAnimationFrame = () => 0; window.setTimeout = () => 0; window.setInterval = () => 0;
    document.getAnimations().forEach(a => a.pause());
    const st = document.createElement('style');
    st.textContent = `*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}
      html,body{scroll-behavior:auto!important}`;
    document.head.appendChild(st);
    // drop fixed overlays (countdown rocket, custom cursor); pin header in flow
    document.querySelectorAll('body *').forEach(e => {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed') {
        if (e.id === 'main-navigation-header') e.style.position = 'absolute';
        else e.remove();
      }
    });
  });
  await p.waitForTimeout(300);
  // lock layout at full height
  let H = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.setViewportSize({ width: 1440, height: H }); await p.waitForTimeout(800);
  const H2 = await p.evaluate(() => document.documentElement.scrollHeight);
  console.log('height', H, '->', H2); H = H2;
  await p.evaluate(() => scrollTo(0, 0));

  // mark layers
  const pieces = await p.evaluate(() => {
    const L = [];
    const box = e => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
    const add = (e, id, kind) => { if (!e) return; e.setAttribute('data-layer', id); L.push({ id, kind, ...box(e) }); };
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    // hero
    add(qa('#hero div').find(e => /h-\[220px\]/.test(e.className)), 'hero-card', 'mockup');
    add(q('#btn-contact-hero'), 'hero-btn', 'button');
    add(q('#btn-explore-courses-hero'), 'hero-btn2', 'button');
    add(q('#hero h1 span.text-rotate'), 'chip-rotate', 'chip');
    add(qa('#main-navigation-header a, #main-navigation-header button').find(e => /Get Started/.test(e.innerText)), 'chip-start', 'chip');
    // courses
    qa('[id^=course-card-]').slice(0, 3).forEach((card, i) => {
      add(card, 'course-' + i, 'card');
      const img = card.querySelector('img');
      let h = img; while (h.parentElement && h.parentElement !== card && h.parentElement.getBoundingClientRect().height < 250) h = h.parentElement;
      add(h, 'course-photo-' + i, 'photo');
    });
    const badges = qa('#courses span').filter(e => /^(HIGH DEMAND|POPULAR)$/.test(e.innerText.trim()));
    badges.forEach((e, i) => add(e, 'course-chip-' + i, 'flychip'));
    // why choose
    qa('#why-choose-orbit-space article').forEach((e, i) => add(e, 'why-' + i, 'card'));
    // CTA card (testimonial stand-in)
    add(qa('div').filter(e => /^Ready to Begin/.test(e.innerText || '') && /rounded-3xl/.test(e.className)).pop(), 'testimonial', 'testimonial');
    // siwes
    add(qa('#siwes div').find(e => /rounded-\[24px\]/.test(e.className)), 'siwes-card', 'card');
    add(qa('#siwes div').find(e => /h-44/.test(e.className)), 'siwes-photo', 'photo');
    // faq
    qa('button').filter(e => e.innerText.trim().endsWith('?')).forEach((e, i) => add(e.parentElement, 'faq-' + i, 'card'));
    add(q('#footer-attendance-hub'), 'footer-hub', 'card');
    return L;
  });
  // parents (nearest enclosing layer)
  await p.evaluate(() => {});
  const parents = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-layer]')].map(e => {
    const par = e.parentElement && e.parentElement.closest('[data-layer]'); return [e.dataset.layer, par ? par.dataset.layer : null];
  })));
  pieces.forEach(pc => pc.parent = parents[pc.id]);
  console.log(pieces.length, 'pieces');

  // base page with all layers hidden
  await p.addStyleTag({ content: `.hide-layers [data-layer]{visibility:hidden!important}` });
  await p.evaluate(() => document.documentElement.classList.add('hide-layers'));
  await p.waitForTimeout(200);
  const chunks = [];
  for (let y = 0; y < H; y += CHUNK) {
    const h = Math.min(CHUNK, H - y); const file = `page_${chunks.length}.png`;
    await p.screenshot({ path: `${OUT}/${file}`, clip: { x: 0, y, width: 1440, height: h }, fullPage: true });
    chunks.push({ file, y, h });
  }
  await p.evaluate(() => document.documentElement.classList.remove('hide-layers'));
  // also a reference full shot with layers visible (for checking)
  await p.screenshot({ path: `${OUT}/reference.png`, fullPage: true });

  // solo pieces
  await p.addStyleTag({ content: `
    .solo, .solo body { background: transparent !important; }
    .solo * { visibility: hidden !important; }
    .solo [data-solo], .solo [data-solo] * { visibility: visible !important; }
    .solo [data-solo] [data-layer], .solo [data-solo] [data-layer] * { visibility: hidden !important; }` });
  await p.evaluate(() => document.documentElement.classList.add('solo'));
  for (const pc of pieces) {
    await p.evaluate(id => { document.querySelectorAll('[data-solo]').forEach(e => e.removeAttribute('data-solo')); document.querySelector(`[data-layer="${id}"]`).setAttribute('data-solo', ''); }, pc.id);
    const clip = { x: Math.max(0, pc.x - PAD), y: Math.max(0, pc.y - PAD) };
    clip.width = Math.min(1440, pc.x + pc.w + PAD) - clip.x; clip.height = Math.min(H, pc.y + pc.h + PAD) - clip.y;
    pc.file = `piece_${pc.id}.png`; pc.img = clip;
    await p.screenshot({ path: `${OUT}/${pc.file}`, clip, fullPage: true, omitBackground: true });
  }
  const logo = await p.evaluate(() => document.querySelector('#main-navigation-header svg').outerHTML);
  fs.writeFileSync(`${OUT}/logo.svg`, logo.replace(/width="[^"]*"\s+height="[^"]*"/, ''));
  fs.writeFileSync(`${OUT}/layout.json`, JSON.stringify({ url: URL_, width: 1440, height: H, scale: 2, pad: PAD, chunks, pieces }, null, 1));
  console.log('done');
  await b.close();
})();
