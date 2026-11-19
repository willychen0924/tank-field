'use strict';
// Low-poly scenery shares the renderer's position / normal / RGB vertex format.
class SceneMesh {
  constructor(){this.vertices=[];}
  face(points,hex){
    const [a,b,c]=points, u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const length=Math.hypot(...n);if(!length)return;
    const rgb=[16,8,0].map(k=>((hex>>k)&255)/255);
    for(let i=1;i<points.length-1;i++)for(const point of [a,points[i],points[i+1]]){
      this.vertices.push(...point,n[0]/length,n[1]/length,n[2]/length,...rgb);
    }
  }
  slab(x,y,z,w,d,color){this.face([[x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2]],color);}
  prism(ring,y,h,color,top=color){
    this.face(ring.map(([x,z])=>[x,y+h,z]),top);
    ring.forEach(([x,z],i)=>{
      const [u,v]=ring[(i+1)%ring.length];
      this.face([[x,y,z],[u,y,v],[u,y+h,v],[x,y+h,z]],color);
    });
  }
  box(x,y,z,w,h,d,color,top=color){
    this.prism([[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]],y,h,color,top);
  }
  data(){return new Float32Array(this.vertices);}
}
function buildCanopy(){
  const mesh=new SceneMesh();
  for(const [x,z,scale] of [[-.21,-.16,.94],[.24,.23,.72],[-.24,.29,.44]]){
    mesh.box(x,0,z,.11,.86*scale,.1,0x644b38);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4+scale, length=(i%2?.51:.58)*scale;
      const dx=Math.cos(a),dz=Math.sin(a),height=1.03*scale;
      const start=[x,height,z],end=[x+dx*length,height-.29*scale,z+dz*length];
      const mid=[x+.52*length*dx,height+.025,z+.52*length*dz];
      const left=[mid[0]-.12*dz,height-.08,mid[2]+.12*dx];
      const right=[mid[0]+.12*dz,height-.08,mid[2]-.12*dx];
      mesh.face([start,left,mid],0x638e53);mesh.face([mid,left,end],0x477b49);
      mesh.face([start,mid,right],0x44794c);mesh.face([mid,end,right],0x385f3c);
    }
  }
  return mesh.data();
}
function makeBoard(stage){
  const mesh=new SceneMesh();
  const cfg=[
    null,
    {ground:[0x88928f,0x8b9592,0x909a97],rim:0x697670,outside:0x535f59},
    {ground:[0x849663,0x8c9c6a,0x92a16f],rim:0x667552,outside:0x475648},
    {ground:[0xd9b77e,0xddbd87,0xd6b37a],rim:0xaa8760,outside:0x85725a},
    {ground:[0xc6d1cc,0xc1ccc9,0xd2d8d0],rim:0x81969b,outside:0x5e7178},
    {ground:[0xaba792,0xb2ad98,0xa7a38e],rim:0x737a72,outside:0x555f59}
  ][stage];
  let seed=537+stage;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const b=(...args)=>mesh.box(...args),f=(...args)=>mesh.slab(...args);
  function rock(x,z,scale,color){
    const ring=Array.from({length:7},(_,i)=>{
      const a=i*Math.PI*2/7,rad=(.43+random()*.09)*scale;
      return [x+rad*Math.cos(a),z+rad*Math.sin(a)];
    });
    const top=ring.map(([u,v])=>[x+(u-x)*.61,.62*scale,z+(v-z)*.63]);
    mesh.face(top,color);
    ring.forEach(([u,v],i)=>{
      const j=(i+1)%7;mesh.face([[u,.02,v],[ring[j][0],.02,ring[j][1]],top[j],top[i]],color+(i%2?0:0x070805));
    });
  }
  function hardCover(x,z){
    if(stage===1){
      const roof=random()>.5?0xafb7ae:0xb5ab9b,h=.52+random()*.42;
      b(x,.02,z,.93,h,.92,0x8d8d80,roof);
      b(x,.02+h,z,.97,.06,.95,roof);
      b(x-.16,.08+h,z-.10,.28,.12,.25,0x6e7973,0x929e96);
      for(const u of [-.28,0,.28])b(x+u,h*.52,z+.467,.13,.16,.012,0x516361);
    }else if(stage===4){
      const colors=[0x728995,0x997465,0x77938d],color=colors[Math.floor(random()*3)];
      b(x,.03,z,.91,.58,.89,color);
      for(let k=-3;k<=3;k++)b(x+k*.118,.61,z,.047,.028,.82,color+0x14140e);
      for(const u of [-.38,.38])b(x+u,.05,z+.449,.035,.48,.018,0xc4c4ae);
    }else{
      const color=stage===3?0xb17d58:stage===2?0x748367:0x83877c;
      rock(x-.09,z-.08,.87,color);rock(x+.23,z+.20,.50,color+0x0c0c09);
      if(stage===3){
        b(x+.28,.02,z-.26,.10,.50,.10,0x627f56);
        b(x+.20,.21,z-.26,.15,.07,.07,0x718c60);
      }
    }
  }
  b(0,-.57,0,47,.05,36,cfg.outside);
  b(0,-.45,0,17.7,.35,11.68,cfg.rim);
  b(0,-.1,0,17.55,.10,11.55,cfg.rim+0x121410);
  STAGES[stage].map.forEach((row,j)=>[...row].forEach((cell,i)=>{
    const x=i-8,z=j-5;
    let ground=cfg.ground[Math.floor(random()*3)];
    if(stage===2&&x===0)ground=0xb4a074;
    if(cell==='w')ground=0x5d888c;
    if(cell==='i')ground=0x96c9d4;
    f(x,.014,z,.997,.997,ground);
    if(cell==='s')hardCover(x,z);
    if(cell==='t')f(x,.02,z,.94,.92,0x708450);
    if(cell==='='){
      for(let k=-2;k<=2;k++)b(x,0,z+k*.20,.988,.095,.187,0x9a9989,0xc1bca6);
    }else if(cell==='i'||cell==='w'){
      for(let k=0;k<3;k++)f(x+(random()-.5)*.64,.021,z+(random()-.5)*.75,.14+random()*.23,.024,cell==='i'?0xd8eef0:0x8aabad);
    }else if(stage===1&&cell==='.'){
      if(x===0&&z!==-2&&z!==1)f(x,.022,z,.045,.39,0xe3cf92);
      if((z===-2||z===1)&&x%4!==0)f(x,.022,z,.40,.038,0xe0d5ac);
      if((z===-2||z===1)&&Math.abs(x)===1)for(let k=-2;k<=2;k++)f(x,.025,z+k*.15,.27,.065,0xe4dfcb);
    }else if(stage===4&&cell==='.'){
      if(Math.abs(x)===6)f(x,.025,z,.055,.55,0xc9a65c);
    }else{
      for(let k=0;k<3;k++)f(x+(random()-.5)*.8,.022,z+(random()-.5)*.8,.04+random()*(stage===3?.23:.07),.021,ground-0x10100f);
    }
  }));
  for(const x of [-8,0,8])for(let k=-1;k<=1;k++)f(x+k*.18,.03,-5.3,.08,.18,0xf1d589);
  return mesh.data();
}
