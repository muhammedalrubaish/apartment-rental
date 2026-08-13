/*
 * مجسم ثلاثي الأبعاد للشقة — يُبنى بالكامل من ملف data/floorplan.json
 * عدّل الأرقام في ذلك الملف فقط، وسيُعاد رسم الجدران والأثاث تلقائياً.
 */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

/* نسخة احتياطية تُستخدم إذا تعذّر تحميل الملف (مثلاً عند الفتح عبر file://) */
const FALLBACK = {
    apartment: { width: 9, depth: 6.5, wallHeight: 2.9, wallThickness: 0.12 },
    rooms: [
        { key: 'bedroom', name: 'غرفة النوم', type: 'bedroom', x: 0, z: 0, w: 4.5, d: 3.3 },
        { key: 'bath', name: 'دورة المياه', type: 'bath', x: 0, z: 3.3, w: 2.6, d: 3.2 },
        { key: 'kitchen', name: 'المطبخ', type: 'kitchen', x: 2.6, z: 3.3, w: 1.9, d: 3.2 },
        { key: 'living', name: 'الصالة', type: 'living', x: 4.5, z: 0, w: 4.5, d: 4.6 },
        { key: 'hall', name: 'المدخل والممر', type: 'hall', x: 4.5, z: 4.6, w: 4.5, d: 1.9 },
    ],
    openings: [],
    windows: [],
};

const ROOM_INFO = {
    bedroom: { icon: '🛏️', desc: 'سرير كوين فاخر مع دولاب ملابس وإضاءة دافئة.' },
    living: { icon: '🛋️', desc: 'صالة أنيقة بشاشة ذكية وأريكة مريحة وإنترنت عالي السرعة.' },
    kitchen: { icon: '🍳', desc: 'مطبخ مجهز بالكامل للطبخ: ثلاجة وفرن ومغسلة وخزائن.' },
    bath: { icon: '🚿', desc: 'حمام كامل مع دش ومغسلة وسخان مياه.' },
    hall: { icon: '🔑', desc: 'دخول ذكي بالبصمة والرمز (قفل Tuya) — تسجيل وصول ذاتي.' },
};

