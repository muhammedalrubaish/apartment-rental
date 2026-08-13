/* ============================================================
   حاسبة تحصيل الدين — صفحة خاصة بالمالك
   كلمة السر الافتراضية: Debt2026
   لتغييرها: احسب SHA-256 للكلمة الجديدة وضعها في PASS_HASH
   (مثال في الطرفية: echo -n "كلمتك" | shasum -a 256)
   ملاحظة: الحماية هنا حماية بسيطة من طرف المتصفح لأن الموقع ثابت
   (بدون سيرفر)، وتكفي لإخفاء الصفحة عن الزوار العاديين.
   ============================================================ */

const PASS_HASH = '30b0f086f1c4acdb9d65424d459a492dac97564eb310abcec8b1f7f1a4e54460';
const SESSION_KEY = 'debt_unlocked_v1';
const PAYMENTS_KEY = 'debt_payments_v1';
const BOOKINGS_KEY = 'debt_bookings_v1';
const PLATFORMS_KEY = 'debt_platforms_v1';

/* التطبيقات الحالية — تُضاف غيرها من داخل الصفحة */
const DEFAULT_PLATFORMS = ['جاذر ان (Gathern)', 'Airbnb', 'بوكينق (Booking)'];

/* نموذج عمولة المنصات (جاذر ان / Airbnb / بوكينق)
   مستنتج من الأمثلة: 269 ← 33 ، 139 ← 24  */
const FEE_BASE = 14.38;
const FEE_RATE = 0.0692;

const MONTH_NAMES = ['الشهر 1', 'الشهر 2', 'الشهر 3', 'الشهر 4', 'الشهر 5', 'الشهر 6',
    'الشهر 7', 'الشهر 8', 'الشهر 9', 'الشهر 10', 'الشهر 11', 'الشهر 12',
    'الشهر 13', 'الشهر 14', 'الشهر 15', 'الشهر 16', 'الشهر 17', 'الشهر 18',
    'الشهر 19', 'الشهر 20', 'الشهر 21', 'الشهر 22', 'الشهر 23', 'الشهر 24'];

/* ---------- أدوات مساعدة ---------- */

async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 2
});

const sar = n => `${fmt(n)} ريال`;

const num = id => {
    const el = document.getElementById(id);
    const v = parseFloat(el && el.value);
    return isNaN(v) ? 0 : v;
};

const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
};

/* ---------- شاشة كلمة السر ---------- */

function unlock() {
    document.getElementById('lock-screen').style.display = 'none';
    const app = document.getElementById('debt-app');
    app.hidden = false;
    initApp();
}

function initLock() {
    const form = document.getElementById('lock-form');
    const input = document.getElementById('lock-input');
    const error = document.getElementById('lock-error');

    if (sessionStorage.getItem(SESSION_KEY) === '1') {
        unlock();
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hash = await sha256(input.value.trim());
        if (hash === PASS_HASH) {
            sessionStorage.setItem(SESSION_KEY, '1');
            unlock();
        } else {
            error.textContent = '⛔ رمز الدخول غير صحيح — تعذّر فتح الملف.';
            input.value = '';
            input.focus();
        }
    });

    input.focus();
}

/* ---------- الدفعات ---------- */

