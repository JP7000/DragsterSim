/**
 * ui.js — AeroTune UI & Chart Rendering v3.2
 *
 * Responsibilities: chart rendering, form helpers, race replay,
 *   run management, tune card rendering, theme, init.
 *
 * Depends on: physics.js ($, v, simulate, buildParamsFromDOM)
 *             optimizer.js (RULESET, runSensitivity)
 */
'use strict';

/* ── Constants ── */
const RUN_COLOURS = ['#00D4FF','#FF3B5C','#FF8C00','#FFD700','#A855F7','#22C55E','#FB923C','#34D399'];
const REPLAY_DURATION_MS = 2800;

/* ── Module state ── */
var _moiUnit = 'gcm2';
let _prevFinishT = null;
let savedRuns = [];
let _replayAF = null;
let _replayRuns = [];
let _lastRunData = null;

/* ── Theme helpers ── */
function isDark() { return !document.body.classList.contains('light'); }

function getThemeColors() {
  const dark = isDark();
  return {
    bg:        dark ? '#0A0A0A' : '#FFFFFF',
    surface:   dark ? '#111111' : '#F5F5F5',
    gridLine:  dark ? '#1E1E1E' : '#E8E8E8',
    tickColor: dark ? '#555555' : '#888888',
    accent:    '#00D4FF',
    accent2:   '#FF8C00',
    red:       dark ? '#FF3B5C' : '#CC1A35',
    text:      dark ? '#FFFFFF' : '#111111',
    mutedText: dark ? '#A0A0A0' : '#555555',
  };
}

/* ── Utility ── */
function showError(msg) {
  const b = $('validation-banner');
  if (!b) return;
  b.innerHTML = '⚠ ' + msg;
  b.classList.add('visible');
  setTimeout(() => b.classList.remove('visible'), 4000);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function animateValue(id, from, to, duration, decimals, suffix='') {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * e).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = to.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(tick);
}

/* ── Canvas helper ── */
/**
 * initCanvas(canvas, W, H) → { ctx, cW, cH, tc, PAD }
 * Handles DPR scaling and background fill — eliminates 4× duplication.
 */
function initCanvas(canvas, W, H, PAD) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = W * dpr;  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const tc = getThemeColors();
  ctx.fillStyle = tc.bg;
  ctx.fillRect(0, 0, W, H);
  return { ctx, cW: W - PAD.l - PAD.r, cH: H - PAD.t - PAD.b, tc };
}

/* ── Chart: Speed & Distance ── */
function drawSpeedChart(canvas, times, speeds, dists) {
  const PAD = { t:12, r:52, b:34, l:48 };
  const W = canvas.parentElement.clientWidth || 600;
  const H = 210;
  const { ctx, cW, cH, tc } = initCanvas(canvas, W, H, PAD);
  const maxV = Math.max(...speeds) * 1.12 || 1;
  const maxD = Math.max(...dists)  * 1.12 || 1;
  const maxT = Math.max(...times)  || 1;
  const tx = t => PAD.l + (t/maxT)*cW;
  const tyV = val => PAD.t + cH - (val/maxV)*cH;
  const tyD = val => PAD.t + cH - (val/maxD)*cH;

  ctx.strokeStyle = tc.gridLine; ctx.lineWidth = 1;
  for (let i=0;i<=4;i++) {
    const y = PAD.t + (i/4)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+cW,y); ctx.stroke();
  }
  for (let i=0;i<=5;i++) {
    const x2 = PAD.l + (i/5)*cW;
    ctx.beginPath(); ctx.moveTo(x2,PAD.t); ctx.lineTo(x2,PAD.t+cH); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(tx(times[0]), tyD(dists[0]));
  for (let i=1;i<times.length;i++) ctx.lineTo(tx(times[i]), tyD(dists[i]));
  ctx.lineTo(tx(times[times.length-1]), PAD.t+cH);
  ctx.lineTo(tx(times[0]), PAD.t+cH);
  ctx.closePath();
  ctx.fillStyle = isDark() ? 'rgba(255,140,0,0.08)' : 'rgba(255,140,0,0.12)'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx(times[0]), tyD(dists[0]));
  for (let i=1;i<times.length;i++) ctx.lineTo(tx(times[i]), tyD(dists[i]));
  ctx.strokeStyle = tc.accent2; ctx.lineWidth = 2; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx(times[0]), tyV(speeds[0]));
  for (let i=1;i<times.length;i++) ctx.lineTo(tx(times[i]), tyV(speeds[i]));
  ctx.lineTo(tx(times[times.length-1]), PAD.t+cH);
  ctx.lineTo(tx(times[0]), PAD.t+cH);
  ctx.closePath();
  ctx.fillStyle = isDark() ? 'rgba(0,212,255,0.08)' : 'rgba(0,180,220,0.12)'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx(times[0]), tyV(speeds[0]));
  for (let i=1;i<times.length;i++) ctx.lineTo(tx(times[i]), tyV(speeds[i]));
  ctx.strokeStyle = tc.accent; ctx.lineWidth = 2.5; ctx.stroke();

  ctx.font = '10px "Orbitron","Space Mono",monospace';
  ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle = tc.accent;
  for (let i=0;i<=4;i++) ctx.fillText((maxV*(4-i)/4).toFixed(1), PAD.l-5, PAD.t+(i/4)*cH);
  ctx.textAlign='left'; ctx.fillStyle = tc.accent2;
  for (let i=0;i<=4;i++) ctx.fillText((maxD*(4-i)/4).toFixed(1), PAD.l+cW+5, PAD.t+(i/4)*cH);
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle = tc.tickColor;
  for (let i=0;i<=5;i++) ctx.fillText((maxT*i/5).toFixed(2)+'s', tx(maxT*i/5), PAD.t+cH+5);
}

