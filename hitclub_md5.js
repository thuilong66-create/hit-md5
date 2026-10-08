// ============================================================
//  HITCLUB MD5 — AI v3.0 (17 tín hiệu + 63 cầu mẫu + Markov)
// ============================================================
import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
const PORT = process.env.PORT || 3000;
const API_URL = "https://kwinstore.com/hitclub/md5/history/6cd333eb6f42c778fb6ecbfd6fe8f14337f376d8b7fca424";
const GAME_NAME = "HITCLUB MD5";
const A = "TÀI", B = "XỈU";
const CA = "#fb7185", CB = "#8b5cf6";
const HAS_TABLES = false;
const app = fastify({ logger: false });
await app.register(cors, { origin: true });

const blocksOf = s => { const b=[]; let c=1; for(let i=1;i<s.length;i++){if(s[i]===s[i-1])c++;else{b.push(c);c=1;}} b.push(c); return b; };
function wilson(correct, total, z=1.96){
  if(total===0) return 0;
  const p=correct/total, d=1+z*z/total;
  const c=(p+z*z/(2*total))/d, sp=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return Math.max(0, c-sp);
}
function detectRegime(seq){
  if(seq.length<30) return 'balanced';
  const recent=seq.slice(-50);
  let maxS=1,cur=1;
  for(let i=1;i<recent.length;i++){if(recent[i]===recent[i-1])cur++;else{maxS=Math.max(maxS,cur);cur=1;}}
  maxS=Math.max(maxS,cur);
  const aRatio=recent.filter(x=>x===A).length/recent.length;
  const bias=Math.abs(aRatio-0.5);
  let alt=0; for(let i=1;i<recent.length;i++) if(recent[i]!==recent[i-1]) alt++;
  const altRate=alt/(recent.length-1);
  if(maxS>=6) return 'streaky';
  if(altRate>0.62) return 'choppy';
  if(bias>0.12) return 'trending';
  return 'balanced';
}
const REGIME_BOOST = {
  streaky:  {markov:0.9, streak:1.5, betbreak:1.4, pattern:1.0, pattern63:1.3, momentum:1.1, alt:0.7},
  choppy:   {markov:1.1, streak:0.7, betbreak:1.0, pattern:1.4, pattern63:1.4, momentum:0.8, alt:1.5},
  trending: {markov:1.2, streak:1.1, betbreak:0.9, pattern:0.9, pattern63:1.0, momentum:1.5, alt:0.8},
  balanced: {markov:1.2, streak:1.0, betbreak:1.0, pattern:1.1, pattern63:1.2, momentum:1.0, alt:1.0},
};