/* ── أدوات مساعدة ───────────────────────────────────────────────── */
const mat = (color, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

const MAT = {
    floorWood: mat(0xc9a06a),
    floorTile: mat(0xe2e8f0, { roughness: 0.35 }),
    floorBath: mat(0xd7e3ee, { roughness: 0.3 }),
    wall: mat(0xfbfaf6),
    wallIn: mat(0xeee5d8),
    wood: mat(0x8b5e3c),
    woodLight: mat(0xd9b98c),
    fabric: mat(0x5a7d9a),
    fabricWarm: mat(0xd9c3a5),
    white: mat(0xfafafa),
    dark: mat(0x2b3440, { roughness: 0.4 }),
    steel: mat(0xc0c8d0, { roughness: 0.25, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9ecbe8, transparent: true, opacity: 0.32, roughness: 0.1 }),
    green: mat(0x3f7d4f),
    gold: mat(0xd4a437, { roughness: 0.3, metalness: 0.6 }),
    slab: mat(0xb9c2cc),
    rug: mat(0x8fa5b8),
};

const FLOOR_MAT = {
    bedroom: 'floorWood', living: 'floorWood', hall: 'floorWood',
    kitchen: 'floorTile', bath: 'floorBath',
};

/* صندوق بأبعاد ومركز محددين */
function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/* ── مولّدات الأثاث: كل واحدة تتكيّف مع أبعاد الغرفة ───────────── */
const FURNITURE = {
    bedroom(R) {
        const bw = Math.min(1.7, R.w * 0.45);
        const bl = Math.min(2.05, R.d * 0.62);
        const bx = R.mx;
        const bz = R.z0 + 0.25 + bl / 2;
        const out = [
            box(bw, 0.35, bl, MAT.wood, bx, 0.22, bz),
            box(bw - 0.1, 0.22, bl - 0.1, MAT.white, bx, 0.5, bz),
            box(bw, 0.75, 0.12, MAT.woodLight, bx, 0.5, bz - bl / 2),
            box(bw * 0.32, 0.14, 0.34, MAT.white, bx - bw * 0.21, 0.66, bz - bl / 2 + 0.3),
            box(bw * 0.32, 0.14, 0.34, MAT.white, bx + bw * 0.21, 0.66, bz - bl / 2 + 0.3),
            box(bw - 0.1, 0.06, bl * 0.5, MAT.fabricWarm, bx, 0.62, bz + bl * 0.22),
            box(0.45, 0.45, 0.4, MAT.wood, bx + bw / 2 + 0.32, 0.26, bz - bl / 2 + 0.25),
            box(0.16, 0.3, 0.16, MAT.gold, bx + bw / 2 + 0.32, 0.62, bz - bl / 2 + 0.25),
        ];
        // الدولاب مقابل السرير على الجدار الجنوبي، وبعيداً عن باب الدخول (الغربي)
        if (R.w > 3.2) {
            const wl = Math.min(1.9, R.w * 0.44);
            out.push(
                box(wl, 1.95, 0.58, MAT.woodLight, R.x0 + R.w - wl / 2 - 0.35, 1.0, R.z0 + R.d - 0.35),
                box(0.04, 1.7, 0.03, MAT.dark, R.x0 + R.w - wl - 0.28, 1.0, R.z0 + R.d - 0.64),
            );
        }
        return out;
    },

    living(R) {
        // التلفزيون على الجدار الشمالي، والكنب على الجدار الغربي المجاور له (يسار الشاشة)
        const sofaLen = Math.min(2.4, R.d * 0.78);
        const sofaZ = R.z0 + R.d / 2 + 0.15;
        const sofaX = R.x0 + 0.62;
        const tvX = R.mx + 0.35;

        return [
            // الكنب ملاصق للجدار الغربي، ممتد بمحور العمق
            box(0.25, 0.62, sofaLen, MAT.fabric, R.x0 + 0.16, 0.55, sofaZ),          // الظهر
            box(0.92, 0.42, sofaLen, MAT.fabric, sofaX, 0.26, sofaZ),                 // المقعد
            box(0.92, 0.5, 0.24, MAT.fabric, sofaX, 0.5, sofaZ - sofaLen / 2),        // مسند جانبي
            box(0.92, 0.5, 0.24, MAT.fabric, sofaX, 0.5, sofaZ + sofaLen / 2),        // مسند جانبي
            box(0.42, 0.16, 0.42, MAT.fabricWarm, sofaX, 0.55, sofaZ - sofaLen * 0.26),
            box(0.42, 0.16, 0.42, MAT.fabricWarm, sofaX, 0.55, sofaZ + sofaLen * 0.26),

            // طاولة القهوة أمام الكنب
            box(0.62, 0.1, 1.05, MAT.wood, sofaX + 0.95, 0.42, sofaZ),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + 0.72, 0.2, sofaZ - 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + 1.18, 0.2, sofaZ - 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + 0.72, 0.2, sofaZ + 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + 1.18, 0.2, sofaZ + 0.4),

            // سجادة
            box(R.w * 0.62, 0.02, R.d * 0.6, MAT.rug, R.mx, 0.05, sofaZ),

            // طاولة التلفزيون والشاشة على الجدار الشمالي
            box(1.35, 0.42, 0.34, MAT.wood, tvX, 0.24, R.z0 + 0.3),
            box(1.25, 0.72, 0.05, MAT.dark, tvX, 0.88, R.z0 + 0.22),

            // نبتة زينة في الركن
            box(0.11, 0.42, 0.11, MAT.green, R.x0 + R.w - 0.42, 0.26, R.z0 + R.d - 0.45),
            box(0.44, 0.48, 0.44, MAT.green, R.x0 + R.w - 0.42, 0.72, R.z0 + R.d - 0.45),
        ];
    },

    kitchen(R) {
        // الكف يستند إلى الجدار الشمالي أو الجنوبي حسب facing
        const north = R.facing === 'north';
        const backZ = north ? R.z0 + 0.32 : R.z0 + R.d - 0.32;     // مركز الخزائن السفلية
        const upZ = north ? R.z0 + 0.19 : R.z0 + R.d - 0.19;       // الخزائن العلوية
        const inward = north ? 1 : -1;                              // اتجاه داخل الغرفة
        const cabW = Math.max(1.2, R.w - 0.5);

        const out = [
            box(cabW, 0.85, 0.6, MAT.white, R.mx, 0.45, backZ),                       // خزائن سفلية
            box(cabW, 0.06, 0.62, MAT.dark, R.mx, 0.9, backZ),                        // سطح جرانيت
            box(cabW * 0.86, 0.5, 0.34, MAT.white, R.mx, 1.42, upZ),                  // خزائن علوية
            box(0.5, 0.05, 0.4, MAT.steel, R.mx - cabW * 0.28, 0.93, backZ),          // المغسلة
            box(0.06, 0.3, 0.06, MAT.steel, R.mx - cabW * 0.28, 1.08, backZ - inward * 0.2),
            box(0.42, 0.07, 0.32, MAT.dark, R.mx + cabW * 0.05, 0.95, backZ),         // سخانة كهربائية
            box(0.5, 0.3, 0.36, MAT.white, R.mx + cabW * 0.3, 1.06, backZ),           // ميكروويف
            box(0.58, 0.85, 0.58, MAT.white, R.x0 + 0.42, 0.43, backZ),               // ثلاجة صغيرة
            box(0.34, 0.02, 0.24, MAT.white, R.x0 + 0.42, 0.87, backZ),               // صينية الضيافة
            box(0.1, 0.22, 0.1, MAT.steel, R.x0 + 0.42, 0.99, backZ - inward * 0.06), // الغلاية
            box(R.w * 0.5, 0.02, 0.8, MAT.rug, R.mx, 0.05, backZ + inward * 1.05),    // سجادة
        ];

        return out;
    },

    bath(R) {
        const shw = Math.min(1.1, R.w * 0.45);
        const shz = R.z0 + R.d - shw / 2 - 0.15;
        return [
            box(shw, 0.02, shw, mat(0xa8c4d8), R.x0 + 0.15 + shw / 2, 0.05, shz),
            box(0.05, 1.5, shw, MAT.glass, R.x0 + 0.15 + shw, 0.78, shz),
            box(shw, 1.5, 0.05, MAT.glass, R.x0 + 0.15 + shw / 2, 0.78, shz - shw / 2),
            box(0.12, 0.1, 0.12, MAT.steel, R.x0 + 0.3, 1.5, shz),
            box(0.55, 0.12, 0.4, MAT.white, R.x0 + R.w - 0.5, 0.85, R.z0 + R.d - 0.35),
            box(0.35, 0.75, 0.35, MAT.white, R.x0 + R.w - 0.5, 0.4, R.z0 + R.d - 0.35),
            box(0.5, 0.6, 0.04, mat(0xdfe9f2, { metalness: 0.6, roughness: 0.15 }),
                R.x0 + R.w - 0.5, 1.4, R.z0 + R.d - 0.14),
            box(0.4, 0.42, 0.55, MAT.white, R.x0 + R.w - 0.45, 0.22, R.z0 + 0.6),
            box(0.4, 0.5, 0.15, MAT.white, R.x0 + R.w - 0.45, 0.5, R.z0 + 0.35),
        ];
    },

    hall(R) {
        return [
            box(Math.min(0.9, R.w * 0.25), 0.4, 0.35, MAT.woodLight, R.x0 + 0.8, 0.22, R.z0 + R.d - 0.3),
            box(0.5, 0.02, 0.8, mat(0x7f8c99), R.mx, 0.05, R.z0 + R.d - 0.5),
            box(0.12, 0.45, 0.12, MAT.green, R.x0 + 0.35, 0.28, R.z0 + 0.35),
            box(0.42, 0.5, 0.42, MAT.green, R.x0 + 0.35, 0.75, R.z0 + 0.35),
        ];
    },
};

