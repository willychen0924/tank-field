'use strict';
function createFieldView(canvas) {
  const gl = canvas.getContext('webgl', {alpha:false, antialias:true, powerPreference:'low-power'});
  if (!gl) throw new Error('此瀏覽器未啟用 WebGL，請開啟硬體加速或換用其他瀏覽器。');
  const vertex = `
    attribute vec3 pos, normal, color;
    uniform vec3 offset;
    uniform vec2 rot;
    uniform float flash, scale, aspect;
    uniform bool lightPass;
    varying vec3 ink, shadowCoord;
    const vec3 light = vec3(-.3737265,.8493784,-.3737265);
    vec3 turn(vec3 p){return vec3(rot.x*p.x-rot.y*p.z,p.y,rot.y*p.x+rot.x*p.z);}
    void main(){
      vec3 w=turn(pos)*scale+offset;
      vec3 n=turn(normal);
      if(dot(n,vec3(0.,.92718,.37461))<0.) n=-n;
      ink=mix(color*(.77+.285*max(dot(light,n),0.)),vec3(1.,.89,.63),flash);
      vec3 lp=vec3(dot(w,vec3(.7071,0.,-.7071))/13.2,
                   dot(w,vec3(.6006,.5285,.6006))/13.2,-dot(w,light)/17.);
      shadowCoord=lp*.5+.5;
      float halfWidth=max(9.35,5.63*aspect);
      vec2 screen=vec2(w.x/halfWidth,(-.92718*w.z+.37461*w.y)*aspect/halfWidth);
      gl_Position=vec4(lightPass?lp:vec3(screen,-dot(w,vec3(0.,.92718,.37461))/34.),1.);
    }`;
  const fragment = `
    precision highp float;
    uniform sampler2D shadowMap;
    uniform bool lightPass;
    varying vec3 ink,shadowCoord;
    float testShadow(vec2 d) {
      vec2 rg=texture2D(shadowMap,shadowCoord.xy+d/1024.).rg;
      return step(rg.x+rg.y/255.+.0018,shadowCoord.z);
    }
    void main(){
      if(lightPass){
        float z=gl_FragCoord.z*255.;
        gl_FragColor=vec4(floor(z)/255.,fract(z),0.,1.);
      }else{
        float shade=(testShadow(vec2(-.75,-.75))+testShadow(vec2(.75,-.75))+
          testShadow(vec2(-.75,.75))+testShadow(vec2(.75,.75)))*.25;
        gl_FragColor=vec4(ink*(1.-shade*vec3(.23,.205,.175)),1.);
      }
    }`;
  function shader(type, source) {
    const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const uni=Object.fromEntries(['offset','rot','flash','scale','aspect','lightPass','shadowMap'].map(k=>[k,gl.getUniformLocation(program,k)]));
  const attrs=['pos','normal','color'].map(k=>gl.getAttribLocation(program,k));
  attrs.forEach(a=>gl.enableVertexAttribArray(a));
  const meshes={};
  function upload(data){
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    return {buffer,count:data.length/9};
  }
  for(const [name,b64] of Object.entries(FIELD_MESHES)){
    const raw=Int16Array.from(new Int16Array(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer));
    const data=Float32Array.from(raw,(v,i)=>v/(i%9<3?512:1024));
    meshes[name]=upload(data);
    if(name==='brick') meshes[name].data=data;
    if(name==='enemy'||name==='red'){
      const scout=new Float32Array(data),heavy=new Float32Array(data),twin=[];
      for(let i=0;i<data.length;i+=9){
        scout[i]*=.70;scout[i+1]*=.86;
        heavy[i]*=1.10;heavy[i+1]*=1.08;
      }
      for(let i=0;i<data.length;i+=27){
        const triangle=data.slice(i,i+27);
        const gun=[0,9,18].every(j=>Math.abs(triangle[j])<=.075 && triangle[j+1]>=.52 &&
          triangle[j+1]<=.636 && triangle[j+2]<-.16);
        if(gun){
          for(const side of [-1,1]){
            const barrel=triangle.slice();
            for(const j of [0,9,18])barrel[j]=side*.115+barrel[j]*.75;
            twin.push(...barrel);
          }
        }else twin.push(...triangle);
      }
      meshes[name+'F']=upload(scout);meshes[name+'H']=upload(heavy);
      meshes[name+'R']=upload(new Float32Array(twin));
    }
  }
  meshes.canopy=upload(buildCanopy());
  const skirts=new SceneMesh(),turretPlate=new SceneMesh();
  for(const side of [-1,1]){
    skirts.box(side*.405,.25,0,.17,.19,.86,0x58615e,0xb1b4a0);
    for(const z of [-.24,.24])skirts.box(side*.405,.44,z,.13,.024,.05,0x717c71);
  }
  turretPlate.box(0,.756,-.08,.45,.07,.41,0x596766,0xbfc1a9);
  turretPlate.box(0,.826,-.08,.06,.015,.28,0xd7bd7b);
  meshes.skirts=upload(skirts.data());meshes.turretPlate=upload(turretPlate.data());
  const tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,k,gl.NEAREST);
  const depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,1024,1024);
  const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw Error('無法建立 3D 畫面。');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  let previousWalls,previousStage,groves=[];
  function draw(name,x=0,z=0,angle=0,y=0,size=1,flash=0){
    const m=meshes[name];gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);
    attrs.forEach((a,i)=>gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*12));
    gl.uniform3f(uni.offset,x,y,z);gl.uniform2f(uni.rot,Math.cos(angle),Math.sin(angle));
    gl.uniform1f(uni.scale,size);gl.uniform1f(uni.flash,flash);
    gl.drawArrays(gl.TRIANGLES,0,m.count);
  }
  function drawRaid(s,shadows){
    if(!s.raid)return;
    const age=s.time-s.raid.start,targets=s.raid.targets;
    const plane=flightPosition(s.raid,age);
    if(s.raid.directionX*plane.x>FLIGHT_EDGE)return;
    const heading=Math.atan2(s.raid.directionX*s.raid.slope,s.raid.directionX),altitude=2.45;
    if(!shadows){
      // Show the marked footprint even when it falls beneath a tree or wall.
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
      for(const t of targets){
        if(age+1e-9<t.release-RAID_WARNING)continue;
        const sinceImpact=age-t.release-BOMB_FALL;
        if(!t.hit)draw('dangerRing',t.x,t.z,0,.025,BLAST_RADIUS,.10+.10*Math.sin(age*12));
        else if(sinceImpact<.36)draw('blastRing',t.x,t.z,0,.035,BLAST_RADIUS*(.22+.78*Math.max(0,sinceImpact)/.36));
      }
      gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
    }
    draw('plane',plane.x,plane.z,heading,altitude,PLANE_SCALE);
    for(const t of targets){
      if(t.hit||age<t.release)continue;
      const progress=Math.min(1,(age-t.release)/BOMB_FALL);
      const origin=flightPosition(s.raid,t.release);
      const x=origin.x*(1-progress)+t.x*progress;
      const z=origin.z*(1-progress)+t.z*progress;
      draw('bomb',x,z,0,(altitude-.1)*(1-progress*progress));
    }
  }
  function pass(s,shadows){
    draw(s.stage===0?'board':'stageBoard');if(s.base)draw('eagle',0,BASE_Z);draw('walls');
    for(const t of [s.player,...s.enemies]){
      if(!t.alive)continue;
      let flash=t.kind==='red' ? .20*(1+Math.sin(s.time*7)) : 0;
      if(t.guard>0)flash=.25*(1+Math.sin(s.time*17));
      const angle=t.dir*Math.PI/2;
      const variant=t.type&&t.type!=='N'?t.type:'';
      draw(t.kind+variant,t.x,t.z,angle,0,1,flash);
      if(t.type==='H'){
        if(t.hp>=2)draw('skirts',t.x,t.z,angle);
        if(t.hp===3)draw('turretPlate',t.x,t.z,angle);
      }
    }
    for(const grove of groves){
      const moving=[s.player,...s.enemies].some(t=>t.alive&&t.move&&Math.hypot(t.x-grove.x,t.z-grove.z)<.89);
      const sway=moving?.19*Math.sin(s.time*11):0;
      draw('canopy',grove.x,grove.z,grove.angle+sway);
    }
    for(const p of s.drops) draw('star',p.x,p.z,.26*Math.sin(s.time*2),.09*Math.sin(s.time*4));
    for(const b of s.shells) draw('shell',b.x,b.z,b.dir*Math.PI/2);
    for(const p of s.fx) draw(p.kind,p.x,p.z,p.life*5,p.y,p.size);
    drawRaid(s,shadows);
  }
  return function render(s){
    if(previousStage!==s.stage){
      previousStage=s.stage;
      if(meshes.stageBoard)gl.deleteBuffer(meshes.stageBoard.buffer);
      meshes.stageBoard=s.stage?upload(makeBoard(s.stage)):null;
      groves=[];
      if(s.stage===2)STAGES[s.stage].map.forEach((row,j)=>[...row].forEach((tile,i)=>{
        if(tile==='t')groves.push({x:i-8,z:j-5,angle:(i*7+j)*1.7});
      }));
    }
    if(previousWalls!==s.walls){
      previousWalls=s.walls;
      const parts=s.walls.flatMap(w=>BRICK_PARTS.flatMap(([dx,dz],i)=>
        (w.mask & (1<<i)) ? [{x:w.x+dx,z:w.z+dz}] : []));
      const brick=meshes.brick.data,data=new Float32Array(brick.length*parts.length);
      parts.forEach((part,j)=>{
        data.set(brick,j*brick.length);
        for(let i=j*brick.length;i<(j+1)*brick.length;i+=9){
          data[i]+=part.x;data[i+2]+=part.z;
          if(s.stage===3){data[i+7]*=1.25;data[i+8]*=1.12;}
          if(s.stage===5){const shade=data[i+6];data[i+6]=shade*.86;data[i+7]=shade*.85;data[i+8]=shade*.78;}
        }
      });
      if(meshes.walls)gl.deleteBuffer(meshes.walls.buffer);
      meshes.walls=upload(data);
    }
    const ratio=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.uniform1f(uni.aspect,w/h);
    gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    gl.viewport(0,0,1024,1024);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(uni.lightPass,1);pass(s,true);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.viewport(0,0,w,h);gl.clearColor(.32,.36,.33,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform1i(uni.lightPass,0);pass(s,false);
  };
}
