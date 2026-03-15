// Gemi Takip Sistemi - Koordinat tabanlı harita takibi

document.addEventListener('DOMContentLoaded', () => {
  let map = null;
  let shipMarker = null;
  let routeLine = null;
  let coordMarkers = [];
  let coordinates = [];
  let isAnimating = false;
  let animationId = null;

  // Harita başlat
  function initMap() {
    map = L.map('map', { zoomControl: true }).setView([41.0082, 28.9784], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    // Harita her zaman görünür olsun (overlay sadece bilgi amaçlı)
    setTimeout(() => map.invalidateSize(), 100);
  }

  // Gemi ikonu - belirgin yandan görünüm (pruva, güverte, köprü, baca)
  const shipIcon = L.divIcon({
    className: 'ship-marker',
    html: `
      <div class="ship-icon">
        <svg viewBox="0 0 80 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Su çizgisi / gövde altı -->
          <path d="M4 28 Q8 26 16 26 L64 26 Q72 26 76 28 L76 32 L4 32 Z" fill="rgba(2,136,209,0.3)" stroke="#01579b" stroke-width="1"/>
          <!-- Ana gövde (gemi karinası) -->
          <path d="M4 28 L8 26 L16 26 L64 26 L72 26 L76 28 L76 30 L72 30 L8 30 L4 28 Z" fill="url(#shipHull)" stroke="#fff" stroke-width="1.5"/>
          <!-- Güverte çizgisi -->
          <path d="M10 24 L70 24" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
          <!-- Köprü üst yapısı -->
          <rect x="38" y="12" width="22" height="12" rx="1" fill="url(#shipBridge)" stroke="#fff" stroke-width="1"/>
          <!-- Baca -->
          <rect x="48" y="6" width="6" height="8" rx="1" fill="#546e7a" stroke="#37474f"/>
          <!-- Pruva (burun) - belirgin sivri form -->
          <path d="M4 28 L4 26 L12 24 L16 24" stroke="url(#shipBow)" stroke-width="2" fill="none"/>
          <path d="M4 28 L10 26 L16 24" fill="url(#shipBow)"/>
          <!-- Kıç / pupa -->
          <path d="M64 24 L76 28 L76 30 L72 30" fill="url(#shipStern)"/>
          <!-- Pencere detayları -->
          <rect x="42" y="15" width="3" height="3" rx="0.5" fill="#fff" opacity="0.9"/>
          <rect x="48" y="15" width="3" height="3" rx="0.5" fill="#fff" opacity="0.9"/>
          <rect x="54" y="15" width="3" height="3" rx="0.5" fill="#fff" opacity="0.9"/>
          <defs>
            <linearGradient id="shipHull" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#29b6f6"/>
              <stop offset="50%" stop-color="#0288d1"/>
              <stop offset="100%" stop-color="#01579b"/>
            </linearGradient>
            <linearGradient id="shipBridge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#4fc3f7"/>
              <stop offset="100%" stop-color="#0277bd"/>
            </linearGradient>
            <linearGradient id="shipBow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stop-color="#0288d1"/>
              <stop offset="100%" stop-color="#4fc3f7"/>
            </linearGradient>
            <linearGradient id="shipStern" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#0288d1"/>
              <stop offset="100%" stop-color="#01579b"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    `,
    iconSize: [120, 60],
    iconAnchor: [60, 30]
  });

  // Pin ikonu - her koordinat için
  const pinIcon = L.divIcon({
    className: 'pin-marker',
    html: `
      <div class="pin-icon">
        <svg viewBox="0 0 32 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 32 16 32s16-20 16-32C32 7.16 24.84 0 16 0z" 
                fill="#e53935" stroke="#fff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#fff"/>
        </svg>
      </div>
    `,
    iconSize: [24, 36],
    iconAnchor: [12, 36]
  });

  // Bayrak ikonu - varış noktası
  const flagIcon = L.divIcon({
    className: 'flag-marker',
    html: `
      <div class="flag-icon">
        <svg viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4h4v48h-4V4z" fill="#8d6e63" stroke="#5d4037" stroke-width="1"/>
          <path d="M8 4h28L24 20 36 36H8V4z" fill="#1976d2" stroke="#fff" stroke-width="1.5"/>
        </svg>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [3, 42]
  });

  // 365038 formatı: DDMMSS -> derece + dakika/60 + saniye/3600
  // 365038 = 36°50'38" = 36 + 50/60 + 38/3600
  function parseCompactDMS(val) {
    const n = parseFloat(String(val).trim());
    if (isNaN(n)) return null;
    const neg = n < 0;
    const abs = Math.abs(n);
    const deg = Math.floor(abs / 10000);
    const min = Math.floor((abs % 10000) / 100);
    const sec = abs % 100;
    let decimal = deg + min / 60 + sec / 3600;
    return neg ? -decimal : decimal;
  }

  // 365038 veya 41.0082 formatını parse et
  function parseCoordValue(val, type) {
    const str = String(val).trim();
    const n = parseFloat(str);
    if (isNaN(n)) return null;
    // 5+ basamaklı tam sayı -> compact DMS (365038, 303622, 1203645)
    if (Math.abs(n) >= 10000 && (Number.isInteger(n) || n % 1 === 0)) return parseCompactDMS(n);
    // Ondalık derece (küçük sayılar)
    if (type === 'lat' && n >= -90 && n <= 90) return n;
    if (type === 'lng' && n >= -180 && n <= 180) return n;
    return parseCompactDMS(n);
  }

  function addCoordinate(lat, lng) {
    const coord = { lat: parseFloat(lat), lng: parseFloat(lng) };
    coordinates.push(coord);
    renderCoordinateList();
    updateMap();
    updateStats();
  }

  function removeCoordinate(index) {
    coordinates.splice(index, 1);
    renderCoordinateList();
    updateMap();
    updateStats();
    if (coordinates.length === 0) stopAnimation();
  }

  function clearAll() {
    coordinates = [];
    stopAnimation();
    renderCoordinateList();
    updateMap();
    updateStats();
  }

  function renderCoordinateList() {
    const list = document.getElementById('coordinates-list');
    const emptyState = document.getElementById('empty-state');
    const coordCount = document.getElementById('coord-count');

    coordCount.textContent = coordinates.length;

    if (coordinates.length === 0) {
      list.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    list.innerHTML = coordinates.map((c, i) => `
      <li class="coord-item" data-index="${i}">
        <span class="coord-num">#${i + 1}</span>
        <span class="coord-text">${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}</span>
        <button class="btn-remove" data-index="${i}" aria-label="Kaldır">×</button>
      </li>
    `).join('');

    list.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCoordinate(parseInt(btn.dataset.index));
      });
    });
  }

  function updateMap() {
    if (routeLine) map.removeLayer(routeLine);
    if (shipMarker) map.removeLayer(shipMarker);
    coordMarkers.forEach(m => map.removeLayer(m));
    coordMarkers = [];
    routeLine = null;
    shipMarker = null;

    const overlay = document.getElementById('map-overlay');
    if (coordinates.length < 2) {
      overlay.classList.add('visible');
      return;
    }
    overlay.classList.remove('visible');

    // Harita overlay kaldırıldığında Leaflet'in boyutları yenilemesi gerekir
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      }
    }, 450);

    const latlngs = coordinates.map(c => [c.lat, c.lng]);
    routeLine = L.polyline(latlngs, {
      color: '#00d4ff',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    shipMarker = L.marker(latlngs[0], { icon: shipIcon }).addTo(map);

    // Her koordinata pin, varış noktasına bayrak
    latlngs.forEach((latlng, i) => {
      const isDestination = i === latlngs.length - 1;
      const icon = isDestination ? flagIcon : pinIcon;
      const m = L.marker(latlng, { icon }).addTo(map);
      coordMarkers.push(m);
    });
  }

  function updateStats() {
    document.getElementById('start-tracking').disabled = coordinates.length < 2;
  }

  function getPointAlongLine(latlngs, progress) {
    if (latlngs.length < 2) return latlngs[0];
    const totalLen = getTotalLength(latlngs);
    let target = progress * totalLen;
    let acc = 0;
    for (let i = 1; i < latlngs.length; i++) {
      const d = getDistance(latlngs[i - 1], latlngs[i]);
      if (acc + d >= target) {
        const t = (target - acc) / d;
        return [
          latlngs[i - 1][0] + t * (latlngs[i][0] - latlngs[i - 1][0]),
          latlngs[i - 1][1] + t * (latlngs[i][1] - latlngs[i - 1][1])
        ];
      }
      acc += d;
    }
    return latlngs[latlngs.length - 1];
  }

  function getDistance(a, b) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  }

  function getTotalLength(latlngs) {
    let len = 0;
    for (let i = 1; i < latlngs.length; i++) {
      len += getDistance(latlngs[i - 1], latlngs[i]);
    }
    return len;
  }

  function animateShip() {
    if (coordinates.length < 2 || isAnimating) return;
    isAnimating = true;
    document.getElementById('start-tracking').disabled = true;
    document.getElementById('start-tracking').innerHTML = '<span>⏸️ Durdur</span>';
    document.getElementById('start-tracking').id = 'stop-tracking-temp';

    const latlngs = coordinates.map(c => [c.lat, c.lng]);
    const duration = Math.max(8000, latlngs.length * 1200);
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const point = getPointAlongLine(latlngs, progress);
      shipMarker.setLatLng(point);

      if (progress < 1) {
        animationId = requestAnimationFrame(step);
      } else {
        finishAnimation();
      }
    }
    animationId = requestAnimationFrame(step);
  }

  function finishAnimation() {
    isAnimating = false;
    const btn = document.getElementById('stop-tracking-temp') || document.getElementById('start-tracking');
    if (btn) {
      btn.id = 'start-tracking';
      btn.innerHTML = '<span>🛥️ Takibi Başlat</span>';
      btn.disabled = false;
    }
  }

  function stopAnimation() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    isAnimating = false;
    const btn = document.getElementById('stop-tracking-temp') || document.getElementById('start-tracking');
    if (btn) {
      btn.id = 'start-tracking';
      btn.innerHTML = '<span>🛥️ Takibi Başlat</span>';
      btn.disabled = coordinates.length < 2;
    }
    if (coordinates.length > 0 && shipMarker) {
      shipMarker.setLatLng([coordinates[0].lat, coordinates[0].lng]);
    }
  }

  // Form gönderimi - 365038 303622 formatı (DDMMSS)
  document.getElementById('coordinate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const latVal = document.getElementById('lat-input').value.trim();
    const lngVal = document.getElementById('lng-input').value.trim();
    const lat = parseCoordValue(latVal, 'lat');
    const lng = parseCoordValue(lngVal, 'lng');
    if (lat === null || lng === null) {
      showToast('Geçerli koordinat girin. Örn: 365038 303622', 'error');
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showToast('Geçerli koordinat girin (Enlem: -90–90, Boylam: -180–180)', 'error');
      return;
    }
    addCoordinate(lat, lng);
    showToast(`Koordinat eklendi: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    document.getElementById('lat-input').value = '';
    document.getElementById('lng-input').value = '';
  });

  document.getElementById('start-tracking').addEventListener('click', () => {
    if (isAnimating) stopAnimation();
    else animateShip();
  });

  document.getElementById('clear-all').addEventListener('click', clearAll);

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  initMap();
  updateStats();
});
