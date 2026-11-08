/**
 * SUNSET HARBOR / 노을 해상대교
 * Procedural scenery only. The shared core supplies the playable road.
 * One repeating segment covers local z = 0 … -48; +Y is up.
 */

const C = {
  coral: 0xd65448,
  coralLight: 0xfa8061,
  coralDark: 0xa53b3c,
  cable: 0x7a4d4b,
  rail: 0xd8d3b9,
  water: 0x278d98,
  waterLight: 0x409da3,
  waterDark: 0x237d8e,
  sand: 0xd6bda2,
  stone: 0x898b7c,
  cream: 0xffe8bf,
  gold: 0xf3be8d,
};

function triangle(ctx, color, vertices) {
  const geometry = new ctx.THREE.BufferGeometry();
  geometry.setAttribute('position', new ctx.THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new ctx.THREE.Mesh(geometry, ctx.material(color, {
    side: ctx.THREE.DoubleSide, roughness: 1,
  }));
  ctx.add(mesh);
  return mesh;
}

function sailboat(ctx, x, z, scale, color) {
  const waterY = -5.62;
  const hull = ctx.sphere(1, color, x, waterY + 0.12 * scale, z);
  hull.scale.set(0.83 * scale, 0.30 * scale, 1.9 * scale);
  ctx.box(1.16 * scale, 0.12 * scale, 2.65 * scale,
    C.cream, x, waterY + 0.32 * scale, z + 0.04 * scale);
  ctx.cyl(0.035 * scale, 0.045 * scale, 3.7 * scale,
    0xe3cfaa, x, waterY + 2.2 * scale, z - 0.24 * scale, { segments: 5 });
  // The asymmetric sails are real geometry, never image billboards.
  triangle(ctx, 0xfff4d9, [
    x + 0.06 * scale, waterY + 3.95 * scale, z - 0.22 * scale,
    x + 0.06 * scale, waterY + 0.86 * scale, z - 0.22 * scale,
    x + 1.60 * scale, waterY + 1.03 * scale, z - 0.10 * scale,
  ]);
  triangle(ctx, 0xf1ba89, [
    x - 0.07 * scale, waterY + 3.45 * scale, z - 0.20 * scale,
    x - 1.07 * scale, waterY + 1.06 * scale, z + 0.04 * scale,
    x - 0.07 * scale, waterY + 0.91 * scale, z - 0.20 * scale,
  ]);
  ctx.box(0.70 * scale, 0.025, 3.1 * scale,
    0x85bdba, x, waterY - 0.07, z + 2.8 * scale,
    { unlit: true, opacity: 0.42, transparent: true });
}

function lighthouse(ctx, x, z) {
  ctx.rock(x, -4.9, z, 5.6, 1.7, 4.9, 0x788981);
  ctx.rock(x + 2.6, -5.05, z - 0.8, 3.6, 1.2, 3.2, 0xa3a48b);
  ctx.cyl(3.5, 4.0, 0.45, C.sand, x, -3.4, z, { segments: 10 });
  ctx.cyl(0.95, 1.28, 6.8, 0xffedce, x, 0.1, z, { segments: 10 });
  ctx.cyl(1.015, 1.08, 1.15, C.coral, x, 0.2, z, { segments: 10 });
  ctx.cyl(1.08, 1.08, 0.28, C.coralDark, x, 3.46, z, { segments: 10 });
  ctx.cyl(0.70, 0.70, 1.1, 0xffda80, x, 4.04, z, {
    segments: 8, emissive: 0xffbe5f, emissiveIntensity: 0.48,
  });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    ctx.cyl(0.045, 0.045, 1.2, 0x5d6967,
      x + Math.cos(a) * 0.74, 4.04, z + Math.sin(a) * 0.74, { segments: 5 });
  }
  ctx.cone(1.2, 0.9, C.coral, x, 4.98, z, { segments: 10 });
  ctx.cyl(0.035, 0.035, 0.8, 0x687175, x, 5.68, z, { segments: 5 });
  ctx.box(0.38, 0.7, 0.045, 0x788c93, x, 1.9, z + 1.0);
}

