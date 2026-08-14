/* ==========================================================================
   لوحة تحكم إدارة العقارات
   البيانات محفوظة محلياً (localStorage) — لا تحتاج خادماً
   ========================================================================== */
(function () {
    'use strict';

    const STORE_KEY = 'rhsa_admin_v2';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    /* ---------------------------------------------------------------------
       0. بوابة الدخول — مصادقة حقيقية عبر Supabase Auth
       رمز الدخول هو كلمة سر حساب المالك الفعلي؛ الدخول ينشئ جلسة حقيقية
       (JWT) تمنح صلاحية القراءة والكتابة على الرسائل بحكم سياسات RLS
       (role = authenticated)، وليست مجرد إخفاء واجهة كما كانت سابقاً.
       --------------------------------------------------------------------- */
    const OWNER_EMAIL = 'muhammedalrubaish@gmail.com';

    function unlock() {
        const lock = document.getElementById('lock');
        const app = document.getElementById('app');
        if (lock) lock.remove();
        if (app) app.hidden = false;
        start();
    }

    async function initGate() {
        const form = document.getElementById('lock-form');
        const input = document.getElementById('lock-pass');
        const err = document.getElementById('lock-err');
        const client = window.getSupabaseClient ? window.getSupabaseClient() : null;

        if (!form) return unlock();                       // لا توجد بوابة

        // جلسة محفوظة مسبقاً (Supabase يحفظها في localStorage تلقائياً)
        if (client) {
            const { data } = await client.auth.getSession();
            if (data && data.session) return unlock();
        }

        input.focus();
        let tries = 0;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!client) {
                err.textContent = 'تعذّر الاتصال بالخادم — تحقق من الإنترنت';
                return;
            }

            const btn = form.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'جارٍ التحقق…';

            const { error } = await client.auth.signInWithPassword({
                email: OWNER_EMAIL,
                password: input.value.trim(),
            });

            btn.disabled = false;
            btn.textContent = 'دخول';

            if (!error) return unlock();

            if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
                err.textContent = 'تعذّر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً';
                input.focus();
                return;
            }

            tries++;
            err.textContent = tries >= 3 ? 'رمز غير صحيح — تأكد من الرمز' : 'رمز غير صحيح';
            input.value = '';
            input.focus();
        });
    }

    /* ---------------------------------------------------------------------
       1. أدوات مساعدة
       --------------------------------------------------------------------- */
    const uid = () => Math.random().toString(36).slice(2, 10);
    const todayISO = () => new Date().toISOString().slice(0, 10);
    const iso = (d) => d.toISOString().slice(0, 10);

    function addDays(dateStr, n) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return iso(d);
    }

    function nightsBetween(a, b) {
        return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    const CURRENCIES = { SAR: 'ر.س', USD: '$', AED: 'د.إ' };

    /* ثوابت التشغيل — منقولة من لوحة تحصيل الديون (collection.html) */
    const RATES = {
        nightly: 294,        // سعر الليلة
        cleaning: 500,       // النظافة شهرياً
        power: 130,          // الكهرباء شهرياً
        internet: 70,        // الإنترنت — حصتي شهرياً
        feeBase: 14.38,      // ثابت عمولة المنصات
        feeRate: 0.0692,     // نسبة عمولة المنصات
        feeCap: 50,          // الحد الأقصى للعمولة عن الليلة
    };

    /* عمولة المنصة عن الليلة الواحدة (نفس معادلة لوحة التحصيل) */
    function platformFee(nightPrice) {
        if (nightPrice <= 0) return 0;
        return Math.min(RATES.feeBase + RATES.feeRate * nightPrice, RATES.feeCap);
    }

    /* عمولة حجز كامل */
    function bookingFee(total, nights) {
        if (!nights || total <= 0) return 0;
        return Math.round(platformFee(total / nights) * nights);
    }

    /* بنود المصاريف المعتمدة */
    const EXPENSE_CATEGORIES = ['تنظيف', 'كهرباء', 'إنترنت', 'عمولة منصات'];

    function money(n) {
        const cur = CURRENCIES[state.settings.currency] || 'ر.س';
        const v = Math.round(Number(n) || 0).toLocaleString(state.settings.lang === 'ar' ? 'ar-EG' : 'en-US');
        return `${v} ${cur}`;
    }

    function fmtDate(dstr) {
        if (!dstr) return '—';
        const d = new Date(dstr + 'T00:00:00');
        const locale = state.settings.lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function hijri(dstr) {
        try {
            return new Date(dstr + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-islamic', {
                day: 'numeric', month: 'long',
            });
        } catch (e) { return ''; }
    }

    function relTime(tsIso) {
        const diff = (Date.now() - new Date(tsIso)) / 1000;
        if (diff < 60) return 'الآن';
        if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
        if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
        if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} ي`;
        return fmtDate(tsIso.slice(0, 10));
    }

    function toast(msg, isErr) {
        const el = document.createElement('div');
        el.className = 'toast' + (isErr ? ' err' : '');
        el.textContent = msg;
        $('#toast-zone').appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity .3s';
            setTimeout(() => el.remove(), 300);
        }, 3200);
    }

    function download(filename, content, type) {
        const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ---------------------------------------------------------------------
       2. البيانات الأولية
       --------------------------------------------------------------------- */
    function seed() {
        const t = new Date();
        const M = (offset) => {
            const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset);
            return iso(d);
        };

        const properties = [
            {
                id: 'p1', name: 'شقة السليمانية — RHSA7905', city: 'الرياض', district: 'حي السليمانية',
                address: '7905 عبدالحميد الكاتب، السليمانية، الرياض 12245',
                rooms: 1, beds: 1, baths: 1, area: 68, floor: 'الأرضي',
                nightly: 294, status: 'active', img: 'assets/images/living.jpg',
                platforms: ['جاذر إن', 'Airbnb'], license: '50034291',
            },
        ];

        const bookings = [
            { id: uid(), propertyId: 'p1', guest: 'عبدالله الحربي', phone: '0551234567', source: 'gathern', checkin: M(-12), checkout: M(-9), total: 882, status: 'completed', note: '' },
            { id: uid(), propertyId: 'p1', guest: 'سارة القحطاني', phone: '0509876543', source: 'airbnb', checkin: M(-5), checkout: M(-2), total: 950, status: 'completed', note: '' },
            { id: uid(), propertyId: 'p1', guest: 'فهد العتيبي', phone: '0533221144', source: 'direct', checkin: M(1), checkout: M(4), total: 882, status: 'confirmed', note: 'وصول متأخر بعد 11 مساءً' },
            { id: uid(), propertyId: 'p1', guest: 'نورة الشمري', phone: '0567788990', source: 'gathern', checkin: M(8), checkout: M(12), total: 1176, status: 'confirmed', note: '' },
            { id: uid(), propertyId: 'p1', guest: 'صيانة التكييف', phone: '', source: 'block', checkin: M(15), checkout: M(16), total: 0, status: 'blocked', note: 'صيانة دورية' },
        ];

        // المصاريف التشغيلية بالأسعار الفعلية من لوحة تحصيل الديون
        const expenses = [];
        const addExp = (cat, amount, dayOffset, status, note, dueOffset) => expenses.push({
            id: uid(), propertyId: 'p1', category: cat, amount,
            date: M(dayOffset), dueDate: M(dueOffset === undefined ? dayOffset : dueOffset),
            status, note: note || '',
        });

        // المصاريف الشهرية الثابتة — الشهر الحالي والشهران السابقان
        [0, 1, 2].forEach((back) => {
            const d = -back * 30;
            const paid = back > 0 ? 'paid' : 'due';
            addExp('تنظيف', RATES.cleaning, d - 5, 'paid', 'زيارات تنظيف بعد كل مغادرة');
            addExp('كهرباء', RATES.power, d - 8, paid, 'فاتورة الكهرباء الشهرية', back === 0 ? 3 : d - 8);
            addExp('إنترنت', RATES.internet, d - 10, paid, 'حصتي من اشتراك الإنترنت', back === 0 ? 6 : d - 10);
        });

        // عمولة المنصات — تُحسب من الحجوزات المنتهية بنفس معادلة لوحة التحصيل
        bookings.filter((b) => b.status === 'completed' && b.source !== 'direct').forEach((b) => {
            const n = nightsBetween(b.checkin, b.checkout);
            const fee = bookingFee(b.total, n);
            if (fee > 0) {
                addExp('عمولة منصات', fee, 0, 'paid',
                    `${b.guest} — ${n} ليالٍ عبر ${b.source === 'airbnb' ? 'Airbnb' : 'جاذر إن'}`);
            }
        });

        const contacts = [
            { id: uid(), name: 'فهد العتيبي', phone: '0533221144', email: '', source: 'direct', createdAt: M(-3), note: 'حجز من الموقع مباشرة' },
            { id: uid(), name: 'نورة الشمري', phone: '0567788990', email: '', source: 'gathern', createdAt: M(-6), note: '' },
            { id: uid(), name: 'عبدالله الحربي', phone: '0551234567', email: '', source: 'gathern', createdAt: M(-14), note: 'ضيف متكرر' },
            { id: uid(), name: 'سارة القحطاني', phone: '0509876543', email: '', source: 'airbnb', createdAt: M(-8), note: '' },
        ];

        const now = Date.now();
        const H = (h) => new Date(now - h * 3600000).toISOString();

        const notifications = [
            { id: uid(), type: 'booking', title: 'حجز جديد مؤكد', body: 'فهد العتيبي — 3 ليالٍ عبر الموقع المباشر', at: H(2), read: false },
            { id: uid(), type: 'bill', title: 'فاتورة الكهرباء تستحق قريباً', body: `مبلغ 420 ر.س — الاستحقاق ${M(3)}`, at: H(5), read: false },
            { id: uid(), type: 'message', title: 'رسالة جديدة من فهد العتيبي', body: 'وكم مبلغ التأمين المسترجع؟', at: H(2), read: false },
            { id: uid(), type: 'bill', title: 'اشتراك الإنترنت', body: 'تجديد اشتراك STC بمبلغ 299 ر.س', at: H(20), read: true },
            { id: uid(), type: 'booking', title: 'مزامنة التقويم', body: 'تم استيراد حجز من جاذر إن بنجاح', at: H(30), read: true },
        ];

        return {
            settings: {
                lang: 'ar', theme: 'light', currency: 'SAR', hijri: false,
                notifBooking: true, notifBills: true, notifMessages: true, notifCheckout: false,
            },
            syncFeeds: [
                { id: uid(), name: 'جاذر إن (Gathern)', url: '', lastSync: '' },
                { id: uid(), name: 'Airbnb', url: '', lastSync: '' },
            ],
            properties, bookings, expenses, contacts, notifications,
        };
    }

    /* ---------------------------------------------------------------------
       3. الحالة والتخزين
       --------------------------------------------------------------------- */
    let state = load();
    let calCursor = new Date();
    let notifFilter = 'all';
    let chartMonths = 6;

    function load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.settings) return parsed;
            }
        } catch (e) { /* بيانات تالفة — نبدأ من جديد */ }
        return seed();
    }

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (e) {
            toast('تعذّر حفظ البيانات محلياً', true);
        }
    }

    /* ---------------------------------------------------------------------
       4. الحسابات المالية والتشغيلية
       --------------------------------------------------------------------- */
    function realBookings() {
        return state.bookings.filter((b) => b.status !== 'blocked' && b.status !== 'cancelled');
    }

    function inMonth(dstr, y, m) {
        const d = new Date(dstr + 'T00:00:00');
        return d.getFullYear() === y && d.getMonth() === m;
    }

    function monthRevenue(y, m) {
        return realBookings()
            .filter((b) => inMonth(b.checkin, y, m))
            .reduce((s, b) => s + (Number(b.total) || 0), 0);
    }

    function monthExpenses(y, m) {
        return state.expenses
            .filter((e) => inMonth(e.date, y, m))
            .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    }

    function occupancyRate(days) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        let booked = 0;
        realBookings().forEach((b) => {
            for (let d = new Date(b.checkin + 'T00:00:00'); d < new Date(b.checkout + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
                if (d >= start && d <= end) booked++;
            }
        });
        return Math.min(100, Math.round((booked / days) * 100));
    }

    function stats() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const rev = monthRevenue(y, m);
        const exp = monthExpenses(y, m);
        const prevM = m === 0 ? 11 : m - 1;
        const prevY = m === 0 ? y - 1 : y;
        const prevRev = monthRevenue(prevY, prevM);

        const nights = realBookings()
            .filter((b) => inMonth(b.checkin, y, m))
            .reduce((s, b) => s + nightsBetween(b.checkin, b.checkout), 0);

        return {
            revenue: rev,
            expenses: exp,
            net: rev - exp,
            growth: prevRev ? Math.round(((rev - prevRev) / prevRev) * 100) : 0,
            occupancy: occupancyRate(30),
            nights,
            adr: nights ? Math.round(rev / nights) : 0,
            dueBills: state.expenses.filter((e) => e.status === 'due').reduce((s, e) => s + Number(e.amount || 0), 0),
            dueCount: state.expenses.filter((e) => e.status === 'due').length,
            upcoming: realBookings().filter((b) => b.checkin >= todayISO()).length,
        };
    }

    /* ---------------------------------------------------------------------
       5. التنقل بين الأقسام
       --------------------------------------------------------------------- */
    const PAGE_META = {
        dashboard: ['لوحة التحكم', 'نظرة شاملة على التشغيل والإيرادات والمصاريف'],
        calendar: ['التقويم', 'الحجوزات والمزامنة مع منصات الحجز'],
        messages: ['الرسائل', 'محادثات الزبائن من الموقع والمنصات'],
        properties: ['العقارات', 'الوحدات المُدارة وتفاصيلها'],
        contacts: ['جهات الاتصال', 'الزبائن من الموقع والإضافات اليدوية'],
        notifications: ['الإشعارات', 'الحجوزات والفواتير والتنبيهات'],
        settings: ['الإعدادات', 'اللغة والمظهر والتكاملات'],
    };

    function go(view) {
        $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
        $$('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
        const meta = PAGE_META[view] || ['', ''];
        $('#page-title').textContent = meta[0];
        $('#page-sub').textContent = meta[1];
        window.scrollTo({ top: 0, behavior: 'smooth' });
        location.hash = view;
        renderView(view);
    }

    function renderView(view) {
        ({
            dashboard: renderDashboard,
            calendar: renderCalendar,
            messages: renderMessages,
            properties: renderProperties,
            contacts: renderContacts,
            notifications: renderNotifications,
            settings: renderSettings,
        }[view] || (() => {}))();
    }

    /* ---------------------------------------------------------------------
       6. لوحة التحكم
       --------------------------------------------------------------------- */
    function renderDashboard() {
        const s = stats();

        const kpis = [
            { label: 'إيرادات الشهر', value: money(s.revenue), icon: '💰', color: 'var(--ok)', soft: 'var(--ok-soft)',
              foot: `<span class="kpi-trend ${s.growth >= 0 ? 'up' : 'down'}">${s.growth >= 0 ? '▲' : '▼'} ${Math.abs(s.growth)}%</span> مقارنة بالشهر الماضي` },
            { label: 'المصاريف التشغيلية', value: money(s.expenses), icon: '🧾', color: 'var(--brand)', soft: 'var(--brand-soft)',
              foot: `${s.dueCount} فاتورة غير مسددة بقيمة ${money(s.dueBills)}` },
            { label: 'صافي الربح', value: money(s.net), icon: '📈', color: 'var(--info)', soft: 'var(--info-soft)',
              foot: `هامش ${s.revenue ? Math.round((s.net / s.revenue) * 100) : 0}% من الإيراد` },
            { label: 'نسبة الإشغال', value: s.occupancy + '<small>%</small>', icon: '🏠', color: 'var(--warn)', soft: 'var(--warn-soft)',
              foot: `${s.nights} ليلة مؤجَّرة • ${s.upcoming} حجز قادم` },
        ];

        $('#kpi-zone').innerHTML = kpis.map((k) => `
            <div class="kpi" style="--kpi-color:${k.color};--kpi-soft:${k.soft}">
                <div class="kpi-top">
                    <div class="kpi-icon">${k.icon}</div>
                    <div class="kpi-label">${k.label}</div>
                </div>
                <div class="kpi-value">${k.value}</div>
                <div class="kpi-foot">${k.foot}</div>
            </div>`).join('');

        drawChart();
        renderExpenseBreakdown();
        renderUpcoming();
        renderBills();
        renderOps(s);
    }

    function drawChart() {
        const svg = $('#chart-cashflow');
        const W = 700, H = 230, pad = { t: 16, r: 12, b: 30, l: 52 };
        const now = new Date();
        const data = [];

        for (let i = chartMonths - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            data.push({
                label: d.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'short' }),
                rev: monthRevenue(d.getFullYear(), d.getMonth()),
                exp: monthExpenses(d.getFullYear(), d.getMonth()),
            });
        }

        const max = Math.max(1000, ...data.map((d) => Math.max(d.rev, d.exp))) * 1.15;
        const innerW = W - pad.l - pad.r;
        const innerH = H - pad.t - pad.b;
        const slot = innerW / data.length;
        const bw = Math.min(20, slot / 3.2);
        const yOf = (v) => pad.t + innerH - (v / max) * innerH;

        let out = '';

        // خطوط الشبكة
        for (let i = 0; i <= 4; i++) {
            const y = pad.t + (innerH / 4) * i;
            const val = Math.round((max / 4) * (4 - i));
            out += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
            out += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)" font-weight="600">${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}</text>`;
        }

        // الأعمدة
        data.forEach((d, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const hRev = Math.max(2, innerH - (yOf(d.rev) - pad.t));
            const hExp = Math.max(2, innerH - (yOf(d.exp) - pad.t));
            out += `<rect x="${cx - bw - 2}" y="${yOf(d.rev)}" width="${bw}" height="${hRev}" rx="4" fill="var(--ok)"><title>الإيراد: ${d.rev}</title></rect>`;
            out += `<rect x="${cx + 2}" y="${yOf(d.exp)}" width="${bw}" height="${hExp}" rx="4" fill="var(--brand)"><title>المصاريف: ${d.exp}</title></rect>`;
            out += `<text x="${cx}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-weight="700">${escapeHtml(d.label)}</text>`;
        });

        // خط صافي الربح
        const pts = data.map((d, i) => `${pad.l + slot * i + slot / 2},${yOf(Math.max(0, d.rev - d.exp))}`).join(' ');
        out += `<polyline points="${pts}" fill="none" stroke="var(--info)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        data.forEach((d, i) => {
            out += `<circle cx="${pad.l + slot * i + slot / 2}" cy="${yOf(Math.max(0, d.rev - d.exp))}" r="3.5" fill="var(--surface)" stroke="var(--info)" stroke-width="2"/>`;
        });

        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.innerHTML = out;
    }

    function renderExpenseBreakdown() {
        const now = new Date();
        const byCat = {};
        state.expenses.forEach((e) => {
            byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
        });

        const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, e) => s + e[1], 0);
        const colors = ['var(--brand)', 'var(--info)', 'var(--warn)', 'var(--ok)', 'var(--danger)', 'var(--muted)'];

        $('#exp-total-lbl').textContent = 'الإجمالي ' + money(total);

        if (!entries.length) {
            $('#exp-breakdown').innerHTML = emptyBox('🧾', 'لا توجد مصاريف', 'أضف أول مصروف تشغيلي لتتبع التكاليف');
            return;
        }

        $('#exp-breakdown').innerHTML = entries.map(([cat, amt], i) => `
            <div class="bar-row">
                <div class="bar-top">
                    <span>${escapeHtml(cat)}</span>
                    <span class="amt">${money(amt)}</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${total ? (amt / total) * 100 : 0}%;background:${colors[i % colors.length]}"></div>
                </div>
            </div>`).join('');
    }

    const SOURCE_LABEL = { direct: 'الموقع المباشر', gathern: 'جاذر إن', airbnb: 'Airbnb', ical: 'مزامنة iCal', block: 'حجب', manual: 'إضافة يدوية', site_chat: 'محادثة الموقع' };
    const STATUS_TAG = {
        confirmed: ['tag-ok', 'مؤكد'],
        pending: ['tag-warn', 'بانتظار التأكيد'],
        completed: ['tag-mute', 'منتهٍ'],
        blocked: ['tag-info', 'محجوب'],
        cancelled: ['tag-danger', 'ملغي'],
    };

    function renderUpcoming() {
        const rows = realBookings()
            .filter((b) => b.checkout >= todayISO())
            .sort((a, b) => a.checkin.localeCompare(b.checkin))
            .slice(0, 6);

        if (!rows.length) {
            $('#tbl-upcoming').innerHTML = `<tr><td colspan="6">${emptyBox('📅', 'لا حجوزات قادمة', 'ستظهر هنا فور وصول حجز جديد')}</td></tr>`;
            return;
        }

        $('#tbl-upcoming').innerHTML = rows.map((b) => {
            const tag = STATUS_TAG[b.status] || ['tag-mute', b.status];
            return `<tr>
                <td>${escapeHtml(b.guest)}</td>
                <td class="num dim">${fmtDate(b.checkin)}</td>
                <td class="num">${nightsBetween(b.checkin, b.checkout)}</td>
                <td class="dim">${SOURCE_LABEL[b.source] || b.source}</td>
                <td class="num">${money(b.total)}</td>
                <td><span class="tag ${tag[0]}">${tag[1]}</span></td>
            </tr>`;
        }).join('');
    }

    function renderBills() {
        const rows = state.expenses.slice().sort((a, b) => {
            if (a.status !== b.status) return a.status === 'due' ? -1 : 1;
            return (a.dueDate || '').localeCompare(b.dueDate || '');
        }).slice(0, 7);

        if (!rows.length) {
            $('#tbl-bills').innerHTML = `<tr><td colspan="5">${emptyBox('🧾', 'لا فواتير', 'أضف مصروفاً لتتبعه')}</td></tr>`;
            return;
        }

        const today = todayISO();
        $('#tbl-bills').innerHTML = rows.map((e) => {
            const overdue = e.status === 'due' && e.dueDate && e.dueDate < today;
            const tag = e.status === 'paid'
                ? '<span class="tag tag-ok">مسدد</span>'
                : (overdue ? '<span class="tag tag-danger">متأخر</span>' : '<span class="tag tag-warn">مستحق</span>');
            return `<tr>
                <td>${escapeHtml(e.category)}${e.note ? `<br><span style="font-size:11px;color:var(--muted);font-weight:500">${escapeHtml(e.note)}</span>` : ''}</td>
                <td class="num dim">${fmtDate(e.dueDate || e.date)}</td>
                <td class="num">${money(e.amount)}</td>
                <td>${tag}</td>
                <td>${e.status === 'due' ? `<button class="btn btn-ghost btn-sm" data-pay="${e.id}">تسديد</button>` : ''}</td>
            </tr>`;
        }).join('');

        $$('[data-pay]', $('#tbl-bills')).forEach((btn) => {
            btn.addEventListener('click', () => {
                const e = state.expenses.find((x) => x.id === btn.dataset.pay);
                if (!e) return;
                e.status = 'paid';
                pushNotification('bill', 'تم تسديد فاتورة', `${e.category} — ${money(e.amount)}`);
                save();
                renderDashboard();
                toast('تم تعليم الفاتورة كمسددة');
            });
        });
    }

    function renderOps(s) {
        const cleaningDue = realBookings().filter((b) => b.checkout >= todayISO()).length;
        const items = [
            { icon: '🛏️', label: 'متوسط سعر الليلة', value: money(s.adr), note: 'محسوب من حجوزات الشهر' },
            { icon: '🧹', label: 'النظافة', value: money(RATES.cleaning), note: `شهرياً • ${cleaningDue} زيارة قادمة` },
            { icon: '⚡', label: 'الكهرباء', value: money(RATES.power), note: 'ثابت شهرياً' },
            { icon: '📶', label: 'الإنترنت', value: money(RATES.internet), note: 'حصتي من الاشتراك شهرياً' },
            { icon: '🧾', label: 'عمولة المنصات', value: money(state.expenses.filter((e) => e.category === 'عمولة منصات').reduce((a, e) => a + Number(e.amount || 0), 0)), note: `${RATES.feeBase} + ${(RATES.feeRate * 100).toFixed(2)}% لكل ليلة (بحد ${RATES.feeCap})` },
            { icon: '🔑', label: 'الوحدات النشطة', value: state.properties.filter((p) => p.status === 'active').length, note: 'من أصل ' + state.properties.length },
            { icon: '👥', label: 'إجمالي الزبائن', value: state.contacts.length, note: 'من الموقع والمنصات' },
        ];

        $('#ops-zone').innerHTML = items.map((i) => `
            <div class="list-item">
                <div class="li-icon">${i.icon}</div>
                <div class="li-body">
                    <h4>${i.label}</h4>
                    <p>${i.note}</p>
                </div>
                <div class="li-side"><b style="font-size:15px">${i.value}</b></div>
            </div>`).join('');
    }

    function emptyBox(ic, title, text) {
        return `<div class="empty"><div class="ic">${ic}</div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div>`;
    }

    /* ---------------------------------------------------------------------
       7. التقويم
       --------------------------------------------------------------------- */
    const DOWS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

    function bookingOn(dayIso) {
        return state.bookings.find((b) => dayIso >= b.checkin && dayIso < b.checkout && b.status !== 'cancelled');
    }

    function renderCalendar() {
        $('#cal-dows').innerHTML = DOWS.map((d) => `<div class="cal-dow">${d}</div>`).join('');

        const y = calCursor.getFullYear();
        const m = calCursor.getMonth();
        const first = new Date(y, m, 1);
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const lead = first.getDay();
        const today = todayISO();

        $('#cal-month').textContent = first.toLocaleDateString('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric' });

        let html = '';
        for (let i = 0; i < lead; i++) html += '<div class="cal-day empty"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const dayIso = iso(new Date(y, m, d));
            const b = bookingOn(dayIso);
            const cls = ['cal-day'];
            if (dayIso < today) cls.push('past');
            if (dayIso === today) cls.push('today');
            if (b) cls.push(b.status === 'blocked' ? 'blocked' : 'booked');

            let pill = '';
            if (b) {
                const pcls = b.status === 'blocked' ? 'block' : (b.source === 'direct' ? '' : 'ext');
                pill = `<span class="cal-pill ${pcls}">${escapeHtml(b.guest)}</span>`;
            }

            const hj = state.settings.hijri ? `<span style="font-size:9px;color:var(--muted)">${hijri(dayIso)}</span>` : '';
            html += `<button class="${cls.join(' ')}" data-day="${dayIso}">
                        <span class="d-num">${d}</span>${hj}${pill}
                     </button>`;
        }

        $('#cal-grid').innerHTML = html;
        $$('[data-day]', $('#cal-grid')).forEach((el) => {
            el.addEventListener('click', () => onDayClick(el.dataset.day));
        });

        renderMonthList(y, m);
        renderSyncList();
    }

    function onDayClick(dayIso) {
        const b = bookingOn(dayIso);
        if (b) return openBookingDetails(b);
        openBookingForm({ checkin: dayIso, checkout: addDays(dayIso, 1) });
    }

    function renderMonthList(y, m) {
        const list = state.bookings
            .filter((b) => inMonth(b.checkin, y, m) || inMonth(b.checkout, y, m))
            .sort((a, b) => a.checkin.localeCompare(b.checkin));

        $('#cal-month-count').textContent = list.length + ' حجز';

        if (!list.length) {
            $('#cal-month-list').innerHTML = emptyBox('📆', 'لا حجوزات هذا الشهر', 'اضغط على أي يوم لإضافة حجز');
            return;
        }

        $('#cal-month-list').innerHTML = list.map((b) => {
            const tag = STATUS_TAG[b.status] || ['tag-mute', b.status];
            return `<div class="list-item">
                <div class="li-icon">${b.status === 'blocked' ? '🚧' : '🛏️'}</div>
                <div class="li-body">
                    <h4>${escapeHtml(b.guest)}</h4>
                    <p>${fmtDate(b.checkin)} ← ${fmtDate(b.checkout)} • ${nightsBetween(b.checkin, b.checkout)} ليالٍ • ${SOURCE_LABEL[b.source] || b.source}</p>
                </div>
                <div class="li-side">
                    <b>${b.total ? money(b.total) : '—'}</b>
                    <span class="tag ${tag[0]}">${tag[1]}</span>
                </div>
            </div>`;
        }).join('');
    }

    function renderSyncList() {
        const zone = $('#sync-list');
        const exportUrl = location.origin + location.pathname.replace('admin.html', '') + 'calendar.ics';

        zone.innerHTML = `
            <div class="field" style="margin-bottom:14px">
                <label>رابط التصدير (ألصقه في منصات الحجز)</label>
                <div style="display:flex;gap:8px">
                    <input class="input" id="ics-out" readonly value="${escapeHtml(exportUrl)}">
                    <button class="btn btn-ghost btn-sm" id="btn-copy-ics">نسخ</button>
                </div>
            </div>` + state.syncFeeds.map((f) => `
            <div class="list-item">
                <div class="li-icon">🔗</div>
                <div class="li-body">
                    <h4>${escapeHtml(f.name)}</h4>
                    <p>${f.url ? escapeHtml(f.url.slice(0, 46)) + '…' : 'لم يُربط بعد'}${f.lastSync ? ' • آخر مزامنة ' + relTime(f.lastSync) : ''}</p>
                </div>
                <div class="li-side">
                    <button class="btn btn-ghost btn-sm" data-feed="${f.id}">${f.url ? 'تعديل' : 'ربط'}</button>
                </div>
            </div>`).join('');

        $('#btn-copy-ics').addEventListener('click', () => {
            const input = $('#ics-out');
            input.select();
            navigator.clipboard?.writeText(input.value).then(
                () => toast('تم نسخ الرابط'),
                () => toast('انسخ الرابط يدوياً', true),
            );
        });

        $$('[data-feed]', zone).forEach((btn) => {
            btn.addEventListener('click', () => openFeedForm(state.syncFeeds.find((f) => f.id === btn.dataset.feed)));
        });
    }

    /* ---- تصدير واستيراد iCal ---- */
    function icsStamp(dstr) { return dstr.replace(/-/g, ''); }

    function buildICS() {
        const lines = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RHSA7905//Property Manager//AR',
            'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:حجوزات الشقة',
        ];

        state.bookings.filter((b) => b.status !== 'cancelled').forEach((b) => {
            lines.push('BEGIN:VEVENT');
            lines.push('UID:' + b.id + '@rhsa7905');
            lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z');
            lines.push('DTSTART;VALUE=DATE:' + icsStamp(b.checkin));
            lines.push('DTEND;VALUE=DATE:' + icsStamp(b.checkout));
            lines.push('SUMMARY:' + (b.status === 'blocked' ? 'غير متاح' : 'محجوز — ' + b.guest));
            lines.push('DESCRIPTION:' + [SOURCE_LABEL[b.source] || b.source, b.phone, b.note].filter(Boolean).join(' | '));
            lines.push('STATUS:CONFIRMED');
            lines.push('TRANSP:OPAQUE');
            lines.push('END:VEVENT');
        });

        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    function parseICS(text) {
        const out = [];
        // فك طي الأسطر الطويلة حسب معيار iCalendar
        const unfolded = text.replace(/\r?\n[ \t]/g, '');
        const blocks = unfolded.split('BEGIN:VEVENT').slice(1);

        blocks.forEach((blk) => {
            const get = (key) => {
                const m = blk.match(new RegExp('^' + key + '[^:\\r\\n]*:(.*)$', 'm'));
                return m ? m[1].trim() : '';
            };
            const toIso = (v) => {
                const d = v.replace(/[^0-9]/g, '').slice(0, 8);
                return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '';
            };

            const start = toIso(get('DTSTART'));
            const end = toIso(get('DTEND'));
            if (!start || !end) return;

            out.push({
                checkin: start,
                checkout: end,
                guest: (get('SUMMARY') || 'حجز مستورد').replace(/^محجوز\s*—\s*/, ''),
                uid: get('UID'),
            });
        });

        return out;
    }

    function importICSText(text, feedName) {
        const events = parseICS(text);
        if (!events.length) {
            toast('لم يُعثر على حجوزات في الملف', true);
            return 0;
        }

        let added = 0;
        events.forEach((ev) => {
            const dup = state.bookings.some((b) => b.checkin === ev.checkin && b.checkout === ev.checkout);
            if (dup) return;
            state.bookings.push({
                id: uid(), propertyId: state.properties[0]?.id || 'p1',
                guest: ev.guest, phone: '', source: 'ical',
                checkin: ev.checkin, checkout: ev.checkout,
                total: 0, status: 'confirmed', note: 'مستورد من ' + (feedName || 'ملف iCal'),
            });
            added++;
        });

        if (added) {
            pushNotification('booking', 'مزامنة التقويم', `تم استيراد ${added} حجز من ${feedName || 'ملف iCal'}`);
            save();
            renderCalendar();
        }

        toast(added ? `تمت إضافة ${added} حجز` : 'كل الحجوزات موجودة مسبقاً');
        return added;
    }

    /* ---------------------------------------------------------------------
       8. الرسائل — متصلة بقاعدة بيانات Supabase (جدولا conversations وmessages)
       --------------------------------------------------------------------- */
    const CHANNEL_META = {
        site: ['🌐', 'نموذج الموقع', 'tag-brand'],
        whatsapp: ['💬', 'واتساب', 'tag-ok'],
        airbnb: ['🏡', 'Airbnb', 'tag-danger'],
        gathern: ['🏷️', 'جاذر إن', 'tag-info'],
    };

    // حالة الرسائل الحية — لا تُحفظ في localStorage، تُسحب من الخادم مباشرة
    const msg = { conversations: [], byId: {}, activeId: null, channel: null, loaded: false };

    function sbc() {
        return window.getSupabaseClient ? window.getSupabaseClient() : null;
    }

    async function loadConversations() {
        const client = sbc();
        if (!client) return;

        const { data, error } = await client
            .from('conversations')
            .select('*')
            .order('last_at', { ascending: false });

        if (error) { console.error('[messages] فشل تحميل المحادثات:', error); return; }

        msg.conversations = data || [];
        msg.loaded = true;
        syncContactsFromConversations();
        renderMessages();
    }

    /* حفظ معلومات تسجيل دخول الزائر للمحادثة كجهة اتصال — تلقائياً وبلا تكرار */
    function syncContactsFromConversations() {
        let added = 0;

        msg.conversations.forEach((c) => {
            if (!c.visitor_phone || !c.visitor_name) return;
            const exists = state.contacts.some((x) => x.phone === c.visitor_phone);
            if (exists) return;

            state.contacts.push({
                id: uid(),
                name: c.visitor_name,
                phone: c.visitor_phone,
                email: '',
                source: 'site_chat',
                createdAt: c.created_at ? c.created_at.slice(0, 10) : todayISO(),
                note: 'سجّل بيانات الدخول عبر المحادثة المباشرة في الموقع',
            });
            added++;
        });

        if (added) {
            save();
            const contactsView = document.getElementById('view-contacts');
            if (contactsView && contactsView.classList.contains('active')) renderContacts();
        }
    }

    async function loadThreadMessages(id) {
        const client = sbc();
        if (!client) return [];

        const { data, error } = await client
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (error) { console.error('[messages] فشل تحميل الرسائل:', error); return []; }
        return data || [];
    }

    async function sendOwnerReply(id, text) {
        const client = sbc();
        if (!client) return false;

        const { error } = await client
            .from('messages')
            .insert({ conversation_id: id, sender: 'owner', body: text });

        if (error) { console.error('[messages] فشل إرسال الرد:', error); return false; }
        return true;
    }

    async function markConversationRead(id) {
        const client = sbc();
        if (!client) return;
        await client.from('conversations').update({ unread_owner: 0 }).eq('id', id);
        const c = msg.conversations.find((x) => x.id === id);
        if (c) c.unread_owner = 0;
    }

    function renderMessages() {
        const list = $('#chat-list');
        if (!msg.loaded) {
            list.innerHTML = emptyBox('⏳', 'جارٍ التحميل…', 'يتم الاتصال بقاعدة البيانات');
            loadConversations();
            return;
        }

        const totalUnread = msg.conversations.reduce((s, c) => s + (c.unread_owner || 0), 0);

        if (!msg.conversations.length) {
            list.innerHTML = emptyBox('💬', 'لا رسائل', 'ستصلك رسائل الزبائن من الموقع هنا فور وصولها');
            $('#chat-panel').innerHTML = `<div class="chat-empty">اختر محادثة لعرضها</div>`;
        } else {
            list.innerHTML = msg.conversations.map((c) => {
                const ch = CHANNEL_META[c.channel] || CHANNEL_META.site;
                return `<button class="chat-item ${msg.activeId === c.id ? 'active' : ''}" data-thread="${c.id}">
                    <span class="av">${escapeHtml(c.visitor_name.charAt(0))}</span>
                    <span class="meta">
                        <span class="nm">${escapeHtml(c.visitor_name)} <span style="font-size:11px">${ch[0]}</span></span>
                        <span class="pv">${escapeHtml(c.last_message || 'لا رسائل بعد')}</span>
                    </span>
                    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
                        <span class="tm">${c.last_at ? relTime(c.last_at) : ''}</span>
                        ${c.unread_owner ? '<span class="unread-dot"></span>' : ''}
                    </span>
                </button>`;
            }).join('');

            $$('[data-thread]', list).forEach((el) => {
                el.addEventListener('click', () => openThread(el.dataset.thread));
            });

            if (!msg.activeId) openThread(msg.conversations[0].id, true);
            else openThread(msg.activeId, true);
        }

        const badge = $('#badge-msg');
        badge.hidden = !totalUnread;
        badge.textContent = totalUnread;
        updateBadges();
        renderChannels();
    }

    async function openThread(id, keepList) {
        const c = msg.conversations.find((x) => x.id === id);
        if (!c) return;

        msg.activeId = id;
        $$('.chat-item').forEach((el) => el.classList.toggle('active', el.dataset.thread === id));

        if (c.unread_owner) markConversationRead(id).then(renderMessages);

        const ch = CHANNEL_META[c.channel] || CHANNEL_META.site;
        $('#chat-panel').innerHTML = `
            <div class="chat-top">
                <span class="av" style="width:36px;height:36px;border-radius:50%;background:var(--surface-3);display:grid;place-items:center;font-weight:800">${escapeHtml(c.visitor_name.charAt(0))}</span>
                <div style="margin-inline-end:auto">
                    <div style="font-size:14px;font-weight:800">${escapeHtml(c.visitor_name)}</div>
                    <div style="font-size:11.5px;color:var(--muted);font-weight:600" dir="ltr">${escapeHtml(c.visitor_phone || '')}</div>
                </div>
                <span class="tag ${ch[2]}">${ch[0]} ${ch[1]}</span>
                <a class="btn btn-ghost btn-sm" href="https://wa.me/${(c.visitor_phone || '').replace(/^0/, '966')}" target="_blank" rel="noopener">واتساب</a>
                <button class="btn btn-ghost btn-sm" id="btn-thread-book">+ حجز</button>
            </div>
            <div class="chat-body" id="chat-body">
                <div class="empty" style="padding:20px"><div class="ic">⏳</div></div>
            </div>
            <div class="chat-compose">
                <input class="input" id="msg-input" placeholder="اكتب رداً…">
                <button class="btn btn-primary" id="msg-send">إرسال</button>
            </div>`;

        $('#btn-thread-book').addEventListener('click', () => {
            openBookingForm({ guest: c.visitor_name, phone: c.visitor_phone, source: 'direct' });
        });

        const renderBubbles = (rows) => {
            const body = $('#chat-body');
            if (!body) return;
            body.innerHTML = rows.length
                ? rows.map((m) => `
                    <div class="msg ${m.sender === 'owner' ? 'me' : 'them'}">
                        ${escapeHtml(m.body)}
                        <span class="t">${relTime(m.created_at)}</span>
                    </div>`).join('')
                : emptyBox('💬', 'لا رسائل بعد', '');
            body.scrollTop = body.scrollHeight;
        };

        const rows = await loadThreadMessages(id);
        if (msg.activeId !== id) return;   // بدّل المحادثة أثناء التحميل
        msg.byId[id] = rows;
        renderBubbles(rows);

        const send = async () => {
            const input = $('#msg-input');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';

            const ok = await sendOwnerReply(id, text);
            if (ok) {
                const fresh = await loadThreadMessages(id);
                msg.byId[id] = fresh;
                if (msg.activeId === id) renderBubbles(fresh);
                const conv = msg.conversations.find((x) => x.id === id);
                if (conv) { conv.last_message = text; conv.last_at = new Date().toISOString(); }
            } else {
                toast('تعذّر إرسال الرد', true);
            }
        };

        $('#msg-send').addEventListener('click', send);
        $('#msg-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    }

    /* بث لحظي: أي رسالة أو محادثة جديدة تحدّث الواجهة فوراً بلا تحديث يدوي */
    function startMessagesRealtime() {
        const client = sbc();
        if (!client || msg.channel) return;

        msg.channel = client
            .channel('admin-messages')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
                loadConversations();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const row = payload.new;
                if (row && row.conversation_id === msg.activeId) {
                    loadThreadMessages(msg.activeId).then((rows) => {
                        msg.byId[msg.activeId] = rows;
                        const body = $('#chat-body');
                        if (!body) return;
                        body.innerHTML = rows.map((m) => `
                            <div class="msg ${m.sender === 'owner' ? 'me' : 'them'}">
                                ${escapeHtml(m.body)}
                                <span class="t">${relTime(m.created_at)}</span>
                            </div>`).join('');
                        body.scrollTop = body.scrollHeight;
                    });
                }
                loadConversations();
                if (row && row.sender === 'visitor') {
                    pushNotification('message', 'رسالة جديدة', row.body.slice(0, 80));
                    updateBadges();
                }
            })
            .subscribe();
    }

    function stopMessagesRealtime() {
        const client = sbc();
        if (client && msg.channel) client.removeChannel(msg.channel);
        msg.channel = null;
    }

    function renderChannels() {
        const counts = {};
        msg.conversations.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });

        const rows = [
            { key: 'site', desc: 'نموذج التواصل في صفحة الشقة — يعمل الآن ومتصل بقاعدة البيانات', tag: '<span class="tag tag-ok">مفعّل</span>' },
            { key: 'whatsapp', desc: 'بوت هجين: رد آلي على الاستفسارات المتكررة مع تحويل المحادثة للمالك', tag: '<span class="tag tag-warn">قيد التجهيز</span>' },
            { key: 'gathern', desc: 'رسائل منصة جاذر إن', tag: '<span class="tag tag-mute">يدوي</span>' },
            { key: 'airbnb', desc: 'رسائل منصة Airbnb', tag: '<span class="tag tag-mute">يدوي</span>' },
        ];

        $('#channels-zone').innerHTML = rows.map((r) => {
            const ch = CHANNEL_META[r.key];
            return `<div class="list-item">
                <div class="li-icon">${ch[0]}</div>
                <div class="li-body">
                    <h4>${ch[1]}</h4>
                    <p>${r.desc}</p>
                </div>
                <div class="li-side">
                    <span style="font-size:12px;color:var(--muted);font-weight:700">${counts[r.key] || 0} محادثة</span>
                    ${r.tag}
                </div>
            </div>`;
        }).join('');
    }

    /* ---------------------------------------------------------------------
       9. العقارات
       --------------------------------------------------------------------- */
    function renderProperties() {
        $('#prop-count').textContent = state.properties.length + ' وحدة';

        if (!state.properties.length) {
            $('#prop-grid').innerHTML = emptyBox('🏠', 'لا وحدات', 'أضف أول وحدة عقارية');
            return;
        }

        $('#prop-grid').innerHTML = state.properties.map((p) => {
            const bookedNow = bookingOn(todayISO());
            const isBusy = bookedNow && bookedNow.propertyId === p.id;
            const revenue = realBookings().filter((b) => b.propertyId === p.id).reduce((s, b) => s + Number(b.total || 0), 0);

            return `<div class="prop-card">
                <div class="prop-media">
                    ${p.img ? `<img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.name)}" loading="lazy">` : ''}
                    <span class="prop-status tag ${isBusy ? 'tag-danger' : 'tag-ok'}">${isBusy ? 'مشغولة الآن' : 'متاحة'}</span>
                </div>
                <div class="prop-body">
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="loc">📍 ${escapeHtml(p.district)} — ${escapeHtml(p.city)}</div>
                    <div class="prop-specs">
                        <span>🛏️ ${p.rooms} غرفة</span>
                        <span>🚿 ${p.baths} حمام</span>
                        <span>📐 ${p.area} م²</span>
                        <span>🏢 ${escapeHtml(p.floor)}</span>
                    </div>
                    <div class="prop-specs">
                        ${(p.platforms || []).map((x) => `<span class="tag tag-mute">${escapeHtml(x)}</span>`).join('')}
                    </div>
                    <div class="prop-foot">
                        <div class="prop-price">${money(p.nightly)} <small>/ ليلة</small></div>
                        <div style="margin-inline-start:auto;text-align:end">
                            <div style="font-size:11px;color:var(--muted);font-weight:600">إجمالي الإيراد</div>
                            <b style="font-size:13px">${money(revenue)}</b>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-ghost btn-sm" data-edit-prop="${p.id}" style="flex:1">تعديل</button>
                        <a class="btn btn-ghost btn-sm" href="index.html" target="_blank" style="flex:1;justify-content:center">معاينة</a>
                    </div>
                </div>
            </div>`;
        }).join('');

        $$('[data-edit-prop]').forEach((btn) => {
            btn.addEventListener('click', () => openPropertyForm(state.properties.find((p) => p.id === btn.dataset.editProp)));
        });
    }

    /* ---------------------------------------------------------------------
       10. جهات الاتصال
       --------------------------------------------------------------------- */
    function renderContacts() {
        const q = ($('#contact-search').value || '').trim();
        const list = state.contacts.filter((c) => !q || c.name.includes(q) || (c.phone || '').includes(q));

        $('#contact-count').textContent = state.contacts.length + ' جهة اتصال';

        if (!list.length) {
            $('#tbl-contacts').innerHTML = `<tr><td colspan="7">${emptyBox('👥', 'لا نتائج', 'لا توجد جهات اتصال مطابقة')}</td></tr>`;
            return;
        }

        $('#tbl-contacts').innerHTML = list.map((c) => {
            const bk = realBookings().filter((b) => b.phone && b.phone === c.phone);
            const spend = bk.reduce((s, b) => s + Number(b.total || 0), 0);
            const last = bk.map((b) => b.checkin).sort().pop();
            const wa = (c.phone || '').replace(/^0/, '966').replace(/\D/g, '');

            return `<tr>
                <td>${escapeHtml(c.name)}${c.note ? `<br><span style="font-size:11px;color:var(--muted);font-weight:500">${escapeHtml(c.note)}</span>` : ''}</td>
                <td class="num dim">${escapeHtml(c.phone || '—')}</td>
                <td><span class="tag tag-mute">${SOURCE_LABEL[c.source] || c.source}</span></td>
                <td class="num">${bk.length}</td>
                <td class="num">${money(spend)}</td>
                <td class="num dim">${last ? fmtDate(last) : '—'}</td>
                <td>
                    <div style="display:flex;gap:6px;justify-content:flex-end">
                        ${wa ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${wa}" target="_blank" rel="noopener">واتساب</a>` : ''}
                        <button class="btn btn-ghost btn-sm" data-book-contact="${c.id}">حجز</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        $$('[data-book-contact]').forEach((btn) => {
            const c = state.contacts.find((x) => x.id === btn.dataset.bookContact);
            btn.addEventListener('click', () => openBookingForm({ guest: c.name, phone: c.phone, source: 'direct' }));
        });
    }

    /* ---------------------------------------------------------------------
       11. الإشعارات
       --------------------------------------------------------------------- */
    const NOTIF_META = {
        booking: ['📅', 'var(--ok-soft)'],
        bill: ['⚡', 'var(--warn-soft)'],
        message: ['💬', 'var(--info-soft)'],
        system: ['⚙️', 'var(--surface-3)'],
    };

    function pushNotification(type, title, body) {
        state.notifications.unshift({ id: uid(), type, title, body, at: new Date().toISOString(), read: false });
        state.notifications = state.notifications.slice(0, 60);
        updateBadges();
    }

    function renderNotifications() {
        const list = state.notifications.filter((n) => notifFilter === 'all' || n.type === notifFilter);

        if (!list.length) {
            $('#notif-list').innerHTML = emptyBox('🔔', 'لا إشعارات', 'ستظهر التنبيهات هنا');
            return;
        }

        $('#notif-list').innerHTML = list.map((n) => {
            const meta = NOTIF_META[n.type] || NOTIF_META.system;
            return `<div class="list-item notif ${n.read ? '' : 'unread'}">
                <div class="li-icon" style="background:${meta[1]}">${meta[0]}</div>
                <div class="li-body">
                    <h4>${escapeHtml(n.title)}</h4>
                    <p>${escapeHtml(n.body)}</p>
                </div>
                <div class="li-side">
                    <span style="font-size:11px;color:var(--muted);font-weight:600">${relTime(n.at)}</span>
                    ${n.read ? '' : `<button class="btn btn-ghost btn-sm" data-read="${n.id}">تعليم كمقروء</button>`}
                </div>
            </div>`;
        }).join('');

        $$('[data-read]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const n = state.notifications.find((x) => x.id === btn.dataset.read);
                if (n) n.read = true;
                save();
                renderNotifications();
                updateBadges();
            });
        });
    }

    function updateBadges() {
        const unreadN = state.notifications.filter((n) => !n.read).length;
        const badge = $('#badge-notif');
        badge.hidden = !unreadN;
        badge.textContent = unreadN;
        $('#bell-dot').hidden = !unreadN;

        const unreadM = msg.conversations.reduce((s, c) => s + (c.unread_owner || 0), 0);
        const bm = $('#badge-msg');
        bm.hidden = !unreadM;
        bm.textContent = unreadM;
    }

    /* ---------------------------------------------------------------------
       12. الإعدادات
       --------------------------------------------------------------------- */
    function renderSettings() {
        $$('#set-lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.settings.lang));
        $('#set-theme').classList.toggle('on', state.settings.theme === 'dark');
        $('#set-hijri').classList.toggle('on', !!state.settings.hijri);
        $('#set-currency').value = state.settings.currency;
        $$('[data-pref]').forEach((t) => t.classList.toggle('on', !!state.settings[t.dataset.pref]));
    }

    function applyTheme() {
        document.documentElement.setAttribute('data-theme', state.settings.theme);
        const dark = state.settings.theme === 'dark';
        $('#icon-theme').innerHTML = dark
            ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
            : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8"/>';
    }

    function applyLang() {
        const ar = state.settings.lang === 'ar';
        document.documentElement.lang = ar ? 'ar' : 'en';
        document.documentElement.dir = ar ? 'rtl' : 'ltr';
        document.body.classList.toggle('is-ltr', !ar);
        $('#lang-label').textContent = ar ? 'EN' : 'ع';

        const EN = {
            'nav.dashboard': 'Dashboard', 'nav.calendar': 'Calendar', 'nav.messages': 'Messages',
            'nav.properties': 'Properties', 'nav.contacts': 'Contacts',
            'nav.notifications': 'Notifications', 'nav.settings': 'Settings',
            'action.newBooking': 'New booking',
        };
        const AR = {
            'nav.dashboard': 'لوحة التحكم', 'nav.calendar': 'التقويم', 'nav.messages': 'الرسائل',
            'nav.properties': 'العقارات', 'nav.contacts': 'جهات الاتصال',
            'nav.notifications': 'الإشعارات', 'nav.settings': 'الإعدادات',
            'action.newBooking': 'حجز جديد',
        };

        const dict = ar ? AR : EN;
        $$('[data-i18n]').forEach((el) => {
            const v = dict[el.dataset.i18n];
            if (v) el.textContent = v;
        });
    }

    /* ---------------------------------------------------------------------
       13. النوافذ المنبثقة
       --------------------------------------------------------------------- */
    function openModal(title, bodyHtml, footHtml) {
        $('#modal').innerHTML = `
            <div class="modal-head">
                <h3>${escapeHtml(title)}</h3>
                <button class="icon-btn" id="modal-x">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
            <div class="modal-foot">${footHtml || ''}</div>`;
        $('#modal-back').classList.add('open');
        $('#modal-x').addEventListener('click', closeModal);
    }

    function closeModal() { $('#modal-back').classList.remove('open'); }

    function openBookingForm(pre) {
        pre = pre || {};
        const props = state.properties.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

        openModal('حجز جديد', `
            <div class="field"><label>اسم الضيف</label><input class="input" id="f-guest" value="${escapeHtml(pre.guest || '')}" placeholder="الاسم الكامل"></div>
            <div class="form-row">
                <div class="field"><label>الجوال</label><input class="input" id="f-phone" value="${escapeHtml(pre.phone || '')}" placeholder="05xxxxxxxx"></div>
                <div class="field"><label>الوحدة</label><select class="input" id="f-prop">${props}</select></div>
            </div>
            <div class="form-row">
                <div class="field"><label>تاريخ الوصول</label><input type="date" class="input" id="f-in" value="${pre.checkin || todayISO()}"></div>
                <div class="field"><label>تاريخ المغادرة</label><input type="date" class="input" id="f-out" value="${pre.checkout || addDays(todayISO(), 1)}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>المصدر</label><select class="input" id="f-source">
                    <option value="direct">الموقع المباشر</option>
                    <option value="gathern">جاذر إن</option>
                    <option value="airbnb">Airbnb</option>
                    <option value="manual">إضافة يدوية</option>
                    <option value="block">حجب / صيانة</option>
                </select></div>
                <div class="field"><label>المبلغ الإجمالي</label><input type="number" class="input" id="f-total" placeholder="0" value="${pre.total || ''}"></div>
            </div>
            <div class="field"><label>ملاحظات</label><textarea class="input" id="f-note" placeholder="طلبات خاصة، وقت الوصول…"></textarea></div>
            <div id="f-hint" style="font-size:12px;color:var(--muted);font-weight:600"></div>`,
            `<button class="btn btn-ghost" id="f-cancel">إلغاء</button>
             <button class="btn btn-primary" id="f-save">حفظ الحجز</button>`);

        if (pre.source) $('#f-source').value = pre.source;

        const recalc = () => {
            const n = nightsBetween($('#f-in').value, $('#f-out').value);
            const nightly = state.properties.find((p) => p.id === $('#f-prop').value)?.nightly || 0;
            $('#f-hint').textContent = n > 0 ? `${n} ليالٍ — السعر المقترح ${money(n * nightly)}` : 'تاريخ المغادرة يجب أن يكون بعد الوصول';
            if (n > 0 && !$('#f-total').value) $('#f-total').value = n * nightly;
        };

        ['#f-in', '#f-out', '#f-prop'].forEach((sel) => $(sel).addEventListener('change', recalc));
        recalc();

        $('#f-cancel').addEventListener('click', closeModal);
        $('#f-save').addEventListener('click', () => {
            const guest = $('#f-guest').value.trim();
            const ci = $('#f-in').value;
            const co = $('#f-out').value;
            const source = $('#f-source').value;

            if (!guest && source !== 'block') return toast('أدخل اسم الضيف', true);
            if (!ci || !co || nightsBetween(ci, co) < 1) return toast('تحقق من التواريخ', true);

            const clash = state.bookings.find((b) => b.status !== 'cancelled' && ci < b.checkout && co > b.checkin);
            if (clash) return toast(`تعارض مع حجز ${clash.guest}`, true);

            const phone = $('#f-phone').value.trim();
            const booking = {
                id: uid(),
                propertyId: $('#f-prop').value,
                guest: guest || 'غير متاح (حجب)',
                phone, source,
                checkin: ci, checkout: co,
                total: Number($('#f-total').value) || 0,
                status: source === 'block' ? 'blocked' : 'confirmed',
                note: $('#f-note').value.trim(),
            };

            state.bookings.push(booking);

            // إنشاء جهة اتصال تلقائياً إن لم تكن موجودة
            if (phone && !state.contacts.some((c) => c.phone === phone)) {
                state.contacts.push({ id: uid(), name: guest, phone, email: '', source, createdAt: todayISO(), note: 'أُضيف تلقائياً من حجز' });
            }

            if (source !== 'block') {
                pushNotification('booking', 'حجز جديد مؤكد', `${guest} — ${nightsBetween(ci, co)} ليالٍ عبر ${SOURCE_LABEL[source] || source}`);
            }

            // عمولة المنصات تُسجَّل تلقائياً للحجوزات غير المباشرة
            if (source === 'gathern' || source === 'airbnb') {
                const fee = bookingFee(booking.total, nightsBetween(ci, co));
                if (fee > 0) {
                    state.expenses.push({
                        id: uid(), propertyId: booking.propertyId, category: 'عمولة منصات',
                        amount: fee, date: todayISO(), dueDate: todayISO(), status: 'due',
                        note: `${guest} — ${SOURCE_LABEL[source]}`,
                    });
                }
            }

            save();
            closeModal();
            toast('تم حفظ الحجز');
            renderView(currentView());
            updateBadges();
        });
    }

    function openBookingDetails(b) {
        const tag = STATUS_TAG[b.status] || ['tag-mute', b.status];
        openModal('تفاصيل الحجز', `
            <div class="list-item"><div class="li-icon">👤</div><div class="li-body"><h4>${escapeHtml(b.guest)}</h4><p>${escapeHtml(b.phone || 'بدون جوال')}</p></div><div class="li-side"><span class="tag ${tag[0]}">${tag[1]}</span></div></div>
            <div class="list-item"><div class="li-icon">📅</div><div class="li-body"><h4>${fmtDate(b.checkin)} ← ${fmtDate(b.checkout)}</h4><p>${nightsBetween(b.checkin, b.checkout)} ليالٍ</p></div></div>
            <div class="list-item"><div class="li-icon">🔗</div><div class="li-body"><h4>${SOURCE_LABEL[b.source] || b.source}</h4><p>مصدر الحجز</p></div><div class="li-side"><b>${money(b.total)}</b></div></div>
            ${b.note ? `<div class="list-item"><div class="li-icon">📝</div><div class="li-body"><h4>ملاحظات</h4><p>${escapeHtml(b.note)}</p></div></div>` : ''}`,
            `<button class="btn btn-ghost" id="b-del" style="color:var(--danger)">حذف الحجز</button>
             <button class="btn btn-primary" id="b-close">إغلاق</button>`);

        $('#b-close').addEventListener('click', closeModal);
        $('#b-del').addEventListener('click', () => {
            state.bookings = state.bookings.filter((x) => x.id !== b.id);
            save();
            closeModal();
            toast('تم حذف الحجز');
            renderView(currentView());
        });
    }

    function openExpenseForm() {
        openModal('إضافة مصروف', `
            <div class="form-row">
                <div class="field"><label>البند</label><select class="input" id="e-cat">
                    ${EXPENSE_CATEGORIES.map((c) => `<option>${c}</option>`).join('')}
                </select></div>
                <div class="field"><label>المبلغ</label><input type="number" class="input" id="e-amt" placeholder="0"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>تاريخ التسجيل</label><input type="date" class="input" id="e-date" value="${todayISO()}"></div>
                <div class="field"><label>تاريخ الاستحقاق</label><input type="date" class="input" id="e-due" value="${addDays(todayISO(), 7)}"></div>
            </div>
            <div class="field"><label>الحالة</label><select class="input" id="e-status">
                <option value="due">مستحق</option><option value="paid">مسدد</option>
            </select></div>
            <div class="field"><label>ملاحظات</label><input class="input" id="e-note" placeholder="اختياري"></div>`,
            `<button class="btn btn-ghost" id="e-cancel">إلغاء</button>
             <button class="btn btn-primary" id="e-save">حفظ</button>`);

        $('#e-cancel').addEventListener('click', closeModal);
        $('#e-save').addEventListener('click', () => {
            const amt = Number($('#e-amt').value);
            if (!amt || amt <= 0) return toast('أدخل مبلغاً صحيحاً', true);

            state.expenses.push({
                id: uid(), propertyId: state.properties[0]?.id || 'p1',
                category: $('#e-cat').value, amount: amt,
                date: $('#e-date').value || todayISO(),
                dueDate: $('#e-due').value || todayISO(),
                status: $('#e-status').value,
                note: $('#e-note').value.trim(),
            });

            if ($('#e-status').value === 'due') {
                pushNotification('bill', 'مصروف مستحق', `${$('#e-cat').value} — ${money(amt)}`);
            }

            save();
            closeModal();
            toast('تمت إضافة المصروف');
            renderDashboard();
            updateBadges();
        });
    }

    function openContactForm() {
        openModal('جهة اتصال جديدة', `
            <div class="field"><label>الاسم</label><input class="input" id="c-name" placeholder="الاسم الكامل"></div>
            <div class="form-row">
                <div class="field"><label>الجوال</label><input class="input" id="c-phone" placeholder="05xxxxxxxx"></div>
                <div class="field"><label>المصدر</label><select class="input" id="c-source">
                    <option value="manual">إضافة يدوية</option>
                    <option value="direct">الموقع المباشر</option>
                    <option value="gathern">جاذر إن</option>
                    <option value="airbnb">Airbnb</option>
                </select></div>
            </div>
            <div class="field"><label>البريد الإلكتروني</label><input class="input" id="c-email" placeholder="اختياري"></div>
            <div class="field"><label>ملاحظات</label><input class="input" id="c-note" placeholder="اختياري"></div>`,
            `<button class="btn btn-ghost" id="c-cancel">إلغاء</button>
             <button class="btn btn-primary" id="c-save">حفظ</button>`);

        $('#c-cancel').addEventListener('click', closeModal);
        $('#c-save').addEventListener('click', () => {
            const name = $('#c-name').value.trim();
            if (!name) return toast('أدخل الاسم', true);

            state.contacts.push({
                id: uid(), name,
                phone: $('#c-phone').value.trim(),
                email: $('#c-email').value.trim(),
                source: $('#c-source').value,
                createdAt: todayISO(),
                note: $('#c-note').value.trim(),
            });

            save();
            closeModal();
            toast('تمت إضافة جهة الاتصال');
            renderContacts();
        });
    }

    function openPropertyForm(p) {
        const isNew = !p;
        p = p || { name: '', city: 'الرياض', district: '', rooms: 1, baths: 1, area: 60, floor: 'الأرضي', nightly: 294, status: 'active', img: 'assets/images/living.jpg', platforms: [] };

        openModal(isNew ? 'إضافة وحدة' : 'تعديل الوحدة', `
            <div class="field"><label>اسم الوحدة</label><input class="input" id="p-name" value="${escapeHtml(p.name)}"></div>
            <div class="form-row">
                <div class="field"><label>المدينة</label><input class="input" id="p-city" value="${escapeHtml(p.city)}"></div>
                <div class="field"><label>الحي</label><input class="input" id="p-dist" value="${escapeHtml(p.district)}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>عدد الغرف</label><input type="number" class="input" id="p-rooms" value="${p.rooms}"></div>
                <div class="field"><label>دورات المياه</label><input type="number" class="input" id="p-baths" value="${p.baths}"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>المساحة (م²)</label><input type="number" class="input" id="p-area" value="${p.area}"></div>
                <div class="field"><label>سعر الليلة</label><input type="number" class="input" id="p-price" value="${p.nightly}"></div>
            </div>
            <div class="field"><label>الحالة</label><select class="input" id="p-status">
                <option value="active">نشطة</option><option value="paused">موقوفة مؤقتاً</option>
            </select></div>`,
            `${isNew ? '' : '<button class="btn btn-ghost" id="p-del" style="color:var(--danger)">حذف</button>'}
             <button class="btn btn-ghost" id="p-cancel">إلغاء</button>
             <button class="btn btn-primary" id="p-save">حفظ</button>`);

        $('#p-status').value = p.status;
        $('#p-cancel').addEventListener('click', closeModal);

        if (!isNew) {
            $('#p-del').addEventListener('click', () => {
                state.properties = state.properties.filter((x) => x.id !== p.id);
                save();
                closeModal();
                renderProperties();
                toast('تم حذف الوحدة');
            });
        }

        $('#p-save').addEventListener('click', () => {
            const name = $('#p-name').value.trim();
            if (!name) return toast('أدخل اسم الوحدة', true);

            const data = {
                name,
                city: $('#p-city').value.trim(),
                district: $('#p-dist').value.trim(),
                rooms: Number($('#p-rooms').value) || 1,
                baths: Number($('#p-baths').value) || 1,
                area: Number($('#p-area').value) || 0,
                nightly: Number($('#p-price').value) || 0,
                status: $('#p-status').value,
            };

            if (isNew) {
                state.properties.push(Object.assign({ id: uid(), floor: 'الأرضي', beds: 1, img: 'assets/images/living.jpg', platforms: [] }, data));
            } else {
                Object.assign(p, data);
            }

            save();
            closeModal();
            renderProperties();
            toast('تم الحفظ');
        });
    }

    function openFeedForm(feed) {
        if (!feed) return;

        openModal('ربط ' + feed.name, `
            <div class="field">
                <label>رابط تقويم iCal الخاص بالمنصة</label>
                <input class="input" id="s-url" value="${escapeHtml(feed.url || '')}" placeholder="https://…/calendar.ics" dir="ltr">
            </div>
            <p style="font-size:12px;color:var(--text-dim);line-height:1.8">
                يُحفظ الرابط للمزامنة. لاستيراد الحجوزات الآن، الصق محتوى ملف ICS في الحقل أدناه أو ارفع الملف —
                لأن متصفحك يمنع القراءة المباشرة من نطاق آخر (CORS).
            </p>
            <div class="field">
                <label>لصق محتوى ملف ICS (اختياري)</label>
                <textarea class="input" id="s-text" placeholder="BEGIN:VCALENDAR…" dir="ltr"></textarea>
            </div>
            <button class="btn btn-ghost btn-sm" id="s-file">📂 رفع ملف .ics بدلاً من ذلك</button>`,
            `<button class="btn btn-ghost" id="s-cancel">إلغاء</button>
             <button class="btn btn-primary" id="s-save">حفظ ومزامنة</button>`);

        $('#s-cancel').addEventListener('click', closeModal);
        $('#s-file').addEventListener('click', () => pickFile('.ics', (text) => {
            $('#s-text').value = text;
            toast('تم تحميل الملف، اضغط حفظ ومزامنة');
        }));

        $('#s-save').addEventListener('click', () => {
            feed.url = $('#s-url').value.trim();
            const text = $('#s-text').value.trim();

            if (text) {
                importICSText(text, feed.name);
                feed.lastSync = new Date().toISOString();
            }

            save();
            closeModal();
            renderCalendar();
            toast('تم حفظ إعدادات المزامنة');
        });
    }

    function pickFile(accept, cb) {
        const input = $('#file-input');
        input.accept = accept;
        input.value = '';
        input.onchange = () => {
            const f = input.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => cb(String(r.result));
            r.readAsText(f);
        };
        input.click();
    }

    function currentView() {
        const active = $('.view.active');
        return active ? active.id.replace('view-', '') : 'dashboard';
    }

    /* ---------------------------------------------------------------------
       14. ربط الأحداث
       --------------------------------------------------------------------- */
    function bind() {
        $$('.rail-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
        $$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));

        $('#btn-theme').addEventListener('click', () => {
            state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
            save();
            renderView(currentView());
        });

        $('#btn-lang').addEventListener('click', () => {
            state.settings.lang = state.settings.lang === 'ar' ? 'en' : 'ar';
            applyLang();
            save();
            renderView(currentView());
        });

        $('#btn-bell').addEventListener('click', () => go('notifications'));
        $('#btn-new-booking').addEventListener('click', () => openBookingForm());
        $('#btn-add-expense').addEventListener('click', openExpenseForm);
        $('#btn-add-contact').addEventListener('click', openContactForm);
        $('#btn-add-prop').addEventListener('click', () => openPropertyForm(null));
        $('#contact-search').addEventListener('input', renderContacts);

        // التقويم
        $('#cal-prev').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); });
        $('#cal-next').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); });
        $('#cal-today').addEventListener('click', () => { calCursor = new Date(); renderCalendar(); });
        $('#cal-add').addEventListener('click', () => openBookingForm());
        $('#btn-ics-export').addEventListener('click', () => {
            download('calendar.ics', buildICS(), 'text/calendar;charset=utf-8');
            toast('تم تصدير ملف التقويم');
        });
        $('#btn-ics-import').addEventListener('click', () => pickFile('.ics', (t) => importICSText(t, 'ملف مرفوع')));
        $('#btn-add-sync').addEventListener('click', () => {
            const name = prompt('اسم المنصة (مثال: تقويم جوجل)');
            if (!name) return;
            state.syncFeeds.push({ id: uid(), name: name.trim(), url: '', lastSync: '' });
            save();
            renderSyncList();
        });

        // الإشعارات
        $$('#notif-filter button').forEach((b) => {
            b.addEventListener('click', () => {
                notifFilter = b.dataset.f;
                $$('#notif-filter button').forEach((x) => x.classList.toggle('active', x === b));
                renderNotifications();
            });
        });

        $('#btn-read-all').addEventListener('click', () => {
            state.notifications.forEach((n) => { n.read = true; });
            save();
            renderNotifications();
            updateBadges();
            toast('تم تعليم الكل كمقروء');
        });

        // الرسم البياني
        $$('#chart-range button').forEach((b) => {
            b.addEventListener('click', () => {
                chartMonths = Number(b.dataset.months);
                $$('#chart-range button').forEach((x) => x.classList.toggle('active', x === b));
                drawChart();
            });
        });

        // الإعدادات
        $$('#set-lang button').forEach((b) => {
            b.addEventListener('click', () => {
                state.settings.lang = b.dataset.lang;
                applyLang();
                save();
                renderSettings();
                renderView(currentView());
            });
        });

        $('#set-theme').addEventListener('click', () => {
            state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
            save();
            renderSettings();
        });

        $('#set-hijri').addEventListener('click', () => {
            state.settings.hijri = !state.settings.hijri;
            save();
            renderSettings();
        });

        $('#set-currency').addEventListener('change', (e) => {
            state.settings.currency = e.target.value;
            save();
            renderView(currentView());
            toast('تم تغيير العملة');
        });

        $$('[data-pref]').forEach((t) => {
            t.addEventListener('click', () => {
                state.settings[t.dataset.pref] = !state.settings[t.dataset.pref];
                t.classList.toggle('on');
                save();
            });
        });

        // البيانات
        $('#btn-export-data').addEventListener('click', () => {
            download(`backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
            toast('تم تصدير النسخة الاحتياطية');
        });

        $('#btn-import-data').addEventListener('click', () => pickFile('.json', (text) => {
            try {
                const data = JSON.parse(text);
                if (!data.settings) throw new Error('bad');
                state = data;
                save();
                applyTheme();
                applyLang();
                updateBadges();
                renderView(currentView());
                toast('تم استيراد البيانات');
            } catch (e) {
                toast('الملف غير صالح', true);
            }
        }));

        $('#btn-reset-data').addEventListener('click', () => {
            if (!confirm('سيتم حذف جميع البيانات والعودة للبيانات الافتراضية. متأكد؟')) return;
            state = seed();
            save();
            applyTheme();
            applyLang();
            updateBadges();
            renderView(currentView());
            toast('تمت إعادة التعيين');
        });

        // إغلاق النافذة
        $('#modal-back').addEventListener('click', (e) => { if (e.target.id === 'modal-back') closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

        // تسجيل الخروج
        const signOutBtn = $('#btn-sign-out');
        if (signOutBtn) signOutBtn.addEventListener('click', async () => {
            if (!confirm('تسجيل الخروج من لوحة التحكم؟')) return;
            const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
            if (client) await client.auth.signOut();
            stopMessagesRealtime();
            location.reload();
        });
    }

    /* ---------------------------------------------------------------------
       15. الإقلاع
       --------------------------------------------------------------------- */
    function start() {
        save();            // ثبّت البيانات الأولية عند أول فتح
        applyTheme();
        applyLang();
        bind();
        updateBadges();
        loadConversations();       // لتحديث شارة الرسائل حتى قبل فتح القسم
        startMessagesRealtime();   // بث لحظي: رسائل الزوار الجديدة تصل بلا تحديث

        const hash = location.hash.replace('#', '');
        go(PAGE_META[hash] ? hash : 'dashboard');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGate);
    } else {
        initGate();
    }
})();
