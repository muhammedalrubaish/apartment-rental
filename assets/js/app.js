const AMENITY_LABELS = {
  internet: 'إنترنت',
  washing_machine: 'غسالة',
  free_parking: 'موقف مجاني',
  tv: 'تلفاز',
  smart_lock: 'قفل ذكي'
};

const CATEGORY_LABELS = {
  official: 'رسمي',
  long_term: 'إيجار سنوي',
  short_term: 'إيجار يومي'
};

// البيانات تُزامن آليًا من Google Drive، فنهرب المحتوى قبل إدراجه في الصفحة.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
  } catch {
    return '#';
  }
}

async function loadJson(path, key) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const data = await res.json();
  return data[key] || [];
}

async function renderSection(containerId, path, key, renderer, emptyMsg) {
  const container = document.getElementById(containerId);
  try {
    const items = await loadJson(path, key);
    container.innerHTML = items.length
      ? items.map(renderer).join('')
      : `<p class="empty">${emptyMsg}</p>`;
  } catch {
    container.innerHTML = '<p class="error">تعذّر تحميل البيانات</p>';
  }
}

function renderApartment(apt) {
  const amenities = Object.entries(apt.amenities || {})
    .filter(([, v]) => v)
    .map(([key]) => AMENITY_LABELS[key] || key);

  const nearby = apt.location?.nearby;

  return `
    <article class="card">
      <h3>${esc(apt.name)}</h3>
      <p class="type">${esc(apt.type)} — ${esc(apt.floor)}</p>
      <p class="price">${esc(apt.pricing.min_price)}–${esc(apt.pricing.max_price)} ${esc(apt.pricing.currency)}
        <small>/ حسب الاتفاق</small>
      </p>
      <ul class="meta-list">
        <li>${esc(apt.location.district)}، ${esc(apt.location.city)}</li>
        <li>مدة العقد: ${esc(apt.lease_duration_months)} شهرًا</li>
        <li>الدخول: ${esc(apt.check_in_time)} — الخروج: ${esc(apt.check_out_time)}</li>
        ${nearby?.length ? `<li>قريب من: ${esc(nearby.join('، '))}</li>` : ''}
      </ul>
      <div class="tags">
        ${amenities.map(a => `<span class="tag">${esc(a)}</span>`).join('')}
      </div>
    </article>
  `;
}

function renderPlatform(p) {
  const badge = CATEGORY_LABELS[p.category];

  return `
    <a class="platform-card" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">
      <div class="platform-head">
        <h3 class="platform-name">
          ${esc(p.name)}
          ${p.name_en && p.name_en !== p.name ? `<span>${esc(p.name_en)}</span>` : ''}
        </h3>
        ${badge ? `<span class="badge badge-${esc(p.category)}">${esc(badge)}</span>` : ''}
      </div>
      <p class="platform-desc">${esc(p.description)}</p>
    </a>
  `;
}

renderSection('apartments', 'data/apartments.json', 'apartments', renderApartment, 'لا توجد شقق متاحة حاليًا');
renderSection('platforms', 'data/platforms.json', 'platforms', renderPlatform, 'لا توجد منصات مضافة');
