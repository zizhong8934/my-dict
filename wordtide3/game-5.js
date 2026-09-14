
(function(){
  'use strict';
  let token=0,lastTap=0;
  const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
  function settings(){return {mode:S.themeSoundMode||'soft',rate:clamp(S.themeVoiceRate,.6,1.1,.82),volume:clamp(S.themeVoiceVolume,0,1,.9),voice:S.themeVoiceName||''}}
  function status(text){const el=document.getElementById('wtAudioStatus');if(el)el.textContent=text}
  function voices(){try{return window.speechSynthesis.getVoices().filter(v=>/^en(?:-|_)/i.test(v.lang)&&!/^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Junior|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox)$/i.test(v.name))}catch{return []}}
  function stop(){token++;try{window.speechSynthesis.cancel()}catch{}window.WT_MUSIC?.duck(false)}
  function sequence(lines,rate){
    stop();const active=token,config=settings();
    if(config.volume===0)return;
    if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined'){status('当前浏览器不支持系统朗读。');return}
    const queue=lines.map(x=>String(x||'').trim()).filter(Boolean);let index=0;
    const available=voices();
    const chosen=available.find(v=>v.name===config.voice)||available.find(v=>v.localService&&/^(Samantha|Alex|Karen|Daniel)$/.test(v.name))||available.find(v=>v.localService&&/^en-US$/i.test(v.lang))||available[0];
    function next(){
      if(active!==token||index>=queue.length){if(active===token){status('播放完成');window.WT_MUSIC?.duck(false)}return}
      const utterance=new SpeechSynthesisUtterance(queue[index++]);
      utterance.lang=chosen?.lang||'en-US';if(chosen)utterance.voice=chosen;
      utterance.rate=clamp(config.rate*(rate||.82)/.82,.5,1.2,.82);utterance.volume=config.volume;
      utterance.onend=next;
      utterance.onerror=e=>{if(active!==token)return;window.WT_MUSIC?.duck(false);if(e.error!=='canceled'&&e.error!=='interrupted')status('朗读未完成：请换一个英语声音，或检查系统语音是否已下载。')};
      status('正在播放…');window.WT_MUSIC?.duck(true);try{window.speechSynthesis.speak(utterance)}catch{window.WT_MUSIC?.duck(false);status('朗读启动失败，请再次点击试听。')}
      if(window.speechSynthesis.paused)window.speechSynthesis.resume();
    }
    next();
  }
  function cue(kind){
    const config=settings();if(config.mode==='off'||sfxVol()<=0)return;
    if(kind==='tap'){const now=Date.now();if(now-lastTap<65)return;lastTap=now}
    try{
      const a=actx();if(a.state==='suspended')a.resume();
      const clear=config.mode==='clear',gain=(clear?1:.65)*sfxVol(),t=a.currentTime;
      if(kind==='ok'){tone(660,t,.09,'sine',.055*gain);tone(880,t+.075,.14,'sine',.045*gain)}
      else if(kind==='bad')tone(220,t,.15,'sine',.045*gain);
      else tone(clear?510:430,t,.045,'sine',.025*gain);
    }catch{}
  }
  window.WT_AUDIO={speak:(text,rate)=>sequence([text],rate),sequence,cue,stop,settings};
  const button=document.createElement('button');button.id='wtAudioButton';button.textContent='声音设置';button.title='界面音效优化版 · 2026-09-13';
  document.getElementById('topbar').appendChild(button);
  const panel=document.createElement('dialog');panel.id='wtAudioPanel';panel.setAttribute('aria-labelledby','wtAudioTitle');
  panel.innerHTML='<h2 id="wtAudioTitle">声音与播报</h2><p>用于快速学习、标准学习及主题练习。建议选择“本机”英语声音；首次使用可能需要下载系统语音。已隐藏不适合学发音的趣味音色。</p>'
    +'<label for="wtSoundMode">选择与答题音效</label><select id="wtSoundMode"><option value="soft">柔和 · 轻触水滴</option><option value="clear">清晰 · 明确反馈</option><option value="off">关闭</option></select>'
    +'<div class="wt-audio-row"><button id="wtTryTap">试听点击</button><button id="wtTryGood">试听答对</button><button id="wtTryBad">试听答错</button></div>'
    +'<label for="wtVoice">英语播报声音</label><select id="wtVoice"></select>'
    +'<label for="wtRate">播报语速</label><select id="wtRate"><option value="0.65">慢速</option><option value="0.82">标准</option><option value="1">正常会话速度</option></select>'
    +'<label for="wtVoiceVolume">播报音量（0为关闭）</label><input id="wtVoiceVolume" type="range" min="0" max="1" step="0.1">'
    +'<div class="wt-audio-row"><button id="wtTryVoice">试听单词与例句</button><button id="wtStopVoice">停止</button></div>'
    +'<div id="wtAudioStatus" role="status"></div><div class="wt-audio-row"><button id="wtAudioClose">完成</button></div>';
  document.body.appendChild(panel);
  const get=id=>document.getElementById(id);
  function voiceOptions(){
    const select=get('wtVoice');select.innerHTML='';const auto=document.createElement('option');auto.value='';auto.textContent='自动选择英语声音';select.appendChild(auto);
    voices().forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=v.name+' · '+v.lang+(v.localService?' · 本机':'');select.appendChild(o)});
    select.value=settings().voice;if(select.selectedIndex<0)select.value='';
  }
  button.onclick=()=>{voiceOptions();get('wtSoundMode').value=settings().mode;get('wtRate').value=String(settings().rate);get('wtVoiceVolume').value=settings().volume;status('设置自动保存；音效同时受首页总音量控制。');panel.showModal()};
  get('wtSoundMode').onchange=e=>{S.themeSoundMode=e.target.value;save();cue('tap')};
  get('wtVoice').onchange=e=>{S.themeVoiceName=e.target.value;save();stop()};
  get('wtRate').onchange=e=>{S.themeVoiceRate=Number(e.target.value);save()};
  get('wtVoiceVolume').oninput=e=>{S.themeVoiceVolume=Number(e.target.value);save();if(Number(e.target.value)===0)stop()};
  get('wtTryTap').onclick=()=>cue('tap');get('wtTryGood').onclick=()=>cue('ok');get('wtTryBad').onclick=()=>cue('bad');
  get('wtTryVoice').onclick=()=>sequence(['hammer','Bring me the hammer, please.'],.82);
  get('wtStopVoice').onclick=stop;get('wtAudioClose').onclick=()=>{stop();panel.close()};panel.addEventListener('close',stop);
  window.speechSynthesis?.addEventListener?.('voiceschanged',()=>{if(panel.open)voiceOptions()});
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('#scTheme button, #scDaily button');if(!b||b.disabled)return;
    if(b.matches('[data-mode],[data-sea],[data-plan],#p3Resume,.th-part,#thBuildUndo,#thBuildReset,#thHear,#thNext'))cue('tap');
    if(b.id==='thExit'||b.id==='thBack'||b.id==='p3Back')stop();
  },true);
  // Keep gameplay keyboard shortcuts out of the settings dialog.
  panel.addEventListener('keydown',e=>e.stopPropagation());
})();

