
(function(){
  'use strict';
  let unlocked=false,timer=null,bus=null,step=0,next=0,ducked=false;
  const nodes=new Set(),volume=()=>Math.max(0,Math.min(.5,Number(S.themeMusicVolume??.18)||0));
  const allowed=()=>!!document.querySelector('#scHome.on,#scDaily.on,#scTheme.on');
  const message=t=>{const e=document.getElementById('wtMusicStatus');if(e)e.textContent=t};
  function gain(){if(bus){const a=actx();bus.gain.setTargetAtTime(volume()*(ducked?.18:1),a.currentTime,.15)}}
  function stop(){if(timer!==null){clearInterval(timer);timer=null}for(const o of nodes){try{o.stop()}catch{}}nodes.clear();if(bus){bus.disconnect();bus=null}}
  function note(n,at,duration,level){const a=actx(),o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=440*Math.pow(2,(n-69)/12);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(level,at+.08);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(bus);nodes.add(o);o.onended=()=>{nodes.delete(o);o.disconnect();g.disconnect()};o.start(at);o.stop(at+duration+.02)}
  function schedule(){if(document.hidden||!allowed()||!S.themeMusicEnabled){stop();return}const a=actx();if(a.state!=='running')return;if(next<a.currentTime)next=a.currentTime+.04;const roots=[48,45,53,55],pattern=[12,16,19,16,21,19,16,14];while(next<a.currentTime+.25){const pos=step%8,root=roots[Math.floor(step/8)%4];if(pos===0){note(root,next,3,.07);note(root+7,next,3,.035)}if(pos!==3&&pos!==7)note(root+pattern[pos],next,.9,.065);next+=60/72/2;step++}}
  async function start(){if(!unlocked||!S.themeMusicEnabled||document.hidden||!allowed())return;if(timer!==null)return;try{const a=actx();await a.resume();if(!S.themeMusicEnabled||document.hidden||!allowed()||timer!==null)return;if(a.state!=='running'){message('请再点一次开启音乐');return}stopBgm();bus=a.createGain();bus.gain.value=volume()*(ducked?.18:1);bus.connect(a.destination);step=0;next=a.currentTime+.04;schedule();timer=setInterval(schedule,160);message('海湾轻奏 · 正在播放')}catch{stop();message('音乐启动失败，请再次点击，或检查浏览器声音权限')}}
  function sync(){if(!allowed()||document.hidden)stop();else start()}
  function duck(v){ducked=!!v;gain()}
  window.WT_MUSIC={start,stop,duck,state:()=>({playing:timer!==null,enabled:!!S.themeMusicEnabled,ducked,volume:volume(),nodes:nodes.size})};
  const section=document.createElement('section');section.className='wt-music-section';section.innerHTML='<h3>学习背景音乐</h3><p>海湾轻奏 · 轻柔无歌词。播放单词时自动降低音乐音量，离开学习页面时暂停。</p><button id="wtMusicToggle" type="button" aria-pressed="false">开启背景音乐</button><label for="wtMusicVolume">音乐音量</label><input id="wtMusicVolume" type="range" min="0" max="0.5" step="0.01"><div id="wtMusicStatus" role="status"></div>';
  const panel=document.getElementById('wtAudioPanel');panel.insertBefore(section,panel.firstChild);
  const toggle=document.getElementById('wtMusicToggle'),slider=document.getElementById('wtMusicVolume');
  function render(){toggle.textContent=S.themeMusicEnabled?'关闭背景音乐':'开启背景音乐';toggle.setAttribute('aria-pressed',String(!!S.themeMusicEnabled));slider.value=volume()}
  toggle.onclick=()=>{unlocked=true;S.themeMusicEnabled=!S.themeMusicEnabled;save();render();if(S.themeMusicEnabled)start();else{stop();message('背景音乐已关闭')}};
  slider.oninput=()=>{S.themeMusicVolume=Number(slider.value);save();gain()};render();
  document.addEventListener('pointerdown',()=>{unlocked=true;if(S.themeMusicEnabled)start()},{passive:true});
  function flush(){try{clearTimeout(saveTimer);LS.setItem(SAVE,JSON.stringify(S))}catch{}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();window.WT_AUDIO?.stop();flush()}else sync()});window.addEventListener('pagehide',()=>{stop();flush()});
  const oldShow=window.showScreen;window.showScreen=function(id){const result=oldShow.apply(this,arguments);sync();return result};
  const oldBgm=window.startBgm;window.startBgm=function(){stop();return oldBgm.apply(this,arguments)};
  function fit(){document.documentElement.style.setProperty('--wt-visible-height',(window.visualViewport?.height||window.innerHeight)+'px')}
  window.visualViewport?.addEventListener('resize',fit);window.addEventListener('resize',fit);fit();
  function prepare(){document.querySelectorAll('#scTheme input[type=text],#scTheme input:not([type]),#scTheme textarea').forEach(e=>{e.setAttribute('autocapitalize','none');e.setAttribute('autocorrect','off');e.setAttribute('spellcheck','false');e.setAttribute('enterkeyhint','done');if(!e.getAttribute('aria-label'))e.setAttribute('aria-label','输入英文答案')});document.querySelectorAll('#thPickGrid button').forEach((b,i)=>b.setAttribute('aria-label','图片选项 '+(i+1)))}
  const theme=document.getElementById('scTheme');if(theme){if(typeof MutationObserver!=='undefined')new MutationObserver(prepare).observe(theme,{childList:true,subtree:true});prepare()}
  document.addEventListener('focusin',e=>{if(e.target.matches('#scTheme input,#scTheme textarea'))setTimeout(()=>{if(document.activeElement===e.target)e.target.scrollIntoView({block:'center',behavior:'smooth'})},250)});
})();

