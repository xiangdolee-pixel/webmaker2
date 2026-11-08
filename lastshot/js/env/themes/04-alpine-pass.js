/**
 * 04 — Alpine Passage / 설산 협곡
 * Hand-built low-poly geometry, no external textures or model downloads.
 * Scene segments occupy z = 0 .. -48; the central road belongs to core.
 */
export default {
  id: 'alpine-pass',
  name: '설산 협곡',
  title: 'Alpine Passage',
  description: '푸른 빙하와 눈 덮인 봉우리 사이의 고가도로. 짙은 침엽수와 따뜻한 등불이 차가운 풍경에 대비를 만듭니다.',
  palette: {
    skyTop: 0x89bdd9,
    skyBottom: 0xf1e9dd,
    fog: 0xc9dce3,
    road: 0x9aafba,
    edge: 0xe5eef0,
    accent: 0xf8c581,
  },
  lighting: {
    sun: 0xffdfb4,
    sky: 0xd5ecff,
    ground: 0x678497,
    intensity: 3.0,
    sunPosition: [-26, 35, -28],
  },
  roadStyle: 'frost',

  buildSegment(ctx, index) {
    const { THREE, random: rand } = ctx;
    const high = ctx.quality !== 'low';
    const slate = 0x7c929f;
    const darkSlate = 0x5c7483;
    const snow = 0xe6eff0;
    const pine = [0x386779, 0x2e5969, 0x467b88];

    // A quiet turquoise glacier river is visible through the bridge sides.
    ctx.box(116, 0.13, 48, 0x72b8ce, 0, -7.05, -24,
      { roughness: 0.3, metalness: 0.15 });
    for (let k = 0; k < (high ? 26 : 14); k++) {
      const side = k % 2 ? 1 : -1;
      ctx.box(0.8 + rand() * 3.0, 0.018, 0.07 + rand() * 0.07,
        k % 3 ? 0x8ac5d6 : 0xb0dce4,
        side * (6.2 + rand() * 20), -6.974, -1 - rand() * 46,
        { unlit: true, castShadow: false });
    }

    for (const side of [-1, 1]) {
      // Low stone parapets, snow caps, and regular buttresses read as a viaduct.
      ctx.box(0.48, 0.58, 48, slate, side * 5.88, 0.13, -24);
      ctx.box(0.56, 0.13, 48, snow, side * 5.88, 0.485, -24);
      for (let k = 0; k < 4; k++) {
        const z = -6 - k * 12;
        ctx.box(0.85, 0.86, 1.0, darkSlate, side * 6.06, 0.31, z);
        ctx.box(0.95, 0.18, 1.11, snow, side * 6.06, 0.83, z);
        ctx.box(1.12, 6.5, 2.2, slate, side * 6.11, -3.27, z);
        ctx.box(1.65, 0.6, 2.9, darkSlate, side * 6.11, -6.28, z);
        // Decorative shallow masonry joints, safely outside the roadway.
        if (high) {
          for (let j = 0; j < 3; j++) {
            ctx.box(0.045, 0.045, 2.22, 0x6c8291, side * 6.7, -1.55 - j * 1.4, z);
          }
        }
        // Amber lanterns use emissive material; no costly per-lamp point lights.
        const lx = side * 6.25;
        ctx.cyl(0.055, 0.085, 1.65, 0x536473, lx, 1.65, z, { segments: 6 });
        ctx.box(0.43, 0.09, 0.43, 0x465c6a, lx, 2.48, z);
        ctx.box(0.3, 0.44, 0.3, 0xffdfa8, lx, 2.74, z,
          { emissive: 0xffc06b, emissiveIntensity: 0.6, roughness: 0.55, castShadow: false });
        for (const dx of [-0.185, 0.185]) {
          ctx.box(0.045, 0.52, 0.045, 0x465c6a, lx + dx, 2.74, z + 0.185);
          ctx.box(0.045, 0.52, 0.045, 0x465c6a, lx + dx, 2.74, z - 0.185);
        }
        ctx.cone(0.39, 0.3, snow, lx, 3.14, z, { segments: 4 });
      }

      // Stepped rock banks leave glimpses of water next to the narrow deck.
      for (let k = 0; k < 4; k++) {
        const z = -5 - k * 12;
        const x = side * (14.4 + rand() * 2.4);
        ctx.rock(x, -5.0, z, 6.4, 3.25, 6.0, 0x7795a5);
        ctx.rock(x, -2.85, z - 0.4, 5.6, 1.6, 5.2, snow);
        ctx.rock(x + side * 7.6, -4.0, z - 0.5, 8.5, 5.0, 5.7, 0xb7cdd6);
        // Angular ice shelves protrude from the banks, all below road level.
        if (k % 2 === 0) {
          ctx.rock(side * 10.3, -6.48, z + 3.3, 2.4, 0.28, 2.5, 0xcbe5e9);
        }
      }
    }

    // Vertex colours make real angular snow lines, not simply white cone tips.
    const mountainMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0,
      flatShading: true, vertexColors: true,
    });
    const mountain = (x, y, z, radius, height, rotation) => {
      const count = 7;
      const ring = [];
      const line = [];
      const tip = new THREE.Vector3(radius * 0.1, height, -radius * 0.07);
      for (let i = 0; i < count; i++) {
        const a = rotation + i / count * Math.PI * 2;
        const r = radius * (0.88 + rand() * 0.22);
        const bottom = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
        const fraction = 0.40 + rand() * 0.20;
        ring.push(bottom);
        line.push(bottom.clone().lerp(tip, fraction));
      }
      const positions = [];
      const colors = [];
      const color = new THREE.Color();
      const triangle = (a, b, c, hex, shade) => {
        for (const p of [a, b, c]) positions.push(p.x, p.y, p.z);
        color.setHex(hex).multiplyScalar(shade);
        for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
      };
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const shade = 0.86 + (i % 3) * 0.08;
        triangle(ring[i], line[i], ring[j], 0x87a2b3, shade);
        triangle(ring[j], line[i], line[j], 0x95adbb, shade);
        triangle(line[i], tip, line[j], 0xeff5f5, 0.90 + (i % 3) * 0.05);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mountainMaterial);
      mesh.position.set(x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      ctx.add(mesh);
    };
    for (const side of [-1, 1]) {
      mountain(side * 28.8, -6.4, side < 0 ? -16 : -32,
        11.5, 23.5 + ((index + (side > 0 ? 1 : 0)) % 3) * 3.2, side * 0.5);
      if (high) {
        mountain(side * 41.5, -7.0, side < 0 ? -33 : -14,
          12.5, 28.0 + rand() * 8.0, side * 0.8);
      }
    }

    const fir = (x, groundY, z, height) => {
      ctx.cyl(0.12, 0.2, height * 0.7, 0x827970, x, groundY + height * 0.35, z,
        { segments: 6 });
      for (let level = 0; level < 3; level++) {
        const centerY = groundY + height * (0.42 + level * 0.19);
        const radius = height * (0.27 - level * 0.055);
        const h = height * (0.53 - level * 0.04);
        ctx.cone(radius, h, pine[level], x, centerY, z, { segments: 6 });
        // Cap follows the same slope, exposing a dark fringe below the snow.
        const capRatio = 0.71;
        ctx.cone(radius * capRatio, h * capRatio, snow,
          x, centerY + h * (1 - capRatio) / 2 + 0.03, z, { segments: 6 });
      }
    };
    for (const side of [-1, 1]) {
      const count = high ? 10 : 6;
      for (let k = 0; k < count; k++) {
        const x = side * (11.1 + rand() * 7.4);
        const z = -3.8 - k * 40.0 / (count - 1) + rand() * 0.55;
        fir(x, -2.5, z, 3.9 + rand() * 3.6);
      }
      // Small stones and snow drifts add a near-field scale reference.
      for (let k = 0; k < (high ? 7 : 4); k++) {
        const x = side * (7.3 + rand() * 1.7);
        const z = -3 - k * 6.2;
        ctx.rock(x, -1.15, z, 0.7 + rand() * 0.7, 0.55, 0.8, 0xb4ccd6);
        ctx.rock(x, -0.82, z, 0.58 + rand() * 0.5, 0.18, 0.66, snow);
      }
    }

    // Sparse slow snow sits off the playable lane, in one draw per segment.
    const snowCount = high ? 12 : 5;
    const snowPositions = new Float32Array(snowCount * 3);
    const snowBases = [];
    for (let i = 0; i < snowCount; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (7.0 + rand() * 12.0);
      const y = 0.5 + rand() * 8.0;
      const z = -3 - rand() * 42;
      const phase = rand() * Math.PI * 2;
      snowPositions.set([x, y, z], i * 3);
      snowBases.push({ x, y, phase });
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    const snowPoints = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      color: 0xf6fbff, size: 0.1, sizeAttenuation: true, depthWrite: false,
    }));
    snowPoints.frustumCulled = false;
    ctx.add(snowPoints);
    ctx.animate(time => {
      for (let i = 0; i < snowCount; i++) {
        const { x, y, phase } = snowBases[i];
        snowPositions[i * 3] = x + Math.sin(time * 0.5 + phase) * 0.35;
        snowPositions[i * 3 + 1] = ((y + 12 - time * 0.42) % 12 + 12) % 12 - 2.0;
      }
      snowGeo.attributes.position.needsUpdate = true;
    });
  },
};