function cityBlock(ctx, side, z, variant) {
  const r = ctx.random;
  const buildingColors = [0xbb9a91, 0xbfaea0, 0x9fa5a0, 0xd1b49a, 0x9b9e9d];
  const quayX = side * 39;
  ctx.box(25, 1.6, 47.9, C.stone, quayX, -5.15, -24);
  ctx.box(24.6, 0.20, 47.8, C.sand, quayX, -4.26, -24);
  // A row of stepped silhouettes leaves open sea between the bridge and shore.
  for (let j = 0; j < 4; j++) {
    const width = 3.5 + r() * 2.5;
    const depth = 4.2 + r() * 3.2;
    const height = 5.0 + r() * 10.0 + (j === 2 ? 4.2 : 0);
    const bx = side * (30.8 + (j % 2) * 8.3 + r() * 2.8);
    const bz = -5.8 - j * 10.4 + r() * 2.0;
    const color = buildingColors[(j + variant + (side === 1 ? 1 : 0)) % buildingColors.length];
    ctx.box(width, height, depth, color, bx, -4.1 + height / 2, bz);
    ctx.box(width + 0.22, 0.24, depth + 0.22, 0xe5c7aa,
      bx, -3.98 + height, bz);
    if (j % 2 === 0) {
      ctx.box(width * 0.6, 2.0, depth * 0.65, color,
        bx, -3.0 + height, bz - 0.2);
    }
    const rows = Math.min(5, Math.floor(height / 2));
    const cols = 3;
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        ctx.box(0.32, 0.58, 0.035, iy % 3 === 0 ? 0xffd99f : 0x8e8f91,
          bx + (ix - 1) * width * 0.24,
          -2.8 + iy * 1.8, bz + depth / 2 + 0.026,
          { unlit: iy % 3 === 0 });
      }
    }
  }
  // Low piers create a foreground, middle-ground, and skyline hierarchy.
  const pierX = side * 24.4;
  ctx.box(7.0, 0.7, 3.1, 0xc7ac8a, pierX, -4.85, z);
  for (let p = 0; p < 4; p++) {
    ctx.cyl(0.19, 0.24, 1.3, 0x6c7370,
      pierX + (p - 1.5) * 1.8, -5.45, z + 1.05, { segments: 6 });
  }
}

