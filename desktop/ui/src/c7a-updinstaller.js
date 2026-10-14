
/* ════════════════════════════════════════════════════════════════════
   18a · UPDATE-INSTALLER — eigene Vollbild-Ansicht im Kontor-Design
   Modi:  real     echtes Update (Sicherung → Download → Prüfung → Installation → Neustart)
          helper   Windows: das Fenster des Hilfsprozesses, der den Installer ausführt (siehe uphelper.rs)
          demo     Vorschau mit simuliertem Ablauf (Einstellungen › Updates) – installiert nichts
          welcome  „Willkommen in Version x“ nach dem ersten Start der neuen Version
   Effekte: Shader-Hintergrund (WebGL, fällt bei Bedarf auf CSS zurück), Warp-Tunnel (Tempo = Download-Geschwindigkeit),
            Kontor-Logo aus Partikeln, Schockwellen, 3D-Ring mit Mausneigung, Entschlüsselungs-Texte, Live-Protokoll.
            Alles passt sich der Rechnerleistung an und ruht bei „Animationen reduzieren“.
   ════════════════════════════════════════════════════════════════════ */
const UPX_ORDER = ['prep', 'backup', 'download', 'verify', 'install', 'restart', 'done'];
const UPX_STEPS = [['backup', 'Sicherung', 'database'], ['download', 'Download', 'download'], ['verify', 'Prüfung', 'shield'], ['install', 'Installation', 'layers'], ['restart', 'Neustart', 'zap']];
const UPX_GLYPH = {prep: 'sparkle', backup: 'database', download: 'download', verify: 'shield', restart: 'zap', error: 'alert'};
const UPX_TXT = {
  prep: ['Update wird vorbereitet', 'Einen Moment …'],
  backup: ['Ihre Daten werden gesichert', 'Vor jedem Update legt Kontor automatisch eine Datensicherung an.'],
  download: ['Neue Version wird geladen', 'Das Paket kommt direkt vom Kontor-Server und wird gleich nach dem Laden geprüft.'],
  verify: ['Signatur wird geprüft', 'Es werden nur von Kontor signierte Pakete installiert.'],
  install: ['Kontor %v wird installiert', 'Das dauert nur einen Moment – danach startet Kontor automatisch neu.'],
  restart: ['Gleich geht es weiter', 'Kontor %v startet jetzt neu …'],
  done: ['Fertig!', 'Kontor %v ist installiert.'],
  error: ['Update nicht installiert', ''],
};
const UPX_DWELL = {prep: 700, backup: 1500, verify: 2000, install: 1800, restart: 1200};
const UPX_SCR = 'abcdeghnopqrstuvxyz0123456789#%&*+<>/';   // schmale Zeichen, damit der Titel beim Entschlüsseln nicht umbricht
let UPX_OPEN = null, UPX_WELCOME_SHOWN = false;

/** Aus den Release-Notes die Stichpunkte der obersten Ebene: Titel (Fettdruck) + Erklärung */
function upxHighlights(md, cur, next) {
  const txt = cur && next ? updNotesSince(md, cur, next) : md;
  const out = [];
  String(txt || '').split(/\r?\n/).forEach(l => {
    const m = l.match(/^[-*]\s+(.*\S)\s*$/); if (!m) return;
    const b = m[1].match(/^\*\*(.+?)\*\*\s*(.*)$/);
    const clean = s => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
    let title = b ? clean(b[1]).replace(/[.:]\s*$/, '') : '', body = clean(b ? b[2] : m[1]);
    if (!title) { title = body.length > 70 ? body.slice(0, 68).replace(/\s+\S*$/, '') + ' …' : body; body = body.length > 70 ? body : ''; }
    if (body.length > 200) body = body.slice(0, 197).replace(/\s+\S*$/, '') + ' …';
    out.push({title, text: body});
  });
  return out.slice(0, 8);
}

/** Text „entschlüsseln“: Zeichen laufen durch, bis jeder Buchstabe von links nach rechts einrastet */
function upxDecode(el, text, ms = 700) {
  clearInterval(el._dc);
  if (reduced()) { el.textContent = text; return; }
  const t0 = performance.now();
  el._dc = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms), n = Math.floor(k * text.length);
    el.textContent = k >= 1 ? text : text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : UPX_SCR[Math.random() * UPX_SCR.length | 0]).join('');
    if (k >= 1) clearInterval(el._dc);
  }, 34);
  el.classList.remove('gl2'); void el.offsetWidth; el.classList.add('gl2');
}

/* ───── Effekt-Motor ─────
   Hintergrund: WebGL-Shader (fließendes Nordlicht, reagiert auf Fortschritt/Tempo/Schockwelle) – ohne WebGL bleibt der CSS-Hintergrund.
   Hinten (2D): Warp-Tunnel, Hex-Ströme, Staub, Orbit.  Vorn (2D): Kontor-Logo aus Partikeln, Schockwellen, Konfetti. */
