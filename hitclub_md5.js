import fastify from "fastify";
import cors from "@fastify/cors";
import fetch from "node-fetch";
const PORT = process.env.PORT || 3000;
const API_URL = "https://kwinstore.com/hitclub/md5/history/6cd333eb6f42c778fb6ecbfd6fe8f14337f376d8b7fca424";
const GAME_NAME = "HITCLUB MD5";
const A = "TÀI", B = "XỈU";
const HAS_TABLES = false;
const app = fastify({ logger: false });
await app.register(cors, { origin: true });
const blocksOf = s => { const b=[]; let c=1; for(let i=1;i<s.length;i++){if(s[i]===s[i-1])c++;else{b.push(c);c=1;}} b.push(c); return b; };
function wilson(correct,total,z=1.96){if(total===0)return 0;const p=correct/total,d=1+z*z/total;const c=(p+z*z/(2*total))/d,sp=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;return Math.max(0,c-sp);}
function detectRegime(seq){if(seq.length<30)return 'balanced';const recent=seq.slice(-50);let maxS=1,cur=1;for(let i=1;i<recent.length;i++){if(recent[i]===recent[i-1])cur++;else{maxS=Math.max(maxS,cur);cur=1;}}maxS=Math.max(maxS,cur);const aRatio=recent.filter(x=>x===A).length/recent.length;const bias=Math.abs(aRatio-0.5);let alt=0;for(let i=1;i<recent.length;i++)if(recent[i]!==recent[i-1])alt++;const altRate=alt/(recent.length-1);if(maxS>=6)return 'streaky';if(altRate>0.62)return 'choppy';if(bias>0.12)return 'trending';return 'balanced';}
const REGIME_BOOST={streaky:{markov:0.9,streak:1.5,betbreak:1.4,pattern:1.0,pattern63:1.3,momentum:1.1,alt:0.7},choppy:{markov:1.1,streak:0.7,betbreak:1.0,pattern:1.4,pattern63:1.4,momentum:0.8,alt:1.5},trending:{markov:1.2,streak:1.1,betbreak:0.9,pattern:0.9,pattern63:1.0,momentum:1.5,alt:0.8},balanced:{markov:1.2,streak:1.0,betbreak:1.0,pattern:1.1,pattern63:1.2,momentum:1.0,alt:1.0}};
function markovN(seq,n,minC){if(seq.length<n+8)return null;const key=seq.slice(-n).join('|');let a=0,b=0;for(let i=n;i<seq.length;i++){if(seq.slice(i-n,i).join('|')===key){if(seq[i]===A)a++;else b++;}}const t=a+b;if(t<minC)return null;const pa=(a+1)/(t+2);if(pa>0.6)return{vote:A,w:1+wilson(a,t)*0.5};if(pa<0.4)return{vote:B,w:1+wilson(b,t)*0.5};return null;}
const s_markov2=s=>markovN(s,2,8);const s_markov3=s=>markovN(s,3,6);const s_markov4=s=>markovN(s,4,4);
function s_recentMarkov(seq){if(seq.length<50)return null;return markovN(seq.slice(-150),2,5);}
function s_weightedMarkov(seq){if(seq.length<60)return null;const key=seq.slice(-2).join('|');let wa=0,wb=0,tau=80;for(let i=2;i<seq.length;i++){if(seq.slice(i-2,i).join('|')===key){const w=Math.exp(-(seq.length-i)/tau);if(seq[i]===A)wa+=w;else wb+=w;}}const t=wa+wb;if(t<3)return null;const pa=(wa+0.3)/(t+0.6);if(pa>0.6)return{vote:A,w:1.2};if(pa<0.4)return{vote:B,w:1.2};return null;}
function s_bayesian(seq){if(seq.length<40)return null;const key=seq.slice(-3).join('|');const prior=0.5+(seq.slice(-30).filter(x=>x===A).length/30-0.5)*0.5;let a=0,b=0;for(let i=3;i<seq.length;i++){if(seq.slice(i-3,i).join('|')===key){if(seq[i]===A)a++;else b++;}}const t=a+b;if(t<5)return null;const pa=(a+4*prior)/(t+4);if(pa>0.6)return{vote:A,w:1.1};if(pa<0.4)return{vote:B,w:1.1};return null;}
function s_streak(seq){if(seq.length<30)return null;const last=seq[seq.length-1];let s=1;for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)s++;else break;}if(s<3)return null;let cont=0,brk=0;for(let i=0;i<seq.length-1;i++){let ss=1;for(let j=i-1;j>=0;j--){if(seq[j]===seq[i])ss++;else break;}if(ss===s){if(seq[i+1]===seq[i])cont++;else brk++;}}const t=cont+brk;if(t<6)return null;const pc=(cont+1.5)/(t+3);if(pc>0.58)return{vote:last,w:1.3};if(pc<0.42)return{vote:last===A?B:A,w:1.3};return null;}
function s_betBreaker(seq){if(seq.length<50)return null;const last=seq[seq.length-1];let s=1;for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)s++;else break;}if(s<4||s>9)return null;let cont=0,brk=0;for(let i=0;i<seq.length-1;i++){let ss=1;for(let j=i-1;j>=0;j--){if(seq[j]===seq[i])ss++;else break;}if(ss===s){if(seq[i+1]===seq[i])cont++;else brk++;}}const t=cont+brk;if(t<5)return null;const pb=(brk+1.5)/(t+3);if(pb>0.6)return{vote:last===A?B:A,w:1.4};if(pb<0.4)return{vote:last,w:1.2};return null;}
function s_streakDist(seq){if(seq.length<60)return null;const last=seq[seq.length-1];let cur=1;for(let i=seq.length-2;i>=0;i--){if(seq[i]===last)cur++;else break;}if(cur<2)return null;const ends={};let c=1;for(let i=1;i<seq.length;i++){if(seq[i]===seq[i-1])c++;else{ends[c]=(ends[c]||0)+1;c=1;}}ends[c]=(ends[c]||0)+1;const maxH=Math.max(...Object.keys(ends).map(Number));if(cur>=maxH+1)return{vote:last===A?B:A,w:1.5};const stop=ends[cur]||0;const cont=Object.entries(ends).filter(([k])=>Number(k)>cur).reduce((a,[,v])=>a+v,0);if(stop+cont<6)return null;const ps=(stop+1.5)/(stop+cont+3);if(ps>0.62)return{vote:last===A?B:A,w:1.3};if(ps<0.38)return{vote:last,w:1.1};return null;}
function s_pattern(seq){if(seq.length<6)return null;const b=blocksOf(seq);const last=b[b.length-1];const lv=seq[seq.length-1];const opp=lv===A?B:A;if(last>=5)return{vote:opp,w:1.4};if(last>=3&&b.length>=2)return{vote:opp,w:1.1};if(b.length>=3){const l3=b.slice(-3);if(l3[0]===l3[2]&&l3[0]>=2)return{vote:opp,w:1.2};if(l3[0]<l3[1]&&l3[1]>l3[2])return{vote:opp,w:1.1};if((l3[0]===1&&l3[1]===2&&l3[2]===1)||(l3[0]===2&&l3[1]===1&&l3[2]===2))return{vote:opp,w:1.3};}const fib=[1,1,2,3,5];if(b.length>=3&&b.slice(-3).every((v,i)=>v===fib[i]))return{vote:opp,w:1.3};return null;}
function s_alternating(seq){if(seq.length<6)return null;const l6=seq.slice(-6);let alt=true;for(let i=1;i<l6.length;i++){if(l6[i]===l6[i-1]){alt=false;break;}}if(alt)return{vote:l6[l6.length-1],w:1.3};return null;}
function s_doubleBlock(seq){if(seq.length<8)return null;const b=blocksOf(seq);if(b.length>=2&&b[b.length-1]===b[b.length-2]&&b[b.length-1]>=2&&b[b.length-1]<=4){return{vote:seq[seq.length-1]===A?B:A,w:1.2};}return null;}
function s_longPattern(seq){if(seq.length<10)return null;const tail=seq.slice(-8).join('');if(tail===tail.split('').reverse().join(''))return{vote:seq[seq.length-1]===A?B:A,w:1.2};return null;}
function s_momentum(seq,w){if(seq.length<w+5)return null;const a=seq.slice(-w).filter(x=>x===A).length;const pa=a/w;if(pa>0.65)return{vote:A,w:1.1};if(pa<0.35)return{vote:B,w:1.1};return null;}
const s_mom5=s=>s_momentum(s,5);const s_mom10=s=>s_momentum(s,10);const s_mom20=s=>s_momentum(s,20);
function s_dualTimeframe(seq){const m5=s_momentum(seq,5),m20=s_momentum(seq,20);if(m5&&m20&&m5.vote===m20.vote)return{vote:m5.vote,w:1.4};return null;}
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
  const last8 = seq.slice(-8);
  if(last8.length>=8 && last8.every((v,i)=>i===0||v!==last8[i-1])){
    return {vote:cont, w:1.8, name:"ANTI_TRAP_8DAO"};
  }
  for(const p of PATTERNS_63){
    let matched=false;
    if(p.type==="streak"){ if(p.spec[0]<=streak && streak<=p.spec[1]) matched=true; }
    else if(p.type==="groups"){ const tail=rle.slice(-p.spec.length); if(tail.length===p.spec.length && tail.every((v,i)=>v===p.spec[i])) matched=true; }
    else if(p.type==="palin"){ const L=p.spec; if(seq.length>=L){ const s=seq.slice(-L); if(s.every((v,i)=>v===s[L-1-i])) matched=true; } }
    if(matched){ return {vote: p.action==="cont"?cont:opp, w:1+(p.conf-80)/18, name:p.name}; }
  }
  if(seq.length>=12){
    const lastN=seq.slice(-20); const aN=lastN.filter(x=>x===A).length; const bN=lastN.length-aN;
    if(Math.abs(aN-bN)>=6) return {vote:aN<bN?A:B, w:1.3, name:"HOI_QUY_20"};
  }
  return null;
}
function s_markovFallback(seq){
  if(seq.length<4) return null;
  const w=Math.min(20,seq.length); const recent=seq.slice(-w);
  let aa=0,ab=0,ba=0,bb=0;
  for(let i=0;i<recent.length-1;i++){const x=recent[i],y=recent[i+1];if(x===A&&y===A)aa++;else if(x===A&&y===B)ab++;else if(x===B&&y===A)ba++;else bb++;}
  const last=recent[recent.length-1]; let pCont;
  if(last===A){const t=aa+ab||1;pCont=aa/t;}else{const t=ba+bb||1;pCont=bb/t;}
  if(pCont>0.58) return {vote:last,w:1.0,name:"MARKOV_FB"};
  if(pCont<0.42) return {vote:last===A?B:A,w:1.0,name:"MARKOV_FB"};
  return null;
}

