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
            error.textContent = '❌ كلمة السر غير صحيحة، حاول مرة أخرى.';
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

    document.getElementById('btn-lock').addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        location.reload();
    });

    recalc();
}

document.addEventListener('DOMContentLoaded', initLock);