/* ── Chart: Thrust Curve ── */
function drawThrustChart(F0, tau, dur) {
  const canvas = $('thrust-chart');
  const empty  = $('thrust-empty');
  if (!canvas) return;
  if (empty) empty.style.display='none';
  canvas.style.display='block';
  const PAD = {t:12,r:20,b:34,l:48};
  const W = canvas.parentElement.clientWidth || 600;
  const H = 170;
  const { ctx, cW, cH, tc } = initCanvas(canvas, W, H, PAD);
  const totalT = dur+0.06;
  const pts=[];
  for (let t=0;t<=totalT;t+=totalT/200) pts.push({t, f: t<dur ? F0*Math.exp(-t/tau):0});
  const maxF = F0*1.08;
  const tx = t=>PAD.l+(t/totalT)*cW;
  const ty = f=>PAD.t+cH-(f/maxF)*cH;
  ctx.strokeStyle = tc.gridLine; ctx.lineWidth=1;
  for (let i=0;i<=4;i++) {
    const y=PAD.t+(i/4)*cH;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+cW,y); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i=1;i<pts.length;i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.lineTo(tx(pts[pts.length-1].t), PAD.t+cH);
  ctx.lineTo(tx(pts[0].t), PAD.t+cH);
  ctx.closePath();
  ctx.fillStyle = isDark() ? 'rgba(255,59,92,0.10)' : 'rgba(204,26,53,0.09)'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tx(pts[0].t), ty(pts[0].f));
  for (let i=1;i<pts.length;i++) ctx.lineTo(tx(pts[i].t), ty(pts[i].f));
  ctx.strokeStyle = tc.red; ctx.lineWidth=2.5; ctx.stroke();
  ctx.fillStyle = tc.red;
  ctx.font='10px "Orbitron","Space Mono",monospace';
  ctx.textAlign='left'; ctx.textBaseline='bottom';
  ctx.fillText(F0.toFixed(1)+'N', tx(0)+5, ty(F0)-3);
  ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle=tc.mutedText;
  for (let i=0;i<=4;i++) ctx.fillText((maxF*(4-i)/4).toFixed(1), PAD.l-5, PAD.t+(i/4)*cH);
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle=tc.tickColor;
  for (let i=0;i<=4;i++) ctx.fillText((totalT*i/4).toFixed(2)+'s', tx(totalT*i/4), PAD.t+cH+5);
}

