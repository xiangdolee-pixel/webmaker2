/**
 * NEON SKYWAY / 네온 시티
 * A dense toy-scale future city. No external textures, fonts, or models.
 * The clear x = -5 … +5 corridor belongs exclusively to gameplay.
 */

const C = {
  navy: 0x14263c,
  cobalt: 0x244161,
  indigo: 0x363451,
  violet: 0x534169,
  roof: 0x526580,
  cyan: 0x61f4ee,
  blue: 0x55bff6,
  magenta: 0xf28bdc,
  amber: 0xffca87,
};

const glow = (color, intensity = 1.0) => ({
  emissive: color, emissiveIntensity: intensity, roughness: 0.45,
  castShadow: false,
});

function windowGrid(ctx, x, yBase, zFront, width, height, side, variant) {
  const rows = Math.max(2, Math.min(ctx.quality === 'low' ? 5 : 8, Math.floor(height / 1.9)));
  const cols = width > 4.4 ? 3 : 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row * 3 + col + variant) % 5 === 0) continue;
      const color = (row + col + variant) % 4 === 0 ? C.amber : C.blue;
      ctx.box(0.50, 0.72, 0.025, color,
        x + (col - (cols - 1) / 2) * width * 0.24,
        yBase + 1.1 + row * (height - 1.3) / rows,
        zFront + 0.025, glow(color, 0.45));
    }
  }
  // Side-facing bands give buildings depth even at the steep game camera angle.
  for (let row = 0; row < Math.min(rows, 4); row++) {
    const color = variant % 2 ? C.magenta : C.cyan;
    ctx.box(0.025, 0.09, 2.1, color,
      x - side * width / 2 - side * 0.018,
      yBase + 1.4 + row * 2.4, zFront - 1.65,
      glow(color, 0.7));
  }
}

function tower(ctx, side, z, variant, distant = false) {
  const r = ctx.random;
  const x = side * (distant ? 27.5 + r() * 7 : 10.6 + r() * 3.5);
  const width = distant ? 5 + r() * 4 : 3.5 + r() * 1.9;
  const depth = distant ? 5.3 + r() * 2.3 : 4.9 + r() * 2.0;
  const height = distant ? 10 + r() * 15 : 6.5 + r() * 8.0;
  const base = -5.6;
  const colors = [C.cobalt, C.indigo, 0x29465a, C.violet, 0x283552];
  const color = colors[variant % colors.length];
  const neon = variant % 2 === 0 ? C.cyan : C.magenta;

  ctx.box(width + 1.3, 0.75, depth + 1.3, 0x1b2b43,
    x, base + 0.35, z, { roughness: 0.8 });
  ctx.box(width, height, depth, color,
    x, base + 0.75 + height / 2, z, { roughness: 0.6, metalness: 0.12 });

  // Offset upper tiers break up the old "box city" silhouette.
  const top = base + 0.75 + height;
  if (variant % 3 === 0) {
    ctx.box(width * 0.70, 3.0, depth * 0.75, color,
      x + side * width * 0.10, top + 1.5, z - depth * 0.07);
    ctx.box(width * 0.72 + 0.20, 0.16, depth * 0.76 + 0.20, C.roof,
      x + side * width * 0.10, top + 3.1, z - depth * 0.07);
    ctx.box(width * 0.71, 0.09, 0.07, neon,
      x + side * width * 0.10, top + 2.9, z + depth * 0.31, glow(neon, 1.1));
  } else if (variant % 3 === 1) {
    ctx.box(width + 0.36, 0.32, depth + 0.36, C.roof, x, top + 0.16, z);
    ctx.box(width + 0.41, 0.09, 0.08, neon,
      x, top + 0.35, z + depth / 2 + 0.18, glow(neon, 1.1));
    ctx.cyl(0.52, 0.72, 1.0, 0x59768b, x, top + 0.82, z - 0.5,
      { segments: 8 });
    ctx.cyl(0.035, 0.055, 2.6, 0x8194ad, x, top + 2.4, z - 0.5,
      { segments: 5 });
    ctx.sphere(0.12, neon, x, top + 3.75, z - 0.5, glow(neon, 1.0));
  } else {
    const cap = ctx.box(width + 0.25, 0.70, depth + 0.25, C.roof,
      x, top + 0.35, z);
    cap.rotation.z = side * 0.045;
    ctx.box(0.10, height * 0.77, 0.09, neon,
      x - side * (width / 2 - 0.30), base + 0.75 + height / 2,
      z + depth / 2 + 0.05, glow(neon, 1.2));
    ctx.box(0.10, height * 0.56, 0.09, C.blue,
      x - side * (width / 2 - 0.62), base + 0.9 + height / 2,
      z + depth / 2 + 0.06, glow(C.blue, 0.7));
  }

  if (!distant || ctx.quality !== 'low') {
    windowGrid(ctx, x, base + 0.75, z + depth / 2, width, height, side, variant);
  }

  // Lit plinths and wet-floor marks locate the structures in a lower city.
  ctx.box(width + 0.50, 0.08, 0.12, neon,
    x, base + 0.78, z + depth / 2 + 0.25, glow(neon, 0.75));
  if (!distant) {
    ctx.box(width * 0.65, 0.018, 3.8, neon,
      x, -5.57, Math.min(-2.0, z + depth / 2 + 2.05),
      { unlit: true, transparent: true, opacity: 0.08, castShadow: false });
  }
}

