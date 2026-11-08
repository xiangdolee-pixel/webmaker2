/**
 * Desert Oasis — original procedural scenery, no downloaded models/textures.
 * Layout: road at y=0, x in [-5, 5], travel along -Z.
 * A 48-unit segment is repeatable; visible decoration stays beyond |x|=5.5.
 */
const PALETTE = {
  sand: 0xe6b77c,
  sandLight: 0xf2d099,
  sandstone: 0xe7bd87,
  stoneShadow: 0xc68b5c,
  mesa: [0xb9674b, 0xcd7e51, 0xde9a61, 0xeab77b],
  pool: 0x279eac,
  poolDeep: 0x218b9a,
  poolLight: 0x67d6c5,
  palm: [0x347867, 0x458b6a, 0x74a66a],
  trunk: 0x9c7251,
  plaster: 0xf5deae,
  blue: 0x3a929f,
  blueDark: 0x286776,
};

/** Make a horizontal polygon. Input points are [worldX, worldZ]. */
function groundPolygon(ctx, points, y, color, options = {}) {
  const shape = new ctx.THREE.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const mesh = new ctx.THREE.Mesh(
    new ctx.THREE.ShapeGeometry(shape),
    ctx.material(color, { roughness: 0.72, ...options })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  ctx.add(mesh);
  return mesh;
}

function makeFrondGeometry(THREE) {
  const length = 2.65;
  const width = 0.38;
  // One folded frond geometry is instanced across every palm in this segment.
  const p = [
    [0, 0, 0],
    [length * 0.30, 0.48, -width],
    [length * 0.32, 0.64, 0],
    [length * 0.30, 0.48, width],
    [length * 0.74, 0.12, -width * 0.72],
    [length * 0.76, 0.29, 0],
    [length * 0.74, 0.12, width * 0.72],
    [length, -0.73, 0],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
  geometry.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 5, 1, 5, 4, 2, 3, 6, 2, 6, 5, 4, 5, 7, 5, 6, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

function palm(ctx, x, z, height, scale, frondGeometry) {
  const groundY = -3.28;
  const sway = (x < 0 ? -1 : 1) * 0.42 * scale;
  const top = [x + sway, groundY + height * scale, z - 0.22 * scale];
  const a = [x, groundY, z];
  const b = [x + sway * 0.25, groundY + height * 0.45 * scale, z];
  const c = [x + sway * 0.65, groundY + height * 0.76 * scale, z - 0.08 * scale];
  ctx.beam(a, b, 0.18 * scale, PALETTE.trunk, { segments: 7 });
  ctx.beam(b, c, 0.145 * scale, PALETTE.trunk, { segments: 7 });
  ctx.beam(c, top, 0.11 * scale, PALETTE.trunk, { segments: 7 });
  const leaves = ctx.quality === 'low' ? 5 : 7;
  for (let i = 0; i < leaves; i++) {
    const angle = i * Math.PI * 2 / leaves + 0.21;
    const length = (2.45 + (i % 3) * 0.15) * scale;
    const material = ctx.material(PALETTE.palm[i % 3], { roughness: 1 });
    material.side = ctx.THREE.DoubleSide;
    const leaf = new ctx.THREE.Mesh(frondGeometry, material);
    leaf.position.set(...top);
    leaf.rotation.y = angle;
    leaf.scale.set(length / 2.65, scale, scale);
    leaf.castShadow = true;
    ctx.add(leaf);
  }
  if (ctx.quality !== 'low') {
    ctx.sphere(0.18 * scale, 0xa7894e, top[0] - 0.15, top[1] - 0.12, top[2]);
    ctx.sphere(0.16 * scale, 0xb19a5f, top[0] + 0.13, top[1] - 0.16, top[2] + 0.11);
  }
}

function mesa(ctx, x, z, width, height, depth, variant = 0) {
  // Separate polygonal strata give cliffs readable horizontal bands.
  const levels = [
    { h: 0.40, bottom: 1.0, top: 0.84, color: PALETTE.mesa[(variant + 0) % 4] },
    { h: 0.29, bottom: 0.84, top: 0.76, color: PALETTE.mesa[(variant + 1) % 4] },
    { h: 0.23, bottom: 0.76, top: 0.67, color: PALETTE.mesa[(variant + 2) % 4] },
    { h: 0.08, bottom: 0.67, top: 0.65, color: PALETTE.sandLight },
  ];
  let bottomY = -5.0;
  for (const layer of levels) {
    const h = height * layer.h;
    const m = ctx.cyl(layer.top, layer.bottom, h, layer.color, x, bottomY + h / 2, z, { segments: 7 });
    m.scale.x *= width;
    m.scale.z *= depth;
    m.rotation.y = 0.17;
    bottomY += h;
  }
  if (ctx.quality !== 'low') {
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * width * 0.44;
      ctx.rock(x + offset, -3.25, z + depth * 0.73, width * 0.23, 1.15 + i * 0.33, 1.15, PALETTE.mesa[(i + variant) % 4]);
    }
  }
}

function house(ctx, x, z, width, height, depth, dome = false) {
  const floorY = -3.25;
  ctx.box(width + 0.5, 0.32, depth + 0.5, PALETTE.stoneShadow, x, floorY + 0.16, z);
  ctx.box(width, height, depth, PALETTE.plaster, x, floorY + 0.32 + height / 2, z);
  const roofY = floorY + height + 0.32;
  ctx.box(width + 0.28, 0.22, depth + 0.28, PALETTE.blue, x, roofY + 0.11, z);
  // Adobe roof parapets frame the blue roof without noisy textures.
  for (const sign of [-1, 1]) {
    ctx.box(0.19, 0.42, depth + 0.2, PALETTE.plaster, x + sign * width / 2, roofY + 0.35, z);
    ctx.box(width, 0.42, 0.19, PALETTE.plaster, x, roofY + 0.35, z + sign * depth / 2);
  }
  const doorZ = z + depth / 2 + 0.015;
  ctx.box(width * 0.23, height * 0.63, 0.035, PALETTE.blueDark, x, floorY + height * 0.315 + 0.32, doorZ);
  ctx.box(width * 0.28, 0.16, 0.35, PALETTE.stoneShadow, x, floorY + height * 0.63 + 0.43, doorZ + 0.05);
  if (width > 3) {
    for (const sign of [-1, 1]) {
      ctx.box(0.43, 0.62, 0.04, PALETTE.blueDark, x + sign * width * 0.31, floorY + height * 0.62, doorZ);
      ctx.box(0.57, 0.1, 0.25, PALETTE.sandstone, x + sign * width * 0.31, floorY + height * 0.62 - 0.37, doorZ);
    }
  }
  if (dome) {
    const geo = new ctx.THREE.SphereGeometry(width * 0.30, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new ctx.THREE.Mesh(geo, ctx.material(PALETTE.blue, { roughness: 0.8 }));
    cap.position.set(x, roofY + 0.38, z);
    cap.castShadow = true;
    ctx.add(cap);
    ctx.cyl(0.05, 0.07, 0.57, 0xe7b75b, x, roofY + 0.38 + width * 0.30 + 0.25, z, { segments: 6 });
  }
}

function sideArch(ctx, x, z) {
  const springY = 1.7;
  const r = 2.6;
  // Arch is entirely to the right of the road (its left extent is x-3.12).
  for (const sign of [-1, 1]) {
    const pillarX = x + sign * r;
    ctx.box(1.35, 0.5, 1.7, PALETTE.stoneShadow, pillarX, -3.0, z);
    ctx.box(1.05, 4.4, 1.25, PALETTE.sandstone, pillarX, -0.75, z);
    ctx.box(1.35, 0.38, 1.65, PALETTE.sandLight, pillarX, 1.5, z);
    // Two inset lines make the stonework legible at mobile scale.
    ctx.box(1.065, 0.09, 1.27, 0xd1a36f, pillarX, -1.8, z);
    ctx.box(1.065, 0.09, 1.27, 0xd1a36f, pillarX, -0.2, z);
  }
  const count = ctx.quality === 'low' ? 9 : 13;
  const a0 = 0.008;
  const a1 = Math.PI / count - 0.008;
  const inner = r - 0.48;
  const outer = r + 0.52;
  const shape = new ctx.THREE.Shape();
  shape.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
  shape.lineTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
  shape.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
  shape.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
  shape.closePath();
  const geometry = new ctx.THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: false });
  for (let i = 0; i < count; i++) {
    const mesh = new ctx.THREE.Mesh(geometry, ctx.material(i % 3 === 0 ? PALETTE.sandLight : PALETTE.sandstone, { roughness: 1 }));
    mesh.position.set(x, springY, z - 0.65);
    mesh.rotation.z = i * Math.PI / count;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.add(mesh);
  }

}

function obelisk(ctx, x, z, height) {
  const baseY = -3.3;
  ctx.box(1.5, 0.45, 1.5, PALETTE.stoneShadow, x, baseY + 0.22, z);
  const body = ctx.cyl(0.45, 0.61, height, PALETTE.sandstone, x, baseY + 0.45 + height / 2, z, { segments: 4 });
  body.rotation.y = Math.PI / 4;
  const tip = ctx.cone(0.63, 0.8, PALETTE.sandLight, x, baseY + 0.45 + height + 0.4, z, { segments: 4 });
  tip.rotation.y = Math.PI / 4;
  ctx.box(0.16, height * 0.47, 0.025, PALETTE.blue, x, baseY + height * 0.57, z + 0.45);
}

const theme = {
  id: 'desert-oasis',
  name: '사막 오아시스',
  title: 'Desert Oasis',
  description: '테라코타 협곡 사이로 이어지는 사암 길, 청록색 오아시스와 푸른 지붕의 작은 마을.',
  palette: {
    skyTop: 0x8fc9d1,
    skyBottom: 0xf6dab0,
    fog: 0xf0cda4,
    road: 0xcfa36e,
    edge: 0xf2d49c,
    accent: 0x42c9bb,
  },
  lighting: {
    sun: 0xffe0a8,
    sky: 0xe9f5f1,
    ground: 0xba7054,
    intensity: 2.1,
    sunPosition: [-26, 40, 12],
  },
  roadStyle: 'sandstone',
  buildSegment(ctx, index) {
    const L = ctx.length;
    const frondGeometry = makeFrondGeometry(ctx.THREE);
    // Ground shelves sit below the causeway; no terrain enters the road corridor.
    for (const side of [-1, 1]) {
      ctx.box(56, 3.4, L, PALETTE.sand, side * 34, -5.15, -L / 2);
      ctx.box(0.55, 2.7, L, PALETTE.stoneShadow, side * 5.91, -1.52, -L / 2);
      ctx.box(0.65, 0.35, L, PALETTE.sandstone, side * 5.94, -0.08, -L / 2);
    }

    const river = [
      [-6.4, -0.02], [-6.4, -8], [-7.1, -16], [-6.5, -25], [-6.4, -35], [-6.4, -L + 0.02],
      [-17.1, -L + 0.02], [-16.0, -37], [-17.7, -28], [-16.1, -18], [-18.1, -8], [-17.1, -0.02],
    ];
    groundPolygon(ctx, river, -3.39, PALETTE.pool, { roughness: 0.32, metalness: 0.12 });
    groundPolygon(ctx, [
      [-9.2, -0.03], [-8.9, -9], [-10.1, -18], [-9.1, -28], [-9.5, -38], [-9.2, -L + 0.03],
      [-14.7, -L + 0.03], [-13.8, -38], [-15.3, -28], [-13.7, -18], [-15.0, -8], [-14.7, -0.03],
    ], -3.375, PALETTE.poolDeep, { roughness: 0.29, metalness: 0.13 });
    // Clear shallows trace the winding bank and emphasize its depth.
    for (let i = 0; i < (ctx.quality === 'low' ? 5 : 10); i++) {
      const z = -2.5 - i * (L - 5) / (ctx.quality === 'low' ? 5 : 10);
      const x = -7.5 - (i % 3) * 0.9;
      const ripple = ctx.box(1.0 + (i % 3) * 0.4, 0.014, 0.08, PALETTE.poolLight, x, -3.35, z,
        { unlit: true, opacity: 0.34, transparent: true, castShadow: false, receiveShadow: false });
      ripple.rotation.y = -0.11;
    }

    // Near-bank palms frame the view; their fronds never reach the road.
    palm(ctx, -9.7, -7.8, 5.9, 1.0, frondGeometry);
    palm(ctx, -17.9, -27.0, 5.5, 1.12, frondGeometry);
    palm(ctx, 9.5, -18.1, 5.5, 0.95, frondGeometry);
    if (ctx.quality !== 'low') {
      palm(ctx, -8.9, -38.2, 4.8, 0.83, frondGeometry);
      palm(ctx, 16.9, -40.2, 5.1, 0.85, frondGeometry);
    }

    // Low adobe cluster alternates its tower for less repetitive silhouettes.
    house(ctx, 11.0, -7.5, 3.8, 3.3, 4.1, true);
    house(ctx, 15.1, -10.7, 3.2, 2.6, 3.5, false);
    if (ctx.quality !== 'low') {
      house(ctx, 17.8, -5.7, 2.5, 4.6, 2.6, false);
      ctx.box(2.3, 0.10, 2.1, 0xd89166, 11.0, -1.2, -4.5);
      ctx.cyl(0.05, 0.05, 2.2, PALETTE.trunk, 9.9, -2.2, -3.5, { segments: 5 });
      ctx.cyl(0.05, 0.05, 2.2, PALETTE.trunk, 12.1, -2.2, -3.5, { segments: 5 });
    }
    sideArch(ctx, 11.3, -31.5);
    obelisk(ctx, -7.4, -24.0, 4.1 + (index % 2) * 0.5);
    obelisk(ctx, 7.2, -43.0, 3.2);

    // Beyond the oasis, broad stepped mesas form a coherent canyon silhouette.
    mesa(ctx, -25.5, -13.0, 6.0, 13.0 + (index % 2) * 2.0, 7.8, 0);
    mesa(ctx, 26.0, -31.0, 7.3, 17.0 - (index % 2) * 2.0, 9.0, 1);
    mesa(ctx, -29.0, -37.0, 8.0, 10.5, 6.5, 1);
    if (ctx.quality !== 'low') {
      mesa(ctx, 38.0, -12.0, 10.0, 20.0, 8.0, 0);
      mesa(ctx, -43.0, -24.0, 10.0, 18.0, 10.0, 0);
    }

    // Bank boulders and small desert shrubs add a readable middle scale.
    const details = ctx.quality === 'low' ? 7 : 14;
    for (let i = 0; i < details; i++) {
      const z = -3 - ctx.random() * (L - 6);
      const side = i % 2 ? 1 : -1;
      const x = side * (7.0 + ctx.random() * 0.9);
      const scale = 0.35 + ctx.random() * 0.45;
      ctx.rock(x, -2.9, z, scale * 1.25, scale * 0.6, scale, i % 3 ? PALETTE.sandstone : PALETTE.sandLight);
      if (i % 3 === 0) {
        ctx.sphere(0.35, 0x7a9b70, x + side * 0.55, -3.1, z + 0.4);
        ctx.sphere(0.25, 0x90ac78, x + side * 0.75, -3.0, z + 0.2);
      }
    }

    // Rhythm along the causeway, kept outside the movement corridor.
    for (let i = 0; i < 6; i++) {
      const z = -4 - i * 8;
      for (const side of [-1, 1]) {
        ctx.box(0.5, 0.65, 0.65, PALETTE.sandstone, side * 5.91, 0.41, z);
        ctx.box(0.59, 0.12, 0.76, PALETTE.sandLight, side * 5.91, 0.79, z);
        if (i % 2 === 0) {
          ctx.box(0.14, 0.23, 0.28, PALETTE.poolLight, side * 5.91, 0.96, z,
            { emissive: PALETTE.poolLight, emissiveIntensity: 0.35 });
        }
      }
    }
  },
};

export default theme;