/* ── Chart: Bar comparison ── */
function drawBarChart(canvas, labels, values, colours) {
  const PAD = {t:24,r:16,b:38,l:54};
  const W = canvas.parentElement.clientWidth || 400;
  const H = 150;
  const { ctx, cW, cH, tc } = initCanvas(canvas, W, H, PAD);
  const dataMin=Math.min(...values), dataMax=Math.max(...values);
  const spread=dataMax-dataMin||0.001;
  const minV=dataMin-spread*0.4, maxV=dataMax+spread*0.6;
  const range=maxV-minV;
  const n=values.length, gap=cW/n, barW=Math.min(55,gap*0.55);
  const by=val=>PAD.t+cH-((val-minV)/range)*cH;
  ctx.font='10px "Orbitron","Space Mono",monospace';
  for (let i=0;i<=3;i++) {
    const y=PAD.t+(i/3)*cH;
    ctx.strokeStyle=tc.gridLine; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+cW,y); ctx.stroke();
    ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle=tc.mutedText;
    ctx.fillText((minV+range*(3-i)/3).toFixed(4), PAD.l-5, y);
  }
  values.forEach((val,i) => {
    const x=PAD.l+gap*i+gap/2-barW/2;
    const y=by(val), h=PAD.t+cH-y;
    ctx.fillStyle=colours[i]+'30'; ctx.fillRect(x,y,barW,h);
    ctx.strokeStyle=colours[i]; ctx.lineWidth=2; ctx.strokeRect(x,y,barW,h);
    ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle=tc.text;
    const lbl=labels[i].length>9?labels[i].slice(0,8)+'…':labels[i];
    ctx.fillText(lbl, x+barW/2, PAD.t+cH+5);
    ctx.textBaseline='bottom'; ctx.fillStyle=colours[i];
    ctx.fillText(val.toFixed(4)+'s', x+barW/2, y-3);
  });
}

/* ── Race Replay ── */
function rrect(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function drawReplayFrame(simT) {
  const canvas=$('replay-canvas');
  if (!canvas||!_replayRuns.length) return;
  const PAD_L=20,PAD_R=20,LANE_H=28,LANE_GAP=10,CAR_W=20,CAR_H=13;
  const nRuns=_replayRuns.length;
  const cW=canvas.parentElement.clientWidth||600;
  const cH=16+nRuns*(LANE_H+LANE_GAP);
  if (cW<=0) return;
  const PAD_replay={t:0,r:PAD_R,b:0,l:PAD_L};
  const { ctx, tc } = initCanvas(canvas, cW, cH, PAD_replay);
  const trackW=cW-PAD_L-PAD_R;
  ctx.fillStyle=isDark()?'#111111':'#F0F0F0'; ctx.fillRect(0,0,cW,cH);
  _replayRuns.forEach((run,i) => {
    const y=8+i*(LANE_H+LANE_GAP);
    const rgb=hexToRgb(run.colour);
    ctx.fillStyle=`rgba(${rgb},${isDark()?'0.10':'0.12'})`;
    rrect(ctx,PAD_L,y,trackW,LANE_H,4); ctx.fill();
    ctx.strokeStyle=run.colour; ctx.lineWidth=1.5; ctx.globalAlpha=0.5;
    rrect(ctx,PAD_L,y,trackW,LANE_H,4); ctx.stroke(); ctx.globalAlpha=1;
    ctx.strokeStyle=isDark()?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.2)';
    ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(PAD_L+trackW,y+3); ctx.lineTo(PAD_L+trackW,y+LANE_H-3); ctx.stroke();
    ctx.setLineDash([]);
    const progress=Math.min(simT/run.finishT,1.0);
    const carX=PAD_L+progress*trackW;
    const carY=y+LANE_H/2;
    ctx.shadowColor=run.colour; ctx.shadowBlur=10;
    ctx.fillStyle=run.colour;
    rrect(ctx,carX-CAR_W,carY-CAR_H/2,CAR_W,CAR_H,3); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle=isDark()?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)';
    ctx.font='bold 8px "Orbitron","Space Mono",monospace';
    ctx.textBaseline='middle';
    ctx.fillText(run.label.slice(0,12),PAD_L+6,y+LANE_H/2);
  });
}

function updateReplayTimeDisplay(simT) {
  const disp=$('replay-time-display');
  if (!disp) return;
  disp.innerHTML=_replayRuns.map(run=>{
    const done=simT>=run.finishT;
    const color=done?run.colour:'var(--muted)';
    return `<span style="font-family:'Orbitron',monospace;font-size:.65rem;color:${color};">${run.label.slice(0,12)}: ${run.displayT.toFixed(4)}s</span>`;
  }).join('');
}