function hologram(ctx, side, z, variant) {
  const neon = variant % 2 === 0 ? C.cyan : C.magenta;
  const x = side * 7.5;
  ctx.box(0.50, 0.35, 0.65, 0x435773, x, 0.40, z);
  ctx.cyl(0.035, 0.055, 2.1, 0x6585a0, x, 1.6, z, { segments: 5 });
  const frame = ctx.box(1.15, 1.15, 0.13, 0x29435e, x, 3.0, z);
  frame.rotation.z = Math.PI / 4;
  const light = ctx.box(0.79, 0.79, 0.15, neon, x, 3.0, z + 0.02,
    glow(neon, 0.65));
  light.rotation.z = Math.PI / 4;
  const center = ctx.box(0.48, 0.48, 0.17, 0x1d3550, x, 3.0, z + 0.04);
  center.rotation.z = Math.PI / 4;
}

function rooftopRing(ctx, x, y, z, color) {
  const geometry = new ctx.THREE.TorusGeometry(1.05, 0.075, 5, 24);
  const ring = new ctx.THREE.Mesh(geometry, ctx.material(color, glow(color, 1.2)));
  ring.position.set(x, y, z);
  ring.rotation.x = Math.PI / 2.3;
  ctx.add(ring);
  ctx.box(2.55, 0.14, 2.55, 0x354a66, x, y - 0.30, z);
}

export default {
  id: 'neon-city',
  name: '네온 시티',
  title: 'Neon Skyway',
  description: '청록·보랏빛으로 빛나는 고가도로. 계단형 빌딩과 네온 디테일이 이어지는 미래 도시.',
  palette: {
    skyTop: 0x10162e,
    skyBottom: 0x3b5272,
    fog: 0x253a57,
    road: 0x2c4159,
    edge: 0x50637e,
    accent: 0x78f5ec,
  },
  lighting: {
    sun: 0xbcc8ff,
    sky: 0x91bcec,
    ground: 0x282640,
    intensity: 2.0,
    sunPosition: [-20, 35, 12],
  },
  roadStyle: 'panels',

  buildSegment(ctx, index) {
    const length = ctx.length || 48;
    const high = ctx.quality !== 'low';
    const r = ctx.random;

    ctx.box(135, 0.16, length, 0x112139, 0, -5.82, -length / 2,
      { roughness: 0.46, metalness: 0.18, castShadow: false });
    // A quiet lower-level street grid is visible through gaps in the towers.
    for (const side of [-1, 1]) {
      ctx.box(2.7, 0.028, length, 0x1b334b,
        side * 20.4, -5.71, -length / 2, { castShadow: false });
      ctx.box(0.08, 0.031, length, 0x376585,
        side * 19.1, -5.69, -length / 2, { unlit: true, castShadow: false });
      ctx.box(0.06, 0.031, length, 0x376585,
        side * 21.7, -5.69, -length / 2, { unlit: true, castShadow: false });
      for (let j = 0; j < 6; j++) {
        ctx.box(0.12, 0.035, 1.7, 0x457e9e,
          side * 20.4, -5.68, -4 - j * 8, { unlit: true, castShadow: false });
      }

      // Recessed side service ledges and ribs explain the elevated roadway.
      ctx.box(1.1, 0.25, length, 0x364a64,
        side * 6.1, -0.17, -length / 2);
      ctx.box(0.10, 0.12, length, side === -1 ? C.cyan : C.magenta,
        side * 5.55, 0.18, -length / 2,
        glow(side === -1 ? C.cyan : C.magenta, 0.9));
      ctx.box(0.15, 0.35, length, 0x23374e,
        side * 6.60, 0.06, -length / 2);
      for (let j = 0; j < 8; j++) {
        const z = -3 - j * 6;
        ctx.box(0.16, 0.60, 0.23, 0x57758e,
          side * 6.55, 0.41, z);
        ctx.box(0.10, 0.10, 0.40, C.blue,
          side * 6.56, 0.75, z, glow(C.blue, 0.75));
        ctx.box(1.25, 0.18, 0.30, 0x1f334b,
          side * 6.0, -0.46, z);
      }
      for (const z of [-12, -36]) {
        ctx.box(0.95, 5.3, 1.2, 0x28394f,
          side * 5.95, -3.1, z);
        ctx.beam([side * 5.9, -3.1, z], [side * 7.5, -0.4, z],
          0.15, 0x35526c, { segments: 6 });
      }

      for (let j = 0; j < 3; j++) {
        tower(ctx, side, -6.5 - j * 16.0,
          index * 3 + j + (side === 1 ? 2 : 0));
        tower(ctx, side, -8.3 - j * 15.0,
          index * 3 + j + (side === 1 ? 4 : 1), true);
      }

      hologram(ctx, side, side === -1 ? -16 : -31, index + (side === 1 ? 1 : 0));
      if (high) {
        const x = side * 17.5;
        ctx.box(2.9, 3.2, 3.0, 0x34445e, x, -3.95, -22.4);
        rooftopRing(ctx, x, -2.0, -22.4, side === -1 ? C.cyan : C.magenta);
      }
    }

    // A few distant low-hover delivery vehicles add scale; they are static props.
    if (high) {
      for (let j = 0; j < 3; j++) {
        const side = j % 2 === 0 ? -1 : 1;
        const x = side * (19.8 + r() * 1.1);
        const z = -7 - j * 16;
        ctx.box(0.80, 0.32, 1.65, 0x526d87, x, -4.98, z);
        ctx.box(0.62, 0.17, 0.67, 0x89c3dc, x, -4.73, z + 0.03,
          { roughness: 0.35, metalness: 0.2 });
        ctx.box(0.12, 0.08, 0.08, C.cyan,
          x - 0.23, -4.95, z + 0.85, glow(C.cyan, 0.9));
        ctx.box(0.12, 0.08, 0.08, C.cyan,
          x + 0.23, -4.95, z + 0.85, glow(C.cyan, 0.9));
      }
    }
  },
};
