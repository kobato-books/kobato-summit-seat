/* 小鳩の山頂席 / PC最小試作 v0.1.0 — A-Frame 1.8.0 / no network or storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DURATION = 90;
  const WING_DURATION = 1.6;
  const state = {ready:false, running:false, elapsed:0, flaps:0, muted:false,
    yaw:0, pitch:-5, lookDistance:0, drag:null, wingTime:0, bellTime:0,
    stoppedReason:'', audioStatus:'not-started', frames:0, renderSeconds:0};
  const keys = new Set();
  let THREE, scene, camera, wings=[], bellPivot, cloudGroup, audio, lastTime=0, responseUntil=0;
  let frameHandle, audioReady=false, seed=4871, software=false, softwareDirty=true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const random = () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  function fail(message) {
    state.ready=false; state.running=false;
    if (audio) audio.suspend();
    $('welcome').hidden=true; $('hud').hidden=true; $('ending').hidden=true;
    $('failure').hidden=false;
    if(message) $('failure-message').textContent=message;
  }
  if(!window.AFRAME) {fail('A-Frameを読み込めませんでした。ZIPをすべて展開してから、index.htmlを開いてください。');return;}

  function material(color, extra={}) {
    return new THREE.MeshLambertMaterial({color, flatShading:true, ...extra});
  }
  function mesh(geometry, mat, parent, x=0,y=0,z=0) {
    const m=new THREE.Mesh(geometry,mat); m.position.set(x,y,z);parent.add(m);return m;
  }
  function rod(parent, a,b,r,mat) {
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),v=to.clone().sub(from);
    const m=mesh(new THREE.CylinderGeometry(r,r,v.length(),7),mat,parent);
    m.position.copy(from.add(to).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;
  }
  function glowTexture() {
    const c=document.createElement('canvas');c.width=c.height=128;
    const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,3,64,64,64);
    g.addColorStop(0,'rgba(255,246,219,1)');g.addColorStop(.24,'rgba(255,236,198,.85)');
    g.addColorStop(.62,'rgba(255,232,208,.35)');g.addColorStop(1,'rgba(255,235,214,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  }

  function buildSky(root) {
    const sky=new THREE.Mesh(new THREE.SphereGeometry(780,32,20),new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 direction;
        void main(){vec3 d=normalize(direction);float h=d.y;
        vec3 low=vec3(.79,.72,.65),mid=vec3(.84,.66,.51),high=vec3(.16,.29,.43);
        vec3 col=mix(low,mid,smoothstep(-.06,.12,h));
        col=mix(col,high,smoothstep(.07,.75,h));
        float warmth=pow(max(0.,dot(d,normalize(vec3(.42,.16,-1.)))),14.);
        col=mix(col,vec3(1.,.78,.48),warmth*.5);gl_FragColor=vec4(col,1.);}`
    }));root.add(sky);
    const sunMat=new THREE.SpriteMaterial({map:glowTexture(),color:0xffdf9f,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const glow=new THREE.Sprite(sunMat);glow.position.set(96,32,-230);glow.scale.set(115,115,1);root.add(glow);
    const sun=mesh(new THREE.SphereGeometry(7,24,16),new THREE.MeshBasicMaterial({color:0xffefd0}),root,96,32,-230);
    sun.renderOrder=-1;
  }

  function mountain(root,x,z,r,height,color) {
    const segments=software?8:18, geometry=new THREE.PlaneGeometry(r*2,r*2,segments,segments);
    geometry.rotateX(-Math.PI/2);
    const pos=geometry.attributes.position;
    const shift=random()*6.28;
    for(let i=0;i<pos.count;i++){
      const px=pos.getX(i)/r,pz=pos.getZ(i)/r;
      const distance=Math.sqrt(px*px*.8+pz*pz);
      const h=Math.max(0,1-distance);
      const detail=Math.sin(px*10+shift)*Math.cos(pz*9+shift)*.12;
      pos.setY(i,(Math.pow(h,1.5)+detail*h)*height-21);
    }
    geometry.computeVertexNormals();
    const m=mesh(geometry,material(color,{side:THREE.DoubleSide}),root,x,0,z);
    m.rotation.y=random()*Math.PI;return m;
  }

  function buildLandscape(root) {
    buildSky(root);
    root.add(new THREE.HemisphereLight(0xd2e2f4,0x6c6556,2.1));
    const light=new THREE.DirectionalLight(0xffcf8f,3.0);light.position.set(60,55,-90);root.add(light);
    scene.object3D.fog=new THREE.FogExp2(0xafaead,.0028);
    const rings=[{r:360,n:14,h:100,c:0x6f8198},{r:210,n:12,h:64,c:0x526e84},{r:108,n:10,h:43,c:0x31566a}];
    for(const ring of rings) for(let i=0;i<ring.n;i++){
      const a=i/ring.n*Math.PI*2+random()*.14;
      mountain(root,Math.sin(a)*ring.r,Math.cos(a)*ring.r,ring.r*.27+random()*ring.r*.13,ring.h*(.55+random()*.6),ring.c);
    }
    const cloudTex=glowTexture(); cloudGroup=new THREE.Group();root.add(cloudGroup);
    // Horizontal mist layer plus soft, shallow puffs. All textures are generated locally.
    mesh(new THREE.CircleGeometry(650,64),new THREE.MeshBasicMaterial({color:0xddd9cd,side:THREE.DoubleSide,transparent:true,opacity:.67}),root,0,-17,0).rotation.x=-Math.PI/2;
    for(let i=0;i<(software?24:155);i++){
      const a=random()*Math.PI*2,r=24+Math.pow(random(),.6)*330;
      const m=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex,color:i%3?0xe4dfd1:0xd2d8da,transparent:true,opacity:.65,depthWrite:false,fog:true}));
      m.position.set(Math.cos(a)*r,-13+random()*4,Math.sin(a)*r);
      const s=24+random()*58;m.scale.set(s,s*.36,1);cloudGroup.add(m);
    }
    // The seat stays on one fixed rocky outcrop.
    mountain(root,0,8,17,27,0x304b4b);
    const stone=mesh(new THREE.DodecahedronGeometry(7,0),material(0x435652),root,0,-4,2);stone.scale.set(1,.55,1);
    const trunk=material(0x61523e),leaf=material(0x304e46);
    for(const side of [-1,1]){
      for(let i=0;i<4;i++){
        const x=side*(5+random()*8),z=3+random()*10,h=1.6+random()*3;
        rod(root,[x,-1,z],[x,h,z],.12,trunk);
        for(let j=0;j<3;j++)mesh(new THREE.ConeGeometry(h*(.4-j*.07),h*.75,7),leaf,root,x,h-j*h*.23,z);
      }
    }
  }

  function buildSeat(root) {
    const wood=material(0x997247),edge=material(0x5d4834),grain=material(0x795c3f);
    for(let i=0;i<15;i++){
      mesh(new THREE.BoxGeometry(5.6,.13,.29),wood,root,0,-.12,1.6-i*.3);
      for(let j=0;j<2;j++)mesh(new THREE.BoxGeometry(.7+random()*2,.003,.007),grain,root,(random()-.5)*2,.0,1.6-i*.3+(random()-.5)*.14);
    }
    rod(root,[-2.8,-.14,-2.77],[2.8,-.14,-2.77],.13,edge);
    for(const side of [-1,1]){
      rod(root,[side*2.75,-.1,-2.7],[side*2.75,.83,-2.7],.075,edge);
      rod(root,[side*2.75,-.1,.6],[side*2.75,.83,.6],.075,edge);
      rod(root,[side*2.75,.8,-2.7],[side*2.75,.8,.6],.055,edge);
    }
    // A small branch carries the wind chime, within sight from the seat.
    rod(root,[2.45,-.05,-2.5],[2.45,3.1,-2.5],.065,edge);
    rod(root,[2.45,3.08,-2.5],[1.4,3.08,-2.5],.045,edge);
    rod(root,[1.55,3.08,-2.5],[1.55,2.75,-2.5],.006,material(0xd8c89f));
    bellPivot=new THREE.Group();bellPivot.position.set(1.55,2.75,-2.5);root.add(bellPivot);
    const glass=material(0xbed2d1,{transparent:true,opacity:.72,side:THREE.DoubleSide});
    mesh(new THREE.SphereGeometry(.18,18,12,0,Math.PI*2,0,Math.PI*.6),glass,bellPivot,0,-.16,0);
    mesh(new THREE.TorusGeometry(.173,.009,6,24),material(0xb49b6b),bellPivot,0,-.215,0).rotation.x=Math.PI/2;
    rod(bellPivot,[0,-.08,0],[0,-.64,0],.004,material(0xc6b68a));
    mesh(new THREE.BoxGeometry(.1,.28,.009),material(0xf3dfb9),bellPivot,0,-.67,0);
    mesh(new THREE.SphereGeometry(.025,8,6),material(0xb7935a),bellPivot,0,-.23,0);
  }

  function buildWings(root) {
    const featherMats=[0xb6c5cf,0x9dafc1,0x8b9db1,0xced6da].map(c=>material(c));
    for(const side of [-1,1]){
      const pivot=new THREE.Group();pivot.position.set(side*.19,.97,-1.05);root.add(pivot);
      const body=new THREE.Group();body.scale.x=side;pivot.add(body);
      const cover=mesh(new THREE.SphereGeometry(.35,14,10),featherMats[0],body,.24,-.02,-.04);cover.scale.set(1.2,.22,.78);
      for(let i=0;i<9;i++){
        const outline=new THREE.Shape();outline.moveTo(0,-.45);
        outline.bezierCurveTo(.2,-.2,.18,.3,0,.55);outline.bezierCurveTo(-.18,.3,-.2,-.2,0,-.45);
        const shape=new THREE.ExtrudeGeometry(outline,{depth:.02,bevelEnabled:false,curveSegments:4});shape.rotateX(Math.PI/2);
        const m=mesh(shape,featherMats[i%4],body,.27+i*.09,-.02-i*.009,-.06+i*.015);
        m.scale.set(.7,1,.62+i*.025);m.rotation.y=-.15+i*.085;
      }
      pivot.rotation.z=side*-.16;wings.push({pivot,side});
    }
  }

  function setupAudio() {
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio){state.audioStatus='unsupported';return;}
      if(!audio){
        audio=new Audio();audio.master=audio.createGain();audio.master.gain.value=state.muted?0:.34;audio.master.connect(audio.destination);
        const buffer=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        const wind=audio.createBufferSource();wind.buffer=buffer;wind.loop=true;
        const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=440;
        const gain=audio.createGain();gain.gain.value=.07;wind.connect(filter);filter.connect(gain);gain.connect(audio.master);wind.start();
      }
      audio.resume().then(()=>{audioReady=true;state.audioStatus=audio.state;}).catch(()=>{state.audioStatus='blocked';showResponse('音を再生できません。景色と翼はそのまま試せます。');});
    }catch(e){state.audioStatus='unavailable';}
  }
  function chime() {
    if(!audioReady||!audio||state.muted)return;
    const t=audio.currentTime;
    // A quiet synthesized glass chime. Not a recording or a medical sound effect.
    for(const [i,hz] of [1661,2492,3323].entries()){
      const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=hz;
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.075/(i+1),t+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,t+2.1-i*.25);
      osc.connect(gain);gain.connect(audio.master);osc.start(t);osc.stop(t+2.2);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
  }
  function showResponse(text) {$('response').textContent=text;$('response').classList.add('visible');responseUntil=performance.now()+3200;}
  function flap() {
    if(!state.running||document.hidden||state.wingTime>0)return;
    state.flaps++;state.wingTime=WING_DURATION;state.bellTime=3.5;chime();
    showResponse(state.muted?'翼が動いて、風鈴が揺れました。':'翼から届いた風に、風鈴が揺れました。');
    if(window.kobatoReview)document.body.dataset.review=JSON.stringify(window.kobatoReview());
  }
  function setView(yaw,pitch) {
    const next=clamp(pitch,-82,72);
    state.lookDistance+=Math.abs(yaw-state.yaw)+Math.abs(next-state.pitch);
    state.yaw=yaw;state.pitch=next;
    camera.object3D.rotation.set(next*Math.PI/180,yaw*Math.PI/180,0,'YXZ');
  }
  function start() {
    if(!state.ready)return;
    state.running=true;state.elapsed=0;state.flaps=0;state.lookDistance=0;state.wingTime=0;state.bellTime=0;
    state.stoppedReason='';state.frames=0;state.renderSeconds=0;state.drag=null;keys.clear();
    setView(0,-5);state.lookDistance=0;lastTime=performance.now();
    $('welcome').hidden=true;$('ending').hidden=true;$('hud').hidden=false;$('paused').hidden=true;
    $('response').textContent='';$('response').classList.remove('visible');setupAudio();updateHud();
    $('flap').focus({preventScroll:true});
  }
  function finish(reason) {
    if(!state.running)return;
    state.running=false;state.stoppedReason=reason;state.drag=null;keys.clear();
    if(audio)audio.suspend().catch(()=>{});
    $('hud').hidden=true;$('ending').hidden=false;
    $('end-message').textContent=reason==='complete'?'90秒の、小さな旅でした。':'ここで、ひと休みしましょう。';
    $('session-summary').textContent=`体験 ${Math.round(state.elapsed)}秒 ／ 羽ばたき ${state.flaps}回 ／ ${state.lookDistance>8?'視点を動かしました':'視点の移動はありませんでした'}`;
    if(window.kobatoReview)document.body.dataset.review=JSON.stringify(window.kobatoReview());
    $('restart').focus({preventScroll:true});
  }
  function updateHud() {
    $('remaining').textContent=Math.max(0,Math.ceil(DURATION-state.elapsed));
    $('progress').style.width=`${state.elapsed/DURATION*100}%`;
    const n=state.elapsed<25?0:state.elapsed<60?1:2;
    const chapters=[['01 / 山頂の席','雲海を、見回してみよう。','景色をドラッグすると、視線を動かせます。'],
      ['02 / 小鳩の身体','少し下を向くと、あなたの翼。','羽ばたくボタン、またはSpaceを1回押してみてください。'],
      ['03 / 風の届くところ','ひと羽ばたきの、余韻を。','右上の風鈴も、あなたの起こした風で揺れます。']][n];
    $('chapter-number').textContent=chapters[0];$('chapter-title').textContent=chapters[1];$('chapter-hint').textContent=chapters[2];
    if(window.kobatoReview)document.body.dataset.review=JSON.stringify(window.kobatoReview());
  }
  function animate(now) {
    frameHandle=requestAnimationFrame(animate);
    const dt=Math.max(0,(now-lastTime)/1000);lastTime=now;
    if(!state.running||document.hidden){
      if(software&&softwareDirty){scene.renderer.render(scene.object3D,camera.object3D);softwareDirty=false;}
      return;
    }
    state.elapsed=Math.min(DURATION,state.elapsed+dt);state.frames++;state.renderSeconds+=dt;
    const step=36*Math.min(dt,.06);
    const horizontal=(keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0);
    const vertical=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    if(horizontal||vertical)setView(state.yaw+horizontal*step,state.pitch+vertical*step);
    if(state.wingTime>0)state.wingTime=Math.max(0,state.wingTime-dt);
    const phase=(WING_DURATION-state.wingTime)/WING_DURATION;
    const beat=state.wingTime>0?Math.sin(phase*Math.PI*2)*Math.sin(phase*Math.PI):0;
    wings.forEach(({pivot,side})=>{pivot.rotation.z=side*(-.16+beat*(reducedMotion?.25:.65));});
    if(state.bellTime>0)state.bellTime=Math.max(0,state.bellTime-dt);
    bellPivot.rotation.z=state.bellTime>0?Math.sin((3.5-state.bellTime)*11)*.24*(state.bellTime/3.5):0;
    if(!reducedMotion)cloudGroup.rotation.y=state.elapsed*.00013;
    if(now>responseUntil)$('response').classList.remove('visible');
    if(software){scene.renderer.render(scene.object3D,camera.object3D);softwareDirty=false;}
    updateHud();if(state.elapsed>=DURATION)finish('complete');
  }

  function wireInput() {
    const canvas=scene.canvas;
    canvas.tabIndex=0;canvas.setAttribute('aria-label','山頂の景色。ドラッグまたは矢印キーで見回す。Spaceで羽ばたく。');
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('3Dの表示が停止しました。タブを再読み込みし、再発する場合はこのPCでは保留として記録してください。');});
    canvas.addEventListener('pointerdown',e=>{
      if(!state.running||e.button!==0)return;
      state.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:0};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!state.running||!state.drag)return;
      const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
      state.drag.moved+=Math.abs(dx)+Math.abs(dy);state.drag.x=e.clientX;state.drag.y=e.clientY;
      setView(state.yaw-dx*.17,state.pitch-dy*.17);
    });
    canvas.addEventListener('pointerup',e=>{
      if(!state.drag)return;const click=state.drag.moved<6;state.drag=null;
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(click)flap();
    });
    canvas.addEventListener('pointercancel',()=>{state.drag=null;});
    window.addEventListener('keydown',e=>{
      if(!state.running||e.target.tagName==='TEXTAREA')return;
      if(e.code==='Escape'){e.preventDefault();finish('user');return;}
      // On focused buttons, let their native Space/Enter activation work once.
      if(e.target.tagName==='BUTTON'&&(e.code==='Space'||e.code==='Enter'))return;
      if(e.code==='Space'){e.preventDefault();if(!e.repeat)flap();}
      if(e.key.startsWith('Arrow')){
        e.preventDefault();
        if(!keys.has(e.key))setView(state.yaw+(e.key==='ArrowLeft'?4:e.key==='ArrowRight'?-4:0),state.pitch+(e.key==='ArrowUp'?4:e.key==='ArrowDown'?-4:0));
        keys.add(e.key);
      }
    });
    window.addEventListener('keyup',e=>keys.delete(e.key));
    window.addEventListener('blur',()=>{keys.clear();state.drag=null;});
    document.addEventListener('visibilitychange',()=>{
      lastTime=performance.now();keys.clear();state.drag=null;
      if(!state.running)return;
      $('paused').hidden=!document.hidden;
      if(audio){if(document.hidden)audio.suspend().catch(()=>{});else audio.resume().catch(()=>{});}
    });
    $('start').addEventListener('click',start);$('restart').addEventListener('click',start);
    $('flap').addEventListener('click',()=>{flap();canvas.focus({preventScroll:true});});$('stop').addEventListener('click',()=>finish('user'));
    $('recenter').addEventListener('click',()=>{setView(0,-5);canvas.focus({preventScroll:true});});
    $('mute').addEventListener('click',()=>{
      state.muted=!state.muted;$('mute').textContent=state.muted?'音：オフ':'音：オン';
      $('mute').setAttribute('aria-pressed',String(state.muted));
      if(audio)audio.master.gain.setTargetAtTime(state.muted?0:.34,audio.currentTime,.025);
      canvas.focus({preventScroll:true});
      if(window.kobatoReview)document.body.dataset.review=JSON.stringify(window.kobatoReview());
    });
    $('download').addEventListener('click',()=>{
      const report=['小鳩の山頂席 / PC試作 v0.1.0',`記録日時: ${new Date().toLocaleString('ja-JP')}`,`描画: ${software?'Canvas 2Dで3D形状を投影（軽量表示）':'A-Frame / WebGL'}`,
        `体験秒数: ${state.elapsed.toFixed(1)} / 90`,`終了: ${state.stoppedReason==='complete'?'90秒完了':'途中終了'}`,
        `羽ばたき: ${state.flaps}回`,`視点移動: ${state.lookDistance>8?'あり':'なし'}`,`音の設定: ${state.muted?'オフ':'オン'}（実際の聞こえ方は本人確認）`,
        '', '本人メモ:', $('impression').value||'（未記入）','',
        'PC画面の試作。VR機器・身体感覚・立体感・酔い・需要・販売可能性は未検証。','このファイルは本人操作でローカル保存。外部送信なし。'].join('\r\n');
      const u=URL.createObjectURL(new Blob(['\ufeff'+report],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');
      a.href=u;a.download='KOBATO_Summit_Review.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);
    });
  }

  async function init() {
    try{
      THREE=AFRAME.THREE;
      if(software){
        const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;touch-action:none;cursor:grab';$('experience').append(canvas);
        scene={object3D:new THREE.Scene(),canvas,renderer:null};
        camera={object3D:new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.08,1100)};camera.object3D.position.y=1.6;
        scene.renderer=softwareRenderer(canvas);
        $('edition').textContent='PC最小試作 01 ／ 軽量表示';
      }else{scene=$('experience').querySelector('a-scene');camera=$('view');}
      const root=new THREE.Group();
      if(software)scene.object3D.add(root);else $('world').object3D.add(root);
      buildLandscape(root);buildSeat(root);buildWings(software?root:$('seat').object3D);
      scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      wireInput();setView(0,-5);state.lookDistance=0;
      state.ready=true;$('start').disabled=false;$('start').textContent='山頂席へ、どうぞ';
      lastTime=performance.now();frameHandle=requestAnimationFrame(animate);
      // Read-only diagnostics for review, with no persistence or network.
      window.kobatoReview=()=>({version:'0.1.0',mode:'PC only',...state,drag:state.drag?{active:true}:null,
        wingAngles:wings.map(w=>w.pivot.rotation.z),bellAngle:bellPivot.rotation.z,
        audioContext:audio?audio.state:'not-started',drawCalls:scene.renderer.info.render.calls,
        triangles:scene.renderer.info.render.triangles,lastRenderMs:scene.renderer.info.render.ms||null,
        masterGain:audio?audio.master.gain.value:null,backend:software?'Canvas2D projected 3D':'A-Frame WebGL',webglVersion:software?'unavailable':scene.renderer.capabilities.isWebGL2?'WebGL2':'WebGL',
        reducedMotion,storage:'none',network:'none',approxFrameRate:state.renderSeconds?Math.round(state.frames/state.renderSeconds):null});
    }catch(error){console.error('小鳩の山頂席: initialization failed',error);fail();}
  }
  // One scene model, two PC drawing backends. Software mode is not a VR emulator.
  function softwareRenderer(canvas){
    const ctx=canvas.getContext('2d',{alpha:false}),mvp=new THREE.Matrix4(),vp=new THREE.Matrix4();
    const faces=[],sprites=[],vec=new THREE.Vector3(),cache=new WeakMap();
    const cloudImage=glowTexture().image;
    const info={render:{calls:0,triangles:0}};
    function resize(){const ratio=Math.min(devicePixelRatio||1,900/innerWidth,660/innerHeight);canvas.width=Math.floor(innerWidth*ratio);canvas.height=Math.floor(innerHeight*ratio);camera.object3D.aspect=innerWidth/innerHeight;camera.object3D.updateProjectionMatrix();softwareDirty=true;}
    addEventListener('resize',resize);resize();
    return {info,capabilities:{isWebGL2:false},setPixelRatio(){},render(world,cam){
      const renderStarted=performance.now();
      const w=canvas.width,h=canvas.height;
      // Horizon shifts with the user's view; no automatic camera movement.
      const horizon=h*(.5+state.pitch/80);
      const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#47657e');sky.addColorStop(clamp(horizon/h,.06,.94),'#d8b99a');sky.addColorStop(1,'#b6c4c4');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      world.updateMatrixWorld(true);cam.updateMatrixWorld(true);cam.matrixWorldInverse.copy(cam.matrixWorld).invert();vp.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
      faces.length=0;sprites.length=0;let calls=0;
      world.traverse(obj=>{
        if(!obj.visible)return;
        if(obj.isSprite){
          vec.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
          if(vec.z>=-.1)return;const depth=-vec.z;vec.applyMatrix4(cam.projectionMatrix);
          sprites.push({x:(vec.x*.5+.5)*w,y:(-.5*vec.y+.5)*h,sx:obj.scale.x/depth*h*.75,sy:obj.scale.y/depth*h*.75,depth,sun:obj.material.blending===THREE.AdditiveBlending});return;
        }
        if(!obj.isMesh||obj.material.isShaderMaterial||obj.material.isMeshBasicMaterial||obj.geometry.type==='CircleGeometry')return;
        const geo=obj.geometry,mat=obj.material;let item=cache.get(geo);
        if(!item){
          const p=geo.attributes.position,n=geo.attributes.normal,ix=geo.index;
          const cols=[],ids=[],base=mat.color.clone().convertLinearToSRGB();
          for(let j=0;j<(ix?ix.count:p.count);j+=3){
            const a=ix?ix.getX(j):j,b=ix?ix.getX(j+1):j+1,c=ix?ix.getX(j+2):j+2;
            const shade=.64+.34*Math.max(0,n?n.getX(a)*.3+n.getY(a)*.65-n.getZ(a)*.7:.5);
            const r=Math.min(255,Math.round(base.r*255*shade)),g=Math.min(255,Math.round(base.g*255*shade)),bl=Math.min(255,Math.round(base.b*255*shade));
            cols.push([r,g,bl]);ids.push([a,b,c]);
          }
          item={p,ids,cols,projected:new Float32Array(p.count*4)};cache.set(geo,item);
        }
        mvp.multiplyMatrices(vp,obj.matrixWorld);const e=mvp.elements,pp=item.projected,p=item.p;
        for(let j=0;j<p.count;j++){
          const x=p.getX(j),y=p.getY(j),z=p.getZ(j),qw=e[3]*x+e[7]*y+e[11]*z+e[15],k=j*4;
          pp[k]=((e[0]*x+e[4]*y+e[8]*z+e[12])/qw*.5+.5)*w;
          pp[k+1]=(-(e[1]*x+e[5]*y+e[9]*z+e[13])/qw*.5+.5)*h;pp[k+2]=qw;pp[k+3]=0;
        }
        calls++;
        for(let j=0;j<item.ids.length;j++){
          const ids=item.ids[j],a=ids[0]*4,b=ids[1]*4,c=ids[2]*4;
          if(pp[a+2]<.08||pp[b+2]<.08||pp[c+2]<.08)continue;
          if(mat.side!==THREE.DoubleSide&&(pp[b]-pp[a])*(pp[c+1]-pp[a+1])-(pp[b+1]-pp[a+1])*(pp[c]-pp[a])>=0)continue;
          if((pp[a]<0&&pp[b]<0&&pp[c]<0)||(pp[a]>w&&pp[b]>w&&pp[c]>w)||(pp[a+1]<0&&pp[b+1]<0&&pp[c+1]<0)||(pp[a+1]>h&&pp[b+1]>h&&pp[c+1]>h))continue;
          const depth=(pp[a+2]+pp[b+2]+pp[c+2])/3;
          faces.push({pp,a,b,c,depth,color:item.cols[j],opacity:mat.opacity});
        }
      });
      // Blend distant geometry with mist; sort actual 3D triangles back to front.
      const items=faces.concat(sprites).sort((a,b)=>b.depth-a.depth);
      for(const face of items){
        if(face.pp){
          const {pp,a,b,c,color,depth}=face,fog=clamp(1-Math.exp(-depth*.002),0,.72);
          ctx.globalAlpha=face.opacity;
          ctx.fillStyle=`rgb(${Math.round(color[0]*(1-fog)+174*fog)},${Math.round(color[1]*(1-fog)+180*fog)},${Math.round(color[2]*(1-fog)+181*fog)})`;
          ctx.beginPath();ctx.moveTo(pp[a],pp[a+1]);ctx.lineTo(pp[b],pp[b+1]);ctx.lineTo(pp[c],pp[c+1]);ctx.closePath();ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.55;ctx.stroke();
        }else{
          if(face.sx<=0||face.sy<=0||face.x+face.sx<0||face.x-face.sx>w||face.y+face.sy<0||face.y-face.sy>h)continue;
          ctx.globalAlpha=face.sun?.75:.52;
          ctx.drawImage(cloudImage,face.x-face.sx*.5,face.y-face.sy*.5,face.sx,face.sy);
          if(face.sun){ctx.globalAlpha=1;ctx.fillStyle='#fff0c9';ctx.beginPath();ctx.arc(face.x,face.y,face.sx*.06,0,Math.PI*2);ctx.fill();}
        }
      }
      ctx.globalAlpha=1;info.render.calls=calls;info.render.triangles=faces.length;info.render.ms=performance.now()-renderStarted;
    }};
  }
  THREE=AFRAME.THREE;
  const probe=document.createElement('canvas');
  try{software=!probe.getContext('webgl2');}catch(e){software=true;}
  if(software)init();else{
    const template=$('scene-template');$('experience').append(template.content.cloneNode(true));
    const sceneEl=document.querySelector('a-scene');
    if(sceneEl.hasLoaded)init();else sceneEl.addEventListener('loaded',init,{once:true});
  }
  setTimeout(()=>{if(!state.ready&&$('failure').hidden)fail('3Dの準備が完了しませんでした。ブラウザを再読み込みし、同じ状態ならPCの表示環境を確認してください。');},20000);
})();
