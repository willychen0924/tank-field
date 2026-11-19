'use strict';
const ui=id=>document.getElementById(id);
const canvas=ui('arena'),action=ui('action');
let game=newRound(),render,dirty=true;
const keys=new Map(), shots=new Set();
let tappedDirection=-1, tappedFire=false;
const codeDir={ArrowUp:0,KeyW:0,ArrowRight:1,KeyD:1,ArrowDown:2,KeyS:2,ArrowLeft:3,KeyA:3};
function clearInput(){keys.clear();shots.clear();tappedDirection=-1;tappedFire=false;}
function begin(){game.status='playing';dirty=true;canvas.focus({preventScroll:true});}
function toggle(){
  if(game.status==='playing'){game.status='paused';clearInput();}
  else if(game.status==='won'||game.status==='lost'){
    const next=game.status==='won'&&game.stage<STAGES.length-1;
    const stage=next?game.stage+1:game.status==='lost'?game.stage:0;
    game=newRound(game.course,stage,next?game.lives:3,next?game.power:1);
    clearInput();begin();
  }
  else begin();
  dirty=true;refresh();
}
function setText(id,str){const el=ui(id);str=String(str);if(el.textContent!==str)el.textContent=str;}
function refresh(){
  const stage=STAGES[game.stage],finalStage=game.stage===STAGES.length-1;
  setText('caption','第 '+(game.stage+1)+' / '+STAGES.length+' 關　'+stage.name);
  setText('hint',stage.tip);
  setText('base',game.base?'完好':'失守');setText('lives',game.lives);setText('remaining',(QUOTA-game.kills)+' 輛');
  const stars='★'.repeat(game.power)+'☆'.repeat(3-game.power);
  if(ui('power').textContent!==stars){
    setText('power',stars);
    ui('power').setAttribute('aria-label',game.power+' 級，共 3 級');
  }
  const end=game.status==='lost'||game.status==='won',paused=game.status==='paused';
  ui('callout').hidden=!end&&!paused;action.hidden=end;
  setText('action',game.status==='ready'?'開始遊戲':paused?'繼續遊戲':'暫停');
  if(end||paused){
    setText('result',paused?'已暫停':game.status==='won'?(finalStage?'六關全數守住！':'防守成功'):'防守失敗');
    setText('reason',paused?'準備好再回到戰場':game.notice+' · 擊破 '+game.kills+' / '+QUOTA);
    const nextLabel=finalStage?'從第一關再玩':'進入下一關';
    setText('again',paused?'繼續遊戲':game.status==='won'?nextLabel:'重試本關');
  }
  let message=game.noticeTime>0?game.notice:'';
  if(game.raid && game.raid.targets.some(t=>!t.hit)){
    message='空襲警報！離開地面警示圈';
  }
  setText('note',game.status==='playing'?message:'');
}
try{render=createFieldView(canvas);}
catch(err){ui('result').textContent='無法載入戰場';ui('reason').textContent=err.message;ui('callout').hidden=false;ui('again').hidden=true;action.disabled=true;throw err;}
action.onclick=toggle;ui('again').onclick=toggle;
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.isComposing)return;
  if(e.target.closest('button')&&(e.code==='Space'||e.code==='Enter'))return;
  if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat&&['playing','paused'].includes(game.status))toggle();e.preventDefault();return;}
  if(!(e.code in codeDir)&&e.code!=='Space')return;
  e.preventDefault();if(game.status==='ready')begin();
  if(game.status!=='playing')return;
  if(e.code==='Space'){shots.add(e.code);if(!e.repeat)tappedFire=true;}
  else if(!keys.has(e.code)){keys.set(e.code,codeDir[e.code]);tappedDirection=codeDir[e.code];}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);shots.delete(e.code);});
for(const btn of document.querySelectorAll('.touch button')){
  btn.onpointerdown=e=>{
    e.preventDefault();btn.setPointerCapture(e.pointerId);if(game.status==='ready')begin();
    if(game.status!=='playing')return;
    if(btn.id==='fire'){shots.add(e.pointerId);tappedFire=true;}
    else{keys.set(e.pointerId,+btn.dataset.dir);tappedDirection=+btn.dataset.dir;}
  };
  btn.onlostpointercapture=e=>{keys.delete(e.pointerId);shots.delete(e.pointerId);};
}
function focusLost(){if(game.status==='playing')toggle();clearInput();}
window.addEventListener('blur',focusLost);
document.addEventListener('visibilitychange',()=>{if(document.hidden)focusLost();});
new ResizeObserver(()=>{dirty=true;}).observe(canvas);
let previous=performance.now(),acc=0;
function frame(now){
  const elapsed=Math.min(.1,(now-previous)/1000);previous=now;
  if(game.status==='playing'){
    acc+=elapsed;
    let dir=-1;for(const d of keys.values())dir=d;
    while(acc>=1/60){
      const canTurn=!game.player.move;
      tick(game,1/60,dir>=0?dir:tappedDirection,shots.size>0||tappedFire);
      if(canTurn)tappedDirection=-1;
      tappedFire=false;acc-=1/60;
    }
    dirty=true;
  }else{
    acc=0;
    if((game.status==='won'||game.status==='lost')&&game.fx.length){
      advanceEffects(game,elapsed);
      dirty=true;
    }
  }
  if(dirty){render(game);refresh();dirty=false;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