function markovN(seq,n,minC){
  if(seq.length<n+8) return null;
  const key=seq.slice(-n).join('|'); let a=0,b=0;
  for(let i=n;i<seq.length;i++){if(seq.slice(i-n,i).join('|')===key){if(seq[i]===A)a++;else b++;}}
  const t=a+b; if(t<minC) return null;
  const pa=(a+1)/(t+2);
  if(pa>0.6) return {vote:A,w:1+wilson(a,t)*0.5};
  if(pa<0.4) return {vote:B,w:1+wilson(b,t)*0.5};
  return null;
}
const s_markov2 = s => markovN(s,2,8);
const s_markov3 = s => markovN(s,3,6);
const s_markov4 = s => markovN(s,4,4);
function s_recentMarkov(seq){ if(seq.length<50) return null; return markovN(seq.slice(-150),2,5); }
function s_weightedMarkov(seq){
  if(seq.length<60) return null;
  const key=seq.slice(-2).join('|'); let wa=0,wb=0,tau=80;
  for(let i=2;i<seq.length;i++){if(seq.slice(i-2,i).join('|')===key){const w=Math.exp(-(seq.length-i)/tau); if(seq[i]===A)wa+=w;else wb+=w;}}
  const t=wa+wb; if(t<3) return null;
  const pa=(wa+0.3)/(t+0.6);
  if(pa>0.6) return {vote:A,w:1.2};
  if(pa<0.4) return {vote:B,w:1.2};
  return null;
}
function s_bayesian(seq){
  if(seq.length<40) return null;
  const key=seq.slice(-3).join('|');
  const prior=0.5+(seq.slice(-30).filter(x=>x===A).length/30-0.5)*0.5;
  let a=0,b=0;
  for(let i=3;i<seq.length;i++){if(seq.slice(i-3,i).join('|')===key){if(seq[i]===A)a++;else b++;}}
  const t=a+b; if(t<5) return null;
  const pa=(a+4*prior)/(t+4);
  if(pa>0.6) return {vote:A,w:1.1};
  if(pa<0.4) return {vote:B,w:1.1};
  return null;
}
function s_streak(seq){
  if(seq.length<30) return null;
  const last=seq[seq.length-1]; let s=1;
  for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)s++;else break;}
  if(s<3) return null;
  let cont=0,brk=0;
  for(let i=0;i<seq.length-1;i++){let ss=1;for(let j=i-1;j>=0;j--){if(seq[j]===seq[i])ss++;else break;} if(ss===s){if(seq[i+1]===seq[i])cont++;else brk++;}}
  const t=cont+brk; if(t<6) return null;
  const pc=(cont+1.5)/(t+3);
  if(pc>0.58) return {vote:last,w:1.3};
  if(pc<0.42) return {vote:last===A?B:A,w:1.3};
  return null;
}
function s_betBreaker(seq){
  if(seq.length<50) return null;
  const last=seq[seq.length-1]; let s=1;
  for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)s++;else break;}
  if(s<4||s>9) return null;
  let cont=0,brk=0;
  for(let i=0;i<seq.length-1;i++){let ss=1;for(let j=i-1;j>=0;j--){if(seq[j]===seq[i])ss++;else break;} if(ss===s){if(seq[i+1]===seq[i])cont++;else brk++;}}
  const t=cont+brk; if(t<5) return null;
  const pb=(brk+1.5)/(t+3);
  if(pb>0.6) return {vote:last===A?B:A,w:1.4};
  if(pb<0.4) return {vote:last,w:1.2};
  return null;
}
function s_streakDist(seq){
  if(seq.length<60) return null;
  const last=seq[seq.length-1]; let cur=1;
  for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)cur++;else break;}
  if(cur<2) return null;
  const ends={}; let c=1;
  for(let i=1;i<seq.length;i++){if(seq[i]===seq[i-1])c++;else{ends[c]=(ends[c]||0)+1;c=1;}} ends[c]=(ends[c]||0)+1;
  const maxH=Math.max(...Object.keys(ends).map(Number));
  if(cur>=maxH+1) return {vote:last===A?B:A,w:1.5};
  const stop=ends[cur]||0; const cont=Object.entries(ends).filter(([k])=>Number(k)>cur).reduce((a,[,v])=>a+v,0);
  if(stop+cont<6) return null;
  const ps=(stop+1.5)/(stop+cont+3);
  if(ps>0.62) return {vote:last===A?B:A,w:1.3};
  if(ps<0.38) return {vote:last,w:1.1};
  return null;
}
function s_pattern(seq){
  if(seq.length<6) return null;
  const b=blocksOf(seq); const last=b[b.length-1]; const lv=seq[seq.length-1]; const opp=lv===A?B:A;
  if(last>=5) return {vote:opp,w:1.4};
  if(last>=3&&b.length>=2) return {vote:opp,w:1.1};
  if(b.length>=3){
    const l3=b.slice(-3);
    if(l3[0]===l3[2]&&l3[0]>=2) return {vote:opp,w:1.2};
    if(l3[0]<l3[1]&&l3[1]>l3[2]) return {vote:opp,w:1.1};
    if((l3[0]===1&&l3[1]===2&&l3[2]===1)||(l3[0]===2&&l3[1]===1&&l3[2]===2)) return {vote:opp,w:1.3};
  }
  const fib=[1,1,2,3,5]; if(b.length>=3&&b.slice(-3).every((v,i)=>v===fib[i])) return {vote:opp,w:1.3};
  return null;
}
function s_alternating(seq){
  if(seq.length<6) return null;
  const l6=seq.slice(-6); let alt=true;
  for(let i=1;i<l6.length;i++){if(l6[i]===l6[i-1]){alt=false;break;}}
  if(alt) return {vote:l6[l6.length-1],w:1.3};
  return null;
}
function s_doubleBlock(seq){
  if(seq.length<8) return null;
  const b=blocksOf(seq);
  if(b.length>=2&&b[b.length-1]===b[b.length-2]&&b[b.length-1]>=2&&b[b.length-1]<=4){
    return {vote:seq[seq.length-1]===A?B:A,w:1.2};
  }
  return null;
}
function s_longPattern(seq){
  if(seq.length<10) return null;
  const tail=seq.slice(-8).join('');
  if(tail===tail.split('').reverse().join('')) return {vote:seq[seq.length-1]===A?B:A,w:1.2};
  return null;
}
function s_momentum(seq,w){
  if(seq.length<w+5) return null;
  const a=seq.slice(-w).filter(x=>x===A).length;
  const pa=a/w;
  if(pa>0.65) return {vote:A,w:1.1};
  if(pa<0.35) return {vote:B,w:1.1};
  return null;
}
const s_mom5 = s => s_momentum(s,5);
const s_mom10 = s => s_momentum(s,10);
const s_mom20 = s => s_momentum(s,20);
function s_dualTimeframe(seq){
  const m5=s_momentum(seq,5), m20=s_momentum(seq,20);
  if(m5&&m20&&m5.vote===m20.vote) return {vote:m5.vote,w:1.4};
  return null;
}

