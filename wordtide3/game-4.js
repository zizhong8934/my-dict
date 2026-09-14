/* 内联自 phase3-engine.js */
(function(){
  "use strict";

  const VERSION=3,DAY=86400000,TEN_MIN=600000,MAX_EVENTS=240;
  const SKILL_KEYS=["recognize","assemble","complete","spell","listen","sentence","battle"];
  let catalogCache=null,screen=null;

  function safeObj(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function persist(){try{save()}catch(e){console.warn("第三阶段保存失败",e)}}
  function now(){return Date.now()}

  function catalog(){
    if(catalogCache)return catalogCache;
    const data=window.WORDTIDE_THEME_DATA||{},themes=data.themes||[],packs=data.packs||{};
    catalogCache=[];
    for(const theme of themes){for(const item of packs[theme.id]||[])catalogCache.push({wordId:theme.id+":"+item.id,themeId:theme.id,theme,item})}
    return catalogCache;
  }

  function blankState(ref){
    return {id:ref.wordId,status:"new",dueAt:0,intervalDays:0,difficulty:3,stability:0,lapses:0,seen:0,correct:0,wrong:0,hints:0,lastSeenAt:0,lastCorrectAt:0,skills:SKILL_KEYS.reduce((o,k)=>(o[k]=0,o),{}),recent:null,imported:false};
  }
  function normalizeState(st,ref){
    const d=blankState(ref);st=safeObj(st);for(const k in d)if(st[k]==null)st[k]=d[k];
    st.skills=safeObj(st.skills);for(const k of SKILL_KEYS)st.skills[k]=Math.max(0,Number(st.skills[k])||0);
    for(const k of ["dueAt","intervalDays","difficulty","stability","lapses","seen","correct","wrong","hints","lastSeenAt","lastCorrectAt"])st[k]=Math.max(0,Number(st[k])||0);
    if(!["new","learning","review","stable"].includes(st.status))st.status="new";
    st.id=ref.wordId;return st;
  }
  function themeScore(p){return Math.min(1,p.learn|0)+Math.min(1,p.assemble|0)+Math.min(1,p.complete|0)+Math.min(2,p.spell|0)+Math.min(1,p.monster|0)+Math.min(1,p.echo|0)}
  function originalProgress(ref){
    const w=String(ref.item.w||"").toLowerCase().trim(),construction=/^(tools|materials|commands)$/.test(ref.themeId),keys=construction?["u:"+ref.wordId,"s:"+w,"g:"+w]:["u:"+ref.wordId,"g:"+w,"s:"+w];
    for(const k of keys)if(S.prog&&S.prog[k])return S.prog[k];return null;
  }
  function importLegacy(ref,st){
    const tp=S.themeProg&&S.themeProg[ref.wordId],op=originalProgress(ref),mist=S.themeMistakes&&S.themeMistakes[ref.wordId]|0,score=tp?themeScore(tp):0,lv=op&&op.lv|0,last=Math.max(tp&&tp.last|0,op&&op.last|0,0),tpActive=!!(tp&&(score||(tp.ok|0)||(tp.bad|0)||last)),opActive=!!(op&&(lv||(op.ok|0)||(op.bad|0)||(op.due|0)||(op.iv|0)));
    if(!tpActive&&!opActive&&!mist)return st;
    if(tp){
      st.skills.recognize=Math.max(st.skills.recognize,tp.learn|0,tp.recall|0);
      st.skills.assemble=Math.max(st.skills.assemble,tp.assemble|0);
      st.skills.complete=Math.max(st.skills.complete,tp.complete|0);
      st.skills.spell=Math.max(st.skills.spell,tp.spell|0);
      st.skills.battle=Math.max(st.skills.battle,tp.monster|0);
      st.skills.sentence=Math.max(st.skills.sentence,tp.echo|0);
      st.correct=Math.max(st.correct,tp.ok|0);st.wrong=Math.max(st.wrong,tp.bad|0);
    }
    st.lapses=Math.max(st.lapses,mist,tp&&tp.bad|0,op&&op.bad|0);
    st.lastSeenAt=Math.max(st.lastSeenAt,last);
    if(lv>=4||score>=7){st.status="stable";st.intervalDays=Math.max(st.intervalDays,Number(op&&op.iv)||21);st.stability=Math.max(st.stability,3)}
    else if(lv>=2||score>=4){st.status="review";st.intervalDays=Math.max(st.intervalDays,Number(op&&op.iv)||1);st.stability=Math.max(st.stability,1)}
    else{st.status="learning";st.intervalDays=0}
    st.dueAt=Math.max(st.dueAt,Number(op&&op.due)||0)||(last?last+(st.status==="stable"?7*DAY:st.status==="review"?DAY:TEN_MIN):now());
    st.seen=Math.max(st.seen,st.correct+st.wrong,1);st.imported=true;return st;
  }
  function ensure(){
    S.wordState=safeObj(S.wordState);S.memoryEvents=Array.isArray(S.memoryEvents)?S.memoryEvents:[];S.dailyHistory=Array.isArray(S.dailyHistory)?S.dailyHistory:[];
    S.memoryStats=safeObj(S.memoryStats);S.dailySession=safeObj(S.dailySession);
    for(const ref of catalog()){
      let st=normalizeState(S.wordState[ref.wordId],ref);
      // 第三阶段最初测试版曾把主题模块自动创建的全零占位记录误认为真实学习记录；仅修复这类没有任何答题事件的草稿状态。
      if(st.imported&&st.seen===0&&!st.correct&&!st.wrong&&!st.lastSeenAt)st=blankState(ref);
      if(!S.wordState[ref.wordId])st=importLegacy(ref,st);
      S.wordState[ref.wordId]=st;
    }
    S.wordStateVersion=VERSION;persist();
  }
  function refFor(wordId){return catalog().find(x=>x.wordId===wordId)||null}
  function getState(wordId){const ref=refFor(wordId);if(!ref)return null;return S.wordState[wordId]=normalizeState(S.wordState[wordId],ref)}
  function skillFor(mode){return ({learn:"recognize",recall:"recognize",assemble:"assemble",complete:"complete",spell:"spell",mistakes:"spell",monster:"battle",battle:"battle",echo:"sentence",listen:"listen",sentence:"sentence"})[mode]||"recognize"}
  function nextInterval(days){if(days<1)return 1;if(days<3)return 3;if(days<7)return 7;if(days<14)return 14;if(days<30)return 30;if(days<60)return 60;if(days<120)return 120;return Math.min(240,Math.round(days*1.7))}
  function isProductive(skill){return skill==="spell"||skill==="listen"||skill==="sentence"||skill==="battle"}

  function recordAnswer(evt){
    evt=evt||{};const ref=refFor(evt.wordId);if(!ref)return null;const st=getState(evt.wordId),t=now(),skill=skillFor(evt.mode),correct=!!evt.correct,hints=Math.max(0,evt.hintCount|0),responseMs=Math.max(0,evt.responseMs|0);
    st.seen++;st.lastSeenAt=t;st.hints+=hints;
    if(correct){
      st.correct++;st.lastCorrectAt=t;st.skills[skill]=Math.min(5,(st.skills[skill]||0)+1);
      if(!isProductive(skill)){
        if(st.status==="new")st.status="learning";
        if(!st.dueAt||st.dueAt<t)st.dueAt=t+TEN_MIN;
      }else if(hints>=3){
        st.status=st.intervalDays?"review":"learning";st.dueAt=t+TEN_MIN;
      }else if(hints>0){
        st.status=st.intervalDays>=14?"stable":"review";st.dueAt=t+Math.min(DAY,Math.max(TEN_MIN,(st.intervalDays||1)*DAY*.35));
      }else{
        st.intervalDays=nextInterval(st.intervalDays);st.stability=Math.min(10,st.stability+1);st.status=st.intervalDays>=14?"stable":"review";st.dueAt=t+st.intervalDays*DAY;
      }
      st.difficulty=Math.max(1,st.difficulty-(hints?0:.08));
    }else{
      st.wrong++;st.lapses++;st.skills[skill]=Math.max(0,(st.skills[skill]||0)-1);st.difficulty=Math.min(5,st.difficulty+.25);st.intervalDays=Math.max(0,Math.floor(st.intervalDays*.45));st.status=st.intervalDays?"review":"learning";st.dueAt=t+TEN_MIN;
    }
    st.recent={at:t,mode:evt.mode||"unknown",skill,correct,hintCount:hints,responseMs};
    const event={wordId:evt.wordId,themeId:ref.themeId,at:t,mode:evt.mode||"unknown",skill,correct,hintCount:hints,responseMs,dueAt:st.dueAt,intervalDays:st.intervalDays};
    S.memoryEvents.push(event);if(S.memoryEvents.length>MAX_EVENTS)S.memoryEvents.splice(0,S.memoryEvents.length-MAX_EVENTS);
    S.memoryStats.answers=(S.memoryStats.answers|0)+1;if(correct)S.memoryStats.correct=(S.memoryStats.correct|0)+1;S.memoryStats.hints=(S.memoryStats.hints|0)+hints;
    persist();try{window.dispatchEvent(new CustomEvent("wordtide-memory-updated",{detail:event}))}catch(e){}return st;
  }
  function recordTheme(evt){return recordAnswer(evt)}
  function resolveOriginal(it){
    if(it&&it._wordId){const linked=refFor(it._wordId);if(linked)return linked}
    const w=String(it&&it.w||"").toLowerCase().trim(),matches=catalog().filter(x=>String(x.item.w||"").toLowerCase().trim()===w);if(!matches.length)return null;
    const preferred=matches.find(x=>x.themeId===S.themeSea);if(preferred)return preferred;
    const construction=S.deck==="s",pool=matches.filter(x=>/^(tools|materials|commands)$/.test(x.themeId)===construction);return pool[0]||matches[0];
  }
  function recordOriginal(it,correct,p){const ref=resolveOriginal(it);if(!ref)return null;return recordAnswer({wordId:ref.wordId,themeId:ref.themeId,item:ref.item,mode:"battle",correct:!!correct,hintCount:0,responseMs:0,originalLevel:p&&p.lv})}

  function exerciseFor(ref,st){
    if(st.status==="new"||st.skills.recognize<1)return "learn";
    if(st.skills.assemble<1)return "assemble";
    if(st.skills.complete<1)return "complete";
    if(st.skills.spell<1)return "spell";
    if(st.lapses>=2&&st.skills.complete<2)return "complete";
    return "spell";
  }
  function reasonFor(st,t){if(st.status==="new")return "今日新词";if(st.lapses>=2)return "薄弱词";if(st.dueAt<=t)return "到期复习";return "提前巩固"}
  function wordLength(ref){return String(ref&&ref.item&&ref.item.w||"").replace(/[^a-z]/gi,"").length}
  function newWordPriority(x){
    const life={home:3,food:3,shopping:3,commands:2,tools:1,materials:1}[x.ref.themeId]||0;
    const selected=x.ref.themeId===S.themeSea?5:0,len=wordLength(x.ref),easy=Math.max(0,10-len),long=Math.max(0,len-9);
    return selected*100+life*35+easy*10-long*18;
  }
  function buildDailyQueue(plan){
    plan=plan||"quick";const t=now(),all=catalog().map(ref=>({ref,st:getState(ref.wordId)})),due=all.filter(x=>x.st.status!=="new"&&x.st.dueAt<=t),fresh=all.filter(x=>x.st.status==="new"),soon=all.filter(x=>x.st.status!=="new"&&x.st.dueAt>t);
    due.sort((a,b)=>(b.st.lapses-a.st.lapses)||(a.st.dueAt-b.st.dueAt));soon.sort((a,b)=>a.st.dueAt-b.st.dueAt);
    const limit=plan==="standard"?20:plan==="review"?20:12,backlog=due.length,newCap=plan==="review"?0:backlog>=40?0:backlog>=20?2:plan==="standard"?6:4,out=[],used=new Set();
    function add(x){if(!x||used.has(x.ref.wordId)||out.length>=limit)return;used.add(x.ref.wordId);out.push({themeId:x.ref.themeId,id:x.ref.item.id,wordId:x.ref.wordId,exercise:exerciseFor(x.ref,x.st),reason:reasonFor(x.st,t)})}
    due.forEach(add);
    if(plan==="review"&&!out.length)soon.slice(0,limit).forEach(add);
    const preferred=fresh.sort((a,b)=>newWordPriority(b)-newWordPriority(a)||wordLength(a.ref)-wordLength(b.ref));preferred.slice(0,newCap).forEach(add);
    if(out.length<limit&&plan!=="review")soon.forEach(add);
    return {plan,queue:out,counts:{due:due.length,newWords:fresh.length,soon:soon.length,limit,newCap},estimateMinutes:Math.max(1,Math.round(out.length*.42))};
  }
  function buildBattleQueue(){
    const t=now(),all=catalog().map(ref=>({ref,st:getState(ref.wordId)})).filter(x=>x.st.status!=="new"&&(x.st.dueAt<=t||x.st.skills.spell>0||x.st.skills.battle>0));
    all.sort((a,b)=>(a.st.dueAt<=t?0:1)-(b.st.dueAt<=t?0:1)||(b.st.lapses-a.st.lapses)||(a.st.dueAt-b.st.dueAt));
    return all.slice(0,12).map(x=>({wordId:x.ref.wordId,themeId:x.ref.themeId,id:x.ref.item.id,battleLv:x.st.status==="stable"?3:x.st.skills.spell>0?2:1,reason:x.st.dueAt<=t?"到期实战":"巩固实战"}));
  }
  function startBattle(){
    const queue=buildBattleQueue();if(!queue.length){toast("先完成一些认识、补全或默写，再进入今日塔防");return false}
    S.pendingThemeBattle={id:"battle-"+now(),queue,createdAt:now()};persist();try{startGame();return true}catch(e){console.warn("今日塔防启动失败",e);toast("今日塔防暂时无法启动");return false}
  }
  function consumeBattleQueue(){
    const pending=S.pendingThemeBattle;if(!pending||!Array.isArray(pending.queue)||!pending.queue.length)return null;const out=[];
    for(const q of pending.queue){const ref=refFor(q.wordId);if(!ref)continue;out.push(Object.assign({},ref.item,{t:/^(tools|materials|commands)$/.test(ref.themeId)?1:3,kind:"w",_wordId:ref.wordId,_themeId:ref.themeId,_battleLv:q.battleLv|0,_dailyBattle:1}))}
    S.pendingThemeBattle=null;persist();return out.length?{queue:out,due:out.length,fresh:0,taking:0,throttled:false,early:0,themeBattle:true}:null;
  }
  function sessionUsable(){const s=S.dailySession;return s&&Array.isArray(s.queue)&&!s.completed&&s.index<s.queue.length}
  function startPlan(plan){
    const built=buildDailyQueue(plan);if(!built.queue.length){toast(plan==="review"?"目前没有需要复习的词":"今天暂时没有可学习的词");return false}
    S.dailySession={id:"daily-"+now(),plan:built.plan,queue:built.queue,index:0,startedAt:now(),updatedAt:now(),completed:false,estimateMinutes:built.estimateMinutes};persist();
    return window.WORDTIDE_THEME&&window.WORDTIDE_THEME.startDaily(built.queue,{plan:built.plan,offset:0});
  }
  function resumeSession(){if(!sessionUsable())return false;const s=S.dailySession,remaining=s.queue.slice(s.index);return window.WORDTIDE_THEME&&window.WORDTIDE_THEME.startDaily(remaining,{plan:s.plan,offset:s.index})}
  function updateSession(index){if(!S.dailySession||S.dailySession.completed)return;S.dailySession.index=Math.max(S.dailySession.index|0,index|0);S.dailySession.updatedAt=now();persist()}
  function completeSession(result){
    if(!S.dailySession)return;S.dailySession.index=S.dailySession.queue&&S.dailySession.queue.length||0;S.dailySession.completed=true;S.dailySession.completedAt=now();S.dailySession.result=result||{};
    S.dailyHistory.push({id:S.dailySession.id,plan:S.dailySession.plan,startedAt:S.dailySession.startedAt,completedAt:S.dailySession.completedAt,count:S.dailySession.index,ok:result&&result.ok|0,bad:result&&result.bad|0});if(S.dailyHistory.length>60)S.dailyHistory.splice(0,S.dailyHistory.length-60);persist();
  }

  function stats(){
    const t=now(),states=catalog().map(x=>getState(x.wordId)),due=states.filter(x=>x.status!=="new"&&x.dueAt<=t).length,stable=states.filter(x=>x.status==="stable").length,learning=states.filter(x=>x.status==="learning"||x.status==="review").length,fresh=states.filter(x=>x.status==="new").length,weak=states.filter(x=>x.lapses>=2).length;
    const recent=S.memoryEvents.filter(x=>x.at>=t-7*DAY),delayed=recent.filter(x=>x.mode==="spell"||x.mode==="battle"),unhinted=delayed.filter(x=>x.correct&&!x.hintCount).length;
    return {total:states.length,due,stable,learning,fresh,weak,unhintedRate:delayed.length?Math.round(unhinted/delayed.length*100):0};
  }
  function labelPlan(p){return p==="standard"?"标准计划":p==="review"?"只复习":"快速计划"}
  function renderDaily(){
    const s=stats(),quick=buildDailyQueue("quick"),standard=buildDailyQueue("standard"),battle=buildBattleQueue(),resume=sessionUsable()?S.dailySession:null;
    screen.innerHTML='<div class="p3-shell"><div class="p3-head"><button class="sm" id="p3Back">← 首页</button><div><div class="p3-kicker">PHASE 3 · DAILY TIDE</div><h1>今日潮汐</h1><p>系统已经按到期时间、错误次数和学习阶段排好顺序。</p></div><div class="p3-due"><b>'+s.due+'</b><span>今日到期</span></div></div>'+
      (resume?'<section class="p3-resume"><div><b>上次还有 '+(resume.queue.length-resume.index)+' 题没有完成</b><span>'+labelPlan(resume.plan)+' · 已自动保存到第 '+resume.index+' 题</span></div><button class="pri" id="p3Resume">继续上次学习</button></section>':'')+
      '<div class="p3-stats"><div><b>'+s.due+'</b><span>到期复习</span></div><div><b>'+s.weak+'</b><span>薄弱词</span></div><div><b>'+s.learning+'</b><span>正在巩固</span></div><div><b>'+s.stable+'</b><span>稳定记忆</span></div></div>'+
      '<section class="p3-plan-grid"><article class="wt-focus-plan wt-quick"><div class="p3-plan-icon" aria-hidden="true">⚡</div><div class="wt-plan-label">课间轻练 · 少量新词</div><h2>快速学习</h2><p>最多 12 题，优先复习薄弱词，再学少量新词。每个词按熟悉程度安排练法。</p><div class="p3-plan-meta"><span>'+quick.queue.length+' 题</span><span>约 '+quick.estimateMinutes+' 分钟</span><span>新词最多 '+quick.counts.newCap+'</span></div><button class="pri" data-plan="quick">开始快速计划</button></article><article class="wt-focus-plan wt-standard"><div class="p3-plan-icon" aria-hidden="true">🌊</div><div class="wt-plan-label">课后巩固 · 新旧搭配</div><h2>标准学习</h2><p>最多 20 题，搭配到期复习、错词和新词。有更多时间时，集中巩固一轮。</p><div class="p3-plan-meta"><span>'+standard.queue.length+' 题</span><span>约 '+standard.estimateMinutes+' 分钟</span><span>新词最多 '+standard.counts.newCap+'</span></div><button class="pri" data-plan="standard">开始标准计划</button></article><article><div class="p3-plan-icon">🧭</div><h2>只清理复习</h2><p>不增加新词，只处理已经学习过且今天到期的内容。</p><div class="p3-plan-meta"><span>'+s.due+' 个到期</span><span>不加新词</span></div><button data-plan="review">只复习</button></article></section>'+
      '<section class="p3-battle"><div><div class="p3-kicker">ORIGINAL TOWER DEFENSE</div><h2>今日词组进入原塔防</h2><p>'+(battle.length?'已经选出 '+battle.length+' 个学过或到期词；照片会作为题牌出现，结果写回同一份记忆状态。':'先完成一些主题学习，系统就会把合适的词送入原塔防。')+'</p></div><button class="pri" id="p3Battle" '+(battle.length?'':'disabled')+'>进入今日塔防</button></section>'+
      '<section class="p3-explain"><h2>为什么今天出现这些词？</h2><div><span><i class="due"></i>到期复习：已经接近遗忘时间</span><span><i class="weak"></i>薄弱词：近期答错或依赖提示</span><span><i class="fresh"></i>今日新词：复习量允许时少量加入</span></div><p>当天完成课程只算“已学习”；跨天独立答对后，才会逐步进入稳定记忆。</p></section></div>';
    document.getElementById("p3Back").onclick=()=>{showScreen("scHome");try{refreshHome()}catch(e){}};
    screen.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>startPlan(b.dataset.plan));const rb=document.getElementById("p3Resume");if(rb)rb.onclick=resumeSession;const bb=document.getElementById("p3Battle");if(bb&&!bb.disabled)bb.onclick=startBattle;
  }
  function openDaily(){showScreen("scDaily");renderDaily()}
  function addHomeCard(){
    const modes=document.querySelector("#scHome .modes");if(!modes||document.getElementById("modeDailyTide"))return;
    const s=stats(),el=document.createElement("div");el.className="mode p3-daily-cover";el.id="modeDailyTide";el.innerHTML='<div><div class="mtag">第三阶段 · 自动安排</div><div class="mname">今日潮汐</div><div class="mnum"><b id="p3HomeDue">'+s.due+'</b> 个到期词 · 预计 <span id="p3HomeMin">'+buildDailyQueue("quick").estimateMinutes+'</span> 分钟</div><small>复习、薄弱词和少量新词已经排好，点击一次直接开始。</small></div><button class="pri" id="btnDailyTide">继续今日学习</button>';
    modes.insertBefore(el,modes.firstChild);document.getElementById("btnDailyTide").onclick=openDaily;el.onclick=e=>{if(!e.target.closest("button"))openDaily()};
  }
  function updateHome(){const s=stats(),d=document.getElementById("p3HomeDue"),m=document.getElementById("p3HomeMin");if(d)d.textContent=s.due;if(m)m.textContent=quickMinutes()}
  // "大约几分钟"是个估数，没必要每次刷首页都把整个队列重算一遍。
  // 3 秒内复用上次结果；真正要准的地方（打开每日计划）走的是 renderDaily，不经这里。
  var _qmAt=-1e9,_qmVal=0;
  function quickMinutes(){var t=now();if(t-_qmAt<3000)return _qmVal;_qmAt=t;_qmVal=buildDailyQueue("quick").estimateMinutes;return _qmVal;}

  ensure();screen=document.createElement("div");screen.className="screen";screen.id="scDaily";document.body.appendChild(screen);addHomeCard();
  const oldRefresh=window.refreshHome||null;if(oldRefresh)window.refreshHome=function(){oldRefresh();if(!S.wordState||!Array.isArray(S.memoryEvents))ensure();updateHome()};
  window.addEventListener("wordtide-memory-updated",updateHome);
  window.WORDTIDE_MEMORY={version:VERSION,catalog,stats,getState,recordAnswer,recordTheme,recordOriginal,buildDailyQueue,buildBattleQueue,startPlan,startBattle,consumeBattleQueue,resumeSession,updateSession,completeSession,openDaily,renderDaily};
})();

