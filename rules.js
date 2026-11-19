'use strict';
const DIR=[[0,-1],[1,0],[0,1],[-1,0]], QUOTA=20;
const tile=(s,x,z)=>STAGES[s.stage].map[z+5]?.[x+8];
const BASE_Z=5;
const PLAYER_START=[-2,BASE_Z];
const ENTRY_X=[-8,0,8];
const BRICK_PARTS=[[-.25,-.21],[.25,-.21],[-.25,.21],[.25,.21]];
// These masks retain the back half for shots moving up, right, down and left.
const FAR_HALF=[0b0011,0b1010,0b1100,0b0101];
function tankAt(kind,x,z,dir) {
  return {kind,x,z,dir,alive:true,move:null,cd:0,think:0,guard:0};
}
const RAID_COURSES=[[1,1],[-1,1],[1,-1],[-1,-1]];
const ENEMY_TYPES={N:{speed:1.1,hp:1},F:{speed:2.05,hp:1},R:{speed:1.1,hp:1},H:{speed:.82,hp:3}};
function spawnEnemy(stage,index,x){
  const wave=STAGES[stage].wave, type=wave[index%wave.length];
  const t=tankAt(index%3===0?'red':'enemy',x,-5,2);
  return Object.assign(t,{type,hp:ENEMY_TYPES[type].hp,followUp:0});
}
function newRound(previousCourse,stage=0,lives=3,power=1) {
  const choices=RAID_COURSES.filter(course=>course!==previousCourse);
  const course=choices[Math.floor(Math.random()*choices.length)];
  const walls=[];
  STAGES[stage].map.forEach((row,j)=>[...row].forEach((v,i)=>{
    if(v==='b') walls.push({x:i-8,z:j-5,mask:0b1111});
  }));
  const player=tankAt('player',...PLAYER_START,0);
  const enemies=ENTRY_X.map((x,i)=>spawnEnemy(stage,i,x));
  enemies.forEach((t,i)=>{t.think=.6+i*.35;t.cd=1.6+i*.32;});
  return {stage,player,enemies,walls,shells:[],drops:[],fx:[],base:true,lives,kills:0,spawned:3,
    course,raid:null,spawnIn:4,power,time:0,status:'ready',notice:'',noticeTime:0};
}
function notice(s,msg,seconds=2.8){s.notice=msg;s.noticeTime=seconds;}
function burst(s,x,z,kind,count){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,v=.25+Math.random()*1.9;
    s.fx.push({x,z,y:.22,dx:Math.cos(a)*v,dz:Math.sin(a)*v,vy:1+Math.random()*2.1,
      size:.6+Math.random()*1.1,life:.28+Math.random()*.35,kind});
  }
}
function occupants(s){return [s.player,...s.enemies].filter(t=>t.alive);}
function occupied(s,t,x,z) {
  return occupants(s).some(o=>o!==t&&((Math.abs(o.x-x)<.75&&Math.abs(o.z-z)<.75)||
    (o.move && o.move.x===x && o.move.z===z)));
}
function hasWall(s,x,z){return s.walls.some(b=>b.x===x&&b.z===z);}
function startStep(s,t,dir){
  const [dx,dz]=DIR[dir],x=Math.round(t.x)+dx,z=Math.round(t.z)+dz;
  t.dir=dir;
  const ground=tile(s,x,z);
  if(!ground||'swH'.includes(ground)||hasWall(s,x,z)||occupied(s,t,x,z))return false;
  t.move={x,z};return true;
}
function advance(s,t,speed,dt){
  if(!t.move)return;
  const [dx,dz]=DIR[t.dir],dist=Math.abs(t.x-t.move.x)+Math.abs(t.z-t.move.z);
  if(dist<=dt*speed){t.x=t.move.x;t.z=t.move.z;t.move=null;
    const coast=!t.sliding&&tile(s,t.x,t.z)==='i';
    t.sliding=coast&&startStep(s,t,t.dir);
  }
  else {t.x+=dx*dt*speed;t.z+=dz*dt*speed;}
}
function shoot(s,t){
  if(t.cd>0||!t.alive)return;
  fireShell(s,t);
  t.cd=t===s.player?[0,.40,.25,.16][s.power]:1.75+Math.random()*.85;
  if(t.type==='R'){t.followUp=.32;t.think=.55;}
}
function fireShell(s,t){
  const own=t===s.player, [dx,dz]=DIR[t.dir];
  const nose=.40;
  s.shells.push({x:t.x+dx*nose,z:t.z+dz*nose,dir:t.dir,own,speed:own?10.5+s.power*.65:5.3});
}
function toward(t,x,z){
  if(Math.abs(t.x-x)<.37 && Math.abs(t.z-z)>.3)return z<t.z?0:2;
  if(Math.abs(t.z-z)<.37 && Math.abs(t.x-x)>.3)return x>t.x?1:3;
  return -1;
}
// Choose a short route. Crossing a brick cell costs extra time for demolition.
function route(s,t,goalX,goalZ){
  const startX=Math.round(t.x),startZ=Math.round(t.z);
  const frontier=[{x:startX,z:startZ,cost:0,first:-1}],best=new Map();
  const solids=new Set(s.walls.map(b=>b.x+','+b.z));
  while(frontier.length){
    frontier.sort((a,b)=>b.cost-a.cost);
    const p=frontier.pop(),key=p.x+','+p.z;
    if(best.has(key))continue;
    best.set(key,p.cost);
    if(p.x===goalX&&p.z===goalZ)return p.first;
    for(let i=0;i<4;i++){
      const d=(i+t.dir)%4,[dx,dz]=DIR[d],x=p.x+dx,z=p.z+dz,k=x+','+z;
      const cell=tile(s,x,z);
      if(!cell||cell==='s'||cell==='w'||best.has(k)||(cell==='H'&&(x!==goalX||z!==goalZ)))continue;
      const crowded=p.first===-1&&occupied(s,t,x,z);
      frontier.push({x,z,cost:p.cost+1+(solids.has(k)?3:0)+(crowded?5:0),first:p.first===-1?d:p.first});
    }
  }
  return -1;
}
function think(s,t){
  const p=s.player;
  const baseAim=toward(t,0,BASE_Z),playerAim=p.alive?toward(t,p.x,p.z):-1;
  function clearOfSteel(dir,range){
    let x=t.x,z=t.z;
    for(let k=1;k<range;k++){x+=DIR[dir][0];z+=DIR[dir][1];if(tile(s,Math.round(x),Math.round(z))==='s')return false;}
    return true;
  }
  const baseDist=Math.abs(t.x)+Math.abs(t.z-BASE_Z),playerDist=Math.abs(t.x-p.x)+Math.abs(t.z-p.z);
  const aim=baseAim>=0&&baseDist<=4.1&&clearOfSteel(baseAim,baseDist)?baseAim:
    playerAim>=0&&playerDist<6.5&&clearOfSteel(playerAim,playerDist)?playerAim:-1;
  if(aim>=0){
    t.dir=aim;shoot(s,t);t.think=.30;return;
  }
  const chase=t.kind==='red'&&t.type!=='F'&&p.alive;
  const dir=route(s,t,chase?Math.round(p.x):0,chase?Math.round(p.z):BASE_Z);
  if(dir>=0&&!startStep(s,t,dir)){shoot(s,t);t.think=.40;}
  else t.think=.14+Math.random()*.20;
}
function hitPlayer(s){
  const p=s.player;if(!p.alive||p.guard>0)return;
  burst(s,p.x,p.z,'spark',14);s.lives--;p.alive=false;p.move=null;
  if(!s.lives){s.status='lost';notice(s,'我方坦克已耗盡');return;}
  s.respawn=.88;s.power=1;notice(s,'坦克受損，準備重新出擊');
}
function respawn(s){
  const spots=[PLAYER_START,[-3,BASE_Z],[2,BASE_Z],[3,BASE_Z]];
  const spot=spots.find(([x,z])=>!occupied(s,s.player,x,z));
  if(!spot)return;
  Object.assign(s.player,tankAt('player',...spot,0),{guard:2.2});
}
const RAID_WARNING=2, BOMB_FALL=.55, BLAST_RADIUS=1.18;
function destroyEnemy(s,target){
  target.alive=false;s.kills++;
  burst(s,target.x,target.z,'spark',12);
  if(target.kind==='red'){
    s.drops.push({x:target.x,z:target.z});
    notice(s,'紅坦克掉落星章！開過去提升射速');
  }
}
const PLANE_SCALE=3, FLIGHT_EDGE=9.35+1.2*PLANE_SCALE;
function flightPosition(raid,age){
  const x=raid.directionX*(-FLIGHT_EDGE+raid.speed*age);
  return {x,z:raid.slope*x+raid.intercept};
}
function startRaid(s){
  const [directionX,directionZ]=s.course;
  const slope=directionX*directionZ*(.43+Math.random()*.13);
  const intercept=(Math.random()-.5)*.9;
  // One landing site in each of six successive sections of this flight path.
  const targets=Array.from({length:6},(_,i)=>{
    const x=directionX*(-6.75+2.7*i+(Math.random()-.5)*.5);
    const z=slope*x+intercept+(Math.random()-.5)*1.2;
    return {x,z,hit:false};
  });
  const forwardDrift=.48;
  const speed=(directionX*targets[0].x-forwardDrift+FLIGHT_EDGE)/RAID_WARNING;
  for(const target of targets){
    target.release=(directionX*target.x-forwardDrift+FLIGHT_EDGE)/speed;
  }
  s.raid={start:s.time,directionX,slope,intercept,speed,targets};
}
function advanceRaid(s){
  if(!s.raid && QUOTA-s.kills<=10)startRaid(s);
  if(!s.raid)return;
  const age=s.time-s.raid.start;
  for(const target of s.raid.targets){
    if(target.hit || age+1e-9<target.release+BOMB_FALL)continue;
    target.hit=true;
    const inRange=p=>Math.hypot(p.x-target.x,p.z-target.z)<=BLAST_RADIUS;
    burst(s,target.x,target.z,'ember',18);
    s.walls=s.walls.filter(w=>{
      if(!inRange(w))return true;
      burst(s,w.x,w.z,'chip',7);return false;
    });
    for(const enemy of s.enemies)if(enemy.alive&&inRange(enemy))destroyEnemy(s,enemy);
    if(s.player.alive&&inRange(s.player))hitPlayer(s);
    if(s.status!=='playing')break;
  }
}
function impact(s,b){
  if(Math.abs(b.x)>8.5||Math.abs(b.z)>5.5)return true;
  const wall=s.walls.find(w=>w.x===Math.round(b.x)&&w.z===Math.round(b.z));
  if(wall && BRICK_PARTS.some(([dx,dz],i)=>
    (wall.mask & (1<<i)) && Math.abs(b.x-wall.x-dx)<=.267 && Math.abs(b.z-wall.z-dz)<=.227)){
    if(wall.mask===0b1111){
      s.walls=s.walls.map(w=>w===wall?{...w,mask:FAR_HALF[b.dir]}:w);
    }else{
      s.walls=s.walls.filter(w=>w!==wall);
    }
    burst(s,b.x,b.z,'chip',6);return true;
  }
  if(tile(s,Math.round(b.x),Math.round(b.z))==='s'&&Math.abs(b.x-Math.round(b.x))<.47&&Math.abs(b.z-Math.round(b.z))<.45){
    burst(s,b.x,b.z,'spark',3);return true;
  }
  if(Math.abs(b.x)<.49&&Math.abs(b.z-BASE_Z)<.46){
    s.base=false;
    s.status='lost';
    notice(s,b.own?'我方砲彈誤擊金鷹基地':'金鷹基地已失守');
    burst(s,0,BASE_Z,'spark',18);
    burst(s,0,BASE_Z,'ember',20);
    return true;
  }
  if(b.own){
    const target=s.enemies.find(t=>t.alive&&Math.abs(t.x-b.x)<.45&&Math.abs(t.z-b.z)<.45);
    if(target){
      target.hp--;
      if(target.hp<=0)destroyEnemy(s,target);
      else burst(s,target.x,target.z,'chip',5);
      return true;
    }
  }else if(s.player.alive&&Math.abs(s.player.x-b.x)<.41&&Math.abs(s.player.z-b.z)<.41){
    hitPlayer(s);return true;
  }
  return false;
}
// Advance every shell on the same clock. Even the fastest opposing pair moves
// less than half the contact distance per sample, including at maximum power.
const SHELL_CONTACT=.12;
function advanceShells(s,dt){
  if(!s.shells.length)return;
  const fastest=Math.max(...s.shells.map(shell=>shell.speed));
  const steps=Math.max(1,Math.ceil(fastest*dt/(SHELL_CONTACT/4)));
  const stepTime=dt/steps;
  for(let step=0;step<steps&&s.shells.length&&s.status==='playing';step++){
    const flying=[];
    for(const shell of s.shells){
      const [dx,dz]=DIR[shell.dir];
      shell.x+=dx*shell.speed*stepTime;
      shell.z+=dz*shell.speed*stepTime;
      if(!impact(s,shell))flying.push(shell);
      if(s.status!=='playing')break;
    }
    const spent=new Set();
    for(let i=0;i<flying.length;i++){
      const a=flying[i];
      if(spent.has(a))continue;
      for(let j=i+1;j<flying.length;j++){
        const b=flying[j];
        if(a.own===b.own||spent.has(b))continue;
        if(Math.hypot(a.x-b.x,a.z-b.z)>SHELL_CONTACT)continue;
        spent.add(a);spent.add(b);
        burst(s,(a.x+b.x)/2,(a.z+b.z)/2,'spark',4);
        break;
      }
    }
    s.shells=flying.filter(shell=>!spent.has(shell));
  }
}
function advanceEffects(s,dt){
  s.fx=s.fx.filter(f=>{
    f.life-=dt;
    f.x+=f.dx*dt;f.z+=f.dz*dt;
    f.y=Math.max(.025,f.y+f.vy*dt);f.vy-=7*dt;
    return f.life>0;
  });
}
function tick(s,dt,dir,fire){
  if(s.status!=='playing')return;
  s.time+=dt;s.noticeTime-=dt;
  const p=s.player;
  for(const t of occupants(s)){t.cd-=dt;t.guard-=dt;}
  if(!p.alive){s.respawn-=dt;if(s.respawn<=0)respawn(s);}
  if(p.alive){
    if(!p.move&&dir>=0)startStep(s,p,dir);
    advance(s,p,3.2,dt);if(fire)shoot(s,p);
  }
  for(const t of s.enemies){
    if(!t.alive)continue;
    if(t.followUp>0){
      t.followUp-=dt;
      if(t.followUp<=0)fireShell(s,t);
      continue;
    }
    t.think-=dt;if(!t.move&&t.think<=0)think(s,t);
    advance(s,t,ENEMY_TYPES[t.type].speed,dt);
  }
  advanceShells(s,dt);
  if(s.status==='playing')advanceRaid(s);
  s.enemies=s.enemies.filter(t=>t.alive);
  advanceEffects(s,dt);
  if(s.status!=='playing')return;
  if(p.alive)s.drops=s.drops.filter(d=>{
    if(Math.hypot(d.x-p.x,d.z-p.z)>.72)return true;
    if(s.power<3){s.power++;notice(s,'取得星章，射速提升！');}
    else{p.guard=6;notice(s,'火力已滿，獲得 6 秒護盾');}
    burst(s,d.x,d.z,'spark',7);return false;
  });
  s.spawnIn-=dt;
  if(s.spawned<QUOTA&&s.enemies.length<3&&s.spawnIn<=0){
    for(let i=0;i<3;i++){
      const x=ENTRY_X[(s.spawned+i)%ENTRY_X.length];
      if(occupied(s,null,x,-5))continue;
      const t=spawnEnemy(s.stage,s.spawned,x);t.cd=1.3;t.think=.5;
      s.enemies.push(t);s.spawned++;s.spawnIn=3.6;break;
    }
  }
  if(s.kills===QUOTA){s.status='won';notice(s,'金鷹基地守住了');}
}