function loadPayments() {
    try {
        const raw = localStorage.getItem(PAYMENTS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function savePayments(list) {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list));
}

function renderPayments(debtTotal) {
    const body = document.getElementById('payments-body');
    const list = loadPayments().slice().sort((a, b) => a.date.localeCompare(b.date));
    body.innerHTML = '';

    if (!list.length) {
        body.innerHTML = '<tr><td colspan="5" class="empty-row">لا توجد دفعات مسجلة بعد.</td></tr>';
        return 0;
    }

    let running = 0;
    list.forEach((p) => {
        running += p.amount;
        const remaining = Math.max(debtTotal - running, 0);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.date}</td>
            <td class="num-cell">${sar(p.amount)}</td>
            <td>${p.note ? p.note.replace(/[<>]/g, '') : '—'}</td>
            <td class="num-cell">${sar(remaining)}</td>
            <td><button type="button" class="btn-del" data-id="${p.id}">حذف</button></td>`;
        body.appendChild(tr);
    });

    body.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
            savePayments(loadPayments().filter(x => String(x.id) !== btn.dataset.id));
            recalc();
        });
    });

    return running;
}

/* ---------- الحجوزات والمنصات ---------- */

function loadStore(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        const val = raw ? JSON.parse(raw) : null;
        return Array.isArray(val) ? val : fallback;
    } catch (e) {
        return fallback;
    }
}

const loadBookings = () => loadStore(BOOKINGS_KEY, []);
const saveBookings = list => localStorage.setItem(BOOKINGS_KEY, JSON.stringify(list));
const loadPlatforms = () => loadStore(PLATFORMS_KEY, DEFAULT_PLATFORMS.slice());
const savePlatforms = list => localStorage.setItem(PLATFORMS_KEY, JSON.stringify(list));

function renderPlatformOptions() {
    const select = document.getElementById('bk-platform');
    const current = select.value;
    const list = loadPlatforms();
    select.innerHTML = '';
    list.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (list.includes(current)) select.value = current;

    /* شرائح التطبيقات مع إمكانية حذف المضاف */
    const chips = document.getElementById('platform-chips');
    chips.innerHTML = '';
    list.forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'platform-chip';
        const isDefault = DEFAULT_PLATFORMS.includes(name);
        chip.innerHTML = `${name}${isDefault ? '' : ' <button type="button" class="chip-del" data-name="' + name + '">×</button>'}`;
        chips.appendChild(chip);
    });

    chips.querySelectorAll('.chip-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            const used = loadBookings().some(b => b.platform === name);
            if (used) {
                alert(`لا يمكن حذف "${name}" لوجود حجوزات مسجلة عليه.`);
                return;
            }
            savePlatforms(loadPlatforms().filter(p => p !== name));
            renderPlatformOptions();
        });
    });
}

function renderBookings() {
    const body = document.getElementById('bookings-body');
    const list = loadBookings().slice().sort((a, b) => a.date.localeCompare(b.date));
    body.innerHTML = '';

    let gross = 0, fees = 0, nights = 0;
    const byPlatform = {};

    if (!list.length) {
        body.innerHTML = '<tr><td colspan="9" class="empty-row">لا توجد حجوزات مسجلة بعد.</td></tr>';
    } else {
        list.forEach(bk => {
            const net = bk.amount - bk.fee;
            gross += bk.amount;
            fees += bk.fee;
            nights += bk.nights;

            const agg = byPlatform[bk.platform] || (byPlatform[bk.platform] = { count: 0, gross: 0, fee: 0 });
            agg.count++;
            agg.gross += bk.amount;
            agg.fee += bk.fee;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${bk.date}</td>
                <td>${esc(bk.platform)}</td>
                <td>${esc(bk.method)}</td>
                <td class="num-cell">${bk.nights}</td>
                <td class="num-cell">${fmt(bk.amount)}</td>
                <td class="num-cell danger">${fmt(bk.fee)}</td>
                <td class="num-cell strong">${fmt(net)}</td>
                <td>${bk.note ? esc(bk.note) : '—'}</td>
                <td><button type="button" class="btn-del" data-id="${bk.id}">حذف</button></td>`;
            body.appendChild(tr);
        });

        const foot = document.createElement('tr');
        foot.className = 'total-row';
        foot.innerHTML = `
            <td colspan="3">الإجمالي</td>
            <td class="num-cell">${nights}</td>
            <td class="num-cell">${fmt(gross)}</td>
            <td class="num-cell danger">${fmt(fees)}</td>
            <td class="num-cell strong">${fmt(gross - fees)}</td>
            <td colspan="2"></td>`;
        body.appendChild(foot);
    }

    body.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
            saveBookings(loadBookings().filter(x => String(x.id) !== btn.dataset.id));
            recalc();
        });
    });

    setText('bk-gross', sar(gross));
    setText('bk-fees', sar(fees));
    setText('bk-net', sar(gross - fees));
    setText('bk-count', `${list.length} حجز / ${nights} ليلة`);

    /* جدول الأرباح حسب التطبيق */
    const pBody = document.getElementById('platform-body');
    pBody.innerHTML = '';
    const names = Object.keys(byPlatform);
    if (!names.length) {
        pBody.innerHTML = '<tr><td colspan="6" class="empty-row">لا توجد بيانات بعد.</td></tr>';
    } else {
        names.sort((a, b) => byPlatform[b].gross - byPlatform[a].gross).forEach(name => {
            const a = byPlatform[name];
            const pct = a.gross > 0 ? (a.fee / a.gross) * 100 : 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(name)}</td>
                <td class="num-cell">${a.count}</td>
                <td class="num-cell">${fmt(a.gross)}</td>
                <td class="num-cell danger">${fmt(a.fee)}</td>
                <td class="num-cell strong">${fmt(a.gross - a.fee)}</td>
                <td class="num-cell">${pct.toFixed(1)}%</td>`;
            pBody.appendChild(tr);
        });
    }

    return { gross, fees, net: gross - fees, nights };
}

/* ---------- العمولة ---------- */

function platformFee(nightPrice, cap) {
    if (nightPrice <= 0) return 0;
    const fee = FEE_BASE + FEE_RATE * nightPrice;
    return Math.min(Math.max(fee, 0), cap > 0 ? cap : fee);
}

/* ---------- الحساب الرئيسي ---------- */

function recalc() {
    /* الدين: الإيجار فقط */
    const contract = num('in-contract');
    const paidByMom = num('in-paid-by-mom');
    const monthlyRent = contract / 12;
    const halfContract = contract / 2;
    const debtTotal = paidByMom;

    setText('out-monthly-rent', sar(monthlyRent));
    setText('out-half-contract', sar(halfContract));
    const diff = paidByMom - halfContract;
    setText('out-diff', diff === 0 ? 'مطابق تماماً (0)' :
        (diff > 0 ? `أكثر بـ ${sar(diff)}` : `أقل بـ ${sar(Math.abs(diff))}`));
    setText('out-debt-total', sar(debtTotal));

    /* الدفعات */
    const paid = renderPayments(debtTotal);
    const remaining = Math.max(debtTotal - paid, 0);

    setText('kpi-contract', sar(contract));
    setText('kpi-debt', sar(debtTotal));
    setText('kpi-paid', sar(paid));
    setText('kpi-remaining', sar(remaining));
    setText('side-remaining', fmt(remaining));

    const pct = debtTotal > 0 ? Math.min((paid / debtTotal) * 100, 100) : 0;
    const bar = document.getElementById('debt-progress');
    if (bar) bar.style.width = pct.toFixed(1) + '%';
    setText('debt-progress-label',
        remaining === 0 && debtTotal > 0
            ? '🎉 تم سداد كامل الدين للوالدة'
            : `تم سداد ${pct.toFixed(1)}% — متبقٍ ${sar(remaining)}`);

    /* الحجوزات والأرباح */
    renderBookings();

    /* المصاريف التشغيلية */
    const cleanFirst = num('in-clean-first');
    const cleanRest = num('in-clean-rest');
    const power = num('in-power');
    const internet = num('in-internet');
    const months = Math.max(Math.round(num('in-months')), 1);

    const firstMonths = Math.min(months, 2);
    const restMonths = Math.max(months - 2, 0);
    const cleanTotal = firstMonths * cleanFirst + restMonths * cleanRest;
    const powerTotal = months * power;
    const internetTotal = months * internet;
    const opexTotal = cleanTotal + powerTotal + internetTotal;
    const opexMonthly = opexTotal / months;

    setText('out-clean-total', `${sar(cleanTotal)} (${firstMonths}×${fmt(cleanFirst)} + ${restMonths}×${fmt(cleanRest)})`);
    setText('out-power-total', `${sar(powerTotal)} (${months}×${fmt(power)})`);
    setText('out-internet-total', `${sar(internetTotal)} (${months}×${fmt(internet)})`);
    setText('out-opex-monthly', sar(opexMonthly));
    setText('out-opex-total', sar(opexTotal));

    /* الجدول الشهري */
    const mBody = document.getElementById('months-body');
    mBody.innerHTML = '';
    for (let i = 0; i < months; i++) {
        const clean = i < 2 ? cleanFirst : cleanRest;
        const total = monthlyRent + clean + power + internet;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${MONTH_NAMES[i] || 'الشهر ' + (i + 1)}</td>
            <td class="num-cell">${fmt(monthlyRent)}</td>
            <td class="num-cell">${fmt(clean)}</td>
            <td class="num-cell">${fmt(power)}</td>
            <td class="num-cell">${fmt(internet)}</td>
            <td class="num-cell strong">${fmt(total)}</td>`;
        mBody.appendChild(tr);
    }
    const grandRent = monthlyRent * months;
    const foot = document.createElement('tr');
    foot.className = 'total-row';
    foot.innerHTML = `
        <td>الإجمالي</td>
        <td class="num-cell">${fmt(grandRent)}</td>
        <td class="num-cell">${fmt(cleanTotal)}</td>
        <td class="num-cell">${fmt(powerTotal)}</td>
        <td class="num-cell">${fmt(internetTotal)}</td>
        <td class="num-cell strong">${fmt(grandRent + opexTotal)}</td>`;
    mBody.appendChild(foot);

    /* الدخل بعد العمولة */
    const nightPrice = num('in-night-price');
    const nights = Math.max(Math.round(num('in-nights')), 1);
    const cap = num('in-fee-cap');

    const feeNight = platformFee(nightPrice, cap);
    const netNight = nightPrice - feeNight;
    const feeTotal = feeNight * nights;
    const netTotal = netNight * nights;

    setText('out-fee-night', sar(feeNight));
    setText('out-net-night', sar(netNight));
    setText('out-fee-total', sar(feeTotal));
    setText('out-net-total', sar(netTotal));

    const opexDaily = opexMonthly / 30;
    const netAfterOpexNight = netNight - opexDaily;
    setText('out-net-after-opex', `${sar(netAfterOpexNight * nights)} (${fmt(netAfterOpexNight)} / ليلة)`);

    if (remaining <= 0) {
        setText('out-nights-needed', '✅ لا يوجد متبقٍ');
        setText('out-months-needed', '—');
        setText('kpi-nights', '✅ مسدَّد');
    } else if (netAfterOpexNight <= 0) {
        setText('out-nights-needed', 'صافي الليلة صفر أو أقل');
        setText('out-months-needed', '—');
        setText('kpi-nights', '—');
    } else {
        const nightsNeeded = Math.ceil(remaining / netAfterOpexNight);
        setText('out-nights-needed', `${nightsNeeded} ليلة`);
        setText('out-months-needed', `${(nightsNeeded / (30 * 0.6)).toFixed(1)} شهر`);
        setText('kpi-nights', `${nightsNeeded} ليلة`);
    }
}