export default {
  id: 'sunset-harbor',
  name: '노을 해상대교',
  title: 'Sunset Harbor',
  description: '산호색 현수교, 청록빛 바다, 돛배와 등대. 따뜻한 해질녘의 입체적인 항구 풍경.',
  palette: {
    skyTop: 0xf4a58a,
    skyBottom: 0xffdfb4,
    fog: 0xdcbfa6,
    road: 0x6d7d85,
    edge: 0xe4d2b3,
    accent: 0xffd47b,
  },
  lighting: {
    sun: 0xffc18c,
    sky: 0xffe5c8,
    ground: 0x577d87,
    intensity: 2.5,
    sunPosition: [-24, 36, -35],
  },
  roadStyle: 'asphalt',

  buildSegment(ctx, index) {
    const length = ctx.length || 48;
    const r = ctx.random;
    const high = ctx.quality !== 'low';

    // The thin continuous water slab tiles exactly with the next segment.
    ctx.box(146, 0.12, length, C.water, 0, -5.85, -length / 2,
      { roughness: 0.46, metalness: 0.15, castShadow: false });

    // Broad colour fields and sparse glints keep the sea readable on phones.
    for (let side of [-1, 1]) {
      for (let i = 0; i < (high ? 24 : 13); i++) {
        const x = side * (8.3 + r() * 19.5);
        const z = -0.7 - r() * (length - 1.4);
        ctx.box(1.0 + r() * 3.8, 0.018, 0.05 + r() * 0.11,
          i % 4 === 0 ? C.waterLight : C.waterDark,
          x, -5.773, z, { castShadow: false, unlit: true });
      }
      for (let i = 0; i < (high ? 9 : 5); i++) {
        ctx.box(0.55 + r() * 1.8, 0.019, 0.055,
          side === 1 ? 0xd3c49a : 0x86beb5,
          side * (8.8 + r() * 13.0), -5.748,
          -1.0 - r() * (length - 2),
          { unlit: true, castShadow: false, transparent: true, opacity: 0.64 });
      }
    }

    for (const side of [-1, 1]) {
      const x = side * 6.20;
      // Twin slender pylons frame the scenery without bridging over the lane.
      ctx.box(1.55, 1.2, 3.0, 0xc9b59a, x, -4.95, -24);
      ctx.box(0.84, 16.0, 1.08, C.coral, x, 2.45, -24);
      ctx.box(0.16, 15.9, 1.12, C.coralLight, x - side * 0.35, 2.45, -24);
      ctx.box(1.13, 0.32, 1.32, C.coralLight, x, 10.6, -24);
      ctx.box(0.30, 14.5, 1.13, C.coralDark, x + side * 0.24, 1.8, -24);
      ctx.beam([x, -4.2, -27], [x, 1.4, -24], 0.11, C.coralDark);
      ctx.beam([x, -4.2, -21], [x, 1.4, -24], 0.11, C.coralDark);

      const cableY = (t) => 2.45 + 8.15 * Math.pow(1 - Math.abs(2 * t - 1), 2);
      const samples = high ? 32 : 20;
      for (let j = 0; j < samples; j++) {
        const t0 = j / samples, t1 = (j + 1) / samples;
        ctx.beam([x, cableY(t0), -t0 * length], [x, cableY(t1), -t1 * length],
          0.075, C.coralDark, { segments: 6 });
      }
      for (let j = 1; j < 16; j++) {
        const t = j / 16;
        const yTop = cableY(t);
        ctx.cyl(0.023, 0.023, yTop - 0.60, C.cable,
          x, (yTop + 0.60) / 2, -t * length,
          { segments: 4, castShadow: false });
      }

      ctx.box(0.10, 0.11, length, C.rail, side * 5.55, 0.95, -length / 2);
      ctx.box(0.08, 0.08, length, 0x819590, side * 5.55, 0.47, -length / 2);
      for (let z = -1.5; z > -length; z -= 3) {
        ctx.box(0.09, 1.02, 0.10, 0xa2aba0, side * 5.55, 0.49, z);
      }
      // Warm lanterns punctuate the long perspective rather than filling it.
      for (const z of [-8, -40]) {
        ctx.cyl(0.045, 0.065, 2.65, 0x577173, side * 5.83, 1.35, z,
          { segments: 6 });
        ctx.box(0.34, 0.27, 0.42, C.cream, side * 5.83, 2.75, z,
          { emissive: 0xffbe68, emissiveIntensity: 0.75 });
        ctx.box(0.44, 0.09, 0.51, 0x577173, side * 5.83, 2.94, z);
      }
      cityBlock(ctx, side, side === -1 ? -10 : -36, index);
    }

    sailboat(ctx, -14.8, -10.5, 0.95, 0xf7eee0);
    if (high) sailboat(ctx, 18.2, -37.8, 0.72, 0xc75a4b);
    if (index % 2 === 0) lighthouse(ctx, 21.8, -19.6);
    else {
      ctx.rock(-21.5, -5.05, -32, 5.2, 1.7, 4.0, 0x8b9b83);
      ctx.rock(-23.4, -4.1, -32.8, 3.1, 1.5, 2.4, 0xa5ac89);
      ctx.cyl(0.13, 0.22, 3.4, 0x8c755b, -21.7, -2.4, -31.2, { segments: 6 });
      const crown = ctx.sphere(1.8, 0x6a8c70, -21.7, -0.7, -31.2);
      crown.scale.set(1.35, 0.57, 1.1);
    }
  },
};
