# Orbit Space fly-over

14.5 s, 1440x1152, 60 fps WebGL2 film of https://www.orbitspace.academy.

- `capture.js` – step 1: captures the page (layers hidden) in 2048px strips, each lifted piece on transparent, and `assets/layout.json`.
- `index.html` + `film.js` – the film page. Every frame is a pure function of time: `seek(t, subframes)`.
- `config.js` – brand name, closing line (statement + italic tail).
- `render.js` – `node render.js stills 0,1.6,2.5,5,6.5,9.3,11` or `node render.js film 60 16 [track.mp3] --gpu`.

Final render on a Windows machine with a GPU:

    npm i playwright && npx playwright install chromium
    node render.js film 60 16 track.mp3 --gpu
