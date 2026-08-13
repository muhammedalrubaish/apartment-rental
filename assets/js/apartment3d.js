/*
 * مجسم ثلاثي الأبعاد للشقة (غرفة نوم + صالة + مطبخ + دورة مياه)
 * يُبنى بالكامل بالكود باستخدام Three.js — لا يحتاج أي ملف موديل خارجي.
 */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

// أبعاد تقريبية بالمتر (مخطط توضيحي وليس مقاسات دقيقة)
const W = 9;   // العرض الكلي
const D = 6.5; // العمق الكلي
const H = 2.9; // ارتفاع الجدران
const T = 0.12; // سماكة الجدار

const ROOMS = {
    living:  { name: 'الصالة',      icon: '🛋️', desc: 'صالة أنيقة بشاشة ذكية وأريكة مريحة وإنترنت عالي السرعة.', target: [1.9, 0, 2.0] },
    bedroom: { name: 'غرفة النوم',  icon: '🛏️', desc: 'سرير كوين فاخر مع دولاب ملابس وإضاءة دافئة.',            target: [-2.7, 0, 1.8] },
    kitchen: { name: 'المطبخ',      icon: '🍳', desc: 'مطبخ مجهز بالكامل للطبخ: ثلاجة وفرن ومغسلة وخزائن.',      target: [2.6, 0, -2.0] },
    bath:    { name: 'دورة المياه', icon: '🚿', desc: 'حمام كامل مع دش ومغسلة وسخان مياه.',                      target: [-2.7, 0, -2.0] },
    entry:   { name: 'المدخل',      icon: '🔑', desc: 'دخول ذكي بالبصمة والرمز (قفل Tuya) — تسجيل وصول ذاتي.',   target: [0, 0, 3.2] },
};

function init(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(6.5, 7.2, 8.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI / 2.15; // منع النزول تحت الأرضية
    controls.target.set(0, 0.6, 0);

    buildLights(scene);
    const { pickables } = buildApartment(scene);

    // ——— التفاعل: تحديد الغرف بالنقر/اللمس ———
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const infoEl = document.getElementById('apt3d-info');
    let downPos = null;

    renderer.domElement.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
        if (!downPos) return;
        const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
        downPos = null;
        if (moved > 6) return; // كان تدويرًا وليس نقرة
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, true)[0];
        if (hit) {
            let o = hit.object;
            while (o && !o.userData.room) o = o.parent;
            if (o) selectRoom(o.userData.room);
        }
    });

    function selectRoom(key) {
        const room = ROOMS[key];
        if (!room) return;
        if (infoEl) {
            infoEl.innerHTML = `<b>${room.icon} ${room.name}</b><span>${room.desc}</span>`;
            infoEl.classList.add('visible');
        }
        document.querySelectorAll('.apt3d-chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.room === key);
        });
        flyTo(room.target);
    }

    // ——— حركة الكاميرا نحو الغرفة ———
    let anim = null;
    function flyTo([x, y, z]) {
        const from = controls.target.clone();
        const to = new THREE.Vector3(x, y + 0.6, z);
        const camFrom = camera.position.clone();
        const camTo = to.clone().add(new THREE.Vector3(3.4, 5.4, 5.8));
        anim = { from, to, camFrom, camTo, t: 0 };
    }

    // ——— أزرار التحكم ———
    document.querySelectorAll('.apt3d-chip').forEach((chip) => {
        chip.addEventListener('click', () => selectRoom(chip.dataset.room));
    });
    const resetBtn = document.getElementById('apt3d-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        document.querySelectorAll('.apt3d-chip').forEach((c) => c.classList.remove('active'));
        if (infoEl) infoEl.classList.remove('visible');
        anim = {
            from: controls.target.clone(), to: new THREE.Vector3(0, 0.6, 0),
            camFrom: camera.position.clone(), camTo: new THREE.Vector3(6.5, 7.2, 8.4), t: 0,
        };
    });
    let autoRotate = true;
    const rotBtn = document.getElementById('apt3d-rotate');
    if (rotBtn) rotBtn.addEventListener('click', () => {
        autoRotate = !autoRotate;
        rotBtn.textContent = autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
    });

    // ——— حجم العرض ———
    function resize() {
        const w = container.clientWidth;
        const h = container.clientHeight || Math.round(w * 0.62);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(container);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05);
        if (anim) {
            anim.t = Math.min(anim.t + dt * 1.6, 1);
            const e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2; // easeInOutQuad
            controls.target.lerpVectors(anim.from, anim.to, e);
            camera.position.lerpVectors(anim.camFrom, anim.camTo, e);
            if (anim.t >= 1) anim = null;
        } else if (autoRotate) {
            const p = camera.position;
            const a = 0.12 * dt;
            const nx = p.x * Math.cos(a) - p.z * Math.sin(a);
            const nz = p.x * Math.sin(a) + p.z * Math.cos(a);
            p.set(nx, p.y, nz);
        }
        controls.update();
        renderer.render(scene, camera);
    });

    container.classList.add('ready');
}

