(()=>{
const PANEL="bbtips-final-robo";
const TIMER="BBTIPS_FINAL_ROBO_TIMER";
const SEEN="BBTIPS_FINAL_ROBO_SEEN";
const API_STORE="BBTIPS_FINAL_API_ROWS_V2";
const HIST_STORE="BBTIPS_FINAL_RESULTADOS_HIST_V1";
const ANCHOR_ALERT_STATE=SEEN+"_ANCHOR_STATE_V2";
const ANCHOR_ALERT_LOCK=SEEN+"_ANCHOR_LOCK_V2";
const AGENTE_LOCAL_URL="http://127.0.0.1:8765/ingest";
let AGENTE_LOCAL_TS=0;
let LAST_HIST_SAVE_TS=0;
document.getElementById(PANEL)?.remove();
document.getElementById(PANEL+"-style")?.remove();
clearInterval(window[TIMER]);
["BBTIPS_FINAL_ROBO_TIMER","BBTIPS_API_ALERTAS_TIMER","BBTIPS_INTERCEPTA_API_TIMER","BBTIPS_PRO_TRADER_TIMER","HB_MULTI_TIMER","BBTIPS_SCANNER_COLLECT_TIMER","BBTIPS_ROBO_ALERT_TIMER","__BBTIPS_GRAPH_ROBO_TIMER"].forEach(k=>{try{clearInterval(window[k])}catch(e){}});
try{window.__BBTIPS_GRAPH_ROBO_INLINE=false}catch(e){}
["bbtips-api-alertas","bbtips-intercepta-api","hb-multi","hb-tips-scanner","bbtips-robo-root","bbtips-robo-canvas","bbtips-robo-desenho","bbtips-marker-handle"].forEach(id=>document.getElementById(id)?.remove());

const CONFIG={market:"over25",tol:0.8,minEV:5,minEdge:3,minProb:0,minOddPct:45,minOddSample:12,minTeamSample:12,maxProximos:6,intervalMs:120000,alertIntervalMs:20000,windows:[120,240,480,960],ligas:[1,2,3,4,5,6],radarLigas:[1,2,3,4],ligaAuto:true,autoRefresh:true,autoApi:false,alerts:true,scannerTelemetry:false,graphRobo:true,horas:"Horas3",filtros:"o15,o25,u25,ambs,ambn,o35,u15,u35,ge5,tgv5,tgc5,ftc,fte,ftv",anchorMinSample:6,anchorMinGreen:5,anchorMinPct:75,anchorNotifyMinSample:8,anchorNotifyMinGreen:6,anchorNotifyMinPct:78};
const LIGA_LABELS={1:"Copa",2:"Euro",3:"Super",4:"Premier",5:"Split",6:"Express"};
const SCHEDULE_TIME_ZONE="Europe/London";
let PANEL_HOVER=false;
let SCANNER_GRAPH_AUTO_MIN=false;
let SCANNER_MANUAL_OPEN=false;
let ACTIVE_LIGA_BLOCKED=false;
let TOOLTIP_SERIES=[];
let RESULTS_CACHE=[];
let API_ROWS=[];
let DRAWING=false;
let DRAW_PENDING=false;
let DRAW_TIMER=null;
let LAST_RESULTS_REFRESH=0;
let LAST_API_LOAD=0;
let SCANNER_COLLECTING=false;
let RESULT_WINDOWS_CACHE={key:"",rows:null};
const MARKETS=[
  {key:"ambas_sim",name:"Ambas Sim",patterns:[/ambs@?(\d+[,.]\d+)/ig,/ambas\s*sim@?(\d+[,.]\d+)/ig],label:/ambs|ambas\s*sim|ambas\s*marcam/i},
  {key:"ambas_nao",name:"Ambas Nao",patterns:[/ambn@?(\d+[,.]\d+)/ig,/ambas\s*nao@?(\d+[,.]\d+)/ig],label:/ambn|ambas\s*n/i},
  {key:"over15",name:"Over 1.5",patterns:[/o15@?(\d+[,.]\d+)/ig,/over\s*1[,.]?5@?(\d+[,.]\d+)/ig],label:/o15|over\s*1/i},
  {key:"under15",name:"Under 1.5",patterns:[/u15@?(\d+[,.]\d+)/ig,/under\s*1[,.]?5@?(\d+[,.]\d+)/ig],label:/u15|under\s*1/i},
  {key:"over25",name:"Over 2.5",patterns:[/o25@?(\d+[,.]\d+)/ig,/over\s*2[,.]?5@?(\d+[,.]\d+)/ig],label:/o25|over\s*2/i},
  {key:"under25",name:"Under 2.5",patterns:[/u25@?(\d+[,.]\d+)/ig,/under\s*2[,.]?5@?(\d+[,.]\d+)/ig],label:/u25|under\s*2/i},
  {key:"over35",name:"Over 3.5",patterns:[/o35@?(\d+[,.]\d+)/ig,/over\s*3[,.]?5@?(\d+[,.]\d+)/ig],label:/o35|over\s*3/i},
  {key:"under35",name:"Under 3.5",patterns:[/u35@?(\d+[,.]\d+)/ig,/under\s*3[,.]?5@?(\d+[,.]\d+)/ig],label:/u35|under\s*3/i},
  {key:"casa_vence",name:"Casa vence",patterns:[/ftc@?(\d+[,.]\d+)/ig,/casa@?(\d+[,.]\d+)/ig,/casa\s*vence@?(\d+[,.]\d+)/ig,/mandante@?(\d+[,.]\d+)/ig,/home@?(\d+[,.]\d+)/ig,/time\s*a@?(\d+[,.]\d+)/ig,/cv@?(\d+[,.]\d+)/ig],label:/ftc|casa\s*vence|mandante|home/i},
  {key:"empate",name:"Empate",patterns:[/fte@?(\d+[,.]\d+)/ig,/empate@?(\d+[,.]\d+)/ig,/draw@?(\d+[,.]\d+)/ig,/\bx@?(\d+[,.]\d+)/ig],label:/fte|empate|draw/i},
  {key:"fora_vence",name:"Fora vence",patterns:[/ftv@?(\d+[,.]\d+)/ig,/fora@?(\d+[,.]\d+)/ig,/fora\s*vence@?(\d+[,.]\d+)/ig,/visitante@?(\d+[,.]\d+)/ig,/away@?(\d+[,.]\d+)/ig,/time\s*b@?(\d+[,.]\d+)/ig,/fv@?(\d+[,.]\d+)/ig],label:/ftv|fora\s*vence|visitante|away/i},
  {key:"over5",name:"Over 5+",patterns:[/o5@?(\d+[,.]\d+)/ig,/ge5@?(\d+[,.]\d+)/ig,/e5\+?@?(\d+[,.]\d+)/ig,/5\+@?(\d+[,.]\d+)/ig,/over\s*5\+?@?(\d+[,.]\d+)/ig],label:/5\+|ge5|over\s*5/i},
  {key:"casa5",name:"Casa 5+",patterns:[/casa\s*5@?(\d+[,.]\d+)/ig,/c5@?(\d+[,.]\d+)/ig,/tgc5@?(\d+[,.]\d+)/ig,/tcg5@?(\d+[,.]\d+)/ig],label:/casa\s*5|tgc5/i},
  {key:"fora5",name:"Fora 5+",patterns:[/fora\s*5@?(\d+[,.]\d+)/ig,/f5@?(\d+[,.]\d+)/ig,/tgv5@?(\d+[,.]\d+)/ig,/tvg5@?(\d+[,.]\d+)/ig],label:/fora\s*5|tgv5/i}
];

const css=document.createElement("style");
css.id=PANEL+"-style";
css.textContent=`
#${PANEL}{position:fixed;left:6px;right:6px;bottom:6px;z-index:999999;background:#101820;color:#eaf7ff;border:1px solid #29d7ff;border-radius:6px;font:12px Arial;box-shadow:0 8px 24px #0009}
#${PANEL}.min .body{display:none}
#${PANEL}.min{right:auto;width:min(520px,calc(100vw - 24px));max-width:calc(100vw - 24px)}
#${PANEL}.min .top{flex-wrap:nowrap;min-width:0}
#${PANEL}.min .top>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${PANEL} .top{display:flex;gap:8px;align-items:center;justify-content:space-between;background:#162331;padding:7px;flex-wrap:wrap}
#${PANEL} .body{max-height:58vh;overflow:auto;padding:8px}
#${PANEL} button,#${PANEL} input,#${PANEL} select{background:#0b7189;color:white;border:1px solid #46e3ff;border-radius:4px;padding:5px 8px;margin:2px}
#${PANEL} input,#${PANEL} select{background:#06131d}
#${PANEL} input{width:54px}
#${PANEL} h3{color:#ffd166;margin:8px 0 4px;font-size:18px}
#${PANEL} table{width:100%;border-collapse:collapse;margin:8px 0}
#${PANEL} th,#${PANEL} td{border:1px solid #314657;padding:4px;vertical-align:top}
#${PANEL} th{background:#1b2b38;color:#9ee7ff}
#${PANEL} .ok{color:#40ff7b;font-weight:bold}.warn{color:#ffd166;font-weight:bold}.bad{color:#ff6b6b;font-weight:bold}
#${PANEL} .sig{border:1px solid #314657;border-left:4px solid #40ff7b;border-radius:5px;background:#0b141d;padding:8px;margin:7px 0}
`;
document.head.appendChild(css);
const P=document.createElement("div");
P.id=PANEL;
document.body.appendChild(P);
P.addEventListener("mouseenter",()=>PANEL_HOVER=true);
P.addEventListener("mouseleave",()=>PANEL_HOVER=false);
hookApi();
loadApiRows();
compactAlertStorage();

function esc(v){return String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/\s+/g," ").trim()}
function safeSetJson(key,val,limit=80){
  let data=Array.isArray(val)?val.slice(-limit):val;
  try{localStorage.setItem(key,JSON.stringify(data));return true}catch(e){}
  if(Array.isArray(data)){
    data=data.slice(-30);
    try{localStorage.setItem(key,JSON.stringify(data));return true}catch(e){}
  }
  try{localStorage.removeItem(key)}catch(e){}
  return false;
}
function compactAlertStorage(){
  [SEEN,SEEN+"_FUNDO",SEEN+"_TRENDUP"].forEach(k=>{
    try{
      const v=JSON.parse(localStorage.getItem(k)||"[]");
      if(Array.isArray(v)&&v.length>40)localStorage.setItem(k,JSON.stringify(v.slice(-40)));
    }catch(e){try{localStorage.removeItem(k)}catch(x){}}
  });
}
function market(){return MARKETS.find(m=>m.key===CONFIG.market)||MARKETS[0]}
function activeMarkets(){return MARKETS.filter(m=>m.key===CONFIG.market)}
function beep(){
  try{
    const ctx=new AudioContext(),master=ctx.createGain();
    master.connect(ctx.destination);master.gain.value=0.12;
    for(let t=0;t<5;t++){
      [0,0.22].forEach(off=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.frequency.value=880;o.type="sine";o.connect(g);g.connect(master);
        const s=ctx.currentTime+t+off;
        g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(1,s+0.02);g.gain.linearRampToValueAtTime(0,s+0.16);
        o.start(s);o.stop(s+0.18);
      });
    }
    setTimeout(()=>ctx.close(),5300);
  }catch(e){}
}
function parseTime(v){
  const m=String(v||"").trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if(!m)return null;
  const h=Number(m[1]),mi=Number(m[2]);
  return h>=0&&h<24&&mi>=0&&mi<60?h*60+mi:null;
}
function scheduleNowMinute(){
  try{
    const parts=new Intl.DateTimeFormat("en-GB",{timeZone:SCHEDULE_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
    const h=Number(parts.find(p=>p.type==="hour")?.value),m=Number(parts.find(p=>p.type==="minute")?.value);
    if(Number.isFinite(h)&&Number.isFinite(m))return h*60+m;
  }catch(e){}
  const d=new Date();
  return d.getHours()*60+d.getMinutes();
}
function isFuture(v){
  const hm=parseTime(v);
  if(hm===null)return true;
  const now=scheduleNowMinute();
  let diff=hm-now;
  if(diff<-720)diff+=1440;
  return diff>=0&&diff<=720;
}
function scheduleAnchorFromRows(rows=[]){
  for(const r of rows){
    if(typeof r!=="string"&&(r?.score||!r?.future))continue;
    const hm=parseTime(typeof r==="string"?r:r?.time);
    if(hm!==null)return hm;
  }
  for(const r of rows){
    const hm=parseTime(typeof r==="string"?r:r?.time);
    if(hm!==null)return hm;
  }
  return null;
}
function scheduleDistance(v,anchor){
  const hm=parseTime(v);
  if(hm===null)return 99999;
  if(anchor===null||anchor===undefined)return hm;
  let diff=hm-anchor;
  if(diff<0)diff+=1440;
  return diff;
}
function isScheduleFuture(v,anchor){
  const hm=parseTime(v);
  if(hm===null)return true;
  if(anchor===null||anchor===undefined)return isFuture(v);
  const diff=scheduleDistance(v,anchor);
  return diff>=0&&diff<=720;
}
function oddsForMarket(txt,m){
  const out=[];
  m.patterns.forEach(re=>{
    re.lastIndex=0;
    let r;
    while((r=re.exec(txt)))out.push(Number(String(r[1]).replace(",",".")));
  });
  return out.filter(n=>Number.isFinite(n)&&n>1);
}
function marketAliases(m){
  const map={
    ambas_sim:["ambs","ambas_sim","odd_ambas_sim"],
    ambas_nao:["ambn","ambas_nao","odd_ambas_nao"],
    over15:["o15","over15","over_15","odd_over_1.5"],
    under15:["u15","under15","under_15","odd_under_1.5"],
    over25:["o25","over25","over_25","odd_over_2.5"],
    under25:["u25","under25","under_25","odd_under_2.5"],
    over35:["o35","over35","over_35","odd_over_3.5"],
    under35:["u35","under35","under_35","odd_under_3.5"],
    casa_vence:["ftc","casa","casa_vence","cv","home","mandante","time_casa","timea","time_a","time_a_vence","casa_vencer","vitoria_casa","odd_ftc","odd_casa","odd_casa_vence","odd_home","odd_mandante","odd_time_a","odd_vitoria_casa"],
    empate:["fte","empate","draw","x","odd_fte","odd_empate","odd_draw","odd_x"],
    fora_vence:["ftv","fora","fora_vence","fv","away","visitante","visitante_vence","time_fora","timeb","time_b","time_b_vence","fora_vencer","vitoria_fora","odd_ftv","odd_fora","odd_fora_vence","odd_away","odd_visitante","odd_time_b","odd_vitoria_fora"],
    over5:["o5","ge5","e5+","e5","over5","over_5","5+","odd_over_5","odd_ge5","odd_5+"],
    casa5:["casa5","casa_5","c5","tgc5","tcg5","time_gols_casa_5","odd_casa5","odd_casa_5","odd_tgc5"],
    fora5:["fora5","fora_5","f5","tgv5","tvg5","time_gols_fora_5","time_gols_visitante_5","odd_fora5","odd_fora_5","odd_tgv5"]
  };
  return map[m.key]||[];
}
function oddFromObj(odds,m){
  if(!odds||typeof odds!=="object")return null;
  const low={},norm={};
  const normalize=k=>String(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
  Object.keys(odds).forEach(k=>{
    const v=Number(String(odds[k]).replace(",","."));
    low[String(k).toLowerCase()]=v;
    norm[normalize(k)]=v;
  });
  for(const k of marketAliases(m)){
    const v=low[String(k).toLowerCase()];
    if(Number.isFinite(v)&&v>1)return v;
    const nv=norm[normalize(k)];
    if(Number.isFinite(nv)&&nv>1)return nv;
  }
  return null;
}
function leadingIntFromText(value,min,max){
  const lines=String(value||"").split(/\n/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines.slice(0,3)){
    const m=line.match(/^(\d{1,2})(?:\D|$)/);
    if(!m)continue;
    const n=Number(m[1]);
    if(Number.isInteger(n)&&n>=min&&n<=max)return n;
  }
  return null;
}
function rowHourInfo(cells){
  for(let i=0;i<Math.min(cells.length,4);i++){
    const txt=cells[i]?.innerText||"";
    if(/\s+x\s+|@|o25|o35|u25|u35|ambs|ambn|ftc|fte|ftv/i.test(txt))continue;
    const hour=leadingIntFromText(txt,0,23);
    if(Number.isInteger(hour)&&hour>=0&&hour<=23)return {hour,index:i};
  }
  return null;
}
function minuteHeaderIndex(cells){
  for(let i=0;i<Math.min(cells.length,5);i++){
    const txt=esc(cells[i]?.innerText||"").trim().toLowerCase();
    if(txt==="h"||txt==="hora"||txt==="horario")return i;
  }
  return -1;
}
function fillMinuteByCol(rows){
  const minuteByCol={};
  rows.forEach(tr=>{
    const cells=[...tr.children];
    const headerIndex=minuteHeaderIndex(cells);
    if(headerIndex<0)return;
    cells.forEach((c,i)=>{
      if(i<=headerIndex)return;
      const n=leadingIntFromText(c.innerText||"",0,59);
      if(Number.isInteger(n)&&n>=0&&n<60)minuteByCol[i]=n;
    });
  });
  return minuteByCol;
}
function isReaderVisibleElement(el){
  if(!el||el.closest?.(`#${PANEL},#bbtips-robo-root,#bbtips-robo-desenho,script,style,noscript`))return false;
  const r=el.getBoundingClientRect?.();
  if(!r||r.width<35||r.height<24||r.width>360||r.height>260)return false;
  if(r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth)return false;
  const st=getComputedStyle(el);
  return st.display!=="none"&&st.visibility!=="hidden"&&Number(st.opacity||1)>0.05;
}
function timeFromGameText(txt){
  const lines=String(txt||"").split(/\n/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines.slice(0,4)){
    const m=line.match(/^(?:hor[aá]rio|hora)?\s*[:\-]?\s*(\d{1,2})[.:](\d{2})$/i);
    if(!m)continue;
    const h=Number(m[1]),mi=Number(m[2]);
    if(h>=0&&h<24&&mi>=0&&mi<60)return `${h}.${String(mi).padStart(2,"0")}`;
  }
  return "";
}
function hasChildGameCell(el){
  return Array.from(el.children||[]).some(ch=>{
    const txt=ch.innerText||"";
    return /\s+x\s+/i.test(txt)&&Object.keys(oddsObjectFromText(txt)).length;
  });
}
function readVisibleGameRows(anchor=null, seen=new Set()){
  const out=[];
  const liga=activeLiga();
  const platform=currentPlatform();
  const hours=currentHours();
  document.querySelectorAll("td,div").forEach((el,idx)=>{
    if(!isReaderVisibleElement(el)||hasChildGameCell(el))return;
    const txt=el.innerText||"";
    if(!/\s+x\s+/i.test(txt)||hasResult(txt))return;
    const odds=oddsObjectFromText(txt);
    if(!Object.keys(odds).length)return;
    const name=gameName(txt);
    if(!name||name.length<5)return;
    const time=timeFromGameText(txt);
    if(!time||!isScheduleFuture(time,anchor))return;
    const key=["dom-visible",platform,liga||"auto",time||"sem-hora",name].join("|");
    if(seen.has(key))return;
    seen.add(key);
    out.push({
      key,
      liga,
      time,
      name,
      score:null,
      odds,
      future:true,
      platform,
      hours,
      api:"dom-grid",
      idx,
      txt:String(txt).slice(0,500)
    });
  });
  return out.sort((a,b)=>scheduleDistance(a.time,anchor)-scheduleDistance(b.time,anchor)).slice(0,160);
}
function txtFromApiRow(r){
  const odds=MARKETS.map(m=>{
    const v=oddFromObj(r.odds,m);
    return v?`${marketAliases(m)[0]}@${v}`:"";
  }).filter(Boolean).join("\n");
  return `${r.name||""}\n${r.score?`${r.score.a}-${r.score.b}`:""}\n${odds}`;
}
function hasResult(txt){
  const clean=String(txt||"");
  const lines=clean.split(/\n/).map(x=>x.trim()).filter(Boolean);
  if(/\bOUT\b/i.test(clean))return true;
  if(lines.some(l=>/\s+x\s+.*\d+\+?\s*[-x]\s*\d+\+?$/i.test(l)))return true;
  if(lines.slice(1,4).some(l=>/^\d+\+?\s*[-x]\s*\d+\+?$/.test(l)))return true;
  return false;
}
function gameName(txt){
  const line=String(txt||"").split(/\n/).map(esc).find(x=>/\s+x\s+/i.test(x))||String(txt||"");
  const parts=line.split(/\s+x\s+/i);
  if(parts.length>=2){
    const a=esc(parts[0]).slice(-45);
    const b=esc(parts.slice(1).join(" x ")).replace(/\d+\+?\s*[-x]\s*\d+\+?$/,"").replace(/\s+(o15|u15|o25|o35|u25|u35|ambs|ambn|o5|5\+|ge5|ftc|fte|ftv).*/i,"").slice(0,45);
    return `${a} x ${b}`;
  }
  return esc(line).slice(0,90);
}
function parseApiOdds(raw){
  if(!raw)return{};
  if(typeof raw==="object")return raw;
  try{return JSON.parse(raw)}catch(e){}
  const out={};
  String(raw).split(/[;,|\n]/).forEach(p=>{
    const m=p.match(/([a-zA-Z0-9_.+]+)\s*@\s*(\d+(?:[,.]\d+)?)/);
    if(m)out[m[1].toLowerCase()]=Number(m[2].replace(",","."));
  });
  return out;
}
function collectExtraOdds(obj,out={}){
  if(!obj||typeof obj!=="object")return out;
  if(Array.isArray(obj)){
    obj.forEach(it=>collectExtraOdds(it,out));
    return out;
  }
  const k=obj.Nome??obj.nome??obj.Mercado??obj.mercado??obj.Tipo??obj.tipo??obj.Chave??obj.chave??obj.Key??obj.key??obj.Name??obj.name;
  const v=obj.Odd??obj.odd??obj.Valor??obj.valor??obj.Value??obj.value??obj.Cotacao??obj.cotacao;
  if(k!==undefined&&v!==undefined)out[String(k).toLowerCase()]=Number(String(v).replace(",","."));
  ["Odds","odds","Odd","odd","Mercados","mercados","Markets","markets","Cotacoes","cotacoes"].forEach(key=>{
    if(obj[key]!==undefined)collectExtraOdds(obj[key],out);
  });
  return out;
}
function apiScore(raw){
  return scoreFromResult(raw);
}
function apiTime(row,line){
  const h=row.Horario??row.horario??row.Hora??row.hora??line?.Horario??line?.horario??"";
  const min=row.Minuto??row.minuto;
  if(String(h).match(/^\d{1,2}[.:]\d{2}$/))return String(h).replace(":",".");
  if(h!==""&&min!==undefined)return `${Number(h)}.${String(min).padStart(2,"0")}`;
  return String(h||"");
}
function carameloLigaFromUrl(url){
  const map={copa:1,euro:2,super:3,premier:4,split:5,express:6};
  try{
    const u=new URL(String(url||""),location.href);
    const m=u.pathname.toLowerCase().match(/\/final\/([^/]+)\.json$/);
    if(m&&map[m[1]])return map[m[1]];
  }catch(e){}
  return null;
}
function isCarameloUrl(url){
  const u=String(url||"");
  return /caramelotips\.com\.br/i.test(u)||/\/final\/(copa|euro|super|premier|split|express)\.json/i.test(u);
}
function isCarameloPage(){
  return /caramelotips\.com\.br/i.test(location.hostname||"")||isCarameloUrl(location.href);
}
function carameloApiUrl(liga){
  const names={1:"copa",2:"euro",3:"super",4:"premier",5:"split",6:"express"};
  const name=names[Number(liga)];
  return name?new URL(`/final/${name}.json`,location.origin).href:"";
}
function carameloDatasetUrl(){
  try{
    return sessionStorage.getItem("datasetPath")||sessionStorage.getItem("ligaAtual")||location.href;
  }catch(e){return location.href}
}
function cellTextValue(cell){
  if(cell&&typeof cell==="object")return String(cell.v??cell.f??cell.text??cell.value??"");
  return String(cell??"");
}
function parseCarameloCell(raw,hour,liga,url,ri,ci){
  raw=String(raw||"").replace(/\r/g,"").trim();
  if(!raw||!/\s+x\s+/i.test(raw)||!/@/.test(raw))return null;
  const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const minuteLine=lines.slice().reverse().find(l=>/^\d{1,2}$/.test(l));
  const minute=Number(minuteLine);
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)return null;
  const first=lines.find(l=>/\s+x\s+/i.test(l))||"";
  const parts=first.split(/\s+x\s+/i);
  if(parts.length<2)return null;
  const home=parts.shift().trim();
  let away=parts.join(" x ").trim();
  let scoreText="";
  const scoreAtEnd=away.match(/^(.*?)(\d+\+?\s*[-x]\s*\d+\+?)$/);
  if(scoreAtEnd){
    away=scoreAtEnd[1].trim();
    scoreText=scoreAtEnd[2];
  }
  const scoreLine=lines.slice(1).find(l=>/^\d+\+?\s*[-x]\s*\d+\+?$/i.test(l));
  if(!scoreText&&scoreLine)scoreText=scoreLine;
  away=away.replace(/\s+(?:o15|u15|o25|u25|o35|u35|ambs|ambn|ftc|fte|ftv|ge5|tgv5|tgc5)@.*$/i,"").trim();
  if(!home||!away)return null;
  const score=scoreFromResult(scoreText);
  const odds=oddsObjectFromText(raw);
  if(!score&&!Object.keys(odds).length)return null;
  const time=`${hour}.${String(minute).padStart(2,"0")}`;
  const name=esc(`${home} x ${away}`);
  return {
    key:["caramelo",liga||"",time,name,score?`${score.a}-${score.b}`:"f",ri,ci].join("|"),
    liga,
    time,
    name,
    score,
    odds,
    future:!score,
    platform:"BET365",
    hours:currentHours(),
    api:url||"caramelo",
    idx:ri*100+ci,
    txt:raw.slice(0,500)
  };
}
function flattenCarameloApi(json,url){
  const rows=Array.isArray(json?.table?.rows)?json.table.rows:[];
  if(!rows.length)return [];
  const liga=carameloLigaFromUrl(url)||activeLiga();
  const out=[];
  rows.forEach((row,ri)=>{
    const cells=Array.isArray(row?.c)?row.c:[];
    const hour=leadingIntFromText(cellTextValue(cells[0]),0,23);
    if(!Number.isInteger(hour))return;
    cells.slice(1).forEach((cell,ci)=>{
      const parsed=parseCarameloCell(cellTextValue(cell),hour,liga,url,ri,ci+1);
      if(parsed)out.push(parsed);
    });
  });
  return out;
}
function liveCarameloRows(){
  try{
    const json=window.LOADED_JSON||window.__payloadTempoRealPendente?.json||window.__CARAMELO_JSON;
    if(!json?.table?.rows)return [];
    return flattenCarameloApi(json,carameloDatasetUrl());
  }catch(e){return []}
}
function flattenApi(json,url){
  const caramelo=flattenCarameloApi(json,url);
  if(caramelo.length)return caramelo;
  const out=[];
  const liga=ligaFromUrl(url);
  const linhas=Array.isArray(json?.Linhas)?json.Linhas:Array.isArray(json?.linhas)?json.linhas:Array.isArray(json)?json:[];
  linhas.forEach((linha,li)=>{
    const cols=Array.isArray(linha.Colunas)?linha.Colunas:Array.isArray(linha.colunas)?linha.colunas:Array.isArray(linha.Jogos)?linha.Jogos:[linha];
    cols.forEach((c,ci)=>{
      if(!c||typeof c!=="object")return;
      const score=apiScore(c.Resultado||c.resultado||c.Placar||c.placar||"");
      const a=c.TimeA||c.timeA||c.Casa||c.casa||c.TimeCasa||"";
      const b=c.TimeB||c.timeB||c.Fora||c.fora||c.TimeFora||"";
      const time=apiTime(c,linha);
      const odds=Object.assign({},parseApiOdds(c),parseApiOdds(c.Odds||c.odds||c.Odd||c.odd||c.Mercados||c.mercados||c.Markets||c.markets),collectExtraOdds(c));
      const future=/futuro=true/i.test(url)||Boolean(c.Futuro||c.futuro||(!score&&time));
      if(!a&&!b&&!time)return;
      out.push({
        key:[url,time,a,b,score?`${score.a}-${score.b}`:""].join("|"),
        liga,
        time,
        name:esc(`${a} x ${b}`),
        score,
        odds,
        future,
        platform:platformFromUrl(url),
        hours:hoursFromUrl(url)||currentHours(),
        api:url,
        idx:li*100+ci
      });
    });
  });
  return out;
}
function mergeApiRows(...sets){
  const by={};
  sets.flat().forEach(r=>{
    if(!r||typeof r!=="object")return;
    by[r.key||JSON.stringify([r.api,r.liga,r.time,r.name,r.idx])]=r;
  });
  return Object.values(by).slice(-5000);
}
function saveApiRows(rows){
  if(!rows.length)return;
  let stored=[];
  try{stored=JSON.parse(localStorage.getItem(API_STORE)||"[]")}catch(e){}
  API_ROWS=mergeApiRows(stored,rows);
  localStorage.setItem(API_STORE,JSON.stringify(API_ROWS));
  sendAgenteLocal(rowsForTelemetry(rows));
}
function compactTelemetryRow(r){
  const odds={};
  Object.entries(r.odds||{}).forEach(([k,v])=>{
    const n=Number(String(v).replace(",","."));
    if(Number.isFinite(n)&&n>1)odds[k]=Math.round(n*100)/100;
  });
  const api=String(r.api||"").slice(0,240);
  return {
    key:String(r.key||[r.liga||"",r.time||"",r.name||"",r.score?`${r.score.a}-${r.score.b}`:"",r.future?"f":"h"].join("|")),
    liga:r.liga??ligaFromUrl(r.api||"")??null,
    time:String(r.time||""),
    name:String(r.name||""),
    score:r.score||null,
    odds,
    future:!!r.future,
    platform:String(r.platform||platformFromUrl(r.api||"")).toUpperCase(),
    hours:String(r.hours||hoursFromUrl(r.api||"")||currentHours()),
    api,
    idx:Number(r.idx||0)
  };
}
function oddsObjectFromText(txt){
  const odds={};
  MARKETS.forEach(m=>{
    const value=oddsForMarket(txt,m)[0];
    if(!value)return;
    odds[m.key]=Math.round(value*100)/100;
    const alias=marketAliases(m)[0];
    if(alias)odds[alias]=Math.round(value*100)/100;
  });
  return odds;
}
function readGridRowsForTelemetry(anchor=null){
  const upcoming=upcomingSetFromPage();
  const futureAnchor=anchor??scheduleAnchorFromRows([...upcoming]);
  const out=[],seen=new Set();
  const liga=activeLiga();
  const platform=currentPlatform();
  const hours=currentHours();
  document.querySelectorAll("table").forEach(table=>{
    const rows=[...table.querySelectorAll("tr")];
    const minuteByCol=fillMinuteByCol(rows);
    rows.forEach(tr=>{
      const cells=[...tr.children];
      const hourInfo=rowHourInfo(cells);
      if(!hourInfo)return;
      const {hour,index:hourIndex}=hourInfo;
      cells.forEach((cell,i)=>{
        if(i<=hourIndex||minuteByCol[i]===undefined)return;
        const txt=cell.innerText||"";
        if(!/\s+x\s+/i.test(txt)||hasResult(txt))return;
        const time=`${hour}.${String(minuteByCol[i]).padStart(2,"0")}`;
        if(!isScheduleFuture(time,futureAnchor))return;
        const name=gameName(txt);
        const odds=oddsObjectFromText(txt);
        if(!Object.keys(odds).length)return;
        const key=["dom-grid",platform,liga||"auto",time,name].join("|");
        if(seen.has(key))return;
        seen.add(key);
        out.push({
          key,
          liga,
          time,
          name,
          score:null,
          odds,
          future:true,
          platform,
          hours,
          api:"dom-grid",
          idx:i,
          txt:String(txt).slice(0,500)
        });
      });
    });
  });
  readVisibleGameRows(futureAnchor,seen).forEach(row=>out.push(row));
  return out.sort((a,b)=>scheduleDistance(a.time,futureAnchor)-scheduleDistance(b.time,futureAnchor)).slice(0,160);
}
function gameRowsForTelemetry(games=[]){
  const liga=activeLiga();
  const platform=currentPlatform();
  const hours=currentHours();
  return games.filter(g=>g&&g.time&&g.name&&g.market&&g.odd).map((g,i)=>{
    const odds={};
    const odd=Math.round(Number(g.odd)*100)/100;
    odds[g.market.key]=odd;
    const alias=marketAliases(g.market)[0];
    if(alias)odds[alias]=odd;
    return {
      key:["robot-game",platform,liga||"auto",g.time,g.name,g.market.key,odd].join("|"),
      liga,
      time:String(g.time||""),
      name:String(g.name||""),
      score:null,
      odds,
      future:true,
      platform,
      hours,
      api:"robot-game",
      idx:i,
      txt:String(g.text||"").slice(0,500)
    };
  });
}
function isVisibleFutureRow(r){
  if(!r||!r.future||r.score)return false;
  const api=String(r.api||"");
  return api==="dom-grid"||api==="robot-game"||/futebolvirtual|caramelotips|\/final\//i.test(api);
}
function rowsForTelemetry(seed=[]){
  const by={};
  const hours=currentHours();
  const futureAnchor=scheduleAnchorFromRows([...upcomingSetFromPage()])??scheduleAnchorFromRows(seed);
  [...API_ROWS,...seed,...readGridRowsForTelemetry(futureAnchor)].forEach(r=>{
    if(!r||typeof r!=="object")return;
    const rowHours=String(r.hours||hoursFromUrl(r.api||"")||hours);
    if(rowHours!==hours)return;
    by[r.key||JSON.stringify([r.liga,r.time,r.name,r.idx])]=r;
  });
  const groups={};
  Object.values(by).forEach(r=>{
    const liga=r.liga??ligaFromUrl(r.api||"")??"auto";
    (groups[liga]||(groups[liga]=[])).push(r);
  });
  const out=[],seen=new Set();
  Object.values(groups).forEach(group=>{
    const futures=group.filter(r=>isVisibleFutureRow(r)&&(!r.time||isScheduleFuture(r.time,futureAnchor))).sort((a,b)=>scheduleDistance(a.time,futureAnchor)-scheduleDistance(b.time,futureAnchor)).slice(0,6);
    const hist=group.filter(r=>r.score&&!r.future).slice(-540);
    [...futures,...hist].forEach(r=>{
      const row=compactTelemetryRow(r);
      if(seen.has(row.key))return;
      seen.add(row.key);
      out.push(row);
    });
  });
  return out.slice(-3600);
}
function sendAgenteLocal(rows, opts={}){
  const now=Date.now();
  if(!CONFIG.scannerTelemetry&&!opts.force)return;
  const force=!!opts.force;
  if(!rows.length||(!force&&now-AGENTE_LOCAL_TS<120000))return;
  if(!force)AGENTE_LOCAL_TS=now;
  const hours=currentHours();
  const platform=currentPlatform();
  try{
    window.postMessage({type:"BBTIPS_AGENT_ROWS",source:"bbtips_extension",sentAt:now,platform,hours,force,rows},"*");
  }catch(e){}
  try{
    const cfg=window.__BBTIPS_REMOTE_CONFIG||{};
    if(!cfg.apiBase||!cfg.token)return;
    fetch(`${cfg.apiBase}/api/telemetry`,{
      method:"POST",
      keepalive:true,
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${cfg.token}`},
      body:JSON.stringify({
        kind:"collector_rows",
        sentAt:new Date(now).toISOString(),
        url:location.href,
        liga:activeLiga(),
        platform,
        hours,
        force,
        market:CONFIG.market,
        rows
      })
    }).catch(()=>{});
  }catch(e){}
}
function sendResultadosAgenteLocal(){
  try{
    if(!Array.isArray(RESULTS_CACHE)||!RESULTS_CACHE.length)return;
    const rows=RESULTS_CACHE.filter(r=>{
      const liga=Number(r?.liga)||ligaFromUrl(r?.api||"");
      return r&&r.score&&r.name&&liga;
    }).slice(-800).map(r=>({
      key:["result-cache",r.time||"",r.name||"",`${r.score.a}-${r.score.b}`].join("|"),
      liga:Number(r.liga)||ligaFromUrl(r.api||"")||null,
      time:String(r.time||""),
      name:String(r.name||""),
      score:r.score,
      odds:{},
      future:false,
      api:"result-cache"
    }));
    if(!rows.length)return;
    sendAgenteLocal(rows);
  }catch(e){}
}
function loadApiRows(){
  try{API_ROWS=JSON.parse(localStorage.getItem(API_STORE)||"[]")}catch(e){API_ROWS=[]}
  const live=liveCarameloRows();
  if(live.length){
    API_ROWS=mergeApiRows(API_ROWS,live);
    try{localStorage.setItem(API_STORE,JSON.stringify(API_ROWS))}catch(e){}
  }
}
function rowScoreText(r){return r?.score?`${r.score.a}-${r.score.b}`:""}
function resultKey(r){
  return [
    r.api?"api":"dom",
    r.liga||"",
    String(r.time||""),
    String(r.name||"").toLowerCase(),
    rowScoreText(r),
    String(r.txt||"").replace(/\s+/g," ").slice(-180)
  ].join("|");
}
function loadStoredResults(){
  try{
    const rows=JSON.parse(localStorage.getItem(HIST_STORE)||"[]");
    return Array.isArray(rows)?rows.filter(r=>r&&r.score&&r.name):[];
  }catch(e){return []}
}
function saveStoredResults(rows){
  const now=Date.now();
  if(now-LAST_HIST_SAVE_TS<30000)return;
  LAST_HIST_SAVE_TS=now;
  try{localStorage.setItem(HIST_STORE,JSON.stringify(rows.slice(0,2500)))}catch(e){}
}
function processApiText(url,text,opts={}){
  if(!/futebolvirtual|Linhas|Colunas|TimeA|TimeB|Odds|Resultado|caramelotips|\/final\/|\"table\"|o25@|o35@|ambs@/i.test(String(url)+" "+String(text).slice(0,500)))return;
  try{
    const rows=flattenApi(JSON.parse(text),url);
    if(opts.returnRows)return rows;
    saveApiRows(rows);
    return rows;
  }catch(e){return []}
}
function hookApi(){
  if(!window.__BBTIPS_FINAL_API_HOOK&&window.fetch){
    window.__BBTIPS_FINAL_API_HOOK=true;
    const orig=window.fetch;
    window.fetch=async function(...args){
      const url=String(args[0]?.url||args[0]||"");
      const res=await orig.apply(this,args);
      try{res.clone().text().then(t=>processApiText(url,t)).catch(()=>{})}catch(e){}
      return res;
    };
  }
  if(!window.__BBTIPS_FINAL_XHR_HOOK&&window.XMLHttpRequest){
    window.__BBTIPS_FINAL_XHR_HOOK=true;
    const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(method,url,...rest){this.__bbtips_url=String(url||"");return open.call(this,method,url,...rest)};
    XMLHttpRequest.prototype.send=function(...args){
      this.addEventListener("load",()=>{try{processApiText(this.__bbtips_url||"",this.responseText||"")}catch(e){}});
      return send.apply(this,args);
    };
  }
}
function ligaFromUrl(url){
  const caramelo=carameloLigaFromUrl(url);
  if(caramelo)return caramelo;
  try{
    const v=new URL(url,location.href).searchParams.get("liga");
    return v?Number(v):null;
  }catch(e){return null}
}
function activeLiga(){
  ACTIVE_LIGA_BLOCKED=false;
  if(!CONFIG.ligaAuto)return null;
  try{
    const caramelo=carameloLigaFromUrl(carameloDatasetUrl());
    if(caramelo)return caramelo;
  }catch(e){}
  const names={express:6,copa:1,euro:2,super:3,premier:4,split:5};
  let best=null,bestScore=-1;
  document.querySelectorAll("button,div,span,a,li").forEach(el=>{
    const txt=esc(el.innerText||"").toLowerCase();
    if(!names[txt])return;
    const r=el.getBoundingClientRect?.();
    if(!r||r.width<45||r.height<18||r.top<0||r.top>Math.min(innerHeight,240))return;
    const st=getComputedStyle(el);
    const bg=st.backgroundColor||"";
    const m=bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    const rgb=m?{r:Number(m[1]),g:Number(m[2]),b:Number(m[3])}:null;
    const isBlue=rgb?(rgb.b>rgb.r+25&&rgb.b>rgb.g+10):false;
    const isPurple=rgb?(rgb.b>100&&rgb.r>60&&rgb.b>rgb.g):false;
    const cls=(el.className||"").toString();
    const active=/active|selected|ativo|current/i.test(cls)?200:0;
    const aria=(el.getAttribute?.("aria-selected")==="true"||el.getAttribute?.("aria-current"))?200:0;
    const selected=(isBlue||isPurple)?120:0;
    const score=active+aria+selected+Math.min(60,r.width/4)+(240-r.top)/4;
    if(score>bestScore){bestScore=score;best=names[txt]}
  });
  if(best===6&&currentPlatform()==="BET365"){
    ACTIVE_LIGA_BLOCKED=true;
    return null;
  }
  return best;
}
function ligaNome(){const l=activeLiga();return l?`Liga ${l}`:"Liga auto"}
function currentPlatform(){
  const known=[
    ["BET365",/\bbet\s*365\b/i],
    ["PLAYPIX",/\bplay\s*pix\b/i],
    ["KIRON",/\bkiron\b/i],
    ["SUPERBET",/\bsuper\s*bet\b/i],
    ["BETANO",/\bbetano\b/i],
    ["SPORTINGBET",/\bsporting\s*bet\b/i],
    ["BETFAIR",/\bbetfair\b/i],
    ["NOVIBET",/\bnovibet\b/i]
  ];
  const fromText=text=>{
    const found=known.find(([,re])=>re.test(text||""));
    return found?found[0]:null;
  };
  try{
    let selected="";
    document.querySelectorAll("select").forEach(s=>{
      selected+=" "+esc(s.selectedOptions?.[0]?.innerText||s.value||"");
    });
    const fromSelected=fromText(selected);
    if(fromSelected)return fromSelected;
    let active="";
    document.querySelectorAll("button,div,span,a,li").forEach(el=>{
      const cls=(el.className||"").toString();
      const aria=el.getAttribute?.("aria-selected")==="true"||el.getAttribute?.("aria-current");
      if(!aria&&!/active|selected|ativo|current/i.test(cls))return;
      active+=" "+esc(el.innerText||"");
    });
    const fromActive=fromText(active);
    if(fromActive)return fromActive;
  }catch(e){}
  return "BET365";
}
function platformFromUrl(url){
  try{
    return (new URL(url,location.href).searchParams.get("plataforma")||currentPlatform()).toUpperCase();
  }catch(e){return currentPlatform()}
}
function hoursFromUrl(url){
  try{
    const value=new URL(url,location.href).searchParams.get("Horas")||"";
    return /^Horas\d+$/i.test(value)?value.replace(/^horas/i,"Horas"):null;
  }catch(e){return null}
}
function currentHours(){
  const read=text=>{
    const raw=String(text||"");
    for(const re of [/\b(\d+)\s*horas?\b/ig,/\bHoras\s*(\d+)\b/ig]){
      let hit;
      while((hit=re.exec(raw))){
        const n=Number(hit[1]);
        if(n===3||n===5)return `Horas${n}`;
      }
    }
    return null;
  };
  try{
    let selected="";
    document.querySelectorAll("select").forEach(s=>{
      selected+=" "+esc(s.selectedOptions?.[0]?.innerText||s.value||"");
    });
    const fromSelect=read(selected);
    if(fromSelect)return fromSelect;
    let active="";
    document.querySelectorAll("button,div,span,label").forEach(el=>{
      const r=el.getBoundingClientRect?.();
      if(!r||r.width<20||r.height<12||r.top<0||r.top>260)return;
      const txt=esc(el.innerText||"").trim();
      if(!/\b\d+\s*horas?\b/i.test(txt)&&!/\bHoras\s*\d+\b/i.test(txt))return;
      const cls=(el.className||"").toString();
      const st=getComputedStyle(el);
      const bg=st.backgroundColor||"";
      const isSelected=/active|selected|ativo|current/i.test(cls)||el.getAttribute?.("aria-selected")==="true"||el.getAttribute?.("aria-current")||/rgb\(.*(70|71|72|73|74|75|76|77|78|79|80)/.test(bg);
      active+=" "+(isSelected?`${txt} `:"")+txt;
    });
    const fromActive=read(active);
    if(fromActive)return fromActive;
  }catch(e){}
  return read(CONFIG.horas)||"Horas3";
}
function ligaLabel(liga){return LIGA_LABELS[liga]||`Liga ${liga}`}
function apiUrl(liga,futuro){
  return `https://api.thtips.com.br/api/futebolvirtual?liga=${liga}&futuro=${futuro?"true":"false"}&Horas=${currentHours()}&tipoOdd=&dadosAlteracao=&filtros=${encodeURIComponent(CONFIG.filtros)}&confrontos=false&hrsConfrontos=240&plataforma=${encodeURIComponent(currentPlatform())}`;
}
async function carregarApiDireto(opts={}){
  if(SCANNER_COLLECTING&&opts.silent)return [];
  SCANNER_COLLECTING=true;
  const erros=[];
  const allRows=[];
  try{
    const ligaAtual=activeLiga();
    const ligas=ligaAtual?[ligaAtual]:CONFIG.radarLigas;
    if(isCarameloPage()){
      for(const liga of ligas){
        const url=carameloApiUrl(liga);
        if(!url)continue;
        try{
          const r=await fetch(url,{credentials:"include",cache:"no-store"});
          const txt=await r.text();
          const rows=processApiText(url,txt,{returnRows:true})||[];
          if(rows.length)allRows.push(...rows);
          if(!r.ok)erros.push(`${liga} caramelo ${r.status}`);
        }catch(e){erros.push(`${liga} caramelo falhou`)}
      }
    }else{
      for(const liga of ligas){
        for(const futuro of [false,true]){
          const url=apiUrl(liga,futuro);
          try{
            const r=await fetch(url,{credentials:"include",cache:"no-store"});
            const txt=await r.text();
            const rows=processApiText(url,txt,{returnRows:true})||[];
            if(rows.length)allRows.push(...rows);
            if(!r.ok)erros.push(`${liga} ${futuro?"futuro":"hist"} ${r.status}`);
          }catch(e){erros.push(`${liga} ${futuro?"futuro":"hist"} falhou`)}
        }
      }
    }
    if(allRows.length)saveApiRows(allRows);
  }finally{
    SCANNER_COLLECTING=false;
  }
  loadApiRows();
  refreshResultsCache();
  if(!opts.silent)sendAgenteLocal(rowsForTelemetry(allRows),{force:true});
  if(!opts.silent)draw();
  return erros;
}
function upcomingSetFromPage(){
  const set=new Set();
  document.querySelectorAll("tr").forEach(tr=>{
    const cells=[...tr.children].map(c=>esc(c.innerText||""));
    if(cells.length<2)return;
    if(/^\d{1,2}[.:]\d{2}$/.test(cells[0])&&/\s+x\s+/i.test(cells[1]))set.add(cells[0].replace(":","."));
  });
  return set;
}
function readGridGames(){
  const games=[],seen=new Set();
  // Prioridade: jogos futuros vindos da API real (sem varrer a pagina).
  const liga0=activeLiga();
  const apiFut=API_ROWS
    .filter(r=>r&&r.future&&!r.score&&(!liga0||!r.liga||Number(r.liga)===Number(liga0)))
    .filter(r=>!r.time||isFuture(r.time));
  if(apiFut.length){
    apiFut.forEach(r=>{
      activeMarkets().forEach(m=>{
        const odd=oddFromObj(r.odds,m);
        if(!odd)return;
        const key=`${r.time}|${r.name}|${m.key}|${odd}`;
        if(seen.has(key))return;
        seen.add(key);
        games.push({time:r.time,name:r.name,market:m,odd,text:r.txt||txtFromApiRow(r),api:true});
      });
    });
    if(games.length)return games.sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)).slice(0,CONFIG.maxProximos);
  }
  const upcoming=upcomingSetFromPage();
  document.querySelectorAll("table").forEach(table=>{
    const rows=[...table.querySelectorAll("tr")];
    const minuteByCol=fillMinuteByCol(rows);
    rows.forEach(tr=>{
      const cells=[...tr.children];
      const hourInfo=rowHourInfo(cells);
      if(!hourInfo)return;
      const {hour,index:hourIndex}=hourInfo;
      cells.forEach((cell,i)=>{
        if(i<=hourIndex||minuteByCol[i]===undefined)return;
        const txt=cell.innerText||"";
        if(!/\s+x\s+/i.test(txt))return;
        const time=`${hour}.${String(minuteByCol[i]).padStart(2,"0")}`;
        if(upcoming.size&& !upcoming.has(time))return;
        if(!isFuture(time))return;
        if(hasResult(txt))return;
        const name=gameName(txt);
        activeMarkets().forEach(m=>{
          const odds=oddsForMarket(txt,m);
          if(!odds.length)return;
          const key=`${time}|${name}|${m.key}|${odds[0]}`;
          if(seen.has(key))return;
          seen.add(key);
          games.push({time,name,market:m,odd:odds[0],text:txt});
        });
      });
    });
  });
  if(games.length)return games.sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)).slice(0,CONFIG.maxProximos);
  readVisibleGameRows(scheduleAnchorFromRows([...upcoming]),seen).forEach(r=>{
    activeMarkets().forEach(m=>{
      const odd=oddFromObj(r.odds,m);
      if(!odd)return;
      const key=`${r.time}|${r.name}|${m.key}|${odd}`;
      if(seen.has(key))return;
      seen.add(key);
      games.push({time:r.time,name:r.name,market:m,odd,text:r.txt,api:true});
    });
  });
  if(games.length)return games.sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)).slice(0,CONFIG.maxProximos);
  const liga=activeLiga();
  if(liga){
    API_ROWS
      .filter(r=>r&&r.future&&!r.score&&Number(r.liga)===Number(liga))
      .filter(r=>!r.time||isFuture(r.time))
      .forEach(r=>{
        activeMarkets().forEach(m=>{
          const odd=oddFromObj(r.odds,m);
          if(!odd)return;
          const key=`${r.time}|${r.name}|${m.key}|${odd}`;
          if(seen.has(key))return;
          seen.add(key);
          games.push({time:r.time,name:r.name,market:m,odd,text:txtFromApiRow(r),api:true});
        });
      });
  }
  if(games.length)return games.sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)).slice(0,CONFIG.maxProximos);
  return [];
}
function numericArray(v){
  if(!Array.isArray(v)||v.length<25)return null;
  const vals=v.map(x=>{
    if(typeof x==="number")return x;
    if(x&&typeof x==="object")return Number(x.y??x.value??x.valor??x.pct??x.percentual??x[1]);
    return Number(x);
  }).filter(n=>Number.isFinite(n)&&n>=0&&n<=100);
  return vals.length>=25?vals:null;
}
function addSeries(out,path,data){
  const vals=numericArray(data);
  if(vals)out.push({path,vals:vals.slice(-1200)});
}
function signedNumericArray(v){
  if(!Array.isArray(v)||v.length<12)return null;
  const vals=v.map(x=>{
    if(typeof x==="number")return x;
    if(x&&typeof x==="object")return Number(x.y??x.value??x.valor??x.pct??x.percentual??x[1]);
    return Number(x);
  }).filter(n=>Number.isFinite(n)&&n>=-100&&n<=100);
  return vals.length>=12?vals:null;
}
function addSignedSeries(out,path,data){
  const vals=signedNumericArray(data);
  if(vals)out.push({path,vals:vals.slice(-1200)});
}
function scanObj(obj,path,depth,out,seen){
  if(!obj||depth>4||seen.has(obj))return;
  if(typeof obj==="object")seen.add(obj);
  const arr=numericArray(obj);
  if(arr){out.push({path,vals:arr.slice(-1200)});return}
  if(typeof obj!=="object")return;
  Object.keys(obj).slice(0,80).forEach(k=>{
    if(depth>1&&!/trend|tend|graf|chart|serie|data|merc|over|under|amb|macd|rsi|hist|linha|sinal/i.test(k))return;
    try{scanObj(obj[k],`${path}.${k}`,depth+1,out,seen)}catch(e){}
  });
}
function scanChartLibraries(out){
  try{
    if(window.Chart){
      document.querySelectorAll("canvas").forEach((cv,i)=>{
        let ch=null;
        try{ch=window.Chart.getChart?window.Chart.getChart(cv):null}catch(e){}
        if(!ch&&cv.chart)ch=cv.chart;
        (ch?.data?.datasets||[]).forEach((d,j)=>addSeries(out,`Chart.${i}.${d.label||j}`,d.data));
      });
    }
  }catch(e){}
  try{
    if(window.echarts){
      document.querySelectorAll("div,canvas").forEach((el,i)=>{
        let inst=null;
        try{inst=window.echarts.getInstanceByDom(el)}catch(e){}
        (inst?.getOption?.().series||[]).forEach((s,j)=>addSeries(out,`ECharts.${i}.${s.name||j}`,s.data));
      });
    }
  }catch(e){}
  try{
    const inst=window.Apex?._chartInstances;
    if(inst)Object.values(inst).forEach((it,i)=>{
      const series=it?.chart?.w?.config?.series||it?.w?.config?.series||it?.series||[];
      series.forEach((s,j)=>addSeries(out,`Apex.${i}.${s.name||j}`,s.data||s));
    });
  }catch(e){}
  try{
    if(window.Highcharts?.charts){
      window.Highcharts.charts.filter(Boolean).forEach((ch,i)=>(ch.series||[]).forEach((s,j)=>addSeries(out,`Highcharts.${i}.${s.name||j}`,s.yData||s.data)));
    }
  }catch(e){}
  try{
    document.querySelectorAll(".js-plotly-plot").forEach((el,i)=>(el.data||[]).forEach((s,j)=>addSeries(out,`Plotly.${i}.${s.name||j}`,s.y||s.data)));
  }catch(e){}
}
function scanChartIndicatorLibraries(out){
  try{
    if(window.Chart)document.querySelectorAll("canvas").forEach((cv,i)=>{
      let ch=null;
      try{ch=window.Chart.getChart?window.Chart.getChart(cv):null}catch(e){}
      if(!ch&&cv.chart)ch=cv.chart;
      (ch?.data?.datasets||[]).forEach((d,j)=>addSignedSeries(out,`Chart.${i}.${d.label||j}`,d.data));
    });
  }catch(e){}
  try{
    if(window.echarts)document.querySelectorAll("div,canvas").forEach((el,i)=>{
      let inst=null;
      try{inst=window.echarts.getInstanceByDom(el)}catch(e){}
      (inst?.getOption?.().series||[]).forEach((s,j)=>addSignedSeries(out,`ECharts.${i}.${s.name||j}`,s.data));
    });
  }catch(e){}
  try{
    const inst=window.Apex?._chartInstances;
    if(inst)Object.values(inst).forEach((it,i)=>{
      const series=it?.chart?.w?.config?.series||it?.w?.config?.series||it?.series||[];
      series.forEach((s,j)=>addSignedSeries(out,`Apex.${i}.${s.name||j}`,s.data||s));
    });
  }catch(e){}
  try{
    if(window.Highcharts?.charts)window.Highcharts.charts.filter(Boolean).forEach((ch,i)=>(ch.series||[]).forEach((s,j)=>addSignedSeries(out,`Highcharts.${i}.${s.name||j}`,s.yData||s.data)));
  }catch(e){}
  try{document.querySelectorAll(".js-plotly-plot").forEach((el,i)=>(el.data||[]).forEach((s,j)=>addSignedSeries(out,`Plotly.${i}.${s.name||j}`,s.y||s.data)))}catch(e){}
}
function canvasLineSeries(){
  const out=[];
  document.querySelectorAll("canvas").forEach((cv,idx)=>{
    const r=cv.getBoundingClientRect();
    if(r.width<500||r.height<180)return;
    let ctx;
    try{ctx=cv.getContext("2d",{willReadFrequently:true})}catch(e){return}
    if(!ctx)return;
    let img;
    try{img=ctx.getImageData(0,0,cv.width,cv.height)}catch(e){return}
    const data=img.data,w=cv.width,h=cv.height;
    const pts=[];
    const step=Math.max(1,Math.floor(w/260));
    for(let x=0;x<w;x+=step){
      let best=null,bestScore=0;
      for(let y=0;y<h;y++){
        const p=(y*w+x)*4,rr=data[p],gg=data[p+1],bb=data[p+2],aa=data[p+3];
        if(aa<180)continue;
        const white=rr>180&&gg>180&&bb>180;
        const green=gg>150&&rr<120&&bb<140;
        const red=rr>170&&gg<100&&bb<100;
        if(!white&&!green&&!red)continue;
        const score=(white?3:1)+(255-y/h);
        if(score>bestScore){bestScore=score;best=y}
      }
      if(best!==null)pts.push({x,y:best});
    }
    if(pts.length<40)return;
    const ys=pts.map(p=>p.y);
    const minY=Math.min(...ys),maxY=Math.max(...ys);
    if(maxY-minY<30)return;
    const vals=pts.map(p=>100-(p.y-minY)/(maxY-minY)*100).filter(n=>Number.isFinite(n));
    if(vals.length>=40)out.push({path:`canvas.linha-grafica.${idx}`,vals:vals.slice(-1200)});
  });
  return out;
}
function trendSeries(){
  const out=[],seen=new WeakSet();
  scanChartLibraries(out);
  canvasLineSeries().forEach(s=>out.push(s));
  if(TOOLTIP_SERIES.length>=20)out.unshift({path:"tooltip.real-do-site",vals:TOOLTIP_SERIES.slice(-1200)});
  Object.keys(window).forEach(k=>{
    if(!/trend|tend|graf|chart|serie|data|merc|fut|bola|json|apex|echart|high/i.test(k))return;
    try{scanObj(window[k],"window."+k,0,out,seen)}catch(e){}
  });
  scanVisualGraph(out);
  return out.map(s=>{
    const cur=s.vals.at(-1),min=Math.min(...s.vals),max=Math.max(...s.vals);
    const score=(/trend|tend|graf|chart|serie|linha/i.test(s.path)?45:0)+(/sinal|macd|histograma|rsi/i.test(s.path)?20:0)+(s.vals.length>=120?20:0)+(max-min>12?20:0);
    return {...s,cur,min,max,score};
  }).filter(s=>s.max-s.min>=8).sort((a,b)=>b.score-a.score||b.vals.length-a.vals.length).slice(0,8);
}
function robotDirectGraphSeries(){
  const out=[];
  scanChartLibraries(out);
  const indicators=[];
  scanChartIndicatorLibraries(indicators);
  const marketPatterns={
    over25:/over\s*2[.,]?5|over2\s*5|\bo25\b/i,
    over35:/over\s*3[.,]?5|over3\s*5|\bo35\b/i,
    ambas_sim:/ambas.*sim|ambas.*marcam|\bambs\b|btts/i
  };
  const wanted=marketPatterns[CONFIG.market];
  const candidates=out
    .filter(s=>Array.isArray(s.vals)&&s.vals.length>=20)
    .filter(s=>!/(?:macd|histograma|histogram|rsi|sinal|signal|media|m[eé]dia|topo|fundo)/i.test(s.path))
    .map(s=>{
      const vals=s.vals.map(Number).filter(Number.isFinite);
      const range=vals.length?Math.max(...vals)-Math.min(...vals):0;
      const marketMatch=wanted?.test(s.path)?1:0;
      const library=/^(?:Chart|ECharts|Apex|Highcharts|Plotly)\./.test(s.path)?1:0;
      return {...s,vals,range,marketMatch,score:marketMatch*200+library*60+Math.min(40,vals.length/4)+Math.min(30,range)};
    })
    .filter(s=>s.range>=5)
    .sort((a,b)=>b.score-a.score||b.vals.length-a.vals.length);
  const best=candidates.find(s=>s.marketMatch)||null;
  const histogram=indicators
    .filter(s=>/(?:histograma|histogram)/i.test(s.path)&&Array.isArray(s.vals)&&s.vals.length>=12)
    .sort((a,b)=>b.vals.length-a.vals.length)[0]||null;
  return best?{values:best.vals.slice(-420),path:best.path,histValues:histogram?.vals?.slice(-420)||[],histPath:histogram?.path||""}:null;
}
function tooltipMarketRegex(){
  const n=market().name
    .replace("Ambas Sim","Ambas Marcam")
    .replace("Ambas Nao","Ambas Nao")
    .replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return new RegExp(`${n}\\s*:?\\s*(-?\\d+(?:[,.]\\d+)?)`,"i");
}
function readTooltipText(){
  const texts=[];
  document.querySelectorAll("div,span").forEach(el=>{
    const r=el.getBoundingClientRect?.();
    if(!r||r.width<20||r.height<10||r.width>420||r.height>240)return;
    const t=esc(el.innerText||el.textContent||"");
    if(/RSI|MACD|Sinal|Histograma|Marcam|Over|Under|Ambas/i.test(t))texts.push(t);
  });
  return texts.join(" | ");
}
function captureTooltipSeries(){
  const cvs=[...document.querySelectorAll("canvas")].filter(cv=>{
    const r=cv.getBoundingClientRect();
    return r.width>500&&r.height>180;
  });
  const cv=cvs[0];
  if(!cv)return;
  const r=cv.getBoundingClientRect();
  const re=tooltipMarketRegex();
  const vals=[];
  for(let i=0;i<90;i++){
    const x=r.left+8+(r.width-16)*i/89;
    const y=r.top+r.height*0.45;
    cv.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,cancelable:true,clientX:x,clientY:y}));
    const txt=readTooltipText();
    const m=txt.match(re);
    if(m){
      const v=Number(String(m[1]).replace(",","."));
      if(Number.isFinite(v)&&v>=0&&v<=100)vals.push(v);
    }
  }
  if(vals.length>=15)TOOLTIP_SERIES=vals;
}
function scanVisualGraph(out){
  const nums=[];
  document.querySelectorAll("svg text, canvas + *, div, span").forEach(el=>{
    const txt=esc(el.textContent||"");
    if(!/^\d{1,2}$/.test(txt))return;
    const n=Number(txt);
    if(n<0||n>100)return;
    const r=el.getBoundingClientRect?.();
    if(!r||r.width>80||r.height>40)return;
    nums.push({n,x:r.left,y:r.top});
  });
  const ys=nums.map(p=>p.y).sort((a,b)=>a-b);
  if(nums.length<25)return;
  const midY=ys[Math.floor(ys.length/2)];
  const graphNums=nums
    .filter(p=>Math.abs(p.y-midY)<260)
    .sort((a,b)=>a.x-b.x||a.y-b.y)
    .map(p=>p.n);
  if(graphNums.length>=25)out.push({path:"visual.numeros-linha-grafica",vals:graphNums.slice(-1200)});
}
function lineRead(series,odd){
  const s=series[0];
  if(!s)return [];
  return CONFIG.windows.map(w=>{
    const vals=s.vals.slice(-w);
    const ready=vals.length>=Math.min(w,30);
    const cur=vals.at(-1),min=Math.min(...vals),max=Math.max(...vals);
    const fundo=ready&&cur<=min+CONFIG.tol;
    const fundo30=ready&&cur<=30;
    const ev=Number.isFinite(odd)?(cur/100*odd-1)*100:null;
    const distMin=ready?cur-min:null;
    return {w,ready,cur,min,max,fundo,fundo30,ev,distMin};
  });
}
function resultHistoryForMarket(m){
  return RESULTS_CACHE
    .map(r=>({name:r.name,score:r.score,green:paysMarket(r.score,m),txt:r.txt}))
    .filter(r=>r.green!==null);
}
function calcResultWindows(m){
  const first=RESULTS_CACHE[0],last=RESULTS_CACHE[RESULTS_CACHE.length-1];
  const cacheKey=[
    m.key,
    RESULTS_CACHE.length,
    first?.time||"",
    first?.name||"",
    rowScoreText(first),
    last?.time||"",
    last?.name||"",
    rowScoreText(last)
  ].join("|");
  if(RESULT_WINDOWS_CACHE.key===cacheKey&&RESULT_WINDOWS_CACHE.rows)return RESULT_WINDOWS_CACHE.rows;
  const hist=resultHistoryForMarket(m);
  const rows=CONFIG.windows.map(w=>{
    const arr=hist.slice(0,w);
    const j=arr.length;
    const g=arr.filter(x=>x.green).length;
    const pctVal=j?g/j*100:null;
    let min=null;
    if(hist.length>=w){
      const vals=[];
      for(let i=0;i<=hist.length-w;i++){
        const sub=hist.slice(i,i+w);
        vals.push(sub.filter(x=>x.green).length/sub.length*100);
      }
      min=Math.min(...vals);
    }
    const ready=j>=w;
    const fundo30=ready&&pctVal!==null&&pctVal<=30;
    const fundoMin=ready&&min!==null&&pctVal<=min+CONFIG.tol;
    return {w,j,g,p:pctVal,min,ready,fundo30,fundoMin};
  });
  RESULT_WINDOWS_CACHE={key:cacheKey,rows};
  return rows;
}
function globalFundos(series){
  return calcResultWindows(market()).filter(r=>r.ready&&r.j>=r.w&&(r.fundo30||r.fundoMin));
}
function visualFundos(series){
  return [];
}
function pctGreen(arr){
  if(!arr.length)return null;
  return arr.filter(x=>x.green).length/arr.length*100;
}
function emaValues(values,win){
  if(!values.length)return [];
  const a=2/(win+1),out=[values[0]];
  for(let i=1;i<values.length;i++)out.push(a*values[i]+(1-a)*out[out.length-1]);
  return out;
}
function linearSlope(values){
  if(values.length<2)return 0;
  const n=values.length,mx=(n-1)/2,my=values.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0;
  for(let i=0;i<n;i++){num+=(i-mx)*(values[i]-my);den+=(i-mx)*(i-mx)}
  return den?num/den:0;
}
function rollingPctLine(values,win){
  const out=[];
  for(let i=0;i<values.length;i++){
    const s=values.slice(Math.max(0,i-win+1),i+1);
    out.push(s.reduce((a,b)=>a+b,0)/s.length*100);
  }
  return out;
}
function trendMoment(hist){
  const chron=hist.slice(0,Math.min(120,hist.length)).reverse().map(x=>x.green?1:0);
  if(chron.length<60)return null;
  const fast=emaValues(chron,12),slow=emaValues(chron,26);
  const macd=chron.map((_,i)=>fast[i]-slow[i]);
  const sig=emaValues(macd,9);
  const histo=macd.map((v,i)=>v-sig[i]);
  const line=rollingPctLine(chron,10);
  const last=histo.length-1;
  return {
    macd:macd[last],signal:sig[last],hist:histo[last],prevHist:histo[last-1]??histo[last],
    histDelta:histo[last]-(histo[last-1]??histo[last]),
    slope8:linearSlope(line.slice(-8)),slope20:linearSlope(line.slice(-20)),slope40:linearSlope(line.slice(-40))
  };
}
function trendUpSignals(){
  const hist=resultHistoryForMarket(market());
  if(hist.length<60)return [];
  const recent15=hist.slice(0,15),recent30=hist.slice(0,30),prev30=hist.slice(30,60);
  const base120=hist.slice(0,Math.min(120,hist.length));
  const p15=pctGreen(recent15),p30=pctGreen(recent30),pPrev=pctGreen(prev30),pBase=pctGreen(base120);
  if([p15,p30,pPrev,pBase].some(v=>!Number.isFinite(v)))return [];
  const g15=recent15.filter(x=>x.green).length,g30=recent30.filter(x=>x.green).length;
  const m=trendMoment(hist);
  if(!m)return [];

  const taxaSubiu=p15>=p30-1&&p30>=pPrev+6&&p30>=pBase+3&&g15>=1&&g30>=2;
  const fundoVirando=p15>=pBase+8&&p15>=pPrev+8&&g15>=2;
  const momentoConfirma=m.hist>0&&m.histDelta>0&&m.macd>m.signal&&m.slope8>0&&m.slope20>=0;
  const subidaEsgotada=(p30>=pBase+3||p30>=pPrev+6)&&(m.hist<=0||m.histDelta<0||m.macd<m.signal||m.slope8<=0);

  if(subidaEsgotada)return [];
  if(!(taxaSubiu||fundoVirando)||!momentoConfirma)return [];
  return [{
    tipo:fundoVirando?"VIRADA DE FUNDO CONFIRMADA":"SUBIDA CONFIRMADA",
    p15,p30,pPrev,pBase,g15,g30,j:hist.length,
    tendencia:p30-pPrev,base:pBase,
    macd:m.macd,signal:m.signal,hist:m.hist,histDelta:m.histDelta,slope8:m.slope8,slope20:m.slope20
  }];
}
function trendUpBox(){
  const sinais=trendUpSignals();
  if(!sinais.length)return "";
  return sinais.map(s=>`<div class="sig"><b class="ok">${s.tipo}</b> ${esc(market().name)} | 15j ${s.p15.toFixed(1)}% | 30j ${s.g30}/30 ${s.p30.toFixed(1)}% | antes ${s.pPrev.toFixed(1)}% | base ${s.pBase.toFixed(1)}% | MACD ${s.macd.toFixed(3)}/${s.signal.toFixed(3)} | hist ${s.hist.toFixed(3)} subindo</div>`).join("");
}
function scoreFromResult(txt){
  const m=String(txt||"").match(/(\d+)\+?\s*[-x]\s*(\d+)\+?/);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[2]);
  return Number.isFinite(a)&&Number.isFinite(b)?{a,b,t:a+b}:null;
}
function paysMarket(score,m){
  if(!score)return null;
  if(m.key==="ambas_sim")return score.a>0&&score.b>0;
  if(m.key==="ambas_nao")return score.a===0||score.b===0;
  if(m.key==="over15")return score.t>=2;
  if(m.key==="under15")return score.t<=1;
  if(m.key==="over25")return score.t>=3;
  if(m.key==="under25")return score.t<=2;
  if(m.key==="over35")return score.t>=4;
  if(m.key==="under35")return score.t<=3;
  if(m.key==="casa_vence")return score.a>score.b;
  if(m.key==="empate")return score.a===score.b;
  if(m.key==="fora_vence")return score.b>score.a;
  if(m.key==="over5")return score.t>=5;
  if(m.key==="casa5")return score.a>=5;
  if(m.key==="fora5")return score.b>=5;
  return null;
}
function cellRgb(el){
  const c=getComputedStyle(el).backgroundColor||"";
  const m=c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return m?{r:Number(m[1]),g:Number(m[2]),b:Number(m[3])}:null;
}
function isClosedResultCell(el){
  const rgb=cellRgb(el);
  if(!rgb)return false;
  const isBlue=rgb.b>rgb.r+25&&rgb.b>rgb.g+25;
  const isGray=Math.abs(rgb.r-rgb.g)<18&&Math.abs(rgb.g-rgb.b)<18;
  const isGreen=rgb.g>90&&rgb.g>rgb.r+20&&rgb.g>=rgb.b;
  const isRed=rgb.r>140&&rgb.r>rgb.g+30&&rgb.r>rgb.b+30;
  return (isGreen||isRed)&&!isBlue&&!isGray;
}
function allResultCells(){
  const out=gridResultCells();
  if(out.length){
    const seen=new Set();
    return out.filter(r=>{
      const key=`${r.time}|${r.name}|${r.score.a}-${r.score.b}|${String(r.txt||"").slice(-80)}`;
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>resultAge(a)-resultAge(b)||a.top-b.top||a.left-b.left||a.idx-b.idx);
  }
  let idx=0;
  document.querySelectorAll("td").forEach(el=>{
    if(!isClosedResultCell(el))return;
    const txt=el.innerText||"";
    if(!/\s+x\s+/i.test(txt))return;
    const sc=scoreFromResult(txt);
    if(sc){
      const r=el.getBoundingClientRect?.();
      out.push({txt,score:sc,name:gameName(txt),time:"",top:r?r.top:0,left:r?r.left:0,idx:idx++});
    }
  });
  const seen=new Set();
  return out.filter(r=>{
    const key=`${r.time}|${r.name}|${r.score.a}-${r.score.b}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).sort((a,b)=>resultAge(a)-resultAge(b)||a.top-b.top||a.left-b.left||a.idx-b.idx);
}
function gridResultCells(){
  const out=[];
  document.querySelectorAll("table").forEach(table=>{
    const rows=[...table.querySelectorAll("tr")];
    const minuteByCol={};
    rows.forEach(tr=>{
      const cells=[...tr.children];
      const first=esc(cells[0]?.innerText||"").toLowerCase();
      if(first==="h"||first==="horario"||first==="hora"){
        cells.forEach((c,i)=>{
          const n=Number(esc(c.innerText));
          if(Number.isInteger(n)&&n>=0&&n<60)minuteByCol[i]=n;
        });
      }
    });
    rows.forEach(tr=>{
      const cells=[...tr.children];
      const hour=Number(esc(cells[0]?.innerText||""));
      if(!Number.isInteger(hour)||hour<0||hour>23)return;
      cells.forEach((cell,i)=>{
        if(i===0||minuteByCol[i]===undefined)return;
        if(!isClosedResultCell(cell))return;
        const txt=cell.innerText||"";
        if(!/\s+x\s+/i.test(txt))return;
        const sc=scoreFromResult(txt);
        if(!sc)return;
        const r=cell.getBoundingClientRect?.();
        const time=`${hour}.${String(minuteByCol[i]).padStart(2,"0")}`;
        out.push({txt,score:sc,name:gameName(txt),time,top:r?r.top:0,left:r?r.left:0,idx:out.length,domGrid:true});
      });
    });
  });
  return out;
}
function refreshResultsCache(){
  const liga=activeLiga();
  const apiHist=API_ROWS.filter(r=>r.score&&!r.future&&(!liga||!r.liga||r.liga===liga)).map((r,i)=>({
    txt:txtFromApiRow(r),
    score:r.score,
    name:r.name,
    time:r.time,
    liga:r.liga||liga||null,
    top:-10000+i,
    left:0,
    idx:i,
    api:true
  }));
  // A API ja entrega os resultados reais. Quando ha o bastante, NAO varremos o DOM
  // inteiro (querySelectorAll table/tr/td + getBoundingClientRect), que e o que
  // mais trava a pagina Angular do thtips.
  const dom = apiHist.length >= 30 ? [] : allResultCells().map(r=>({...r,liga:liga||r.liga||null}));
  const stored=loadStoredResults().filter(r=>!liga||!r.liga||r.liga===liga);
  const seen=new Set();
  RESULTS_CACHE=[...apiHist,...dom,...stored].filter(r=>{
    const key=resultKey(r);
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).sort((a,b)=>resultAge(a)-resultAge(b)||a.top-b.top||a.idx-b.idx);
  saveStoredResults(RESULTS_CACHE);
  return RESULTS_CACHE;
}
function resultAge(r){
  const hm=parseTime(r.time);
  if(hm===null)return 99999+(r.top||0)+(r.idx||0)/1000;
  const now=scheduleNowMinute();
  let age=now-hm;
  if(age<0)age+=1440;
  return age;
}
function recentPaidResults(){
  const out=[],seen=new Set();
  const mkt=activeMarkets()[0]||market();
  const grid=gridResultCells();
  const base=grid.length?grid:RESULTS_CACHE;
  base.slice().sort((a,b)=>resultAge(a)-resultAge(b)||a.top-b.top||a.idx-b.idx).forEach(r=>{
    const odds=oddsForMarket(r.txt,mkt);
    if(!odds.length&&out.length>=10)return;
    const name=gameName(r.txt);
    const key=(r.time||"")+"|"+name+"|"+r.score.a+"-"+r.score.b+"|"+(odds[0]||"");
    if(seen.has(key))return;
    seen.add(key);
    const paid=paysMarket(r.score,mkt);
    const team=teamPayPct({name},mkt);
    const oddBase=odds.length?oddPayPct({name,odd:odds[0]},mkt):null;
    const parts=[team?.p,oddBase?.p].filter(Number.isFinite);
    const prob=parts.length?parts.reduce((a,b)=>a+b,0)/parts.length:null;
    const ev=prob===null||!odds.length?null:(prob/100*odds[0]-1)*100;
    out.push({time:r.time||"",name,score:r.score,odd:odds[0]||null,paid,team,oddBase,prob,ev});
  });
  return out.slice(0,10);
}
function teamNames(name){return String(name||"").split(/\s+x\s+/i).map(x=>esc(x).toLowerCase()).filter(Boolean)}
function teamPayPct(game,m){
  const names=teamNames(game.name);
  if(!names.length)return null;
  const rows=RESULTS_CACHE.filter(r=>{
    const t=r.txt.toLowerCase();
    return names.some(n=>n&&t.includes(n));
  });
  const g=rows.filter(r=>paysMarket(r.score,m)).length;
  return {g,j:rows.length,p:rows.length?g/rows.length*100:null};
}
function oddPayPct(game,m){
  const target=game.odd;
  const rows=RESULTS_CACHE.filter(r=>m.patterns.some(re=>{
    re.lastIndex=0;
    let hit=false,mm;
    while((mm=re.exec(r.txt))){
      const odd=Number(String(mm[1]).replace(",","."));
      if(Math.abs(odd-target)<=0.05)hit=true;
    }
    return hit;
  }));
  const g=rows.filter(r=>paysMarket(r.score,m)).length;
  return {g,j:rows.length,p:rows.length?g/rows.length*100:null};
}
function scoreKey(score){return score?`${score.a}-${score.b}`:"-"}
function orderedResults(){
  return RESULTS_CACHE.filter(r=>r.score).slice().sort((a,b)=>resultAge(b)-resultAge(a)||a.top-b.top||a.idx-b.idx);
}
function marketCycleStats(m){
  const hist=resultHistoryForMarket(m).slice(0,80);
  if(!hist.length)return null;
  const cur=hist[0].green?"GREEN":"RED";
  let streak=0,lastGreen=null;
  for(let i=0;i<hist.length;i++){
    if((hist[i].green?"GREEN":"RED")===cur)streak++;else break;
  }
  for(let i=0;i<hist.length;i++){if(hist[i].green){lastGreen=i;break;}}
  const blocks={GREEN:[],RED:[]};
  let last=hist[0].green?"GREEN":"RED",n=0;
  hist.forEach(x=>{
    const s=x.green?"GREEN":"RED";
    if(s===last)n++;else{blocks[last].push(n);last=s;n=1;}
  });
  blocks[last].push(n);
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const avgRed=avg(blocks.RED),avgGreen=avg(blocks.GREEN);
  const fase=cur==="RED"&&avgRed&&streak>=avgRed?"ponto de virada":cur==="RED"?"inicio/meio":"bloco green";
  const pressao=cur==="RED"&&avgRed?Math.min(100,streak/avgRed*50):0;
  return {cur,streak,lastGreen,avgRed,avgGreen,fase,pressao};
}
function cycleText(c){
  if(!c)return "Ciclo: sem base";
  const lg=c.lastGreen===null?"sem green":`${c.lastGreen} jogos`;
  return `Ciclo: ${c.streak} ${c.cur} seguidos | ultimo GREEN ${lg}<br>Media blocos RED ${Number.isFinite(c.avgRed)?c.avgRed.toFixed(1):"-"} / GREEN ${Number.isFinite(c.avgGreen)?c.avgGreen.toFixed(1):"-"} | fase ${c.fase} | pressao ${c.pressao.toFixed(0)}`;
}
function exactOddStats(game,m){
  const key=Number(game.odd).toFixed(2);
  const rows=RESULTS_CACHE.filter(r=>oddsForMarket(r.txt,m).some(o=>Number(o).toFixed(2)===key));
  if(!rows.length)return {key,g:0,j:0,p:null,cold:false};
  const g=rows.filter(r=>paysMarket(r.score,m)).length;
  const p=g/rows.length*100;
  return {key,g,j:rows.length,p,cold:rows.length>=CONFIG.minOddSample&&p<CONFIG.minOddPct};
}
function exactOddText(s){
  if(!s||!s.j)return "Odd fixa: sem base";
  return `Odd fixa ${s.key}: ${s.g}/${s.j} ${s.p.toFixed(1)}%${s.cold?" ODD FRIA":""}`;
}
function hourOf(v){const hm=parseTime(v);return hm===null?null:Math.floor(hm/60)}
function hourStatsForGame(game,m){
  const h=hourOf(game.time);
  if(h===null)return null;
  const rows=RESULTS_CACHE.filter(r=>hourOf(r.time)===h&&paysMarket(r.score,m)!==null).slice(0,120);
  if(!rows.length)return {h,j:0,g:0,p:null,tag:"sem base"};
  const g=rows.filter(r=>paysMarket(r.score,m)).length;
  const p=g/rows.length*100;
  return {h,j:rows.length,g,p,tag:p>=55?"horario quente":p<=40?"horario frio":"horario neutro"};
}
function hourStatsText(s){return s?`Horario ${String(s.h).padStart(2,"0")}h: ${s.g}/${s.j} ${s.p===null?"-":s.p.toFixed(1)+"%"} ${s.tag}`:"Horario: sem base"}
function ligaStatsText(m){
  const rows=resultHistoryForMarket(m).slice(0,240);
  if(!rows.length)return "Liga atual: sem base";
  const g=rows.filter(r=>r.green).length,p=g/rows.length*100;
  return `Liga atual: ${g}/${rows.length} ${p.toFixed(1)}% ${p>=55?"liga quente":p<=40?"liga fria":"liga neutra"}`;
}
function apiHistoryForLiga(liga){
  const seen=new Set();
  return API_ROWS
    .filter(r=>r&&r.score&&!r.future&&r.liga===liga)
    .sort((a,b)=>resultAge(a)-resultAge(b)||a.idx-b.idx)
    .filter(r=>{
      const key=[r.liga,r.time,r.name,rowScoreText(r)].join("|");
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
}
function statForRows(rows,m,limit){
  const base=rows.filter(r=>paysMarket(r.score,m)!==null).slice(0,limit);
  const g=base.filter(r=>paysMarket(r.score,m)).length;
  return {g,j:base.length,p:base.length?g/base.length*100:null};
}
function fmtRadarStat(s){
  return s&&s.j?`${s.g}/${s.j} ${s.p.toFixed(0)}%`:"--";
}
function radarStatClass(s){
  if(!s||!s.j)return "warn";
  return s.p>=55?"ok":s.p<=42?"bad":"warn";
}
function exactOddStatsForRows(rows,odd,m){
  const target=Number(odd);
  if(!Number.isFinite(target))return null;
  const base=rows.filter(r=>{
    const o=oddFromObj(r.odds,m);
    return Number.isFinite(o)&&Math.abs(o-target)<=0.05;
  });
  if(!base.length)return {g:0,j:0,p:null,cold:false};
  const g=base.filter(r=>paysMarket(r.score,m)).length;
  const p=g/base.length*100;
  return {g,j:base.length,p,cold:base.length>=CONFIG.minOddSample&&p<CONFIG.minOddPct};
}
function nextGamesForLiga(liga,m,limit=2){
  const seen=new Set();
  return API_ROWS
    .filter(r=>r&&r.future&&!r.score&&r.liga===liga)
    .filter(r=>isVisibleFutureRow(r))
    .filter(r=>!r.time||isFuture(r.time))
    .map(r=>({time:r.time,name:r.name,odd:oddFromObj(r.odds,m),market:m,text:txtFromApiRow(r),liga}))
    .filter(g=>Number.isFinite(g.odd)&&g.odd>1)
    .sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)||String(a.name).localeCompare(String(b.name)))
    .filter(g=>{
      const key=[g.time,g.name,g.odd].join("|");
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    })
    .slice(0,limit);
}
function radarDecision(s15,s30,s120){
  if(!s30.j||s30.j<12)return {label:"JUNTANDO BASE",cls:"warn",note:"clique API/aguarde mais jogos"};
  const p15=Number.isFinite(s15.p)?s15.p:s30.p;
  const p30=s30.p;
  const p120=Number.isFinite(s120.p)?s120.p:p30;
  const delta=p15-p30;
  if(p15>=58&&p30>=52&&delta>=-6)return {label:"LIGA QUENTE",cls:"ok",note:"boa para procurar odd justa"};
  if(p15>=50&&delta>=8&&p15>=p120)return {label:"VIRANDO P/ ALTA",cls:"ok",note:"melhor quando proximo jogo nao tem odd fria"};
  if(p15<=35&&p30<=42)return {label:"LIGA FRIA",cls:"bad",note:"evitar compra seca"};
  if(delta<=-10)return {label:"CAINDO",cls:"bad",note:"esperar novo fundo/virada"};
  if(p30<=42&&p15>=p30+6)return {label:"FUNDO REAGINDO",cls:"warn",note:"observar confirmacao"};
  return {label:"NEUTRA",cls:"warn",note:"sem vantagem clara"};
}
function radarNextText(games,rows,m){
  if(!games.length)return "sem proximo com odd";
  return games.map(g=>{
    const odd=exactOddStatsForRows(rows,g.odd,m);
    const cold=odd?.cold?" <span class='bad'>ODD FRIA</span>":"";
    const base=odd&&odd.j?` ${odd.g}/${odd.j} ${odd.p.toFixed(0)}%`:" sem base";
    return `${esc(g.time||"-")} ${esc(g.name)} @${g.odd.toFixed(2)}${base}${cold}`;
  }).join("<br>");
}
function multiLeagueRadarBox(){
  const m=market();
  const ligas=(CONFIG.radarLigas||[1,2,3,4]).filter(l=>Number.isFinite(l));
  const hasData=API_ROWS.some(r=>ligas.includes(r.liga));
  if(!hasData){
    return `<div class="sig"><b class="warn">Radar simultaneo das 4 ligas</b><br>Sem dados das ligas ainda. Clique em API para carregar Copa, Euro, Super e Premier ao mesmo tempo.</div>`;
  }
  const o25=MARKETS.find(x=>x.key==="over25");
  const o35=MARKETS.find(x=>x.key==="over35");
  const btts=MARKETS.find(x=>x.key==="ambas_sim");
  return `<h3>Radar simultaneo das 4 ligas</h3><table><tr><th>Liga</th><th>Status</th><th>${esc(m.name)} 15/30/120</th><th>Over/Ambas 30j</th><th>Proximos do mercado</th></tr>${ligas.map(liga=>{
    const rows=apiHistoryForLiga(liga);
    const s15=statForRows(rows,m,15),s30=statForRows(rows,m,30),s120=statForRows(rows,m,120);
    const d=radarDecision(s15,s30,s120);
    const gols=[o25,o35,btts].filter(Boolean).map(x=>`${esc(x.name.replace("Ambas Sim","Ambas"))}: <span class="${radarStatClass(statForRows(rows,x,30))}">${fmtRadarStat(statForRows(rows,x,30))}</span>`).join("<br>");
    const next=nextGamesForLiga(liga,m,2);
    return `<tr><td><b>${esc(ligaLabel(liga))}</b><br>${rows.length} hist</td><td class="${d.cls}"><b>${d.label}</b><br>${esc(d.note)}</td><td><span class="${radarStatClass(s15)}">${fmtRadarStat(s15)}</span> | <span class="${radarStatClass(s30)}">${fmtRadarStat(s30)}</span> | <span class="${radarStatClass(s120)}">${fmtRadarStat(s120)}</span></td><td>${gols||"--"}</td><td>${radarNextText(next,rows,m)}</td></tr>`;
  }).join("")}</table>`;
}
function sidePayPct(team,m,side){
  const nm=esc(team).toLowerCase();
  const rows=RESULTS_CACHE.filter(r=>{const p=teamNames(r.name);return side==="casa"?p[0]===nm:p[1]===nm});
  if(rows.length<1)return null;
  const g=rows.filter(r=>paysMarket(r.score,m)).length;
  return {g,j:rows.length,p:g/rows.length*100};
}
function fmtStat(s){return s?`${s.g}/${s.j} ${Number.isFinite(s.p)?s.p.toFixed(1)+"%":"-"}`:"0/0 -"}
function fmtBaseStat(s){return s?`${s.g}/${s.j} ${Number.isFinite(s.p)?s.p.toFixed(1)+"%":"-"}`:"0/0 -"}
function rankRowsForHours(m,hours){
  const maxAge=hours*60;
  return RESULTS_CACHE.filter(r=>r.score&&paysMarket(r.score,m)!==null&&resultAge(r)<=maxAge);
}
function teamRankPos(team,m,hours){
  const map={};
  rankRowsForHours(m,hours).forEach(r=>{
    teamNames(r.name).forEach(t=>{
      if(!t)return;
      if(!map[t])map[t]={name:t,g:0,j:0,p:0};
      map[t].j++;
      if(paysMarket(r.score,m))map[t].g++;
    });
  });
  const list=Object.values(map).filter(x=>x.j>=2).map(x=>({...x,p:x.g/x.j*100})).sort((a,b)=>b.g-a.g||b.p-a.p||b.j-a.j);
  const i=list.findIndex(x=>x.name===team);
  return i>=0?`#${i+1} ${list[i].g}/${list[i].j} ${list[i].p.toFixed(1)}%`:`sem rank ${hours}h`;
}
function rankQuality(j){return j>=10?"base boa":j>=4?"base media":"base fraca"}
function topTeamRankText(m,hours,limit=5){
  const map={};
  rankRowsForHours(m,hours).forEach(r=>{
    teamNames(r.name).forEach(t=>{
      if(!t)return;
      if(!map[t])map[t]={name:t,g:0,j:0,p:0};
      map[t].j++;
      if(paysMarket(r.score,m))map[t].g++;
    });
  });
  const list=Object.values(map)
    .filter(x=>x.j>=1)
    .map(x=>({...x,p:x.g/x.j*100}))
    .sort((a,b)=>b.p-a.p||b.g-a.g||b.j-a.j||a.name.localeCompare(b.name))
    .slice(0,limit);
  if(!list.length)return `Ranking dos times ${hours}h: sem base`;
  return `Ranking dos times ${hours}h: `+list.map((x,i)=>`${i+1}. ${esc(x.name)} ${x.g}/${x.j} ${x.p.toFixed(1)}% ${rankQuality(x.j)}`).join(" | ");
}
function topOddRankText(m,hours,limit=8){
  const map={};
  rankRowsForHours(m,hours).forEach(r=>{
    const paid=paysMarket(r.score,m);
    oddsForMarket(r.txt,m).forEach(o=>{
      const k=o.toFixed(2);
      if(!map[k])map[k]={odd:k,g:0,j:0,p:0};
      map[k].j++;
      if(paid)map[k].g++;
    });
  });
  const list=Object.values(map)
    .filter(x=>x.j>=1)
    .map(x=>({...x,p:x.g/x.j*100}))
    .sort((a,b)=>b.p-a.p||b.g-a.g||b.j-a.j||Number(a.odd)-Number(b.odd))
    .slice(0,limit);
  if(!list.length)return `Ranking das odds fixas ${hours}h: sem base`;
  return `Ranking das odds fixas ${hours}h: `+list.map((x,i)=>`${i+1}. @${x.odd} ${x.g}/${x.j} ${x.p.toFixed(1)}% ${rankQuality(x.j)}`).join(" | ");
}
function marketRankingBox(){
  const m=market();
  return `<div class="sig"><b class="ok">Ranking do mercado ${esc(m.name)}</b><br>${topOddRankText(m,3)}<br>${topOddRankText(m,6)}</div>`;
}
function teamDetailText(game,m){
  const p=teamNames(game.name);
  if(p.length<2)return "sem base casa/fora";
  const aCasa=sidePayPct(p[0],m,"casa"),aFora=sidePayPct(p[0],m,"fora"),bCasa=sidePayPct(p[1],m,"casa"),bFora=sidePayPct(p[1],m,"fora");
  return `Casa ${esc(p[0])}: casa ${fmtStat(aCasa)} | fora ${fmtStat(aFora)}<br>Fora ${esc(p[1])}: casa ${fmtStat(bCasa)} | fora ${fmtStat(bFora)}`;
}
function scoreNextStats(score,m){
  const key=scoreKey(score);
  if(key==="-")return null;
  const rows=orderedResults();
  const next={},oddWin={};
  let j=0;
  for(let i=0;i<rows.length-1;i++){
    if(scoreKey(rows[i].score)!==key)continue;
    const n=rows[i+1];
    if(!n?.score)continue;
    j++;
    const nk=scoreKey(n.score);
    next[nk]=(next[nk]||0)+1;
    const odds=oddsForMarket(n.txt,m);
    if(paysMarket(n.score,m)&&odds.length){
      const ok=odds[0].toFixed(2);
      oddWin[ok]=(oddWin[ok]||0)+1;
    }
  }
  if(!j)return null;
  const topScores=Object.entries(next).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k} ${v}/${j} ${(v/j*100).toFixed(1)}%`);
  const topOdds=Object.entries(oddWin).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${v}x`);
  return {score:key,j,topScores,topOdds};
}
function oddBand(v){
  if(!Number.isFinite(v))return null;
  if(v<1.5)return "<1.50";
  if(v<1.8)return "1.50-1.79";
  if(v<2.2)return "1.80-2.19";
  if(v<3)return "2.20-2.99";
  if(v<5)return "3.00-4.99";
  if(v<10)return "5.00-9.99";
  return "10+";
}
function scoreModelForGame(game,m){
  const names=teamNames(game.name);
  const band=oddBand(game.odd);
  let rows=orderedResults().filter(r=>{
    const p=teamNames(r.name);
    const hasTeam=names.some(n=>p.includes(n));
    const odds=oddsForMarket(r.txt,m);
    const sameBand=band&&odds.some(o=>oddBand(o)===band);
    return hasTeam||sameBand;
  }).slice(0,80);
  let label=`times/faixa ${band||"-"}`;
  if(!rows.length){
    rows=resultHistoryForMarket(m).slice(0,80).map(x=>x.r||x).filter(r=>r&&r.score);
    label="liga recente";
  }
  if(!rows.length)return {label,j:0,topScores:[],topOdds:[],marketP:null,green:0};
  const scoreCnt={},oddWin={};
  let green=0;
  rows.forEach(r=>{
    const sk=scoreKey(r.score);
    scoreCnt[sk]=(scoreCnt[sk]||0)+1;
    if(paysMarket(r.score,m)){
      green++;
      oddsForMarket(r.txt,m).forEach(o=>{
        const ok=o.toFixed(2);
        oddWin[ok]=(oddWin[ok]||0)+1;
      });
    }
  });
  const topScores=Object.entries(scoreCnt).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k} ${v}/${rows.length} ${(v/rows.length*100).toFixed(1)}%`);
  const topOdds=Object.entries(oddWin).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${v}x`);
  return {label,j:rows.length,topScores,topOdds,marketP:green/rows.length*100,green};
}
function scorePullText(stat){
  if(!stat||!stat.j)return "Placar correto: 0/0 -";
  if(stat.label)return `Placar correto (${esc(stat.label)}, ${stat.j} jogos): ${stat.topScores.join(" | ")}<br>Mercado nessa base: ${stat.green}/${stat.j} ${Number.isFinite(stat.marketP)?stat.marketP.toFixed(1)+"%":"-"}${stat.topOdds.length?` | Odds: ${stat.topOdds.join(" | ")}`:""}`;
  return `Placar correto apos ${stat.score}: ${stat.topScores.join(" | ")}${stat.topOdds.length?`<br>Odds: ${stat.topOdds.join(" | ")}`:""}`;
}
function anchorMarket(){
  return MARKETS.find(m=>m.key==="over35")||market();
}
function normAnchorText(v){
  return esc(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}
function anchorTeamNames(name){
  const invalid=new Set(["cio","out","time","jogo","casa","fora","empate","resultado","sem liga"]);
  return String(name||"").split(/\s+x\s+/i).map(normAnchorText).filter(t=>t.length>=3&&!invalid.has(t)&&!/@|\d/.test(t));
}
function alertBrand(){return isCarameloPage()?"Caramelo Robo":"BBTips Robo"}
function anchorOddExact(v){
  const n=Number(v);
  return Number.isFinite(n)?n.toFixed(2):null;
}
function anchorAlertKey(a){
  const hm=parseTime(a?.anchor?.time);
  const time=hm===null?"":String(Math.floor(hm/60)).padStart(2,"0")+":"+String(hm%60).padStart(2,"0");
  const name=normAnchorText(a?.anchor?.name||a?.stat?.label||"ancora").replace(/\?/g,"");
  return time?`hora:${time}`:`nome:${name}`;
}
function rowAnchorKeys(row,m){
  const keys=[];
  anchorTeamNames(row?.name).forEach(t=>keys.push({key:`time:${t}`,label:`time ${t}`}));
  const odds=oddsForMarket(row?.txt||txtFromApiRow(row)||"",m);
  odds.forEach(o=>{
    const exact=anchorOddExact(o);
    const band=oddBand(o);
    if(exact)keys.push({key:`odd:${exact}`,label:`odd O3.5 @${exact}`});
    if(band)keys.push({key:`faixa:${band}`,label:`faixa O3.5 ${band}`});
  });
  const seen=new Set();
  return keys.filter(k=>{
    if(seen.has(k.key))return false;
    seen.add(k.key);
    return true;
  });
}
function anchorFutureGames(games){
  const liga=activeLiga();
  const m=anchorMarket();
  const seen=new Set();
  const fromApi=API_ROWS
    .filter(r=>r&&r.future&&!r.score&&(!liga||Number(r.liga)===Number(liga)))
    .filter(r=>isVisibleFutureRow(r))
    .filter(r=>!r.time||isFuture(r.time))
    .map(r=>({time:r.time,name:r.name,odd:oddFromObj(r.odds,m),market:m,text:txtFromApiRow(r),liga:r.liga,txt:txtFromApiRow(r)}))
    .filter(g=>g.name)
    .sort((a,b)=>(parseTime(a.time)??9999)-(parseTime(b.time)??9999)||String(a.name).localeCompare(String(b.name)));
  const base=fromApi.length?fromApi:(games||[]).map(g=>({...g,market:m,txt:g.text||g.txt||""}));
  return base.filter(g=>{
    const key=[g.time,g.name].join("|");
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).slice(0,Math.max(6,CONFIG.maxProximos||6));
}
function anchorStatsMap(m){
  const rows=orderedResults().filter(r=>r&&r.score&&r.name).slice(-540);
  const map={};
  for(let i=0;i<rows.length;i++){
    const keys=rowAnchorKeys(rows[i],m);
    if(!keys.length)continue;
    [1,2,3,4].forEach(offset=>{
      const target=rows[i+offset];
      if(!target?.score)return;
      const paid=paysMarket(target.score,m);
      keys.forEach(k=>{
        const id=`${k.key}|${offset}`;
        if(!map[id])map[id]={...k,offset,j:0,g:0,last:[]};
        map[id].j++;
        if(paid)map[id].g++;
        if(paid&&map[id].last.length<3)map[id].last.push(`${target.name} ${scoreKey(target.score)}`);
      });
    });
  }
  Object.values(map).forEach(s=>{s.p=s.j?s.g/s.j*100:null});
  return map;
}
function anchorAttention(games){
  const m=anchorMarket();
  const future=anchorFutureGames(games);
  const stats=anchorStatsMap(m);
  const alerts=[];
  const addAlert=(anchor,target,offset,stat,source)=>{
    if(!target||!stat||stat.j<CONFIG.anchorMinSample||stat.g<CONFIG.anchorMinGreen||stat.p<CONFIG.anchorMinPct)return;
    alerts.push({
      source,
      offset,
      anchor,
      target,
      stat,
      score:stat.p+Math.min(20,stat.j*2)+(stat.key.startsWith("time:")?8:0)
    });
  };
  future.forEach((anchor,i)=>{
    const keys=rowAnchorKeys(anchor,m);
    [1,2,3,4].forEach(offset=>{
      const target=future[i+offset];
      keys.forEach(k=>addAlert(anchor,target,offset,stats[`${k.key}|${offset}`],"proximo"));
    });
  });
  orderedResults().slice(-4).forEach(anchor=>{
    if(resultAge(anchor)>18)return;
    const keys=rowAnchorKeys(anchor,m);
    [1,2,3,4].forEach(offset=>{
      const target=future[offset-1];
      keys.forEach(k=>addAlert(anchor,target,offset,stats[`${k.key}|${offset}`],"passou"));
    });
  });
  const seen=new Set();
  return alerts
    .sort((a,b)=>b.score-a.score||b.stat.j-a.stat.j)
    .filter(a=>{
      const key=[a.target?.time,a.target?.name,a.stat.key,a.offset].join("|");
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    })
    .slice(0,5);
}
function anchorAttentionBox(games){
  const alerts=anchorAttention(games);
  if(!alerts.length)return `<div class="sig"><b class="warn">Atencao time/odd ancora</b><br>Sem ancora forte agora para Over 3.5. Regra: minimo ${CONFIG.anchorMinSample} jogos, ${CONFIG.anchorMinGreen} acertos e ${CONFIG.anchorMinPct}% quando o time/odd aparece e paga de 1 a 4 jogos depois.</div>`;
  return `<div class="sig"><b class="ok">Atencao time/odd ancora - Over 3.5</b><br>${alerts.map(a=>{
    const passou=a.source==="passou"?"ja passou":"vai passar";
    const last=a.stat.last.length?` | exemplos: ${a.stat.last.map(esc).join(" / ")}`:"";
    return `<span class="ok">ancora ${esc(a.anchor?.time||"-")} ${esc(a.anchor?.name||a.stat.label)} ${passou}</span> | padrao ${esc(a.stat.label)} -> +${a.offset} casa: <b>${esc(a.target.time||"-")} ${esc(a.target.name||"-")}</b> | O3.5 ${a.stat.g}/${a.stat.j} ${a.stat.p.toFixed(0)}%${last}`;
  }).join("<br>")}</div>`;
}
function notifyAnchors(games){
  if(!CONFIG.alerts)return;
  activeLiga();
  if(ACTIVE_LIGA_BLOCKED)return;
  const alerts=anchorAttention(games).filter(a=>a.stat.j>=CONFIG.anchorNotifyMinSample&&a.stat.g>=CONFIG.anchorNotifyMinGreen&&a.stat.p>=CONFIG.anchorNotifyMinPct);
  if(!alerts.length)return;
  const now=Date.now();
  const lock=Number(localStorage.getItem(ANCHOR_ALERT_LOCK)||0);
  if(now-lock<3000)return;
  localStorage.setItem(ANCHOR_ALERT_LOCK,String(now));
  let state={seen:{}};
  try{
    const saved=JSON.parse(localStorage.getItem(ANCHOR_ALERT_STATE)||"{}");
    if(saved&&typeof saved==="object")state={seen:saved.seen&&typeof saved.seen==="object"?saved.seen:{}};
  }catch(e){}
  Object.keys(state.seen).forEach(key=>{
    if(now-Number(state.seen[key]||0)>8*60*60*1000)delete state.seen[key];
  });
  const fresh=alerts.filter(a=>{
    const key=anchorAlertKey(a);
    a.alertKey=key;
    return !state.seen[key];
  });
  if(!fresh.length){safeSetJson(ANCHOR_ALERT_STATE,state);return;}
  const batch=fresh.slice(0,3);
  batch.forEach(a=>{state.seen[a.alertKey]=now});
  safeSetJson(ANCHOR_ALERT_STATE,state);
  beep();
  if("Notification" in window&&Notification.permission==="granted")batch.forEach(a=>{
    const msg=`ancora ${a.anchor?.time||"-"} ${a.anchor?.name||a.stat.label} -> +${a.offset} | O3.5 ${a.stat.g}/${a.stat.j} ${a.stat.p.toFixed(0)}% | alvo ${a.target?.time||"-"} ${a.target?.name||"-"}`;
    new Notification(`${alertBrand()} ancora O3.5`,{body:msg,tag:"bbtips-anchor-"+a.alertKey,renotify:false});
  });
  else if("Notification" in window&&Notification.permission!=="denied")Notification.requestPermission();
}
function weightedProb(graphP,team,odd){
  const parts=[];
  if(Number.isFinite(graphP))parts.push({v:graphP,w:2});
  if(team&&Number.isFinite(team.p))parts.push({v:team.p,w:5});
  if(odd&&Number.isFinite(odd.p))parts.push({v:odd.p,w:5});
  if(!parts.length)return null;
  const sw=parts.reduce((a,b)=>a+b.w,0);
  return parts.reduce((a,b)=>a+b.v*b.w,0)/sw;
}
function comboProfile(m){
  if(m?.key==="ambas_sim")return {threshold:65,minProb:52,minEdge:4,minEv:5};
  if(m?.key==="over25")return {threshold:68,minProb:48,minEdge:5,minEv:5};
  if(m?.key==="over35")return {threshold:72,minProb:30,minEdge:6,minEv:6};
  return {threshold:70,minProb:45,minEdge:6,minEv:6};
}
function liveGraphCombo(m){
  const g=window.__BBTIPS_GRAPH_COMBO;
  if(!g||Date.now()-Number(g.ts||0)>30000)return null;
  if(g.marketKey&&m?.key&&g.marketKey!==m.key)return null;
  const zone=Number(g.zonePct),force=Number(g.force),slope=Number(g.slope);
  if(!Number.isFinite(zone)||!Number.isFinite(force)||!Number.isFinite(slope))return null;
  const trusted=g.source==="caramelo-data"||g.source==="site-data";
  const histRead=trusted&&Boolean(g.histRead);
  const histGood=histRead&&Boolean(g.histPositive)&&!Boolean(g.histWeakening);
  const histBad=histRead&&(!Boolean(g.histPositive)||Boolean(g.histWeakening));
  const trendGood=trusted&&zone<=68&&slope>=-0.08;
  const trendBad=trusted&&(zone>=75||slope<=-0.22);
  return {...g,zone,force,slope,trusted,histRead,histGood,histBad,trendGood,trendBad};
}
function comboScoreForGame({market:m,minHits,prob,probEdge,ev,baseForte,coldOdd,cycle,graph}){
  const profile=comboProfile(m);
  const minimumGood=minHits.length>0;
  const longMinimum=minHits.some(r=>r.w>=480);
  const cycleStrong=cycle?.cur==="RED"&&Number.isFinite(cycle.avgRed)&&cycle.streak>=cycle.avgRed;
  const cycleBuilding=cycle?.cur==="RED"&&Number(cycle.pressao)>=35;
  const probStrong=Number.isFinite(prob)&&prob>=profile.minProb&&Number.isFinite(probEdge)&&probEdge>=profile.minEdge;
  const evStrong=Number.isFinite(ev)&&ev>=profile.minEv;
  const points={
    hist:graph?.histGood?15:graph?.histBad?-15:0,
    trend:graph?.trendGood?10:graph?.trendBad?-10:0,
    minimum:minimumGood?25:0,
    cycle:cycleStrong?15:cycleBuilding?8:0,
    prob:probStrong?15:0,
    ev:evStrong?10:0,
    base:baseForte?10:0,
    longMinimum:longMinimum?5:0
  };
  let score=Object.values(points).reduce((sum,value)=>sum+value,0);
  score=Math.max(0,Math.min(100,score));
  if(!minimumGood||!graph?.histGood||!graph?.trendGood)score=Math.min(score,64);
  if(coldOdd||!probStrong||!evStrong)score=Math.min(score,54);
  const ready=score>=profile.threshold&&minimumGood&&graph?.histGood&&graph?.trendGood&&probStrong&&evStrong&&baseForte&&!coldOdd;
  return {score:Math.round(score),ready,profile,minimumGood,longMinimum,cycleStrong,cycleBuilding,probStrong,evStrong,baseForte,points,graph};
}
function analysisForGame(g,series){
  const resultReads=calcResultWindows(g.market).map(r=>({
    ...r,
    cur:r.p,
    ev:r.p===null?null:(r.p/100*g.odd-1)*100,
    fundo:r.fundo30||r.fundoMin
  }));
  const reads=resultReads;
  const valid=reads.filter(r=>r.ready);
  const best=valid.sort((a,b)=>((a.p??99)-(a.min??0))-((b.p??99)-(b.min??0)))[0]||reads[0];
  const minHits=valid.filter(r=>r.fundo);
  const evs=valid.filter(r=>Number.isFinite(r.ev));
  const bestEv=evs.length?Math.max(...evs.map(r=>r.ev)):null;
  const team=teamPayPct(g,g.market);
  const odd=oddPayPct(g,g.market);
  const graphP=best?.ready?best.p:null;
  const prob=weightedProb(graphP,team,odd);
  const fairOdd=prob?100/prob:null;
  const breakEven=Number.isFinite(g.odd)?100/g.odd:null;
  const probEdge=prob===null||breakEven===null?null:(prob-breakEven);
  const ev=prob===null||!Number.isFinite(g.odd)?null:(prob/100*g.odd-1)*100;
  const p=prob===null?null:prob/100;
  const evGale=p===null?null:(p*(g.odd-1)+(1-p)*(p*(g.odd-2)+(1-p)*(-2)))*100;
  const probOk=probEdge!==null&&probEdge>=CONFIG.minEdge;
  const evOk=ev!==null&&ev>=CONFIG.minEV;
  const strongBase=(team&&Number.isFinite(team.p)&&team.p>=50)||(odd&&Number.isFinite(odd.p)&&odd.p>=50)||(!team&&!odd&&prob!==null);
  const coldOdd=odd&&odd.j>=CONFIG.minOddSample&&Number.isFinite(odd.p)&&odd.p<CONFIG.minOddPct;
  const valueOk=evOk&&probOk;
  const baseForte=(team&&team.j>=CONFIG.minTeamSample&&Number.isFinite(team.p)&&team.p>=52)||(odd&&odd.j>=CONFIG.minOddSample&&Number.isFinite(odd.p)&&odd.p>=52);
  const cycle=marketCycleStats(g.market);
  const graph=liveGraphCombo(g.market);
  const combo=comboScoreForGame({market:g.market,minHits,prob,probEdge,ev,baseForte,coldOdd,cycle,graph});
  const status=combo.ready?"ENTRADA":combo.score>=combo.profile.threshold-12?"OBSERVAR":"PASSAR";
  const probFail=Number.isFinite(prob)&&prob<combo.profile.minProb?`PROB ${prob.toFixed(1)}<${combo.profile.minProb}`:"";
  const edgeFail=Number.isFinite(probEdge)&&probEdge<combo.profile.minEdge?`EDGE ${probEdge.toFixed(1)}<${combo.profile.minEdge}`:"";
  const evFail=Number.isFinite(ev)&&ev<combo.profile.minEv?`EV ${ev.toFixed(1)}<${combo.profile.minEv}`:"";
  let motivo=status;
  if(combo.ready)motivo="COMBO FORTE";
  if(!baseForte)motivo="BASE FRACA";
  if(!combo.evStrong)motivo=evFail||"EV BAIXO";
  if(!combo.probStrong)motivo=probFail||edgeFail||"PROB/EDGE BAIXO";
  if(!combo.minimumGood)motivo="SEM MINIMA";
  if(graph?.trendBad)motivo="GRAFICO CONTRA";
  if(graph?.histBad)motivo="HISTOGRAMA CONTRA";
  if(graph&&!graph.trusted)motivo="GRAFICO VISUAL NAO VALIDADO";
  if(!graph)motivo="SEM GRAFICO";
  if(prob===null)motivo="SEM BASE";
  if(coldOdd)motivo="ODD FRIA";
  return {reads,best,bestEv,team,odd,prob,fairOdd,breakEven,probEdge,ev,evGale,score:combo.score,status,motivo,coldOdd,valueOk,baseForte,cycle,combo};
}
function analyze(){
  const games=readGridGames();
  const series=[];
  const signals=[];
  games.forEach(g=>{
    g.analysis=analysisForGame(g,series);
    const hits=g.analysis.reads.filter(r=>r.ready&&r.fundo&&(r.fundo30||r.fundoMin)&&Number.isFinite(r.ev));
    const podeSinal=g.analysis.combo?.ready;
    if(hits.length&&podeSinal){
      signals.push({game:g,hits,best:hits.sort((a,b)=>b.w-a.w||b.ev-a.ev)[0]});
    }
  });
  return {games,series,signals};
}
function notify(signals){
  if(!CONFIG.alerts)return;
  activeLiga();
  if(ACTIVE_LIGA_BLOCKED)return;
  let old=[];try{old=JSON.parse(localStorage.getItem(SEEN)||"[]")}catch(e){}
  const seen=new Set(old);
  signals.slice(0,5).forEach(s=>{
    const k=`${s.game.market.key}|${s.game.time}|${s.game.name}|${s.best.w}|${Math.round(s.best.cur)}`;
    if(seen.has(k))return;
    seen.add(k);beep();
    const combo=s.game.analysis?.combo;
    const msg=`${ligaNome()} | COMBO ${combo?.score??"-"}/${combo?.profile?.threshold??"-"} | ${s.game.market.name} @${s.game.odd} | ${s.game.time} ${s.game.name} | Hist OK + Minima ${s.best.w} + EV ${Number.isFinite(s.game.analysis?.ev)?s.game.analysis.ev.toFixed(1):"-"}%`;
    if("Notification" in window&&Notification.permission==="granted")new Notification(`${alertBrand()} sinal`,{body:msg});
    else if("Notification" in window&&Notification.permission!=="denied")Notification.requestPermission();
  });
  safeSetJson(SEEN,[...seen],60);
}
function notifyFundo(series){
  if(!CONFIG.alerts)return;
  activeLiga();
  if(ACTIVE_LIGA_BLOCKED)return;
  const fundos=[...globalFundos(series),...visualFundos(series)];
  if(!fundos.length)return;
  let old=[];try{old=JSON.parse(localStorage.getItem(SEEN+"_FUNDO")||"[]")}catch(e){}
  const seen=new Set(old);
  fundos.forEach(f=>{
    if(!f.ready||f.j<f.w)return;
    const k=`${CONFIG.market}|${f.w}|${Math.round(f.p)}`;
    if(seen.has(k))return;
    seen.add(k);
    beep();
    const base=`${f.g}/${f.j} ${f.p.toFixed(1)}% | minima ${f.min.toFixed(1)}%`;
    const msg=`${ligaNome()} | BATEU A MINIMA ${f.w} jogos | ${market().name} | ${base}`;
    if("Notification" in window&&Notification.permission==="granted")new Notification(`${alertBrand()}: bateu a minima`,{body:msg});
    else if("Notification" in window&&Notification.permission!=="denied")Notification.requestPermission();
  });
  safeSetJson(SEEN+"_FUNDO",[...seen],60);
}
function notifyTrendUp(){
  if(!CONFIG.alerts)return;
  activeLiga();
  if(ACTIVE_LIGA_BLOCKED)return;
  const sinais=trendUpSignals();
  if(!sinais.length)return;
  let old=[];try{old=JSON.parse(localStorage.getItem(SEEN+"_TRENDUP")||"[]")}catch(e){}
  const seen=new Set(old);
  sinais.forEach(s=>{
    const bucket=Math.floor(s.p30/3)*3;
    const k=`${activeLiga()||"auto"}|${CONFIG.market}|${s.tipo}|${bucket}|${Math.round(s.pPrev)}`;
    if(seen.has(k))return;
    seen.add(k);
    beep();
    const msg=`${ligaNome()} | ${market().name} | 15j ${s.p15.toFixed(1)}% | 30j ${s.g30}/30 ${s.p30.toFixed(1)}% | antes ${s.pPrev.toFixed(1)}% | base ${s.pBase.toFixed(1)}% | MACD ${s.macd.toFixed(3)}/${s.signal.toFixed(3)} | hist ${s.hist.toFixed(3)} subindo`;
    if("Notification" in window&&Notification.permission==="granted")new Notification(`${alertBrand()}: ${s.tipo}`,{body:msg});
    else if("Notification" in window&&Notification.permission!=="denied")Notification.requestPermission();
  });
  safeSetJson(SEEN+"_TRENDUP",[...seen],60);
}
function oneXTwoOddsFromText(txt){
  const casa=MARKETS.find(m=>m.key==="casa_vence");
  const emp=MARKETS.find(m=>m.key==="empate");
  const fora=MARKETS.find(m=>m.key==="fora_vence");
  return {
    casa:casa?(oddsForMarket(txt,casa)[0]||null):null,
    empate:emp?(oddsForMarket(txt,emp)[0]||null):null,
    fora:fora?(oddsForMarket(txt,fora)[0]||null):null
  };
}
function oneXTwoOddsText(g){
  const o=oneXTwoOddsFromText(g.text||"");
  const parts=[];
  if(o.casa)parts.push(`Casa ${o.casa.toFixed(2)}`);
  if(o.empate)parts.push(`Empate ${o.empate.toFixed(2)}`);
  if(o.fora)parts.push(`Fora ${o.fora.toFixed(2)}`);
  return parts.length?`1X2: ${parts.join(" | ")}`:"1X2: sem odds";
}
function gamesTable(games,series){
  if(!games.length)return "<p class='bad'>Nao achei proximos jogos com odd deste mercado. Clique API ou escolha um mercado que aparece nas odds dos proximos jogos.</p>";
  return `<table><tr><th>Horario</th><th>Jogo</th><th>Mercado</th><th>Odd</th><th>Status</th><th>Probabilidade</th><th>Times/Odd pagante</th><th>Linha 120/240/480/960</th></tr>${games.map(g=>{
    const an=g.analysis||analysisForGame(g,series);
    const reads=an.reads.map(r=>{
      const cls=(r.fundo30||r.fundoMin)?"ok":r.ready?"warn":"bad";
      const tag=r.fundo30?" <30":r.fundoMin?" MINIMA":"";
      return `<span class="${cls}">${r.w}: ${r.ready?`${r.g}/${r.j} ${r.p.toFixed(1)}% min ${r.min.toFixed(1)}${tag} EV linha ${Number.isFinite(r.ev)?r.ev.toFixed(1):"-"}`:`parcial ${r.g}/${r.j} de ${r.w}`}</span>`;
    }).join("<br>");
    const cls=an.status==="ENTRADA"?"ok":an.status==="OBSERVAR"?"warn":"bad";
    const prob=an.prob===null?"-":`${an.prob.toFixed(1)}%`;
    const fair=an.fairOdd===null?"-":an.fairOdd.toFixed(2);
    const ev=an.ev===null?"-":`${an.ev.toFixed(1)}%`;
    const edge=an.probEdge===null?"-":`${an.probEdge.toFixed(1)}%`;
    const evG=an.evGale===null?"-":`${an.evGale.toFixed(1)}%`;
    const team=fmtBaseStat(an.team);
    const odd=`${fmtBaseStat(an.odd)}${an.coldOdd?" ODD FRIA":""}`;
    const ciclo=cycleText(an.cycle||marketCycleStats(g.market));
    const combo=an.combo;
    const histTxt=!combo?.graph||!combo.graph.histRead?"SEM DADO":combo.graph.histGood?"OK":combo.graph.histBad?"CONTRA":"SEM CONF.";
    const sourceLabel=combo?.graph?.source==="caramelo-data"?"DADOS CARAMELO":combo?.graph?.source==="site-data"?"DADOS DO GRAFICO":"VISUAL APROX - NAO SOMA";
    const graphTxt=!combo?.graph?"sem leitura":`zona ${combo.graph.zone}% | forca ${combo.graph.force}% | incl ${combo.graph.slope.toFixed(2)} | linha ${combo.graph.pointCount||0} pts | MACD ${combo.graph.histCount||0} barras | fonte ${sourceLabel}`;
    const pointLabels={hist:"hist",trend:"tend",minimum:"min",cycle:"ciclo",prob:"prob",ev:"EV",base:"base",longMinimum:"min960"};
    const scoreParts=combo?.points?Object.entries(combo.points).map(([key,value])=>`${pointLabels[key]||key} ${value>0?"+":""}${value}`).join(" | "):"";
    const comboTxt=combo?`Combo ${combo.score}/${combo.profile.threshold} | Hist ${histTxt} | Minima ${combo.minimumGood?"OK":"NAO"} | Ciclo ${combo.cycleStrong?"FORTE":combo.cycleBuilding?"FORMANDO":"NAO"}<br>Grafico: ${graphTxt}<br>Pontos: ${scoreParts}`:`Combo --`;
    const oddFixa=exactOddText(exactOddStats(g,g.market));
    const horario=hourStatsText(hourStatsForGame(g,g.market));
    const liga=ligaStatsText(g.market);
    const detalhe=teamDetailText(g,g.market);
    const placar=scorePullText(scoreModelForGame(g,g.market));
    return `<tr><td>${esc(g.time)}</td><td>${esc(g.name)}</td><td>${esc(g.market.name)}</td><td>${g.odd.toFixed(2)}</td><td class="${cls}">${esc(an.motivo)}<br>${comboTxt}</td><td>Prob calibrada ${prob}<br>Odd justa ${fair}<br>Edge odd ${edge}<br>EV real ${ev}<br>EV gale ${evG}<br>${placar}<br>${ciclo}<br>${oddFixa}<br>${horario}<br>${liga}</td><td>Times geral: ${team}<br>${oneXTwoOddsText(g)}<br>${detalhe}<br>Odd atual @${g.odd.toFixed(2)} ${odd}</td><td>${reads}</td></tr>`;
  }).join("")}</table>`;
}
function signalsBox(signals){
  const fundos=globalFundos([]).filter(f=>f.ready&&f.j>=f.w);
  const fundoHtml=fundos.length?fundos.map(f=>`<div class="sig"><b class="ok">BATEU MINIMA ${f.w}</b> ${esc(market().name)} | ${f.g}/${f.j} ${f.p.toFixed(1)}% | minima ${f.min.toFixed(1)}%</div>`).join(""):"";
  if(!signals.length&&!fundoHtml)return "<p class='warn'>Sem Combo forte agora. Alertas de ancora, minima e tendencia continuam ativos; entrada somente quando o Combo atingir o limite do mercado.</p>";
  return signals.map(s=>{
    const combo=s.game.analysis?.combo;
    return `<div class="sig"><b class="ok">COMBO FORTE ${combo?.score??"-"}/${combo?.profile?.threshold??"-"}</b> ${esc(s.game.market.name)} @${s.game.odd.toFixed(2)} | ${esc(s.game.time)} ${esc(s.game.name)} | hist OK | minima ${s.best.w} | EV ${Number.isFinite(s.game.analysis?.ev)?s.game.analysis.ev.toFixed(1):"-"}%</div>`;
  }).join("")+fundoHtml;
}
function trendBox(series){
  const rows=calcResultWindows(market());
  return `<table><tr><th>Periodo</th><th>Porcentagem correta</th><th>Minima historica</th><th>Alerta sonoro</th></tr>${rows.map(r=>{
    const leitura=r.ready?`${r.g}/${r.j} ${r.p.toFixed(1)}%`:`parcial ${r.g}/${r.j} de ${r.w}`;
    const min=r.ready&&r.min!==null?`${r.min.toFixed(1)}%`:"aguardando base";
    const alerta=r.ready?(r.fundo30?"BATEU 30%":r.fundoMin?"BATEU MINIMA":"nao"):"sem alerta";
    const cls=r.fundo30||r.fundoMin?"ok":r.ready?"warn":"bad";
    return `<tr><td>${r.w}</td><td>${leitura}</td><td>${min}</td><td class="${cls}">${alerta}</td></tr>`;
  }).join("")}</table>`;
}
function resultsCheckTable(){
  const rows=recentPaidResults();
  if(!rows.length)return "<p class='warn'>Ainda nao encontrei resultados passados visiveis para conferir este mercado. Role a grade para baixo/cima e clique Atualizar.</p>";
  return `<table><tr><th>Horario</th><th>Resultado</th><th>Mercado</th><th>Odd</th><th>Pagou?</th><th>Times/Odd pagante</th><th>Prob/EV estimado</th></tr>${rows.map(r=>{
    const paid=r.paid?"GREEN":"RED";
    const cls=r.paid?"ok":"bad";
    const team=r.team?`${r.team.g}/${r.team.j} ${r.team.p.toFixed(1)}%`:"sem base";
    const odd=r.oddBase?`${r.oddBase.g}/${r.oddBase.j} ${r.oddBase.p.toFixed(1)}%`:"sem base";
    const prob=r.prob===null?"-":`${r.prob.toFixed(1)}%`;
    const ev=r.ev===null?"-":`${r.ev.toFixed(1)}%`;
    return `<tr><td>${esc(r.time||"-")}</td><td>${esc(r.name)}<br>${r.score.a}-${r.score.b}</td><td>${esc(market().name)}</td><td>${r.odd?r.odd.toFixed(2):"-"}</td><td class="${cls}">${paid}</td><td>Times: ${team}<br>Odd: ${odd}</td><td>Prob ${prob}<br>EV ${ev}</td></tr>`;
  }).join("")}</table>`;
}
function exportHistory(){
  let sinais=[],minima=[],subida=[];
  try{sinais=JSON.parse(localStorage.getItem(SEEN)||"[]")}catch(e){}
  try{minima=JSON.parse(localStorage.getItem(SEEN+"_FUNDO")||"[]")}catch(e){}
  try{subida=JSON.parse(localStorage.getItem(SEEN+"_TRENDUP")||"[]")}catch(e){}
  const data={
    quando:new Date().toISOString(),
    liga:activeLiga(),
    mercado:market().name,
    api:API_ROWS,
    resultados:RESULTS_CACHE,
    historico:loadStoredResults(),
    alertas:{sinais,minima,subida}
  };
  const txt=JSON.stringify(data,null,2);
  try{navigator.clipboard?.writeText(txt)}catch(e){}
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([txt],{type:"application/json"}));
  a.download=`bbtips-historico-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  return data;
}
function scheduleDraw(delay=180){
  clearTimeout(DRAW_TIMER);
  DRAW_TIMER=setTimeout(()=>draw(),delay);
}
function graphPanelIsOpen(){
  const visible=el=>{
    if(!el||el.closest?.(`#${PANEL},#bbtips-robo-root`))return false;
    const style=getComputedStyle(el),rect=el.getBoundingClientRect();
    return !el.classList.contains("hidden")&&style.display!=="none"&&style.visibility!=="hidden"&&rect.width>350&&rect.height>160&&rect.bottom>0&&rect.top<innerHeight;
  };
  const known=[
    document.getElementById("graficoPrincipalNovoPanel"),
    document.getElementById("graficoTradingPanel"),
    document.getElementById("grafico")
  ];
  if(known.some(visible))return true;
  return Array.from(document.querySelectorAll("canvas,svg")).some(visible);
}
function syncScannerWithGraph(){
  const graphOpen=graphPanelIsOpen();
  const wasMin=P.classList.contains("min");
  if(graphOpen){
    if(SCANNER_MANUAL_OPEN){
      P.classList.remove("min");
      SCANNER_GRAPH_AUTO_MIN=false;
    }else{
      P.classList.add("min");
      SCANNER_GRAPH_AUTO_MIN=true;
    }
  }else if(!graphOpen&&SCANNER_GRAPH_AUTO_MIN){
    P.classList.remove("min");
    SCANNER_GRAPH_AUTO_MIN=false;
    SCANNER_MANUAL_OPEN=false;
  }
  return {graphOpen,changed:wasMin!==P.classList.contains("min")};
}
function manualCollectAndDraw(){
  scheduleDraw(20);
  setTimeout(()=>sendAgenteLocal(rowsForTelemetry(),{force:true}),120);
}
function autoAlertTick(){
  if(DRAWING)return;
  try{
    loadApiRowsLight();
    refreshResultsCacheLight();
    const a=analyze();
    notify(a.signals);
    notifyFundo(a.series);
    notifyTrendUp();
    notifyAnchors(a.games);
  }catch(e){}
}
function refreshResultsCacheLight(force=false){
  const now=Date.now();
  if(force||!RESULTS_CACHE.length||now-LAST_RESULTS_REFRESH>90000){
    refreshResultsCache();
    LAST_RESULTS_REFRESH=now;
  }
  return RESULTS_CACHE;
}
function loadApiRowsLight(force=false){
  const now=Date.now();
  if(force||!API_ROWS.length||now-LAST_API_LOAD>60000){
    loadApiRows();
    LAST_API_LOAD=now;
  }
  return API_ROWS;
}
function draw(){
  if(DRAWING){
    DRAW_PENDING=true;
    return;
  }
  DRAWING=true;
  try{
  const bodyOld=P.querySelector(".body");
  const oldScroll=bodyOld?bodyOld.scrollTop:0;
  const oldPageX=window.scrollX,oldPageY=window.scrollY;
  const graphOpen=syncScannerWithGraph().graphOpen;
  const isMin=P.classList.contains("min");
  loadApiRowsLight();
  refreshResultsCacheLight(isMin?false:false);
  if(isMin){
    sendResultadosAgenteLocal();
    const ligaAtual=activeLiga();
    P.innerHTML=`<div class="top"><b>BBTips Robo | ${new Date().toLocaleTimeString()} | Liga ${ligaAtual||"auto"} | Mercado ${esc(market().name)} | API ${API_ROWS.length} | Resultados ${RESULTS_CACHE.length} | Auto ${CONFIG.autoRefresh?"ON":"OFF"} | modo leve</b>
    <span><button id="rb-scan">Atualizar</button><button id="rb-min">Abrir</button><button id="rb-close">Fechar</button></span></div>`;
    document.getElementById("rb-scan").onclick=manualCollectAndDraw;
    document.getElementById("rb-min").onclick=()=>{
      SCANNER_MANUAL_OPEN=true;
      SCANNER_GRAPH_AUTO_MIN=false;
      P.classList.remove("min");
      scheduleDraw(20);
    };
    document.getElementById("rb-close").onclick=()=>{clearInterval(window[TIMER]);P.remove()};
    window.scrollTo(oldPageX,oldPageY);
    return;
  }
  const a=analyze();
  sendResultadosAgenteLocal();
  notify(a.signals);
  notifyFundo(a.series);
  notifyTrendUp();
  notifyAnchors(a.games);
  const fundos=[...globalFundos(a.series),...visualFundos(a.series)];
  const fundoTxt=fundos.length?` | FUNDO ${fundos.map(f=>`${f.w}:${f.p.toFixed(1)}%`).join(" ")}`:"";
  const ligaAtual=activeLiga();
  const opts=MARKETS.map(m=>`<option value="${m.key}" ${m.key===CONFIG.market?"selected":""}>${m.name}</option>`).join("");
  P.innerHTML=`<div class="top"><b>BBTips Robo | ${new Date().toLocaleTimeString()} | Liga ${ligaAtual||"auto"} | Mercado ${esc(market().name)} | API ${API_ROWS.length} | Resultados ${RESULTS_CACHE.length} | Proximos ${a.games.length} | Sinais ${a.signals.length} | Auto ${CONFIG.autoRefresh?"ON":"OFF"}${fundoTxt}</b>
  <span>Mercado <select id="rb-market">${opts}</select> EV+ <input id="rb-ev" value="${CONFIG.minEV}"> Edge+ <input id="rb-edge" value="${CONFIG.minEdge}"> OddFria% <input id="rb-cold" value="${CONFIG.minOddPct}"> Prox <input id="rb-maxprox" value="${CONFIG.maxProximos}"> Tol <input id="rb-tol" value="${CONFIG.tol}">
  <button id="rb-api">Atualizar API</button><button id="rb-hist">Historico</button><button id="rb-scan">Atualizar</button><button id="rb-som">Som</button><button id="rb-min">Minimizar</button><button id="rb-close">Fechar</button></span></div>
  <div class="body">
    ${multiLeagueRadarBox()}
    <h3>Proximos jogos da liga atual</h3>${trendUpBox()}${marketRankingBox()}${anchorAttentionBox(a.games)}${gamesTable(a.games,a.series)}
    <h3>Sinais por minima calculada pelos resultados</h3>${signalsBox(a.signals)}
    <h3>Linha calculada pelos resultados fechados</h3>${trendBox(a.series)}
  </div>`;
  document.getElementById("rb-market").onchange=e=>{
    CONFIG.market=e.target.value;
    try{window.__BBTIPS_GRAPH_SYNC_MARKET?.()}catch(x){}
    scheduleDraw();
  };
  document.getElementById("rb-ev").onchange=e=>{CONFIG.minEV=Number(e.target.value)||0;scheduleDraw()};
  document.getElementById("rb-edge").onchange=e=>{CONFIG.minEdge=Number(e.target.value)||3;scheduleDraw()};
  document.getElementById("rb-cold").onchange=e=>{CONFIG.minOddPct=Number(e.target.value)||45;scheduleDraw()};
  document.getElementById("rb-maxprox").onchange=e=>{CONFIG.maxProximos=Number(e.target.value)||6;scheduleDraw()};
  document.getElementById("rb-tol").onchange=e=>{CONFIG.tol=Number(e.target.value)||0.8;scheduleDraw()};
  document.getElementById("rb-api").onclick=()=>carregarApiDireto();
  document.getElementById("rb-hist").onclick=()=>exportHistory();
  document.getElementById("rb-scan").onclick=manualCollectAndDraw;
  document.getElementById("rb-som").onclick=beep;
  document.getElementById("rb-min").onclick=()=>{
    SCANNER_MANUAL_OPEN=false;
    SCANNER_GRAPH_AUTO_MIN=graphOpen;
    P.classList.add("min");
    scheduleDraw(20);
  };
  document.getElementById("rb-close").onclick=()=>{clearInterval(window[TIMER]);P.remove()};
  const bodyNew=P.querySelector(".body");
  if(bodyNew)bodyNew.scrollTop=oldScroll;
  window.scrollTo(oldPageX,oldPageY);
  }finally{
    DRAWING=false;
    if(DRAW_PENDING){
      DRAW_PENDING=false;
      scheduleDraw(250);
    }
  }
}
draw();
if(CONFIG.autoRefresh){
  window.BBTIPS_ROBO_ALERT_TIMER=setInterval(autoAlertTick,CONFIG.alertIntervalMs||20000);
  window[TIMER]=setInterval(()=>scheduleDraw(50),CONFIG.intervalMs);
}
if(CONFIG.autoApi){
  setTimeout(()=>carregarApiDireto({silent:true}).catch(()=>{}),5000);
  window.BBTIPS_SCANNER_COLLECT_TIMER=setInterval(()=>carregarApiDireto({silent:true}).catch(()=>{}),180000);
}
function apiMarketPays(score,marketKey){
  if(!score)return false;
  const a=Number(score.a),b=Number(score.b);
  if(!Number.isFinite(a)||!Number.isFinite(b))return false;
  const total=a+b; // sempre recalcula; nao confia em score.t que pode vir errado
  switch(marketKey){
    case"over05":return total>=1;
    case"over15":return total>=2;
    case"over25":return total>=3;
    case"over35":return total>=4;
    case"over5":return total>=5;
    case"under15":return total<=1;
    case"under25":return total<=2;
    case"under35":return total<=3;
    case"ambas_sim":return a>0&&b>0;
    case"ambas_nao":return a===0||b===0;
    case"casa_vence":return a>b;
    case"empate":return a===b;
    case"fora_vence":return b>a;
    case"casa5":return a>=5;
    case"fora5":return b>=5;
    default:return total>=3;
  }
}
let __apiSeriesCache={key:"",ts:0,val:null};
function apiRealResultsSeries(marketKey,liga){
  const wanted=String(marketKey||CONFIG.market||"over25");
  const cacheKey=wanted+"|"+(liga||"all")+"|"+API_ROWS.length;
  const now=Date.now();
  if(__apiSeriesCache.key===cacheKey && now-__apiSeriesCache.ts<8000) return __apiSeriesCache.val;
  // 1 passada: filtra e ja calcula idade uma unica vez (sem sort comparador caro)
  const filtered=[];
  for(let i=0;i<API_ROWS.length;i++){
    const r=API_ROWS[i];
    if(!r||!r.score||r.future)continue;
    if(liga&&r.liga&&Number(r.liga)!==Number(liga))continue;
    filtered.push(r);
  }
  if(filtered.length<30){__apiSeriesCache={key:cacheKey,ts:now,val:null};return null;}
  // ordena por idade uma vez so (resultAge calculado inline, cacheado no item)
  for(let i=0;i<filtered.length;i++){if(filtered[i].__age==null)filtered[i].__age=resultAge(filtered[i]);}
  filtered.sort((x,y)=>y.__age-x.__age||(x.idx||0)-(y.idx||0));
  const used=filtered.length>420?filtered.slice(-420):filtered;
  const win=8;
  if(used.length<win+10){__apiSeriesCache={key:cacheKey,ts:now,val:null};return null;}
  // pre-calcula "paga?" 1x por jogo (e marca jogos com placar valido)
  const pays=new Array(used.length);
  const valid=new Array(used.length);
  for(let i=0;i<used.length;i++){
    const sc=used[i].score;
    const a=Number(sc&&sc.a), b=Number(sc&&sc.b);
    valid[i]=Number.isFinite(a)&&Number.isFinite(b);
    pays[i]=valid[i]&&apiMarketPays(sc,wanted)?1:0;
  }
  // janela deslizante INCREMENTAL (soma corrente, sem refazer filter)
  let running=0,validCount=0;
  for(let i=0;i<win;i++){running+=pays[i];if(valid[i])validCount++;}
  const pct=[validCount>=5?Math.round(running/validCount*100):null];
  for(let i=win;i<used.length;i++){
    running+=pays[i]-pays[i-win];
    if(valid[i])validCount++; if(valid[i-win])validCount--;
    pct.push(validCount>=5?Math.round(running/validCount*100):null);
  }
  // preenche buracos (null) com o ultimo valor valido, evitando 0% falso
  let last=40;
  for(let i=0;i<pct.length;i++){ if(pct[i]==null)pct[i]=last; else last=pct[i]; }
  // suavizacao leve
  const smooth=new Array(pct.length);
  for(let i=0;i<pct.length;i++){
    const a=pct[i-1!=-1?Math.max(0,i-1):0],c=pct[i],d=pct[Math.min(pct.length-1,i+1)];
    smooth[i]=Math.round((a+c+d)/3);
  }
  const val={values:smooth,count:filtered.length,marketKey:wanted};
  __apiSeriesCache={key:cacheKey,ts:now,val};
  return val;
}
window.BBTipsRobo={
  analyze,
  config:CONFIG,
  activeLiga,
  exportar:exportHistory,
  historico:loadStoredResults,
  readGraphSeries:robotDirectGraphSeries,
  apiRealSeries:(marketKey)=>apiRealResultsSeries(marketKey,activeLiga()),
  apiRowsCount:()=>API_ROWS.filter(r=>r&&r.score&&!r.future).length,
  apiRealGoals:(liga)=>{
    const l=liga??activeLiga();
    return API_ROWS
      .filter(r=>r&&r.score&&!r.future&&(!l||!r.liga||Number(r.liga)===Number(l)))
      .slice()
      .sort((x,y)=>resultAge(y)-resultAge(x)||(x.idx||0)-(y.idx||0))
      .slice(-20)
      .map((r,index)=>{
        const a=Number(r.score.a)||0,b=Number(r.score.b)||0,t=Number.isFinite(Number(r.score.t))?Number(r.score.t):a+b;
        return {key:"apireal:"+index+":"+a+"x"+b,x:index,y:0,total:t,btts:a>0&&b>0,over25:t>=3,over35:t>=4,score:a+"x"+b};
      });
  },
  refresh:()=>scheduleDraw(80),
  syncLayout:()=>{if(syncScannerWithGraph().changed)scheduleDraw(20)}
};
})();