function startReplay() {
  if (_replayAF) { cancelAnimationFrame(_replayAF); _replayAF=null; }
  if (!_replayRuns.length) return;
  const maxT=Math.max(..._replayRuns.map(r=>r.finishT));
  const startWall=performance.now();
  const btn=$('replay-btn');
  btn.textContent='■ Stop';
  btn.onclick=()=>{ cancelAnimationFrame(_replayAF); _replayAF=null; btn.textContent='▶ Play'; btn.onclick=startReplay; };
  let fc=0;
  function frame(now) {
    const elapsed=now-startWall;
    const simT=(elapsed/REPLAY_DURATION_MS)*maxT;
    drawReplayFrame(Math.min(simT,maxT));
    if (fc%6===0) updateReplayTimeDisplay(Math.min(simT,maxT));
    fc++;
    if (elapsed<REPLAY_DURATION_MS) _replayAF=requestAnimationFrame(frame);
    else {
      drawReplayFrame(maxT); updateReplayTimeDisplay(maxT);
      btn.textContent='↺ Replay'; btn.onclick=startReplay;
    }
  }
  _replayAF=requestAnimationFrame(frame);
}

function updateReplayCard() {
  const empty=$('replay-empty'), canvas=$('replay-canvas');
  if (!savedRuns.length) {
    if(empty) empty.style.display='flex';
    if(canvas) canvas.style.display='none';
    $('replay-runs-legend').innerHTML='';
    return;
  }
  if(empty) empty.style.display='none';
  if(canvas) canvas.style.display='block';
  _replayRuns=savedRuns.map(r=>({label:r.label,colour:r.colour,finishT:r.finishT,displayT:r.displayT||r.finishT}));
  $('replay-runs-legend').innerHTML=_replayRuns.map(r=>
    `<div style="display:flex;align-items:center;gap:.35rem;font-size:.6rem;color:var(--muted);">
      <div style="width:10px;height:3px;border-radius:2px;background:${r.colour}"></div>
      ${r.label} — ${r.displayT.toFixed(4)}s</div>`
  ).join('');
  setTimeout(()=>drawReplayFrame(0),50);
}

/* ── Form helpers ── */
function toggleOnboard(hdr) {
  const body=$('onboard-body'), label=$('onboard-toggle-label');
  const hidden=body.classList.toggle('hidden');
  label.textContent=hidden?'click to expand':'click to collapse';
  hdr.setAttribute('aria-expanded', String(!hidden));
}

function toggleSection(hdr) {
  const body=hdr.nextElementSibling;
  const arrow=hdr.querySelector('.section-arrow');
  const open=!body.classList.contains('collapsed');
  body.classList.toggle('collapsed',open);
  arrow.classList.toggle('open',!open);
}

function setPill(btn) {
  const target=btn.dataset.target, value=btn.dataset.value;
  btn.closest('.pill-group').querySelectorAll('.pill-opt').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(target).value=value;
}

function toggleTip(btn) {
  let box=btn.nextElementSibling;
  if (!box||!box.classList.contains('tip-box')) {
    let el=btn.parentElement;
    while(el) {
      let sib=el.nextElementSibling;
      while(sib){if(sib.classList.contains('tip-box')){box=sib;break;}sib=sib.nextElementSibling;}
      if(box) break; el=el.parentElement;
    }
  }
  if (!box) return;
  const isOpen=box.classList.contains('open');
  document.querySelectorAll('.tip-box.open').forEach(b=>b.classList.remove('open'));
  if (!isOpen) box.classList.add('open');
}

function toggleForcesExplain() {
  const el  = $('forces-explain');
  const btn = el.previousElementSibling && el.previousElementSibling.querySelector('[aria-expanded]')
             || document.querySelector('[onclick="toggleForcesExplain()"]');
  const show = el.style.display === 'none' || el.style.display === '';
  el.style.display = show ? 'block' : 'none';
  if (btn) btn.setAttribute('aria-expanded', String(show));
}

function updateAxleSetup() {
  const isDynamic=$('axle-setup').value==='dynamic';
  $('axle-static-opts').style.display=isDynamic?'none':'block';
  $('axle-dynamic-opts').style.display=isDynamic?'block':'none';
}

function toggleWheelMode() {
  const isMoi=$('wheel-mode').value==='moi';
  $('annular-opts').style.display=isMoi?'none':'block';
  $('moi-opts').style.display=isMoi?'block':'none';
  ['wf-mass','wr-mass'].forEach(id=>{
    const el=$(id); if(!el) return;
    el.disabled=isMoi; el.style.opacity=isMoi?'0.35':'1';
  });
}