const PATTERNS_63 = [
  {name:"BET_9+",type:"streak",spec:[9,99],action:"opp",conf:94},
  {name:"BET_7-8",type:"streak",spec:[7,8],action:"opp",conf:91},
  {name:"BET_5-6",type:"streak",spec:[5,6],action:"opp",conf:88},
  {name:"CHUKY_7-7",type:"groups",spec:[7,7],action:"opp",conf:92},
  {name:"CHUKY_6-6",type:"groups",spec:[6,6],action:"opp",conf:91},
  {name:"CHUKY_5-5",type:"groups",spec:[5,5],action:"opp",conf:90},
  {name:"CHUKY_4-4",type:"groups",spec:[4,4],action:"opp",conf:89},
  {name:"CHUKY_3-3",type:"groups",spec:[3,3],action:"opp",conf:89},
  {name:"CHUKY_2-2",type:"groups",spec:[2,2,2,2],action:"opp",conf:88},
  {name:"CHUKY_1-1",type:"groups",spec:[1,1,1,1,1,1],action:"opp",conf:90},
  {name:"NHIPHUC_3-2-2-3",type:"groups",spec:[3,2,2,3],action:"opp",conf:89},
  {name:"NHIPHUC_1-1-2-2-3",type:"groups",spec:[1,1,2,2,3],action:"opp",conf:86},
  {name:"NHIPHUC_2-1-2-1-2",type:"groups",spec:[2,1,2,1,2],action:"opp",conf:88},
  {name:"NHIPHUC_1-2-1-2-1",type:"groups",spec:[1,2,1,2,1],action:"opp",conf:88},
  {name:"NHIPHUC_3-1-2-2",type:"groups",spec:[3,1,2,2],action:"opp",conf:84},
  {name:"NHIPHUC_2-2-1-3",type:"groups",spec:[2,2,1,3],action:"opp",conf:85},
  {name:"NHIPHUC_3-2-3-2",type:"groups",spec:[3,2,3,2],action:"opp",conf:88},
  {name:"NHIPHUC_1-2-1-3",type:"groups",spec:[1,2,1,3],action:"opp",conf:84},
  {name:"NHIPHUC_3-1-1-3",type:"groups",spec:[3,1,1,3],action:"opp",conf:90},
  {name:"NHIPHUC_3-2-3",type:"groups",spec:[3,2,3],action:"opp",conf:86},
  {name:"NHIPHUC_2-3-2",type:"groups",spec:[2,3,2],action:"opp",conf:84},
  {name:"NHIPHUC_3-1-3",type:"groups",spec:[3,1,3],action:"opp",conf:91},
  {name:"NHIPHUC_1-3-1",type:"groups",spec:[1,3,1],action:"opp",conf:90},
  {name:"NHIPHUC_1-2-3",type:"groups",spec:[1,2,3],action:"opp",conf:84},
  {name:"NHIPHUC_2-1-2",type:"groups",spec:[2,1,2],action:"opp",conf:86},
  {name:"NHIPHUC_1-2-1",type:"groups",spec:[1,2,1],action:"opp",conf:85},
  {name:"NHIPHUC_2-1-1-2",type:"groups",spec:[2,1,1,2],action:"opp",conf:87},
  {name:"NHIPHUC_1-2-1-2",type:"groups",spec:[1,2,1,2],action:"opp",conf:87},
  {name:"NHIPHUC_1-1-1-2",type:"groups",spec:[1,1,1,2],action:"opp",conf:87},
  {name:"NHIPHUC_2-2-1-1",type:"groups",spec:[2,2,1,1],action:"opp",conf:88},
  {name:"NHIPHUC_1-1-2-2",type:"groups",spec:[1,1,2,2],action:"opp",conf:88},
  {name:"NHIPHUC_1-2-2-1",type:"groups",spec:[1,2,2,1],action:"opp",conf:86},
  {name:"NHIPHUC_1-1-2",type:"groups",spec:[1,1,2],action:"opp",conf:84},
  {name:"NHIPHUC_1-2-1-1",type:"groups",spec:[1,2,1,1],action:"opp",conf:83},
  {name:"NHIPHUC_1-6",type:"groups",spec:[1,6],action:"opp",conf:90},
  {name:"NHIPHUC_6-1",type:"groups",spec:[6,1],action:"opp",conf:90},
  {name:"NHIPHUC_1-5",type:"groups",spec:[1,5],action:"opp",conf:89},
  {name:"NHIPHUC_5-1",type:"groups",spec:[5,1],action:"opp",conf:89},
  {name:"NHIPHUC_1-4",type:"groups",spec:[1,4],action:"opp",conf:85},
  {name:"NHIPHUC_4-1",type:"groups",spec:[4,1],action:"opp",conf:85},
  {name:"NHIPHUC_1-3",type:"groups",spec:[1,3],action:"opp",conf:83},
  {name:"NHIPHUC_3-1",type:"groups",spec:[3,1],action:"opp",conf:83},
  {name:"GUONG_11",type:"palin",spec:11,action:"opp",conf:88},
  {name:"GUONG_9",type:"palin",spec:9,action:"opp",conf:86},
  {name:"PALIN_7",type:"palin",spec:7,action:"opp",conf:84},
  {name:"PALIN_5",type:"palin",spec:5,action:"opp",conf:82},
  {name:"BET_3-4",type:"streak",spec:[3,4],action:"cont",conf:82},
];
function s_pattern63(seq){
  if(seq.length<3) return null;
  const rle = blocksOf(seq);
  const last = seq[seq.length-1];
  const cont = last, opp = last===A?B:A;
  const streak = rle[rle.length-1];
  // Lớp 6: Anti-trap — 8 đảo liên tiếp là bẫy → theo cuối
  const last8 = seq.slice(-8);
  if(last8.length>=8 && last8.every((v,i)=>i===0||v!==last8[i-1])){
    return {vote:cont, w:1.8, name:"ANTI_TRAP_8DAO"};
  }
  for(const p of PATTERNS_63){
    let matched=false;
    if(p.type==="streak"){
      if(p.spec[0]<=streak && streak<=p.spec[1]) matched=true;
    } else if(p.type==="groups"){
      const tail = rle.slice(-p.spec.length);
      if(tail.length===p.spec.length && tail.every((v,i)=>v===p.spec[i])) matched=true;
    } else if(p.type==="palin"){
      const L=p.spec;
      if(seq.length>=L){
        const s=seq.slice(-L);
        if(s.every((v,i)=>v===s[L-1-i])) matched=true;
      }
    }
    if(matched){
      const vote = p.action==="cont"?cont:opp;
      const w = 1 + (p.conf-80)/18;
      return {vote, w, name:p.name};
    }
  }
  // Lớp 5: Hồi quy 20 — lệch ≥6 → về thiểu số
  if(seq.length>=12){
    const lastN = seq.slice(-20);
    const aN = lastN.filter(x=>x===A).length;
    const bN = lastN.length - aN;
    if(Math.abs(aN-bN)>=6){
      return {vote: aN<bN?A:B, w:1.3, name:"HOI_QUY_20"};
    }
  }
  return null;
}
function s_markovFallback(seq){
  if(seq.length<4) return null;
  const w = Math.min(20, seq.length);
  const recent = seq.slice(-w);
  let aa=0,ab=0,ba=0,bb=0;
  for(let i=0;i<recent.length-1;i++){
    const x=recent[i], y=recent[i+1];
    if(x===A&&y===A)aa++; else if(x===A&&y===B)ab++;
    else if(x===B&&y===A)ba++; else bb++;
  }
  const last = recent[recent.length-1];
  let pCont;
  if(last===A){ const t=aa+ab||1; pCont=aa/t; } else { const t=ba+bb||1; pCont=bb/t; }
  if(pCont>0.58) return {vote:last, w:1.0, name:"MARKOV_FALLBACK"};
  if(pCont<0.42) return {vote:last===A?B:A, w:1.0, name:"MARKOV_FALLBACK"};
  return null;
}


