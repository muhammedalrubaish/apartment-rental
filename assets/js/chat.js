/* ==========================================================================
   محادثة مباشرة مع الزائر
   - يجب تسجيل الدخول بالاسم الثنائي ورقم الجوال قبل بدء المحادثة
   - المحادثة تُحفظ في متصفح الزائر، وتُرسل نسخة للمالك عبر واتساب
   ========================================================================== */
(function () {
    'use strict';

    const OWNER_WA = '966549814764';
    const OWNER_NAME = 'محمد';
    const STORE = 'rhsa_visitor_chat_v1';

    const $ = (s, r = document) => r.querySelector(s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ---------- الحالة ---------- */
    let state = load();

    function load() {
        try {
            const raw = localStorage.getItem(STORE);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* تجاهل البيانات التالفة */ }
        return { name: '', phone: '', messages: [], startedAt: '' };
    }

    function save() {
        try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* مساحة ممتلئة */ }
    }

    const isLoggedIn = () => Boolean(state.name && state.phone);

    /* ---------- التحقق من المدخلات ---------- */
    function checkName(v) {
        const parts = v.trim().split(/\s+/).filter((p) => p.length > 1);
        if (parts.length < 2) return 'اكتب الاسم الثنائي (الاسم الأول واسم العائلة)';
        if (!/^[؀-ۿ\sء-يa-zA-Z]+$/.test(v.trim())) return 'الاسم يجب أن يحتوي حروفاً فقط';
        return '';
    }

    function normalizePhone(v) {
        return String(v).replace(/[^\d+]/g, '');
    }

    function checkPhone(v) {
        const d = normalizePhone(v).replace(/^\+?966/, '0');
        if (!/^05\d{8}$/.test(d)) return 'أدخل رقم جوال سعودي صحيح (مثال: 0512345678)';
        return '';
    }

    const waNumber = (p) => normalizePhone(p).replace(/^\+/, '').replace(/^0/, '966');

    /* ---------- الوقت ---------- */
    function clock(iso) {
        const d = new Date(iso);
        return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    /* ---------- الردود الآلية ---------- */
    const AUTO = [
        { k: ['سعر', 'كم', 'تكلفة', 'ليلة', 'كلفة'], a: 'سعر الليلة 294 ريال، ويقل السعر للإقامات الطويلة. أخبرني بتواريخك وأرسل لك العرض النهائي.' },
        { k: ['متاح', 'متوفر', 'حجز', 'فاضي', 'شاغر'], a: 'أتحقق من التقويم وأرد عليك خلال دقائق. ما التواريخ التي تريدها؟' },
        { k: ['موقع', 'وين', 'عنوان', 'مكان'], a: 'الشقة في حي السليمانية بالرياض — 7905 عبدالحميد الكاتب، على بعد دقائق من المترو والمستشفيات.' },
        { k: ['واي فاي', 'انترنت', 'إنترنت', 'نت'], a: 'نعم، يوجد إنترنت عالي السرعة مجاني يغطي الشقة بالكامل.' },
        { k: ['موقف', 'سيارة', 'باركن'], a: 'يوجد موقف سيارات مجاني خاص في المبنى.' },
        { k: ['دخول', 'مفتاح', 'استلام', 'تسجيل'], a: 'الدخول ذاتي بقفل ذكي بالبصمة أو الرمز — تستلم الرمز قبل موعد وصولك.' },
        { k: ['مطبخ', 'طبخ'], a: 'المطبخ مجهز بالكامل: ثلاجة، ميكروويف، سخانة، أواني، ومغسلة.' },
    ];

    function autoReply(text) {
        const t = text.toLowerCase();
        const hit = AUTO.find((r) => r.k.some((k) => t.includes(k)));
        return hit ? hit.a : null;
    }

    /* ---------- الرسم ---------- */
    const panel = () => $('#visitor-chat');

    function renderLogin() {
        panel().innerHTML = head() + `
            <div class="chat-login">
                <h5>مرحباً بك 👋</h5>
                <p>سجّل بياناتك لبدء المحادثة مع المالك مباشرة، أو تواصل عبر الواتساب فوراً.</p>

                <div class="chat-field">
                    <label for="cv-name">الاسم الثنائي</label>
                    <input type="text" id="cv-name" placeholder="مثال: محمد العتيبي" autocomplete="name" value="${esc(state.name)}">
                    <span class="err" id="cv-name-err"></span>
                </div>

                <div class="chat-field">
                    <label for="cv-phone">رقم الجوال</label>
                    <input type="tel" id="cv-phone" placeholder="05xxxxxxxx" dir="ltr" inputmode="tel" autocomplete="tel" value="${esc(state.phone)}">
                    <span class="err" id="cv-phone-err"></span>
                </div>

                <button class="chat-btn" id="cv-start">ابدأ المحادثة</button>

                <div class="chat-or">أو</div>

                <a class="chat-btn wa" href="https://wa.me/${OWNER_WA}" target="_blank" rel="noopener">
                    التواصل عبر الواتساب مباشرة
                </a>

                <p class="chat-privacy">
                    نستخدم اسمك ورقمك للرد على استفسارك وتأكيد الحجز فقط.
                </p>
            </div>`;

        const name = $('#cv-name');
        const phone = $('#cv-phone');

        $('#cv-start').addEventListener('click', () => {
            const ne = checkName(name.value);
            const pe = checkPhone(phone.value);
            $('#cv-name-err').textContent = ne;
            $('#cv-phone-err').textContent = pe;
            if (ne) return name.focus();
            if (pe) return phone.focus();

            state.name = name.value.trim().replace(/\s+/g, ' ');
            state.phone = normalizePhone(phone.value);
            state.startedAt = new Date().toISOString();
            state.messages = [{
                from: 'them',
                text: `أهلاً ${state.name.split(' ')[0]} 👋 أنا ${OWNER_NAME}، مالك الشقة. كيف أقدر أساعدك؟`,
                at: new Date().toISOString(),
            }];
            save();
            renderChat();
        });

        [name, phone].forEach((el) => el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') $('#cv-start').click();
        }));
    }

    function head() {
        return `
            <div class="chat-head">
                <div class="ch-av">${esc(OWNER_NAME.charAt(0))}</div>
                <div class="ch-meta">
                    <h4>${esc(OWNER_NAME)} — مالك الشقة</h4>
                    <span><i></i> يرد عادة خلال دقائق</span>
                </div>
                <button class="ch-x" id="cv-close" aria-label="إغلاق المحادثة">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>`;
    }

    const QUICK = ['هل الشقة متاحة؟', 'كم سعر الليلة؟', 'أين الموقع بالضبط؟', 'كيف أستلم المفتاح؟'];

    function renderChat() {
        panel().innerHTML = head() + `
            <div class="chat-body" id="cv-body">
                <div class="chat-note">
                    تصلك الردود هنا وعلى الواتساب على الرقم ${esc(state.phone)}
                </div>
                ${state.messages.map(bubble).join('')}
            </div>

            <a class="chat-forward" id="cv-forward" target="_blank" rel="noopener" hidden>
                📤 أرسل المحادثة للمالك على الواتساب ليصله إشعار فوري
            </a>

            <div class="chat-quick" id="cv-quick">
                ${QUICK.map((q) => `<button type="button">${esc(q)}</button>`).join('')}
            </div>

            <div class="chat-compose">
                <input type="text" id="cv-input" placeholder="اكتب رسالتك…" autocomplete="off">
                <button class="chat-send" id="cv-send" aria-label="إرسال">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 4 3 11l6 2.5L11.5 20z"/><path d="M20 4 9.5 13.5"/>
                    </svg>
                </button>
            </div>`;

        scrollDown();

        markUnsent();
        $('#cv-send').addEventListener('click', send);
        $('#cv-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        $('#cv-quick').querySelectorAll('button').forEach((b) => {
            b.addEventListener('click', () => { $('#cv-input').value = b.textContent; send(); });
        });
    }

    function bubble(m) {
        return `<div class="chat-msg ${m.from === 'me' ? 'me' : 'them'}">${esc(m.text)}<time>${clock(m.at)}</time></div>`;
    }

    function scrollDown() {
        const body = $('#cv-body');
        if (body) body.scrollTop = body.scrollHeight;
    }

    function push(from, text) {
        state.messages.push({ from, text, at: new Date().toISOString() });
        save();
        const body = $('#cv-body');
        if (body) {
            body.insertAdjacentHTML('beforeend', bubble(state.messages[state.messages.length - 1]));
            scrollDown();
        }
    }

    function send() {
        const input = $('#cv-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        push('me', text);
        markUnsent();

        // رد آلي فوري إن تطابق السؤال، وإلا إشعار بأن المالك سيرد
        const reply = autoReply(text);
        setTimeout(() => {
            push('them', reply || 'وصلتني رسالتك ✅ سأرد عليك بأقرب وقت. للرد الفوري اضغط زر الواتساب بالأسفل.');
        }, reply ? 700 : 900);
    }

    /* إرسال المحادثة للمالك عبر واتساب — لأن الموقع ثابت بلا خادم */
    function markUnsent() {
        const link = $('#cv-forward');
        if (!link) return;

        const mine = state.messages.filter((m) => m.from === 'me');
        if (!mine.length) return;

        const summary = [
            'محادثة من الموقع',
            `الاسم: ${state.name}`,
            `الجوال: ${state.phone}`,
            '',
            ...mine.map((m) => `• ${m.text}`),
        ].join('\n');

        link.href = `https://wa.me/${OWNER_WA}?text=${encodeURIComponent(summary)}`;
        link.hidden = false;
    }

    /* ---------- الفتح والإغلاق ---------- */
    function open() {
        panel().classList.add('open');
        document.body.classList.add('chat-open');
        $('#chat-launcher').style.display = 'none';
        if (isLoggedIn()) renderChat(); else renderLogin();
        $('#cv-close').addEventListener('click', close);
        const first = $('#cv-input') || $('#cv-name');
        if (first && window.innerWidth > 560) first.focus();
    }

    function close() {
        panel().classList.remove('open');
        document.body.classList.remove('chat-open');
        $('#chat-launcher').style.display = '';
    }

    /* ---------- الإقلاع ---------- */
    function start() {
        const launcher = $('#chat-launcher');
        if (!launcher || !panel()) return;
        launcher.addEventListener('click', open);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel().classList.contains('open')) close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