/* ── البناء من المخطط ───────────────────────────────────────────── */
function buildApartment(scene, plan) {
    const A = plan.apartment;
    const W = A.width, D = A.depth, H = A.wallHeight;
    const T = A.wallThickness || 0.12;

    /* تحويل من نظام الملف (الركن العلوي الأيسر) إلى نظام three.js (المركز) */
    const cx = (x) => x - W / 2;
    const cz = (z) => z - D / 2;

    const wallH = H * 0.62;    // الجدران الخارجية مقطوعة لرؤية الداخل
    const frontH = H * 0.34;   // الجدار الأمامي أقصر
    const innerH = H * 0.42;   // الجدران الداخلية — منخفضة لكشف الغرف

    const pickables = [];
    const rooms = plan.rooms || [];
    const openings = plan.openings || [];
    const windows = plan.windows || [];
    const solids = plan.solids || [];

    /* الأرضيات */
    scene.add(box(W + 0.6, 0.2, D + 0.6, MAT.slab, 0, -0.1, 0));
    rooms.forEach((r, i) => {
        const m = MAT[FLOOR_MAT[r.type] || 'floorWood'];
        // توسيع بسيط للغرف المدموجة حتى لا تظهر فجوة أرضية عند الجدار المحذوف،
        // مع إزاحة رأسية ضئيلة تمنع تداخل الأسطح المتطابقة (z-fighting)
        const pad = r.group ? 0.3 : 0;
        scene.add(box(r.w + pad, 0.04, r.d + pad, m,
            cx(r.x + r.w / 2), 0.02 + i * 0.002, cz(r.z + r.d / 2)));
    });

    /* الكتل الصماء (مجاري خدمات، خزائن مبنية) */
    solids.forEach((b) => {
        const h = b.height || wallH;
        scene.add(box(b.w, h, b.d, MAT.wall, cx(b.x + b.w / 2), h / 2, cz(b.z + b.d / 2)));
    });

    /* جمع أضلاع الغرف كقطع جدارية فريدة */
    const segs = new Map();
    const addSeg = (axis, at, from, to) => {
        const a = Math.min(from, to), b = Math.max(from, to);
        if (b - a < 0.05) return;
        const key = axis + '|' + at.toFixed(2) + '|' + a.toFixed(2) + '|' + b.toFixed(2);
        if (!segs.has(key)) segs.set(key, { axis, at, from: a, to: b });
    };

    rooms.forEach((r) => {
        addSeg('x', r.z, r.x, r.x + r.w);
        addSeg('x', r.z + r.d, r.x, r.x + r.w);
        addSeg('z', r.x, r.z, r.z + r.d);
        addSeg('z', r.x + r.w, r.z, r.z + r.d);
    });

    /* الغرف التي تحمل نفس group تُدمج: نحذف الجدار المشترك بينها */
    const merges = [];
    rooms.forEach((a) => {
        if (!a.group) return;
        rooms.forEach((b) => {
            if (b === a || b.group !== a.group) return;
            // حافة أفقية مشتركة (a أعلى b أو العكس)
            const touchX = Math.abs((a.z + a.d) - b.z) < 0.35 || Math.abs(a.z - (b.z + b.d)) < 0.35;
            if (touchX) {
                const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w);
                if (hi - lo > 0.05) {
                    merges.push({ axis: 'x', at: a.z + a.d, from: lo, to: hi });
                    merges.push({ axis: 'x', at: a.z, from: lo, to: hi });
                }
            }
            // حافة رأسية مشتركة
            const touchZ = Math.abs((a.x + a.w) - b.x) < 0.35 || Math.abs(a.x - (b.x + b.w)) < 0.35;
            if (touchZ) {
                const lo = Math.max(a.z, b.z), hi = Math.min(a.z + a.d, b.z + b.d);
                if (hi - lo > 0.05) {
                    merges.push({ axis: 'z', at: a.x + a.w, from: lo, to: hi });
                    merges.push({ axis: 'z', at: a.x, from: lo, to: hi });
                }
            }
        });
    });

    /* طرح الفتحات (أبواب وممرات وحدود الدمج) من القطعة الجدارية */
    const cuts = openings.concat(merges);

    function subtract(seg) {
        let parts = [{ from: seg.from, to: seg.to }];
        cuts
            .filter((o) => o.axis === seg.axis && Math.abs(o.at - seg.at) < 0.28)
            .forEach((o) => {
                const oa = Math.min(o.from, o.to), ob = Math.max(o.from, o.to);
                const next = [];
                parts.forEach((p) => {
                    if (ob <= p.from || oa >= p.to) { next.push(p); return; }
                    if (oa > p.from) next.push({ from: p.from, to: oa });
                    if (ob < p.to) next.push({ from: ob, to: p.to });
                });
                parts = next;
            });
        return parts.filter((p) => p.to - p.from > 0.05);
    }

    /* رسم الجدران */
    const EPS = 0.06;
    segs.forEach((seg) => {
        const onOuter = seg.axis === 'x'
            ? (Math.abs(seg.at) < EPS || Math.abs(seg.at - D) < EPS)
            : (Math.abs(seg.at) < EPS || Math.abs(seg.at - W) < EPS);
        const isFront = seg.axis === 'x' && Math.abs(seg.at - D) < EPS;
        const h = isFront ? frontH : (onOuter ? wallH : innerH);
        const material = onOuter ? MAT.wall : MAT.wallIn;

        subtract(seg).forEach((p) => {
            const len = p.to - p.from;
            const mid = (p.from + p.to) / 2;
            if (seg.axis === 'x') scene.add(box(len, h, T, material, cx(mid), h / 2, cz(seg.at)));
            else scene.add(box(T, h, len, material, cx(seg.at), h / 2, cz(mid)));
        });
    });

    /* الأبواب داخل الفتحات — ارتفاع الباب يتبع الجدار الذي يقع فيه */
    openings.filter((o) => o.kind === 'door').forEach((o) => {
        const len = Math.abs(o.to - o.from);
        const mid = (o.from + o.to) / 2;
        const outer = o.axis === 'x'
            ? (Math.abs(o.at) < EPS || Math.abs(o.at - D) < EPS)
            : (Math.abs(o.at) < EPS || Math.abs(o.at - W) < EPS);
        const front = o.axis === 'x' && Math.abs(o.at - D) < EPS;
        const dh = (front ? frontH : (outer ? wallH : innerH)) * 0.94;
        if (o.axis === 'x') {
            scene.add(box(len * 0.96, dh, 0.06, MAT.wood, cx(mid), dh / 2, cz(o.at)));
            scene.add(box(0.09, 0.15, 0.05, MAT.gold, cx(mid + len * 0.34), dh * 0.62, cz(o.at) - 0.06));
        } else {
            scene.add(box(0.06, dh, len * 0.96, MAT.wood, cx(o.at), dh / 2, cz(mid)));
            scene.add(box(0.05, 0.15, 0.09, MAT.gold, cx(o.at) - 0.06, dh * 0.62, cz(mid + len * 0.34)));
        }
    });

    /* النوافذ */
    windows.forEach((wn) => {
        const len = Math.abs(wn.to - wn.from);
        const mid = (wn.from + wn.to) / 2;
        const gh = wallH * 0.5;
        const gy = wallH * 0.62;
        if (wn.axis === 'z') scene.add(box(len, gh, 0.05, MAT.glass, cx(mid), gy, cz(wn.at)));
        else scene.add(box(0.05, gh, len, MAT.glass, cx(wn.at), gy, cz(mid)));
    });

    /* الأثاث لكل غرفة */
    rooms.forEach((r) => {
        const g = new THREE.Group();
        g.userData.room = r.key;
        g.userData.info = {
            name: r.name,
            icon: (ROOM_INFO[r.type] || {}).icon || '📐',
            desc: (ROOM_INFO[r.type] || {}).desc || '',
            area: (r.w * r.d).toFixed(1),
            dims: r.w + ' × ' + r.d + ' م',
        };

        const R = {
            x0: cx(r.x), z0: cz(r.z), w: r.w, d: r.d,
            mx: cx(r.x + r.w / 2), mz: cz(r.z + r.d / 2),
            facing: r.facing || 'south',
        };
        (FURNITURE[r.type] || (() => []))(R).forEach((m) => g.add(m));

        scene.add(g);
        pickables.push(g);
    });

    return { pickables, rooms, W, D };
}