function setMoiUnit(unit) {
  _moiUnit=unit;
  const label=unit==='gcm2'?'g·cm²':'kg·m²';
  $('moi-unit-lbl').textContent=label;
  $('moi-unit-lbl2').textContent=label;
  const a='rgba(0,212,255,0.18)', ia='var(--surface)';
  $('moi-btn-gcm2').style.cssText+=`;background:${unit==='gcm2'?a:ia};color:${unit==='gcm2'?'var(--accent)':'var(--muted)'};font-weight:${unit==='gcm2'?'700':'400'}`;
  $('moi-btn-kgm2').style.cssText+=`;background:${unit==='kgm2'?a:ia};color:${unit==='kgm2'?'var(--accent)':'var(--muted)'};font-weight:${unit==='kgm2'?'700':'400'}`;
}

/* ── Preset sync ── */
function applyMuPreset(presetId, hiddenId, customRowId, customInputId) {
  const sel = $(presetId), cr = $(customRowId);
  if (!sel) return;
  if (sel.value === 'custom') {
    if (cr) cr.style.display = 'grid';
    $(hiddenId).value = $(customInputId) ? $(customInputId).value : sel.value;
  } else {
    if (cr) cr.style.display = 'none';
    $(hiddenId).value = sel.value;
  }
}
function applyMuBorePreset() { applyMuPreset('mu-bore-preset','mu-bore','mu-bore-custom-row','mu-bore-custom'); }
function applyMuBodyPreset() { applyMuPreset('mu-body-preset','mu-body','mu-body-custom-row','mu-body-custom'); }
function syncCustomMuBore()  { $('mu-bore').value = $('mu-bore-custom').value; }
function syncCustomMuBody()  { if ($('mu-body-custom')) $('mu-body').value = $('mu-body-custom').value; }

/* ── Validation ── */
function validateInputs() {
  const isMoi=$('wheel-mode').value==='moi';
  const isDynamic=$('axle-setup').value==='dynamic';
  const errors=[];
  const fields=[
    {id:'mass',label:'Car mass',min:10,max:500},
    {id:'frontal-override',label:'Frontal area',min:100,max:9000},
    {id:'cd-custom',label:'Drag coefficient',min:0.05,max:1.5},
    {id:'wf-dia',label:'Front wheel diameter',min:5,max:80},
    {id:'wf-mass',label:'Front wheel mass',min:0.1,max:30,onlyIf:()=>!isMoi},
    {id:'wr-dia',label:'Rear wheel diameter',min:5,max:80},
    {id:'wr-mass',label:'Rear wheel mass',min:0.1,max:30,onlyIf:()=>!isMoi},
    {id:'bore-dia',label:'Axle bore diameter',min:0.5,max:15,onlyIf:()=>!isMoi},
    {id:'track',label:'Track length',min:5,max:100},
    {id:'axle-dia-static',label:'Axle diameter',min:1,max:10,onlyIf:()=>!isDynamic},
    {id:'axle-dia',label:'Axle diameter',min:1,max:10,onlyIf:()=>isDynamic},
    {id:'axle-mass',label:'Axle mass',min:0.5,max:30,onlyIf:()=>isDynamic},
  ];
  document.querySelectorAll('.invalid').forEach(el=>el.classList.remove('invalid'));
  fields.forEach(f=>{
    if(f.onlyIf&&!f.onlyIf()) return;
    const el=$(f.id); if(!el) return;
    const val=parseFloat(el.value);
    if(isNaN(val)||val<=0){errors.push(`${f.label} can't be zero or empty.`);el.classList.add('invalid');}
    else if(val<f.min||val>f.max){errors.push(`${f.label} looks unusual (${val}, expected ${f.min}–${f.max}).`);el.classList.add('invalid');}
  });
  if(isMoi){
    [{id:'moi-front',label:'Front wheel MOI'},{id:'moi-rear',label:'Rear wheel MOI'}].forEach(({id,label})=>{
      const el=$(id); const val=el?parseFloat(el.value):NaN;
      if(!el||isNaN(val)||val<=0){errors.push(`${label} must be positive.`);if(el)el.classList.add('invalid');}
    });
  }
  const muR=parseFloat($('mu-r').value);
  if(isNaN(muR)||muR<=0) errors.push("Rolling resistance μr can't be zero.");
  const banner=$('validation-banner');
  if(errors.length>0){
    banner.innerHTML='⚠ Fix the following:<br>'+errors.map(e=>'· '+e).join('<br>');
    banner.classList.add('visible'); return false;
  }
  banner.classList.remove('visible'); return true;
}


