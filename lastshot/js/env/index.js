import sunsetHarbor from './themes/01-sunset-harbor.js';
import neonCity from './themes/02-neon-city.js';
import jungleRuins from './themes/03-jungle-ruins.js';
import alpinePass from './themes/04-alpine-pass.js';
import desertOasis from './themes/05-desert-oasis.js';
import { createGeometryKit, batchSegment, buildRoad, makeSky } from './core.js';

const definitions=[sunsetHarbor,neonCity,jungleRuins,alpinePass,desertOasis];
export const THEMES=Object.freeze(definitions.map(({buildSegment,...metadata})=>Object.freeze(metadata)));

/**
 * Engine-injected background factory; does not create a renderer, loop, game UI or characters.
 * Coordinate contract: +Y up, forward -Z, road top Y=0, road width default 10.
 * update(distance,time,delta) accepts absolute forward distance; do not pass velocity.
 */
export function createRunnerEnvironment(THREE, options={}) {
  const theme=definitions.find(t=>t.id===(options.theme ?? 'sunset-harbor'));
  if(!theme) throw new RangeError(`Unknown theme: ${options.theme}. Use THEMES.map(t=>t.id).`);
  const quality=options.quality==='low'?'low':'high';
  const roadWidth=options.roadWidth ?? 10;
  if(!Number.isFinite(roadWidth)||roadWidth<=0) throw new RangeError('roadWidth must be a positive finite number.');
  const segmentCount=Math.max(4,Math.min(8,Math.round(options.segmentCount ?? (quality==='low'?4:5))));
  if(!Number.isFinite(segmentCount)) throw new RangeError('segmentCount must be a finite number.');
  const seed=options.seed ?? 38691;
  const group=new THREE.Group();group.name=`Runner environment / ${theme.id}`;
  const kit=createGeometryKit(THREE,quality,seed);
  const chunks=[],animations=[];
  for(let i=0;i<segmentCount;i++) {
    const chunk=new THREE.Group();chunk.name=`Reusable segment ${i}`;
    const ctx=kit.context(chunk,animations,seed+i*1791);
    if(options.includeRoad!==false) buildRoad(ctx,theme);
    theme.buildSegment(ctx,i);
    batchSegment(THREE,chunk);
    chunk.scale.x=roadWidth/10;
    group.add(chunk);chunks.push(chunk);
  }
  if(options.includeSky!==false) group.add(makeSky(THREE,theme.palette));
  const lights=new THREE.Group();lights.name='Optional environment lights';
  if(options.includeLighting!==false) {
    const l=theme.lighting;
    lights.add(new THREE.HemisphereLight(l.sky,l.ground,theme.id==='neon-city'?2.0:2.6));
    const sun=new THREE.DirectionalLight(l.sun,l.intensity ?? 2.7);
    sun.position.set(...(l.sunPosition ?? [-24,40,12]));
    sun.target.position.set(0,0,-22);
    sun.castShadow=quality==='high';
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-42,right:42,top:50,bottom:-50,near:1,far:150});
    sun.shadow.normalBias=0.08;sun.shadow.bias=-0.00025;
    lights.add(sun,sun.target);
    group.add(lights);
  }
  let disposed=false;
  const restorers=new Set();
  const sceneRestorers=new WeakMap();
  function update(distance=0,time=0,delta=0) {
    if(disposed) return;
    if(!Number.isFinite(distance)||!Number.isFinite(time)||!Number.isFinite(delta)) return;
    const cycle=segmentCount*48;
    for(let i=0;i<chunks.length;i++) {
      const origin=24-i*48+distance;
      chunks[i].position.z=72-((72-origin)%cycle+cycle)%cycle;
    }
    for(const animate of animations) animate(time,Math.max(0,delta));
  }
  function configureScene(scene) {
    if(disposed) throw new Error('Cannot configure a disposed environment.');
    if(sceneRestorers.has(scene)) return sceneRestorers.get(scene);
    const previousFog=scene.fog, previousBackground=scene.background;
    const fog=new THREE.Fog(theme.palette.fog,quality==='low'?45:55,quality==='low'?150:200);
    const background=new THREE.Color(theme.palette.skyBottom);
    scene.fog=fog; scene.background=background;
    let restored=false;
    const restore=()=>{
      if(restored) return;restored=true;
      if(scene.fog===fog) scene.fog=previousFog;
      if(scene.background===background) scene.background=previousBackground;
      restorers.delete(restore);
      sceneRestorers.delete(scene);
    };
    restorers.add(restore);sceneRestorers.set(scene,restore);return restore;
  }
  function dispose() {
    if(disposed) return;disposed=true;
    for(const restore of [...restorers].reverse()) restore();
    const geometries=new Set(kit.geometries.values()),materials=new Set(kit.materials.values());
    group.traverse(object=>{
      if(object.geometry) geometries.add(object.geometry);
      if(object.material) for(const m of Array.isArray(object.material)?object.material:[object.material]) materials.add(m);
      if(object.isInstancedMesh) object.dispose();
      if(object.isLight && object.shadow) object.shadow.dispose();
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    animations.length=0;group.removeFromParent();group.clear();
  }
  update(0,0,0);
  return {
    group,lights,update,dispose,configureScene,
    metadata:THEMES.find(t=>t.id===theme.id),
    layout:Object.freeze({forwardAxis:'-Z',upAxis:'+Y',roadY:0,roadWidth,roadHalfWidth:roadWidth/2,segmentLength:48,segmentCount}),
    cameraPose:{position:[0,22,27],target:[0,0,-23],fov:48,near:0.1,far:320}
  };
}