function predict(seq){
  const regime = detectRegime(seq);
  const boost = REGIME_BOOST[regime];
  const rawSignals = [
    {s:s_markov2(seq), g:'markov'}, {s:s_markov3(seq), g:'markov'}, {s:s_markov4(seq), g:'markov'},
    {s:s_recentMarkov(seq), g:'markov'}, {s:s_weightedMarkov(seq), g:'markov'}, {s:s_bayesian(seq), g:'markov'},
    {s:s_streak(seq), g:'streak'}, {s:s_betBreaker(seq), g:'betbreak'}, {s:s_streakDist(seq), g:'streak'},
    {s:s_pattern(seq), g:'pattern'}, {s:s_alternating(seq), g:'alt'}, {s:s_doubleBlock(seq), g:'pattern'},
    {s:s_longPattern(seq), g:'pattern'}, {s:s_mom5(seq), g:'momentum'}, {s:s_mom10(seq), g:'momentum'},
    {s:s_mom20(seq), g:'momentum'}, {s:s_dualTimeframe(seq), g:'momentum'},
    {s:s_pattern63(seq), g:'pattern63'}, {s:s_markovFallback(seq), g:'markov'},
  ];
  let wA=0, wB=0, used=0, hitName="";
  for(const {s,g} of rawSignals){
    if(!s) continue;
    const bw = s.w * (boost[g]||1);
    if(s.vote===A){wA+=bw;} else {wB+=bw;}
    used++;
    if(s.name && !hitName) hitName = s.name;
  }
  if(used===0) return {prediction:'CHỜ', confidence:50, note:'Chưa đủ tín hiệu — đợi thêm phiên', signals:0, regime};
  const total=wA+wB;
  const pred = wA>=wB?A:B;
  const wWin = Math.max(wA,wB);
  const conf = Math.min(97, Math.round(50 + (wWin/total-0.5)*100 + wilson(Math.round(wWin),Math.round(total))*15));
  return {prediction:pred, confidence:conf, note:`${used} tín hiệu · cầu: ${regime}${hitName?(' · khớp: '+hitName):''}`, signals:used, regime, pattern_hit:hitName};
}