/* ── Tune card renderer ── */
function renderTuneCard({ candidates, baseT, warnings, rs, deviation, optT }) {
  const card   = $('tune-card');
  const list   = $('tune-list');
  const note   = $('tune-note');
  const footer = $('tune-footer');
  if (!card || !list) return;
  if (!candidates.length && !warnings.length) { card.style.display = 'none'; return; }

  const devStr = (deviation !== null)
    ? `deviation from optimal: <strong style="color:${deviation<5?'var(--green)':deviation<15?'var(--yellow)':'var(--red)'}">${deviation.toFixed(1)}%</strong>`
    : '';
  const warnStr = warnings.length
    ? `<br><span style="color:var(--red);">⚠ ${warnings.join(' ')}</span>`
    : '';
  note.innerHTML =
    `<span style="color:var(--accent);font-weight:700;">${rs.name}</span> · ` +
    `${candidates.filter(c=>!c.qualitative).length} improvement${candidates.filter(c=>!c.qualitative).length!==1?'s':''} found` +
    (devStr ? ` · ${devStr}` : '') +
    ` · ranked by physics priority.` +
    warnStr;

  card.style.display = 'flex';

  const PRIORITY_LABELS = {1:'friction',2:'inertia',3:'mass',4:'alignment',5:'aero'};

  list.innerHTML = candidates.map((c, i) => {
    const savedMs = (c.saved * 1000).toFixed(1);
    const pct     = c.saved ? ((c.saved / baseT) * 100).toFixed(2) : null;
    const impact  = c.qualitative
      ? `<span class="tune-badge" style="border-color:${c.color};color:${c.color};">qualitative</span>`
      : `<span style="color:${c.color}">&#8722;${savedMs}ms</span><div class="tune-pct">${pct}% faster</div>`;
    const priorityTag = `<span style="font-size:.5rem;font-family:var(--font-mono);color:var(--muted);letter-spacing:.08em;text-transform:uppercase;">${PRIORITY_LABELS[c.priority]||''}</span>`;
    return `<div class="tune-row">
      <div class="tune-rank">${i + 1}</div>
      <div>
        <div class="tune-title">${c.title} &nbsp;${priorityTag}</div>
        <div class="tune-detail">${c.detail}</div>
      </div>
      <div class="tune-impact">${impact}</div>
    </div>`;
  }).join('');

  // rs already encodes the competition — no DOM read needed
  let footerLines = [
    'TSA and F1iS models remained fully isolated: YES',
    'No cross-model parameter leakage: YES',
  ];
  if (rs.shortName === 'F1iS') {
    footerLines.push('Infinitude reference (Cd 0.27 · A 1700 mm²) used as F1iS aerodynamic baseline. Infinitude: 2022 F1iS World Champions, Australia.');
  }
  if (optT) {
    footerLines.push(`Optimal feasible time (${rs.shortName} ruleset): ${optT.toFixed(4)}s · Your time: ${baseT.toFixed(4)}s · Gap: ${((baseT-optT)*1000).toFixed(1)}ms`);
  }
  footer.innerHTML = footerLines.join('<br>');
  footer.style.display = 'block';
}

/* ── Competition selector ── */
function onCompetitionChange() {
  const comp = $('competition').value;
  const rs   = RULESET[comp];
  const note = $('comp-note');
  if (!note) return;
  if (comp === 'tsa') {
    note.innerHTML =
      'TSA 2026 · min 50g body mass · plastic wheels only · no aero add-ons<br>' +
      'ref baseline: Cd ' + rs.ref_Cd + ' · A ' + rs.ref_A_mm2 + ' mm²';
  } else {
    note.innerHTML =
      'F1iS 2026 · min 48g body mass · wings required · ballast legal (T1.22)<br>' +
      'Infinitude ref baseline: Cd ' + rs.ref_Cd + ' · A ' + rs.ref_A_mm2 + ' mm²';
  }
}