;(()=>{
  try{if(!window.BBTipsRobo?.config?.graphRobo)return;}catch(e){return;}
  if(window.__BBTIPS_GRAPH_ROBO_INLINE)return;
  window.__BBTIPS_GRAPH_ROBO_INLINE=true;
(function () {
  "use strict";

  const Z = 2147483647;
  const PANEL_POS_KEY = "bbtips-robo-panel-pos";
  const PANEL_MIN_KEY = "bbtips-robo-panel-min";
  const PANEL_COMPACT_MIGRATION_KEY = "bbtips-robo-panel-compact-1.0.53";
  const PATTERN_HISTORY_KEY = "bbtips-robo-pattern-history-v2";
  const LAST_PATTERN_KEY = "bbtips-robo-last-pattern-v2";
  const RIGHT_FOCUS_RATIO = 0.50;
  const LOOP_MS = 15000;
  const SLOW_SCAN_MS = 12000;
  const MIN_VISUAL_SIMILARS = 20;
  const SCORE_RE = /(?:^|[^\d])(\d{1,2})\s*[-xX]\s*(\d{1,2})(?=$|[^\d])/g;
  let panel;
  let canvas;
  let dragging = null;
  let cachedHistChart = null;
  let cachedHist = [];
  let cachedMarket = null;
  let patternMemory = [];
  let lastSlowScan = 0;
  let lastNativeRefresh = 0;
  let lastPublishedGraphKey = "";
  let loopBusy = false;
  let internalResultsCacheSource = null;
  let internalResultsCache = [];
  let bridgedGraphJson = null;
  let bridgedGraphLiga = 0;
  let graphBridgePending = false;
  let graphBridgeRequestedAt = 0;
  let graphBridgeError = "";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data || {};
    if (message.type !== "BBTIPS_GRAPH_DATA_RESPONSE" || message.source !== "bbtips_content") return;
    if (Number(message.liga) !== bridgedGraphLiga) return;
    graphBridgePending = false;
    graphBridgeError = String(message.error || "");
    if (Array.isArray(message.json?.table?.rows)) {
      bridgedGraphJson = message.json;
      internalResultsCacheSource = null;
      internalResultsCache = [];
      setTimeout(loop, 0);
    }
  });

  function ready(fn) {
    if (document.body) fn();
    else setTimeout(() => ready(fn), 100);
  }

  function diagnosticoGrafico() {
    const cfg = window.__gpLastCfg;
    const cfgValues = Array.isArray(cfg?.pontosSelecionado) ? cfg.pontosSelecionado.length : null;
    const siteValues = Array.isArray(window.__ultimoPontosSelecionado) ? window.__ultimoPontosSelecionado.length : null;
    const loadedRows = Array.isArray(window.LOADED_JSON?.table?.rows) ? window.LOADED_JSON.table.rows.length : null;
    let leituraVisual = null;
    try {
      const chart = biggestChart();
      if (chart) {
        const pts = readPoints(chart).sort((a, b) => a.x - b.x);
        if (pts.length) {
          const ys = pts.map((p) => p.y);
          const vs = pts.map((p) => -p.y);
          leituraVisual = {
            qtd_pontos: pts.length,
            primeiro_y: Math.round(ys[0]),
            ultimo_y: Math.round(ys[ys.length - 1]),
            y_min_tela: Math.round(Math.min(...ys)),
            y_max_tela: Math.round(Math.max(...ys)),
            valor_atual_v: Math.round(vs[vs.length - 1]),
            valor_min_v: Math.round(Math.min(...vs)),
            valor_max_v: Math.round(Math.max(...vs)),
            primeiros_5_y: ys.slice(0, 5).map((y) => Math.round(y)),
            ultimos_5_y: ys.slice(-5).map((y) => Math.round(y))
          };
        }
      }
    } catch (e) { leituraVisual = { erro: String(e && e.message || e) }; }
    const report = {
      pagina_reconhecida_como_caramelo: isCarameloGraphPage(),
      tem_dados_nativos: hasNativeGraphData(),
      elementos_dom: {
        graficoPrincipalNovoPanel: Boolean(document.getElementById("graficoPrincipalNovoPanel")),
        linhaFT: Boolean(document.getElementById("linhaFT")),
        grafico: Boolean(document.getElementById("grafico"))
      },
      globais_da_pagina: {
        __graficoPrincipalNovoAPI: Boolean(window.__graficoPrincipalNovoAPI),
        __gpLastCfg: Boolean(window.__gpLastCfg),
        __gpLastCfg_pontosSelecionado_len: cfgValues,
        __ultimoPontosSelecionado_len: siteValues,
        LOADED_JSON_rows_len: loadedRows
      },
      mercado_resolvido: resolveNativeMarket(cfg),
      mercado_desejado_pelo_scanner: desiredNativeMarket(),
      resultados_validos_extraidos: internalResultsFromLoadedJson().length,
      bridge: { pendente: graphBridgePending, erro: graphBridgeError || null, liga: bridgedGraphLiga },
      canvases_grandes_na_pagina: chartCandidates().map((c) => ({ tag: c.el.tagName, w: Math.round(c.r.width), h: Math.round(c.r.height) })),
      leitura_visual: leituraVisual
    };
    console.log("[BBTips diagnostico do grafico]", report);
    return report;
  }

  function start() {
    installLabelHook();
    if (window.BBTipsRobo) window.BBTipsRobo.diag = diagnosticoGrafico;
    makePanel();
    makeCanvas();
    window.__BBTIPS_GRAPH_SYNC_MARKET=()=>{
      setTimeout(loop,350);
    };
    try{clearInterval(window.__BBTIPS_GRAPH_ROBO_TIMER)}catch(e){}
    window.__BBTIPS_GRAPH_ROBO_TIMER=setInterval(loop, LOOP_MS);
    loop();
  }

  function makePanel() {
    if (document.getElementById("bbtips-robo-root")) return;

    panel = document.createElement("div");
    panel.id = "bbtips-robo-root";
    const compactMigrationDone = localStorage.getItem(PANEL_COMPACT_MIGRATION_KEY) === "1";
    const defaultPos = { left: Math.max(8, window.innerWidth - 290), top: 90 };
    const savedPos = compactMigrationDone ? readJson(PANEL_POS_KEY, defaultPos) : defaultPos;
    if (!compactMigrationDone) {
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify(defaultPos));
      localStorage.setItem(PANEL_MIN_KEY, "1");
    }
    panel.setAttribute(
      "style",
      [
        "position:fixed!important",
        "left:" + savedPos.left + "px!important",
        "top:" + savedPos.top + "px!important",
        "z-index:" + Z + "!important",
        "width:260px!important",
        "max-height:min(70vh,560px)!important",
        "overflow-y:auto!important",
        "overflow-x:hidden!important",
        "scrollbar-width:thin!important",
        "background:#050505!important",
        "color:#fff!important",
        "border:2px solid #00ff66!important",
        "border-radius:10px!important",
        "padding:10px!important",
        "font-family:Arial,sans-serif!important",
        "box-shadow:0 0 0 3px rgba(0,255,102,.2),0 14px 32px rgba(0,0,0,.55)!important"
      ].join(";")
    );

    panel.innerHTML = [
      '<div id="bbtips-drag" style="display:flex;align-items:center;justify-content:space-between;gap:8px;color:#00ff66;font-size:18px;font-weight:900;margin-bottom:8px;cursor:move;user-select:none">',
      '<span>ROBO BBTIPS LIGADO</span>',
      '<button id="bbtips-min" type="button" style="cursor:pointer;background:#111;color:#00ff66;border:1px solid #00ff66;border-radius:6px;font-size:18px;font-weight:900;width:34px;height:28px;line-height:20px">_</button>',
      "</div>",
      '<div id="bbtips-mini-summary" style="display:none;color:#fff;font-size:12px;line-height:1.45;border-top:1px solid #244;padding-top:7px">ANALISANDO | zona -- | força -- | hist --</div>',
      '<div id="bbtips-body">',
      '<div id="bbtips-status" style="font-size:13px;color:#ccc;margin-bottom:10px">procurando grafico...</div>',
      '<div id="bbtips-sinal" style="font-size:28px;font-weight:900;text-align:center;border:2px solid #ffd54a;color:#ffd54a;border-radius:8px;padding:10px;margin-bottom:10px">ANALISANDO</div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">',
      box("Forca", "bbtips-forca", "--"),
      box("Zona", "bbtips-zona", "--"),
      box("Virada", "bbtips-virada", "--"),
      box("Pagamento", "bbtips-pagamento", "--"),
      box("Pgto %", "bbtips-pgto-score", "--"),
      box("Histograma", "bbtips-hist", "--"),
      box("Direcao", "bbtips-direcao", "--"),
      box("Orientacao", "bbtips-acao", "Aguardar"),
      "</div>",
      '<div style="margin-top:10px;padding:10px;background:rgba(0,255,102,.08);border:1px solid rgba(0,255,102,.26);border-radius:8px;font-size:12px;line-height:1.45">',
      '<strong style="color:#00ff66;font-size:13px">AMBAS + OVER</strong><br>',
      'BTTS(8): <span id="bbtips-btts" style="font-weight:800">--</span> | ',
      'O2.5(8): <span id="bbtips-over" style="font-weight:800">--</span><br>',
      'O3.5(8): <span id="bbtips-over35" style="font-weight:800">--</span> | ',
      'Media gols: <span id="bbtips-gols" style="font-weight:800">--</span> | ',
      'Seq: <span id="bbtips-seq" style="font-weight:800">--</span><br>',
      '<span id="bbtips-recomendacao" style="display:block;margin-top:4px;font-weight:900;font-size:15px;color:#ffd54a">AGUARDAR</span>',
      "</div>",
      '<div style="margin-top:10px;padding:10px;background:rgba(255,213,74,.08);border:1px solid rgba(255,213,74,.35);border-radius:8px;font-size:12px;line-height:1.45">',
      '<strong style="color:#ffd54a;font-size:13px">BACKTEST DA SERIE</strong><br>',
      '<span id="bbtips-bt-status">juntando memoria...</span><br>',
      'O2.5: <span id="bbtips-bt-over" style="font-weight:800">--</span> | ',
      'O3.5: <span id="bbtips-bt-over35" style="font-weight:800">--</span><br>',
      'Ambas: <span id="bbtips-bt-btts" style="font-weight:800">--</span><br>',
      '<span id="bbtips-bt-sinal" style="display:block;margin-top:4px;font-weight:900;color:#ffd54a">AGUARDAR</span>',
      "</div>",
      '<div id="bbtips-nota" style="font-size:12px;line-height:1.35;color:#ddd;margin-top:10px">Se voce esta vendo este painel, a extensao esta funcionando.</div>',
      "</div>"
    ].join("");

    document.documentElement.appendChild(panel);
    wirePanelControls();
  }

  function wirePanelControls() {
    const drag = document.getElementById("bbtips-drag");
    const min = document.getElementById("bbtips-min");
    const body = document.getElementById("bbtips-body");
    const compactMigrationDone = localStorage.getItem(PANEL_COMPACT_MIGRATION_KEY) === "1";
    const savedMinimized = localStorage.getItem(PANEL_MIN_KEY);
    const minimized = compactMigrationDone ? savedMinimized !== "0" : true;
    if (!compactMigrationDone) {
      localStorage.setItem(PANEL_COMPACT_MIGRATION_KEY, "1");
      localStorage.setItem(PANEL_MIN_KEY, "1");
    }
    setMinimized(minimized);

    drag.addEventListener("pointerdown", (event) => {
      if (event.target === min) return;
      const r = panel.getBoundingClientRect();
      dragging = {
        dx: event.clientX - r.left,
        dy: event.clientY - r.top
      };
      drag.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    window.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const left = clamp(event.clientX - dragging.dx, 0, window.innerWidth - panel.offsetWidth);
      const top = clamp(event.clientY - dragging.dy, 0, window.innerHeight - 44);
      panel.style.setProperty("left", left + "px", "important");
      panel.style.setProperty("top", top + "px", "important");
    });

    window.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = null;
      const r = panel.getBoundingClientRect();
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
    });

    min.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = body.style.display !== "none";
      setMinimized(next);
      localStorage.setItem(PANEL_MIN_KEY, next ? "1" : "0");
    });
  }

  function setMinimized(minimized) {
    const body = document.getElementById("bbtips-body");
    const min = document.getElementById("bbtips-min");
    const summary = document.getElementById("bbtips-mini-summary");
    if (!body || !min) return;
    body.style.display = minimized ? "none" : "block";
    if (summary) summary.style.display = minimized ? "block" : "none";
    min.textContent = minimized ? "+" : "_";
    panel.style.setProperty("width", minimized ? "220px" : "260px", "important");
  }

  function setGraphPanelActive(active) {
    if (panel) panel.style.setProperty("display", active ? "block" : "none", "important");
    if (canvas) canvas.style.setProperty("display", active ? "block" : "none", "important");
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function box(label, id, value) {
    return [
      '<div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:7px;padding:7px">',
      '<b style="display:block;color:#aaa;font-size:11px;margin-bottom:4px">' + label + "</b>",
      '<span id="' + id + '" style="font-weight:800;color:#fff">' + value + "</span>",
      "</div>"
    ].join("");
  }

  function makeCanvas() {
    canvas = document.createElement("canvas");
    canvas.id = "bbtips-robo-desenho";
    canvas.setAttribute(
      "style",
      "position:fixed!important;left:0!important;top:0!important;pointer-events:none!important;z-index:" + (Z - 1) + "!important"
    );
    if (isCarameloGraphPage() && hasNativeGraphData()) canvas.style.display = "none";
    document.documentElement.appendChild(canvas);
  }

  function loop() {
    if (!panel || !canvas || loopBusy) return;
    loopBusy = true;
    try {
    try{window.BBTipsRobo?.syncLayout?.()}catch(e){}

    const nativeDataPresent = hasNativeGraphData();
    const nativeOnly = isCarameloGraphPage() && nativeDataPresent;

    // FONTE PRIMARIA: dados REAIS da API (placares exatos capturados do site).
    // Substitui a leitura de pixel no thtips -> sem travamento, leitura exata.
    // FONTE 1 (definitiva): valores reais que o site escreve no grafico.
    // FONTE 2: serie calculada dos placares da API. Pixel so como ultimo recurso.
    const labelReal = (!nativeDataPresent) ? readLabelGraphData() : null;
    const apiReal = labelReal || ((!nativeDataPresent) ? readApiRealGraphData() : null);

    const nativeCandidate = readNativeGraphData();
    if (!apiReal && nativeCandidate?.waiting && nativeDataPresent) {
      setGraphPanelActive(true);
      write({
        status: nativeCandidate.message || "aguardando os pontos do grafico...",
        sinal: "AGUARDANDO DADOS",
        color: "#ffd54a",
        forca: "--", zona: "--", direcao: "--", virada: "--", pagamento: "--", pgtoScore: "--", hist: "--",
        btts: "--", over: "--", over35: "--", gols: "--", seq: "--", recomendacao: "AGUARDAR", acao: "Aguardar",
        nota: nativeCandidate.detail || "O site ainda nao publicou os pontos internos. A leitura visual esta desligada para nao gerar uma marcacao errada."
      });
      clearDraw();
      return;
    }
    const nativeGraph = apiReal || (nativeCandidate && !nativeCandidate.waiting ? nativeCandidate : null) || readLibraryGraphData();
    if (nativeOnly && !nativeGraph) {
      setGraphPanelActive(true);
      write({
        status: "aguardando dados internos do grafico...",
        sinal: "AGUARDANDO DADOS",
        color: "#ffd54a",
        forca: "--", zona: "--", direcao: "--", virada: "--", pagamento: "--", pgtoScore: "--", hist: "--",
        btts: "--", over: "--", over35: "--", gols: "--", seq: "--", recomendacao: "AGUARDAR", acao: "Aguardar",
        nota: "No Caramelo o robo usa somente a serie interna ou a contagem exata dos resultados. A leitura visual esta desligada."
      });
      clearDraw();
      return;
    }
    // Se nao ha dado nativo nem API real ainda, mostra que esta carregando a API
    // (em vez de ler pixel e travar/errar).
    if (!nativeDataPresent && !nativeGraph) {
      const carregando = (window.BBTipsRobo?.apiRowsCount?.() || 0);
      setGraphPanelActive(true);
      write({
        status: "carregando jogos da API do site (" + carregando + ")...",
        sinal: carregando > 0 ? "LENDO API" : "AGUARDANDO API",
        color: "#ffd54a",
        forca: "--", zona: "--", direcao: "--", virada: "--", pagamento: "--", pgtoScore: "--", hist: "--",
        btts: "--", over: "--", over35: "--", gols: "--", seq: "--", recomendacao: "AGUARDAR", acao: "Aguardar",
        nota: "Usando os dados reais que o site baixa. Clique em Atualizar no site se demorar. A leitura por imagem foi desligada."
      });
      clearDraw();
      return;
    }
    const chart = nativeGraph?.chart || biggestChart();
    if (!chart) {
      setGraphPanelActive(false);
      clearDraw();
      return;
    }

    setGraphPanelActive(true);
    const points = nativeGraph?.points || readPoints(chart);
    const minPoints = nativeGraph ? 14 : 20;
    if (points.length < minPoints) {
      write({
        status: "grafico encontrado, lendo pontos...",
        sinal: "LENDO",
        color: "#ffd54a",
        forca: "--",
        zona: "--",
        direcao: "--",
        virada: "--",
        pagamento: "--",
        pgtoScore: "--",
        hist: "--",
        btts: "--",
        over: "--",
        gols: "--",
        seq: "--",
        recomendacao: "AGUARDAR",
        acao: "Aguardar",
        nota: "Achei o grafico. Estou tentando transformar a linha em pontos para analisar tendencia."
      });
      if (!nativeOnly && !nativeGraph) drawFrame(chart, "#ffd54a");
      return;
    }

    const now = Date.now();
    if (!nativeGraph && (!cachedHistChart || (!cachedHistChart.__bbtipsRegion && !document.contains(cachedHistChart)) || now - lastSlowScan > SLOW_SCAN_MS)) {
      cachedHistChart = findHistogramChart(chart);
      lastSlowScan = now;
    }
    const histChart = nativeGraph?.hist?.length ? null : cachedHistChart;
    const hist = nativeGraph?.hist?.length ? nativeGraph.hist : histChart ? readHistogram(histChart) : [];
    let goalsData;
    if (nativeGraph?.source === "api-real") {
      try { goalsData = window.BBTipsRobo?.apiRealGoals?.() || []; } catch (e) { goalsData = []; }
    } else if (nativeGraph) {
      goalsData = readInternalMatchGoals();
    } else {
      goalsData = readMatchGoals();
    }
    const market = analyzeBTTSandOver(goalsData);
    const focusedPoints = focusRightEdge(points);
    const a = analyze(focusedPoints, hist, market, points);
    if (nativeGraph) {
      a.status += " | fonte " + nativeGraph.sourcePath;
    } else {
      a.status = focusedPoints.length + " pts foco | leitura visual aproximada | hist " + (hist?.length || 0) + " barras";
    }
    try {
      rememberPattern(goalsData, a.graphState);
      a.backtest = analyzeVisualBacktest(a.graphState);
      applyBacktestCaution(a);
    } catch (e) {
      a.backtest = {
        status: "erro isolado",
        over: "--",
        btts: "--",
        sinal: "BACKTEST PAUSADO",
        color: "#ffd54a"
      };
    }
    const graphCombo={...a.graphState,marketKey:nativeGraph?.marketKey||window.BBTipsRobo?.config?.market||"",histLabel:a.hist,sinal:a.sinal,recomendacao:a.recomendacao,source:nativeGraph?.source||"visual",sourcePath:nativeGraph?.sourcePath||"",pointCount:points.length,histCount:hist.length,ts:Date.now()};
    window.__BBTIPS_GRAPH_COMBO=graphCombo;
    const publishedKey=[graphCombo.marketKey,graphCombo.zonePct,graphCombo.force,graphCombo.histPositive?1:0,graphCombo.histWeakening?1:0,Math.round(Number(graphCombo.slope||0)*100),graphCombo.histLabel].join("|");
    if(publishedKey!==lastPublishedGraphKey){
      lastPublishedGraphKey=publishedKey;
    }
    write(a);
    if (nativeGraph || nativeOnly) clearDraw();
    else draw(chart, focusedPoints, a, histChart);
    } catch (error) {
      console.error("[BBTips grafico]", error);
      setGraphPanelActive(true);
      write({
        status: "erro no leitor: " + String(error?.message || error || "desconhecido"),
        sinal: "ERRO DE LEITURA",
        color: "#ff4d5f",
        forca: "--", zona: "--", direcao: "--", virada: "--", pagamento: "--", pgtoScore: "--", hist: "--",
        btts: "--", over: "--", over35: "--", gols: "--", seq: "--", recomendacao: "AGUARDAR", acao: "Aguardar",
        nota: "O leitor foi interrompido sem bloquear a pagina."
      });
      clearDraw();
    } finally {
      loopBusy = false;
    }
  }

  function hasNativeGraphData() {
    return Boolean(
      (Array.isArray(window.__gpLastCfg?.pontosSelecionado) && window.__gpLastCfg.pontosSelecionado.length >= 20) ||
      (Array.isArray(window.__ultimoPontosSelecionado) && window.__ultimoPontosSelecionado.length >= 20) ||
      (Array.isArray(window.LOADED_JSON?.table?.rows) && window.LOADED_JSON.table.rows.length >= 1) ||
      (Array.isArray(bridgedGraphJson?.table?.rows) && bridgedGraphJson.table.rows.length >= 1)
    );
  }

  function isCarameloGraphPage() {
    const hasInternalData = Boolean(
      Array.isArray(window.__gpLastCfg?.pontosSelecionado) ||
      Array.isArray(window.__ultimoPontosSelecionado) ||
      Array.isArray(window.LOADED_JSON?.table?.rows)
    );
    const hasGraphUi = Boolean(
      document.getElementById("graficoPrincipalNovoPanel") ||
      document.getElementById("linhaFT") ||
      document.getElementById("grafico")
    );
    if (hasInternalData) return true;
    const pageText = String(document.body?.innerText || "").slice(0, 12000);
    const sameGraphUi = hasGraphUi && /Tend[eê]ncias/i.test(pageText) && /Refer[eê]ncia/i.test(pageText);
    return /(^|\.)(caramelotips|thtips)\.com\.br$/i.test(location.hostname) && sameGraphUi;
  }

  function desiredNativeMarket() {
    const key = String(window.BBTipsRobo?.config?.market || "");
    if (key === "over25") return { value: "over25", key, source: "mercado do scanner" };
    if (key === "over35") return { value: "over35", key, source: "mercado do scanner" };
    if (key === "ambas_sim") return { value: "ambas sim", key, source: "mercado do scanner" };
    return null;
  }

  function nativeMarketKey(value) {
    const market = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const compact = market.replace(/[^a-z0-9]+/g, "");
    if (compact === "over25" || compact === "o25") return "over25";
    if (compact === "over35" || compact === "o35") return "over35";
    if (["ambassim", "ambasmarcamsim", "bttssim"].includes(compact)) return "ambas_sim";
    return "";
  }

  function nativeMarketValue(key) {
    if (key === "over25") return "over25";
    if (key === "over35") return "over35";
    if (key === "ambas_sim") return "ambas sim";
    return "";
  }

  function marketCandidate(value, source) {
    const key = nativeMarketKey(value);
    return key ? { key, value: nativeMarketValue(key), source } : null;
  }

  function selectedControlMarket(root, source) {
    if (!root?.querySelectorAll) return null;
    const controls = Array.from(root.querySelectorAll("select, input:checked"));
    for (const control of controls) {
      if (control.closest?.("#bbtips-robo-root, #hb-tips-scanner, #bbtips-api-alertas")) continue;
      const text = control.tagName === "SELECT"
        ? control.selectedOptions?.[0]?.textContent || ""
        : control.labels?.[0]?.textContent || "";
      const found = marketCandidate(control.value, source) || marketCandidate(text, source);
      if (found) return found;
    }
    return null;
  }

  function activeChipMarket(root, source) {
    if (!root?.querySelectorAll) return null;
    const selector = [
      '[aria-selected="true"]', '[aria-pressed="true"]', '[data-active="true"]',
      ".active", ".ativo", ".selected", ".selecionado"
    ].join(",");
    const active = Array.from(root.querySelectorAll(selector));
    for (const element of active) {
      if (element.closest?.("#bbtips-robo-root, #hb-tips-scanner, #bbtips-api-alertas")) continue;
      const text = String(element.textContent || "").trim();
      if (!text || text.length > 80) continue;
      const found = marketCandidate(element.dataset?.tipo, source) || marketCandidate(element.dataset?.value, source) || marketCandidate(text, source);
      if (found) return found;
    }
    return null;
  }

  function storedNativeMarket() {
    try {
      const prefs = JSON.parse(localStorage.getItem("caramelo:grafico:prefs:v3") || "null");
      return marketCandidate(prefs?.linhaFT || prefs?.tipoLinha, "preferencia salva do grafico");
    } catch (e) {
      return null;
    }
  }

  function resolveNativeMarket(cfg) {
    const selectedDataset = Array.isArray(cfg?.datasets)
      ? cfg.datasets.find((dataset) => Number(dataset?.order) === 0 && dataset?._tipo) ||
        cfg.datasets.find((dataset) => dataset?._tipo && String(dataset?.color || "").toLowerCase() === "#ffffff")
      : null;
    const direct = [
      marketCandidate(cfg?.tipoLinha, "configuracao interna do grafico"),
      marketCandidate(selectedDataset?._tipo, "serie principal do grafico"),
      marketCandidate(document.getElementById("linhaFT")?.value, "seletor linhaFT")
    ].find(Boolean);
    if (direct) return direct;

    const graphRoot = document.getElementById("graficoPrincipalNovoPanel") ||
      document.getElementById("grafico")?.closest?.(".chart-panel, .grafico-container, [id*='grafico'], [class*='grafico']") ||
      document.querySelector(".chart-panel, .grafico-container, [class*='grafico'][class*='container']");
    const scoped = selectedControlMarket(graphRoot, "controle selecionado do grafico") ||
      activeChipMarket(graphRoot, "botao ativo do grafico") ||
      storedNativeMarket();
    if (scoped) return scoped;
    return selectedControlMarket(document, "controle selecionado da pagina") ||
      activeChipMarket(document, "botao ativo da pagina");
  }

  function nativeMarketPays(game, market) {
    const home = Number(game?.casa);
    const away = Number(game?.fora);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return false;
    const total = home + away;
    if (market === "over25") return total > 2.5;
    if (market === "over35") return total > 3.5;
    if (market === "ambas sim") return home > 0 && away > 0;
    return false;
  }

  function nativeMarkerKind(color) {
    const value = String(color || "").replace(/\s+/g, "").toLowerCase();
    if (value.includes("4caf50") || value.includes("rgb(76,175,80)")) return "green";
    if (value.includes("ff3b30") || value.includes("rgb(255,59,48)")) return "red";
    if (value.includes("204,204,204") || value === "#ccc" || value === "#cccccc" || value === "white" || value === "#fff" || value === "#ffffff") return "white";
    return "unknown";
  }

  function nativeMarkerKindsFromConfig(cfg, marketKey, length) {
    if (!Array.isArray(cfg?.datasets)) return [];
    const dataset = cfg.datasets.find((item) => nativeMarketKey(item?._tipo) === marketKey && Number(item?.order) === 0) ||
      cfg.datasets.find((item) => nativeMarketKey(item?._tipo) === marketKey);
    if (!Array.isArray(dataset?.markerColors) || dataset.markerColors.length !== length) return [];
    return dataset.markerColors.map(nativeMarkerKind);
  }

  function activeGraphLiga() {
    const direct = Number(window.BBTipsRobo?.activeLiga?.());
    if (direct >= 1 && direct <= 5) return direct;
    try {
      const stored = String(sessionStorage.getItem("datasetPath") || sessionStorage.getItem("ligaAtual") || "");
      const match = stored.toLowerCase().match(/(?:^|\/)(copa|euro|super|premier|split)(?:\.json)?(?:$|[?#])/);
      if (match) return { copa: 1, euro: 2, super: 3, premier: 4, split: 5 }[match[1]] || 0;
    } catch (e) {}
    return 0;
  }

  function requestBridgedGraphData() {
    const liga = activeGraphLiga();
    if (!liga) return false;
    if (bridgedGraphLiga !== liga) {
      bridgedGraphLiga = liga;
      bridgedGraphJson = null;
      graphBridgePending = false;
      graphBridgeError = "";
      internalResultsCacheSource = null;
      internalResultsCache = [];
    }
    const now = Date.now();
    if (graphBridgePending && now - graphBridgeRequestedAt < 15000) return true;
    if (bridgedGraphJson && now - graphBridgeRequestedAt < 15000) return true;
    graphBridgePending = true;
    graphBridgeRequestedAt = now;
    const requestId = "graph-" + liga + "-" + now;
    window.postMessage({ type: "BBTIPS_GRAPH_DATA_REQUEST", source: "bbtips_robot", requestId, liga }, "*");
    return true;
  }

  function internalResultsFromLoadedJson() {
    const source = window.LOADED_JSON || window.__payloadTempoRealPendente?.json || window.__CARAMELO_JSON || bridgedGraphJson;
    if (source && source === internalResultsCacheSource) return internalResultsCache;
    const rows = source?.table?.rows;
    if (!Array.isArray(rows)) return [];
    const results = [];
    for (let rowIndex = 0; rowIndex < rows.length && results.length < 420; rowIndex += 1) {
      const cells = Array.isArray(rows[rowIndex]?.c) ? rows[rowIndex].c : [];
      for (let cellIndex = cells.length - 1; cellIndex >= 1 && results.length < 420; cellIndex -= 1) {
        const raw = String(cells[cellIndex]?.v || "").replace(/\r/g, "").trim();
        if (!raw) continue;
        const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
        const score = lines.slice(1).join("\n").match(/(\d+)\+?\s*-\s*(\d+)\+?/);
        const stuck = lines[0]?.match(/^(.*?\s+x\s+.*?)(\d+)\+?\s*-\s*(\d+)\+?\s*$/i);
        const match = stuck ? [stuck[0], stuck[2], stuck[3]] : score;
        if (!match) continue;
        results.push({ casa: Number(match[1]), fora: Number(match[2]) });
      }
    }
    internalResultsCacheSource = source;
    internalResultsCache = results;
    return internalResultsCache;
  }

  function calculateNativeGraphSeries(market) {
    const results = internalResultsFromLoadedJson();
    const requested = Math.max(40, parseInt(document.getElementById("qtd")?.value, 10) || 120);
    const used = results.slice(0, requested);
    const blockCount = Math.floor(used.length / 20);
    if (blockCount < 2) return { values: [], markerKinds: [] };
    const blocks = Array.from({ length: blockCount }, (_, index) => used.slice(index * 20, index * 20 + 20));
    const newest = blocks[blocks.length - 1];
    const initial = newest.filter((game) => nativeMarketPays(game, market)).length / newest.length * 100;
    const values = [initial];
    const markerKinds = ["white"];
    for (let block = blockCount - 2; block >= 0; block -= 1) {
      for (let index = 19; index >= 0; index -= 1) {
        const currentPays = nativeMarketPays(blocks[block][index], market);
        const referencePays = nativeMarketPays(blocks[block + 1][index], market);
        values.push(values[values.length - 1] + (currentPays && !referencePays ? 5 : !currentPays && referencePays ? -5 : 0));
        markerKinds.push(currentPays && referencePays ? "green" : !currentPays && !referencePays ? "red" : "white");
      }
    }
    return { values, markerKinds };
  }

  function calculateNativeSeries(market) {
    return calculateNativeGraphSeries(market).values;
  }

  function readNativeGraphData() {
    const nativeRuntime = Boolean(
      document.getElementById("graficoPrincipalNovoPanel") ||
      document.getElementById("linhaFT") ||
      document.getElementById("grafico") ||
      window.__graficoPrincipalNovoAPI ||
      window.__gpLastCfg ||
      window.__ultimoPontosSelecionado ||
      window.LOADED_JSON?.table?.rows ||
      bridgedGraphJson?.table?.rows
    );
    if (!nativeRuntime) return null;
    const cfg = window.__gpLastCfg;
    const cfgValues = Array.isArray(cfg?.pontosSelecionado) ? Array.from(cfg.pontosSelecionado) : [];
    const siteValues = Array.isArray(window.__ultimoPontosSelecionado) ? Array.from(window.__ultimoPontosSelecionado) : [];
    const graphMarket = resolveNativeMarket(cfg);
    const resolvedMarket = graphMarket || desiredNativeMarket();
    const activeMarket = resolvedMarket?.value || "";
    const marketKey = resolvedMarket?.key || "";
    const canUseInternalPoints = Boolean(graphMarket);
    const calculated = canUseInternalPoints && (cfgValues.length >= 20 || siteValues.length >= 20)
      ? { values: [], markerKinds: [] }
      : calculateNativeGraphSeries(activeMarket);
    const rawValues = canUseInternalPoints && cfgValues.length >= 20
      ? cfgValues
      : canUseInternalPoints && siteValues.length >= 20
        ? siteValues
        : calculated.values;
    const values = rawValues.map(Number).filter(Number.isFinite);
    const configuredMarkers = canUseInternalPoints ? nativeMarkerKindsFromConfig(cfg, marketKey, values.length) : [];
    const markerKinds = configuredMarkers.length === values.length
      ? configuredMarkers
      : calculated.markerKinds.length === values.length
        ? calculated.markerKinds
        : values.map((value, index) => index > 0 && value !== values[index - 1] ? "white" : "unknown");

    if (!marketKey) {
      return isCarameloGraphPage()
        ? { waiting: true, message: "selecione Over 2.5, Over 3.5 ou Ambas Sim no grafico", detail: "O mercado do grafico nao foi identificado; nenhuma leitura visual foi usada." }
        : null;
    }
    if (values.length < 20) {
      const bridgeRequested = requestBridgedGraphData();
      return isCarameloGraphPage()
        ? {
            waiting: true,
            message: bridgeRequested ? "carregando todos os pontos da liga..." : "aguardando a serie interna do grafico...",
            detail: "Pontos internos: " + Math.max(cfgValues.length, siteValues.length) + " | resultados validos: " + internalResultsFromLoadedJson().length + (graphBridgePending ? " | buscando JSON da liga" : graphBridgeError ? " | erro da fonte: " + graphBridgeError : "") + "."
          }
        : null;
    }

    const points = values.map((value, index) => ({
      x: index,
      y: -value,
      v: value,
      delta: index ? value - values[index - 1] : 0,
      marker: markerKinds[index] || "unknown"
    }));
    const hist = nativeMacdHistogram(values).map((value, index) => ({ x: index, y: 0, v: value }));
    return {
      chart: document.getElementById("grafico") || biggestChart(),
      points,
      hist,
      marketKey,
      source: "caramelo-data",
      sourcePath: (canUseInternalPoints && cfgValues.length >= 20
        ? "DADOS INTERNOS DO GRAFICO (__gpLastCfg), " + values.length + " pontos"
        : canUseInternalPoints && siteValues.length >= 20
          ? "DADOS INTERNOS DO GRAFICO (__ultimoPontosSelecionado), " + values.length + " pontos"
          : "CONTAGEM EXATA DOS RESULTADOS (LOADED_JSON), " + values.length + " pontos")
    };
  }

  // ===== LEITOR DEFINITIVO: intercepta os rotulos que o site desenha no grafico =====
  // O site escreve os valores da linha (40,45,50...) via ctx.fillText. Capturamos esses
  // numeros com a posicao exata. E o numero REAL que voce ve, nao pixel nem formula.
  let __labelHookInstalled = false;
  let __labelCapture = { texts: [], ts: 0 };
  function installLabelHook() {
    if (__labelHookInstalled) return;
    try {
      const proto = CanvasRenderingContext2D.prototype;
      const oFillText = proto.fillText;
      proto.fillText = function (t, x, y) {
        try {
          const s = String(t).trim();
          if (/^\d{2}$/.test(s)) {
            const v = Number(s);
            if (v >= 20 && v <= 95) {
              __labelCapture.texts.push({ v, x: Math.round(x), y: Math.round(y) });
              if (__labelCapture.texts.length > 4000) __labelCapture.texts.splice(0, 2000);
              __labelCapture.ts = Date.now();
            }
          }
        } catch (e) {}
        return oFillText.apply(this, arguments);
      };
      __labelHookInstalled = true;
    } catch (e) {}
  }

  function readLabelGraphData() {
    installLabelHook();
    const raw = __labelCapture.texts;
    if (!raw.length || Date.now() - __labelCapture.ts > 8000) return null;
    // Os rotulos da LINHA ficam em x>10 (descarta eixo Y em x~0) e dentro da area do grafico.
    // Pegamos a ULTIMA passada de desenho: agrupa por x, valor mais recente por posicao.
    const byPos = new Map();
    for (let i = raw.length - 1; i >= 0; i--) {
      const p = raw[i];
      if (p.x <= 10) continue;
      const key = p.x;
      if (!byPos.has(key)) byPos.set(key, p);
      if (byPos.size > 400) break;
    }
    const pts = Array.from(byPos.values()).sort((a, b) => a.x - b.x);
    if (pts.length < 8) return null;
    const values = pts.map((p) => p.v);
    return {
      chart: biggestChart(),
      points: values.map((value, index) => ({ x: index, y: -value, v: value })),
      hist: nativeMacdHistogram(values).map((value, index) => ({ x: index, y: 0, v: value })),
      marketKey: String(window.BBTipsRobo?.config?.market || ""),
      source: "rotulos-do-site",
      sourcePath: "VALORES REAIS DO GRAFICO (" + values.length + " pontos lidos do site)"
    };
  }

  function readApiRealGraphData() {
    let series = null;
    try {
      const marketKey = String(window.BBTipsRobo?.config?.market || "over25");
      series = window.BBTipsRobo?.apiRealSeries?.(marketKey);
    } catch (e) {}
    const values = Array.isArray(series?.values) ? series.values.map(Number).filter(Number.isFinite) : [];
    if (values.length < 14) return null;
    return {
      chart: biggestChart(),
      points: values.map((value, index) => ({ x: index, y: -value, v: value })),
      hist: nativeMacdHistogram(values).map((value, index) => ({ x: index, y: 0, v: value })),
      marketKey: String(series?.marketKey || window.BBTipsRobo?.config?.market || ""),
      source: "api-real",
      sourcePath: "DADOS REAIS DA API (" + (series?.count || values.length) + " jogos)"
    };
  }

  function readLibraryGraphData() {
    let direct=null;
    try { direct=window.BBTipsRobo?.readGraphSeries?.(); } catch (e) {}
    const values=Array.isArray(direct?.values)?direct.values.map(Number).filter(Number.isFinite):[];
    if(values.length<20)return null;
    const histValues=Array.isArray(direct?.histValues)?direct.histValues.map(Number).filter(Number.isFinite):[];
    return {
      chart: biggestChart(),
      points:values.map((value,index)=>({x:index,y:-value,v:value})),
      hist:histValues.map((value,index)=>({x:index,y:0,v:value})),
      marketKey:String(window.BBTipsRobo?.config?.market||""),
      source:"site-data",
      sourcePath:String(direct?.path||"biblioteca do grafico"),
      histSourcePath:String(direct?.histPath||"")
    };
  }

  function nativeEma(values, period) {
    const p = Math.max(1, parseInt(period, 10) || 1);
    const out = new Array(values.length).fill(null);
    if (!values.length) return out;
    let sum = 0;
    let count = 0;
    let seedIndex = -1;
    for (let i = 0; i < values.length; i += 1) {
      const value = Number(values[i]);
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
      if (count === p) {
        seedIndex = i;
        out[i] = sum / p;
        break;
      }
    }
    if (seedIndex < 0) {
      sum = 0;
      count = 0;
      for (let i = 0; i < values.length; i += 1) {
        const value = Number(values[i]);
        if (!Number.isFinite(value)) continue;
        sum += value;
        count += 1;
        out[i] = sum / count;
      }
      return out;
    }
    const k = 2 / (p + 1);
    for (let i = seedIndex + 1; i < values.length; i += 1) {
      const value = Number(values[i]);
      out[i] = Number.isFinite(value) ? (value - out[i - 1]) * k + out[i - 1] : out[i - 1];
    }
    return out;
  }

  function nativeMacdHistogram(values) {
    const fast = Math.max(1, parseInt(document.getElementById("macdRapida")?.value, 10) || 12);
    const slow = Math.max(fast + 1, parseInt(document.getElementById("macdLenta")?.value, 10) || 26);
    const signalPeriod = Math.max(1, parseInt(document.getElementById("macdSinal")?.value, 10) || 9);
    const fastEma = nativeEma(values, fast);
    const slowEma = nativeEma(values, slow);
    const macd = fastEma.map((value, index) => Number.isFinite(value) && Number.isFinite(slowEma[index]) ? value - slowEma[index] : null);
    const signal = nativeEma(macd, signalPeriod);
    return macd.map((value, index) => Number.isFinite(value) && Number.isFinite(signal[index]) ? value - signal[index] : null).filter(Number.isFinite);
  }

  function applyBacktestCaution(a) {
    const rec = String(a.recomendacao || "");
    const bt = String(a.backtest?.sinal || "");
    const goodRecent = rec.includes("ENTRAR") || rec.includes("BOM");
    const badBacktest = bt.includes("RUIM") || bt.includes("EVITAR");
    const goodBacktest = bt.includes("BOM");
    const graphAgainst = String(a.direcao || "").includes("Descendo") && !String(a.sinal || "").includes("PAGAR");

    if (goodRecent && (badBacktest || graphAgainst)) {
      a.recomendacao = badBacktest ? "AGUARDAR (BT RUIM)" : "AGUARDAR (GRAFICO CONTRA)";
      return;
    }

    if (rec === "AGUARDAR" && goodBacktest && !graphAgainst) {
      a.recomendacao = bt.includes("O3.5") ? "OBSERVAR OVER 3.5" : "OBSERVAR OVER";
    }
  }

  function biggestChart() {
    return chartCandidates()[0]?.el;
  }

  function chartCandidates() {
    return Array.from(document.querySelectorAll("canvas,svg"))
      .filter((el) => !String(el.id || "").startsWith("bbtips-robo"))
      .filter((el) => !el.closest("#bbtips-robo-root"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 350 && x.r.height > 180 && x.r.bottom > 0 && x.r.right > 0)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  }

  function findHistogramChart(priceChart) {
    if (!priceChart) return null;
    const priceBox = priceChart.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll("canvas,svg"))
      .filter((el) => el !== priceChart)
      .filter((el) => !String(el.id || "").startsWith("bbtips-robo"))
      .filter((el) => !el.closest("#bbtips-robo-root"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((item) => item.r.width > 300 && item.r.height > 70)
      .filter((item) => item.r.bottom > 0 && item.r.right > 0)
      .filter((item) => item.r.top >= priceBox.bottom - 18)
      .filter((item) => item.r.top <= priceBox.bottom + 520)
      .filter((item) => horizontalOverlap(item.r, priceBox) > 0.55)
      .map((item) => ({ ...item, score: histogramScore(item.el) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.r.top - b.r.top);
    if (candidates[0]?.el) return candidates[0].el;

    const inferred = inferHistogramRegion(priceBox);
    return readDomHistogram(inferred).length >= 8 ? inferred : null;
  }

  function inferHistogramRegion(priceBox) {
    const top = priceBox.bottom + 4;
    const bottom = Math.min(window.innerHeight - 8, top + Math.max(170, priceBox.height * 0.42));
    const rect = {
      left: priceBox.left,
      top,
      right: priceBox.right,
      bottom,
      width: priceBox.width,
      height: bottom - top
    };
    return {
      __bbtipsRegion: true,
      getBoundingClientRect: () => rect
    };
  }

  function horizontalOverlap(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    return Math.max(0, right - left) / Math.max(1, Math.min(a.width, b.width));
  }

  function histogramScore(el) {
    const points = readHistogram(el);
    if (points.length < 8) return 0;
    const signs = new Set(points.slice(-40).map((p) => Math.sign(p.v)).filter(Boolean));
    const box = el.getBoundingClientRect();
    return points.length + signs.size * 20 + Math.max(0, 220 - box.height) * 0.05;
  }

  function readPoints(el) {
    if (el.tagName.toLowerCase() === "svg") return readSvg(el);
    return readCanvas(el);
  }

  function readSvg(svg) {
    const items = Array.from(svg.querySelectorAll("path,polyline,polygon"))
      .map((shape) => sampleShape(svg, shape))
      .filter((p) => p.length > 20)
      .sort((a, b) => b.length - a.length);
    return (items[0] || []).sort((a, b) => a.x - b.x);
  }

  function sampleShape(svg, shape) {
    const tag = shape.tagName.toLowerCase();
    if (tag !== "path") {
      return (shape.getAttribute("points") || "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite))
        .map(([x, y]) => svgPoint(svg, x, y));
    }
    const len = shape.getTotalLength ? shape.getTotalLength() : 0;
    if (!len) return [];
    const out = [];
    for (let i = 0; i <= 160; i += 1) {
      const p = shape.getPointAtLength((len * i) / 160);
      out.push(svgPoint(svg, p.x, p.y));
    }
    return out;
  }

  function svgPoint(svg, x, y) {
    const p = svg.createSVGPoint();
    const box = svg.getBoundingClientRect();
    p.x = x;
    p.y = y;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: box.left + x, y: box.top + y };
    const m = p.matrixTransform(ctm);
    return { x: m.x, y: m.y };
  }

  function readCanvas(c) {
    try {
      const box = c.getBoundingClientRect();
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];
      const w = c.width;
      const h = c.height;
      const img = ctx.getImageData(0, 0, w, h).data;
      const sx = box.width / w;
      const sy = box.height / h;
      const step = Math.max(2, Math.floor(w / 220));
      const cols = [];
      const topLimit = Math.round(h * 0.08);
      const bottomLimit = Math.round(h * 0.92);
      const rightLimit = Math.min(w - 2, Math.round(w * 0.94));

      const dashRowHits = {};
      for (let x = 0; x <= rightLimit; x += step) {
        const blueYs = [];
        const whiteYs = [];
        const dotYs = [];
        for (let y = topLimit; y < bottomLimit; y += 2) {
          const i = (y * w + x) * 4;
          const r = img[i];
          const g = img[i + 1];
          const b = img[i + 2];
          const a = img[i + 3];
          const green = a > 120 && g > 120 && g > r * 1.15 && g > b * 1.05;
          const red = a > 120 && r > 150 && r > g * 1.15 && r > b * 1.15;
          const yellow = a > 120 && r > 175 && g > 135 && b < 120 && r > b * 1.7 && g > b * 1.35;
          const blue = a > 120 && b > 145 && g > 95 && b > r * 1.1;
          const white = a > 150 && r > 215 && g > 215 && b > 215;
          if (blue) blueYs.push(y);
          else if (white) whiteYs.push(y);
          else if (green || red || yellow) {
            dotYs.push(y);
            const band = Math.round(y / 6);
            dashRowHits[band] = (dashRowHits[band] || 0) + 1;
          }
        }
        if (blueYs.length || whiteYs.length || dotYs.length) {
          cols.push({ x, blueYs, whiteYs, dotYs });
        }
      }

      // Linhas horizontais tracejadas (Topo/Fundo) acertam a MESMA faixa de altura
      // em muitas colunas. Removemos esses pixels coloridos para nao confundir com
      // os marcadores reais da curva.
      const totalCols = cols.length || 1;
      const dashBands = new Set(
        Object.keys(dashRowHits).filter((band) => dashRowHits[band] >= totalCols * 0.45).map(Number)
      );
      if (dashBands.size) {
        cols.forEach((col) => {
          col.dotYs = col.dotYs.filter((y) => !dashBands.has(Math.round(y / 6)));
        });
      }

      const tracked = trackRightEdgeLine(cols, w);
      return tracked.map((p) => ({ x: box.left + p.x * sx, y: box.top + p.y * sy })).sort((a, b) => a.x - b.x);
    } catch (e) {
      return [];
    }
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function nearest(values, target) {
    if (!values.length) return null;
    let best = values[0];
    let bestDist = Math.abs(best - target);
    for (let i = 1; i < values.length; i += 1) {
      const dist = Math.abs(values[i] - target);
      if (dist < bestDist) {
        best = values[i];
        bestDist = dist;
      }
    }
    return best;
  }

  function trackRightEdgeLine(cols, width) {
    if (!cols.length) return [];
    const byX = cols.slice().sort((a, b) => a.x - b.x);
    const rightStart = width * 0.72;
    let lastY = null;
    const out = [];

    // A linha branca e a curva real (continua e grossa). Os pontos coloridos
    // (verde/vermelho) so valem quando estao colados nela. As tracejadas de
    // "Topo"/"Fundo" e textos do eixo geram pixels soltos em altura fixa e NAO
    // devem ser seguidos.
    const NEAR = Math.max(28, Math.round(width * 0.05));

    for (let i = byX.length - 1; i >= 0; i -= 1) {
      const col = byX[i];
      const whites = col.whiteYs || [];
      const dots = col.dotYs || [];
      const blues = col.blueYs || [];
      let y = null;

      if (lastY == null) {
        // Ponta direita: ancora na LINHA BRANCA. So usa colorido/azul se nao houver branca.
        if (col.x < rightStart) continue;
        if (whites.length) y = median(whites);
        else if (dots.length) y = median(dots);
        else if (blues.length) y = median(blues);
        else continue;
      } else {
        const wNear = whites.length ? nearest(whites, lastY) : null;
        const dNear = dots.length ? nearest(dots, lastY) : null;
        const bNear = blues.length ? nearest(blues, lastY) : null;
        // prioridade: branca colada > dot colado > azul colado > branca mais proxima
        if (wNear != null && Math.abs(wNear - lastY) <= NEAR) y = wNear;
        else if (dNear != null && Math.abs(dNear - lastY) <= NEAR) y = dNear;
        else if (bNear != null && Math.abs(bNear - lastY) <= NEAR) y = bNear;
        else if (wNear != null) y = wNear;
        else continue;
      }

      if (y == null) continue;
      if (lastY != null && Math.abs(y - lastY) > 130) continue;
      out.push({ x: col.x, y });
      lastY = y;
    }

    const result = out.reverse();
    if (result.length >= 20) return result;
    // fallback: usa a linha branca de cada coluna (curva real), nao os coloridos
    return byX
      .map((col) => ({ x: col.x, y: median((col.whiteYs && col.whiteYs.length) ? col.whiteYs : (col.dotYs && col.dotYs.length) ? col.dotYs : col.blueYs) }))
      .filter((p) => p.y != null);
  }

  function readHistogram(el) {
    if (el.__bbtipsRegion) return readDomHistogram(el);
    if (el.tagName.toLowerCase() === "svg") return readSvgHistogram(el);
    const canvasHist = readCanvasHistogram(el);
    return canvasHist.length >= 8 ? canvasHist : readDomHistogram(el);
  }

  function readDomHistogram(elOrRegion) {
    const area = elOrRegion.getBoundingClientRect();
    const bars = [];
    const nodes = Array.from(document.querySelectorAll("div,span,rect,path"));

    nodes.forEach((node) => {
      if (node.closest("#bbtips-robo-root")) return;
      if (String(node.id || "").startsWith("bbtips-robo")) return;
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 3) return;
      if (r.right < area.left || r.left > area.right || r.bottom < area.top || r.top > area.bottom) return;
      if (r.width > 40 || r.height > area.height * 0.95) return;

      const style = getComputedStyle(node);
      const fill = node.getAttribute?.("fill") || "";
      const stroke = node.getAttribute?.("stroke") || "";
      const colorText = [style.backgroundColor, style.color, style.borderColor, fill, stroke].join(" ").toLowerCase();
      const color = colorSignal(colorText);
      if (!color) return;

      bars.push({
        x: r.left + r.width / 2,
        y: r.top,
        v: color * Math.max(1, r.height)
      });
    });

    return compactBars(bars).sort((a, b) => a.x - b.x);
  }

  function colorSignal(text) {
    const rgb = text.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgb) {
      const r = Number(rgb[1]);
      const g = Number(rgb[2]);
      const b = Number(rgb[3]);
      if (g > 105 && g > r * 1.15 && g > b * 1.05) return 1;
      if (r > 130 && r > g * 1.15 && r > b * 1.15) return -1;
    }
    if (text.includes("green") || text.includes("#0f") || text.includes("#00") || text.includes("4caf") || text.includes("22c55")) return 1;
    if (text.includes("red") || text.includes("#f") || text.includes("ef44") || text.includes("ff") || text.includes("e539")) return -1;
    return 0;
  }

  function compactBars(bars) {
    const byX = new Map();
    bars.forEach((bar) => {
      const key = Math.round(bar.x / 4) * 4;
      const prev = byX.get(key);
      if (!prev || Math.abs(bar.v) > Math.abs(prev.v)) byX.set(key, bar);
    });
    return Array.from(byX.values());
  }

  function readSvgHistogram(svg) {
    const box = svg.getBoundingClientRect();
    const rects = Array.from(svg.querySelectorAll("rect"))
      .map((rect) => {
        const r = rect.getBoundingClientRect();
        const fill = String(rect.getAttribute("fill") || rect.style.fill || "").toLowerCase();
        const green = fill.includes("0, 255") || fill.includes("green") || fill.includes("#0") || fill.includes("4caf");
        const red = fill.includes("255, 0") || fill.includes("red") || fill.includes("#f") || fill.includes("e539");
        if (!green && !red) return null;
        return { x: r.left + r.width / 2, v: (green ? 1 : -1) * Math.max(1, r.height), y: r.top };
      })
      .filter(Boolean)
      .filter((p) => p.x >= box.left && p.x <= box.right);
    return rects.sort((a, b) => a.x - b.x);
  }

  function readCanvasHistogram(c) {
    try {
      const box = c.getBoundingClientRect();
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];
      const w = c.width;
      const h = c.height;
      const img = ctx.getImageData(0, 0, w, h).data;
      const sx = box.width / w;
      const step = Math.max(2, Math.floor(w / 180));
      const out = [];

      for (let x = 0; x < w; x += step) {
        let green = 0;
        let red = 0;
        for (let y = 0; y < h; y += 2) {
          const i = (y * w + x) * 4;
          const r = img[i];
          const g = img[i + 1];
          const b = img[i + 2];
          const a = img[i + 3];
          if (a < 120) continue;
          if (g > 115 && g > r * 1.2 && g > b * 1.05) green += 1;
          if (r > 150 && r > g * 1.15 && r > b * 1.15) red += 1;
        }
        if (green || red) {
          out.push({
            x: box.left + x * sx,
            y: box.top + box.height / 2,
            v: green >= red ? green : -red
          });
        }
      }

      return out.sort((a, b) => a.x - b.x);
    } catch (e) {
      return [];
    }
  }

  function analyzeHistogram(hist) {
    if (!hist || hist.length < 12) {
      return {
        ok: false,
        label: "nao lido",
        bias: 0,
        rising: false,
        weakening: false,
        flipUp: false,
        flipDown: false,
        positive: false
      };
    }

    const recent = hist.slice(-Math.max(8, Math.round(hist.length * 0.22)));
    const prev = hist.slice(-Math.max(16, Math.round(hist.length * 0.44)), -recent.length);
    const avgRecent = avg(recent.map((p) => p.v));
    const avgPrev = avg(prev.map((p) => p.v));
    const absRecent = avg(recent.map((p) => Math.abs(p.v)));
    const absPrev = avg(prev.map((p) => Math.abs(p.v)));
    const positiveCount = recent.filter((p) => p.v > 0).length;
    const negativeCount = recent.filter((p) => p.v < 0).length;
    // Sinal do histograma: usa a media recente (avgRecent). Se estiver muito perto
    // de zero, desempata pela CONTAGEM e, em ultimo caso, pela inclinacao recente.
    const span = Math.max(...hist.map((p) => Math.abs(p.v)), 0.0001);
    const nearZero = Math.abs(avgRecent) < span * 0.12;
    let positive;
    if (!nearZero) {
      positive = avgRecent > 0;
    } else if (positiveCount !== negativeCount) {
      positive = positiveCount > negativeCount;
    } else {
      // empate real: olha se o histograma esta subindo (verde) ou descendo (vermelho)
      positive = avgRecent >= avgPrev;
    }
    const rising = avgRecent > avgPrev && absRecent >= absPrev * 0.85;
    const weakening = positive ? avgRecent < avgPrev * 0.82 : avgRecent > avgPrev * 0.82;
    const flipUp = avgPrev < 0 && avgRecent > 0;
    const flipDown = avgPrev > 0 && avgRecent < 0;
    const strength = absRecent < span * 0.25 ? "fraco" : (weakening ? "fraco" : "forte");
    const label = (positive ? "verde" : "vermelho") + " " + strength;

    return {
      ok: true,
      label,
      bias: avgRecent,
      rising,
      weakening,
      flipUp,
      flipDown,
      positive
    };
  }

  function avg(values) {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  }

  function focusRightEdge(points) {
    if (!points || points.length < 25) return points || [];
    const ordered = points.slice().sort((a, b) => a.x - b.x);
    const minX = ordered[0].x;
    const maxX = ordered[ordered.length - 1].x;
    const startX = maxX - (maxX - minX) * RIGHT_FOCUS_RATIO;
    const focused = ordered.filter((p) => p.x >= startX);
    return focused.length >= 18 ? focused : ordered.slice(-45);
  }

  function nativeWhiteEdge(points, maxAge = 10) {
    const ordered = (points || []).slice().sort((a, b) => a.x - b.x);
    const whites = ordered
      .map((point, index) => ({ ...point, sourceIndex: index }))
      .filter((point) => point.marker === "white" && point.sourceIndex > 0 && Number(point.delta) !== 0);
    const last = whites[whites.length - 1] || null;
    const age = last ? ordered.length - 1 - last.sourceIndex : Infinity;
    const recentWhites = whites.filter((point) => ordered.length - 1 - point.sourceIndex <= maxAge);
    const net = whites.reduce((sum, point) => sum + Number(point.delta || 0), 0);
    const recentNet = recentWhites.reduce((sum, point) => sum + Number(point.delta || 0), 0);
    const up = whites.filter((point) => Number(point.delta) > 0).length;
    const down = whites.filter((point) => Number(point.delta) < 0).length;
    return {
      count: whites.length,
      up,
      down,
      net,
      recentCount: recentWhites.length,
      recentNet,
      move: recentNet,
      age,
      recent: recentWhites.length > 0 && recentNet !== 0,
      direction: recentNet > 0 ? "subindo" : recentNet < 0 ? "descendo" : "equilibrada"
    };
  }

  function readMatchGoals() {
    const internalGoals = readInternalMatchGoals();
    if (internalGoals.length >= 8) return internalGoals;

    const domGoals = readDomMatchGoals();
    return domGoals.length ? domGoals : internalGoals;
  }

  function readInternalMatchGoals() {
    const internalGoals = internalResultsFromLoadedJson()
      .slice(0, 20)
      .reverse()
      .map((game, index) => ({
        key: "interno:" + index + ":" + game.casa + "x" + game.fora,
        x: index,
        y: 0,
        total: game.casa + game.fora,
        btts: game.casa > 0 && game.fora > 0,
        over25: game.casa + game.fora >= 3,
        over35: game.casa + game.fora >= 4,
        score: game.casa + "x" + game.fora
      }));
    if (internalGoals.length >= 8) return internalGoals;

    const storedGoals = readStoredMatchGoals();
    return storedGoals.length ? storedGoals : internalGoals;
  }

  function readDomMatchGoals() {
    const candidates = Array.from(document.querySelectorAll("text,tspan,span,div,td"))
      .map((el) => {
        if (el.closest?.("#bbtips-robo-root,#bbtips-final-robo")) return null;
        if (el.closest?.("script,style,noscript,button,input,select,textarea")) return null;
        const box = el.getBoundingClientRect();
        if (!isVisibleBox(el, box)) return null;
        const text = scoreTextFromNode(el);
        const score = parseScoreText(text);
        if (!score) return null;
        return {
          key: Math.round(box.left) + ":" + Math.round(box.top) + ":" + score.a + "x" + score.b,
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
          area: box.width * box.height,
          total: score.t,
          btts: score.a > 0 && score.b > 0,
          over25: score.t >= 3,
          over35: score.t >= 4,
          score: score.a + "x" + score.b
        };
      })
      .filter(Boolean);

    const unique = [];
    const seen = new Set();
    candidates
      .sort((a, b) => a.x - b.x || a.y - b.y || a.area - b.area)
      .forEach((item) => {
        const bucket = Math.round(item.x / 16) + ":" + Math.round(item.y / 12) + ":" + item.score;
        if (seen.has(bucket)) return;
        seen.add(bucket);
        unique.push(item);
      });

    return unique.slice(-20);
  }

  function isVisibleBox(el, box) {
    if (!box || box.width < 4 || box.height < 4) return false;
    if (box.bottom <= 0 || box.right <= 0 || box.top >= window.innerHeight || box.left >= window.innerWidth) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
  }

  function scoreTextFromNode(el) {
    const direct = Array.from(el.childNodes || [])
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue || "")
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    const text = direct || (el.children?.length ? "" : (el.textContent || ""));
    return String(text || "").trim().replace(/\s+/g, " ");
  }

  function parseScoreText(text) {
    if (!text || text.length > 80) return null;
    SCORE_RE.lastIndex = 0;
    const matches = Array.from(String(text).matchAll(SCORE_RE));
    if (matches.length !== 1) return null;
    const a = Number(matches[0][1]);
    const b = Number(matches[0][2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > 12 || b > 12) return null;
    return { a, b, t: a + b };
  }

  function readStoredMatchGoals() {
    const rows = [];
    const addRows = (value) => {
      if (Array.isArray(value)) rows.push(...value);
    };

    try { addRows(window.BBTipsRobo?.historico?.()); } catch (e) {}
    addRows(readJson("BBTIPS_FINAL_RESULTADOS_HIST_V1", []));
    addRows(readJson("BBTIPS_FINAL_API_ROWS_V2", []));

    const seen = new Set();
    const goals = [];
    rows.forEach((row, index) => {
      if (!row || row.future) return;
      const score = scoreFromStoredRow(row);
      if (!score) return;
      const name = String(row.name || row.Nome || row.jogo || row.Jogo || "").toLowerCase().replace(/\s+/g, " ").trim();
      const time = String(row.time || row.Horario || row.horario || row.Hora || row.hora || "");
      const key = [time, name, score.a + "-" + score.b].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      goals.push({
        key,
        x: index,
        y: 0,
        age: resultAgeFromTime(time, index),
        total: score.t,
        btts: score.a > 0 && score.b > 0,
        over25: score.t >= 3,
        over35: score.t >= 4,
        score: score.a + "x" + score.b
      });
    });

    return goals
      .sort((a, b) => a.age - b.age)
      .slice(0, 20)
      .reverse()
      .map(({ age, ...goal }) => goal);
  }

  function scoreFromStoredRow(row) {
    const raw = row.score || row.Resultado || row.resultado || row.Placar || row.placar || "";
    if (raw && typeof raw === "object") {
      const a = Number(raw.a ?? raw.home ?? raw.casa ?? raw.Casa);
      const b = Number(raw.b ?? raw.away ?? raw.fora ?? raw.Fora);
      if (Number.isFinite(a) && Number.isFinite(b)) return { a, b, t: a + b };
    }
    return parseScoreText(String(raw));
  }

  function resultAgeFromTime(time, fallback) {
    const match = String(time || "").match(/^(\d{1,2})[.:](\d{2})$/);
    if (!match) return 99999 + fallback / 1000;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 99999 + fallback / 1000;
    const nowDate = new Date();
    const now = nowDate.getHours() * 60 + nowDate.getMinutes();
    let age = now - (h * 60 + m);
    if (age < 0) age += 1440;
    return age;
  }

  function analyzeBTTSandOver(goalsData) {
    if (!goalsData || goalsData.length < 8) {
      return {
        ok: false,
        btts8: "--",
        over8: "--",
        over35: "--",
        mediaGols: "--",
        sequenciaBTTS: 0,
        sequenciaOver: 0,
        sequenciaOver35: 0,
        recomendacao: "SEM PLACARES"
      };
    }

    const last8 = goalsData.slice(-8);
    const btts8n = (last8.filter((g) => g.btts).length / last8.length) * 100;
    const over8n = (last8.filter((g) => g.over25).length / last8.length) * 100;
    const over35n = (last8.filter((g) => g.over35).length / last8.length) * 100;
    const avgGoals = last8.reduce((sum, g) => sum + g.total, 0) / last8.length;
    const sequenciaBTTS = getStreak(goalsData, "btts");
    const sequenciaOver = getStreak(goalsData, "over25");
    const sequenciaOver35 = getStreak(goalsData, "over35");

    let recomendacao = "AGUARDAR";
    if (btts8n > 75 && over8n > 70 && avgGoals > 3.2 && sequenciaBTTS >= 3) {
      recomendacao = "ENTRAR AMBAS + OVER";
    } else if (over35n >= 50 && over8n >= 62 && avgGoals >= 3.05) {
      recomendacao = "BOM PARA OVER 3.5";
    } else if (btts8n > 65 && over8n > 62 && avgGoals > 2.8) {
      recomendacao = "BOM PARA AMBAS/OVER";
    } else if (btts8n < 45 || over8n < 50 || avgGoals < 2.35) {
      recomendacao = "EVITAR";
    }

    return {
      ok: true,
      btts8: Math.round(btts8n) + "%",
      over8: Math.round(over8n) + "%",
      over8num: Math.round(over8n),
      over35num: Math.round(over35n),
      avgGoalsNum: Number(avgGoals.toFixed(2)),
      over35: Math.round(over35n) + "%",
      mediaGols: avgGoals.toFixed(2),
      sequenciaBTTS,
      sequenciaOver,
      sequenciaOver35,
      recomendacao
    };
  }

  function getStreak(data, type) {
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if ((type === "btts" && data[i].btts) || (type === "over25" && data[i].over25) || (type === "over35" && data[i].over35)) streak += 1;
      else break;
    }
    return streak;
  }

  function rememberPattern(goalsData, graphState) {
    if (!goalsData?.length || !graphState) return;
    const history = readPatternHistory();
    const seen = new Set(history.map((item) => item.key));
    let added = 0;

    goalsData.forEach((goal, index) => {
      const key = goal.key || [index, goal.score, goal.total, goal.btts ? 1 : 0, goal.over25 ? 1 : 0].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      added += 1;
      history.push({
        key,
        ts: Date.now(),
        zonePct: graphState.zonePct,
        force: graphState.force,
        histPositive: graphState.histPositive,
        histWeakening: graphState.histWeakening,
        slope: graphState.slope,
        result: {
          total: goal.total,
          btts: goal.btts,
          over25: goal.over25,
          over35: goal.over35,
          score: goal.score
        }
      });
    });

    if (!added) return;
    while (history.length > 80) history.shift();
    safeSetJson(PATTERN_HISTORY_KEY, history);
    safeSetJson(LAST_PATTERN_KEY, { added, ts: Date.now() });
  }

  function analyzeVisualBacktest(graphState) {
    const history = readPatternHistory();
    if (!graphState || history.length < 8) {
      return { status: history.length + "/8 amostras", over: "--", over35: "--", btts: "--", sinal: "MEMORIA INSUFICIENTE", color: "#ffd54a" };
    }

    const similar = history
      .map((item) => ({ item, score: similarityScore(graphState, item) }))
      .filter((x) => x.score >= 58)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.item);

    if (similar.length < MIN_VISUAL_SIMILARS) {
      return { status: "similares " + similar.length + " de " + history.length, over: "--", over35: "--", btts: "--", sinal: "SEM PADRAO FORTE", color: "#ffd54a" };
    }

    const overWins = similar.filter((x) => x.result?.over25).length;
    const over35Wins = similar.filter((x) => x.result?.over35).length;
    const bttsWins = similar.filter((x) => x.result?.btts).length;
    const overPct = Math.round((overWins / similar.length) * 100);
    const over35Pct = Math.round((over35Wins / similar.length) * 100);
    const bttsPct = Math.round((bttsWins / similar.length) * 100);
    let sinal = "AGUARDAR";
    let color = "#ffd54a";

    if (overPct >= 70 && bttsPct >= 55 && graphState.force >= 40 && graphState.zonePct < 75 && (graphState.histPositive || !graphState.histWeakening)) {
      sinal = "PADRAO BOM OVER";
      color = "#00ff66";
    } else if (over35Pct >= 50 && overPct >= 65 && graphState.force >= 35 && graphState.zonePct < 78) {
      sinal = "PADRAO BOM O3.5";
      color = "#00ff66";
    } else if (overPct <= 42 || (graphState.zonePct > 75 && graphState.histWeakening)) {
      sinal = "PADRAO RUIM / EVITAR";
      color = "#ff4d5f";
    }

    return {
      status: "similares " + similar.length + " de " + history.length,
      over: overWins + "/" + similar.length + " " + overPct + "%",
      over35: over35Wins + "/" + similar.length + " " + over35Pct + "%",
      btts: bttsWins + "/" + similar.length + " " + bttsPct + "%",
      sinal,
      color
    };
  }

  function similarityScore(now, old) {
    let score = 100;
    score -= Math.min(38, Math.abs(now.zonePct - Number(old.zonePct || 0)) * 1.15);
    score -= Math.min(26, Math.abs(now.force - Number(old.force || 0)) * 0.55);
    score -= Math.min(18, Math.abs(now.slope - Number(old.slope || 0)) * 12);
    if (Boolean(now.histPositive) !== Boolean(old.histPositive)) score -= 18;
    if (Boolean(now.histWeakening) !== Boolean(old.histWeakening)) score -= 8;
    return Math.max(0, Math.round(score));
  }

  function readPatternHistory() {
    const raw = readJson(PATTERN_HISTORY_KEY, patternMemory);
    if (!Array.isArray(raw)) {
      localStorage.removeItem(PATTERN_HISTORY_KEY);
      return [];
    }
    const clean = raw
      .map((item) => {
        if (!item?.result) return null;
        const total = Number(item.result.total);
        const over35 = typeof item.result.over35 === "boolean" ? item.result.over35 : Number.isFinite(total) ? total >= 4 : false;
        return { ...item, result: { ...item.result, over35 } };
      })
      .filter((item) =>
        item &&
        Number.isFinite(Number(item.zonePct)) &&
        Number.isFinite(Number(item.force)) &&
        Number.isFinite(Number(item.slope)) &&
        item.result &&
        typeof item.result.over25 === "boolean" &&
        typeof item.result.over35 === "boolean" &&
        typeof item.result.btts === "boolean"
      );
    patternMemory = clean.slice(-80);
    return patternMemory;
  }

  function safeSetJson(key, value) {
    if (key === PATTERN_HISTORY_KEY && Array.isArray(value)) patternMemory = value.slice(-80);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      try { localStorage.removeItem(key); } catch (x) {}
    }
  }

  function analyze(points, hist, market, allPoints) {
    const smooth = ema(points.map((p) => ({ ...p, v: -p.y })), 8);
    const histA = analyzeHistogram(hist);
    const last = smooth.slice(-Math.max(8, Math.round(smooth.length * 0.22)));
    const prev = smooth.slice(-Math.max(16, Math.round(smooth.length * 0.44)), -last.length);
    const micro = smooth.slice(-Math.min(7, smooth.length));
    const s1 = slope(last);
    const s0 = slope(prev);
    const sMicro = slope(micro);
    const vol = volatility(smooth) || 1;
    const score = s1 / vol;
    const orderedRaw = points.slice().sort((a, b) => a.x - b.x);
    const rawEdge = orderedRaw.slice(-Math.min(12, orderedRaw.length)).map((p) => ({ ...p, v: -p.y }));
    const edgeMove = rawEdge.length >= 2 ? rawEdge[rawEdge.length - 1].v - rawEdge[0].v : 0;
    const edgeVol = volatility(rawEdge) || vol;
    const microScore = (edgeMove / Math.max(1, rawEdge.length - 1)) / Math.max(0.01, edgeVol);
    const whiteEdge = nativeWhiteEdge(orderedRaw, 10);
    const force = Math.min(100, Math.round(Math.abs(score) * 85));
    const baseForZone = allPoints && allPoints.length > points.length ? allPoints.map((p) => ({ ...p, v: -p.y })) : smooth;
    const values = baseForZone.map((p) => p.v).filter(Number.isFinite);
    // min/max robustos por percentil (ignora outliers, ex: 0% corrompido no meio da serie)
    const sortedVals = values.slice().sort((a, b) => a - b);
    const pctile = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * q)))] : 0;
    const min = pctile(sortedVals, 0.05);
    const max = pctile(sortedVals, 0.95);
    const range = Math.max(1, max - min);
    const currentPoint = smooth[smooth.length - 1];
    const currentPointRaw = points.slice().sort((a, b) => a.x - b.x).pop() || currentPoint;
    const rawCurrent = Number.isFinite(Number(currentPointRaw?.v)) ? Number(currentPointRaw.v) : NaN;
    const current = Number.isFinite(rawCurrent) ? rawCurrent : currentPoint.v;
    const zonePct = Math.round(((Math.max(min, Math.min(max, current)) - min) / range) * 100);
    const zone =
      zonePct <= 25 ? "Fundo" :
      zonePct <= 42 ? "Baixa" :
      zonePct >= 78 ? "Topo" :
      zonePct >= 62 ? "Alta" :
      "Meio";

    let sinal = "LATERAL";
    let color = "#ffd54a";
    let acao = "Aguardar";
    let pagamento = "--";
    let nota = "Tendencia fraca ou embolada. Melhor esperar confirmar direcao.";
    if (score > 0.22) {
      sinal = "ALTA";
      color = "#00ff66";
      acao = "Favorece alta";
      nota = "O grafico esta ganhando inclinacao para cima. Tendencia favorece continuidade de alta enquanto mantiver forca.";
    }
    if (score < -0.22) {
      sinal = "BAIXA";
      color = "#ff4d5f";
      acao = "Favorece baixa";
      nota = "O grafico esta perdendo terreno e inclinando para baixo. Tendencia favorece baixa enquanto mantiver forca.";
    }

    const pontaCaindo = whiteEdge.recent ? whiteEdge.move < 0 : microScore < -0.28;
    const pontaSubindo = whiteEdge.recent ? whiteEdge.move > 0 : microScore > 0.28;
    if (pontaCaindo) {
      sinal = score > 0.18 ? "RECUO" : "BAIXA";
      color = "#ff4d5f";
      acao = score > 0.18 ? "Nao comprar topo" : "Observar baixa";
      nota = "A media maior ainda pode estar alta, mas a ponta direita esta caindo agora. O robo prioriza a ponta atual.";
    } else if (pontaSubindo && score > -0.18) {
      sinal = "ALTA";
      color = "#00ff66";
      acao = "Observar alta";
      nota = "A ponta direita esta subindo agora. Confirmar se o proximo ponto mantem a reacao.";
    }

    let virada = "Sem virada";
    if (s0 < -0.08 && s1 > 0.08) {
      virada = "Virando p/ alta";
      color = "#00ff66";
      acao = "Observar alta";
    }
    if (s0 > 0.08 && s1 < -0.08) {
      virada = "Virando p/ baixa";
      color = "#ff4d5f";
      acao = "Observar baixa";
    }

    const pontoSubida = zonePct <= 35 && (s1 > 0.05 || (s0 < -0.05 && s1 > -0.02));
    const histConfirmaAlta = !histA.ok || histA.flipUp || (histA.positive && !histA.weakening);
    const histPedePagamento = histA.ok && ((histA.positive && histA.weakening && zonePct >= 55) || histA.flipDown);
    const slopeWeakening = s0 > 0.04 && s1 < s0 * 0.55;
    // Cruza com a taxa REAL de pagamento recente do mercado (over dos ultimos jogos).
    // Mercado pagando bem agora reforca o ponto; pagando mal, segura. Dado ja existe.
    const overRate = Number.isFinite(Number(market?.over8num)) ? Number(market.over8num) : null;
    const payAdj = overRate == null ? 0 : (overRate >= 62 ? 8 : overRate <= 42 ? -10 : 0);
    const payScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          zonePct * 0.42 +
          (histPedePagamento ? 33 : 0) +
          (slopeWeakening ? 16 : 0) +
          (zonePct >= 76 ? 16 : 0) +
          payAdj -
          (score > 0.42 && histA.positive && !histA.weakening ? 18 : 0)
        )
      )
    );
    const subidaConfirmada = zonePct > 35 && zonePct < 68 && score > 0.22 && force >= 35 && histConfirmaAlta;
    const pagarParcial = zonePct >= 62 && score > 0.05 && (histPedePagamento || zonePct >= 72);
    const pagarForte = zonePct >= 76 || (s0 > 0.08 && s1 < 0.03 && zonePct >= 58) || (histA.flipDown && zonePct >= 52);
    const riscoCompra = zonePct >= 72 && score <= 0.12;
    const facaCaindo = zonePct <= 35 && score < -0.18;

    // === DECISAO PRIORIZADA (cascata unica: o primeiro caso que casar vence) ===
    // Antes eram varios if soltos e o ultimo sobrescrevia; isso causava sinais
    // contraditorios e instaveis. Agora a ordem reflete a prioridade real de trade.
    if (pontaCaindo && (zonePct >= 55 || payScore >= 60)) {
      // ponta caindo vindo de zona alta = proteger o que ja andou
      sinal = "PAGAMENTO";
      color = "#ffd54a";
      acao = "Pagar/proteger";
      pagamento = "Ponto bom";
      nota = "A linha estava em zona alta e a ponta direita virou para baixo. Para quem pegou de baixo, e ponto de pagamento/protecao.";
    } else if (pagarForte || payScore >= 82 || (histPedePagamento && zonePct >= 62)) {
      // topo / perda de forca no alto = pagamento forte
      sinal = "PAGAMENTO";
      color = "#ffd54a";
      acao = "Pagar/proteger";
      pagamento = payScore >= 82 ? "Muito bom" : "Ponto bom";
      nota = "Confluencia de zona alta/topo com histograma perdendo forca. Ponto provavel de pagamento; nova entrada aqui tem risco alto.";
    } else if (riscoCompra) {
      // alto demais pra comprar
      sinal = "RISCO ALTO";
      color = "#ff4d5f";
      acao = "Evitar compra";
      pagamento = "Ja passou";
      nota = "A linha esta alta demais para buscar subida nova sem correcao. Esperar voltar para zona baixa.";
    } else if (pagarParcial || payScore >= 68) {
      sinal = "PROTEGER PARCIAL";
      color = "#ffd54a";
      acao = "Parcial";
      pagamento = "Bom";
      nota = "Zona alta com impulso perdendo forca. Se entrou embaixo, area de pagamento parcial.";
    } else if (histA.ok && histA.flipUp && zonePct <= 55 && score > -0.1) {
      // histograma virou positivo no fundo/meio = compra nascendo
      sinal = "COMPRA NASCENDO";
      color = "#00ff66";
      acao = "Preparar entrada";
      pagamento = "Alvo parcial meio";
      nota = "Histograma virou positivo antes do preco chegar no topo. Boa leitura para buscar o primeiro trecho de subida.";
    } else if (pontoSubida) {
      sinal = "PONTO SUBIDA";
      color = "#00ff66";
      acao = "Entrada com cautela";
      pagamento = "Mirar meio/topo";
      nota = histA.ok && !histConfirmaAlta
        ? "Preco em zona boa, mas histograma ainda nao confirmou. Esperar a barra verde ou o vermelho perder forca."
        : "Preco em zona baixa/fundo e histograma ajudando. Ponto que favorece buscar subida.";
    } else if (subidaConfirmada) {
      sinal = "SUBIDA ATIVA";
      color = "#00ff66";
      acao = "Seguir tendencia";
      pagamento = "Parcial no topo";
      nota = "A subida saiu do fundo e tem inclinacao. Acompanhar ate perder forca ou chegar perto do topo.";
    } else if (facaCaindo) {
      sinal = "AGUARDAR FUNDO";
      color = "#ffd54a";
      acao = "Nao antecipar";
      pagamento = "--";
      nota = "Esta baixo, mas ainda caindo. Espera a queda perder forca antes de chamar ponto de subida.";
    } else if (pontaCaindo) {
      // ponta caindo mas em zona baixa = recuo, nao pagamento
      sinal = score > 0.18 ? "ALTA EM RECUO" : "BAIXA";
      color = score > 0.18 ? "#ffd54a" : "#ff4d5f";
      acao = "Aguardar";
      nota = "A tendencia maior pode ser de alta, mas a ponta direita esta descendo. Movimento atual e recuo.";
    }

    return {
      status: points.length + " pts foco | brancas somadas " + whiteEdge.count + " (subiu " + whiteEdge.up + "/desceu " + whiteEdge.down + ", saldo " + (whiteEdge.net > 0 ? "+" : "") + formatGraphValue(whiteEdge.net) + ") | direita " + whiteEdge.recentCount + " brancas, saldo " + (whiteEdge.recentNet > 0 ? "+" : "") + formatGraphValue(whiteEdge.recentNet) + " | atual " + formatGraphValue(current) + " | faixa " + formatGraphValue(min) + "-" + formatGraphValue(max) + " | hist " + (hist?.length || 0) + " barras",
      sinal,
      color,
      forca: force + "%",
      zona: zone + " " + zonePct + "%",
      direcao: pontaCaindo ? "Descendo" : pontaSubindo ? "Subindo" : s1 > 0 ? "Subindo" : s1 < 0 ? "Descendo" : "Neutra",
      virada,
      pagamento,
      pgtoScore: payScore + "%",
      hist: histA.label,
      btts: market?.btts8 || "--",
      over: market?.over8 || "--",
      over35: market?.over35 || "--",
      gols: market?.mediaGols || "--",
      seq: market?.ok ? "A" + market.sequenciaBTTS + "/O2 " + market.sequenciaOver + "/O3 " + market.sequenciaOver35 : "--",
      recomendacao: market?.recomendacao || "SEM PLACARES",
      acao,
      nota,
      smooth,
      currentPoint: currentPointRaw,
      graphState: {
        zonePct,
        current,
        min,
        max,
        force,
        histRead: histA.ok,
        histPositive: histA.ok ? histA.positive : false,
        histWeakening: histA.ok ? histA.weakening : false,
        slope: score,
        whiteCount: whiteEdge.count,
        whiteUp: whiteEdge.up,
        whiteDown: whiteEdge.down,
        whiteNet: whiteEdge.net,
        recentWhiteNet: whiteEdge.recentNet,
        lastWhiteDirection: whiteEdge.direction,
        lastWhiteAge: Number.isFinite(whiteEdge.age) ? whiteEdge.age : null
      }
    };
  }

  function formatGraphValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    return Math.abs(number - Math.round(number)) < 0.01 ? String(Math.round(number)) : number.toFixed(1);
  }

  function ema(points, period) {
    const k = 2 / (period + 1);
    let last = points[0].v;
    return points.map((p, i) => {
      last = i ? p.v * k + last * (1 - k) : p.v;
      return { ...p, v: last, y: -last };
    });
  }

  function slope(points) {
    if (points.length < 2) return 0;
    return (points[points.length - 1].v - points[0].v) / points.length;
  }

  function volatility(points) {
    let sum = 0;
    for (let i = 1; i < points.length; i += 1) sum += Math.abs(points[i].v - points[i - 1].v);
    return sum / Math.max(1, points.length - 1);
  }

  function write(a) {
    text("bbtips-status", a.status);
    text("bbtips-sinal", a.sinal);
    text("bbtips-forca", a.forca);
    text("bbtips-zona", a.zona);
    text("bbtips-direcao", a.direcao);
    text("bbtips-virada", a.virada);
    text("bbtips-pagamento", a.pagamento);
    text("bbtips-pgto-score", a.pgtoScore);
    text("bbtips-hist", a.hist || "lido");
    text("bbtips-btts", a.btts);
    text("bbtips-over", a.over);
    text("bbtips-over35", a.over35);
    text("bbtips-gols", a.gols);
    text("bbtips-seq", a.seq);
    text("bbtips-recomendacao", a.recomendacao);
    text("bbtips-acao", a.acao);
    text("bbtips-nota", a.nota);
    text("bbtips-bt-status", a.backtest?.status || "juntando memoria...");
    text("bbtips-bt-over", a.backtest?.over || "--");
    text("bbtips-bt-over35", a.backtest?.over35 || "--");
    text("bbtips-bt-btts", a.backtest?.btts || "--");
    text("bbtips-bt-sinal", a.backtest?.sinal || "AGUARDAR");
    text("bbtips-mini-summary", `${a.sinal} | ${a.zona} | força ${a.forca} | hist ${a.hist||"--"}`);
    const s = document.getElementById("bbtips-sinal");
    if (s) {
      s.style.color = a.color;
      s.style.borderColor = a.color;
    }
    const rec = document.getElementById("bbtips-recomendacao");
    if (rec) {
      const value = String(a.recomendacao || "");
      rec.style.color = value.includes("ENTRAR") || value.includes("BOM") ? "#00ff66" : value.includes("EVITAR") ? "#ff4d5f" : "#ffd54a";
    }
    const bt = document.getElementById("bbtips-bt-sinal");
    if (bt) bt.style.color = a.backtest?.color || "#ffd54a";
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function prep() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function clearDraw() {
    if (!canvas) return;
    if (canvas.style.display === "none") {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    prep();
  }

  function drawFrame(el, color) {
    const ctx = prep();
    const r = el.getBoundingClientRect();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(r.left, r.top, r.width, r.height);
  }

  function draw(el, points, a, histChart) {
    const ctx = prep();
    const r = el.getBoundingClientRect();
    ctx.strokeStyle = a.color || "#00ff66";
    ctx.lineWidth = 4;
    ctx.strokeRect(r.left, r.top, r.width, r.height);

    if (histChart) {
      const hr = histChart.getBoundingClientRect();
      ctx.strokeStyle = "#ffd54a";
      ctx.lineWidth = 4;
      ctx.strokeRect(hr.left, hr.top, hr.width, hr.height);
      ctx.fillStyle = "#ffd54a";
      ctx.font = "900 14px Arial";
      ctx.fillText("HISTOGRAMA LIDO", hr.left + 12, hr.top + 22);
    }

    drawCurrentPoint(ctx, a.currentPoint || points[points.length - 1]);
  }

  function drawCurrentPoint(ctx, point) {
    if (!point) return;
    const x = point.x;
    const y = point.y;

    ctx.save();
    ctx.strokeStyle = "rgba(255,213,74,.74)";
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  ready(start);
})();

})();