async function getHistory(table){
  const res = await fetch(API_URL, {headers:{"User-Agent":"Mozilla/5.0"}, signal:AbortSignal.timeout(12000)});
  const data = await res.json();
  let lst = data.data||data.list||data.history||data.sessions||[];
  if(HAS_TABLES){
    const tables = data.tables||data.data||data.list||[];
    const t = tables.find(x=>String(x.table||x.id||x.name||x.table_id||"")===String(table));
    if(t) lst = t.history||t.list||t.sessions||[]; else lst=[];
  }
  const seq = lst.map(s=>{
    const r=String(s.resultTruyenThong||s.result||s.winner||s.outcome||"").toUpperCase();
    if(r.includes("TAI")||r==="T") return A;
    if(r.includes("XIU")||r.includes("XỈU")||r==="X") return B;
    if(r.includes("PLAYER")||r==="P") return A;
    if(r.includes("BANKER")||r==="B") return B;
    return null;
  }).filter(Boolean);
  return seq;
}
async function getTables(){
  if(!HAS_TABLES) return [];
  try{
    const res=await fetch(API_URL,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)});
    const data=await res.json();
    const tables=data.tables||data.data||data.list||[];
    return tables.map(t=>({id:t.table||t.id||t.name||t.table_id, name:t.name||t.table_name||("Bàn "+(t.table||t.id))}));
  }catch{return [];}
}