const UPX_VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const UPX_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes,uC;uniform float uT,uHue,uProg,uShock,uBurst;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec3 hsl(float hh,float s,float l){vec3 k=mod(vec3(0.,8.,4.)+hh*12.,12.);float a=s*min(l,1.-l);return l-a*max(min(min(k-3.,9.-k),1.),-1.);}
void main(){
  vec2 R=uRes;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;vec2 c=(uC*R-.5*R)/R.y;float t=uT*.07;
  vec2 q=vec2(fbm(p*1.4+vec2(0.,t)),fbm(p*1.4+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p*1.7+3.*q+vec2(1.7,9.2)+t*1.4),fbm(p*1.7+3.*q+vec2(8.3,2.8)-t));
  float f=fbm(p*1.3+3.2*r);
  vec3 c1=hsl(uHue,.9,.55),c2=hsl(uHue+.09,.95,.62),c3=hsl(uHue+.56,.8,.55);
  vec3 col=vec3(.012,.016,.035);
  col+=c1*smoothstep(.25,.95,f)*.36;
  col+=c3*smoothstep(.35,1.,length(q))*.22*f;
  col+=c2*pow(f,4.)*(.2+.4*uProg);
  float d=length(p-c);
  col+=c1*exp(-d*d*5.)*(.12+.5*uBurst);
  col+=vec3(1.)*exp(-d*d*40.)*.06*uBurst;
  float ring=exp(-pow((d-uShock*1.7)*34.,2.))*pow(1.-uShock,1.5)*step(uShock,.999);
  col+=(c2*.6+.25)*ring*.8;
  vec2 uv=gl_FragCoord.xy/R-.5;col*=1.-.7*dot(uv,uv)*1.5;
  col+=(h(gl_FragCoord.xy+uT)-.5)*.018;
  gl_FragColor=vec4(col,1.);
}`;
const UPX_K = (() => {   // das Kontor-K (Logo) als Punktfolge, Mittelpunkt 0/0, Einheit = Logo-Raster
  const seg = [[7, 4.5, 7, 19.5], [18, 4.5, 10.5, 12], [10.5, 12, 18, 19.5]], len = seg.map(([a, b, c, d]) => Math.hypot(c - a, d - b)), tot = len.reduce((a, b) => a + b), pts = [];
  for (let i = 0; i < 170; i++) { let s = i / 170 * tot, k = 0; while (s > len[k]) { s -= len[k]; k++; } const [a, b, c, d] = seg[k], f = s / len[k]; pts.push([a + (c - a) * f - 12.5, b + (d - b) * f - 12]); }
  return {pts, seg: seg.map(([a, b, c, d]) => [a - 12.5, b - 12, c - 12.5, d - 12])};
})();

function upxFx(root, ring) {
  const cvG = $('.fxg', root), cvB = $('.fxb', root), cvF = $('.fxf', root);
  if (reduced()) { [cvG, cvB, cvF].forEach(c => c.style.display = 'none'); return {mode() {}, rate() {}, hue() {}, prog() {}, shock() {}, burst() {}, assemble() {}, stop() {}}; }
  const cb = cvB.getContext('2d'), cf = cvF.getContext('2d'), base = +getComputedStyle(document.documentElement).getPropertyValue('--ah') || 26;
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 100, RW = 300, raf = 0, last = 0, t = 0, mode = 'idle', rate = .5, prog = 0, hue = base, hueT = base, dead = false, fr = 0, slow = 16, q = 1, shockT = -9, burstT = -9, flow = 1, flowT = 1, gs = .5, kOn = false, kT = 0, kLit = 0;
  let stars = [], motes = [], orbs = [], sparks = [], hexs = [], conf = [], shocks = [], kp = [], acc = 0, accH = 0, accO = 0;
  const rnd = (a, b) => a + Math.random() * (b - a), hsl = (h, l, a, s = 90) => `hsla(${h},${s}%,${l}%,${a})`, HEX = '0123456789ABCDEF';
  const hexs8 = () => { let s = ''; for (let i = 0; i < 8; i++) s += HEX[Math.random() * 16 | 0]; return s; };
  // WebGL
  let gl = null, loc = {}, buf = null;
  const glInit = () => {
    try {
      const g = cvG.getContext('webgl', {antialias: false, alpha: false, powerPreference: 'low-power', depth: false, stencil: false}); if (!g) return;
      const sh = (ty, src) => { const s = g.createShader(ty); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s)); return s; };
      const pr = g.createProgram(); g.attachShader(pr, sh(g.VERTEX_SHADER, UPX_VS)); g.attachShader(pr, sh(g.FRAGMENT_SHADER, UPX_FS)); g.linkProgram(pr);
      if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error('link'); g.useProgram(pr);
      buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const a = g.getAttribLocation(pr, 'p'); g.enableVertexAttribArray(a); g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0);
      ['uRes', 'uC', 'uT', 'uHue', 'uProg', 'uShock', 'uBurst'].forEach(n => loc[n] = g.getUniformLocation(pr, n));
      gl = g; root.classList.add('gl');
      cvG.addEventListener('webglcontextlost', e => { e.preventDefault(); glOff(); });
    } catch (e) { gl = null; }
  };
  const glOff = () => { gl = null; root.classList.remove('gl'); cvG.style.display = 'none'; };
  const size = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = cvB.clientWidth; H = cvB.clientHeight;
    [cvB, cvF].forEach(c => { c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr)); });
    cvG.width = Math.max(2, Math.round(W * gs)); cvG.height = Math.max(2, Math.round(H * gs)); if (gl) gl.viewport(0, 0, cvG.width, cvG.height);
  };
  const geo = () => { const b = ring.getBoundingClientRect(), c = cvB.getBoundingClientRect(); cx = b.left - c.left + b.width / 2; cy = b.top - c.top + b.height / 2; RW = b.width; R = b.width * .5 * .68; };
  const ease = x => 1 - Math.pow(1 - x, 3);
  const spawnStar = (dir, h0) => stars.length < 520 && stars.push({a: rnd(0, 6.2832), u: 0, sp: rnd(.5, 1.1), dir, h: h0 + rnd(-25, 45), w: rnd(.7, 2.1), l: rnd(.35, 1)});
  let level = 0;
  const govern = () => {   // Leistungsstufen: nur verschlechtern, nie zurück (kein Flackern). 60 fps ≈ 17 ms je Bild
    if (window.KONTOR_UI && window.KONTOR_UI.upxNoGov) return;
    const lvl = slow > 40 ? 3 : slow > 30 ? 2 : slow > 22 ? 1 : 0; if (lvl <= level) return; level = lvl;
    q = [1, .65, .45, .3][level];
    if (level >= 1 && gs > .36) { gs = .36; size(); }
    if (level >= 2) root.classList.add('lite');   // schwere CSS-Effekte aus
    if (level >= 3 && gl) glOff();
  };
  const back = dt => {
    cb.setTransform(dpr, 0, 0, dpr, 0, 0); cb.clearRect(0, 0, W, H); cb.globalCompositeOperation = 'lighter';
    const far = Math.hypot(W, H) * .56;
    // Warp-Tunnel: nach innen beim Laden, nach außen sonst
    const sr = mode === 'stream' ? 150 * rate * q : mode === 'orbit' ? 34 * q : mode === 'burst' ? 70 * q : 7;
    acc += sr * dt; while (acc >= 1) { acc--; spawnStar(mode === 'stream' ? -1 : 1, hue); }
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i]; s.u += dt * s.sp * (.5 + rate * .9) * (mode === 'stream' ? 1 : .6); if (s.u >= 1) { stars.splice(i, 1); continue; }
      const f = u => s.dir < 0 ? R * 1.04 + (far - R * 1.04) * Math.pow(1 - u, 2.1) : R * 1.04 + (far - R * 1.04) * Math.pow(u, 2.1), du = .035 + .07 * rate;
      const r1 = f(s.u), r0 = f(Math.max(0, s.u - du)), sw = Math.sin(s.u * 3.1416), al = Math.min(1, sw * 1.5) * s.l;
      cb.strokeStyle = hsl(s.h, 70, al * (s.dir < 0 ? .7 : .38)); cb.lineWidth = s.w * (s.dir < 0 ? .6 + s.u : 1.2 - s.u * .6);
      cb.beginPath(); cb.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0 * .96); cb.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1 * .96); cb.stroke();
    }
    // Hex-Ströme bei der Signaturprüfung
    if (mode === 'hex') { accH += 38 * q * dt; while (accH >= 1) { accH--; hexs.push({a: rnd(0, 6.2832), u: 0, sp: rnd(.55, 1), s: hexs8(), h: hue + rnd(-10, 50)}); } }
    cb.font = '600 11px ui-monospace,Menlo,Consolas,monospace'; cb.textAlign = 'center';
    for (let i = hexs.length - 1; i >= 0; i--) {
      const s = hexs[i]; s.u += dt * s.sp * .7; if (s.u >= 1) { hexs.splice(i, 1); continue; }
      const r = R * 1.1 + (far * .62 - R * 1.1) * Math.pow(1 - s.u, 1.6), al = Math.sin(s.u * 3.1416) * .85;
      cb.fillStyle = hsl(s.h, 72, al); cb.fillText(s.s, cx + Math.cos(s.a) * r * 1.25, cy + Math.sin(s.a) * r * .8);
    }
    // Orbit-Staub und Funken
    if (mode === 'orbit' || mode === 'hex') { accO += (mode === 'orbit' ? 3 : 1) * dt; while (orbs.filter(o => o.t === 0).length < 46 * q) orbs.push({t: 0, a: rnd(0, 6.2832), r: R * rnd(1.1, 1.9), w: rnd(.25, 1.1) * (Math.random() < .5 ? 1 : -1), s: rnd(.8, 2.1), ph: rnd(0, 6.2832), h: hue + rnd(-20, 60)}); while (accO >= 1) { accO--; sparks.push({a: rnd(0, 6.2832), r: R * 1.03, v: rnd(40, 150), life: 0, max: rnd(.6, 1.3), h: hue + rnd(0, 40)}); } }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i]; o.a += o.w * dt * (rate > 1 ? 1.8 : 1); if (mode !== 'orbit' && mode !== 'hex') { o.dead = (o.dead || 0) + dt; if (o.dead > .8) { orbs.splice(i, 1); continue; } }
      cb.fillStyle = hsl(o.h, 66, (.35 + .35 * Math.sin(t * 1.7 + o.ph)) * (o.dead ? 1 - o.dead / .8 : 1)); cb.beginPath(); cb.arc(cx + Math.cos(o.a) * o.r, cy + Math.sin(o.a) * o.r * .94, o.s, 0, 6.2832); cb.fill();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt; if (p.life > p.max) { sparks.splice(i, 1); continue; }
      const r = p.r + p.v * p.life, k = 1 - p.life / p.max; cb.strokeStyle = hsl(p.h, 70, k * .8); cb.lineWidth = 1.4; cb.beginPath(); cb.moveTo(cx + Math.cos(p.a) * r, cy + Math.sin(p.a) * r); cb.lineTo(cx + Math.cos(p.a) * (r + 12 * k), cy + Math.sin(p.a) * (r + 12 * k)); cb.stroke();
    }
    // Staub
    while (motes.length < 30 * q) motes.push({x: rnd(0, W), y: rnd(H * .1, H * 1.05), vy: rnd(-16, -5), vx: rnd(-4, 4), s: rnd(.8, 2.2), life: 0, max: rnd(5, 11), h: hue + rnd(-10, 50)});
    for (let i = motes.length - 1; i >= 0; i--) {
      const p = motes[i]; p.life += dt; if (p.life > p.max) { motes.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; cb.fillStyle = hsl(p.h, 70, Math.sin(p.life / p.max * 3.1416) * .5); cb.beginPath(); cb.arc(p.x, p.y, p.s, 0, 6.2832); cb.fill();
    }
    cb.globalCompositeOperation = 'source-over';
  };
  const front = dt => {
    cf.setTransform(dpr, 0, 0, dpr, 0, 0); cf.clearRect(0, 0, W, H);
    cf.globalCompositeOperation = 'lighter';
    // Kontor-Logo aus Partikeln
    if (kp.length) {
      kT += dt; const u = RW * .0245; let done = 0;
      kp.forEach(p => {
        p.p += dt * p.sp * .5; const e = ease(Math.max(0, Math.min(1, p.p))), tx = cx + p.tx * u, ty = cy + p.ty * u; if (p.p >= 1) done++;
        const j = p.p >= 1 ? Math.sin(kT * 5 + p.ph) * 1.1 : 0, x = p.x0 + (tx - p.x0) * e + j, y = p.y0 + (ty - p.y0) * e + j * .8;
        if (p.p > 0) { cf.fillStyle = hsl(hue + 18, 74, Math.min(1, p.p * 1.4) * (p.p >= 1 ? .95 : .7)); cf.beginPath(); cf.arc(x, y, p.p >= 1 ? 1.9 : 1.5 + (1 - e) * 1.5, 0, 6.2832); cf.fill(); }
      });
      kLit += ((done / kp.length > .9 ? 1 : 0) - kLit) * Math.min(1, dt * 2.5);
      if (kLit > .02) {
        cf.lineCap = 'round'; cf.lineJoin = 'round'; cf.lineWidth = RW * .016; cf.strokeStyle = hsl(hue + 18, 80, 80, 1); cf.globalAlpha = kLit * (.55 + .25 * Math.sin(kT * 3)); cf.shadowColor = hsl(hue + 18, 85, 62, 1); cf.shadowBlur = RW * .05;
        cf.beginPath(); UPX_K.seg.forEach(([a, b, c, d]) => { cf.moveTo(cx + a * u, cy + b * u); cf.lineTo(cx + c * u, cy + d * u); }); cf.stroke(); cf.globalAlpha = 1; cf.shadowBlur = 0;
      }
    }
    // Schockwellen
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i]; s.u += dt / s.dur; if (s.u < 0) continue; if (s.u >= 1) { shocks.splice(i, 1); continue; }
      const e = ease(s.u); cf.strokeStyle = hsl(hue + 25, 78, Math.pow(1 - s.u, 2) * s.a * .55); cf.lineWidth = Math.max(.5, s.w * Math.pow(1 - s.u, 1.5)); cf.beginPath(); cf.arc(cx, cy, R * .9 + e * s.max, 0, 6.2832); cf.stroke();
    }
    cf.globalCompositeOperation = 'source-over';
    for (let i = conf.length - 1; i >= 0; i--) {
      const p = conf[i]; p.life += dt; if (p.life > p.max) { conf.splice(i, 1); continue; }
      p.vy += 520 * dt; p.vx *= .992; p.vy *= .992; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      cf.save(); cf.translate(p.x, p.y); cf.rotate(p.rot); cf.scale(1, Math.cos(p.rot * 1.7 + p.life * 5)); cf.fillStyle = hsl(p.h, p.l, Math.min(1, (1 - p.life / p.max) * 1.6));
      if (p.sh) { cf.beginPath(); cf.arc(0, 0, p.w / 2, 0, 6.2832); cf.fill(); } else cf.fillRect(-p.w / 2, -p.h2 / 2, p.w, p.h2); cf.restore();
    }
  };
  const glDraw = () => {
    gl.uniform2f(loc.uRes, cvG.width, cvG.height); gl.uniform2f(loc.uC, cx / W, 1 - cy / H); gl.uniform1f(loc.uT, t * flow); gl.uniform1f(loc.uHue, ((hue % 360) + 360) % 360 / 360);
    gl.uniform1f(loc.uProg, prog); gl.uniform1f(loc.uShock, Math.min(1, Math.max(0, (t - shockT) / 1.5))); gl.uniform1f(loc.uBurst, Math.max(0, 1 - (t - burstT) / 3.2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const frame = ts => {
    raf = requestAnimationFrame(frame);
    if (document.hidden || dead) { last = ts; return; }
    const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; t += dt; fr++;
    slow = slow * .95 + dt * 1000 * .05; if (fr > 40 && fr % 45 === 0) govern(); if (fr % 20 === 1) geo();
    hue += (hueT - hue) * Math.min(1, dt * 2.2); flow += (flowT - flow) * Math.min(1, dt * 1.5);
    if (gl) glDraw(); back(dt); front(dt);
  };
  glInit(); size(); geo();
  const onResize = () => { size(); geo(); };
  addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  return {
    mode(m, o = {}) { mode = m; if (o.rate != null) rate = o.rate; if (o.hue != null) hueT = o.hue; if (o.flow != null) flowT = o.flow; },
    rate(r) { rate = r; flowT = .8 + r * 1.6; },
    hue(h) { hueT = h; },
    prog(p) { prog = p; },
    shock(a = 1, max) { shocks.push({u: 0, dur: 1.4, w: 3.2, a, max: max || Math.hypot(W, H) * .5}); shocks.push({u: -.08, dur: 1.6, w: 1.5, a: a * .6, max: max || Math.hypot(W, H) * .5}); shockT = t; },
    burst(n = 150) {
      burstT = t; geo(); const pal = [hueT, hueT + 28, hueT + 200, hueT + 320, hueT + 90];
      for (let i = 0; i < n * q; i++) { const a = rnd(0, 6.2832), v = rnd(180, 820) * rnd(.4, 1); conf.push({x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260, rot: rnd(0, 6.2832), vr: rnd(-9, 9), w: rnd(5, 10), h2: rnd(7, 15), sh: Math.random() < .25, h: pal[i % pal.length] + rnd(-8, 8), l: rnd(55, 74), life: 0, max: rnd(2.2, 4)}); }
    },
    /** Kontor-Logo aus Partikeln zusammensetzen (an) bzw. auseinanderfliegen lassen (aus) */
    assemble(on) {
      geo();
      if (on && !kOn) { kOn = true; kT = 0; kLit = 0; kp = UPX_K.pts.map(([tx, ty]) => { const a = rnd(0, 6.2832), d = Math.hypot(W, H) * rnd(.3, .6); return {tx, ty, x0: cx + Math.cos(a) * d, y0: cy + Math.sin(a) * d, p: -rnd(0, 1.1), sp: rnd(.6, 1.15), ph: rnd(0, 6.2832)}; }); }
      if (!on && kOn) {
        kOn = false; const u = RW * .0245;
        kp.forEach(p => { const x = cx + p.tx * u, y = cy + p.ty * u, a = Math.atan2(y - cy, x - cx) + rnd(-.6, .6), v = rnd(160, 700); conf.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, rot: 0, vr: 0, w: rnd(3, 5), h2: 3, sh: true, h: hueT + rnd(0, 60), l: rnd(62, 80), life: 0, max: rnd(1.2, 2.4)}); }); kp = [];
      }
    },
    stop() { dead = true; cancelAnimationFrame(raf); removeEventListener('resize', onResize); stars = []; motes = []; orbs = []; sparks = []; hexs = []; conf = []; shocks = []; kp = []; if (gl) { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* */ } gl = null; } },
  };
}

/** Karussell „Das ist neu“: wechselt von selbst, pausiert beim Darüberfahren */
function upxNews(box, hl, version) {
  if (!hl.length) { box.hidden = true; return () => {}; }
  box.innerHTML = `<div class="box"><div class="hd">${ic('sparkle', 'i-sm')}<span>Das ist neu${version ? ' in ' + esc(version) : ''}</span><span class="dots">${hl.length > 1 ? hl.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('') : ''}</span></div><div class="st">${hl.map((h, i) => `<article class="c${i ? '' : ' on'}"><b>${esc(h.title)}</b>${h.text ? `<p>${esc(h.text)}</p>` : ''}</article>`).join('')}</div>${hl.length > 1 ? '<i class="bar"></i>' : ''}</div>`;
  const cards = $$('.c', box), dots = $$('.dots i', box), bar = $('.bar', box), ms = 6500;
  let i = 0, t = null;
  const run = () => { if (!bar) return; bar.classList.remove('run'); void bar.offsetWidth; bar.style.setProperty('--ns', ms + 'ms'); bar.classList.add('run'); };
  const show = n => {
    const j = (n + cards.length) % cards.length; if (j === i) return;
    const o = cards[i]; o.classList.remove('on'); o.classList.add('out'); setTimeout(() => o.classList.remove('out'), 750);
    dots[i]?.classList.remove('on'); i = j; cards[i].classList.add('on'); dots[i]?.classList.add('on'); run();
  };
  if (cards.length > 1) { run(); t = setInterval(() => { if (!box.querySelector('.box:hover') && !document.hidden) show(i + 1); }, ms); }
  return () => clearInterval(t);
}

function upxOpen(o = {}) {
  if (UPX_OPEN && UPX_OPEN.el.isConnected) UPX_OPEN.close(true);
  const mode = o.mode || 'real', welcome = mode === 'welcome', closable = mode === 'demo' || welcome;
  const hl = upxHighlights(o.notes, o.from, o.to), uid = 'ux' + Math.random().toString(36).slice(2, 7);
  const el = document.createElement('div');
  el.className = 'upx'; el.dataset.mode = mode; el.dataset.ph = welcome ? 'done' : 'prep';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', welcome ? 'Update installiert' : 'Update wird installiert'); el.tabIndex = -1;
  const ticks = Array.from({length: 90}, (_, i) => { const a = i / 90 * 6.2832 - 1.5708, r1 = 141, r2 = i % 5 ? 152 : 158; return `<line class="tk" style="--i:${i}" x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}" x2="${(Math.cos(a) * r2).toFixed(1)}" y2="${(Math.sin(a) * r2).toFixed(1)}"/>`; }).join('');
  const dg = (k, h) => `<span class="dg${h ? ' h' : ''}" data-dg="${k}"><i>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<b>${d}</b>`).join('')}</i></span>`;
  const K = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5v15"/><path d="M18 4.5 10.5 12 18 19.5"/></svg>';
  const stat = (k, l, d) => `<div class="s rv" style="--d:${d}" data-s="${k}"><small>${l}</small><b>–</b></div>`;
  el.innerHTML = `<canvas class="fxg" aria-hidden="true"></canvas><div class="upx-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="grid"></i><i class="vig"></i></div><canvas class="fxb" aria-hidden="true"></canvas>
    <header class="upx-top rv" style="--d:0"><div class="upx-brand"><span class="mk">${K}</span><b>Kontor</b><span class="tag">${welcome ? 'Neu' : 'Update'}</span></div>
      <div class="upx-ver">${o.from ? `<span class="fr">${esc(o.from)}</span>` : ''}${o.from && o.to ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M14 6.5 19.5 12 14 17.5"/></svg>` : ''}${o.to ? `<span class="to">${esc(o.to)}</span>` : ''}</div>
      <div class="upx-badge">${mode === 'demo' ? `<span class="demo">Vorschau – es wird nichts installiert</span>` : `${ic('shield', 'i-sm')}<span>Signiert &amp; geprüft</span>`}${closable ? `<button class="upx-x" data-upx="close" aria-label="Schließen">${ic('x')}</button>` : ''}</div></header>
    <main class="upx-main">
      <div class="upx-stage"><div class="upx-sway"><div class="upx-tilt"><div class="upx-ring" aria-hidden="true">
        <div class="upx-rays"></div>
        <svg class="upx-rg g1" viewBox="-180 -180 360 360"><circle r="172" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.2" stroke-dasharray="1.5 9" stroke-linecap="round"/></svg>
        <svg class="upx-rg g2" viewBox="-180 -180 360 360"><g fill="none" stroke-linecap="round" stroke-width="2"><path d="M0-178A178 178 0 0 1 154-89" style="stroke:var(--ub)"/><path d="M0 178A178 178 0 0 1-154 89" style="stroke:var(--uc)"/><path d="M-178 0A178 178 0 0 1-89-154" stroke="rgba(255,255,255,.4)"/></g></svg>
        <svg class="rs" viewBox="-180 -180 360 360"><defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ua)"/><stop offset=".55" style="stop-color:var(--ub)"/><stop offset="1" style="stop-color:var(--uc)"/></linearGradient></defs><g>${ticks}</g><circle class="trk" r="122"/><circle class="arc" r="122" pathLength="100" stroke="url(#${uid})" stroke-dasharray="0 100" transform="rotate(-90)"/></svg>
        <div class="upx-sweep"></div><div class="upx-orbit o1"><i></i></div><div class="upx-orbit o2"><i></i></div><div class="upx-orbit o3"><i></i></div><div class="upx-rip"><i></i><i></i><i></i></div><div class="upx-flare"></div>
        <div class="upx-core"><div class="gl">${Object.entries(UPX_GLYPH).map(([k, g]) => `<span class="g" data-g="${k}">${ic(g)}</span>`).join('')}<span class="g" data-g="done"><svg class="i ckb" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span></div>
          <div class="pct"><span class="num">${dg('2', 1)}${dg('1', 1)}${dg('0')}</span><em>%</em></div></div></div></div></div></div>
      <div class="upx-text rv" style="--d:250"><h1 id="${uid}t" aria-hidden="true"></h1><span class="sr" id="${uid}a" aria-live="polite"></span><p id="${uid}s"></p></div>
      ${welcome ? '' : `<div class="upx-stats">${stat('a', 'Sicherung', 380)}${stat('b', 'Paket', 460)}${stat('c', 'Dauer', 540)}</div>`}
      ${welcome ? '' : `<ol class="upx-rail rv" style="--d:620">${UPX_STEPS.map(([k, l, g]) => `<li data-k="${k}"><span class="n">${ic(g, 'st')}<svg class="i ck" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span><span class="l">${l}</span></li>`).join('')}</ol>`}
      ${welcome ? `<div class="upx-wn">${hl.map((h, i) => `<article class="c" style="--i:${i}"><b>${esc(h.title)}</b>${h.text ? `<p>${esc(h.text)}</p>` : ''}</article>`).join('') || '<p class="muted">Die Neuerungen finden Sie unter Einstellungen › Updates.</p>'}</div><div class="upx-act"><button class="upx-btn" data-upx="close">Los geht’s</button></div>` : ''}
    </main>
    ${welcome ? '<div></div>' : '<aside class="upx-news rv" style="--d:760"></aside>'}
    <footer class="upx-foot rv" style="--d:900">${welcome ? 'Eine Datensicherung vor dem Update liegt unter Einstellungen › Sicherung bereit.' : `${ic('lock', 'i-xs')}<span id="${uid}f">Bitte Kontor und den Rechner nicht ausschalten. Ihre Daten bleiben erhalten.</span>`}</footer>
    ${welcome ? '' : `<aside class="upx-log rv" style="--d:1000" aria-hidden="true"><div class="hd">Live-Protokoll</div><div class="ln"></div></aside>`}
    <canvas class="fxf" aria-hidden="true"></canvas><div class="upx-flash"></div><div class="upx-boot"></div>`;
  document.body.appendChild(el);
  const $t = $('#' + uid + 't', el), $a = $('#' + uid + 'a', el), $s = $('#' + uid + 's', el), arc = $('.arc', el), tk = $$('.tk', el), core = $('.upx-core', el), ringEl = $('.upx-ring', el), flare = $('.upx-flare', el), flash = $('.upx-flash', el), logEl = $('.upx-log .ln', el);
  const fx = upxFx(el, ringEl);
  const stopNews = welcome ? () => {} : upxNews($('.upx-news', el), hl, o.to);
  const T0 = performance.now();
  let ph = welcome ? 'done' : 'prep', errAt = '', want = ph, stepAt = T0, dlFullAt = 0, closed = false, total = 0, samples = [], speed = 0, lastStat = 0, pctNow = 0, tmr = null, mile = 0, tiltT = 0;
  const txt = (key, sub) => { const [a, b] = UPX_TXT[key] || ['', '']; return [a.replace('%v', o.to || ''), (sub != null ? sub : mode === 'demo' && key === 'done' ? 'So sieht ein Update aus. Das war eine Vorschau – es wurde nichts installiert.' : b).replace('%v', o.to || '')]; };
  const swap = (e, v) => { if (e.textContent === v) return; e.textContent = v; e.classList.remove('sw'); void e.offsetWidth; e.classList.add('sw'); };
  const dur = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` : `${s} s`; };
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const log = (msg, kind) => {
    if (!logEl) return;
    const r = document.createElement('div'); r.className = 'r ' + (kind || ''); r.innerHTML = `<time>${mmss(performance.now() - T0)}</time><span></span>`; $('span', r).textContent = msg;
    [...logEl.children].forEach(c => c.classList.remove('new')); r.classList.add('new'); logEl.appendChild(r); while (logEl.children.length > 9) logEl.firstChild.remove();
  };
  const setS = (k, label, val) => { const s = $(`[data-s="${k}"]`, el); if (!s) return; const b = $('b', s); if ($('small', s).textContent !== label) $('small', s).textContent = label; if (b.textContent !== val) b.textContent = val; };
  const stats = () => {
    if (welcome) return;
    const now = performance.now();
    if (ph === 'download') { setS('a', 'Tempo', speed > 0 ? `${num(speed / 1048576, 1)} MB/s` : '–'); setS('b', 'Geladen', total ? `${fmtBytes(Math.min(total, o.done || 0))} / ${fmtBytes(total)}` : fmtBytes(o.done || 0)); setS('c', 'Restzeit', speed > 0 && total ? `≈ ${dur((total - (o.done || 0)) / speed * 1000)}` : '–'); }
    else { setS('a', 'Sicherung', ph === 'error' ? (errAt === 'prep' ? '–' : errAt === 'backup' ? 'fehlgeschlagen' : '✓ angelegt') : ph === 'prep' ? '–' : ph === 'backup' ? 'läuft …' : mode === 'helper' ? '✓ vor dem Update' : '✓ angelegt'); setS('b', 'Paket', total ? fmtBytes(total) : '–'); setS('c', 'Dauer', dur(now - T0)); }
  };
  const setPct = (p, quick) => {
    p = Math.max(0, Math.min(100, Math.floor(p))); if (p === pctNow && !quick) return; pctNow = p;
    const d = [Math.floor(p / 100), Math.floor(p / 10) % 10, p % 10];
    $$('.dg', el).forEach((c, i) => { c.classList.toggle('on', i === 2 || (i === 1 && p >= 10) || (i === 0 && p >= 100)); $('i', c).style.transform = `translateY(${-d[i]}em)`; });
    arc.setAttribute('stroke-dasharray', `${p} 100`);
    const n = Math.round(p / 100 * tk.length); tk.forEach((t, i) => t.classList.toggle('on', i < n));
    fx.prog(p / 100);
  };
  const railIdx = p => ({backup: 0, download: 1, verify: 2, install: 3, restart: 4})[p] ?? -1;
  const retrig = (e, cls, ms) => { e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); setTimeout(() => e.classList.remove(cls), ms); };
  const LOGS = {
    backup: () => ['Datensicherung wird angelegt …'],
    download: () => ['✓ Datensicherung angelegt|ok', 'Verbindung zum Update-Server …'],
    verify: () => [`✓ Download vollständig${total ? ' · ' + fmtBytes(total) : ''}|ok`, 'Signatur wird geprüft …'],
    install: () => ['✓ Signatur gültig|ok', 'Installation wird ausgeführt …'],
    restart: () => ['✓ Installation abgeschlossen|ok', `Kontor ${o.to || ''} startet …`],
    done: () => [`✓ Fertig nach ${dur(performance.now() - T0)}|ok`],
  };
  const apply = p => {
    if (p === 'error') errAt = ph;
    ph = p; stepAt = performance.now(); el.dataset.ph = p;
    const foot = $('#' + uid + 'f', el); if (foot) foot.textContent = p === 'error' ? (mode === 'helper' ? 'Die bisherige Version wird gleich wieder gestartet. Ihre Daten sind unverändert.' : 'Es wurde nichts verändert – Kontor läuft mit der bisherigen Version weiter.') : 'Bitte Kontor und den Rechner nicht ausschalten. Ihre Daten bleiben erhalten.';
    const [a, b] = txt(p, p === 'error' ? o.err : undefined);
    upxDecode($t, a, p === 'prep' ? 900 : 650); $a.textContent = a; swap($s, b);
    $$('.g', core).forEach(g => g.classList.toggle('on', g.dataset.g === p));
    const idx = railIdx(p);
    $$('.upx-rail li', el).forEach((li, i) => { const done = p === 'done' || i < idx, act = i === idx; li.classList.toggle('done', done); li.classList.toggle('act', act && p !== 'error'); li.classList.toggle('bad', act && p === 'error'); });
    if (p === 'done') setPct(100);
    if (p !== 'prep') { fx.shock(p === 'done' ? 1.3 : p === 'error' ? .8 : 1); retrig(flare, 'on', 1200); retrig(ringEl, 'pn', 750); retrig(flash, 'on', 900); }
    fx.mode(p === 'download' ? 'stream' : p === 'verify' ? 'hex' : p === 'install' || p === 'restart' ? 'orbit' : p === 'done' ? 'burst' : p === 'error' ? 'none' : 'idle', {hue: p === 'done' ? 150 : p === 'error' ? 8 : undefined, rate: p === 'restart' ? 1.7 : p === 'download' ? .35 : .8, flow: p === 'done' ? 2.2 : p === 'restart' ? 2.6 : p === 'install' ? 1.8 : p === 'error' ? .5 : undefined});
    fx.assemble(p === 'install' || p === 'restart');
    el.classList.toggle('ka', p === 'install' || p === 'restart');
    if (p === 'done') { fx.burst(welcome ? 220 : 170); setTimeout(() => { if (!closed) { fx.shock(1.1); fx.burst(60); } }, 650); retrig(el, 'shk', 700); }
    if (p === 'error') { retrig(el, 'shk', 700); log('✕ ' + String(o.err || 'Fehler').slice(0, 60), 'bad'); }
    else if (LOGS[p]) LOGS[p]().forEach(m => { const [s, k] = m.split('|'); log(s, k); });
    if (p === 'download') mile = 0;
    stats();
  };
  const pump = () => {
    clearTimeout(tmr);
    if (closed || ph === want || ph === 'error') return;
    const now = performance.now();
    let wait = ph === 'download' ? (dlFullAt ? dlFullAt + 1100 - now : 250) : (UPX_DWELL[ph] || 0) - (now - stepAt);
    if (mode === 'helper') wait = ph === 'prep' ? 0 : Math.min(wait, 500);
    if (wait > 20) { tmr = setTimeout(pump, wait); return; }
    apply(UPX_ORDER[UPX_ORDER.indexOf(ph) + 1]);
    if (ph !== want) tmr = setTimeout(pump, 30);
  };
  const api = {
    el, mode,
    /** weiter zur Phase p (nie zurück; jede Zwischenphase wird kurz gezeigt) */
    go(p) {
      if (closed) return; if (p === 'error') return api.fail(o.err || '');
      const i = UPX_ORDER.indexOf(p); if (i < 0 || i <= UPX_ORDER.indexOf(want)) return;
      if (i > UPX_ORDER.indexOf('download') && !dlFullAt) { dlFullAt = performance.now(); setPct(100); }
      want = p; pump();
    },
    /** sofort an Phase p (ohne die Zwischenschritte abzuwarten) – für den Hilfsprozess, der mitten im Ablauf einsetzt */
    jump(p) { const i = UPX_ORDER.indexOf(p); if (closed || i < 0) return; setPct(100, true); dlFullAt = performance.now() - 5000; for (let k = UPX_ORDER.indexOf(ph) + 1; k <= i; k++) apply(UPX_ORDER[k]); want = p; },
    progress(done, tot) {
      if (closed) return; const now = performance.now();
      o.done = done; if (tot) total = tot;
      const pc = tot ? Math.min(100, done / tot * 100) : 0; setPct(pc);
      samples.push([now, done]); while (samples.length > 2 && now - samples[0][0] > 2500) samples.shift();
      if (samples.length > 1) { const [t0, d0] = samples[0], v = (done - d0) / ((now - t0) / 1000); speed = speed ? speed * .7 + v * .3 : v; fx.rate(Math.max(.25, Math.min(1.5, speed / 12e6))); }
      if (tot && done >= tot && !dlFullAt) dlFullAt = now;
      if (ph === 'download' && pc >= (mile + 1) * 25 && mile < 4) { mile = Math.floor(pc / 25); if (pc < 100) log(`Download ${Math.round(pc)} % · ${fmtBytes(done)}${speed > 0 ? ' · ' + num(speed / 1048576, 1) + ' MB/s' : ''}`); }
      if (now - lastStat > 250 || (tot && done >= tot)) { lastStat = now; stats(); }
    },
    done() { if (closed) return; want = 'done'; if (ph !== 'done' && ph !== 'error') { if (!dlFullAt) { dlFullAt = performance.now(); setPct(100); } apply('done'); } },
    fail(msg) { if (closed) return; o.err = msg || 'Unbekannter Fehler'; apply('error'); $s.textContent = o.err; if (mode !== 'helper') { $('.upx-act', el)?.remove(); $('.upx-main', el).insertAdjacentHTML('beforeend', `<div class="upx-act"><button class="upx-btn" data-upx="close">Schließen</button></div>`); $('[data-upx="close"].upx-btn', el)?.focus(); } },
    close(quick) {
      if (closed) return; closed = true; clearTimeout(tmr); stopNews(); clearInterval(clock); fx.stop();
      document.removeEventListener('keydown', onKey, true); removeEventListener('pointermove', onMove); if (UPX_OPEN === api) UPX_OPEN = null;
      if (quick) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 560); }
      o.onClose && o.onClose();
    },
  };
  const onKey = e => {
    if (e.key === 'Escape' && (closable || ph === 'error') && mode !== 'helper') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
    if (!closable) e.stopPropagation();   // während der Installation keine Eingaben an die Kasse durchlassen (z. B. Scanner)
  };
  const onMove = e => { const n = performance.now(); if (n - tiltT < 24) return; tiltT = n; el.style.setProperty('--px', (e.clientX / innerWidth * 2 - 1).toFixed(3)); el.style.setProperty('--py', (e.clientY / innerHeight * 2 - 1).toFixed(3)); };
  document.addEventListener('keydown', onKey, true); addEventListener('pointermove', onMove, {passive: true});
  el.addEventListener('click', e => { if (e.target.closest('[data-upx="close"]')) api.close(); });
  const clock = setInterval(() => { if (ph !== 'download' && ph !== 'done' && ph !== 'error') stats(); }, 1000);
  if (welcome) { setPct(100, true); apply('done'); swap($s, o.from ? `Aktualisiert von Version ${o.from} – das ist neu:` : 'Das ist neu:'); upxDecode($t, `Willkommen in Kontor ${o.to || ''}`, 900); $a.textContent = `Willkommen in Kontor ${o.to || ''}`; }
  else { setPct(0, true); apply('prep'); }
  el.focus({preventScroll: true});
  UPX_OPEN = api;
  return api;
}

