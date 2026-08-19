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
    floorWood: mat(0xf1efec, { roughness: 0.18, metalness: 0.05 }),   // رخام أبيض كما في الصور
    floorTile: mat(0xf4f3f1, { roughness: 0.16, metalness: 0.05 }),
    floorBath: mat(0xd7e3ee, { roughness: 0.3 }),
    wall: mat(0xdcd5cb),        // جدران بلون بيج دافئ
    wallIn: mat(0xd3ccc2),
    wood: mat(0x9a7d5f),
    woodLight: mat(0xc9ad8b),
    fabric: mat(0x76786f),      // كنب رمادي
    fabricWarm: mat(0xe8e6df),  // وسائد فاتحة
    white: mat(0xfafafa),
    dark: mat(0x2b3440, { roughness: 0.4 }),
    steel: mat(0xc0c8d0, { roughness: 0.25, metalness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9ecbe8, transparent: true, opacity: 0.32, roughness: 0.1 }),
    screenOff: mat(0x0d1117, { roughness: 0.25, metalness: 0.3 }),
    gold: mat(0xc9a227, { roughness: 0.25, metalness: 0.75 }),
    slab: mat(0xb9c2cc),
    water: new THREE.MeshStandardMaterial({
        color: 0xbfe4f5, transparent: true, opacity: 0.5,
        roughness: 0.08, metalness: 0.1,
        emissive: 0x2b7fa8, emissiveIntensity: 0.25,
    }),
    rug: new THREE.MeshStandardMaterial({ map: makeRugTexture(), roughness: 0.95, metalness: 0 }),
    cushion: new THREE.MeshStandardMaterial({ map: makeCushionTexture(), roughness: 0.85, metalness: 0 }),
};

const FLOOR_MAT = {
    bedroom: 'floorWood', living: 'floorWood', hall: 'floorWood',
    kitchen: 'floorTile', bath: 'floorBath',
};

/* ── نُسج مزخرفة تُرسم على canvas: سجاد منقوش ووسائد مربّعات ───────── */
function makeCanvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

/* سجادة منسوجة بزخارف هندسية — مستوحاة من سجاد الشقة في الصور */
function makeRugTexture() {
    return makeCanvasTexture(512, 384, (g, W, H) => {
        g.fillStyle = '#cdc1ac';
        g.fillRect(0, 0, W, H);

        // نسيج خشن خفيف
        for (let i = 0; i < 5200; i++) {
            g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(120,105,85,0.06)';
            g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
        }

        // إطارات متداخلة
        [[16, '#a8977c'], [30, '#bcae95'], [44, '#8f8068']].forEach(([p, col]) => {
            g.strokeStyle = col;
            g.lineWidth = 6;
            g.strokeRect(p, p, W - p * 2, H - p * 2);
        });

        // معينات في الوسط
        const midY = H / 2;
        const step = 74;
        for (let x = step; x < W - 40; x += step) {
            g.beginPath();
            g.moveTo(x, midY - 34);
            g.lineTo(x + 30, midY);
            g.lineTo(x, midY + 34);
            g.lineTo(x - 30, midY);
            g.closePath();
            g.fillStyle = '#8f8068';
            g.fill();

            g.beginPath();
            g.moveTo(x, midY - 16);
            g.lineTo(x + 14, midY);
            g.lineTo(x, midY + 16);
            g.lineTo(x - 14, midY);
            g.closePath();
            g.fillStyle = '#e2d9c6';
            g.fill();
        }

        // أشرطة أفقية علوية وسفلية
        [72, H - 78].forEach((y) => {
            g.fillStyle = '#a8977c';
            g.fillRect(56, y, W - 112, 10);
            g.fillStyle = '#e2d9c6';
            for (let x = 62; x < W - 60; x += 26) g.fillRect(x, y + 2, 12, 6);
        });
    });
}

