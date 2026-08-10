async function loadApartments() {
  const container = document.getElementById('apartments');
  try {
    const res = await fetch('data/apartments.json');
    const { apartments } = await res.json();

    if (!apartments || apartments.length === 0) {
      container.innerHTML = '<p class="empty">لا توجد شقق متاحة حاليًا</p>';
      return;
    }

    container.innerHTML = apartments.map(renderCard).join('');
  } catch (err) {
    container.innerHTML = '<p class="error">تعذّر تحميل بيانات الشقق</p>';
  }
}

function renderCard(apt) {
  const amenityLabels = {
    internet: 'إنترنت',
    washing_machine: 'غسالة',
    free_parking: 'موقف مجاني',
    tv: 'تلفاز',
    smart_lock: 'قفل ذكي'
  };

  const amenities = Object.entries(apt.amenities || {})
    .filter(([, v]) => v)
    .map(([key]) => amenityLabels[key] || key);

  return `
    <article class="card">
      <h2>${apt.name}</h2>
      <p class="type">${apt.type} — ${apt.floor}</p>
      <p class="price">${apt.pricing.min_price}–${apt.pricing.max_price} ${apt.pricing.currency}
        <small>/ ليلة أو شهر حسب الاتفاق</small>
      </p>
      <ul class="meta-list">
        <li>${apt.location.district}، ${apt.location.city}</li>
        <li>مدة العقد: ${apt.lease_duration_months} شهرًا</li>
        <li>الدخول: ${apt.check_in_time} — الخروج: ${apt.check_out_time}</li>
        ${apt.location.nearby && apt.location.nearby.length
          ? `<li>قريب من: ${apt.location.nearby.join('، ')}</li>` : ''}
      </ul>
      <div class="tags">
        ${amenities.map(a => `<span class="tag">${a}</span>`).join('')}
      </div>
    </article>
  `;
}

loadApartments();