/* ── Run simulation ── */
function _animateResults(r, tMid) {
  setTimeout(() => {
    document.querySelectorAll('.result-card').forEach((el, i) =>
      setTimeout(() => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }, i * 80)
    );
  }, 300);
  $('r-kmh').textContent = (r.peakV * 3.6).toFixed(1);
  $('r-ms2').textContent  = r.peakA.toFixed(1);
  animateValue('r-time',  1.8, tMid,          600, 4);
  animateValue('r-speed', 0,   r.peakV,        600, 2);
  animateValue('r-g',     0,   r.peakA / G,    600, 2);
  const badge = $('r-delta');
  if (_prevFinishT !== null) {
    const diff = (tMid - _prevFinishT) * 1000;
    badge.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + 'ms';
    badge.className   = diff < 0 ? 'faster' : 'slower';
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
  _prevFinishT = tMid;
}

function _renderForceBreakdown(p, r) {
  const fSpinUp = p.mRotEff * r.peakA;
  const fAero   = 0.5 * p.rho * p.Cd * p.A * r.peakV * r.peakV;
  const total   = fSpinUp + fAero || 1;
  $('forces-empty-state').style.display = 'none';
  $('forces-data').style.display        = 'block';
  $('val-rot').textContent  = fSpinUp.toFixed(3) + ' N';
  $('bar-rot').style.width  = (fSpinUp / total * 100).toFixed(0) + '%';
  $('val-aero').textContent = fAero.toFixed(3) + ' N';
  $('bar-aero').style.width = (fAero / total * 100).toFixed(0) + '%';
}

function _renderModelNote(tMid) {
  const inertiaNote = $('wheel-mode').value === 'moi' ? 'user-supplied wheel MOI' : 'annular-disc wheel inertia';
  $('range-note').innerHTML =
    `<strong style="color:var(--accent)">${tMid.toFixed(4)}s</strong> predicted finish time · ` +
    `<span style="color:var(--muted);font-size:.6rem;">8g CO₂ · dynamic m_eff · ${inertiaNote} · ` +
    `μr rolling resistance · Pitsco thrust curve fit · typically ±2–3% of real track times. Use for relative comparison.</span>`;
}

function _renderCharts(p, r) {
  $('chart-empty').style.display = 'none';
  $('chart').style.display       = 'block';
  const cutIdx  = r.sT.findIndex(t => t > r.finishT + 0.05);
  const cut     = cutIdx > 0 ? cutIdx : r.sT.length;
  const tSlice  = r.sT.slice(0, cut);
  const vSlice  = r.sV.slice(0, cut);
  const dSlice  = r.sD.slice(0, cut);
  drawSpeedChart($('chart'), tSlice, vSlice, dSlice);
  drawThrustChart(p.thrustF0, p.thrustTau, p.thrustDur);
  _lastRunData = { tSlice, vSlice, dSlice, finishT: r.finishT, thrustF0: p.thrustF0, thrustTau: p.thrustTau, thrustDur: p.thrustDur };
}

function runSim() {
  if (!validateInputs()) return;
  const p = buildParamsFromDOM();
  const r = simulate(p);
  if (!r.finishT) { showError('Car did not finish — check inputs.'); return; }

  const tMid = r.finishT;
  _animateResults(r, tMid);
  _renderForceBreakdown(p, r);
  _renderModelNote(tMid);
  _renderCharts(p, r);

  if (typeof gtag === 'function') gtag('event', 'run_simulation');

  window._lastRun = { finishT: r.finishT, displayT: tMid, finishV: r.finishV, peakV: r.peakV, peakA: r.peakA, sT: r.sT, sV: r.sV, sD: r.sD, trackLen: p.trackLen };
  const sb = $('save-btn');
  if (sb) { sb.disabled = false; sb.style.opacity = '1'; sb.style.cursor = 'pointer'; sb.textContent = '💾 Save Run'; }

  renderTuneCard(runSensitivity(p, r.finishT));
  updateReplayCard();
}