/* قماش وسائد بمربّعات — مطابق لوسائد الصالة في الصور */
function makeCushionTexture() {
    return makeCanvasTexture(128, 128, (g, W, H) => {
        const n = 8, s = W / n;
        for (let r = 0; r < n; r++) {
            for (let col = 0; col < n; col++) {
                g.fillStyle = (r + col) % 2 ? '#f2efe6' : '#3a3a38';
                g.fillRect(col * s, r * s, s, s);
            }
        }
    });
}

/* ── شاشة يوتيوب: نسيج يُرسم على canvas ويتحدّث كأن الفيديو يعمل ───── */
function makeYouTubeScreen() {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const g = c.getContext('2d');
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;

    const rounded = (x, y, w, h, r) => {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    };

    /* progress: من 0 إلى 1 */
    function draw(progress) {
        const W = c.width, H = c.height;

        // خلفية مشغّل يوتيوب الداكنة
        g.fillStyle = '#0f0f0f';
        g.fillRect(0, 0, W, H);

        // إطار الفيديو نفسه بتدرّج خفيف ليبدو كمشهد يعمل
        const grad = g.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#1f2937');
        grad.addColorStop(0.5, '#374151');
        grad.addColorStop(1, '#111827');
        g.fillStyle = grad;
        g.fillRect(0, 26, W, H - 74);

        // شعار يوتيوب: مستطيل أحمر بمثلث أبيض
        const bw = 132, bh = 92;
        const bx = (W - bw) / 2, by = (H - bh) / 2 - 6;
        g.fillStyle = '#ff0000';
        rounded(bx, by, bw, bh, 24);
        g.fill();

        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(bx + bw * 0.40, by + bh * 0.28);
        g.lineTo(bx + bw * 0.40, by + bh * 0.72);
        g.lineTo(bx + bw * 0.70, by + bh * 0.50);
        g.closePath();
        g.fill();

        // شريط علوي: عنوان وهمي
        g.fillStyle = '#0f0f0f';
        g.fillRect(0, 0, W, 26);
        g.fillStyle = '#ff0000';
        rounded(12, 7, 26, 12, 4);
        g.fill();
        g.fillStyle = '#3f3f3f';
        rounded(48, 8, 150, 10, 5);
        g.fill();

        // شريط التقدّم السفلي
        const barY = H - 34;
        g.fillStyle = '#0f0f0f';
        g.fillRect(0, H - 48, W, 48);

        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(20, barY, W - 40, 5);

        const p = Math.max(0, Math.min(1, progress));
        g.fillStyle = '#ff0000';
        g.fillRect(20, barY, (W - 40) * p, 5);

        g.beginPath();
        g.arc(20 + (W - 40) * p, barY + 2.5, 8, 0, Math.PI * 2);
        g.fill();

        // أزرار تحكم مبسّطة
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(22, H - 20);
        g.lineTo(22, H - 6);
        g.lineTo(34, H - 13);
        g.closePath();
        g.fill();

        texture.needsUpdate = true;
    }

    draw(0);
    return { texture, draw };
}