/** Vorschau (Einstellungen › Updates): derselbe Ablauf mit simulierten Daten */
function upxDemo() {
  const cur = S.appVersion, p = cur.split('.').map(Number), to = `${p[0]}.${p[1]}.${(p[2] || 0) + 1}`;
  const notes = `## Neu in ${to}\n\n- **Eigener Update-Installer.** Das Update läuft jetzt in einer eigenen Ansicht im Kontor-Design – mit Fortschritt, Geschwindigkeit und Restzeit.\n- **Sicherung vor jedem Update.** Kontor legt automatisch eine Datensicherung an, bevor etwas installiert wird.\n- **Geprüft und signiert.** Nur Pakete mit gültiger Kontor-Signatur werden installiert.\n- **Willkommensseite.** Nach dem Neustart sehen Sie auf einen Blick, was neu ist.`;
  const ux = upxOpen({mode: 'demo', from: cur, to, notes});
  const total = 96.4 * 1048576, ids = [];
  const at = (ms, f) => ids.push(setTimeout(() => !ux.el.isConnected || f(), ms));
  const R = reduced() ? .3 : 1;
  at(1500 * R, () => ux.go('backup'));
  at(4000 * R, () => {
    ux.go('download'); let done = 0, t = 0;
    const iv = setInterval(() => {
      if (!ux.el.isConnected) return clearInterval(iv);
      t += 60; done = Math.min(total, done + (9 + 7 * Math.sin(t / 700) + 3 * Math.sin(t / 190)) * 1048576 * .1 * (reduced() ? 8 : 1));
      ux.progress(done, total);
      if (done >= total) { clearInterval(iv); ux.go('verify'); at(3200 * R, () => ux.go('install')); at(8200 * R, () => ux.go('restart')); at(11200 * R, () => ux.done()); }
    }, 60);
    ids.push(iv);
  });
  return ux;
}