/* ── الإضاءة ─────────────────────────────────────────────────────── */
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

/* أزرار الغرف تُولَّد من الملف حتى تتطابق دائماً مع المخطط */
function buildChips(rooms) {
    const zone = document.querySelector('.apt3d-chips');
    if (!zone) return;
    const extras = Array.from(zone.querySelectorAll('.apt3d-chip.alt'));
    zone.innerHTML = '';
    rooms.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'apt3d-chip';
        b.dataset.room = r.key;
        b.textContent = ((ROOM_INFO[r.type] || {}).icon || '📐') + ' ' + r.name;
        zone.appendChild(b);
    });
    extras.forEach((e) => zone.appendChild(e));
}

/* ── التشغيل ─────────────────────────────────────────────────────── */
function init(container, plan) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);

    buildLights(scene);
    const { pickables, rooms, W, D } = buildApartment(scene, plan);
    buildChips(rooms);

    /* الكاميرا تُؤطَّر تلقائياً على الحجم الفعلي للشقة */
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const radius = Math.hypot(W, D) / 2;
    const fitDist = (radius / Math.sin((camera.fov * Math.PI / 180) / 2)) * 0.62;
    const DIR = new THREE.Vector3(0.42, 0.62, 0.66).normalize();
    const HOME = DIR.clone().multiplyScalar(fitDist);
    camera.position.copy(HOME);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = radius * 0.35;
    controls.maxDistance = fitDist * 2.4;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 0.6, 0);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const infoEl = document.getElementById('apt3d-info');
    let downPos = null;
    let anim = null;

    renderer.domElement.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', (e) => {
        if (!downPos) return;
        const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
        downPos = null;
        if (moved > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(pickables, true)[0];
        if (!hit) return;
        let o = hit.object;
        while (o && !o.userData.room) o = o.parent;
        if (o) selectRoom(o.userData.room);
    });

    function selectRoom(key) {
        const g = pickables.find((p) => p.userData.room === key);
        const r = rooms.find((x) => x.key === key);
        if (!g || !r) return;

        const info = g.userData.info;
        if (infoEl) {
            infoEl.innerHTML = '<b>' + info.icon + ' ' + info.name + '</b>'
                + '<span>' + info.desc + '</span>'
                + '<span style="margin-top:6px;font-weight:700;color:var(--text-main,#0f172a)">'
                + 'المساحة ' + info.area + ' م² • ' + info.dims + '</span>';
            infoEl.classList.add('visible');
        }

        document.querySelectorAll('.apt3d-chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.room === key);
        });

        const t = new THREE.Vector3(r.x + r.w / 2 - W / 2, 0.6, r.z + r.d / 2 - D / 2);
        const dist = Math.max(4, Math.max(r.w, r.d) * 1.5);
        anim = {
            from: controls.target.clone(), to: t,
            camFrom: camera.position.clone(),
            camTo: t.clone().add(new THREE.Vector3(dist * 0.6, dist * 0.95, dist)),
            t: 0,
        };
    }

    document.querySelectorAll('.apt3d-chip').forEach((chip) => {
        if (chip.dataset.room) chip.addEventListener('click', () => selectRoom(chip.dataset.room));
    });

    const resetBtn = document.getElementById('apt3d-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        document.querySelectorAll('.apt3d-chip').forEach((c) => c.classList.remove('active'));
        if (infoEl) infoEl.classList.remove('visible');
        anim = {
            from: controls.target.clone(), to: new THREE.Vector3(0, 0.6, 0),
            camFrom: camera.position.clone(), camTo: HOME.clone(), t: 0,
        };
    });

    let autoRotate = true;
    const rotBtn = document.getElementById('apt3d-rotate');
    if (rotBtn) rotBtn.addEventListener('click', () => {
        autoRotate = !autoRotate;
        rotBtn.textContent = autoRotate ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران';
    });

    function resize() {
        const w = container.clientWidth;
        const h = container.clientHeight || Math.round(w * 0.62);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // إن كانت اللوحة ضيقة (جوال) ابتعد قليلاً حتى تظهر الشقة كاملة
        const need = camera.aspect < 1.5 ? Math.min(1.5 / camera.aspect, 1.8) : 1;
        const wasHome = camera.position.distanceTo(HOME) < 0.01;
        HOME.copy(DIR).multiplyScalar(fitDist * need);
        if (wasHome) camera.position.copy(HOME);   // أعد التأطير ما دام العرض لم يُحرَّك
        camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(container);

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05);
        if (anim) {
            anim.t = Math.min(anim.t + dt * 1.6, 1);
            const e = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
            controls.target.lerpVectors(anim.from, anim.to, e);
            camera.position.lerpVectors(anim.camFrom, anim.camTo, e);
            if (anim.t >= 1) anim = null;
        } else if (autoRotate) {
            const p = camera.position;
            const a = 0.12 * dt;
            p.set(p.x * Math.cos(a) - p.z * Math.sin(a), p.y, p.x * Math.sin(a) + p.z * Math.cos(a));
        }
        controls.update();
        renderer.render(scene, camera);
    });

    container.classList.add('ready');
}

async function loadPlan() {
    try {
        const res = await fetch('data/floorplan.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('http ' + res.status);
        const plan = await res.json();
        if (!plan.apartment || !Array.isArray(plan.rooms)) throw new Error('bad plan');
        return plan;
    } catch (e) {
        console.warn('[3D] تعذّر تحميل floorplan.json، سيُستخدم المخطط الافتراضي:', e.message);
        return FALLBACK;
    }
}

const host = document.getElementById('apt3d-canvas');
if (host) {
    loadPlan().then((plan) => {
        try {
            init(host, plan);
        } catch (err) {
            console.error('[3D] فشل بناء المجسم:', err);
            const fb = host.querySelector('.apt3d-fallback');
            if (fb) fb.innerHTML = 'تعذّر عرض المجسم.<small>تحقق من صحة ملف data/floorplan.json</small>';
        }
    });
}