app.get("/api/predict", async (req, reply)=>{
  try{
    const table=req.query.table;
    if(HAS_TABLES&&!table) return reply.status(400).send({error:"Thiếu tham số table"});
    const seq=await getHistory(table);
    if(seq.length<5) return reply.status(503).send({error:"Đang lấy dữ liệu...", current:seq.length});
    const r=predict(seq);
    return {...r, history:seq.slice(-20), history_len:seq.length, game:GAME_NAME, table:table||null};
  }catch(e){return reply.status(500).send({error:"Lỗi kết nối API: "+e.message});}
});
app.get("/api/history", async (req, reply)=>{
  try{const seq=await getHistory(req.query.table); return {history:seq, len:seq.length};}
  catch(e){return reply.status(500).send({error:e.message});}
});
if(HAS_TABLES) app.get("/api/tables", async ()=>({tables:await getTables()}));

const TBL_JS = HAS_TABLES ? `let curTable=null;async function loadT(){try{const r=await fetch('/api/tables');const d=await r.json();const s=document.getElementById('ts');s.innerHTML='<option value="">-- Chọn bàn --</option>'+d.tables.map(t=>'<option value="'+t.id+'">'+t.name+'</option>').join('');s.onchange=()=>{curTable=s.value;doP();};}catch(e){}}loadT();` : "";
const HTML = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${GAME_NAME} — AI v3.0</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
body{background:#030014;color:#e6f1ff;min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;z-index:-2;background:radial-gradient(ellipse 60% 40% at 20% 10%,rgba(139,92,246,.18),transparent 60%),radial-gradient(ellipse 50% 50% at 80% 90%,rgba(34,211,238,.12),transparent 55%),#030014}
body::after{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(139,92,246,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.05) 1px,transparent 1px);background-size:44px 44px;animation:gm 20s linear infinite}
@keyframes gm{0%{background-position:0 0}100%{background-position:44px 44px}}
.wrap{max-width:520px;margin:0 auto;padding:20px 16px 60px}
.header{text-align:center;margin-bottom:20px}
.header h1{font-size:20px;font-weight:900;background:linear-gradient(135deg,${CA},#8b5cf6,${CB});-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:1px}
.header p{font-size:11px;color:#64748b;margin-top:6px;letter-spacing:1px}
.card{background:rgba(10,6,30,.75);backdrop-filter:blur(20px);border:1px solid rgba(139,92,246,.2);border-radius:20px;padding:20px;margin-bottom:14px;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:-100%;width:100%;height:1px;background:linear-gradient(90deg,transparent,#8b5cf6,#22d3ee,transparent);animation:st 3s linear infinite}
@keyframes st{to{left:100%}}
.glow-card{background:rgba(12,6,36,.9);border:1px solid rgba(139,92,246,.4);border-radius:24px;padding:28px 22px;margin-bottom:14px;box-shadow:0 0 60px rgba(139,92,246,.25);animation:cp 3s ease-in-out infinite;text-align:center;display:none}
.glow-card.show{display:block;animation:cp 3s ease-in-out infinite,fi .5s ease}
@keyframes cp{0%,100%{box-shadow:0 0 40px rgba(139,92,246,.2)}50%{box-shadow:0 0 70px rgba(34,211,238,.3)}}
@keyframes fi{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.pred-ball{width:150px;height:150px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2.4rem;font-weight:900;margin:14px auto 0;position:relative;letter-spacing:1px;animation:bf 3s ease-in-out infinite;color:#fff}
@keyframes bf{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.pred-ball::after{content:'';position:absolute;inset:-10px;border-radius:50%;border:2px solid currentColor;opacity:.4;animation:rp 1.8s infinite}
.pred-ball::before{content:'';position:absolute;inset:-22px;border-radius:50%;border:1px solid currentColor;opacity:.2;animation:rp 1.8s .6s infinite}
@keyframes rp{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.12);opacity:.7}}
.pa{background:linear-gradient(135deg,${CA},#8b5cf6);box-shadow:0 0 50px ${CA}80;text-shadow:0 0 30px #fff8}
.pb{background:linear-gradient(135deg,${CB},#22d3ee);box-shadow:0 0 50px ${CB}80;text-shadow:0 0 30px #fff8}
.btn{width:100%;padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#8b5cf6,#22d3ee);color:#fff;font-weight:800;font-size:16px;cursor:pointer;letter-spacing:2px;transition:.25s;box-shadow:0 4px 20px rgba(139,92,246,.4)}
.btn:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(34,211,238,.6)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
select{width:100%;padding:12px 16px;background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.25);border-radius:12px;color:#e6f1ff;font-size:14px;outline:none;margin-bottom:12px}
label{display:block;font-size:12px;color:#94a3b8;margin-bottom:6px;font-weight:600;letter-spacing:.5px}
.loading{display:none;text-align:center;padding:30px}
.loading.show{display:block}
.spinner{width:44px;height:44px;margin:0 auto 12px;border:3px solid rgba(139,92,246,.2);border-top-color:#8b5cf6;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;font-size:13px}
.meta div{background:rgba(139,92,246,.08);padding:10px;border-radius:10px;text-align:left}
.meta .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.cb{height:8px;background:rgba(139,92,246,.1);border-radius:4px;overflow:hidden;margin-top:6px}
.cf{height:100%;background:linear-gradient(90deg,#8b5cf6,#22d3ee);border-radius:4px;transition:width 1s;box-shadow:0 0 10px #22d3ee}
.hb{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;margin:2px;color:#fff}
.ha{background:linear-gradient(135deg,${CA},#8b5cf6)}
.hbb{background:linear-gradient(135deg,${CB},#22d3ee)}
.note{font-size:12px;color:#94a3b8;margin-top:12px;text-align:center;line-height:1.6}
.err{color:#f87171;text-align:center;margin-top:10px;font-size:13px}
.regime{display:inline-block;font-size:10px;padding:4px 10px;border-radius:20px;background:rgba(34,211,238,.1);color:#22d3ee;border:1px solid rgba(34,211,238,.3);letter-spacing:1px;margin-top:8px;text-transform:uppercase;font-weight:700}
.pat{display:inline-block;font-size:10px;padding:4px 10px;border-radius:20px;background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.3);letter-spacing:1px;margin-top:6px;margin-left:6px;font-weight:700}
</style></head><body>
<div class="wrap">
<div class="header"><h1>⚡ ${GAME_NAME}</h1><p>AI v3.0 · 19 TÍN HIỆU + 63 CẦU MẪU · REGIME · WILSON</p></div>
${HAS_TABLES?'<div class="card"><label>🎰 Chọn bàn</label><select id="ts"></select></div>':''}
<button class="btn" id="btn" onclick="doP()">⚡ DỰ ĐOÁN NGAY</button>
<div class="loading" id="ld"><div class="spinner"></div><p style="font-size:13px;color:#94a3b8">ĐANG QUÉT CẦU... ĐANG SO KHỚP 63 CẦU MẪU...</p></div>
<div class="glow-card" id="rs">
<div style="font-size:11px;color:#22d3ee;letter-spacing:2px;text-transform:uppercase" id="rg"></div>
<div class="pred-ball" id="rb"></div>
<div class="meta">
<div><div class="lbl">✅ Tin cậy</div><div id="rc" style="font-weight:800;font-size:18px;color:#22d3ee"></div><div class="cb"><div class="cf" id="rcb"></div></div></div>
<div><div class="lbl">📊 Phiên</div><div id="rl" style="font-weight:800;font-size:18px"></div></div>
<div><div class="lbl">🔢 Tín hiệu</div><div id="rsig" style="font-weight:800;font-size:18px"></div></div>
<div><div class="lbl">⏰ Cập nhật</div><div id="rt" style="font-weight:800;font-size:14px"></div></div>
</div>
<div><span class="regime" id="rreg"></span><span class="pat" id="rpat" style="display:none"></span></div>
<div class="note" id="rnote"></div>
<div style="margin-top:14px"><div class="lbl" style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Lịch sử 20 phiên</div><div id="rh"></div></div>
</div>
<div class="err" id="er"></div>
</div>
<script>
${TBL_JS}
async function doP(){
  document.getElementById('er').textContent='';
  document.getElementById('ld').classList.add('show');
  document.getElementById('rs').classList.remove('show');
  document.getElementById('btn').disabled=true;
  try{
    let url='/api/predict';
    ${HAS_TABLES?"if(curTable)url+='?table='+encodeURIComponent(curTable);else{document.getElementById('er').textContent='⚠️ Vui lòng chọn bàn trước!';document.getElementById('ld').classList.remove('show');document.getElementById('btn').disabled=false;return;}":""}
    const r=await fetch(url);const d=await r.json();
    if(d.error){document.getElementById('er').textContent='❌ '+d.error;}
    else{
      document.getElementById('rg').textContent=d.game+(d.table?' · BÀN '+d.table:'');
      const b=document.getElementById('rb');b.textContent=d.prediction;
      b.className='pred-ball '+(d.prediction==='${A}'?'pa':'pb');
      document.getElementById('rc').textContent=d.confidence+'%';
      document.getElementById('rcb').style.width=d.confidence+'%';
      document.getElementById('rl').textContent=d.history_len;
      document.getElementById('rsig').textContent=d.signals;
      document.getElementById('rt').textContent=new Date().toLocaleTimeString('vi-VN');
      document.getElementById('rreg').textContent='Cầu: '+(d.regime||'balanced');
      const pat=document.getElementById('rpat');
      if(d.pattern_hit){pat.style.display='inline-block';pat.textContent='🎯 '+d.pattern_hit;}else{pat.style.display='none';}
      document.getElementById('rnote').textContent=d.note;
      document.getElementById('rh').innerHTML=(d.history||[]).map(h=>'<span class="hb '+(h==='${A}'?'ha':'hbb')+'">'+(h==='${A}'?'A':'B')+'</span>').join('');
      document.getElementById('rs').classList.add('show');
    }
  }catch(e){document.getElementById('er').textContent='❌ Lỗi kết nối server';}
  finally{document.getElementById('ld').classList.remove('show');document.getElementById('btn').disabled=false;}
}
setInterval(doP,15000);
</script></body></html>`;
app.get("/", async (req, reply)=>{ reply.type("text/html").send(HTML); });
app.listen({port:PORT, host:"0.0.0.0"}).then(()=>console.log(`✅ ${GAME_NAME} AI v3.0 tại http://localhost:${PORT}`));
