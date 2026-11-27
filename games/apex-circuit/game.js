// Apex Circuit: first-person 3D circuit racer. Uses three.js (games/_shared/vendor, MIT).
WorkGames.registerGame('apex-circuit', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await Promise.all([kit.css('games/apex-circuit/style.css'), kit.script('games/_shared/vendor/three.min.js')]);
    if (signal.aborted) return null;
    const THREE = window.THREE;

    // ================================================================ constants
    // Track control points: [x, elevation, z]. Driving direction is the order listed.
    const CONTROL = [
      [0, 0, 120], [0, 0, -160], [10, 1, -330], [70, 4, -450], [190, 9, -510], [330, 13, -500],
      [430, 14, -450], [470, 13, -380], [440, 11, -320], [370, 8, -320], [320, 6, -270], [300, 3, -190], [290, 2, -110],
      [340, 2, -20], [450, 4, 40], [560, 8, 130], [580, 12, 250], [510, 12, 360],
      [380, 9, 400], [240, 5, 380], [150, 2, 320], [40, 0, 260],
    ];
    const N = 2400; // track samples
    const ROAD_HALF = 7;
    const KERB_W = 1.3;
    const WALL = 17; // wall distance from the centre line
    const CAR_HALF_W = 0.95;
    const CAR_HALF_L = 2.2;
    const TOP_SPEED = 72; // m/s (≈259 km/h)
    const ACCEL = 8.8;
    const BRAKE = 21;
    const GRIP_ROAD = 17; // max lateral acceleration, m/s²
    const GRIP_GRASS = 8;
    const GEARS = [0, 14, 25, 36, 47, 58, TOP_SPEED + 1]; // gear changes, m/s
    const AI_NAMES = ['Vega', 'Rook', 'Nova', 'Blaze', 'Kite', 'Orion', 'Juno'];
    const AI_COLORS = [0x2f80ed, 0xf2c94c, 0x27ae60, 0xf2994a, 0x9b51e0, 0xeeeeee, 0x56ccf2];
    const PLAYER_COLOR = 0xe50914;
    const DIFFICULTY = { easy: 0.8, normal: 0.9, hard: 0.98 };

    let prefs = { difficulty: 'normal', laps: '3', view: 'cockpit', units: 'kmh', sound: 'off', quality: 'high', ...storage.get('prefs', {}) };

    // ================================================================ DOM
    const canvas = h('canvas', { class: 'ac-canvas' });
    const cockpit = h('div', { class: 'ac-cockpit', 'aria-hidden': 'true' });
    cockpit.innerHTML = `
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="acDash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26282c"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient>
          <linearGradient id="acPillar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0a0b"/><stop offset="1" stop-color="#1d1f23"/></linearGradient>
        </defs>
        <rect x="0" y="0" width="1600" height="34" fill="#0b0b0c"/>
        <path d="M0 0H120L330 640L190 670L0 640Z" fill="url(#acPillar)"/>
        <path d="M1600 0H1480L1270 640L1410 670L1600 640Z" fill="url(#acPillar)"/>
        <path d="M0 640L200 668Q800 585 1400 668L1600 640V900H0Z" fill="url(#acDash)"/>
        <path d="M540 652Q800 560 1060 652Z" fill="#08090a"/>
        <g class="ac-wheel">
          <circle cx="800" cy="935" r="292" fill="none" stroke="#141416" stroke-width="54"/>
          <circle cx="800" cy="935" r="292" fill="none" stroke="#2c2e33" stroke-width="6"/>
          <path d="M786 643h28v30h-28z" fill="#e50914"/>
          <path d="M520 935H690M910 935H1080M800 1010V1220" stroke="#141416" stroke-width="64" stroke-linecap="round"/>
          <circle cx="800" cy="935" r="96" fill="#141416"/>
        </g>
      </svg>`;
    const wheelEl = cockpit.querySelector('.ac-wheel');
    const speedEl = h('span', { class: 'ac-speed' }, '0');
    const unitEl = h('span', { class: 'ac-unit' }, 'km/h');
    const gearEl = h('span', { class: 'ac-gear' }, 'N');
    const rpmEl = h('span', { class: 'ac-rpm__fill' });
    const cluster = h(
      'div',
      { class: 'ac-cluster' },
      h('div', { class: 'ac-rpm' }, rpmEl),
      h('div', { class: 'ac-readout' }, gearEl, h('div', { class: 'ac-speedbox' }, speedEl, unitEl)),
    );
    const minimap = h('canvas', { class: 'ac-minimap', width: 200, height: 200 });
    const lights = h('div', { class: 'ac-lights', hidden: true }, [0, 1, 2].map(() => h('span')));
    const banner = h('div', { class: 'ac-banner', hidden: true });
    const help = h('div', { class: 'ac-help' }, '↑ accelerate · ↓ brake · ← → steer · Space handbrake · C camera · R reset · Esc pause');
    const container = h('div', { class: 'ac' }, canvas, cockpit, cluster, minimap, lights, banner, help);
    root.append(container);
    const hud = kit.hud(root, [
      { id: 'pos', label: 'Pos', value: '-' },
      { id: 'lap', label: 'Lap', value: '-' },
      { id: 'time', label: 'Time', value: '0:00.0' },
      { id: 'best', label: 'Best lap', value: '--' },
    ]);
    const overlay = kit.overlay(root);

    // ================================================================ renderer
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      console.warn('[apex-circuit] WebGL unavailable', error);
      overlay.show({
        title: '3D graphics are turned off',
        text: 'This game needs WebGL, which this browser or PC has disabled. The other games still work.',
        buttons: [{ label: 'Back to menu', primary: true, onClick: exit }],
      });
      return null;
    }
    let trees = null;
    function applyQuality() {
      const low = prefs.quality === 'low';
      renderer.setPixelRatio(low ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.5));
      if (trees) trees.forEach((mesh) => (mesh.count = low ? Math.floor(trees.placed * 0.35) : trees.placed));
      resize();
    }
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const SKY_TOP = new THREE.Color(0x2f6db5);
    const HORIZON = new THREE.Color(0xc9dcee);
    scene.fog = new THREE.Fog(HORIZON, 260, 1900);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);

    scene.add(new THREE.HemisphereLight(0xd8ecff, 0x55703f, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.85);
    sun.position.set(-0.5, 0.8, 0.35);
    scene.add(sun);

    // ---------------------------------------------------------------- helpers
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    function canvasTexture(width, height, draw, repeat = true) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      draw(c.getContext('2d'), width, height);
      const texture = new THREE.CanvasTexture(c);
      if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = maxAniso;
      return texture;
    }

    function noiseFill(g, w, h, base, spread, count, size = 2) {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < count; i++) {
        const v = Math.floor(Math.random() * spread * 2 - spread);
        g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
        g.fillRect(Math.random() * w, Math.random() * h, size, size);
      }
    }

    // Seeded value noise for the hills.
    function hash(x, z) {
      const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }
    function valueNoise(x, z) {
      const xi = Math.floor(x);
      const zi = Math.floor(z);
      const xf = x - xi;
      const zf = z - zi;
      const u = xf * xf * (3 - 2 * xf);
      const v = zf * zf * (3 - 2 * zf);
      return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
    }
    const fbm = (x, z) => valueNoise(x / 260, z / 260) * 0.6 + valueNoise(x / 110, z / 110) * 0.3 + valueNoise(x / 45, z / 45) * 0.1;

    // ================================================================ track
    const curve = new THREE.CatmullRomCurve3(
      CONTROL.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      'centripetal',
    );
    const LENGTH = curve.getLength();
    const DS = LENGTH / N;
    const T = curve
      .getSpacedPoints(N)
      .slice(0, N)
      .map((p) => ({ x: p.x, y: p.y, z: p.z }));
    T.forEach((p, i) => {
      const a = T[(i - 1 + N) % N];
      const b = T[(i + 1) % N];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      p.fx = (b.x - a.x) / len; // forward
      p.fz = (b.z - a.z) / len;
      p.lx = p.fz; // left
      p.lz = -p.fx;
      p.angle = Math.atan2(-p.fx, -p.fz); // matches object rotation.y
    });
    T.forEach((p, i) => {
      const a = T[(i - 6 + N) % N];
      const b = T[(i + 6) % N];
      p.curv = wrapAngle(b.angle - a.angle) / (12 * DS); // signed, + = left turn
    });

    // Spatial hash for nearest-sample queries while building the scenery.
    const CELL = 40;
    const cellKey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);
    const grid = new Map();
    T.forEach((p, i) => {
      const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });
    function forEachNear(x, z, radius, fn) {
      const r = Math.ceil(radius / CELL);
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          const list = grid.get(cellKey(cx + i, cz + j));
          if (list) for (let k = 0; k < list.length; k++) fn(list[k]);
        }
      }
    }
    function nearestInfo(x, z) {
      let best = -1;
      let bestD = Infinity;
      forEachNear(x, z, 80, (i) => {
        const d = (x - T[i].x) ** 2 + (z - T[i].z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) return { dist: Infinity, y: 0 };
      return { dist: Math.sqrt(bestD), y: T[best].y, index: best };
    }

    /** Ground height: flat just below the road near the track, rolling hills further out. */
    const BOUNDS = { minX: -380, maxX: 960, minZ: -900, maxZ: 780 };
    function terrainHeight(x, z) {
      const near = nearestInfo(x, z);
      const shoulder = near.y - 0.3;
      let sum = 0;
      let wsum = 0;
      forEachNear(x, z, 160, (i) => {
        if (i % 4) return;
        const d2 = (x - T[i].x) ** 2 + (z - T[i].z) ** 2;
        const w = 1 / (d2 + 400);
        sum += T[i].y * w;
        wsum += w;
      });
      const base = wsum ? sum / wsum : 0;
      const edge = Math.min(x - BOUNDS.minX, BOUNDS.maxX - x, z - BOUNDS.minZ, BOUNDS.maxZ - z);
      const hills = fbm(x, z) * 46 * smooth(30, 220, near.dist) * smooth(0, 160, edge);
      const far = lerp(base, 0, smooth(160, 320, near.dist)) + hills - 0.4 * (1 - smooth(0, 160, edge));
      if (!Number.isFinite(near.dist)) return far;
      return lerp(shoulder, far, smooth(WALL + 8, WALL + 90, near.dist));
    }

    /**
     * Locate a world position relative to the track. `hint` (a sample index) limits the
     * search to the neighbourhood. Returns index, lateral offset (+ = left) and height.
     */
    function locate(x, z, hint) {
      let best = 0;
      let bestD = Infinity;
      const range = hint == null ? N : 70;
      const start = hint == null ? 0 : hint - 35;
      for (let k = 0; k < range; k++) {
        const i = (((start + k) % N) + N) % N;
        const d = (x - T[i].x) ** 2 + (z - T[i].z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      let i = best;
      let t = ((x - T[i].x) * T[i].fx + (z - T[i].z) * T[i].fz) / DS;
      if (t < 0) {
        i = (i - 1 + N) % N;
        t += 1;
      }
      t = clamp(t, 0, 1);
      const a = T[i];
      const b = T[(i + 1) % N];
      const px = lerp(a.x, b.x, t);
      const pz = lerp(a.z, b.z, t);
      return {
        index: i,
        s: (i + t) * DS,
        lateral: (x - px) * a.lx + (z - pz) * a.lz,
        y: lerp(a.y, b.y, t),
        px,
        pz,
        lx: a.lx,
        lz: a.lz,
      };
    }

    /** World position for a track distance and lateral offset. */
    function pointAt(s, lateral) {
      const f = (((s / DS) % N) + N) % N;
      const i = Math.floor(f);
      const t = f - i;
      const a = T[i];
      const b = T[(i + 1) % N];
      const x = lerp(a.x, b.x, t);
      const z = lerp(a.z, b.z, t);
      const angle = a.angle + wrapAngle(b.angle - a.angle) * t;
      return { x: x + a.lx * lateral, z: z + a.lz * lateral, y: lerp(a.y, b.y, t), angle, index: i };
    }

    // ================================================================ scenery
    const disposables = [];
    const track = (obj) => {
      disposables.push(obj);
      return obj;
    };

    // Sky dome with a vertical gradient.
    {
      const geo = track(new THREE.SphereGeometry(5000, 32, 16));
      const colors = [];
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = clamp(pos.getY(i) / 5000, 0, 1);
        const c = HORIZON.clone().lerp(SKY_TOP, Math.pow(t, 0.55));
        colors.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      scene.add(new THREE.Mesh(geo, mat));
    }

    // Clouds.
    {
      const tex = track(
        canvasTexture(
          256,
          128,
          (g, w, h) => {
            for (let i = 0; i < 14; i++) {
              const x = 40 + Math.random() * (w - 80);
              const y = 50 + Math.random() * 40;
              const r = 22 + Math.random() * 30;
              const grad = g.createRadialGradient(x, y, 0, x, y, r);
              grad.addColorStop(0, 'rgba(255,255,255,0.9)');
              grad.addColorStop(1, 'rgba(255,255,255,0)');
              g.fillStyle = grad;
              g.fillRect(0, 0, w, h);
            }
          },
          false,
        ),
      );
      const mat = track(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
      for (let i = 0; i < 26; i++) {
        const sprite = new THREE.Sprite(mat);
        const a = Math.random() * Math.PI * 2;
        const r = 1200 + Math.random() * 2600;
        sprite.position.set(300 + Math.cos(a) * r, 380 + Math.random() * 420, -60 + Math.sin(a) * r);
        const s = 500 + Math.random() * 700;
        sprite.scale.set(s, s * 0.45, 1);
        scene.add(sprite);
      }
    }

    // Distant mountains (not fogged, faded by hand so they always read as far away).
    {
      const geo = track(new THREE.ConeGeometry(1, 1, 9, 1));
      const mat = track(new THREE.MeshLambertMaterial({ color: 0x7f9bb3, fog: false, flatShading: true }));
      const count = 46;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4();
      const color = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
        const r = 2600 + Math.random() * 900;
        const w = 520 + Math.random() * 520;
        const ht = 150 + Math.random() * 230;
        m.compose(
          new THREE.Vector3(300 + Math.cos(a) * r, ht / 2 - 30, -60 + Math.sin(a) * r),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)),
          new THREE.Vector3(w, ht, w),
        );
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.setHSL(0.57 + Math.random() * 0.04, 0.22, 0.52 + Math.random() * 0.1));
      }
      scene.add(mesh);
    }

    // Terrain: a grid over the track area plus a large flat skirt beyond it.
    const grassTex = track(
      canvasTexture(256, 256, (g, w, h) => {
        noiseFill(g, w, h, '#ffffff', 40, 5000, 2);
      }),
    );
    grassTex.repeat.set(1, 1);
    {
      const STEP = 8;
      const cols = Math.floor((BOUNDS.maxX - BOUNDS.minX) / STEP) + 1;
      const rows = Math.floor((BOUNDS.maxZ - BOUNDS.minZ) / STEP) + 1;
      const positions = new Float32Array(cols * rows * 3);
      const colors = new Float32Array(cols * rows * 3);
      const uvs = new Float32Array(cols * rows * 2);
      const c = new THREE.Color();
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const x = BOUNDS.minX + q * STEP;
          const z = BOUNDS.minZ + r * STEP;
          const y = terrainHeight(x, z);
          const k = r * cols + q;
          positions.set([x, y, z], k * 3);
          uvs.set([x / 24, z / 24], k * 2);
          const v = hash(Math.floor(x / 37), Math.floor(z / 37));
          c.setHSL(0.27 + v * 0.05, 0.42, 0.33 + v * 0.06 + clamp(y / 260, 0, 0.08));
          colors.set([c.r, c.g, c.b], k * 3);
        }
      }
      const index = [];
      for (let r = 0; r < rows - 1; r++) {
        for (let q = 0; q < cols - 1; q++) {
          const a = r * cols + q;
          index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex }));
      scene.add(new THREE.Mesh(geo, mat));

      const skirtGeo = track(new THREE.PlaneGeometry(12000, 12000));
      skirtGeo.rotateX(-Math.PI / 2);
      const skirt = new THREE.Mesh(skirtGeo, track(new THREE.MeshLambertMaterial({ color: 0x4f7a3a })));
      skirt.position.set(300, -0.6, -60);
      scene.add(skirt);
    }

    // Road surface.
    {
      const tex = track(
        canvasTexture(256, 512, (g, w, h) => {
          noiseFill(g, w, h, '#45484d', 26, 9000, 2);
          g.fillStyle = 'rgba(0,0,0,0.18)'; // darker racing line
          g.fillRect(w * 0.3, 0, w * 0.4, h);
          g.fillStyle = '#eeeeee';
          g.fillRect(8, 0, 7, h);
          g.fillRect(w - 15, 0, 7, h);
          g.fillStyle = 'rgba(240,240,240,0.85)';
          g.fillRect(w / 2 - 3, 0, 6, h / 2);
        }),
      );
      const repeats = Math.round(LENGTH / 14);
      const vScale = repeats / LENGTH;
      const positions = [];
      const uvs = [];
      for (let i = 0; i <= N; i++) {
        const p = T[i % N];
        const v = i * DS * vScale;
        positions.push(p.x + p.lx * ROAD_HALF, p.y + 0.02, p.z + p.lz * ROAD_HALF);
        positions.push(p.x - p.lx * ROAD_HALF, p.y + 0.02, p.z - p.lz * ROAD_HALF);
        uvs.push(0, v, 1, v);
      }
      const index = [];
      for (let i = 0; i < N; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const mat = track(new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      scene.add(new THREE.Mesh(geo, mat));
    }

    // Kerbs on corners and walls all round (coloured blocks on corners).
    const inCorner = new Array(N).fill(false);
    T.forEach((p, i) => {
      if (Math.abs(p.curv) > 1 / 160) for (let k = -18; k <= 18; k++) inCorner[(i + k + N) % N] = true;
    });
    {
      const kerbPos = [];
      const kerbCol = [];
      const red = new THREE.Color(0xd62828);
      const white = new THREE.Color(0xf2f2f2);
      for (let i = 0; i < N; i++) {
        if (!inCorner[i]) continue;
        const a = T[i];
        const b = T[(i + 1) % N];
        const col = Math.floor(i / 3) % 2 ? red : white;
        for (const side of [1, -1]) {
          const quad = [
            [a, ROAD_HALF], [a, ROAD_HALF + KERB_W], [b, ROAD_HALF], [b, ROAD_HALF + KERB_W],
          ].map(([p, off]) => [p.x + p.lx * off * side, p.y + 0.06, p.z + p.lz * off * side]);
          const tri = side > 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
          for (const k of tri) {
            kerbPos.push(...quad[k]);
            kerbCol.push(col.r, col.g, col.b);
          }
        }
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(kerbPos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(kerbCol, 3));
      geo.computeVertexNormals();
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      scene.add(new THREE.Mesh(geo, mat));

      const wallPos = [];
      const wallCol = [];
      const grey = new THREE.Color(0xb9bdc4);
      const blue = new THREE.Color(0x2f5fb3);
      for (let i = 0; i < N; i++) {
        const a = T[i];
        const b = T[(i + 1) % N];
        const block = Math.floor(i / 4) % 2;
        const col = inCorner[i] ? (block ? red : white) : block ? grey : blue;
        for (const side of [1, -1]) {
          const ax = a.x + a.lx * WALL * side;
          const az = a.z + a.lz * WALL * side;
          const bx = b.x + b.lx * WALL * side;
          const bz = b.z + b.lz * WALL * side;
          const quad = [
            [ax, a.y - 0.5, az], [ax, a.y + 1.1, az], [bx, b.y - 0.5, bz], [bx, b.y + 1.1, bz],
          ];
          for (const k of [0, 2, 1, 1, 2, 3]) {
            wallPos.push(...quad[k]);
            wallCol.push(col.r, col.g, col.b);
          }
        }
      }
      const wallGeo = track(new THREE.BufferGeometry());
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
      wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
      wallGeo.computeVertexNormals();
      const wallMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      scene.add(new THREE.Mesh(wallGeo, wallMat));
    }

    // Start / finish line, gantry and grandstand.
    {
      const s0 = T[0];
      const checker = track(
        canvasTexture(
          128,
          32,
          (g, w, h) => {
            const sq = 8;
            for (let x = 0; x < w; x += sq) for (let y = 0; y < h; y += sq) {
              g.fillStyle = (x / sq + y / sq) % 2 ? '#111' : '#f5f5f5';
              g.fillRect(x, y, sq, sq);
            }
          },
          false,
        ),
      );
      const lineGeo = track(new THREE.PlaneGeometry(ROAD_HALF * 2, 2.4));
      lineGeo.rotateX(-Math.PI / 2);
      const line = new THREE.Mesh(
        lineGeo,
        track(new THREE.MeshLambertMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
      );
      line.position.set(s0.x, s0.y + 0.05, s0.z);
      line.rotation.y = s0.angle;
      scene.add(line);

      const gantry = new THREE.Group();
      const postMat = track(new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
      const postGeo = track(new THREE.BoxGeometry(0.6, 8, 0.6));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(side * (ROAD_HALF + 2.5), 4, 0);
        gantry.add(post);
      }
      const banner = track(
        canvasTexture(
          1024,
          128,
          (g, w, h) => {
            g.fillStyle = '#141414';
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#e50914';
            g.fillRect(0, h - 12, w, 12);
            g.fillStyle = '#ffffff';
            g.font = '900 76px Arial, Helvetica, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('APEX CIRCUIT', w / 2, h / 2 - 4);
          },
          false,
        ),
      );
      const beam = new THREE.Mesh(
        track(new THREE.BoxGeometry(ROAD_HALF * 2 + 5.6, 1.6, 0.5)),
        [postMat, postMat, postMat, postMat, track(new THREE.MeshBasicMaterial({ map: banner })), track(new THREE.MeshBasicMaterial({ map: banner }))],
      );
      beam.position.set(0, 7.6, 0);
      gantry.add(beam);
      gantry.position.set(s0.x, s0.y, s0.z);
      gantry.rotation.y = s0.angle;
      scene.add(gantry);

      // Grandstand on the right of the main straight.
      const crowd = track(
        canvasTexture(512, 128, (g, w, h) => {
          g.fillStyle = '#30343b';
          g.fillRect(0, 0, w, h);
          const colors = ['#e63946', '#f1faee', '#a8dadc', '#ffb703', '#457b9d', '#2a9d8f', '#ff6b6b'];
          for (let i = 0; i < 1400; i++) {
            g.fillStyle = colors[i % colors.length];
            g.fillRect(Math.random() * w, Math.random() * h, 3, 4);
          }
        }),
      );
      crowd.repeat.set(6, 1);
      const stand = new THREE.Group();
      const standMat = track(new THREE.MeshLambertMaterial({ map: crowd }));
      const concrete = track(new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
      for (let step = 0; step < 6; step++) {
        const tier = new THREE.Mesh(track(new THREE.BoxGeometry(6, 1.4, 120)), [concrete, standMat, standMat, concrete, concrete, concrete]);
        tier.position.set(step * 3.2, 0.7 + step * 1.4, 0);
        stand.add(tier);
        const base = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, step * 1.4 + 0.1, 120)), concrete);
        base.position.set(step * 3.2, (step * 1.4) / 2, 0);
        stand.add(base);
      }
      const roofMat = track(new THREE.MeshLambertMaterial({ color: 0x4a5058 }));
      const roof = new THREE.Mesh(track(new THREE.BoxGeometry(17, 0.5, 122)), roofMat);
      roof.position.set(9, 14.5, 0);
      roof.rotation.z = 0.06;
      stand.add(roof);
      for (let z = -56; z <= 56; z += 28) {
        const pillar = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 14.5, 0.5)), roofMat);
        pillar.position.set(17, 7.25, z);
        stand.add(pillar);
      }
      const mid = T[N - 40];
      stand.position.set(mid.x - mid.lx * (WALL + 6), mid.y - 0.3, mid.z - mid.lz * (WALL + 6));
      stand.rotation.y = mid.angle;
      scene.add(stand);
    }

    // Trees.
    {
      const count = 1100;
      const trunkGeo = track(new THREE.CylinderGeometry(0.3, 0.45, 3, 6));
      trunkGeo.translate(0, 1.5, 0);
      const leafGeo = track(new THREE.ConeGeometry(2.6, 7.5, 7));
      leafGeo.translate(0, 6.2, 0);
      const trunks = new THREE.InstancedMesh(trunkGeo, track(new THREE.MeshLambertMaterial({ color: 0x5b4030 })), count);
      const leaves = new THREE.InstancedMesh(leafGeo, track(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })), count);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const c = new THREE.Color();
      let placed = 0;
      for (let tries = 0; placed < count && tries < count * 8; tries++) {
        const x = lerp(BOUNDS.minX + 20, BOUNDS.maxX - 20, Math.random());
        const z = lerp(BOUNDS.minZ + 20, BOUNDS.maxZ - 20, Math.random());
        const near = nearestInfo(x, z);
        if (near.dist < WALL + 7) continue;
        if (near.dist > 260 && Math.random() < 0.6) continue;
        const s = 0.75 + Math.random() * 0.7;
        q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0));
        m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.85 + Math.random() * 0.4), s));
        trunks.setMatrixAt(placed, m);
        leaves.setMatrixAt(placed, m);
        leaves.setColorAt(placed, c.setHSL(0.28 + Math.random() * 0.08, 0.45, 0.2 + Math.random() * 0.1));
        placed += 1;
      }
      trunks.count = leaves.count = placed;
      scene.add(trunks, leaves);
      trees = [trunks, leaves];
      trees.placed = placed;
    }

    // ================================================================ cars
    const shadowTex = track(
      canvasTexture(
        64,
        128,
        (g, w, h) => {
          const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h / 2);
          grad.addColorStop(0, 'rgba(0,0,0,0.6)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
        },
        false,
      ),
    );
    const shadowGeo = track(new THREE.PlaneGeometry(2.6, 5.4));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    const glassMat = track(new THREE.MeshPhongMaterial({ color: 0x14202c, shininess: 90, specular: 0x8899aa }));
    const tyreMat = track(new THREE.MeshLambertMaterial({ color: 0x151515 }));
    const rimMat = track(new THREE.MeshPhongMaterial({ color: 0xb8bec6, shininess: 60 }));
    const headMat = track(new THREE.MeshBasicMaterial({ color: 0xfff6d5 }));
    const tailMat = track(new THREE.MeshBasicMaterial({ color: 0xff2a2a }));

    // Side profile (length along x, front at +x) extruded across the car's width.
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-2.2, 0.28);
    bodyShape.lineTo(2.15, 0.28);
    bodyShape.lineTo(2.25, 0.5);
    bodyShape.quadraticCurveTo(2.2, 0.74, 1.6, 0.8);
    bodyShape.lineTo(0.55, 0.92);
    bodyShape.lineTo(-1.85, 0.98);
    bodyShape.lineTo(-2.2, 0.96);
    bodyShape.lineTo(-2.26, 0.55);
    bodyShape.closePath();
    const bodyGeo = track(new THREE.ExtrudeGeometry(bodyShape, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 2 }));
    bodyGeo.translate(0, 0, -0.9);
    bodyGeo.rotateY(Math.PI / 2);
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(0.6, 0.9);
    cabinShape.lineTo(-0.15, 1.3);
    cabinShape.lineTo(-1.0, 1.3);
    cabinShape.lineTo(-1.8, 0.97);
    cabinShape.closePath();
    const cabinGeo = track(new THREE.ExtrudeGeometry(cabinShape, { depth: 1.56, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 }));
    cabinGeo.translate(0, 0, -0.78);
    cabinGeo.rotateY(Math.PI / 2);
    const roofGeo = track(new THREE.BoxGeometry(1.5, 0.06, 0.86));
    const wheelGeo = track(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 18));
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = track(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 10));
    rimGeo.rotateZ(Math.PI / 2);
    const lampGeo = track(new THREE.BoxGeometry(0.42, 0.12, 0.05));
    const spoilerGeo = track(new THREE.BoxGeometry(1.7, 0.06, 0.35));

    function makeCar(color, spoiler = true) {
      const group = new THREE.Group();
      const paint = track(new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x666666 }));
      const body = new THREE.Mesh(bodyGeo, paint);
      const cabin = new THREE.Mesh(cabinGeo, glassMat);
      const roof = new THREE.Mesh(roofGeo, paint);
      roof.position.set(0, 1.33, 0.57);
      group.add(body, cabin, roof);
      const wheels = [];
      for (const [x, z] of [[0.86, -1.35], [-0.86, -1.35], [0.86, 1.4], [-0.86, 1.4]]) {
        const w = new THREE.Mesh(wheelGeo, tyreMat);
        w.position.set(x, 0.37, z);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        w.add(rim);
        group.add(w);
        wheels.push(w);
      }
      for (const x of [-0.58, 0.58]) {
        const head = new THREE.Mesh(lampGeo, headMat);
        head.position.set(x, 0.6, -2.34);
        const tail = new THREE.Mesh(lampGeo, tailMat);
        tail.position.set(x, 0.74, 2.34);
        group.add(head, tail);
      }
      if (spoiler) {
        const wing = new THREE.Mesh(spoilerGeo, paint);
        wing.position.set(0, 1.18, 2.0);
        group.add(wing);
        for (const x of [-0.6, 0.6]) {
          const strut = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.22, 0.12)), paint);
          strut.position.set(x, 1.06, 2.0);
          group.add(strut);
        }
      }
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.y = 0.04;
      group.add(shadow);
      scene.add(group);
      return { group, body, wheels, cabin, roof };
    }

    // ================================================================ race state
    const player = makeCar(PLAYER_COLOR, true);
    const opponents = AI_COLORS.slice(0, 5).map((color, i) => ({
      name: AI_NAMES[i],
      color,
      model: makeCar(color, i % 2 === 0),
    }));

    // AI target speeds from curvature, then a backwards pass so they brake in time.
    function speedProfile(grip) {
      const v = T.map((p) => Math.min(TOP_SPEED, Math.sqrt(grip / Math.max(Math.abs(p.curv), 1e-5))));
      for (let pass = 0; pass < 2; pass++) {
        for (let k = N - 1; k >= 0; k--) {
          const next = v[(k + 1) % N];
          v[k] = Math.min(v[k], Math.sqrt(next * next + 2 * 13 * DS));
        }
      }
      return v;
    }

    let state = 'menu'; // menu | countdown | racing | paused | finished
    let pausedFrom = 'racing';
    let raceTime = 0;
    let countdown = 0;
    let totalLaps = 3;
    let viewIndex = 0;
    const VIEWS = ['cockpit', 'hood', 'chase'];
    let car; // player physics state
    let ais = [];
    let profile = [];
    let shake = 0;
    let bannerTimer = 0;
    let wrongWayFor = 0;
    let finishOrder = [];

    function gridSlot(k) {
      return { s: -14 - Math.floor(k / 2) * 9, lateral: k % 2 === 0 ? 3.2 : -3.2 };
    }

    function setupRace() {
      const skill = DIFFICULTY[prefs.difficulty];
      totalLaps = Number(prefs.laps);
      profile = speedProfile(15.5 * skill);
      const order = kit.shuffle(opponents.slice());
      ais = order.map((o, k) => {
        const slot = gridSlot(k);
        return {
          name: o.name,
          color: o.color,
          model: o.model,
          s: (slot.s + LENGTH) % LENGTH,
          progress: slot.s,
          lateral: slot.lateral,
          lane: slot.lateral,
          v: 0,
          skill: skill * (0.97 + Math.random() * 0.05),
          laps: 0,
          lapStart: 0,
          finishTime: null,
        };
      });
      const slot = gridSlot(ais.length);
      const start = pointAt(slot.s, slot.lateral);
      car = {
        x: start.x,
        z: start.z,
        y: start.y,
        heading: start.angle,
        vx: 0,
        vz: 0,
        steer: 0,
        hint: start.index,
        progress: slot.s,
        lastS: locate(start.x, start.z, start.index).s,
        laps: 0,
        lapStart: 0,
        lastLap: null,
        bestLap: null,
        finishTime: null,
        pitch: 0,
        roll: 0,
        slip: 0,
        onGrass: false,
      };
      raceTime = 0;
      finishOrder = [];
      wrongWayFor = 0;
      viewIndex = Math.max(0, VIEWS.indexOf(prefs.view));
      placeModels(0);
      updateHud();
    }

    // ================================================================ input
    const keys = kit.keyboard(signal, (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (state === 'racing' || state === 'countdown') pause();
        else if (state === 'paused') resume();
      } else if (event.code === 'KeyR' && !event.repeat && state === 'racing') {
        resetCar();
      } else if (event.code === 'KeyC' && !event.repeat) {
        viewIndex = (viewIndex + 1) % VIEWS.length;
        prefs.view = VIEWS[viewIndex];
        storage.set('prefs', prefs);
      }
    });
    kit.onHide(signal, () => (state === 'racing' || state === 'countdown') && pause());

    // ================================================================ audio (optional)
    let audio = null;
    function startAudio() {
      if (prefs.sound !== 'on' || audio) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain();
        master.gain.value = 0.18;
        master.connect(ctx.destination);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        filter.connect(master);
        const a = ctx.createOscillator();
        a.type = 'sawtooth';
        const b = ctx.createOscillator();
        b.type = 'square';
        const ga = ctx.createGain();
        const gb = ctx.createGain();
        ga.gain.value = 0.5;
        gb.gain.value = 0.25;
        a.connect(ga).connect(filter);
        b.connect(gb).connect(filter);
        a.start();
        b.start();
        // Tyre squeal: filtered noise.
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1400;
        band.Q.value = 3;
        const squeal = ctx.createGain();
        squeal.gain.value = 0;
        noise.connect(band).connect(squeal).connect(master);
        noise.start();
        audio = { ctx, a, b, filter, squeal, master };
      } catch (error) {
        console.warn('[apex-circuit] audio unavailable', error);
      }
    }
    function updateAudio(rpm, throttle, slip) {
      if (!audio) return;
      const now = audio.ctx.currentTime;
      const f = 28 + (rpm / 7500) * 150;
      audio.a.frequency.setTargetAtTime(f, now, 0.03);
      audio.b.frequency.setTargetAtTime(f / 2, now, 0.03);
      audio.filter.frequency.setTargetAtTime(500 + throttle * 1400 + rpm / 6, now, 0.05);
      audio.squeal.gain.setTargetAtTime(clamp((slip - 2.5) / 6, 0, 0.35), now, 0.05);
    }
    function suspendAudio(on) {
      if (audio) (on ? audio.ctx.suspend() : audio.ctx.resume()).catch(() => {});
    }

    // ================================================================ simulation
    function gearFor(speed) {
      let gear = 1;
      while (gear < GEARS.length - 1 && speed >= GEARS[gear]) gear += 1;
      return gear;
    }
    function rpmFor(speed) {
      const gear = gearFor(speed);
      const lo = GEARS[gear - 1];
      const hi = Math.min(GEARS[gear], TOP_SPEED);
      return 1100 + clamp((speed - lo) / (hi - lo), 0, 1) * 6400;
    }

    /** Put the car back on the track, facing the right way (R key). */
    function resetCar() {
      const here = locate(car.x, car.z, car.hint);
      const p = pointAt(here.s, clamp(here.lateral, -4, 4));
      car.x = p.x;
      car.z = p.z;
      car.y = p.y;
      car.heading = p.angle;
      car.vx = car.vz = 0;
      car.steer = 0;
      car.hint = p.index;
      stuckFor = 0;
      flash('Reset', 700);
    }

    let throttle = 0;
    let stuckFor = 0;
    function stepPlayer(dt, controls) {
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const rx = Math.cos(car.heading);
      const rz = -Math.sin(car.heading);
      let fwd = car.vx * fx + car.vz * fz;
      let side = car.vx * rx + car.vz * rz;

      const where = locate(car.x, car.z, car.hint);
      const offRoad = Math.abs(where.lateral) > ROAD_HALF + KERB_W + 0.4;
      car.onGrass = offRoad;
      const grip = offRoad ? GRIP_GRASS : GRIP_ROAD;

      // Steering: less lock at speed, yaw limited by grip.
      const target = controls.steer;
      car.steer += (target - car.steer) * Math.min(1, dt * (target === 0 ? 7 : 4.5));
      const speedAbs = Math.abs(fwd);
      const lock = lerp(0.6, 0.1, clamp(speedAbs / 55, 0, 1));
      let yaw = (fwd / 2.6) * Math.tan(car.steer * lock);
      let yawLimit = grip / Math.max(speedAbs, 3);
      if (controls.handbrake) yawLimit *= 1.7;
      yaw = clamp(yaw, -yawLimit, yawLimit);
      car.heading -= yaw * dt;

      // Engine, brakes, drag.
      if (controls.throttle && fwd > -0.5) {
        fwd += ACCEL * Math.max(0, 1 - (fwd / TOP_SPEED) ** 2) * dt;
      } else if (controls.brake) {
        if (fwd > 0.5) fwd = Math.max(0, fwd - BRAKE * dt);
        else fwd = Math.max(-11, fwd - 6 * dt);
      } else if (controls.throttle && fwd <= -0.5) {
        fwd = Math.min(0, fwd + BRAKE * dt);
      }
      const coast = 0.8 + 0.00035 * fwd * fwd;
      if (!controls.throttle || fwd < 0) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), coast * dt);
      if (controls.handbrake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 5 * dt);
      if (offRoad) {
        const grassDrag = 2.5 + 0.012 * fwd * fwd;
        fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), grassDrag * dt);
      }

      // Velocity keeps its old direction; grip pulls it towards the new heading.
      const vx = fx * fwd + rx * side;
      const vz = fz * fwd + rz * side;
      const nfx = -Math.sin(car.heading);
      const nfz = -Math.cos(car.heading);
      const nrx = Math.cos(car.heading);
      const nrz = -Math.sin(car.heading);
      fwd = vx * nfx + vz * nfz;
      side = vx * nrx + vz * nrz;
      const gripRate = controls.handbrake ? 1.6 : offRoad ? 3.5 : 9;
      side *= Math.exp(-gripRate * dt);
      fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), Math.abs(side) * 0.35 * dt); // scrub
      car.slip = Math.abs(side);
      car.vx = nfx * fwd + nrx * side;
      car.vz = nfz * fwd + nrz * side;
      car.x += car.vx * dt;
      car.z += car.vz * dt;

      // Walls.
      const after = locate(car.x, car.z, where.index);
      const limit = WALL - CAR_HALF_W - 0.35;
      if (Math.abs(after.lateral) > limit) {
        const sign = Math.sign(after.lateral);
        car.x = after.px + after.lx * limit * sign;
        car.z = after.pz + after.lz * limit * sign;
        const vn = car.vx * after.lx * sign + car.vz * after.lz * sign;
        if (vn > 0) {
          car.vx -= after.lx * sign * vn * 1.3;
          car.vz -= after.lz * sign * vn * 1.3;
          const loss = clamp(1 - vn / 40, 0.55, 0.97);
          car.vx *= loss;
          car.vz *= loss;
          shake = Math.min(1, shake + vn / 18);
        }
        // Glance off: turn the car partly towards the wall's direction so it doesn't stay nosed in.
        const along = T[after.index].angle;
        const diff = wrapAngle(along - car.heading);
        const target = Math.abs(diff) > Math.PI / 2 ? wrapAngle(along + Math.PI) : along;
        car.heading += wrapAngle(target - car.heading) * Math.min(1, 6 * dt);
      }
      const final = locate(car.x, car.z, after.index);
      car.hint = final.index;
      const edge = smooth(ROAD_HALF + KERB_W, ROAD_HALF + KERB_W + 2.5, Math.abs(final.lateral));
      car.y = final.y + 0.02 - edge * 0.3;

      // Progress: signed distance travelled along the track.
      let delta = final.s - car.lastS;
      if (delta > LENGTH / 2) delta -= LENGTH;
      if (delta < -LENGTH / 2) delta += LENGTH;
      car.progress += delta;
      car.lastS = final.s;
      const trackAngle = T[final.index].angle;
      const heading = Math.abs(fwd) > 3 ? Math.atan2(-car.vx, -car.vz) : car.heading;
      car.wrongWay = Math.abs(wrapAngle(heading - trackAngle)) > 2.0 && Math.abs(fwd) > 4;

      // Visual pitch/roll.
      car.pitch = lerp(car.pitch, clamp((controls.brake && fwd > 1 ? 0.03 : 0) - (controls.throttle ? 0.012 : 0), -0.03, 0.04), dt * 5);
      car.roll = lerp(car.roll, clamp(yaw * fwd * 0.0022, -0.05, 0.05), dt * 5);
      throttle = controls.throttle ? 1 : 0;
      return fwd;
    }

    function stepAI(ai, dt, others) {
      const idx = Math.floor(((ai.s % LENGTH) + LENGTH) % LENGTH / DS) % N;
      const ahead = Math.floor(idx + 25) % N;
      let rubber = 1;
      const gap = ai.progress - car.progress;
      if (gap > 120) rubber = 0.95;
      else if (gap < -160) rubber = 1.05;
      let target = profile[idx] * rubber * (ai.skill / DIFFICULTY[prefs.difficulty]);
      target = Math.min(target, TOP_SPEED * ai.skill * rubber);

      // Inside line through corners.
      let lane = ai.lane - Math.sign(T[ahead].curv) * clamp(Math.abs(T[ahead].curv) * 260, 0, 3.2);

      // Traffic: slow down or move over for anything just ahead.
      for (const o of others) {
        if (o === ai) continue;
        let d = o.progress - ai.progress;
        if (d < 0 || d > 16) continue;
        if (Math.abs(o.lateral - ai.lateral) < 2.4) {
          if (o.v < ai.v) {
            const room = o.lateral > 0 ? -1 : 1;
            lane = clamp(o.lateral + room * 3.4, -ROAD_HALF + 1.4, ROAD_HALF - 1.4);
            if (d < 8) target = Math.min(target, o.v * 0.98);
          }
        }
      }
      lane = clamp(lane, -ROAD_HALF + 1.2, ROAD_HALF - 1.2);
      ai.lateral += clamp(lane - ai.lateral, -2.6 * dt, 2.6 * dt);

      if (ai.v < target) ai.v += ACCEL * ai.skill * Math.max(0, 1 - (ai.v / TOP_SPEED) ** 2) * dt;
      else ai.v = Math.max(target, ai.v - 16 * dt);
      ai.s = (ai.s + ai.v * dt) % LENGTH;
      ai.progress += ai.v * dt;
    }

    /** Push overlapping cars apart in track space. */
    function collide(playerFwd) {
      const p = locate(car.x, car.z, car.hint);
      for (const ai of ais) {
        let ds = ai.progress - car.progress;
        const dl = ai.lateral - p.lateral;
        if (Math.abs(ds) > CAR_HALF_L * 2 || Math.abs(dl) > CAR_HALF_W * 2) continue;
        const overlapS = CAR_HALF_L * 2 - Math.abs(ds);
        const overlapL = CAR_HALF_W * 2 - Math.abs(dl);
        if (overlapL < overlapS) {
          // Side by side: push sideways.
          const push = (overlapL / 2 + 0.05) * Math.sign(dl || 1);
          ai.lateral = clamp(ai.lateral + push, -WALL + 2, WALL - 2);
          car.x -= p.lx * push;
          car.z -= p.lz * push;
          const vn = car.vx * p.lx + car.vz * p.lz;
          if (vn * Math.sign(dl || 1) > 0) {
            car.vx -= p.lx * vn * 0.8;
            car.vz -= p.lz * vn * 0.8;
          }
          shake = Math.min(1, shake + 0.25);
        } else if (ds > 0) {
          // Player hits the car in front.
          const speed = Math.hypot(car.vx, car.vz);
          const k = Math.min(1, (ai.v * 0.95) / Math.max(speed, 0.1));
          if (playerFwd > ai.v) {
            car.vx *= k;
            car.vz *= k;
            ai.v = Math.min(TOP_SPEED, ai.v + 1.5);
          }
          ai.progress += overlapS;
          ai.s = (ai.s + overlapS) % LENGTH;
          shake = Math.min(1, shake + 0.3);
        } else {
          // Car behind hits the player.
          ai.v = Math.min(ai.v, Math.max(0, playerFwd * 0.95));
          ai.progress -= overlapS;
          ai.s = (ai.s - overlapS + LENGTH) % LENGTH;
        }
      }
      // AI vs AI: keep them from overlapping lengthwise.
      for (const a of ais) for (const b of ais) {
        if (a === b) continue;
        const ds = b.progress - a.progress;
        if (ds <= 0 || ds > CAR_HALF_L * 2 || Math.abs(b.lateral - a.lateral) > CAR_HALF_W * 2) continue;
        a.progress = b.progress - CAR_HALF_L * 2;
        a.s = ((b.s - CAR_HALF_L * 2) % LENGTH + LENGTH) % LENGTH;
        a.v = Math.min(a.v, b.v);
      }
    }

    function lapCheck(entity, isPlayer) {
      if (entity.finishTime != null) return;
      const lapsDone = Math.floor(entity.progress / LENGTH);
      if (entity.progress >= 0 && lapsDone > entity.laps) {
        const lapTime = raceTime - entity.lapStart;
        if (entity.laps >= 0 && entity.lapStartSet) {
          if (isPlayer) {
            car.lastLap = lapTime;
            const record = kit.best(storage, 'bestLap', Math.round(lapTime * 100) / 100, { lowerIsBetter: true });
            if (car.bestLap == null || lapTime < car.bestLap) car.bestLap = lapTime;
            if (lapsDone < totalLaps) flash(record.isNew ? `Lap record! ${fmt(lapTime)}` : lapsDone === totalLaps - 1 ? 'Final lap' : `Lap ${lapsDone + 1}`);
          }
        }
        entity.laps = lapsDone;
        entity.lapStart = raceTime;
        entity.lapStartSet = true;
        if (lapsDone >= totalLaps) {
          entity.finishTime = raceTime;
          finishOrder.push(entity);
        }
      } else if (entity.progress >= 0 && !entity.lapStartSet) {
        entity.lapStart = raceTime;
        entity.lapStartSet = true;
      }
    }

    // ================================================================ render helpers
    function placeModels(dt) {
      const pm = player.group;
      pm.position.set(car.x, car.y, car.z);
      pm.rotation.set(car.pitch, car.heading, car.roll, 'YXZ');
      const speed = Math.hypot(car.vx, car.vz);
      for (const w of player.wheels) w.rotation.x -= (speed / 0.37) * dt;
      player.wheels[0].rotation.y = player.wheels[1].rotation.y = -car.steer * 0.45;

      for (const ai of ais) {
        const p = pointAt(ai.s, ai.lateral);
        const g = ai.model.group;
        const dLat = ai.prevLateral == null ? 0 : (ai.lateral - ai.prevLateral) / Math.max(dt, 1e-3);
        ai.prevLateral = ai.lateral;
        g.position.set(p.x, p.y + 0.02, p.z);
        g.rotation.set(0, p.angle + Math.atan2(dLat, Math.max(ai.v, 5)) * 0.8, 0);
        for (const w of ai.model.wheels) w.rotation.x -= (ai.v / 0.37) * dt;
      }
    }

    const camPos = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    function placeCamera(dt, fwd) {
      const view = VIEWS[viewIndex];
      const speed = Math.abs(fwd);
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const jitter = shake * 0.12;
      shake = Math.max(0, shake - dt * 2.5);
      const bump = (Math.random() - 0.5) * jitter + (car.onGrass ? (Math.random() - 0.5) * 0.04 * Math.min(1, speed / 20) : 0);
      camera.fov = lerp(62, 74, clamp(speed / TOP_SPEED, 0, 1)) + (view === 'chase' ? -4 : 0);
      camera.updateProjectionMatrix();
      player.group.visible = true;
      if (view === 'chase') {
        const target = new THREE.Vector3(car.x - fx * 8.5, car.y + 3.1, car.z - fz * 8.5);
        if (dt === 0 || camPos.lengthSq() === 0) camPos.copy(target);
        else camPos.lerp(target, 1 - Math.exp(-dt * 8));
        camera.position.copy(camPos);
        camLook.set(car.x + fx * 6, car.y + 1.2, car.z + fz * 6);
        camera.up.set(0, 1, 0);
        camera.lookAt(camLook);
        camera.position.y += bump;
      } else {
        const eye = view === 'cockpit' ? { up: 1.12, fwd: 0.05 } : { up: 1.26, fwd: 0.9 };
        camera.position.set(car.x + fx * eye.fwd, car.y + eye.up + bump, car.z + fz * eye.fwd);
        camLook.set(car.x + fx * 30, car.y + eye.up - 1.35, car.z + fz * 30);
        camera.up.set(Math.cos(car.heading) * car.roll * 0.6, 1, -Math.sin(car.heading) * car.roll * 0.6);
        camera.lookAt(camLook);
        camPos.set(0, 0, 0);
      }
      player.cabin.visible = player.roof.visible = view !== 'cockpit';
      cockpit.hidden = view !== 'cockpit';
      container.dataset.view = view;
      wheelEl.setAttribute('transform', `rotate(${(car.steer * 110).toFixed(1)} 800 935)`);
    }

    // Minimap.
    const mapCtx = minimap.getContext('2d');
    const xs = T.map((p) => p.x);
    const zs = T.map((p) => p.z);
    const mapBounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    const mapScale = 170 / Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ);
    const mapX = (x) => 100 + (x - (mapBounds.minX + mapBounds.maxX) / 2) * mapScale;
    const mapY = (z) => 100 + (z - (mapBounds.minZ + mapBounds.maxZ) / 2) * mapScale;
    const mapPath = new Path2D();
    T.forEach((p, i) => (i ? mapPath.lineTo(mapX(p.x), mapY(p.z)) : mapPath.moveTo(mapX(p.x), mapY(p.z))));
    mapPath.closePath();
    function drawMinimap() {
      mapCtx.clearRect(0, 0, 200, 200);
      mapCtx.lineJoin = 'round';
      mapCtx.strokeStyle = 'rgba(0,0,0,0.55)';
      mapCtx.lineWidth = 9;
      mapCtx.stroke(mapPath);
      mapCtx.strokeStyle = 'rgba(255,255,255,0.85)';
      mapCtx.lineWidth = 4;
      mapCtx.stroke(mapPath);
      mapCtx.fillStyle = '#fff';
      mapCtx.fillRect(mapX(T[0].x) - 6, mapY(T[0].z) - 1.5, 12, 3);
      for (const ai of ais) {
        const p = pointAt(ai.s, ai.lateral);
        mapCtx.fillStyle = `#${ai.color.toString(16).padStart(6, '0')}`;
        mapCtx.beginPath();
        mapCtx.arc(mapX(p.x), mapY(p.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
      mapCtx.fillStyle = '#e50914';
      mapCtx.strokeStyle = '#fff';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.arc(mapX(car.x), mapY(car.z), 6, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.stroke();
    }

    // ================================================================ HUD
    const fmt = (t) => {
      if (t == null) return '--';
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      return `${m}:${s.toFixed(2).padStart(5, '0')}`;
    };
    function standings() {
      const all = [{ isPlayer: true, name: 'You', progress: car.progress, finishTime: car.finishTime }, ...ais.map((a) => ({ ...a, isPlayer: false }))];
      return all.sort((a, b) => {
        if (a.finishTime != null && b.finishTime != null) return a.finishTime - b.finishTime;
        if (a.finishTime != null) return -1;
        if (b.finishTime != null) return 1;
        return b.progress - a.progress;
      });
    }
    function updateHud(fwd = 0) {
      const order = standings();
      const pos = order.findIndex((e) => e.isPlayer) + 1;
      hud.set('pos', `${pos}/${order.length}`);
      hud.set('lap', `${clamp(car.laps + 1, 1, totalLaps)}/${totalLaps}`);
      hud.set('time', fmt(raceTime).replace(/(\.\d)\d$/, '$1'));
      hud.set('best', fmt(car.bestLap));
      const speed = Math.abs(fwd);
      speedEl.textContent = Math.round(speed * (prefs.units === 'mph' ? 2.237 : 3.6));
      unitEl.textContent = prefs.units === 'mph' ? 'mph' : 'km/h';
      gearEl.textContent = fwd < -0.5 ? 'R' : speed < 0.5 && !throttle ? 'N' : String(gearFor(speed));
      const rpm = state === 'countdown' ? 1100 + throttle * 5200 : rpmFor(speed);
      rpmEl.style.width = `${clamp((rpm - 800) / 6900, 0, 1) * 100}%`;
      rpmEl.classList.toggle('is-red', rpm > 6900);
      return rpm;
    }
    function flash(text, ms = 1600) {
      banner.textContent = text;
      banner.hidden = false;
      bannerTimer = ms / 1000;
    }

    // ================================================================ flow
    function startRace(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      setupRace();
      applyQuality();
      startAudio();
      suspendAudio(false);
      state = 'countdown';
      countdown = 0;
      lights.hidden = false;
      [...lights.children].forEach((l) => (l.className = ''));
      overlay.hide();
      help.classList.remove('is-hidden');
    }

    function pause() {
      pausedFrom = state;
      state = 'paused';
      suspendAudio(true);
      overlay.show({
        title: 'Paused',
        stats: [
          ['Position', hudText('pos')],
          ['Lap', hudText('lap')],
          ['Best lap', fmt(car.bestLap)],
        ],
        buttons: [
          { label: 'Resume', primary: true, onClick: resume },
          { label: 'Restart', onClick: () => startRace() },
          { label: 'Change settings', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }
    const hudText = (id) => hud.el.querySelectorAll('.kit-hud__value')[['pos', 'lap', 'time', 'best'].indexOf(id)].textContent;

    function resume() {
      state = pausedFrom;
      suspendAudio(false);
      overlay.hide();
    }

    function finishRace() {
      state = 'finished';
      suspendAudio(true);
      lights.hidden = true;
      const order = standings();
      const pos = order.findIndex((e) => e.isPlayer) + 1;
      const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
      const best = storage.get('bestLap', null);
      const table = h(
        'ol',
        { class: 'ac-results' },
        order.map((e, i) => {
          let time = '';
          if (e.finishTime != null) time = fmt(e.finishTime);
          else {
            const remaining = totalLaps * LENGTH - e.progress;
            time = `+${Math.max(1, Math.round(remaining / 40))}s`;
          }
          return h(
            'li',
            { class: e.isPlayer ? 'is-player' : '' },
            h('span', { class: 'ac-results__pos' }, i + 1),
            h('span', { class: 'ac-results__swatch', style: `background:#${(e.isPlayer ? PLAYER_COLOR : e.color).toString(16).padStart(6, '0')}` }),
            h('span', { class: 'ac-results__name' }, e.name),
            h('span', { class: 'ac-results__time' }, time),
          );
        }),
      );
      overlay.show({
        kicker: pos === 1 ? 'Winner!' : 'Race complete',
        title: `${pos}${suffix} place`,
        stats: [
          ['Race time', fmt(car.finishTime)],
          ['Best lap', fmt(car.bestLap)],
          ['Lap record', fmt(best)],
        ],
        content: table,
        buttons: [
          { label: 'Race again', primary: true, onClick: () => startRace() },
          { label: 'Settings', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
      const mine = table.querySelector('.is-player');
      if (mine) mine.scrollIntoView({ block: 'nearest' });
    }

    function showStart() {
      state = 'menu';
      suspendAudio(true);
      lights.hidden = true;
      overlay.show({
        title: 'Apex Circuit',
        text: 'Six cars, one hilly 2.7 km circuit. Arrow keys or WASD to drive, Space for the handbrake, C to change camera, R if you get stuck.',
        options: [
          { id: 'difficulty', label: 'Opponents', value: prefs.difficulty, choices: [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] },
          { id: 'laps', label: 'Laps', value: prefs.laps, choices: [{ value: '1', label: '1' }, { value: '3', label: '3' }, { value: '5', label: '5' }] },
          { id: 'view', label: 'Camera', value: prefs.view, choices: [{ value: 'cockpit', label: 'Cockpit' }, { value: 'hood', label: 'Hood' }, { value: 'chase', label: 'Chase' }] },
          { id: 'units', label: 'Speed', value: prefs.units, choices: [{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }] },
          { id: 'sound', label: 'Engine sound', value: prefs.sound, choices: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
          { id: 'quality', label: 'Graphics', value: prefs.quality, choices: [{ value: 'high', label: 'High' }, { value: 'low', label: 'Low (slow PCs)' }] },
        ],
        buttons: [
          { label: 'Race', primary: true, onClick: startRace },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    // ================================================================ main loop
    function resize() {
      const w = root.clientWidth;
      const hgt = root.clientHeight;
      renderer.setSize(w, hgt, false);
      camera.aspect = w / Math.max(1, hgt);
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    applyQuality();

    let lastFwd = 0;
    kit.loop(signal, (dt) => {
      const controls = {
        throttle: keys.isDown('ArrowUp', 'KeyW'),
        brake: keys.isDown('ArrowDown', 'KeyS'),
        steer: (keys.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (keys.isDown('ArrowLeft', 'KeyA') ? 1 : 0),
        handbrake: keys.isDown('Space'),
      };

      if (state === 'countdown') {
        countdown += dt;
        const lit = Math.min(3, Math.floor(countdown / 0.9));
        [...lights.children].forEach((l, i) => (l.className = i < lit ? 'is-red' : ''));
        throttle = controls.throttle ? 1 : 0;
        if (countdown >= 3.6) {
          [...lights.children].forEach((l) => (l.className = 'is-green'));
          state = 'racing';
          flash('GO!', 900);
          setTimeout(() => {
            if (state !== 'countdown') lights.hidden = true;
          }, 1000);
        }
        car.steer += (controls.steer - car.steer) * Math.min(1, dt * 5);
      } else if (state === 'racing') {
        raceTime += dt;
        // Fixed sub-steps keep the handling stable at low frame rates.
        const steps = Math.ceil(dt / (1 / 120));
        for (let k = 0; k < steps; k++) {
          lastFwd = stepPlayer(dt / steps, controls);
          const pack = [...ais, { progress: car.progress, lateral: locate(car.x, car.z, car.hint).lateral, v: lastFwd }];
          for (const ai of ais) stepAI(ai, dt / steps, pack);
        }
        collide(lastFwd);
        lapCheck(car, true);
        for (const ai of ais) lapCheck(ai, false);
        stuckFor = controls.throttle && Math.abs(lastFwd) < 1 ? stuckFor + dt : 0;
        if (stuckFor > 2.5 && bannerTimer <= 0) flash('Stuck? Press R', 1500);
        wrongWayFor = car.wrongWay ? wrongWayFor + dt : 0;
        if (wrongWayFor > 1.2) {
          banner.textContent = 'Wrong way';
          banner.hidden = false;
          bannerTimer = 0.2;
        }
        if (car.finishTime != null) finishRace();
        if (raceTime > 3) help.classList.add('is-hidden');
      }

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.hidden = true;
      }

      if (state !== 'paused') {
        placeModels(state === 'racing' ? dt : 0);
        placeCamera(dt, lastFwd);
        const rpm = updateHud(state === 'racing' ? lastFwd : 0);
        updateAudio(rpm, throttle, state === 'racing' ? car.slip : 0);
        drawMinimap();
        renderer.render(scene, camera);
      }
    }).start();

    setupRace();
    showStart();

    // Read-only hook for automated tests and debugging: open index.html?debug#/play/apex-circuit
    if (/[?&]debug\b/.test(location.search)) {
      window.__apexCircuit = { T, LENGTH, N, get car() { return car; }, get ais() { return ais; }, get state() { return state; } };
    }

    return () => {
      if (window.__apexCircuit) delete window.__apexCircuit;
      observer.disconnect();
      if (audio) audio.ctx.close().catch(() => {});
      for (const item of disposables) item.dispose && item.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  },
});
