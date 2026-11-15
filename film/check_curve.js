const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=__dirname; const s=http.createServer((q,r)=>{const f=path.join(ROOT,q.url.split('?')[0]); if(!fs.existsSync(f)){r.writeHead(404);return r.end();} r.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>s.listen(0,r)); const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}); const p=await b.newPage({viewport:{width:1440,height:1152}});
await p.goto(`http://localhost:${s.address().port}/index.html`); await p.waitForFunction(()=>window.filmReady);
const r=await p.evaluate(()=>{const o=[];const dt=1/120;let prev=window.filmInfo.camState(0);let minV=1e9,minVt=0,dZoomIn=0;
 for(let t=dt;t<=9.25;t+=dt){const c=window.filmInfo.camState(t); const v=(c.ly-prev.ly)/dt; if(t>0.7&&t<8.6&&v<minV){minV=v;minVt=t;} if(t<9.25&&c.D<prev.D-1e-6) dZoomIn++; if(Math.abs(t*4-Math.round(t*4))<dt*2) o.push([+t.toFixed(2),Math.round(c.ly),Math.round(v),Math.round(c.D),+(c.phi*57.3).toFixed(1)]); prev=c;}
 return {o,minV,minVt,dZoomIn};});
console.log(r.o.map(x=>x.join('\t')).join('\n')); console.log('min page speed 0.7-8.6s', r.minV.toFixed(0),'at',r.minVt.toFixed(2),'| zoom-in steps before 9.25:',r.dZoomIn);
await b.close(); s.close();})();