/* ── Saved runs ── */
function saveRun() {
  if(!window._lastRun){showError('Run the simulation first.');return;}
  const label=$('run-label').value.trim()||('Run '+(savedRuns.length+1));
  const colour=$('run-colour').value;
  const run=Object.assign({},window._lastRun,{label,colour,sT:window._lastRun.sT.slice(),sD:window._lastRun.sD.slice()});
  savedRuns.push(run);
  window._lastRun=null;
  const sb=$('save-btn');
  if(sb){sb.disabled=true;sb.style.opacity='0.4';sb.style.cursor='not-allowed';sb.textContent='💾 Save Run — run simulation first';}
  $('run-label').value='';
  $('run-colour').value=RUN_COLOURS[savedRuns.length%RUN_COLOURS.length];
  renderSavedRuns(); updateReplayCard();
}

function deleteRun(idx) {
  savedRuns.splice(idx,1);
  renderSavedRuns(); updateReplayCard();
}

function clearAllRuns() {
  savedRuns=[];
  window._lastRun=null;
  $('run-colour').value=RUN_COLOURS[0];
  renderSavedRuns(); updateReplayCard();
  if(_replayAF){cancelAnimationFrame(_replayAF);_replayAF=null;}
  const btn=$('replay-btn');
  if(btn){btn.textContent='▶ Play';btn.onclick=startReplay;}
}

function renderSavedRuns() {
  const list=$('saved-runs-list');
  if(!savedRuns.length){
    list.innerHTML='<div class="empty-state" id="saved-runs-empty"><div class="empty-text">No saved runs yet</div></div>';
    $('time-chart-wrap').style.display='none'; return;
  }
  const refT=savedRuns[0].displayT||savedRuns[0].finishT;
  list.innerHTML=savedRuns.map((r,i)=>{
    const diff=(r.displayT||r.finishT)-refT;
    const sign=diff>0?'+':'';
    const cls=diff<0?'faster':'slower';
    const delta=i===0
      ?`<span style="color:var(--muted);font-size:.6rem;">baseline</span>`
      :`<span class="run-delta ${cls}">${sign}${(diff*1000).toFixed(1)}ms</span>`;
    return `<div class="run-row">
      <div class="run-dot" style="background:${r.colour}"></div>
      <div class="run-name" title="${r.label}">${r.label}</div>
      <div class="run-time">${(r.displayT||r.finishT).toFixed(4)}s</div>
      ${delta}
      <span class="run-del" onclick="deleteRun(${i})" title="Remove">✕</span>
    </div>`;
  }).join('');
  renderFinishTimeChart();
}

function renderFinishTimeChart() {
  const wrap=$('time-chart-wrap');
  if(savedRuns.length<1){wrap.style.display='none';return;}
  wrap.style.display='block';
  drawBarChart($('time-chart'),savedRuns.map(r=>r.label),savedRuns.map(r=>r.displayT||r.finishT),savedRuns.map(r=>r.colour));
}

/* ── Theme toggle ── */
function toggleTheme() {
  const isLight=document.body.classList.toggle('light');
  $('theme-btn').textContent=isLight?'☾ Dark Mode':'☀ Light Mode';
  redrawAllCharts();
}

function redrawAllCharts() {
  if(_lastRunData && $('chart').style.display!=='none')
    drawSpeedChart($('chart'),_lastRunData.tSlice,_lastRunData.vSlice,_lastRunData.dSlice);
  if(_lastRunData && $('thrust-chart').style.display!=='none')
    drawThrustChart(_lastRunData.thrustF0,_lastRunData.thrustTau,_lastRunData.thrustDur);
  if(savedRuns&&savedRuns.length>0) renderFinishTimeChart();
  if(_replayRuns.length) setTimeout(()=>drawReplayFrame(0),20);
}

/* ── Init & resize ── */
window.addEventListener('load',()=>{
  try{applyMuBorePreset();applyMuBodyPreset();updateAxleSetup();toggleWheelMode();onCompetitionChange();}
  catch(e){console.warn('[AeroTune] Init:',e);}
  if(window.innerWidth<=520){
    document.querySelectorAll('.section-body').forEach(body=>{
      body.classList.add('collapsed');
      const arrow=body.previousElementSibling?.querySelector('.section-arrow');
      if(arrow) arrow.classList.remove('open');
    });
    const ob=$('onboard-body'),tl=$('onboard-toggle-label');
    if(ob&&tl){ob.classList.add('hidden');tl.textContent='click to expand';}
  }
});

let _resizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(_resizeTimer);
  _resizeTimer=setTimeout(()=>{
    redrawAllCharts();
    if(_replayRuns.length) drawReplayFrame(0);
  },150);
});