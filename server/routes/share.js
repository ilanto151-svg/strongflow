// server/routes/share.js
const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../pg');
const { authTherapist } = require('../middleware/auth');

// Support both /generate (body.patientId) and /generate/:pid
// POST /generate/:pid — main handler below

router.post('/generate/:pid', authTherapist, async (req, res) => {
  try {
    // 1) Verify patient belongs to therapist
    const patientResult = await pool.query(
      `SELECT *
       FROM patients
       WHERE id = $1 AND therapist_id = $2`,
      [req.params.pid, req.user.id]
    );

    const p = patientResult.rows[0];
    if (!p) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 2) Get therapist name
    const therapistResult = await pool.query(
      `SELECT name
       FROM therapists
       WHERE id = $1`,
      [req.user.id]
    );

    const t = therapistResult.rows[0] || null;

    // 3) Get exercises for patient
    const exercisesResult = await pool.query(
      `SELECT *
       FROM exercises
       WHERE patient_id = $1
       ORDER BY day_key, sort_order`,
      [req.params.pid]
    );

    const exercises = exercisesResult.rows;

    // 4) Get reports for patient
    const reportsResult = await pool.query(
      `SELECT *
       FROM reports
       WHERE patient_id = $1`,
      [req.params.pid]
    );

    const reports = reportsResult.rows;

    // Group exercises by day_key
    const exByDay = {};
    exercises.forEach(ex => {
      const dayKey = Number(ex.day_key);

      if (!exByDay[dayKey]) exByDay[dayKey] = [];

      let parsedIntervals = [];
      try {
        if (ex.intervals) {
          parsedIntervals =
            typeof ex.intervals === 'string'
              ? JSON.parse(ex.intervals)
              : ex.intervals;
        }
      } catch (e) {
        parsedIntervals = [];
      }

      exByDay[dayKey].push({
        instanceId: ex.instance_id,
        type: ex.type,
        name: ex.name,
        image: ex.image,
        description: ex.description,
        equipment: ex.equipment,
        sets: ex.sets,
        reps: ex.reps,
        duration: ex.duration,
        notes: ex.notes,
        rpe: ex.rpe,
        imgData: ex.img_data,
        imgUrl: ex.img_url,
        link: ex.link,
        intervals: parsedIntervals
      });
    });

    // Build report map
    const repMap = {};
    reports.forEach(r => {
      let parsedSessionRpe = null;
      try {
        if (r.session_rpe) {
          parsedSessionRpe =
            typeof r.session_rpe === 'string'
              ? JSON.parse(r.session_rpe)
              : r.session_rpe;
        }
      } catch (e) {
        parsedSessionRpe = null;
      }

      repMap[Number(r.day_key)] = {
        fatigue: r.fatigue,
        pain: r.pain,
        wellbeing: r.wellbeing,
        notes: r.notes,
        session_rpe: parsedSessionRpe
      };
    });

    // Generate weeks array: week offsets -1 to +2
    // day_key = weekOffset * 7 + dayOfWeek (base = Sunday of current week at server time)
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const wSun = new Date(now);
    wSun.setDate(wSun.getDate() - wSun.getDay()); // Sunday of current week

    const weekData = [];
    for (let w = -1; w <= 2; w++) {
      const sun = new Date(wSun);
      sun.setDate(sun.getDate() + w * 7);

      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(sun);
        date.setDate(date.getDate() + d);

        const key = w * 7 + d;
        const exs = (exByDay[key] || []).map(ex => {
          const e = { ...ex };
          if (e.imgData && e.imgData.length > 40000) delete e.imgData;
          return e;
        });

        days.push({
          date: date.toISOString().slice(0, 10),
          dow: d,
          key,
          exs
        });
      }

      weekData.push({
        weekOffset: w,
        sun: sun.toISOString().slice(0, 10),
        days
      });
    }

    const patData = JSON.stringify({
      id: p.id,
      name: p.name,
      diagnosis: p.diagnosis || '',
      gender: p.gender || '',
      dob: p.dob || '',
      therapistName: t ? t.name : ''
    });

    const planData = JSON.stringify(weekData);
    const reportsData = JSON.stringify(repMap);

    const html = generateStandaloneHTML(p, patData, planData, reportsData);
    const safeName = (p.name || 'patient')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const fileName = safeName + '-oncomove.html';
    const firstName = (p.name || '').split(' ')[0] || 'Patient';

    const requestedWeekOffset = Number(req.body.weekOffset || 0);
    const weekExs = exercises.filter(
      e => Math.floor(Number(e.day_key) / 7) === requestedWeekOffset
    );

    const weekSummary =
      weekExs.length > 0
        ? `${weekExs.length} exercise(s) planned`
        : 'rest week';

    // Store in DB and return a shareable URL token
    const token = crypto.randomBytes(16).toString('hex');

    await pool.query(
      `INSERT INTO share_pages
        (token, patient_id, therapist_id, html, filename, first_name, week_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (token)
       DO UPDATE SET
         patient_id = EXCLUDED.patient_id,
         therapist_id = EXCLUDED.therapist_id,
         html = EXCLUDED.html,
         filename = EXCLUDED.filename,
         first_name = EXCLUDED.first_name,
         week_summary = EXCLUDED.week_summary,
         updated_at = NOW()`,
      [token, p.id, req.user.id, html, fileName, firstName, weekSummary]
    );

    // Also return html blob for Google Drive upload
    res.json({
      token,
      html,
      filename: fileName,
      firstName,
      weekSummary
    });
  } catch (err) {
    console.error('share generate error:', err);
    res.status(500).json({ error: 'Failed to generate share page' });
  }
});

