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
    const tp=S.themeProg&&S.themeProg[ref.wordId],op=originalProgress(ref),mist=S.themeMistakes&&S.themeMistakes[ref.wordId]|0,score=tp?themeScore(tp):0,lv=op&&op.lv|0,last=Math.max(Number(tp&&tp.last)||0,Number(op&&op.last)||0,0),tpActive=!!(tp&&(score||(tp.ok|0)||(tp.bad|0)||last)),opActive=!!(op&&(lv||(op.ok|0)||(op.bad|0)||(op.due|0)||(op.iv|0)));
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

  // A first encounter is exposure, never a scored answer.
  function recordExposure(wordId){
    const st=getState(wordId);if(!st)return;
    if(st.status==="new")st.status="learning";
    st.introducedAt=st.introducedAt||now();st.lastSeenAt=now();
    if(!st.dueAt)st.dueAt=now()+TEN_MIN;
    persist();
  }
  function learningQueue(refs,limit){
    const base=[];let cost=0;
    for(const ref of refs){
      const st=getState(ref.wordId),fresh=st&&st.status==="new",n=fresh?2:1;
      if(cost+n>limit)continue;
      base.push({...ref,exercise:fresh?"teach":ref.exercise});cost+=n;
    }
    const out=[],pending=[];
    while(base.length||pending.length){
      const ready=pending.findIndex(x=>x.after<=out.length);
      let next;
      if(base[0]?.exercise==="teach"&&out.at(-1)?.exercise!=="teach")next=base.shift();
      else if(ready>=0)next=pending.splice(ready,1)[0].ref;
      else if(base.length)next=base.shift();
      else next=pending.shift().ref;
      out.push(next);
      if(next.exercise==="teach")pending.push({after:out.length+2,ref:{...next,exercise:"zhpick",reason:"新词回忆"}});
    }
    return out;
  }
  function recordSupportedAnswer(evt,st,t,skill,hints){
    st.seen++;st.lastSeenAt=t;st.hints+=Math.max(1,hints);
    st.supported=(st.supported|0)+1;
    if(st.status==="new")st.status="learning";
    st.dueAt=t+TEN_MIN;
    st.recent={at:t,mode:evt.mode,skill,correct:true,independent:false,hintCount:Math.max(1,hints)};
    S.memoryEvents.push({...st.recent,wordId:evt.wordId,themeId:evt.themeId,dueAt:st.dueAt,intervalDays:st.intervalDays});
    if(S.memoryEvents.length>MAX_EVENTS)S.memoryEvents.splice(0,S.memoryEvents.length-MAX_EVENTS);
    S.memoryStats.answers=(S.memoryStats.answers|0)+1;
    S.memoryStats.supported=(S.memoryStats.supported|0)+1;
    S.memoryStats.hints=(S.memoryStats.hints|0)+Math.max(1,hints);
    persist();window.dispatchEvent(new CustomEvent("wordtide-memory-updated"));return st;
  }

  function recordAnswer(evt){
    evt=evt||{};const ref=refFor(evt.wordId);if(!ref)return null;const st=getState(evt.wordId),t=now(),skill=skillFor(evt.mode),correct=!!evt.correct,hints=Math.max(0,evt.hintCount|0),responseMs=Math.max(0,evt.responseMs|0);
    if(evt.dailyFlow&&correct&&hints)return recordSupportedAnswer(evt,st,t,skill,hints);
    const previousCorrect=st.lastCorrectAt;
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
        st.intervalDays=evt.dailyFlow&&previousCorrect&&new Date(previousCorrect).toDateString()===new Date(t).toDateString()?st.intervalDays:nextInterval(st.intervalDays);if(!evt.dailyFlow||!previousCorrect||new Date(previousCorrect).toDateString()!==new Date(t).toDateString())st.stability=Math.min(10,st.stability+1);st.status=st.intervalDays>=14?"stable":"review";st.dueAt=t+Math.max(TEN_MIN,st.intervalDays*DAY);
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
    if(st.skills.assemble<1||(st.skills.assemble<2&&st.skills.complete<1&&st.skills.spell<1))return "assemble";
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
  function mixStudyQueue(queue){
    const fresh=queue.filter(x=>x.reason==='今日新词'),review=queue.filter(x=>x.reason!=='今日新词');
    function randomize(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
    randomize(fresh);randomize(review);
    const mixed=[];let last=null,streak=0;
    while(fresh.length||review.length){
      let isNew;
      if(!fresh.length)isNew=false;else if(!review.length)isNew=true;
      else if(!mixed.length)isNew=false;
      else if(streak>=2)isNew=!last;
      else isNew=Math.random()<fresh.length/(fresh.length+review.length);
      mixed.push((isNew?fresh:review).pop());streak=last===isNew?streak+1:1;last=isNew;
    }
    return mixed;
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
    const queue=learningQueue(plan==="review"?out:mixStudyQueue(out),limit);
    return {plan,queue,counts:{due:due.length,newWords:fresh.length,soon:soon.length,limit,newCap},estimateMinutes:Math.max(1,Math.round(queue.length*.42))};
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
  function resumeSession(){if(!sessionUsable())return false;const s=S.dailySession,remaining=s.queue.slice(s.index);return window.WORDTIDE_THEME&&window.WORDTIDE_THEME.startDaily(remaining,{plan:s.plan,offset:s.index,resume:true})}
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
  function planIcon(name){
    const paths={back:'m14 5-7 7 7 7',sound:'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',bolt:'m14 2-9 12h6l-1 8 9-12h-6l1-8',wave:'M2 9c4-6 6 6 10 0s6 6 10 0M2 16c4-6 6 6 10 0s6 6 10 0',again:'M20 7v5h-5M20 12a8 8 0 1 0-2 6',moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 1v3m0 16v3M1 12h3m16 0h3'};
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
  }
  function renderDaily(){
    const s=stats(),quick=buildDailyQueue('quick'),standard=buildDailyQueue('standard'),review=buildDailyQueue('review'),battle=buildBattleQueue(),resume=sessionUsable()?S.dailySession:null;
    const tone=S.themeAppearance==='dark'?'dark':'light';screen.dataset.tone=tone;
    const planCard=(plan,title,icon,description)=>'<article class="pl-plan"><div class="pl-plan-top"><span class="pl-icon">'+planIcon(icon)+'</span><div><h2>'+title+'</h2><p>'+description+'</p></div></div><div class="pl-plan-bottom"><span>'+plan.queue.length+' 步 · 约 '+plan.estimateMinutes+' 分钟</span><button '+(plan.queue.length?'':'disabled ')+'data-plan="'+plan.plan+'">'+(plan.queue.length?'开始学习':'暂无内容')+' <span aria-hidden="true">→</span></button></div></article>';
    screen.innerHTML='<div class="pl-shell"><header class="pl-header"><button id="p3Back" class="pl-round" aria-label="返回首页">'+planIcon('back')+'</button><div class="pl-title"><h1>今日潮汐</h1><p>复习一点，也认识新词</p></div><button id="plAudio" class="pl-round" aria-label="声音设置">'+planIcon('sound')+'</button><button id="plTone" class="pl-round" aria-label="'+(tone==='dark'?'切换浅色模式':'切换深色模式')+'">'+planIcon(tone==='dark'?'sun':'moon')+'</button></header>'
      +'<section class="pl-hero"><div class="pl-hero-copy"><span class="pl-eyebrow">今天的学习</span><h2><strong>'+s.due+'</strong> 个词到期</h2><p>'+(s.due?'先温习旧词，让记忆更牢固。':'没有到期词，按自己的节奏来。')+'</p></div>'
      +(resume?'<div class="pl-resume"><div><b>接着上次继续</b><span>'+labelPlan(resume.plan)+' · 停在第 '+(resume.index+1)+' / '+resume.queue.length+' 题</span></div><div class="pl-progress" role="progressbar" aria-label="上次学习进度" aria-valuemin="0" aria-valuemax="'+resume.queue.length+'" aria-valuenow="'+resume.index+'"><i style="width:'+Math.round(resume.index/resume.queue.length*100)+'%"></i></div><button class="pl-primary" id="p3Resume">继续上次学习 <span aria-hidden="true">→</span></button></div>':'<div class="pl-hero-note">新词与复习穿插出现，不用从头重来。</div>')+'</section>'
      +'<div class="pl-stats" aria-label="学习概况">'+[['薄弱词',s.weak],['正在巩固',s.learning],['稳定记忆',s.stable]].map(([label,n])=>'<div><b>'+n+'</b><span>'+label+'</span></div>').join('')+'</div>'
      +'<section class="pl-plans"><div class="pl-section-head"><h2>'+(resume?'也可以开始新一轮':'选一轮，开始学习')+'</h2><span>自动安排题型</span></div>'
      +planCard(quick,'快速学习','bolt','先认识，再遮住答案回忆；初始最多 12 步，回练最多加 4 步。')
      +planCard(standard,'标准学习','wave','按掌握程度练到全词拼写；初始最多 20 步，回练最多加 4 步。')
      +planCard(review,'专注复习','again',s.due?'优先温习到期内容，不加新词。':review.queue.length?'今天没有到期词，可以提前巩固。':'还没有学过的词，先从快速学习开始。')+'</section>'
      +'<details class="pl-more"><summary>实战与学习说明</summary><section class="pl-battle"><h2>今日塔防</h2><p>'+(battle.length?'用 '+battle.length+' 个学过的词进行实战练习。':'完成一些单词学习后，即可进入今日塔防。')+'</p><button id="p3Battle" '+(battle.length?'':'disabled')+'>进入今日塔防</button></section><section class="pl-explain"><h2>为什么出现这些词？</h2><p>到期复习：按记忆情况安排温习。<br>薄弱词：最近答错过，需要多练一次。<br>新词：复习量允许时，少量穿插加入。</p><p>当天答对是开始，跨天独立回忆才会逐步成为稳定记忆。</p></section></details>'
      +'<p class="pl-footer">学习记录保存在当前浏览器</p></div>';
    document.getElementById('p3Back').onclick=()=>{showScreen('scHome');try{refreshHome()}catch(e){}};
    document.getElementById('plAudio').onclick=()=>document.getElementById('wtAudioButton')?.click();
    document.getElementById('plTone').onclick=()=>{if(window.OCEAN_HOME)OCEAN_HOME.toggle();else{S.themeAppearance=tone==='dark'?'light':'dark';persist()}renderDaily()};
    screen.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>startPlan(b.dataset.plan));
    const rb=document.getElementById('p3Resume');if(rb)rb.onclick=resumeSession;
    const bb=document.getElementById('p3Battle');if(bb&&!bb.disabled)bb.onclick=startBattle;
  }
  function openDaily(){renderDaily();showScreen("scDaily");screen.scrollTop=0}
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
  window.WORDTIDE_MEMORY={version:VERSION,catalog,stats,getState,recordExposure,recordAnswer,recordTheme,recordOriginal,buildDailyQueue,buildBattleQueue,startPlan,startBattle,consumeBattleQueue,resumeSession,updateSession,completeSession,openDaily,renderDaily};
})();