/* صندوق بأبعاد ومركز محددين */
function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/* ── نفّاث ماء: قطرات تتساقط داخل مجموعة مخفية حتى الضغط على الحنفية ── */
function makeWaterJet(spread, height, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.visible = false;
    g.userData.waterJet = true;
    g.userData.drops = [];

    const wide = spread > 0.1;

    // الحنفية الضيقة: عمود ماء متصل حتى قاع الحوض ليكون واضحاً
    if (!wide) {
        const stream = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.013, height, 8), MAT.water);
        stream.position.y = -height / 2;
        g.add(stream);
    }

    const n = wide ? 14 : 7;
    for (let i = 0; i < n; i++) {
        const r = spread * (0.25 + Math.random() * 0.75);
        const a = Math.random() * Math.PI * 2;
        const d = new THREE.Mesh(
            new THREE.CylinderGeometry(wide ? 0.008 : 0.012, wide ? 0.006 : 0.009,
                height * (wide ? 0.22 : 0.3), 6),
            MAT.water);
        d.position.set(Math.cos(a) * r, -Math.random() * height, Math.sin(a) * r);
        d.userData.speed = 1.6 + Math.random() * 1.4;
        g.add(d);
        g.userData.drops.push(d);
    }
    g.userData.height = height;
    return g;
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
            // كومودينو وأباجورة على جانبَي السرير
            box(0.45, 0.45, 0.4, MAT.white, bx + bw / 2 + 0.32, 0.26, bz - bl / 2 + 0.25),
            box(0.18, 0.28, 0.18, MAT.fabricWarm, bx + bw / 2 + 0.32, 0.62, bz - bl / 2 + 0.25),
            box(0.45, 0.45, 0.4, MAT.white, bx - bw / 2 - 0.32, 0.26, bz - bl / 2 + 0.25),
            box(0.18, 0.28, 0.18, MAT.fabricWarm, bx - bw / 2 - 0.32, 0.62, bz - bl / 2 + 0.25),
            // سجادة منقوشة أمام السرير
            box(bw * 1.45, 0.02, Math.min(1.5, R.d * 0.34), MAT.rug, bx, 0.05, bz + bl / 2 + 0.55),
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
        // الكنب على الجدار الجانبي (شرقي افتراضاً) والتلفزيون على الجدار الشمالي
        const east = (R.sofaSide || 'east') === 'east';
        const wallX = east ? R.x0 + R.w - 0.16 : R.x0 + 0.16;   // الجدار الملاصق للكنب
        const inward = east ? -1 : 1;                            // اتجاه داخل الغرفة
        const sofaX = wallX + inward * 0.46;
        const sofaLen = Math.min(2.4, R.d * 0.78);
        const sofaZ = R.z0 + R.d / 2 + 0.15;
        const tvX = R.mx + inward * 0.35;
        const loveZ = R.z0 + 2.62;   // الكنب الصغير مُبعد خلف السجادة، ووجهه للشاشة

        // شاشة التلفزيون — قابلة للتشغيل بالضغط (تفتح يوتيوب)
        const screen = box(1.25, 0.72, 0.05, MAT.screenOff.clone(), tvX, 0.88, R.z0 + 0.22);
        screen.userData.interactive = 'tv';
        screen.userData.tvAnchor = [tvX, 0.88, R.z0 + 0.5];

        return [
            box(0.25, 0.62, sofaLen, MAT.fabric, wallX, 0.55, sofaZ),                       // ظهر الكنب
            box(0.92, 0.42, sofaLen, MAT.fabric, sofaX, 0.26, sofaZ),                        // المقعد
            box(0.92, 0.5, 0.24, MAT.fabric, sofaX, 0.5, sofaZ - sofaLen / 2),
            box(0.92, 0.5, 0.24, MAT.fabric, sofaX, 0.5, sofaZ + sofaLen / 2),
            box(0.42, 0.16, 0.42, MAT.cushion, sofaX, 0.55, sofaZ - sofaLen * 0.26),
            box(0.42, 0.16, 0.42, MAT.cushion, sofaX, 0.55, sofaZ + sofaLen * 0.26),

            box(0.66, 0.04, 1.1, MAT.glass, sofaX + inward * 0.95, 0.44, sofaZ),              // طاولة قهوة زجاجية
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + inward * 0.72, 0.2, sofaZ - 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + inward * 1.18, 0.2, sofaZ - 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + inward * 0.72, 0.2, sofaZ + 0.4),
            box(0.09, 0.36, 0.09, MAT.gold, sofaX + inward * 1.18, 0.2, sofaZ + 0.4),

            box(R.w * 0.62, 0.02, R.d * 0.6, MAT.rug, R.mx, 0.05, sofaZ),                     // سجادة

            box(1.35, 0.42, 0.34, MAT.woodLight, tvX, 0.24, R.z0 + 0.3),                      // طاولة التلفزيون
            screen,

            // كنب صغير (مقعدان) مقابل الشاشة تماماً، ظهره للجنوب ووجهه للتلفزيون
            box(1.45, 0.40, 0.80, MAT.fabric, tvX, 0.25, loveZ),                              // المقعد
            box(1.45, 0.55, 0.22, MAT.fabric, tvX, 0.50, loveZ + 0.40),                       // الظهر
            box(0.20, 0.46, 0.80, MAT.fabric, tvX - 0.72, 0.46, loveZ),                       // مسند يمين
            box(0.20, 0.46, 0.80, MAT.fabric, tvX + 0.72, 0.46, loveZ),                       // مسند يسار
            box(0.38, 0.14, 0.30, MAT.cushion, tvX - 0.34, 0.52, loveZ + 0.22),               // وسادة
            box(0.38, 0.14, 0.30, MAT.cushion, tvX + 0.34, 0.52, loveZ + 0.22),               // وسادة

            // كرسي مفرد مقابل الكنب
            box(0.6, 0.42, 0.6, MAT.fabric, sofaX + inward * 1.85, 0.26, sofaZ + 0.35),
            box(0.6, 0.5, 0.18, MAT.fabric, sofaX + inward * 2.06, 0.55, sofaZ + 0.35),
            box(0.06, 0.24, 0.06, MAT.dark, sofaX + inward * 1.66, 0.12, sofaZ + 0.13),
            box(0.06, 0.24, 0.06, MAT.dark, sofaX + inward * 1.66, 0.12, sofaZ + 0.57),

            // لوحة جدارية فوق الكنب
            box(0.03, 0.42, 1.05, mat(0xa9a196), wallX - inward * 0.05, 0.92, sofaZ),
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
        // الباب في الجدار الجنوبي ناحية الشرق، لذلك:
        // الجدار الشمالي: الدش (غرباً) ثم المغسلة (شرقاً) — جنباً إلى جنب.
        // المرحاض ملاصق تماماً للجدار الغربي.
        const showerX = R.x0 + 0.56;                  // الجدار الشمالي — غرب المغسلة
        const showerZ = R.z0 + 0.48;
        const basinX = R.x0 + R.w - 0.44;             // الجدار الشمالي — شرقاً
        const basinZ = R.z0 + 0.38;
        const toiletX = R.x0 + 0.34;                  // ملاصق للجدار الغربي
        const toiletZ = R.z0 + R.d - 0.92;

        const out = [
            // ── المرحاض: ظهره على الجدار الغربي تماماً ──
            box(0.56, 0.42, 0.40, MAT.white, toiletX + 0.10, 0.22, toiletZ),
            box(0.16, 0.52, 0.40, MAT.white, R.x0 + 0.09, 0.52, toiletZ),   // الخزان على الجدار
            box(0.32, 0.05, 0.34, MAT.white, toiletX + 0.18, 0.45, toiletZ),

            // ── الدش: بلا قاعدة زجاجية — مصرف أرضي فقط ──
            box(0.16, 0.012, 0.16, MAT.steel, showerX, 0.045, showerZ),      // مصرف الأرضية
            box(0.06, 1.15, 0.06, MAT.steel, showerX, 0.62, R.z0 + 0.10),    // عمود الدش على الجدار

            // ── المغسلة الصغيرة مع مرآة على الجدار الشمالي ──
            box(0.46, 0.11, 0.34, MAT.white, basinX, 0.85, basinZ),
            box(0.30, 0.74, 0.26, MAT.white, basinX, 0.42, basinZ),
            box(0.44, 0.54, 0.03, mat(0xdfe9f2, { metalness: 0.6, roughness: 0.15 }),
                basinX, 1.36, R.z0 + 0.06),                                   // المرآة
        ];

        /* عناصر تفاعلية: الضغط عليها يُخرج الماء */
        const head = box(0.26, 0.06, 0.26, MAT.steel, showerX, 1.22, R.z0 + 0.30);
        const mixer = box(0.14, 0.16, 0.09, MAT.steel, showerX, 0.98, R.z0 + 0.11);
        const tap = box(0.05, 0.18, 0.05, MAT.steel, basinX, 1.00, basinZ - 0.12);
        const spout = box(0.05, 0.04, 0.16, MAT.steel, basinX, 1.07, basinZ - 0.05);

        const showerJet = makeWaterJet(0.22, 1.10, showerX, 1.19, R.z0 + 0.30);
        const basinJet = makeWaterJet(0.055, 0.20, basinX, 1.05, basinZ - 0.02);

        [head, mixer].forEach((m) => {
            m.userData.interactive = 'water';
            m.userData.jet = showerJet;
            m.userData.label = '🚿 الدش';
        });
        [tap, spout, out[5], out[6]].forEach((m) => {
            m.userData.interactive = 'water';
            m.userData.jet = basinJet;
            m.userData.label = '🚰 المغسلة';
        });

        return out.concat([head, mixer, tap, spout, showerJet, basinJet]);
    },

    hall(R) {
        return [
            box(Math.min(0.9, R.w * 0.25), 0.4, 0.35, MAT.woodLight, R.x0 + 0.8, 0.22, R.z0 + R.d - 0.3),
            box(0.5, 0.02, 0.8, MAT.rug, R.mx, 0.05, R.z0 + R.d - 0.5),
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

    /* الأبواب داخل الفتحات — كل باب مجموعة تدور حول مفصلها عند الضغط */
    const doors = [];

    /* مقابض الأبواب — تُبنى في إطار محلي (u على امتداد الباب، n عمودياً عليه)
       ثم تُسقط على المحور الصحيح. smart = قفل بصمة إلكتروني، lever = مقبض عادي. */
    const HANDLE_PANEL = mat(0x23262b, { roughness: 0.35, metalness: 0.55 });
    const HANDLE_PAD = mat(0x3fa9e0, { roughness: 0.2, metalness: 0.3, emissive: 0x1d6f9c, emissiveIntensity: 0.6 });

    function addHandle(pivot, axis, lock, len, dh) {
        // put(uSize, ySize, nSize, material, u, y, n)
        const put = axis === 'x'
            ? (a, b, c, m, u, y, n) => box(a, b, c, m, u, y, n)
            : (a, b, c, m, u, y, n) => box(c, b, a, m, n, y, u);

        const u = len * 0.84;
        const y = dh * 0.55;

        if (lock === 'smart') {
            // لوحة قفل ذكي عمودية + قارئ بصمة مضيء + مقبض معدني قصير
            pivot.add(put(0.13, 0.46, 0.035, HANDLE_PANEL, u, y + 0.06, -0.048));
            pivot.add(put(0.075, 0.075, 0.015, HANDLE_PAD, u, y + 0.16, -0.068));
            pivot.add(put(0.055, 0.055, 0.012, mat(0x8f98a3, { metalness: 0.7, roughness: 0.3 }),
                u, y - 0.03, -0.068));
            pivot.add(put(0.05, 0.16, 0.05, MAT.steel, u, y - 0.16, -0.08));
            // نفس اللوحة على الوجه الآخر
            pivot.add(put(0.12, 0.34, 0.03, HANDLE_PANEL, u, y + 0.02, 0.045));
            pivot.add(put(0.05, 0.16, 0.05, MAT.steel, u, y - 0.16, 0.075));
        } else {
            // مقبض عادي: وردة دائرية + ذراع أفقي على الوجهين
            [-1, 1].forEach((s) => {
                pivot.add(put(0.09, 0.09, 0.018, MAT.gold, u, y, s * 0.042));
                pivot.add(put(0.05, 0.05, 0.055, MAT.gold, u, y, s * 0.075));
                pivot.add(put(0.15, 0.035, 0.035, MAT.gold, u - 0.05, y, s * 0.10));
            });
        }
    }

    openings.filter((o) => o.kind === 'door').forEach((o) => {
        const len = Math.abs(o.to - o.from);
        const outer = o.axis === 'x'
            ? (Math.abs(o.at) < EPS || Math.abs(o.at - D) < EPS)
            : (Math.abs(o.at) < EPS || Math.abs(o.at - W) < EPS);
        const front = o.axis === 'x' && Math.abs(o.at - D) < EPS;
        const dh = (front ? frontH : (outer ? wallH : innerH)) * 0.94;

        const pivot = new THREE.Group();
        pivot.userData.interactive = 'door';
        pivot.userData.open = false;
        pivot.userData.swing = o.swing === 'ccw' ? 1 : -1;
        pivot.userData.lock = o.lock === 'smart' ? 'smart' : 'lever';

        if (o.axis === 'x') {
            pivot.position.set(cx(Math.min(o.from, o.to)), 0, cz(o.at));
            pivot.add(box(len * 0.97, dh, 0.06, MAT.wood, len / 2, dh / 2, 0));
        } else {
            pivot.position.set(cx(o.at), 0, cz(Math.min(o.from, o.to)));
            pivot.add(box(0.06, dh, len * 0.97, MAT.wood, 0, dh / 2, len / 2));
        }
        addHandle(pivot, o.axis, pivot.userData.lock, len, dh);

        scene.add(pivot);
        doors.push(pivot);
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
            sofaSide: r.sofaSide,
        };
        (FURNITURE[r.type] || (() => []))(R).forEach((m) => g.add(m));

        scene.add(g);
        pickables.push(g);
    });

    return { pickables, rooms, doors, W, D };
}