function generateStandaloneHTML(p, patData, planData, reportsData) {
  // The patient HTML file - matches original design exactly
  const CLOSE = '</' + 'script>';
  const OPEN  = '<' + 'script>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#059669">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>OncoMove — ${p.name}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --green:#059669;--green-l:#10b981;--green-bg:#f0fdf4;
  --blue:#1d4ed8;--blue-l:#3b82f6;--blue-bg:#eff6ff;
  --amber:#d97706;--amber-bg:#fffbeb;
  --purple:#7c3aed;--purple-bg:#f5f3ff;
  --red:#dc2626;
  --gray-50:#f8fafc;--gray-100:#f1f5f9;--gray-200:#e2e8f0;
  --gray-400:#94a3b8;--gray-500:#64748b;--gray-600:#475569;--gray-900:#0f172a;
  --font:'Segoe UI','Helvetica Neue',Arial,sans-serif;
}
html{height:100%}
body{font-family:var(--font);background:#f0f4f8;color:var(--gray-900);min-height:100%;-webkit-text-size-adjust:100%;padding-bottom:calc(64px + env(safe-area-inset-bottom,0px))}
button,input,textarea,select{font-family:var(--font)}
button{cursor:pointer}
.hidden{display:none!important}
.topbar{background:linear-gradient(135deg,#0f1724 0%,#1e3a5f 100%);color:#fff;padding:0 16px;height:56px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:200;padding-top:env(safe-area-inset-top,0)}
.topbar-logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--green-l),var(--blue-l));display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.topbar-name{font-size:16px;font-weight:700}
.topbar-sub{font-size:10px;opacity:.55;letter-spacing:.5px;margin-top:1px}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--gray-200);display:flex;z-index:200;padding-bottom:env(safe-area-inset-bottom,0);box-shadow:0 -2px 12px rgba(0,0,0,.08)}
.tab-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 4px;border:none;background:none;color:var(--gray-400);font-size:9px;font-weight:600;letter-spacing:.2px;min-height:56px;-webkit-tap-highlight-color:transparent;transition:color .15s}
.tab-btn.active{color:var(--blue)}
.tab-icon{font-size:20px;line-height:1}
.main{max-width:700px;margin:0 auto;padding:16px 14px 20px}
.day-strip{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px;margin-bottom:18px}
.day-strip::-webkit-scrollbar{display:none}
.day-chip{flex-shrink:0;padding:8px 14px;border-radius:20px;border:1.5px solid var(--gray-200);background:#fff;color:var(--gray-600);font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent;white-space:nowrap}
.day-chip.today-chip{border-color:var(--gray-400)}
.day-chip.has-ex{border-color:var(--blue-l);color:var(--blue)}
.day-chip.active{background:var(--green-l);color:#fff;font-weight:700;border-color:var(--green-l);box-shadow:0 4px 12px rgba(16,185,129,.3)}
.section{background:#fff;border-radius:14px;border:1px solid var(--gray-200);margin-bottom:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.section-hdr{padding:12px 15px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--gray-100)}
.section-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.ex-card{padding:13px 15px;border-bottom:1px solid var(--gray-100);display:flex;align-items:flex-start;gap:11px}
.ex-card:last-child{border-bottom:none}
.ex-card.done{background:#f0fdf4}
.ex-check{width:44px;height:44px;border-radius:50%;border:2px solid var(--gray-200);background:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;transition:all .2s;-webkit-tap-highlight-color:transparent}
.ex-check.done{background:var(--green-l);border-color:var(--green-l);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.4)}
.ex-info{flex:1;min-width:0}
.ex-name{font-size:14px;font-weight:700;margin-bottom:2px;line-height:1.3}
.ex-name.done{text-decoration:line-through;color:var(--gray-400)}
.ex-meta{font-size:12px;color:var(--gray-400);line-height:1.5}
.ex-desc{font-size:12px;color:var(--gray-500);margin-top:2px}
.ex-img{width:46px;height:46px;border-radius:9px;object-fit:cover;flex-shrink:0;cursor:zoom-in}
.ex-emoji{width:46px;height:46px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;cursor:zoom-in}
.week-card{background:#fff;border-radius:12px;border:1px solid var(--gray-200);padding:13px 15px;margin-bottom:9px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.05);-webkit-tap-highlight-color:transparent}
.week-card.today-card{border:2px solid var(--green-l)}
.metric-card{background:#fff;border-radius:12px;border:1px solid var(--gray-200);padding:15px;margin-bottom:11px}
.metric-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.metric-name{font-size:14px;font-weight:700}
.metric-val{font-size:24px;font-weight:900}
.metric-desc{font-size:11px;color:var(--gray-400);margin-bottom:8px}
.metric-slider{width:100%;margin:4px 0}
.metric-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--gray-400)}
.submit-btn{width:100%;background:var(--green-l);border:none;border-radius:11px;padding:15px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,.35);transition:opacity .2s;margin-top:6px;-webkit-tap-highlight-color:transparent}
.submit-btn:active{opacity:.85}
.empty-state{text-align:center;padding:52px 20px;color:var(--gray-400)}
.empty-icon{font-size:52px;margin-bottom:14px}
.prog-bar{height:6px;background:var(--gray-100);border-radius:3px;overflow:hidden;margin-top:10px}
.prog-fill{height:100%;background:var(--green-l);border-radius:3px;transition:width .4s ease}
.success-box{background:var(--green-bg);border:2px solid #86efac;border-radius:14px;padding:36px 20px;text-align:center}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;backdrop-filter:blur(6px)}
.lightbox-inner{display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;text-align:center}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-logo">🌿</div>
  <div>
    <div class="topbar-name" id="hdr-name"></div>
    <div class="topbar-sub">ONCOMOVE · PERSONAL PROGRAM</div>
  </div>
</div>
<div class="main" id="main"></div>
<nav class="bottom-nav">
  <button class="tab-btn active" data-view="today"><span class="tab-icon">📅</span><span>Today</span></button>
  <button class="tab-btn" data-view="week"><span class="tab-icon">🗓️</span><span>Week</span></button>
  <button class="tab-btn" data-view="checkin"><span class="tab-icon">📝</span><span>Check-in</span></button>
</nav>
${OPEN}
const P     = ${patData};
const WEEKS = ${planData};
const SAVED_REPORTS = ${reportsData};
const DAYS  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const TM    = {
  resistance:{label:"Resistance",color:"#f59e0b",bg:"#fffbeb",icon:"🏋️"},
  aerobic:   {label:"Aerobic",   color:"#3b82f6",bg:"#eff6ff",icon:"🏃"},
  other:     {label:"Other",     color:"#8b5cf6",bg:"#f5f3ff",icon:"✨"}
};
const RPE = {0:"Nothing at all",1:"Very light",2:"Light",3:"Moderate",4:"Somewhat hard",5:"Hard",6:"Hard+",7:"Very hard",8:"Very hard+",9:"Very severe",10:"Maximum"};
const TODAY_ISO = new Date().toISOString().slice(0,10);

let doneEx  = {};
let view    = "today";
let selDate = TODAY_ISO;
let rpeVals = {fatigue:5,pain:3,wellbeing:7};
let localReports = (()=>{ try{ return JSON.parse(localStorage.getItem("om_rpt_"+P.id)||"null")||{...SAVED_REPORTS}; }catch(e){ return {...SAVED_REPORTS}; } })();
function saveRpts(){ try{ localStorage.setItem("om_rpt_"+P.id, JSON.stringify(localReports)); }catch(e){} }

document.getElementById("hdr-name").textContent = P.name;

function thisWeek(){ return WEEKS.find(w=>w.weekOffset===0)||WEEKS[1]; }
function dayData(dateStr){ for(const w of WEEKS){ const d=w.days.find(d=>d.date===dateStr); if(d)return d; } return null; }
function fmtDate(s){ return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}); }
function fmtShort(s){ return new Date(s+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }

document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.onclick=()=>{ view=btn.dataset.view; sync(); render(); };
});
function sync(){
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
}

