document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch apartments.json data
    let apartmentData = null;
    try {
        const response = await fetch('apartments.json');
        const data = await response.json();
        apartmentData = data.property_info;
    } catch (e) {
        console.error('Error fetching apartments.json:', e);
    }

    if (!apartmentData) return;

    // 2. Set Price & Calculate total nights
    const pricePerNight = apartmentData.pricing.price_per_night || 294;
    const checkinInput = document.getElementById('checkin');
    const checkoutInput = document.getElementById('checkout');
    const guestsInput = document.getElementById('guests');
    const nightsCountEl = document.getElementById('nights-count');
    const totalAmountEl = document.getElementById('total-amount');
    const waBookingBtn = document.getElementById('btn-wa-booking');

    // Default dates (Tomorrow & Day after tomorrow)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 3);

    if (checkinInput && checkoutInput) {
        checkinInput.valueAsDate = tomorrow;
        checkoutInput.valueAsDate = dayAfter;
    }

    function calculateBooking() {
        if (!checkinInput || !checkoutInput) return;
        const d1 = new Date(checkinInput.value);
        const d2 = new Date(checkoutInput.value);
        
        let nights = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
        if (isNaN(nights) || nights < 1) nights = 1;

        const total = nights * pricePerNight;
        const guests = guestsInput ? guestsInput.value : 1;

        if (nightsCountEl) nightsCountEl.textContent = `${nights} ليلة`;
        if (totalAmountEl) totalAmountEl.textContent = `${total} SAR`;

        // Update WhatsApp Booking Link
        if (waBookingBtn) {
            const phone = apartmentData.host.whatsapp || "966549814764";
            const msg = `مرحباً أستاذ ${apartmentData.host.owner_name}، أرغب في حجز الشقة الأنيقة (${apartmentData.title_gathern}) من تاريخ ${checkinInput.value} إلى ${checkoutInput.value} (عدد الليالي: ${nights}، الضيوف: ${guests}). الإجمالي التقديري: ${total} ريال سعودي.`;
            waBookingBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        }
    }

    if (checkinInput) checkinInput.addEventListener('change', calculateBooking);
    if (checkoutInput) checkoutInput.addEventListener('change', calculateBooking);
    if (guestsInput) guestsInput.addEventListener('change', calculateBooking);

    // Initial calculation
    calculateBooking();
});

/* ============================================================
   إبقاء عناوين المنصات واسم المضيف في سطر واحد دائماً
   يُصغّر حجم الخط تدريجياً حتى يتّسع النص كاملاً بدون قص
   ============================================================ */
(function () {
    const TARGETS = [
        { sel: '.title-card h2', max: 18, min: 9 },
        { sel: '.host-details h3', max: 16, min: 9 }
    ];

    function fitOneLine() {
        TARGETS.forEach(({ sel, max, min }) => {
            document.querySelectorAll(sel).forEach(el => {
                let size = max;
                el.style.fontSize = size + 'px';
                /* التقليص خطوة نصف بكسل حتى يختفي الفائض */
                while (el.scrollWidth > el.clientWidth && size > min) {
                    size -= 0.5;
                    el.style.fontSize = size + 'px';
                }
            });
        });
    }

    window.addEventListener('load', fitOneLine);
    window.addEventListener('resize', fitOneLine);
    document.addEventListener('DOMContentLoaded', fitOneLine);
})();

/* ============================================================
   عارض الصور بملء الشاشة (Lightbox) — بدون فتح تبويب جديد
   ============================================================ */
(function () {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const closeBtn = document.getElementById('lightbox-close');
    if (!lightbox || !lightboxImg) return;

    function open(img) {
        lightboxImg.src = img.currentSrc || img.src;
        lightboxImg.alt = img.alt || '';
        const figcaption = img.closest('figure')?.querySelector('.gallery-caption');
        lightboxCaption.textContent = figcaption ? figcaption.textContent : (img.alt || '');
        document.body.classList.add('lightbox-open');
        requestAnimationFrame(() => lightbox.classList.add('open'));
    }

    function close() {
        lightbox.classList.remove('open');
        document.body.classList.remove('lightbox-open');
        setTimeout(() => { lightboxImg.src = ''; }, 250);
    }

    document.querySelectorAll('.gallery-img').forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => open(img));
    });

    closeBtn?.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('open')) close();
    });
})();