function buildLights(scene) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.05));
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.6);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 12;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.45);
    fill.position.set(-7, 6, -8);
    scene.add(fill);
}

// ——— أدوات مساعدة ———
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

function group(name, room, ...children) {
    const g = new THREE.Group();
    g.name = name;
    g.userData.room = room;
    children.forEach((c) => g.add(c));
    return g;
}

function buildApartment(scene) {
    const pickables = [];

    const MAT = {
        floorWood: mat(0xc9a06a),
        floorTile: mat(0xe2e8f0, { roughness: 0.35 }),
        floorBath: mat(0xd7e3ee, { roughness: 0.3 }),
        wall: mat(0xfbfaf6),
        wallAccent: mat(0xeee5d8),
        wood: mat(0x8b5e3c),
        woodLight: mat(0xd9b98c),
        fabric: mat(0x5a7d9a),
        fabricWarm: mat(0xd9c3a5),
        white: mat(0xfafafa),
        dark: mat(0x2b3440, { roughness: 0.4 }),
        steel: mat(0xc0c8d0, { roughness: 0.25, metalness: 0.7 }),
        glass: new THREE.MeshStandardMaterial({ color: 0x9ecbe8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 }),
        green: mat(0x3f7d4f),
        gold: mat(0xd4a437, { roughness: 0.3, metalness: 0.6 }),
    };

    // ——— الأرضيات ———
    const slab = box(W + 0.6, 0.2, D + 0.6, mat(0xb9c2cc), 0, -0.1, 0);
    scene.add(slab);

    const addFloor = (w, d, m, x, z) => {
        const f = box(w, 0.04, d, m, x, 0.02, z);
        scene.add(f);
        return f;
    };
    addFloor(4.4, 6.5, MAT.floorWood, 2.3, 0);      // الصالة + ممر
    addFloor(4.5, 3.3, MAT.floorWood, -2.25, 1.6);  // غرفة النوم
    addFloor(4.5, 3.2, MAT.floorBath, -2.25, -1.65);// دورة المياه + المطبخ الجانبي
    addFloor(2.6, 3.2, MAT.floorTile, 3.2, -1.65);  // المطبخ

    // ——— الجدران الخارجية (مقطوعة الارتفاع لرؤية الداخل) ———
    const wallH = H * 0.62;
    const wy = wallH / 2;
    scene.add(box(W, wallH, T, MAT.wall, 0, wy, -D / 2));            // خلفي
    scene.add(box(T, wallH, D, MAT.wall, -W / 2, wy, 0));            // يسار
    scene.add(box(T, wallH, D, MAT.wall, W / 2, wy, 0));             // يمين
    const frontH = wallH * 0.55;                                      // أقصر لكشف الداخل
    scene.add(box(3.1, frontH, T, MAT.wall, -2.95, frontH / 2, D / 2)); // أمامي يسار
    scene.add(box(3.1, frontH, T, MAT.wall, 2.95, frontH / 2, D / 2));  // أمامي يمين (فتحة المدخل بينهما)

    // ——— الجدران الداخلية ———
    scene.add(box(T, wallH * 0.8, 3.3, MAT.wallAccent, -0.05, wallH * 0.4, 1.6));   // بين غرفة النوم والصالة
    scene.add(box(4.5, wallH * 0.8, T, MAT.wallAccent, -2.25, wallH * 0.4, -0.05)); // بين غرفة النوم ودورة المياه
    scene.add(box(T, wallH * 0.8, 3.2, MAT.wallAccent, -0.05, wallH * 0.4, -1.65)); // بين دورة المياه والصالة
    scene.add(box(T, wallH * 0.55, 2.2, MAT.wallAccent, 1.9, wallH * 0.275, -2.1)); // فاصل المطبخ

    // ——— نوافذ زجاجية على الجدار الخلفي واليمين ———
    scene.add(box(2.4, wallH * 0.55, 0.06, MAT.glass, 2.6, wallH * 0.62, -D / 2 + 0.06));
    scene.add(box(0.06, wallH * 0.55, 1.8, MAT.glass, W / 2 - 0.06, wallH * 0.62, 1.6));
    scene.add(box(1.4, wallH * 0.5, 0.06, MAT.glass, -2.6, wallH * 0.66, -D / 2 + 0.06));

    // ——— الصالة ———
    const living = group('living', 'living',
        box(2.3, 0.45, 0.9, MAT.fabric, 2.4, 0.28, 1.9),              // الأريكة (المقعد)
        box(2.3, 0.55, 0.25, MAT.fabric, 2.4, 0.52, 2.28),            // ظهر الأريكة
        box(0.25, 0.5, 0.9, MAT.fabric, 1.28, 0.5, 1.9),              // مسند يسار
        box(0.25, 0.5, 0.9, MAT.fabric, 3.52, 0.5, 1.9),              // مسند يمين
        box(1.1, 0.12, 0.6, MAT.wood, 2.4, 0.4, 0.85),                // طاولة قهوة
        box(0.1, 0.34, 0.1, MAT.dark, 1.95, 0.19, 0.85),
        box(0.1, 0.34, 0.1, MAT.dark, 2.85, 0.19, 0.85),
        box(3.0, 0.02, 2.0, mat(0x8fa5b8), 2.4, 0.05, 1.5),           // سجادة
        box(1.5, 0.45, 0.35, MAT.wood, 2.4, 0.26, -0.35),             // طاولة التلفزيون
        box(1.4, 0.8, 0.05, MAT.dark, 2.4, 0.92, -0.4),               // الشاشة الذكية 📺
        box(0.12, 0.5, 0.12, MAT.green, 4.3, 0.3, 0.2),               // نبتة
        box(0.5, 0.55, 0.5, MAT.green, 4.3, 0.8, 0.2),
    );
    scene.add(living);
    pickables.push(living);

    // ——— غرفة النوم ———
    const bedroom = group('bedroom', 'bedroom',
        box(1.7, 0.35, 2.05, MAT.wood, -2.6, 0.22, 1.7),              // قاعدة السرير
        box(1.6, 0.22, 1.95, MAT.white, -2.6, 0.5, 1.7),              // المرتبة
        box(1.7, 0.75, 0.12, MAT.woodLight, -2.6, 0.5, 0.7),          // ظهر السرير
        box(0.55, 0.14, 0.35, MAT.white, -2.95, 0.66, 0.95),          // وسادة
        box(0.55, 0.14, 0.35, MAT.white, -2.25, 0.66, 0.95),          // وسادة
        box(1.6, 0.06, 1.1, MAT.fabricWarm, -2.6, 0.62, 2.2),         // لحاف
        box(0.45, 0.45, 0.4, MAT.wood, -1.55, 0.26, 0.85),            // كومودينو
        box(0.16, 0.3, 0.16, MAT.gold, -1.55, 0.62, 0.85),            // مصباح
        box(0.5, 1.6, 0.55, MAT.woodLight, -4.2, 0.82, 2.5),          // دولاب الملابس
        box(2.0, 0.02, 1.4, mat(0xbfa88c), -2.6, 0.05, 2.6),          // سجادة
    );
    scene.add(bedroom);
    pickables.push(bedroom);

    // ——— المطبخ ———
    const kitchen = group('kitchen', 'kitchen',
        box(2.3, 0.85, 0.6, MAT.woodLight, 3.3, 0.45, -2.9),          // خزائن سفلية
        box(2.3, 0.06, 0.62, MAT.dark, 3.3, 0.9, -2.9),               // سطح العمل
        box(2.0, 0.55, 0.35, MAT.white, 3.3, 1.75, -3.0),             // خزائن علوية
        box(0.5, 0.05, 0.4, MAT.steel, 2.7, 0.93, -2.9),              // المغسلة
        box(0.55, 0.06, 0.45, MAT.dark, 3.9, 0.94, -2.9),             // الموقد
        box(0.65, 1.75, 0.6, MAT.steel, 4.3, 0.88, -1.5),             // الثلاجة
        box(0.6, 0.7, 0.55, MAT.dark, 2.4, 0.35, -1.4),               // فرن/غسالة
        box(1.0, 0.08, 0.7, MAT.woodLight, 2.9, 0.78, -0.7),          // طاولة طعام صغيرة
        box(0.1, 0.74, 0.1, MAT.dark, 2.5, 0.39, -0.7),
        box(0.1, 0.74, 0.1, MAT.dark, 3.3, 0.39, -0.7),
    );
    scene.add(kitchen);
    pickables.push(kitchen);

    // ——— دورة المياه ———
    const bath = group('bath', 'bath',
        box(1.1, 0.02, 1.1, mat(0xa8c4d8), -3.7, 0.05, -2.4),         // أرضية الدش
        box(0.06, 1.5, 1.1, MAT.glass, -3.15, 0.78, -2.4),            // زجاج الدش
        box(1.1, 1.5, 0.06, MAT.glass, -3.7, 0.78, -1.87),
        box(0.12, 0.1, 0.12, MAT.steel, -4.1, 1.5, -2.4),             // الدش
        box(0.55, 0.12, 0.4, MAT.white, -2.2, 0.85, -2.9),            // المغسلة
        box(0.35, 0.75, 0.35, MAT.white, -2.2, 0.4, -2.9),
        box(0.5, 0.6, 0.05, mat(0xdfe9f2, { metalness: 0.6, roughness: 0.15 }), -2.2, 1.4, -3.13), // مرآة
        box(0.4, 0.42, 0.55, MAT.white, -1.2, 0.22, -2.7),            // المرحاض
        box(0.4, 0.5, 0.15, MAT.white, -1.2, 0.5, -2.95),
    );
    scene.add(bath);
    pickables.push(bath);

    // ——— المدخل + القفل الذكي ———
    const entry = group('entry', 'entry',
        box(0.9, wallH * 0.9, 0.08, MAT.wood, 0, wallH * 0.45, D / 2),  // الباب
        box(0.1, 0.16, 0.06, MAT.gold, 0.32, 1.05, D / 2 - 0.08),         // لوحة القفل الذكي 🔑
        box(0.06, 0.25, 0.06, MAT.steel, -0.3, 1.0, D / 2 - 0.08),        // المقبض
        box(0.9, 0.4, 0.35, MAT.woodLight, -1.2, 0.22, 2.9),              // كونسول المدخل
        box(0.5, 0.02, 0.8, mat(0x7f8c99), 0, 0.05, 2.8),                 // سجادة المدخل
    );
    scene.add(entry);
    pickables.push(entry);

    return { pickables };
}

// التشغيل بعد تعريف كل الدوال والثوابت أعلاه
const host = document.getElementById('apt3d-canvas');
if (host) init(host);