function render(){
  const main=document.getElementById("main");
  main.innerHTML="";
  if(view==="today")  renderToday(main);
  else if(view==="week")   renderWeek(main);
  else if(view==="checkin") renderCheckin(main);
}

function renderToday(main){
  const week=thisWeek();
  const strip=ce("div","day-strip");
  week.days.forEach(day=>{
    const chip=ce("button","day-chip"+(day.date===TODAY_ISO?" today-chip":"")+(day.exs.length?" has-ex":"")+(day.date===selDate?" active":""));
    chip.textContent=DAYS[day.dow].slice(0,3)+(day.date===TODAY_ISO?" ●":"");
    chip.onclick=()=>{ selDate=day.date; renderToday(main); };
    strip.appendChild(chip);
  });
  main.appendChild(strip);

  const dd=dayData(selDate);
  const exs=dd?dd.exs:[];

  const info=ce("div","");
  info.innerHTML='<h2 style="font-size:20px;font-weight:800;margin-bottom:3px">'+(selDate===TODAY_ISO?"Today — ":"")+fmtDate(selDate)+'</h2><p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">'+(exs.length?exs.length+' exercise'+(exs.length!==1?'s':"")+" planned":"Rest day 🌿")+'</p>';
  main.appendChild(info);

  if(!exs.length){ main.appendChild(emptyState("🌿","Rest day","No exercises scheduled — take it easy today.")); return; }

  const byType={resistance:[],aerobic:[],other:[]};
  exs.forEach(ex=>(byType[ex.type]||byType.other).push(ex));
  let totalDone=0;
  Object.entries(byType).forEach(([type,texs])=>{
    if(!texs.length)return;
    const m=TM[type]||TM.other;
    const sec=ce("div","section");
    const hdr=ce("div","section-hdr");
    hdr.innerHTML='<div class="section-icon" style="background:'+m.bg+'">'+m.icon+'</div><div style="font-size:14px;font-weight:700;color:'+m.color+'">'+m.label+' Training</div><span style="margin-left:auto;font-size:11px;color:var(--gray-400)">'+texs.length+' ex</span>';
    sec.appendChild(hdr);
    texs.forEach(ex=>{
      const done=!!doneEx[ex.instanceId];
      if(done)totalDone++;
      const card=ce("div","ex-card"+(done?" done":""));
      const metaParts=[ex.sets&&ex.reps?ex.sets+"×"+ex.reps:ex.sets?ex.sets+" sets":ex.reps?ex.reps+" reps":"",ex.duration||"","RPE "+(ex.rpe??5)].filter(Boolean);
      const actualImgEl=(ex.imgData||ex.imgUrl)?'<img class="ex-img" src="'+(ex.imgData||ex.imgUrl)+'" alt="'+ex.name+'" loading="lazy">'  :'<div class="ex-emoji" style="background:'+m.bg+'">'+ex.image+'</div>';
      const chk=ce("button","ex-check"+(done?" done":""));
      chk.textContent=done?"✓":"";
      chk.onclick=()=>{ doneEx[ex.instanceId]=!done; renderToday(main); };
      const info2=ce("div","ex-info");
      info2.innerHTML='<div class="ex-name'+(done?" done":"")+'">'+ex.name+'</div><div class="ex-meta">'+metaParts.join(" · ")+'</div>'+(ex.description?'<div class="ex-desc">'+ex.description+'</div>':"")+((ex.intervals&&ex.intervals.length)?buildIvTable(ex,m):"")+(ex.link?'<a href="'+ex.link+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:3px;margin-top:4px;font-size:11px;color:var(--blue-l);font-weight:600;text-decoration:none">🔗 Reference ↗</a>':"");
      const imgWrap=ce("div","");
      imgWrap.innerHTML=actualImgEl;
      const imgNode=imgWrap.firstChild;
      imgNode.onclick=()=>openLightbox(ex,m);
      card.appendChild(chk);
      card.appendChild(info2);
      card.appendChild(imgNode);
      sec.appendChild(card);
    });
    main.appendChild(sec);
  });

  const total=exs.length;
  const pbar=ce("div","");
  pbar.style.cssText="text-align:center;padding:10px 0 4px;font-size:13px;color:var(--gray-500)";
  pbar.innerHTML=totalDone+"/"+total+" completed"+(totalDone===total&&total>0?' <span style="color:var(--green-l);font-weight:600">— Great work! 🎉</span>':"");
  const bar=ce("div","prog-bar");
  const fill=ce("div","prog-fill");
  fill.style.width=(total?Math.round(totalDone/total*100):0)+"%";
  bar.appendChild(fill);
  pbar.appendChild(bar);
  main.appendChild(pbar);
}

function buildIvTable(ex,m){
  return '<table style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr>'+
    '<th style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;padding:4px 6px;border-bottom:1px solid var(--gray-200);background:var(--gray-50)">#</th>'+
    '<th style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;padding:4px 6px;border-bottom:1px solid var(--gray-200);background:var(--gray-50)">Duration</th>'+
    '<th style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;padding:4px 6px;border-bottom:1px solid var(--gray-200);background:var(--gray-50)">Intensity</th>'+
    '<th style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;padding:4px 6px;border-bottom:1px solid var(--gray-200);background:var(--gray-50)">RPE</th></tr></thead><tbody>'+
    ex.intervals.map((iv,i)=>'<tr><td style="font-size:11px;color:var(--gray-400);padding:4px 6px;border-bottom:1px solid var(--gray-100)">'+(i+1)+'</td>'+
      '<td style="font-size:12px;font-weight:600;padding:4px 6px;border-bottom:1px solid var(--gray-100)">'+(iv.duration||"—")+'</td>'+
      '<td style="padding:4px 6px;border-bottom:1px solid var(--gray-100)"><span style="font-size:10px;padding:1px 6px;border-radius:20px;background:'+m.bg+';color:'+m.color+';font-weight:600">'+(iv.intensity||"—")+'</span></td>'+
      '<td style="font-size:12px;font-weight:700;color:'+m.color+';padding:4px 6px;border-bottom:1px solid var(--gray-100)">'+(iv.rpe??5)+'</td></tr>').join("")+
    '</tbody></table>';
}

function renderWeek(main){
  const hdr=ce("div","");
  hdr.innerHTML='<h2 style="font-size:20px;font-weight:800;margin-bottom:16px">This Week</h2>';
  main.appendChild(hdr);

  const week=thisWeek();
  week.days.forEach(day=>{
    const isToday=day.date===TODAY_ISO;
    const card=ce("div","week-card"+(isToday?" today-card":""));
    const exs=day.exs;
    const dayName=DAYS[day.dow]+(isToday?" (Today)":"");
    let html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:'+(exs.length?8:0)+'px"><div><div style="font-size:14px;font-weight:700">'+dayName+'</div><div style="font-size:12px;color:var(--gray-400)">'+fmtShort(day.date)+'</div></div>'+(exs.length?"":'<span style="font-size:12px;color:var(--gray-300)">Rest</span>')+'</div>';
    exs.forEach(ex=>{
      const m=TM[ex.type]||TM.other;
      html+='<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-top:1px solid var(--gray-100)"><span style="width:22px;height:22px;background:'+m.bg+';border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0">'+m.icon+'</span><span style="font-size:13px;font-weight:600">'+ex.name+'</span><span style="font-size:11px;color:var(--gray-400);margin-left:auto">'+(ex.sets&&ex.reps?ex.sets+"×"+ex.reps:ex.duration||"")+'</span></div>';
    });
    card.innerHTML=html;
    card.onclick=()=>{ selDate=day.date; view="today"; sync(); render(); };
    main.appendChild(card);
  });
}

function renderCheckin(main){
  const existing=localReports[TODAY_ISO];
  if(existing&&existing._locked){
    const box=ce("div","success-box");
    box.innerHTML='<div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:18px;font-weight:700;color:var(--green);margin-bottom:6px">Check-in submitted!</div><div style="font-size:13px;color:var(--gray-600)">Already checked in today. Your therapist can see your responses.</div>';
    main.appendChild(box);
    return;
  }

  const hdr=ce("div","");
  hdr.innerHTML='<h2 style="font-size:20px;font-weight:800;margin-bottom:4px">Daily Check-in</h2><p style="color:var(--gray-400);font-size:13px;margin-bottom:18px">How are you feeling? Your therapist reviews these.</p>';
  main.appendChild(hdr);

  if(existing&&existing.submittedAt){
    const notice=ce("div","");
    notice.style.cssText="background:var(--green-bg);border:1px solid #86efac;border-radius:10px;padding:11px 14px;margin-bottom:14px;font-size:13px;color:#166534";
    notice.textContent="✅ Already submitted today — you can update below.";
    main.appendChild(notice);
    rpeVals={fatigue:existing.fatigue??5,pain:existing.pain??3,wellbeing:existing.wellbeing??7};
  }

  const METRICS=[
    {k:"fatigue",  label:"Fatigue 😴",    desc:"How tired are you?",                color:"#f59e0b"},
    {k:"pain",     label:"Pain 😣",        desc:"How much pain or discomfort?",      color:"#ef4444"},
    {k:"wellbeing",label:"Wellbeing 🌟",   desc:"How are you feeling overall?",      color:"#10b981"},
  ];

  METRICS.forEach(m=>{
    const card=ce("div","metric-card");
    const slid=ce("input","metric-slider");
    slid.type="range";
    slid.min=0;
    slid.max=10;
    slid.value=rpeVals[m.k];
    slid.style.accentColor=m.color;

    const valEl=ce("span","metric-val");
    valEl.style.color=m.color;
    valEl.textContent=rpeVals[m.k];

    const descEl=ce("span","");
    descEl.style.cssText="font-size:12px;color:var(--gray-400)";
    descEl.textContent=RPE[rpeVals[m.k]];

    const row=ce("div","metric-row");
    const lbl=ce("div","metric-name");
    lbl.textContent=m.label;

    const rr=ce("div","");
    rr.style.cssText="display:flex;align-items:baseline;gap:6px";
    rr.appendChild(valEl);
    rr.appendChild(descEl);
    row.appendChild(lbl);
    row.appendChild(rr);

    const desc2=ce("div","metric-desc");
    desc2.textContent=m.desc;

    const lbls=ce("div","metric-labels");
    lbls.innerHTML="<span>0 Nothing</span><span>10 Maximum</span>";

    card.appendChild(row);
    card.appendChild(desc2);
    card.appendChild(slid);
    card.appendChild(lbls);

    slid.oninput=()=>{
      rpeVals[m.k]=+slid.value;
      valEl.textContent=slid.value;
      descEl.textContent=RPE[+slid.value]||"";
    };

    main.appendChild(card);
  });

  const notesCard=ce("div","metric-card");
  const notesLabel=ce("div","");
  notesLabel.innerHTML="<label style='font-size:12px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px'>Notes (optional)</label>";

  const notesTA=ce("textarea","");
  notesTA.rows=3;
  notesTA.placeholder="How did the exercises feel? Any discomfort?";
  notesTA.style.cssText="width:100%;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;font-size:14px;font-family:var(--font);outline:none;resize:vertical";
  notesTA.value=existing?.notes||"";

  notesCard.appendChild(notesLabel);
  notesCard.appendChild(notesTA);
  main.appendChild(notesCard);

  const btn=ce("button","submit-btn");
  btn.textContent="✅ Submit Check-in";
  btn.onclick=()=>{
    localReports[TODAY_ISO]={
      ...rpeVals,
      notes:notesTA.value,
      submittedAt:new Date().toISOString(),
      _locked:true
    };
    saveRpts();
    renderCheckin(main);
  };
  main.appendChild(btn);
}

function openLightbox(ex,m){
  const ov=ce("div","lightbox");
  const hasImg=ex.imgData||ex.imgUrl;
  ov.innerHTML='<div class="lightbox-inner">'+
    (hasImg
      ? '<img src="'+(ex.imgData||ex.imgUrl)+'" style="max-width:360px;max-height:360px;object-fit:contain;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)" alt="'+ex.name+'">'
      : '<div style="font-size:130px;line-height:1">'+ex.image+'</div>')+
    '<div style="color:#fff;font-size:22px;font-weight:700">'+ex.name+'</div>'+
    '<span style="font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;background:'+m.bg+';color:'+m.color+'">'+m.label+'</span>'+
    (ex.description?'<div style="color:rgba(255,255,255,.65);font-size:15px;max-width:340px;text-align:center;line-height:1.5">'+ex.description+'</div>':'')+
    '<div style="color:rgba(255,255,255,.4);font-size:13px;margin-top:6px">Click anywhere to close</div></div>';

  ov.onclick=()=>ov.remove();
  document.body.appendChild(ov);

  const onKey=e=>{
    if(e.key==="Escape"){
      ov.remove();
      document.removeEventListener("keydown",onKey);
    }
  };
  document.addEventListener("keydown",onKey);
}

function ce(tag,cls){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  return e;
}

function emptyState(icon,title,sub){
  const d=ce("div","empty-state");
  d.innerHTML='<div class="empty-icon">'+icon+'</div><div style="font-size:16px;font-weight:600;color:var(--gray-600);margin-bottom:4px">'+title+'</div><p style="font-size:13px">'+sub+'</p>';
  return d;
}

render();
${CLOSE}
</body>
</html>`;
}

// ── Public: serve stored patient page ────────────────────────────────────────
router.get('/p/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT html
       FROM share_pages
       WHERE token = $1`,
      [req.params.token]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(404).send('<h1>Program not found or expired</h1>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(row.html);
  } catch (err) {
    console.error('share public page error:', err);
    res.status(500).send('<h1>Server error</h1>');
  }
});

module.exports = router;