/* ── الإضاءة ─────────────────────────────────────────────────────── */
function buildLights(scene, plan) {
    const A = plan.apartment;
    const W = A.width, D = A.depth;

    // ضوء السماء العام — بارد من الأعلى ودافئ منعكس من الأرضية
    scene.add(new THREE.HemisphereLight(0xdceaff, 0xc8ad8c, 0.7));

    // شمس الرياض: ضوء رئيسي دافئ مع ظلال ناعمة
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.75);
    sun.position.set(W * 0.55, Math.max(12, W * 0.9), D * 1.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    const s = Math.max(W, D) * 0.75;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    scene.add(sun);

    // ضوء ملء بارد يوازن الظلال العميقة
    const fill = new THREE.DirectionalLight(0xbfd8f5, 0.5);
    fill.position.set(-W * 0.4, 7, -D);
    scene.add(fill);

    // إنارة داخلية دافئة لكل غرفة — تحاكي الإضاءة المخفية في الصور
    (plan.rooms || []).forEach((r) => {
        const lamp = new THREE.PointLight(0xffd7a0, 4.2, Math.max(r.w, r.d) * 1.6, 2);
        lamp.position.set(r.x + r.w / 2 - W / 2, 1.95, r.z + r.d / 2 - D / 2);
        scene.add(lamp);

    });
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
        b.title = r.name;
        b.setAttribute('aria-label', r.name);

        // الأيقونة وحدها هي الظاهرة؛ الاسم يبقى في عنصر مخفي لقارئات الشاشة
        b.append(((ROOM_INFO[r.type] || {}).icon || '📐') + ' ');
        const label = document.createElement('span');
        label.className = 'apt3d-chip-label';
        label.textContent = r.name;
        b.appendChild(label);

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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;   // تدرّج لوني سينمائي
    renderer.toneMappingExposure = 0.94;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f7);

    buildLights(scene, plan);
    const { pickables, rooms, doors, W, D } = buildApartment(scene, plan);
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

        // الأبواب والشاشة لها الأولوية على تحديد الغرفة
        const hits = raycaster.intersectObjects(doors.concat(pickables), true);
        if (!hits.length) return;

        let o = hits[0].object;
        while (o && !o.userData.interactive && !o.userData.room) o = o.parent;
        if (!o) return;

        if (o.userData.interactive === 'door') return toggleDoor(o);
        if (o.userData.interactive === 'tv') return toggleTv(o);
        if (o.userData.interactive === 'water') return toggleWater(o);
        if (o.userData.room) selectRoom(o.userData.room);
    });

    /* فتح/إغلاق الباب بحركة انسيابية */
    const doorAnims = [];
    function toggleDoor(pivot) {
        pivot.userData.open = !pivot.userData.open;
        const target = pivot.userData.open ? pivot.userData.swing * Math.PI * 0.52 : 0;
        doorAnims.push({ pivot, from: pivot.rotation.y, to: target, t: 0 });
        hint(pivot.userData.open ? '🚪 فُتح الباب' : '🚪 أُغلق الباب');
    }

    /* فتح/إغلاق الماء في المغسلة أو الدش */
    const jets = [];
    scene.traverse((n) => { if (n.userData && n.userData.waterJet) jets.push(n); });

    function toggleWater(target) {
        const jet = target.userData.jet;
        if (!jet) return;
        jet.visible = !jet.visible;
        hint(jet.visible
            ? (target.userData.label || '💧') + ' — الماء يجري'
            : (target.userData.label || '💧') + ' — أُغلق الماء');
    }

    function updateWater(dt) {
        jets.forEach((j) => {
            if (!j.visible) return;
            const h = j.userData.height;
            j.userData.drops.forEach((d) => {
                d.position.y -= d.userData.speed * dt;
                if (d.position.y < -h) d.position.y += h;
            });
        });
    }

    /* تشغيل/إطفاء التلفزيون — يفتح واجهة يوتيوب */
    const tvLight = new THREE.PointLight(0xdfe9ff, 0, 3.4, 2);
    scene.add(tvLight);

    const yt = makeYouTubeScreen();
    let tvOnScreen = null;      // الشاشة العاملة حالياً
    let tvProgress = 0;         // موضع شريط التقدّم
    let tvRedraw = 0;           // مؤقّت إعادة الرسم

    function toggleTv(screen) {
        const on = !screen.userData.on;
        screen.userData.on = on;
        const m = screen.material;

        if (on) {
            tvProgress = 0;
            yt.draw(0);
            m.map = yt.texture;
            m.emissiveMap = yt.texture;
            m.color.set(0xffffff);
            m.emissive.set(0xffffff);
            m.emissiveIntensity = 1.0;
            tvOnScreen = screen;
        } else {
            m.map = null;
            m.emissiveMap = null;
            m.color.set(0x0d1117);
            m.emissive.set(0x000000);
            m.emissiveIntensity = 0;
            tvOnScreen = null;
        }
        m.needsUpdate = true;

        const a = screen.userData.tvAnchor;
        if (a) tvLight.position.set(a[0], a[1], a[2]);
        tvLight.intensity = on ? 6 : 0;
        hint(on ? '📺 يوتيوب يعمل الآن' : '📺 التلفزيون مطفأ');
    }

    /* تقدّم شريط الفيديو — يُستدعى من حلقة الرسم */
    function updateTv(dt) {
        if (!tvOnScreen) return;
        tvProgress = (tvProgress + dt * 0.05) % 1;
        tvRedraw += dt;
        if (tvRedraw >= 0.25) {            // إعادة رسم 4 مرات بالثانية تكفي بصرياً
            tvRedraw = 0;
            yt.draw(tvProgress);
        }
    }

    /* رسالة قصيرة أسفل اللوحة */
    let hintTimer = null;
    function hint(text) {
        if (!infoEl) return;
        infoEl.innerHTML = `<b>${text}</b><span>اضغط مرة أخرى للعكس</span>`;
        infoEl.classList.add('visible');
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => infoEl.classList.remove('visible'), 2200);
    }

    /* تغيير شكل المؤشر فوق العناصر التفاعلية */
    renderer.domElement.addEventListener('pointermove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const h = raycaster.intersectObjects(doors.concat(pickables), true)[0];
        let o = h && h.object;
        while (o && !o.userData.interactive && !o.userData.room) o = o.parent;
        renderer.domElement.style.cursor = o ? 'pointer' : 'grab';
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
        const label = autoRotate ? 'إيقاف الدوران' : 'تشغيل الدوران';
        rotBtn.textContent = autoRotate ? '⏸️' : '▶️';
        rotBtn.title = label;
        rotBtn.setAttribute('aria-label', label);
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
        // حركة فتح/إغلاق الأبواب
        for (let i = doorAnims.length - 1; i >= 0; i--) {
            const a = doorAnims[i];
            a.t = Math.min(a.t + dt * 2.2, 1);
            const e = 1 - Math.pow(1 - a.t, 3);           // تباطؤ في النهاية
            a.pivot.rotation.y = a.from + (a.to - a.from) * e;
            if (a.t >= 1) doorAnims.splice(i, 1);
        }

        updateTv(dt);
        updateWater(dt);
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