/** Nach dem ersten Start der neuen Version: „Willkommen“ mit den Neuerungen */
async function upxMaybeWelcome() {
  const r = CFG['update.erledigt'];
  if (!r || !r.to || UPX_WELCOME_SHOWN) return;
  UPX_WELCOME_SHOWN = true;
  await saveSettings({'update.erledigt': null}, true);
  if (String(r.to) !== String(S.appVersion)) { toast('Update nicht abgeschlossen', {t2: `Kontor läuft weiter mit Version ${S.appVersion} – das Update auf ${r.to} wurde nicht installiert.`, type: 'warn', icon: 'alert', dur: 9000}); return; }
  Hooks.emit('update.installed', {version: r.to, von: r.from});
  upxOpen({mode: 'welcome', from: r.from, to: r.to, notes: r.notes});
}
if (typeof Hooks !== 'undefined') Hooks.on('auth.login', () => { if (DESKTOP && !window.__KONTOR_UPDATER__) setTimeout(upxMaybeWelcome, 900); });

/** Fenster des Hilfsprozesses (Windows): zeigt die Installation, solange der Installer das Programm austauscht */
async function runUpdaterWindow() {
  const inv = window.__TAURI__.core.invoke;
  document.documentElement.dataset.theme = 'dark';
  [...document.body.children].forEach(c => { if (c.tagName !== 'SCRIPT' && !c.querySelector('symbol')) c.remove(); });   // die Symbole (SVG-Sammlung) bleiben
  let ux = null, last = '';
  const tick = async () => {
    let s; try { s = await inv('helper_state'); } catch { return; }
    if (!ux) {
      ux = upxOpen({mode: 'helper', from: s.from, to: s.to, notes: s.notes});
      ux.jump('install');
      setTimeout(() => inv('helper_ready').catch(() => {}), 250);
    }
    if (s.phase === last) return; last = s.phase;
    if (s.phase === 'restart') ux.go('restart');
    else if (s.phase === 'close') ux.done();
    else if (s.phase === 'error') ux.fail(s.error);
  };
  await tick();
  setInterval(tick, 150);
}
if (window.KONTOR_UI) Object.assign(window.KONTOR_UI, {upxOpen, upxDemo, upxHighlights, upxWelcomeTest: (r) => upxOpen({mode: 'welcome', from: r.from, to: r.to, notes: r.notes})});   // für Prüfungen
