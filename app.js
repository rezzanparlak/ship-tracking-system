// Gemi Takip Sistemi - Koordinat tabanlı harita takibi

document.addEventListener('DOMContentLoaded', () => {
  let map = null;
  let routeLine = null;
  let segmentLines = [];
  let coordMarkers = [];
  let coordinates = [];

  // Harita başlat
  function initMap() {
    map = L.map('map', { zoomControl: true }).setView([41.0082, 28.9784], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 100);
  }

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

  // DMS tek değer: 40° 52' 30" N, 405230N veya 40 52 30 N
  function parseDMSSingle(input) {
    const str = String(input).trim();
    if (!str) return null;
    // Boşlukla ayrılmış: 40 52 30 N veya 40 52 30N
    const spaceMatch = str.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s*([NSEW])$/i);
    if (spaceMatch) {
      const deg = parseInt(spaceMatch[1], 10);
      const min = parseInt(spaceMatch[2], 10);
      const sec = parseFloat(spaceMatch[3]);
      const dir = spaceMatch[4].toUpperCase();
      let decimal = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'W') decimal = -decimal;
      return decimal;
    }
    // DDMMSS formatı: 405230N, 291545E (6-7 rakam + yön)
    const ddmmssMatch = str.match(/^(\d{6,7})\s*([NSEW])$/i);
    if (ddmmssMatch) {
      const num = ddmmssMatch[1];
      const dir = ddmmssMatch[2].toUpperCase();
      let deg, min, sec;
      if (num.length === 6) {
        deg = parseInt(num.slice(0, 2), 10);
        min = parseInt(num.slice(2, 4), 10);
        sec = parseInt(num.slice(4, 6), 10);
      } else {
        deg = parseInt(num.slice(0, 3), 10);
        min = parseInt(num.slice(3, 5), 10);
        sec = parseInt(num.slice(5, 7), 10);
      }
      let decimal = deg + min / 60 + sec / 3600;
      if (dir === 'S' || dir === 'W') decimal = -decimal;
      return decimal;
    }
    // Klasik DMS: 40° 52' 30" N
    const dmsRegex = /(\d+)[°\sº]*\s*(\d+)['\s′]*\s*([\d.]+)["\s″]*\s*([NSEW])/i;
    const match = str.match(dmsRegex);
    if (!match) return null;
    const deg = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const sec = parseFloat(match[3]);
    const dir = match[4].toUpperCase();
    let decimal = deg + min / 60 + sec / 3600;
    if (dir === 'S' || dir === 'W') decimal = -decimal;
    return decimal;
  }

  // İki koordinat arası mesafe (Haversine) - deniz mili cinsinden
  function getDistanceNm(lat1, lng1, lat2, lng2) {
    const R = 6371000 / 1852; // Dünya yarıçapı (m) → Nm
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function addCoordinate(lat, lng) {
    const coord = { lat: parseFloat(lat), lng: parseFloat(lng) };
    coordinates.push(coord);
    renderCoordinateList();
    updateMap();
  }

  function removeCoordinate(index) {
    coordinates.splice(index, 1);
    renderCoordinateList();
    updateMap();
  }

  function clearAll() {
    coordinates = [];
    renderCoordinateList();
    updateMap();
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
    segmentLines.forEach(sl => map.removeLayer(sl));
    segmentLines = [];
    coordMarkers.forEach(m => map.removeLayer(m));
    coordMarkers = [];
    routeLine = null;

    const overlay = document.getElementById('map-overlay');
    if (coordinates.length < 2) {
      overlay.classList.add('visible');
      return;
    }
    overlay.classList.remove('visible');

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

    // Harita boyutları yenile
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      }
    }, 100);

    // Kümülatif mesafeler: pin i = başlangıçtan o noktaya kadar kat edilen toplam Nm
    const cumulativeNm = [0];
    for (let i = 0; i < latlngs.length - 1; i++) {
      const a = latlngs[i];
      const b = latlngs[i + 1];
      cumulativeNm.push(cumulativeNm[cumulativeNm.length - 1] + getDistanceNm(a[0], a[1], b[0], b[1]));
    }

    // Her koordinata pin, varış noktasına bayrak + hover'da toplam mesafe tooltip
    latlngs.forEach((latlng, i) => {
      const isDestination = i === latlngs.length - 1;
      const icon = isDestination ? flagIcon : pinIcon;
      const m = L.marker(latlng, { icon }).addTo(map);
      m.bindTooltip(`${cumulativeNm[i].toFixed(1)} Nm`, {
        permanent: false,
        direction: 'top',
        opacity: 0.95,
        className: 'pin-distance-tooltip'
      });
      coordMarkers.push(m);
    });

    // Her segment için hover'da mesafe (Nm) gösteren görünmez polyline
    for (let i = 0; i < latlngs.length - 1; i++) {
      const a = latlngs[i];
      const b = latlngs[i + 1];
      const nm = getDistanceNm(a[0], a[1], b[0], b[1]);
      const seg = L.polyline([a, b], {
        color: 'transparent',
        weight: 24,
        opacity: 0,
        interactive: true
      })
        .bindTooltip(`${nm.toFixed(1)} Nm`, {
          permanent: false,
          direction: 'top',
          opacity: 0.95,
          className: 'segment-distance-tooltip'
        })
        .addTo(map);
      segmentLines.push(seg);
    }
  }

  // Form gönderimi - DMS formatı (enlem/boylam ayrı)
  document.getElementById('coordinate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const latRaw = document.getElementById('dms-lat-input').value.trim();
    const lngRaw = document.getElementById('dms-lng-input').value.trim();
    if (!latRaw || !lngRaw) {
      showToast('Enlem ve boylam girin', 'error');
      return;
    }
    const lat = parseDMSSingle(latRaw);
    const lng = parseDMSSingle(lngRaw);
    if (lat === null) { showToast('Geçerli enlem girin. Örn: 40° 52\' 30" N', 'error'); return; }
    if (lng === null) { showToast('Geçerli boylam girin. Örn: 29° 15\' 45" E', 'error'); return; }
    const coord = { lat, lng };

    if (coord.lat < -90 || coord.lat > 90 || coord.lng < -180 || coord.lng > 180) {
      const badLat = coord.lat < -90 || coord.lat > 90;
      const badLng = coord.lng < -180 || coord.lng > 180;
      let msg = 'Geçersiz koordinat: ';
      if (badLat) msg += `Enlem ${coord.lat.toFixed(2)}° (-90–90 arası olmalı). `;
      if (badLng) msg += `Boylam ${coord.lng.toFixed(2)}° (-180–180 arası olmalı). `;
      showToast(msg, 'error');
      return;
    }
    addCoordinate(coord.lat, coord.lng);
    showToast(`Koordinat eklendi: ${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`);
    document.getElementById('dms-lat-input').value = '';
    document.getElementById('dms-lng-input').value = '';
  });

  document.getElementById('clear-all').addEventListener('click', clearAll);

  // Daily Distance: Ship speed × 24 (Nm/gün) | Voyage Duration: Distance / (Ship speed × 24) = gün
  function updateVoyageCalculations() {
    const distance = parseFloat(document.getElementById('distance-input').value);
    const speed = parseFloat(document.getElementById('ship-speed-input').value);
    const dailyEl = document.getElementById('daily-distance');
    const durationEl = document.getElementById('voyage-duration');

    // Daily Distance = Ship speed × 24 (knot = Nm/h → ×24 = Nm/gün)
    if (speed && speed > 0) {
      dailyEl.textContent = `${(speed * 24).toFixed(1)} Nm`;
    } else {
      dailyEl.textContent = '—';
    }

    // Voyage Duration = Distance / (Ship speed × 24)
    if (!distance || !speed || speed <= 0) {
      durationEl.textContent = '—';
      return;
    }
    const days = distance / (speed * 24);
    if (days >= 1) {
      durationEl.textContent = `${days.toFixed(2)} gün`;
    } else {
      const hours = days * 24;
      durationEl.textContent = `${hours.toFixed(1)} saat`;
    }
  }

  document.getElementById('distance-input').addEventListener('input', updateVoyageCalculations);
  document.getElementById('distance-input').addEventListener('change', updateVoyageCalculations);
  document.getElementById('ship-speed-input').addEventListener('input', updateVoyageCalculations);
  document.getElementById('ship-speed-input').addEventListener('change', updateVoyageCalculations);

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
});
