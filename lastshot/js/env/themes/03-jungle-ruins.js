/**
 * 03 — Jade Sanctuary / 정글 유적
 * Procedural scenery only. Forward is -Z; the playable road is supplied by core.
 * Every above-deck prop stays outside the clear central corridor (|x| <= 5.5).
 */
export default {
  id: 'jungle-ruins',
  name: '정글 유적',
  title: 'Jade Sanctuary',
  description: '비취빛 강 위의 고대 석조길. 이끼 낀 계단 신전, 야자수, 작은 폭포가 겹겹이 이어집니다.',
  palette: {
    skyTop: 0x76c7bb,
    skyBottom: 0xe4e8b6,
    fog: 0xb5d5bd,
    road: 0xd5c69b,
    edge: 0x658c77,
    accent: 0xd9bd69,
  },
  lighting: {
    sun: 0xffe5a5,
    sky: 0xc5f5dc,
    ground: 0x34554c,
    intensity: 2.7,
    sunPosition: [-26, 38, -10],
  },
  roadStyle: 'stone',

  buildSegment(ctx, index) {
    const { THREE, random: rand } = ctx;
    const high = ctx.quality !== 'low';
    const stone = 0xb9b68a;
    const paleStone = 0xe0d5a7;
    const shadowStone = 0x718775;
    const moss = 0x5d9160;
    const river = 0x338f82;
    const leaves = [0x257b62, 0x38916b, 0x54a875, 0x207260];

    // The river is intentionally below the deck, never a collision surface.
    ctx.box(112, 0.12, 48, river, 0, -5.65, -24, { roughness: 0.38, metalness: 0.16 });
    for (let i = 0; i < (high ? 30 : 16); i++) {
      const side = i % 2 ? 1 : -1;
      ctx.box(0.6 + rand() * 3.4, 0.018, 0.055 + rand() * 0.07,
        i % 3 ? 0x55aa95 : 0x6fb7a0,
        side * (6.5 + rand() * 23), -5.575, -1 - rand() * 46,
        { unlit: true, castShadow: false });
    }

    // Low parapets and restrained lanterns frame the lane without blocking it.
    for (const side of [-1, 1]) {
      ctx.box(0.42, 0.42, 48, shadowStone, side * 5.86, -0.03, -24);
      ctx.box(0.46, 0.12, 48, paleStone, side * 5.86, 0.24, -24);
      for (let k = 0; k < 4; k++) {
        const z = -6 - k * 12;
        ctx.box(0.72, 0.85, 0.76, stone, side * 6.02, 0.35, z);
        ctx.box(0.82, 0.16, 0.88, moss, side * 6.02, 0.87, z);
        if ((k + index) % 2 === 0) {
          ctx.box(0.44, 0.75, 0.44, shadowStone, side * 6.1, 1.26, z);
          ctx.box(0.67, 0.17, 0.67, paleStone, side * 6.1, 1.72, z);
          ctx.sphere(0.18, 0xffe0a1, side * 6.1, 1.96, z,
            { emissive: 0xffca61, emissiveIntensity: 0.65, castShadow: false });
          ctx.cone(0.38, 0.3, moss, side * 6.1, 2.25, z, { segments: 4 });
        }
      }

      // Stone causeway piers continue down to the jade water.
      for (const z of [-12, -36]) {
        ctx.box(0.95, 5.2, 2.1, shadowStone, side * 6.05, -2.62, z);
        ctx.box(1.32, 0.4, 2.7, moss, side * 6.05, -4.9, z);
      }

      // Irregular islands create near / middle / far depth instead of a flat wall.
      for (let k = 0; k < 4; k++) {
        const z = -5.5 - k * 12;
        const x = side * (13.9 + rand() * 4.2);
        ctx.rock(x, -4.2, z, 6.9, 3.0 + rand() * 1.2, 6.2, 0x487967);
        ctx.rock(x, -2.4, z, 5.6, 1.6, 5.2, 0x6f9b63);
        ctx.rock(x + side * 8, -3.5, z - 0.6, 8.1, 5.2, 6.0, 0x568d70);
      }
    }

    // A single folded blade is shared by all palms in this segment.
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 1.5, 0.35, 0, 1.25, 0.1, 0.55,
      1.25, 0.1, 0.55, 1.5, 0.35, 0, 3.25, -0.5, 0,
      0, 0, 0, 1.25, 0.1, -0.55, 1.5, 0.35, 0,
      1.5, 0.35, 0, 1.25, 0.1, -0.55, 3.25, -0.5, 0,
    ], 3));
    leafGeo.computeVertexNormals();
    const leafMats = leaves.map(color => {
      const mat = ctx.material(color, { roughness: 0.95 });
      mat.side = THREE.DoubleSide;
      return mat;
    });

    const palm = (x, groundY, z, height, phase = 0) => {
      const lean = Math.sign(x) * 0.55;
      ctx.beam([x, groundY, z], [x + lean * 0.45, groundY + height * 0.54, z - 0.12],
        0.19, 0x866e48);
      ctx.beam([x + lean * 0.45, groundY + height * 0.54, z - 0.12],
        [x + lean, groundY + height, z - 0.32], 0.135, 0x9f8553);
      for (let j = 0; j < (high ? 7 : 5); j++) {
        const leaf = new THREE.Mesh(leafGeo, leafMats[j % leafMats.length]);
        leaf.position.set(x + lean, groundY + height, z - 0.32);
        leaf.rotation.y = phase + j * Math.PI * 2 / (high ? 7 : 5);
        const s = 0.76 + height * 0.055;
        leaf.scale.set(s, s, s);
        leaf.castShadow = true;
        ctx.add(leaf);
      }
      ctx.sphere(0.28, 0x6b8850, x + lean, groundY + height - 0.12, z - 0.32);
    };

    for (const side of [-1, 1]) {
      // Broad-leaved forest sits farther out; thinner palm silhouettes sit near it.
      const treeCount = high ? 8 : 5;
      for (let k = 0; k < treeCount; k++) {
        const z = -3.4 - k * 40 / Math.max(1, treeCount - 1) + rand() * 0.9;
        const x = side * (20.0 + rand() * 11);
        const h = 5.0 + rand() * 4.8;
        ctx.cyl(0.22, 0.42, h, 0x64764c, x, -2.1 + h / 2, z, { segments: 6 });
        ctx.rock(x, h - 1.7, z, 3.3, 2.5, 3.4, leaves[k % leaves.length]);
        if (high) {
          ctx.rock(x + side * 1.8, h - 2.3, z + 0.8, 2.4, 2.0, 2.4, leaves[(k + 1) % leaves.length]);
          ctx.rock(x - side * 1.5, h - 1.0, z - 0.7, 2.3, 1.9, 2.2, leaves[(k + 2) % leaves.length]);
        }
      }
      for (let k = 0; k < (high ? 3 : 2); k++) {
        palm(side * (10.3 + k % 2 * 2.4), -1.9, -7 - k * 15 + side * 1.4,
          5.3 + rand() * 2.2, rand() * Math.PI);
      }
    }

    // Different positions on the two banks prevent a symmetrical corridor effect.
    const temple = (side, z, grand) => {
      const x = side * (grand ? 15.8 : 14.9);
      const n = grand ? 4 : 3;
      for (let tier = 0; tier < n; tier++) {
        const width = 9.2 - tier * 1.65;
        const top = -1.6 + tier * 0.83;
        ctx.box(width, 0.82, width * 0.87, tier % 2 ? stone : shadowStone, x, top, z);
        ctx.box(width + 0.19, 0.16, width * 0.87 + 0.18, paleStone, x, top + 0.48, z);
        // Low green ledges read as accumulated moss rather than saturated stripes.
        ctx.box(width * 0.52, 0.05, 0.48, moss, x + side * width * 0.17, top + 0.59, z + width * 0.28);
      }
      const floorY = -1.6 + (n - 1) * 0.83 + 0.53;
      ctx.box(3.65, 2.7, 3.6, stone, x, floorY + 1.35, z);
      ctx.box(3.93, 0.28, 3.9, paleStone, x, floorY + 2.76, z);
      ctx.box(3.45, 0.42, 3.45, moss, x, floorY + 3.1, z);
      ctx.box(2.7, 0.32, 2.7, paleStone, x, floorY + 3.48, z);
      // The opening faces the road; it is an inset, not a crossing arch.
      ctx.box(0.07, 1.8, 1.2, 0x294e44, x - side * 1.86, floorY + 0.93, z);
      for (const dz of [-0.95, 0.95]) {
        ctx.box(0.4, 2.08, 0.33, paleStone, x - side * 1.94, floorY + 1.13, z + dz);
      }
      ctx.box(0.45, 0.25, 2.34, paleStone, x - side * 1.94, floorY + 2.21, z);
      ctx.sphere(0.32, 0x8cddb2, x - side * 2.0, floorY + 2.55, z,
        { emissive: 0x3b9f78, emissiveIntensity: 0.27 });
      // A broad stone staircase rises entirely on the bank beside the lane.
      for (let step = 0; step < 7; step++) {
        const h = 0.18 + step * 0.27;
        ctx.box(0.62, h, 2.25, step % 2 ? paleStone : stone,
          x - side * (6.75 - step * 0.59), -1.82 + h / 2, z);
      }
      if (high) {
        for (let j = 0; j < 5; j++) {
          ctx.box(0.035, 0.18, 0.15, shadowStone, x - side * 1.9, floorY + 1.5 - j * 0.25, z + 1.35);
        }
        ctx.box(0.12, 2.4, 0.18, moss, x + side * 1.85, floorY + 1.46, z + 1.6);
      }
    };
    temple(-1, index % 2 ? -31 : -16, index % 2 === 0);
    temple(1, index % 2 ? -14 : -33, index % 2 !== 0);

    // One shallow cascade per chunk; its textured ribbons need no image assets.
    const fallSide = index % 2 ? -1 : 1;
    const fx = fallSide * 23.0;
    const fz = index % 2 ? -16.0 : -26.0;
    ctx.rock(fx, -1.2, fz - 1.4, 4.3, 4.6, 3.5, 0x527c68);
    ctx.box(2.8, 6.4, 0.12, 0x9fded1, fx, -2.2, fz + 1.9,
      { opacity: 0.82, transparent: true, roughness: 0.3, castShadow: false });
    for (let j = 0; j < (high ? 6 : 3); j++) {
      ctx.box(0.08 + rand() * 0.16, 5.6 + rand() * 0.65, 0.035, 0xd1f5df,
        fx - 1.2 + j * 2.35 / (high ? 5 : 2), -2.3, fz + 1.98,
        { unlit: true, opacity: 0.72, transparent: true, castShadow: false });
    }
    for (let j = 0; j < 5; j++) {
      ctx.rock(fx - 1.8 + j * 0.9, -5.45, fz + 2.1, 0.65, 0.13, 0.5, 0xc2eacf);
    }

    // All slow fireflies share a single draw call in this segment.
    const fireflyCount = high ? 7 : 3;
    const fireflyPositions = new Float32Array(fireflyCount * 3);
    const fireflyBases = [];
    for (let i = 0; i < fireflyCount; i++) {
      const x = (i % 2 ? 1 : -1) * (7.8 + rand() * 6.0);
      const y = 0.6 + rand() * 3.2;
      const z = -4.0 - rand() * 39;
      const phase = rand() * Math.PI * 2;
      fireflyPositions.set([x, y, z], i * 3);
      fireflyBases.push({ x, y, phase });
    }
    const fireflyGeo = new THREE.BufferGeometry();
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
    const fireflies = new THREE.Points(fireflyGeo, new THREE.PointsMaterial({
      color: 0xffefab, size: 0.13, sizeAttenuation: true, depthWrite: false,
    }));
    fireflies.frustumCulled = false;
    ctx.add(fireflies);
    ctx.animate(time => {
      for (let i = 0; i < fireflyCount; i++) {
        const { x, y, phase } = fireflyBases[i];
        fireflyPositions[i * 3] = x + Math.cos(time * 0.7 + phase) * 0.16;
        fireflyPositions[i * 3 + 1] = y + Math.sin(time * 1.2 + phase) * 0.27;
      }
      fireflyGeo.attributes.position.needsUpdate = true;
    });
  },
};
