/** Shared procedural geometry. No assets, network calls, DOM or global THREE. */
export function seededRandom(seed = 34791) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGeometryKit(THREE, quality, seed) {
  const geometries = new Map();
  const materials = new Map();
  const random = seededRandom(seed);
  const cached = (key, make) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  };
  function material(color, options = {}) {
    const { unlit, dynamic, segments, detail, castShadow, receiveShadow, ...rest } = options;
    const params = { color, ...rest };
    if (!unlit) Object.assign(params, { roughness: rest.roughness ?? 0.92, metalness: rest.metalness ?? 0, flatShading: rest.flatShading ?? true });
    if (unlit) {
      delete params.roughness; delete params.metalness; delete params.flatShading;
      delete params.emissive; delete params.emissiveIntensity;
    }
    if (params.opacity !== undefined && params.opacity < 1) params.transparent = true;
    if (params.transparent && params.depthWrite === undefined) params.depthWrite = false;
    const key = (unlit ? 'basic:' : 'standard:') + JSON.stringify(params);
    if (!materials.has(key)) materials.set(key, unlit ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial(params));
    return materials.get(key);
  }
  function context(root, animations, segmentSeed) {
    const rand = seededRandom(segmentSeed);
    const add = object => { root.add(object); return object; };
    function mesh(geometry, color, x, y, z, scale, options = {}) {
      const obj = new THREE.Mesh(geometry, material(color, options));
      obj.position.set(x, y, z);
      if (scale) obj.scale.set(...scale);
      obj.castShadow = options.castShadow ?? (!options.unlit && !options.transparent);
      obj.receiveShadow = options.receiveShadow ?? !options.unlit;
      if (options.dynamic) obj.userData.dynamic = true;
      return add(obj);
    }
    const box = (w, h, d, c, x, y, z, o = {}) => mesh(cached('box', () => new THREE.BoxGeometry(1, 1, 1)), c, x, y, z, [w,h,d], o);
    const cyl = (rt, rb, h, c, x, y, z, o = {}) => mesh(cached(`cyl:${rt}:${rb}:${o.segments ?? 8}`, () => new THREE.CylinderGeometry(rt, rb, 1, o.segments ?? 8)), c, x, y, z, [1,h,1], o);
    const cone = (r, h, c, x, y, z, o = {}) => mesh(cached(`cone:${o.segments ?? 7}`, () => new THREE.ConeGeometry(1, 1, o.segments ?? 7)), c, x, y, z, [r,h,r], o);
    const sphere = (r, c, x, y, z, o = {}) => mesh(cached(`ico:${o.detail ?? 0}`, () => new THREE.IcosahedronGeometry(1, o.detail ?? 0)), c, x, y, z, [r,r,r], o);
    function rock(x,y,z,sx,sy,sz,c) {
      const obj = sphere(1,c,x,y,z);
      obj.scale.set(sx,sy,sz); obj.rotation.set(rand()*0.3,rand()*Math.PI,rand()*0.25);
      return obj;
    }
    function beam(a,b,r,c,o={}) {
      const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.sub(start);
      const mid = start.clone().addScaledVector(delta,0.5);
      const obj = cyl(r,r,delta.length(),c,mid.x,mid.y,mid.z,o);
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      return obj;
    }
    return { THREE, root, quality, length:48, random:rand, box, cyl, cone, sphere, rock, beam, material, add, animate:fn=>animations.push(fn) };
  }
  return { context, geometries, materials, random };
}

/** Flatten static geometry into one instanced draw per geometry/material/shadow pair. */
export function batchSegment(THREE, root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map();
  root.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
    for(let parent = object; parent && parent !== root; parent=parent.parent) if(parent.userData.dynamic) return;
    if(object.material.transparent) return;
    const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if(!batches.has(key)) batches.set(key, []);
    batches.get(key).push({ object, matrix: new THREE.Matrix4().multiplyMatrices(inverse,object.matrixWorld) });
  });
  for (const entries of batches.values()) {
    if(entries.length < 2) continue;
    const original = entries[0].object;
    const batch = new THREE.InstancedMesh(original.geometry, original.material, entries.length);
    batch.name = 'Batched environment detail';
    batch.castShadow = original.castShadow; batch.receiveShadow=original.receiveShadow;
    entries.forEach(({object,matrix},i)=>{batch.setMatrixAt(i,matrix); object.removeFromParent();});
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere(); root.add(batch);
  }
}

export function buildRoad(ctx, theme) {
  const {box,material,THREE} = ctx;
  const {road,edge,accent}=theme.palette;
  box(10,0.65,48.015,road,0,-0.325,-24,{castShadow:false});
  // All curbs are outside the 10-unit gameplay surface.
  for(const side of [-1,1]) {
    box(0.3,0.25,48.02,edge,side*5.15,0.05,-24);
    box(0.095,0.022,48.02,accent,side*4.82,0.014,-24,{unlit:theme.roadStyle==='panels',opacity:theme.roadStyle==='panels'?1:0.6});
  }
  const style=theme.roadStyle;
  if(style==='panels') {
    for(let z=-3;z>-48;z-=6) {
      box(9.4,0.012,0.045,0x2a435b,0,0.009,z,{castShadow:false});
      for(const x of [-4.3,4.3]) box(0.28,0.018,0.8,accent,x,0.021,z,{unlit:true});
    }
    for(let z=-1;z>-48;z-=4) box(0.07,0.015,0.8,0x64869c,0,0.018,z,{castShadow:false});
  } else if (style==='stone' || style==='sandstone') {
    const seam = new THREE.Color(road).multiplyScalar(0.72).getHex();
    for(let z=-4;z>-48;z-=4) {
      box(9.5,0.008,0.026,seam,0,0.006,z,{castShadow:false});
      const offset=(Math.round(z/4)%2)*1.4;
      for(let x=-3+offset;x<4.4;x+=3) box(0.023,0.008,4,seam,x,0.006,z+2,{castShadow:false});
    }
    for(let z=-2;z>-48;z-=6) box(0.1,0.012,1.25,edge,0,0.012,z,{castShadow:false});
  } else {
    const line = style==='frost'?0xdbcfa3:0xf8dab2;
    for(let z=-1.5;z>-48;z-=5.5) box(0.105,0.013,1.6,line,0,0.012,z,{castShadow:false});
    for(const side of [-1,1]) {
      box(0.095,0.1,48.01,edge,side*5.43,0.7,-24);
      for(let z=-1;z>-48;z-=4) box(0.105,0.72,0.11,edge,side*5.43,0.26,z);
    }
  }
}

export function makeSky(THREE, palette) {
  const mat = new THREE.ShaderMaterial({
    uniforms:{top:{value:new THREE.Color(palette.skyTop)},bottom:{value:new THREE.Color(palette.skyBottom)}},
    vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=smoothstep(-0.10,0.72,normalize(vPos).y);gl_FragColor=vec4(mix(bottom,top,h),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    side:THREE.BackSide,depthWrite:false,fog:false
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(265,24,16),mat);
  sky.name='Gradient sky';sky.renderOrder=-100;sky.frustumCulled=false;
  return sky;
}