/* ---------- التهيئة ---------- */

function initApp() {
    ['in-contract', 'in-paid-by-mom', 'in-clean-first', 'in-clean-rest', 'in-power',
        'in-internet', 'in-months', 'in-night-price', 'in-nights', 'in-fee-cap']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', recalc);
        });

    const payDate = document.getElementById('pay-date');
    if (payDate) payDate.valueAsDate = new Date();

    document.getElementById('payment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('pay-date').value;
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const note = document.getElementById('pay-note').value.trim();
        if (!date || isNaN(amount) || amount <= 0) return;

        const list = loadPayments();
        list.push({ id: Date.now(), date, amount, note });
        savePayments(list);

        document.getElementById('pay-amount').value = '';
        document.getElementById('pay-note').value = '';
        recalc();
    });

    /* الحجوزات */
    renderPlatformOptions();

    const bkDate = document.getElementById('bk-date');
    if (bkDate) bkDate.valueAsDate = new Date();

    document.getElementById('booking-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('bk-date').value;
        const platform = document.getElementById('bk-platform').value;
        const method = document.getElementById('bk-method').value;
        const nights = parseInt(document.getElementById('bk-nights').value, 10);
        const amount = parseFloat(document.getElementById('bk-amount').value);
        const fee = parseFloat(document.getElementById('bk-fee').value);
        const note = document.getElementById('bk-note').value.trim();

        if (!date || !platform || isNaN(amount) || isNaN(fee)) return;
        if (fee > amount) {
            alert('العمولة أكبر من المبلغ الإجمالي — راجع الأرقام.');
            return;
        }

        const list = loadBookings();
        list.push({
            id: Date.now(), date, platform, method,
            nights: isNaN(nights) || nights < 1 ? 1 : nights,
            amount, fee, note
        });
        saveBookings(list);

        document.getElementById('bk-amount').value = '';
        document.getElementById('bk-fee').value = '';
        document.getElementById('bk-note').value = '';
        document.getElementById('bk-nights').value = '1';
        recalc();
    });

    document.getElementById('btn-add-platform').addEventListener('click', () => {
        const input = document.getElementById('new-platform');
        const name = input.value.trim();
        if (!name) return;

        const list = loadPlatforms();
        if (list.some(p => p.toLowerCase() === name.toLowerCase())) {
            alert('هذا التطبيق مضاف مسبقاً.');
            return;
        }
        list.push(name);
        savePlatforms(list);
        input.value = '';
        renderPlatformOptions();
        document.getElementById('bk-platform').value = name;
    });

    document.getElementById('new-platform').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-add-platform').click();
        }
    });

    document.getElementById('btn-lock').addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        location.reload();
    });

    recalc();
}

document.addEventListener('DOMContentLoaded', initLock);