function predict(seq){
  const regime=detectRegime(seq);const boost=REGIME_BOOST[regime];
  const raw=[{s:s_markov2(seq),g:'markov'},{s:s_markov3(seq),g:'markov'},{s:s_markov4(seq),g:'markov'},{s:s_recentMarkov(seq),g:'markov'},{s:s_weightedMarkov(seq),g:'markov'},{s:s_bayesian(seq),g:'markov'},{s:s_streak(seq),g:'streak'},{s:s_betBreaker(seq),g:'betbreak'},{s:s_streakDist(seq),g:'streak'},{s:s_pattern(seq),g:'pattern'},{s:s_alternating(seq),g:'alt'},{s:s_doubleBlock(seq),g:'pattern'},{s:s_longPattern(seq),g:'pattern'},{s:s_mom5(seq),g:'momentum'},{s:s_mom10(seq),g:'momentum'},{s:s_mom20(seq),g:'momentum'},{s:s_dualTimeframe(seq),g:'momentum'},{s:s_pattern63(seq),g:'pattern63'},{s:s_markovFallback(seq),g:'markov'}];
  let wA=0,wB=0,used=0,hit="";
  for(const{s,g}of raw){if(!s)continue;const bw=s.w*(boost[g]||1);if(s.vote===A)wA+=bw;else wB+=bw;used++;if(s.name&&!hit)hit=s.name;}
  if(used===0)return{prediction:'CHỜ',confidence:50,signals:0,regime};
  const total=wA+wB;const pred=wA>=wB?A:B;const wWin=Math.max(wA,wB);
  const conf=Math.min(97,Math.round(50+(wWin/total-0.5)*100+wilson(Math.round(wWin),Math.round(total))*15));
  return{prediction:pred,confidence:conf,signals:used,regime,pattern_hit:hit};
}
async function getHistory(table){
  const res=await fetch(API_URL,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)});
  const data=await res.json();
  let lst=data.data||data.list||data.history||data.sessions||[];
  let lastId="";
  if(HAS_TABLES){const tables=data.tables||data.data||data.list||[];const t=tables.find(x=>String(x.table||x.id||x.name||x.table_id||"")===String(table));if(t){lst=t.history||t.list||t.sessions||[];}else lst=[];}
  const seq=lst.map(s=>{
    const r=String(s.resultTruyenThong||s.result||s.winner||s.outcome||"").toUpperCase();
    const id=String(s.id||s.session||s.phien||s.period||"");
    if(id&&!lastId)lastId=id;
    if(r.includes("TAI")||r==="T")return A;
    if(r.includes("XIU")||r.includes("XỈU")||r==="X")return B;
    if(r.includes("PLAYER")||r==="P")return A;
    if(r.includes("BANKER")||r==="B")return B;
    return null;
  }).filter(Boolean);
  return {seq, lastId};
}
async function getTables(){if(!HAS_TABLES)return[];try{const res=await fetch(API_URL,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(12000)});const data=await res.json();const tables=data.tables||data.data||data.list||[];return tables.map(t=>({id:t.table||t.id||t.name||t.table_id,name:t.name||t.table_name||("Bàn "+(t.table||t.id))}));}catch{return[];}}
app.get("/api/predict",async(req,reply)=>{try{const table=req.query.table;if(HAS_TABLES&&!table)return reply.status(400).send({error:"Thiếu table"});const{seq,lastId}=await getHistory(table);if(seq.length<5)return reply.status(503).send({error:"Đang lấy dữ liệu",current:seq.length});const r=predict(seq);return{...r,history_len:seq.length,game:GAME_NAME,table:table||null,last_id:lastId};}catch(e){return reply.status(500).send({error:e.message});}});
if(HAS_TABLES)app.get("/api/tables",async()=>({tables:await getTables()}));
const TBL_JS="";
const HTML=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API</title></head>
<body style="background:#ffffff;color:#000000;font-family:monospace;font-size:14px;padding:15px;margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.6">
<div id="out">DANG TAI...</div>
<script>
${TBL_JS}
async function load(){
  try{
    let url='/api/predict';
    
    const r=await fetch(url);const d=await r.json();
    if(d.error){document.getElementById('out').textContent=JSON.stringify({success:false,error:d.error},null,2);return;}
    const out={
      success:true,
      game:d.game,
      phien:d.last_id||(d.history_len+1),
      du_doan:d.prediction,
      confidence:d.confidence+'%',
      tin_hieu:d.signals,
      che_do_cau:d.regime,
      khop_cau:d.pattern_hit||null,
      lich_su:(d.history||[]).slice().reverse()
    };
    document.getElementById('out').textContent=JSON.stringify(out,null,2);
  }catch(e){document.getElementById('out').textContent=JSON.stringify({success:false,error:'LOI KET NOI'},null,2);}
}
load();setInterval(load,15000);
</script></body></html>`;
app.get("/",async(req,reply)=>{reply.type("text/html").send(HTML);});
app.listen({port:PORT,host:"0.0.0.0"}).then(()=>console.log("OK :"+PORT));
