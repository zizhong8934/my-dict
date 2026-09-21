/* 内联自 theme-module.js */
(function(){
  "use strict";

  const THEME_DATA=window.WORDTIDE_THEME_DATA;
  if(!THEME_DATA||THEME_DATA.version<2)throw new Error("主题词库数据未加载");
  const CORE_TOOLS=THEME_DATA.packs.tools.filter(x=>THEME_DATA.coreToolIds.includes(x.id));
  const SEAS=THEME_DATA.themes.map(meta=>Object.assign({},meta,{items:THEME_DATA.packs[meta.id]||[]}));

  // Quarantine known incorrect teaching photos until individually replaced.
  const withheldPhotos=new Set(['home:blanket','home:toilet','tools:toolbox','tools:screw','shopping:route','materials:panel','food:bread','food:cabbage']);
  for(const s of SEAS)for(const it of s.items)if(withheldPhotos.has(s.id+':'+it.id)){it.img='';it.imageNeedsReview=true;}
  let seaId="tools", run=null, echoTimer=0;
  const screen=document.createElement("div"); screen.className="screen"; screen.id="scTheme"; document.body.appendChild(screen);

  function safeObj(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
  function mergeProgress(a,b){
    const out=Object.assign({},a||{});for(const [k,v] of Object.entries(b||{}))out[k]=typeof v==="number"?Math.max(Number(out[k])||0,v):out[k]??v;return out;
  }
  function migrateLegacyIds(){
    if((S.themeDataVersion|0)>=THEME_DATA.version)return;
    for(const [oldKey,newKey] of Object.entries(THEME_DATA.legacyIds||{})){
      if(S.themeProg[oldKey])S.themeProg[newKey]=mergeProgress(S.themeProg[newKey],S.themeProg[oldKey]);
      if(S.themeMistakes[oldKey]!=null)S.themeMistakes[newKey]=Math.max(S.themeMistakes[newKey]|0,S.themeMistakes[oldKey]|0);
    }
    S.themeDataVersion=THEME_DATA.version;
  }
  function ensure(){
    S.themeSea=typeof S.themeSea==="string"?S.themeSea:"tools";
    S.themeProg=safeObj(S.themeProg); S.themeMistakes=safeObj(S.themeMistakes);
    S.themeStats=safeObj(S.themeStats); S.themeEchoRate=Number(S.themeEchoRate)||.78;
    migrateLegacyIds();
    seaId=SEAS.some(x=>x.id===S.themeSea)?S.themeSea:"tools"; save();
  }
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function sea(){return SEAS.find(x=>x.id===seaId)||SEAS[0]}
  function itemSeaId(it){return it&&it._seaId||seaId}
  function seaFor(it){return SEAS.find(x=>x.id===itemSeaId(it))||sea()}
  function key(it){return itemSeaId(it)+":"+it.id}
  let originalWordIndex=null;
  function originalKey(it){
    if(!originalWordIndex){
      originalWordIndex={};const add=(arr,prefix)=>{for(const x of arr||[]){const w=String(x.w||"").toLowerCase().trim();if(w)(originalWordIndex[w]||(originalWordIndex[w]=[])).push(prefix+":"+w)}};
      try{add(DB.sw,"s");add(DB.g,"g")}catch(e){}add(S.custom,"g");
    }
    const keys=originalWordIndex[String(it.w||"").toLowerCase().trim()]||[],construction=/^(tools|materials|commands)$/.test(itemSeaId(it));return keys.find(k=>k.startsWith(construction?"s:":"g:"))||keys[0]||null;
  }
  function syncFromOriginal(it,p){
    const k=originalKey(it),g=k&&S.prog&&S.prog[k];if(!g)return p;const lv=g.lv|0;
    if(lv>=1)p.learn=Math.max(p.learn|0,1);
    if(lv>=2){p.assemble=Math.max(p.assemble|0,1);p.complete=Math.max(p.complete|0,1)}
    if(lv>=3)p.spell=Math.max(p.spell|0,1);
    if(lv>=4){p.spell=Math.max(p.spell|0,2);p.monster=Math.max(p.monster|0,1)}
    return p;
  }
  function syncToOriginal(it,p){
    const k=originalKey(it);if(!k)return;const g=S.prog[k]||(S.prog[k]={lv:0,due:0,ok:0,bad:0});let lv=0;
    if(p.learn)lv=1;if(p.assemble&&p.complete)lv=2;if((p.spell|0)>=1)lv=3;if((p.spell|0)>=2&&p.monster)lv=4;
    if(lv>(g.lv|0)){g.lv=lv;g.due=g.due||Date.now()+86400000;g.iv=g.iv||1}g.ok=Math.max(g.ok|0,p.ok|0);g.bad=Math.max(g.bad|0,p.bad|0);
  }
  function prog(it){
    const k=key(it),p=S.themeProg[k]||(S.themeProg[k]={learn:0,recall:0,assemble:0,complete:0,spell:0,monster:0,echo:0,ok:0,bad:0,last:0});
    // 第一阶段已经完整拼写过的词自动继承两个新脚手架阶段，避免升级后熟练度倒退。
    if(p.assemble==null)p.assemble=(p.spell|0)>=2?1:0;
    if(p.complete==null)p.complete=(p.spell|0)>=2?1:0;
    for(const field of ["learn","recall","assemble","complete","spell","monster","echo","ok","bad","last"])if(!Number.isFinite(Number(p[field])))p[field]=0;
    syncFromOriginal(it,p);
    if(p.lv==null)p.lv=p.spell>1?6:p.spell>0?5:p.complete>0?4:p.assemble>0?3:p.learn>0?1:0;
    return p;
  }
  function score(it){const p=prog(it);return Math.min(1,p.learn)+Math.min(1,p.assemble)+Math.min(1,p.complete)+Math.min(2,p.spell)+Math.min(1,p.monster)+Math.min(1,p.echo)}
  function mastered(it){return score(it)>=7}
  function mistakeCount(it){return S.themeMistakes[key(it)]|0}
  function mark(it,type,ok,meta){
    const p=prog(it); p.last=Date.now();
    /* 结算页要列出"这几个再看一眼"，所以本轮错过的词要留下来（去重）。
       原来只有一个 run.bad 计数，数字对了但说不出是哪几个 ——
       而人下一步想做的恰恰是把那几个再看一遍。 */
    if(run){
      if(!run.missed)run.missed=[];
      if(!ok&&!run.missed.some(x=>key(x)===key(it)))run.missed.push(it);
    }
    /* 自适应模式下，每答一题就升/降一档。这是"不会的练到会、会了的不再磨"的关键。 */
    if(run&&run.mode==="adaptive")bumpLv(it,!!ok);
    if(ok){p.ok=(p.ok|0)+1;p[type]=(p[type]|0)+1;S.themeMistakes[key(it)]=Math.max(0,mistakeCount(it)-1);}
    else{p.bad=(p.bad|0)+1;S.themeMistakes[key(it)]=mistakeCount(it)+1;}
    syncToOriginal(it,p);
    S.themeStats.answers=(S.themeStats.answers|0)+1;if(ok)S.themeStats.correct=(S.themeStats.correct|0)+1;save();
    try{if(window.WORDTIDE_MEMORY)window.WORDTIDE_MEMORY.recordTheme({wordId:key(it),themeId:itemSeaId(it),item:it,mode:type,correct:!!ok,hintCount:meta&&meta.hintCount||0,responseMs:run&&run.qStartedAt?Date.now()-run.qStartedAt:0})}catch(e){console.warn("统一记忆记录失败",e)}
  }
  function overall(){const all=SEAS.flatMap(x=>x.items.map(i=>[x.id,i]));let done=0;for(const [sid,it] of all){const old=seaId;seaId=sid;if(mastered(it))done++;seaId=old;}return {done,total:all.length}}
  function toolProgress(){const old=seaId;seaId="tools";const done=CORE_TOOLS.filter(mastered).length;seaId=old;return done}
  function speakAt(text,rate){
    if(window.WT_AUDIO){window.WT_AUDIO.speak(text,rate);return}
    try{if(!speechSynthesis)return; speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=rate||S.themeEchoRate||.78;const v=typeof pickVoice==="function"?pickVoice("en-US"):null;if(v)u.voice=v;speechSynthesis.speak(u);}catch(e){try{speak(text,"en-US")}catch(_){}}
  }
  function soundCue(kind){
    if(window.WT_AUDIO){window.WT_AUDIO.cue(kind);return}
    try{
      if(typeof beep!=="function")return;
      if(kind==="ok"){beep(620,.09,"triangle",.055);setTimeout(()=>beep(820,.12,"sine",.045),65)}
      else if(kind==="bad")beep(210,.13,"sine",.04);
      else beep(430,.045,"sine",.022);
    }catch(e){}
  }
  function addHomeEntry(){
    const modes=document.querySelector("#scHome .modes"),boss=document.getElementById("modeBoss");if(!modes||document.getElementById("modeTheme"))return;
    const el=document.createElement("div");el.className="mode theme-cover";el.id="modeTheme";
    el.innerHTML='<div><div class="mtag">认识 × 组装 × 默写</div><div class="mname">主题海域</div><div class="mnum"><b id="eThemeDone">0</b>/12 核心工具已完成</div><small>先认识，再组装词块、补全缺字、完整默写，最后进入海怪和句子跟读。</small></div><button class="pri theme-cover-button" id="btnThemeHome">进入主题海域</button>';
    modes.insertBefore(el,boss);document.getElementById("btnThemeHome").onclick=openHub;el.onclick=e=>{if(!e.target.closest("button"))openHub()};updateHome();
  }
  function updateHome(){const el=document.getElementById("eThemeDone");if(el)el.textContent=toolProgress()}
  function openHub(){ensure();run=null;clearTimeout(echoTimer);showScreen("scTheme");renderHub()}
  function goHome(){run=null;clearTimeout(echoTimer);showScreen("scHome");updateHome();try{refreshHome()}catch(e){}}
  function pctFor(s){const old=seaId;seaId=s.id;const n=s.items.filter(mastered).length;seaId=old;return {n,p:Math.round(n/Math.max(1,s.items.length)*100)}}

  function renderHub(){
    const all=overall(),s=sea(),pc=pctFor(s),mist=s.items.reduce((n,it)=>n+mistakeCount(it),0);
    screen.innerHTML='<div class="th-shell">'+
      '<div class="th-head"><button class="sm" id="thBack">← 首页</button><div class="th-grow"><div class="th-kicker">THEME SEAS · 主题海域</div><h1>从照片到句子，一条线记住</h1></div><div style="text-align:right"><b>'+all.done+'/'+all.total+'</b><div class="muted">样板词已掌握</div></div></div>'+
      '<div class="th-progress"><i style="width:'+Math.round(all.done/Math.max(1,all.total)*100)+'%"></i></div>'+
      '<div class="th-hub">'+SEAS.map(x=>{const p=pctFor(x);return '<button class="th-sea '+(x.id===seaId?'active':'')+'" data-sea="'+x.id+'"><span class="th-count">'+p.n+'/'+x.items.length+'</span><div class="th-icon">'+x.icon+'</div><h3>'+x.name+'</h3><p>'+x.desc+'</p></button>'}).join("")+'</div>'+
      '<section class="th-panel"><div class="th-panel-head"><div><div class="th-kicker">'+s.target+' · 当前样板 '+s.items.length+' 词</div><h2>'+s.icon+' '+s.name+'</h2><p>'+s.desc+(s.full?' 每个词都配了真实照片、双例句、意群切块和高频搭配。开始学习会按你对每个词的掌握程度自动出题，会了的不再重复。':' 当前开放词卡、词块组装、缺字补全、默写和听读，照片会沿用同一结构继续补充。')+'</p></div><div style="text-align:right"><b>'+pc.n+'/'+s.items.length+'</b><div class="muted">已掌握 · 错词 '+mist+'</div></div></div>'+
      '<div class="th-actions">'+(s.full?'<button class="th-main" data-mode="adaptive">▶ 开始学习</button><button data-mode="mistakes">🔁 只练错词</button><button class="th-echo" data-mode="echo">🎧 回声跟读</button></div><details class="th-more"><summary>单项练习</summary><div class="th-actions"><button data-mode="learn">看图选义</button><button data-mode="listen">听音选义</button><button data-mode="zhpick">中文选词</button><button data-mode="assemble">词块组装</button><button data-mode="complete">缺字补全</button><button data-mode="spell">全拼默写</button><button data-mode="sentence">句子拼写</button><button data-mode="colo">词语搭配</button><button data-mode="monster">海怪实战</button><button data-mode="recall">图片回忆</button></div></details><div class="th-actions" style="display:none">':'<button class="th-main" data-mode="guided">▶ 渐进学习（推荐）</button><button data-mode="learn">① 词卡认识</button><button data-mode="assemble">② 词块组装</button><button data-mode="complete">③ 缺字补全</button><button data-mode="spell">④ 完整默写</button><button class="th-echo" data-mode="echo">⑤ 快速听读</button>')+(mist?'<button data-mode="mistakes">⚡ 错词突击 '+mist+'</button>':'')+'</div>'+
      '<div class="th-flowline"><div class="th-flowstep"><b>01</b>认识</div><div class="th-flowstep"><b>02</b>组装</div><div class="th-flowstep"><b>03</b>补全</div><div class="th-flowstep"><b>04</b>默写</div><div class="th-flowstep"><b>05</b>海怪</div><div class="th-flowstep"><b>06</b>跟读</div></div>'+
      '<div class="th-wordbank">'+s.items.map(it=>{const n=score(it);return '<button class="th-wordchip '+(mastered(it)?'mastered ':'')+(mistakeCount(it)?'mistake':'')+'" data-word="'+esc(it.id)+'"><span class="ico">'+it.icon+'</span><span><b>'+esc(it.w)+'</b><small>'+esc(it.zh)+(n?' · 进度 '+n+'/7':'')+(mistakeCount(it)?' · 错 '+mistakeCount(it):'')+'</small></span></button>'}).join("")+'</div></section></div>';
    document.getElementById("thBack").onclick=goHome;
    screen.querySelectorAll("[data-sea]").forEach(b=>b.onclick=()=>{seaId=b.dataset.sea;S.themeSea=seaId;save();renderHub()});
    screen.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>start(b.dataset.mode));
    screen.querySelectorAll("[data-word]").forEach(b=>b.onclick=()=>start("guided",s.items.find(x=>x.id===b.dataset.word)));
  }

  function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function start(mode,one){
    const s=sea();let items=one?[one]:s.items.slice();   /* 原来 full 的主题只取 CORE_TOOLS（12 词），那是因为当初只有那 12 个有完整数据；现在 156 个都有了 */
    if(mode==="learn"||mode==="guided"||mode==="echo"||mode==="adaptive")items.sort((a,b)=>score(a)-score(b)||compareFresh({w:a.w,t:1},{w:b.w,t:1}));
    if(mode==="mistakes")items=s.items.filter(x=>mistakeCount(x)>0).sort((a,b)=>mistakeCount(b)-mistakeCount(a));
    if(!items.length){toast("目前没有错词");return}if(mode!=="learn"&&mode!=="echo"&&mode!=="guided"&&mode!=="adaptive")items=shuffle(items);
    const limit=mode==="monster"||mode==="echo"?8:12;
    run={mode,phase:mode==="guided"?"learn":null,items:items.slice(0,limit),queue:items.slice(0,limit),i:0,ok:0,bad:0,t0:Date.now(),missed:[],lvUps:0,hp:100,def:3,requeued:{},rate:S.themeEchoRate||.78,build:null,mask:null,daily:false,dailyOffset:0};
    if(mode==="monster")renderMonster();else if(mode==="echo")renderEcho();else renderLesson();
  }
  function startDaily(refs,opts){
    opts=opts||{};const queue=(refs||[]).map(ref=>{const s=SEAS.find(x=>x.id===ref.themeId),it=s&&s.items.find(x=>x.id===ref.id);return it?Object.assign({},it,{_seaId:ref.themeId,_exercise:ref.exercise||"spell",_reason:ref.reason||"今日计划"}):null}).filter(Boolean);
    if(!queue.length){toast("今天暂时没有可学习的词");return false}
    run={mode:"daily",phase:null,items:queue.slice(),queue:queue.slice(),i:0,ok:0,bad:0,t0:Date.now(),missed:[],lvUps:0,hp:100,def:3,requeued:{},rate:S.themeEchoRate||.78,build:null,mask:null,daily:true,dailyPlan:opts.plan||"quick",dailyOffset:opts.offset|0};
    showScreen("scTheme");renderLesson();return true;
  }
  function current(){return run&&run.queue[run.i]}
  /* 答完之后停住，等人点「继续」。
     找不到容器时退回定时器 —— 宁可跳快了，也不能卡死在一道题上。 */
  function holdOn(){
    const active=run,index=run.i,phase=run.phase;
    active.locked=true;
    const bar=document.getElementById("thGoOn");
    if(!bar){advanceAfter(advanceLesson,900);return}
    bar.innerHTML='<button class="th-main th-goon-btn" id="thGoOnBtn">继续 →</button>';
    const btn=document.getElementById("thGoOnBtn");
    if(!btn){advanceAfter(advanceLesson,900);return}
    btn.onclick=()=>{
      if(run!==active||run.i!==index||run.phase!==phase)return;   /* 连点两下只走一次 */
      active.locked=false;advanceLesson();
    };
  }
  function advanceAfter(callback,ms){
    const active=run,index=run.i;active.locked=true;
    setTimeout(()=>{if(run!==active||run.i!==index)return;active.locked=false;callback()},ms);
  }
  function guidedRail(){
    if(!run||run.mode!=="guided")return "";const steps=[["learn","认识"],["assemble","组装"],["complete","补全"],["spell","默写"]],at=steps.findIndex(x=>x[0]===run.phase);
    return '<div class="th-flowline" style="grid-template-columns:repeat(4,1fr)">'+steps.map((x,i)=>'<div class="th-flowstep '+(i<at?'done':i===at?'active':'')+'"><b>0'+(i+1)+'</b>'+x[1]+'</div>').join("")+'</div>';
  }
  function shell(title,body){const daily=run&&run.daily,it=current(),s=seaFor(it);screen.innerHTML='<div class="th-shell"><div class="th-head"><button class="sm" id="thExit">'+(daily?'← 今日潮汐':'← 主题大厅')+'</button><div class="th-grow"><div class="th-kicker">'+esc(s.name)+(daily&&it&&it._reason?' · '+esc(it._reason):'')+'</div><h1>'+title+'</h1></div><div><b>'+(Math.min(run.i+1,run.queue.length))+'/'+run.queue.length+'</b><div class="muted">正确 '+run.ok+' · 错误 '+run.bad+'</div></div></div>'+guidedRail()+'<section class="th-panel th-lesson on">'+body+'</section></div>';document.getElementById("thExit").onclick=()=>{if(daily&&window.WORDTIDE_MEMORY)window.WORDTIDE_MEMORY.openDaily();else openHub()}}
  function visual(it,label){return '<div class="th-photo-wrap">'+(it.img?'<img class="th-photo" loading="lazy" decoding="async" src="'+it.img+'" alt="'+esc(it.zh)+'">':'<div style="height:100%;display:grid;place-items:center;background:linear-gradient(145deg,#edf6f1,#d9e9e8);font-size:108px">'+it.icon+'</div>')+'<span class="th-photo-badge">'+label+'</span><span class="th-photo-count">'+(run.i+1)+' / '+run.queue.length+'</span></div>'}
  function info(it,hidden){
    const ex=it.ex&&it.ex[0]||["This is "+it.w+".","这是“"+it.zh+"”。"];
    const zh=String(it.zh||"").trim(),use=String(it.use||"").trim();
    /* 156 个词里 74 个的 use 和 zh 一字不差。两个框写同样四个字，看着像出了 bug。 */
    const useHTML=(use&&use!==zh)?'<div class="th-use"><b>常见用途</b>'+esc(use)+'</div>':'';
    return '<div class="th-answer '+(hidden?'':'show')+'">'
      +'<div class="th-answer-tag">答案</div>'
      +'<h2 class="th-word">'+esc(it.w)+'</h2>'
      +'<div class="th-syllable">'+esc(it.sy)+'</div>'
      +'<div class="th-zh">'+esc(zh)+'</div>'
      +useHTML
      +'<div class="th-example"><strong>'+esc(ex[0])+'</strong>'+esc(ex[1])+'</div></div>';
  }
  function splitPlainWord(word){
    word=String(word||"").replace(/[^a-z]/gi,"");if(word.length<2)return [word];
    if(word.length<=3)return [word.slice(0,1),word.slice(1)];
    if(/^(wr|dr|tr|ch|sh|th|ph|pl|cl|br|gr)/i.test(word))return [word.slice(0,2),word.slice(2)];
    if(word.length<=7){const n=Math.ceil(word.length/2);return [word.slice(0,n),word.slice(n)]}
    const n=Math.ceil(word.length/3);return [word.slice(0,n),word.slice(n,n*2),word.slice(n*2)];
  }
  function wordParts(it){
    const sylWords=String(it.sy||it.w).trim().split(/\s+/),plainWords=String(it.w).trim().split(/\s+/),out=[];
    sylWords.forEach((sw,wi)=>{let bits=sw.split("·").filter(Boolean);if(bits.length<2)bits=plainWords.length>1?[plainWords[wi]||sw]:splitPlainWord(plainWords[wi]||sw);bits.forEach(text=>out.push({id:out.length,text,word:wi}))});
    return out.filter(x=>x.text);
  }
  function sentParts(it){
    /* 意群块。word 全给同一个值，renderBuildBoard 才不会在块之间插单词间隙。 */
    let cs=(it.chunks&&it.chunks.length)?it.chunks:[it.w];
    /* 两块只有两种排法，闭着眼点也有一半对 —— 那不是一道题，是一枚硬币。
       意群不够三块时改成按词切。判据是"够不够构成一道题"，
       不是"哪种单位更正确"：短句本来就只有两个意群，硬切成三块
       反而会切出没人那么说的碎片。 */
    if(cs.length<3){
      const words=cs.join(" ").split(/\s+/).filter(Boolean);
      if(words.length>=3)cs=words;
    }
    return cs.map((text,i)=>({id:i,text:text,word:0}));
  }
  // Wrong letter blocks are choices, not syllable teaching material.
  function assemblyOptions(correctParts, successes){
    const parts=correctParts.map((p,id)=>({...p,id}));
    const count=successes>=2?3:successes>=1?2:0;
    const used=new Set(parts.map(p=>p.text.toLowerCase()));
    const candidates=[];
    function offer(text,word){
      const normalized=text.toLowerCase();
      if(!text||used.has(normalized))return;
      used.add(normalized);candidates.push({text,word});
    }
    // Change one letter to make plausible near-misses, without duplicates.
    for(const p of correctParts){
      const chars=Array.from(p.text);
      for(let i=0;i<chars.length;i++){
        if(!/[a-z]/i.test(chars[i]))continue;
        const alternatives=/[aeiou]/i.test(chars[i])?'aeiou':'rlnmts';
        for(const letter of alternatives){
          const next=chars.slice();next[i]=chars[i]===chars[i].toUpperCase()?letter.toUpperCase():letter;
          offer(next.join(''),p.word);
        }
      }
    }
    for(const text of ['en','ing','er','ly','tion','un'])offer(text,0);
    const extras=shuffle(candidates).slice(0,count);
    for(const p of extras)parts.push({...p,id:parts.length});
    return {parts,distractorCount:extras.length};
  }
  function assemblyInstruction(){
    const b=run.build,n=b.distractorCount;
    return n?'辨别组装：有 '+n+' 个干扰块。选出 '+b.correct.length+' 块，按顺序拼出英文；多余的不用选。'
      :'基础组装：把字母块按正确顺序拼成英文。熟悉后会加入干扰块。';
  }

  function ensureBuild(it){
    const sent=lessonMode()==="sentence";
    const k=(sent?"S:":"")+key(it);if(run.build&&run.build.key===k)return;
    const base=sent?sentParts(it):wordParts(it),correct=base.map(x=>x.id);
    const options=sent?{parts:base,distractorCount:0}:assemblyOptions(base,prog(it).assemble|0);
    const parts=options.parts,order=shuffle(parts.map(x=>x.id));
    if(order.length>1&&order.every((x,i)=>x===correct[i]))order.reverse();
    run.build={key:k,parts,correct,order,selected:[],distractorCount:options.distractorCount};
  }
  function renderBuildBoard(){
    const b=run.build,built=document.getElementById("thBuilt"),tiles=document.getElementById("thTiles");if(!b||!built||!tiles)return;
    built.classList.toggle("empty",!b.selected.length);
    built.innerHTML=b.selected.map((id,i)=>{const p=b.parts[id],prev=i?b.parts[b.selected[i-1]]:null;return (prev&&prev.word!==p.word?'<span class="th-word-gap"></span>':'')+'<button class="th-part" data-built="'+id+'">'+esc(p.text)+'</button>'}).join("");
    tiles.innerHTML=b.order.map(id=>'<button class="th-part '+(b.selected.includes(id)?'used':'')+'" data-tile="'+id+'">'+esc(b.parts[id].text)+'</button>').join("");
    tiles.querySelectorAll("[data-tile]").forEach(x=>x.onclick=()=>{
      const id=Number(x.dataset.tile);if(run.locked||b.selected.includes(id)||b.selected.length>=b.correct.length)return;
      b.selected.push(id);renderBuildBoard();
      /* 拼满的那一刻答案就定了，再问一次「你确定吗」没有信息量。 */
      if(b.selected.length>=b.correct.length)checkAssembly();
    });
    built.querySelectorAll("[data-built]").forEach((x,i)=>x.onclick=()=>{if(run.locked)return;b.selected.splice(i,1);renderBuildBoard()});
  }
  function checkAssembly(){
    if(!run||run.locked)return;
    const it=current(),b=run.build,fb=document.getElementById("thFeedback");if(!it||!b||!fb)return;
    if(b.selected.length<b.correct.length){fb.className="th-feedback bad";fb.textContent="还没有组装完整。";return}
    const samePart=(id,i)=>{const a=b.parts[id],e=b.parts[b.correct[i]];return a&&e&&a.text===e.text&&a.word===e.word};
    const ok=b.selected.length===b.correct.length&&new Set(b.selected).size===b.selected.length&&b.selected.every(samePart);
    const sent=lessonMode()==="sentence",type=sent?"sentence":"assemble";
    const full=sent?((it.ex&&it.ex[0]&&it.ex[0][0])||it.w):it.w;
    if(ok){mark(it,type,true);run.ok++;soundCue("ok");fb.className="th-feedback ok";
      fb.textContent=(sent?"✓ 拼对了：":"✓ 组装正确：")+full;
      screen.querySelector(".th-answer").classList.add("show");
      /* 拼对之后把整句读一遍 —— 拼是眼和手，读出来才进耳朵 */
      speakAt(full,sent?.82:.72);holdOn()}
    else{mark(it,type,false);run.bad++;soundCue("bad");requeue(it);fb.className="th-feedback bad";
      /* 只退回第一个错的位置往后的部分。全推倒等于重做，
         而且没告诉你错在哪 —— 你只知道"不对"。 */
      let keep=0;while(keep<b.selected.length&&samePart(b.selected[keep],keep))keep++;
      fb.textContent=keep
        ? "前 "+keep+" 块是对的，从第 "+(keep+1)+" 块开始再看看。"
        : (sent?"第一块就不对，再想想句子怎么起头。":"第一块就不对，再看看这个词怎么开头。");
      b.selected=b.selected.slice(0,keep);renderBuildBoard()}
  }
  /* 不共字但极易混的几对，手写排掉。共字的靠下面的规则自动排除。 */
  const CONFUSE=[["cement","concrete"],["mortar","grout"],["sand","gravel"],
    ["lumber","plywood"],["trim","baseboard"],["stud","panel"],
    ["primer","paint"],["caulk","adhesive"],["pan","pot"],["salt","sugar"],
    ["beef","pork"],["stove","oven"],["sink","bathtub"],["mirror","mattress"],
    ["return","exchange"],["station","platform"],["price","fare"],
    ["cart","basket"],["screw","bolt"],["nail","screw"],["hammer","mallet"],
    /* 这三对不共字，但配的图几乎一样 —— 抽到就是送分题，考的不是词义是眼力。
       换图之前先把它们隔开。 */
    ["panel","drywall"],["route","bus stop"],["bread","cheese"],
    ["pliers","wrench"],["drill","screwdriver"],["broom","mop"],
    ["washing machine","dryer"],["microwave","oven"],["cabinet","drawer"]];
  function confusable(a,b){
    const x=a.w,y=b.w;
    if(CONFUSE.some(p=>(p[0]===x&&p[1]===y)||(p[0]===y&&p[1]===x)))return true;
    /* 中文释义共字 —— 螺丝/螺栓 共"螺"，平底锅/锅 共"锅" */
    const za=String(a.zh||""),zb=String(b.zh||"");
    for(const ch of za) if(ch.trim()&&zb.indexOf(ch)>=0) return true;
    return false;
  }
  function seedOf(s){let n=2166136261;for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619)}return n>>>0}
  function seededPick(pool,k,seed){
    /* 同一个词每次拿到同一组干扰项：不固定的话，"这张图刚见过"会变成线索。 */
    const a=pool.slice();let s=seed>>>0;
    for(let i=a.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[a[i],a[j]]=[a[j],a[i]]}
    return a.slice(0,k);
  }
  /* ── 自适应出题 ── */
  function coarse(){
    /* 手机/平板（手指操作）上打英文很痛苦，打字题要换成点击题。
       用 pointer:coarse 而不是屏幕宽度 —— 接了键盘的平板不会被误判。 */
    try{ return window.matchMedia && window.matchMedia("(pointer:coarse)").matches; }
    catch(e){ return false; }
  }
  /* 每一档可选的题型。第一个是默认，touch 那列是手指设备上的替代。
     换的是形式不是难度：手机上"默写"换成"缺字补全"，
     两者都是产出拼写，但一个要打全词、一个只补几个字母。 */
  const LADDER=[
    {lv:0, any:["learn"]},
    {lv:1, any:["listen","zhpick"]},
    {lv:2, any:["assemble"]},
    {lv:3, any:["complete"]},
    {lv:4, any:["spell"],           touch:["complete","spell"]},
    {lv:5, any:["sentence","colo"], touch:["sentence"]},
    {lv:6, any:["spell","colo","sentence"], touch:["sentence","complete"]}
  ];
  function lvOf(it){
    const p=prog(it);
    return Math.max(0, Math.min(LADDER.length-1, p.lv|0));
  }
  function bumpLv(it, ok){
    const p=prog(it);
    /* 升档数比正确率诚实：正确率专挑熟词刷能刷到 100%，
       升档数是"这一局真的往前推了多少"。 */
    if(ok&&run&&(p.lv|0)<6)run.lvUps=(run.lvUps|0)+1;
    p.lv = Math.max(0, Math.min(LADDER.length-1, (p.lv|0) + (ok?1:-1)));
    save();
  }
  function exerciseFor(it, seed){
    const rung=LADDER[lvOf(it)];
    const list=(coarse() && rung.touch) ? rung.touch : rung.any;
    return list[(seed>>>0) % list.length];
  }
  function ensurePick(it){
    const k="P:"+key(it);if(run.pick&&run.pick.key===k)return;
    const same=seaFor(it).items.filter(x=>x!==it&&x.img&&!confusable(it,x));
    let pool=same;
    if(pool.length<3){                      /* 同主题不够就跨主题补，但仍然避开近义 */
      const all=[];SEAS.forEach(s=>s.items.forEach(x=>{if(x!==it&&x.img&&!confusable(it,x))all.push(x)}));
      pool=all;
    }
    const seed=seedOf(key(it));
    const wrong=seededPick(pool,3,seed);
    const opts=seededPick(wrong.concat([it]),4,seed^0x9e3779b9);
    run.pick={key:k,opts,answer:opts.indexOf(it),done:false};
  }
  function checkPick(idx){
    if(!run||run.locked)return;
    const it=current(),p=run.pick;if(!it||!p||p.done)return;
    const grid=document.getElementById("thPickGrid");if(!grid)return;
    p.done=true;
    const ok=idx===p.answer;
    grid.querySelectorAll("[data-pick]").forEach(b=>{
      const i=Number(b.getAttribute("data-pick"));
      const o=p.opts[i]||{},tag=esc(o.w||"")+" · "+esc(o.zh||"");
      if(i===p.answer){
        b.classList.add("right");
        b.innerHTML+='<span class="th-pick-tag ok">'+tag+'</span>';
      }else if(i===idx){
        /* 把你点错的那张也标出来是什么。你本来就在猜，
           顺手把猜错的那个也认识了 —— 这是白捡的一次学习。 */
        b.classList.add("wrong");
        b.innerHTML+='<span class="th-pick-tag bad">'+tag+'</span>';
      }else b.classList.add("dim");
      b.classList.add("locked");
    });
    const fb=document.getElementById("thFeedback");
    const kind=lessonMode();       /* learn / listen / zhpick 共用这套判定 */
    if(ok){
      mark(it,kind,true);run.ok++;soundCue("ok");
      if(fb){fb.className="th-feedback ok";fb.textContent="✓ "+it.w+" · "+it.zh}
    }else{
      mark(it,kind,false);run.bad++;soundCue("bad");requeue(it);
      if(fb){fb.className="th-feedback bad";fb.textContent="是这个："+it.w+" · "+it.zh}
    }
    const ans=screen.querySelector(".th-answer");if(ans)ans.classList.add("show");
    speakAt(it.w,.72);
    holdOn();
  }
  function ensureColo(it){
    /* 从这个词的搭配里随机挑一条，随机遮住动词或名词那一半。
       colo 的结构是 [动词/搭配前半, 名词/后半, 中文]。 */
    const k="C:"+key(it);if(run.colo&&run.colo.key===k)return;
    const list=(it.colo||[]).filter(c=>c[0]&&c[1]);
    if(!list.length){run.colo={key:k,empty:true};return}
    const c=list[(Math.random()*list.length)|0];
    const hideFirst=Math.random()<.5;
    run.colo={key:k,empty:false,pair:c,hideFirst,
              answer:(hideFirst?c[0]:c[1]).trim(),
              shown:(hideFirst?c[1]:c[0]).trim(),zh:c[2]||"",typed:""};
  }
  function checkColo(val){
    if(!run||run.locked)return;
    const it=current(),c=run.colo,fb=document.getElementById("thFeedback");
    if(!it||!c||c.empty||!fb)return;
    const norm=s=>String(s||"").toLowerCase().replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();
    if(!norm(val)){fb.className="th-feedback bad";fb.textContent="先写点什么。";return}
    if(norm(val)===norm(c.answer)){
      mark(it,"colo",true);run.ok++;soundCue("ok");
      fb.className="th-feedback ok";
      fb.textContent="✓ "+(c.hideFirst?c.pair[0]+" "+c.pair[1]:c.pair[0]+" "+c.pair[1]);
      screen.querySelector(".th-answer").classList.add("show");
      speakAt(c.pair[0]+" "+c.pair[1],.78);
      holdOn();
    }else{
      mark(it,"colo",false);run.bad++;soundCue("bad");requeue(it);
      fb.className="th-feedback bad";
      fb.textContent="不是这个说法。正确是："+c.pair[0]+" "+c.pair[1];
      holdOn();
    }
  }
  function ensureMask(it){
    const k=key(it);if(run.mask&&run.mask.key===k)return;
    const chars=[...String(it.w).toLowerCase()],letters=chars.map((c,i)=>/[a-z]/.test(c)?i:-1).filter(i=>i>=0);let hidden=letters.filter((_,i)=>i%2===1);
    if(!hidden.length&&letters.length)hidden=[letters[letters.length-1]];
    run.mask={key:k,chars,hidden,typed:"",hints:0};
  }
  function renderMask(){
    const m=run.mask,box=document.getElementById("thMask");if(!m||!box)return;
    box.innerHTML=m.chars.map((c,i)=>{if(c===" ")return '<span class="th-mask-char space"></span>';const n=m.hidden.indexOf(i),v=n>=0?(m.typed[n]||"_"):c;return '<span class="th-mask-char '+(n>=0&&!m.typed[n]?'blank':'')+'">'+esc(v)+'</span>'}).join("");
    const note=document.getElementById("thMaskNote");if(note)note.textContent="需要补全 "+m.hidden.length+" 个字母 · 已输入 "+Math.min(m.typed.length,m.hidden.length)+" 个 · 提示 "+m.hints+"/3";
  }
  function expectedMissing(m){return m.hidden.map(i=>m.chars[i]).join("")}
  function checkComplete(){
    if(!run||run.locked)return;
    const it=current(),m=run.mask,fb=document.getElementById("thFeedback"),input=document.getElementById("thCompleteInput");if(!it||!m||!fb||!input)return;
    const ok=m.typed===expectedMissing(m);
    if(ok){mark(it,"complete",true,{hintCount:m.hints});run.ok++;soundCue("ok");fb.className="th-feedback ok";fb.textContent="✓ 补全正确："+it.w;screen.querySelector(".th-answer").classList.add("show");speakAt(it.w,.74);holdOn()}
    else{mark(it,"complete",false);run.bad++;soundCue("bad");requeue(it);fb.className="th-feedback bad";fb.textContent="还不正确。完整单词是："+it.w;screen.querySelector(".th-answer").classList.add("show");m.typed="";input.value="";renderMask();input.focus()}
  }
  function giveCompleteHint(){
    const m=run.mask,input=document.getElementById("thCompleteInput");if(!m||!input)return;if(m.hints>=3){toast("这个词已经提示三次");return}
    const expected=expectedMissing(m);if(m.typed.length>=expected.length)return;m.typed+=expected[m.typed.length];m.hints++;input.value=m.typed;S.themeStats.hints=(S.themeStats.hints|0)+1;save();renderMask();input.focus();
  }
  function lessonMode(){
    const mode=rawLessonMode();
    return current()?.imageNeedsReview&&['learn','listen','recall'].includes(mode)?'zhpick':mode;
  }
  function rawLessonMode(){
    if(run.mode==="adaptive"){
      /* 每个词按自己的档位出题；同一个词在同一轮里题型固定（用 i 做种子的一部分，
         这样答错重排到队尾时会换一道，不会连着出同一题）。 */
      const it=current();if(!it)return "spell";
      if(!run._ex)run._ex={};
      const k=key(it)+":"+run.i;
      if(!run._ex[k])run._ex[k]=exerciseFor(it, seedOf(k));
      return run._ex[k];
    }
    return run.mode==="guided"?run.phase:
      run.mode==="daily"?(current()&&current()._exercise||"spell"):run.mode}
  function advanceLesson(){
    if(run.mode==="guided"){
      const next={learn:"assemble",assemble:"complete",complete:"spell"}[run.phase];
      if(next)run.phase=next;else{run.phase="learn";run.i++}
    }else run.i++;
    if(run.daily&&window.WORDTIDE_MEMORY)window.WORDTIDE_MEMORY.updateSession((run.dailyOffset|0)+run.i);
    run.build=null;run.mask=null;run.pick=null;run.colo=null;renderLesson();
  }
  function needsFirstLook(it){
    if(!run.daily&&run.mode!=="adaptive"&&run.mode!=="guided")return false;
    const p=prog(it);return !(p.ok>0||p.learn>0||p.spell>0||p.assemble>0||p.complete>0);
  }
  function firstLookInline(it){
    const ex=it.ex&&it.ex[0]||[],sy=String(it.sy||'');
    return '<div class="th-learning-inline"><div class="th-first-label">第一次认识 · 可以看着英文学习</div><h2 class="th-first-word">'+esc(it.w)+'</h2>'
      +(sy&&sy!==it.w?'<div class="th-first-parts">'+esc(sy)+'</div>':'')
      +'<div class="th-actions"><button id="thFirstHear">听单词</button><button id="thFirstSlow">慢速再听</button></div>'
      +(ex[0]?'<details class="th-inline-example"><summary>展开例句</summary><b>'+esc(ex[0])+'</b><p>'+esc(ex[1]||'')+'</p><button id="thFirstSentence">听例句</button></details>':'')+'</div>';
  }
  function wireFirstLook(it){
    const hear=document.getElementById('thFirstHear'),slow=document.getElementById('thFirstSlow'),sentence=document.getElementById('thFirstSentence');
    if(hear)hear.onclick=()=>speakAt(it.w,.82);
    if(slow)slow.onclick=()=>speakAt(it.w,.62);
    if(sentence)sentence.onclick=()=>speakAt(it.ex[0][0],.78);
  }

  function renderLesson(){
    const it=current();if(!it){summary();return}const mode=lessonMode(),isLearn=mode==="learn",isRecall=mode==="recall",isSent=mode==="sentence",isColo=mode==="colo",isListen=mode==="listen",isZh=mode==="zhpick",isPick=mode==="learn"||isListen,isAssemble=mode==="assemble"||isSent,isComplete=mode==="complete",isSpell=mode==="spell"||mode==="mistakes";
    run.qStartedAt=Date.now();
    if(isAssemble)ensureBuild(it);if(isComplete)ensureMask(it);if(isColo)ensureColo(it);if(isPick||isZh)ensurePick(it);
    let right="";   /* 答案面板挪到题目下面，见本函数末尾的 shell() */
    if(isPick){
      const p=run.pick,exzh=(it.ex&&it.ex[0]&&it.ex[0][1])||"";
      right+= (isListen
        ? '<h2 class="th-build-title">🔊 听一遍</h2>'
          +'<p class="th-build-sub">听到的是哪一个？听不清就再点一次喇叭。</p>'
          +'<div class="th-actions" style="margin-bottom:10px">'
          +'<button class="th-main" id="thListenAgain">🔊 再听一遍</button></div>'
        : '<h2 class="th-build-title">'+esc(it.zh)+'</h2>'
          +(exzh?'<p class="th-pick-ex">「'+esc(exzh)+'」</p>':'')
          +'<p class="th-build-sub">四张图里，哪一张是这个意思？</p>')
        +'<div class="th-pick-grid" id="thPickGrid">'
        + p.opts.map((o,i)=>'<button class="th-pick" data-pick="'+i+'">'
            +'<img src="'+o.img+'" alt="" loading="lazy"></button>').join("")
        +'</div><div class="th-feedback" id="thFeedback"></div>';
    }
    if(isRecall)right+='<div id="thRecallAsk"><h3>先在心里说出英文</h3><p>想好以后再翻开答案。</p><div class="th-actions"><button id="thReveal">翻开答案</button></div></div><div class="th-actions" id="thRecallGrade" style="display:none"><button id="thForgot">没想起</button><button id="thRemember" class="th-main">想起来了</button><button id="thHear">🔊 听发音</button></div>';
    if(isAssemble)right+='<h2 class="th-build-title">'+esc(isSent?((it.ex&&it.ex[0]&&it.ex[0][1])||it.zh):it.zh)+'</h2>'+'<p class="th-build-sub">'+(isSent?'把意群按正确顺序拼成完整的句子。'+'意群是说话时成块出的单位，不是一个词一个词蹦。':assemblyInstruction())+'</p><div class="th-built empty" id="thBuilt"></div><div class="th-tiles" id="thTiles"></div><div class="th-feedback" id="thFeedback"></div><div class="th-actions"><button id="thHear">🔊 听发音</button><button id="thBuildReset">重新排列</button></div><p class="th-tip">点下面的块往上放，点上面的块退回来。拼满自动判。</p>';
    if(isComplete)right+='<h2 class="th-build-title">'+esc(it.zh)+'</h2><p class="th-build-sub">只输入下划线缺少的字母，按从左到右的顺序补全。</p><div class="th-mask" id="thMask"></div><div class="th-mask-note" id="thMaskNote"></div><input class="th-spell-input" id="thCompleteInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="只输入缺少的字母"><div class="th-feedback" id="thFeedback"></div><div class="th-actions"><button id="thHear">🔊 听发音</button><button id="thCompleteHint">提示一个字母</button><button class="th-main" id="thCompleteCheck">检查补全</button></div>';
    if(isSpell)right+='<h2 class="th-build-title">'+esc(it.zh)+'</h2>'
      /* 照片是歧义的：一张锤子的图可以是 hammer / tool / nail / hit。
         中文释义才是唯一确定的题面，照片只当辅助。 */
      +'<p class="th-build-sub">'+(it.img?'看着照片和中文，默写完整英文。':'根据中文默写完整英文。')+'</p><input class="th-spell-input" id="thInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入完整英文后按回车"><div class="th-feedback" id="thFeedback"></div><div class="th-tip">这里不再显示词块和缺字提示；答错会在本轮末尾重新出现。</div><div class="th-actions"><button id="thHear">🔊 听提示</button><button class="th-main" id="thCheck">检查默写</button></div>';
    if(isZh){
      const p=run.pick,exzh=(it.ex&&it.ex[0]&&it.ex[0][1])||"";
      right+='<h2 class="th-build-title">'+esc(it.zh)+'</h2>'
        +(exzh?'<p class="th-pick-ex">「'+esc(exzh)+'」</p>':'')
        +'<p class="th-build-sub">哪个英文词是这个意思？</p>'
        +'<div class="th-word-grid" id="thPickGrid">'
        + p.opts.map((o,i)=>'<button class="th-wordopt" data-pick="'+i+'">'
            +esc(o.w)+'</button>').join("")
        +'</div><div class="th-feedback" id="thFeedback"></div>';
    }
    if(isColo){
      const c=run.colo;
      right+= c.empty
        ? '<h3>这个词还没有配搭配</h3><div class="th-actions"><button class="th-main" id="thColoSkip">跳过 →</button></div>'
        : '<h2 class="th-build-title">'+esc(c.zh)+'</h2>'
          +'<p class="th-build-sub">英语里这两个词是固定搭在一起的。补上缺的那半边。</p>'
          +'<div class="th-colo-line">'+(c.hideFirst
              ? '<span class="th-colo-blank">?</span> <b>'+esc(c.shown)+'</b>'
              : '<b>'+esc(c.shown)+'</b> <span class="th-colo-blank">?</span>')+'</div>'
          +'<input class="th-spell-input" id="thColoInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="'+(c.hideFirst?'补前面那个词':'补后面那部分')+'">'
          +'<div class="th-feedback" id="thFeedback"></div>'
          +'<div class="th-actions"><button id="thHear">🔊 听发音</button><button class="th-main" id="thColoCheck">检查</button></div>';
    }
    const firstLook=(isLearn||isZh)&&needsFirstLook(it);
    if(firstLook)right=firstLookInline(it)+right.replace('四张图里，哪一张是这个意思？','先听读英文，再选出对应的图片。');
    const title=firstLook?"认识并练习":isListen?"听音选义":isZh?"中文选词":isPick?"看图选义":isRecall?"图片回忆":isSent?"句子拼写":isColo?"词语搭配":isAssemble?"词块组装":isComplete?"补全空缺":"最终默写",label=isListen?'听音':isZh?'选词':isLearn?'认识':isSent?'拼句':isColo?'搭配':isAssemble?'组装':isComplete?'补全':'默写';
    /* 看图选义 / 中文选词没有照片（那张大图就是答案）。不加 th-solo 的话，
       内容会掉进两列网格的第一列里，右边空一半 —— 就是排版难看的根源。 */
    const solo=isPick||isZh;
    shell(title,'<div class="th-lesson-card'+(solo?' th-solo':'')+'">'
      +(solo?'':visual(it,label))
      +'<div class="th-quiz">'+right+info(it,true)
      +'<div class="th-goon" id="thGoOn"></div></div></div>');
    wireFirstLook(it);
    const hear=document.getElementById('thHear');if(hear)hear.onclick=()=>{const sentence=it.ex?.[0]?.[0]||it.w;if(window.WT_AUDIO)WT_AUDIO.sequence([it.w,sentence],.78);else speakAt(it.w,.72)};
    if(isPick||isZh){
      document.getElementById("thPickGrid").querySelectorAll("[data-pick]").forEach(b=>{
        b.onclick=()=>checkPick(Number(b.getAttribute("data-pick")))});
      if(isListen){
        /* 进来就先放一遍，别让人干等着去找喇叭 */
        speakAt(it.w,.78);
        const again=document.getElementById("thListenAgain");
        if(again)again.onclick=()=>speakAt(it.w,.72);
      }
    }
    if(isRecall){document.getElementById("thReveal").onclick=()=>{screen.querySelector(".th-answer").classList.add("show");document.getElementById("thRecallAsk").style.display="none";document.getElementById("thRecallGrade").style.display="flex"};document.getElementById("thForgot").onclick=()=>gradeRecall(false);document.getElementById("thRemember").onclick=()=>gradeRecall(true)}
    if(isAssemble){renderBuildBoard();document.getElementById("thBuildReset").onclick=()=>{if(run.locked)return;run.build.selected=[];run.build.order=shuffle(run.build.order);renderBuildBoard()};}
    if(isComplete){renderMask();const input=document.getElementById("thCompleteInput");input.oninput=()=>{input.value=input.value.toLowerCase().replace(/[^a-z]/g,"").slice(0,run.mask.hidden.length);run.mask.typed=input.value;renderMask()};input.onkeydown=e=>{if(e.key==="Enter")checkComplete()};document.getElementById("thCompleteHint").onclick=giveCompleteHint;document.getElementById("thCompleteCheck").onclick=checkComplete;setTimeout(()=>input.focus(),50)}
    if(isColo){
      const c=run.colo;
      if(c.empty){document.getElementById("thColoSkip").onclick=()=>{run.ok++;advanceLesson()}}
      else{
        const inp=document.getElementById("thColoInput");
        document.getElementById("thColoCheck").onclick=()=>checkColo(inp.value);
        inp.onkeydown=e=>{if(e.key==="Enter")checkColo(inp.value)};
        setTimeout(()=>inp.focus(),50);
      }
    }
    if(isSpell){const input=document.getElementById("thInput"),check=document.getElementById("thCheck");check.onclick=()=>checkSpell(input.value);input.onkeydown=e=>{if(e.key==="Enter")checkSpell(input.value)};setTimeout(()=>input.focus(),50)}
  }
  function gradeRecall(ok){const it=current();mark(it,"recall",ok);soundCue(ok?"ok":"bad");if(ok)run.ok++;else{run.bad++;requeue(it)}advanceLesson()}
  function norm(x){return String(x||"").toLowerCase().trim().replace(/[‐‑–—-]/g," ").replace(/\s+/g," ")}
  function requeue(it){const k=key(it);if((run.requeued[k]|0)<1){run.requeued[k]=1;run.queue.push(it);if(run.daily&&S.dailySession?.queue){S.dailySession.queue.push({themeId:itemSeaId(it),id:it.id,wordId:key(it),exercise:it._exercise||'spell',reason:'错词回练'});save()}}}
  function checkSpell(value){
    if(!run||run.locked||!current())return;
    const it=current(),ok=norm(value)===norm(it.w),fb=document.getElementById("thFeedback"),input=document.getElementById("thInput");if(!it||!fb)return;
    if(ok){mark(it,"spell",true);run.ok++;soundCue("ok");fb.className="th-feedback ok";fb.textContent="✓ 正确："+it.w;speakAt(it.w,.78);holdOn()}
    else{mark(it,"spell",false);run.bad++;soundCue("bad");requeue(it);fb.className="th-feedback bad";fb.textContent="正确答案："+it.w+"（再输入一次）";screen.querySelector(".th-answer").classList.add("show");speakAt(it.w,.68);input.value="";input.placeholder=it.w;input.focus()}
  }

  function renderMonster(){
    const it=current();if(!it||run.hp<=0||run.def<=0){summary();return}
    run.qStartedAt=Date.now();
    shell("海怪图片实战",'<div class="th-monster"><div class="th-monster-top"><div>海怪生命<div class="th-monster-hp"><i style="width:'+run.hp+'%"></i></div></div><div style="text-align:right">你的防线：'+"❤".repeat(run.def)+"♡".repeat(Math.max(0,3-run.def))+'</div></div><div class="th-monster-creature">🐙</div><div class="th-monster-q">'+(it.img?'<img loading="lazy" decoding="async" src="'+it.img+'" alt="工具照片">':'<div style="font-size:76px">'+it.icon+'</div>')+'<div><b>输入照片中的英文，击退海怪</b></div><input id="thMonsterInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="完整拼写"><div class="th-monster-log" id="thMonsterLog"></div><div class="th-actions" style="justify-content:center"><button id="thMonsterHear">🔊 听一下</button><button class="th-main" id="thMonsterHit">攻击</button></div></div></div>');
    const input=document.getElementById("thMonsterInput");document.getElementById("thMonsterHear").onclick=()=>speakAt(it.w,.72);document.getElementById("thMonsterHit").onclick=()=>hitMonster(input.value);input.onkeydown=e=>{if(e.key==="Enter")hitMonster(input.value)};setTimeout(()=>input.focus(),50)
  }
  function hitMonster(v){
    if(!run||run.locked||!current())return;
    const it=current(),ok=norm(v)===norm(it.w),log=document.getElementById("thMonsterLog");
    if(ok){mark(it,"monster",true);run.ok++;soundCue("ok");run.hp=Math.max(0,run.hp-14);log.textContent="⚡ 命中！";speakAt(it.w,.82);advanceAfter(()=>{run.i++;renderMonster()},520)}
    else{mark(it,"monster",false);run.bad++;soundCue("bad");run.def--;requeue(it);log.textContent="防线受损。正确答案："+it.w;speakAt(it.w,.68);advanceAfter(()=>{run.i++;renderMonster()},1050)}
  }

  function renderEcho(){
    const it=current();if(!it){summary();return}const ex=(it.ex&&it.ex[(run.i)%it.ex.length])||["This is "+it.w+".","这是“"+it.zh+"”。"],chunks=it.chunks&&it.chunks.length?it.chunks:[ex[0]];
    run.qStartedAt=Date.now();
    shell(sea().full?"水母回声跟读":"快速听读",'<div class="th-echo-card"><div class="th-echo-jelly">🪼</div><div class="th-kicker">先听整句 → 看分块 → 跟读一遍</div><div class="th-echo-sentence">'+esc(ex[0])+'</div><div class="th-echo-zh">'+esc(ex[1])+'</div><div class="th-chunks">'+chunks.map((x,i)=>'<span class="th-chunk" data-chunk="'+i+'">'+esc(x)+'</span>').join("")+'</div><div class="th-speed"><button data-rate=".62">慢速</button><button data-rate=".78">标准</button><button data-rate=".92">自然</button></div><div class="th-actions" style="justify-content:center"><button id="thEchoListen">▶ 听整句</button><button id="thEchoChunk">分块带读</button><button id="thEchoAgain">我已跟读，再来一次</button><button class="th-echo" id="thEchoDone">完成这一句 →</button></div><p class="th-tip">这一版先用“听—看—跟读—自我确认”，不强制录音评分，避免网络或麦克风造成上课卡顿。</p></div>');
    screen.querySelectorAll("[data-rate]").forEach(b=>{if(Math.abs(Number(b.dataset.rate)-run.rate)<.03)b.classList.add("on");b.onclick=()=>{run.rate=Number(b.dataset.rate);S.themeEchoRate=run.rate;save();renderEcho()}});
    document.getElementById("thEchoListen").onclick=()=>playEcho(ex[0],chunks,false);document.getElementById("thEchoChunk").onclick=()=>playEcho(ex[0],chunks,true);document.getElementById("thEchoAgain").onclick=()=>{playEcho(ex[0],chunks,false)};document.getElementById("thEchoDone").onclick=()=>{mark(it,"echo",true);run.ok++;soundCue("ok");run.i++;renderEcho()};echoTimer=setTimeout(()=>{if(current()===it&&run?.mode==='echo')playEcho(ex[0],chunks,false)},180)
  }
  function playEcho(sentence,chunks,chunked){
    if(!run||run.mode!=='echo')return;
    if(window.WT_AUDIO){clearTimeout(echoTimer);WT_AUDIO.sequence(chunked?chunks:[sentence],run.rate);return;}
    clearTimeout(echoTimer);const els=[...screen.querySelectorAll(".th-chunk")];els.forEach(x=>x.classList.remove("on"));
    if(!chunked){speakAt(sentence,run.rate);let i=0;const tick=()=>{els.forEach(x=>x.classList.remove("on"));if(i<els.length){els[i].classList.add("on");i++;echoTimer=setTimeout(tick,Math.max(550,1100/run.rate))}};tick();return}
    let i=0;const next=()=>{els.forEach(x=>x.classList.remove("on"));if(i>=chunks.length)return;els[i].classList.add("on");speakAt(chunks[i],Math.max(.55,run.rate-.08));i++;echoTimer=setTimeout(next,Math.max(1050,1500/run.rate))};next()
  }

  function fmtDur(ms){
    const s=Math.max(0,Math.round(ms/1000));
    return s<60?(s+" 秒"):(Math.floor(s/60)+" 分 "+(s%60)+" 秒");
  }
  function summaryHTML(rate,nextMode){
    const total=run.ok+run.bad,done=run.queue.length;
    const R=52,C=2*Math.PI*R,off=C*(1-(done?Math.min(1,run.ok/done):0));
    const miss=(run.missed||[]);
    return '<div class="th-shell"><section class="th-panel th-summary">'
      +'<div class="th-sum-hero">'
      +  '<div class="th-sum-ring"><svg viewBox="0 0 120 120" aria-hidden="true">'
      +    '<circle cx="60" cy="60" r="'+R+'" class="th-ring-bg"></circle>'
      +    '<circle cx="60" cy="60" r="'+R+'" class="th-ring-fg" '
      +      'style="stroke-dasharray:'+C.toFixed(1)+';stroke-dashoffset:'+off.toFixed(1)+'"></circle>'
      +  '</svg><div class="th-sum-num"><b>'+run.ok+'</b><span>/ '+done+'</span>'
      +  '<em>用时 '+fmtDur(Date.now()-(run.t0||Date.now()))+'</em></div></div>'
      +'</div>'
      +'<div class="th-sum-stats">'
      +  '<div><span>答对</span><b>'+run.ok+'</b></div>'
      +  '<div><span>答错</span><b class="miss">'+run.bad+'</b></div>'
      /* 升档只在自适应模式里有意义 —— 单项练习不走阶梯，
         显示「升档 0」会让人以为白练了。那种情况下报题数。 */
      +  (run.mode==="adaptive"
          ? '<div><span>升档</span><b>'+(run.lvUps|0)+'</b></div>'
          : '<div><span>本轮</span><b>'+done+'</b></div>')
      +'</div>'
      +(miss.length
        ? '<h3 class="th-sum-h3">这几个再看一眼</h3><div class="th-sum-miss">'
          + miss.map((it,i)=>'<div class="th-miss-row">'
              +(it.img?'<img src="'+it.img+'" alt="">':'<span class="th-miss-icon">'+(it.icon||"🌊")+'</span>')
              +'<div><b>'+esc(it.w)+'</b><small>'+esc(it.sy||"")+'</small><span>'+esc(it.zh)+'</span></div>'
              +'<button class="th-miss-redo" id="thRedo'+i+'">重练</button></div>').join("")
          + '</div>'
        : '<p class="th-sum-clean">这一轮一个都没错。</p>')
      +'<div class="th-sum-nut"><span>本轮 +0 养分</span>'
      +  '<small>养分只从「今日潮汐」里到期的复习来 —— 主题练习记的是掌握度，不产生养分。</small></div>'
      +'<div class="th-actions th-sum-actions">'
      +  '<button class="th-main" id="thSummaryAgain">再来一局</button>'
      +  '<button id="thSummaryHub">回主题大厅</button>'
      +  (nextMode?'<button id="thSummaryNext">进入下一环</button>':'')
      +'</div></section></div>';
  }
  function summary(){
    clearTimeout(echoTimer);const total=run.ok+run.bad,rate=total?Math.round(run.ok/total*100):100,mode=run.mode;
    if(run.daily){if(window.WORDTIDE_MEMORY)window.WORDTIDE_MEMORY.completeSession({ok:run.ok,bad:run.bad});screen.innerHTML='<div class="th-shell"><section class="th-panel th-summary"><div style="font-size:72px">🌊</div><h2>今日潮汐完成</h2><p>本轮记录已经保存；需要较早复习的词会自动回到下一次计划。</p><div class="th-summary-grid"><div><b>'+run.ok+'</b>正确步骤</div><div><b>'+run.bad+'</b>错误</div><div><b>'+rate+'%</b>正确率</div><div><b>'+run.queue.length+'</b>本轮题数</div></div><div class="th-actions" style="justify-content:center"><button id="thDailyHome">回今日潮汐</button><button class="th-main" id="thDailyAgain">再生成一轮</button></div></section></div>';document.getElementById("thDailyHome").onclick=()=>window.WORDTIDE_MEMORY.openDaily();document.getElementById("thDailyAgain").onclick=()=>window.WORDTIDE_MEMORY.startPlan(run.dailyPlan);updateHome();return}
    const chain=sea().full?{adaptive:"",guided:"monster",learn:"assemble",assemble:"complete",complete:"spell",spell:"monster",monster:"sentence",sentence:"colo",colo:"echo",mistakes:"assemble",echo:"guided"}:{guided:"echo",learn:"assemble",assemble:"complete",complete:"spell",spell:"sentence",sentence:"colo",colo:"echo",mistakes:"assemble",echo:"guided"},nextMode=chain[mode];
    screen.innerHTML=summaryHTML(rate,nextMode);
    document.getElementById("thSummaryHub").onclick=openHub;document.getElementById("thSummaryAgain").onclick=()=>start(mode);const next=document.getElementById("thSummaryNext");if(next)next.onclick=()=>start(nextMode);
    /* 每个错词后面那个「重练」：只练这一个词。结算页的价值不是汇报，是承接。 */
    (run.missed||[]).forEach((it,i)=>{const b=document.getElementById("thRedo"+i);
      if(b)b.onclick=()=>start("adaptive",it)});
    updateHome()
  }

  ensure();addHomeEntry();
  const oldRefresh=window.refreshHome||null;if(oldRefresh){window.refreshHome=function(){oldRefresh();if(!S.themeProg||!S.themeStats||!S.themeMistakes)ensure();updateHome()}}
  window.WORDTIDE_THEME={open:openHub,startDaily,seas:SEAS,coreTools:CORE_TOOLS,state:()=>({seaId,run})};
})();

