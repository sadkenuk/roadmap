// RoadMap — DfT STATS19 collision viewer for the New Forest
// Data proxied via /dft/ nginx route — no third-party CORS proxy needed

document.addEventListener('DOMContentLoaded', function () {

  if (typeof L === 'undefined') {
    document.getElementById('status-msg').innerHTML =
      '<span class="pulse err"></span>Error: Leaflet failed to load.';
    return;
  }
  if (typeof Papa === 'undefined') {
    document.getElementById('status-msg').innerHTML =
      '<span class="pulse err"></span>Error: PapaParse failed to load.';
    return;
  }

  // ── Constants ──────────────────────────────────────────────────
  const LYNDHURST = [50.8726, -1.5707];
  const YEARS     = [2019, 2020, 2021, 2022, 2023, 2024];

  // Expanded to cover all of Hampshire
  const BB = { n: 51.35, s: 50.68, e: -0.87, w: -1.95 };

  const SEV = {
    '1': { label: 'Fatal',   cls: 'fatal',   color: '#ff3b30', r: 9, key: 'fatal'   },
    '2': { label: 'Serious', cls: 'serious', color: '#ff9500', r: 7, key: 'serious' },
    '3': { label: 'Slight',  cls: 'slight',  color: '#ffd60a', r: 5, key: 'slight'  },
  };

  const ROAD_TYPE = {
    '1': 'Roundabout', '2': 'One-way street', '3': 'Dual carriageway',
    '6': 'Single carriageway', '7': 'Slip road', '9': 'Unknown', '12': 'One-way/slip road',
  };
  const LIGHT = {
    '1': 'Daylight', '4': 'Darkness — lit', '5': 'Darkness — unlit',
    '6': 'Darkness — no lighting', '7': 'Darkness — unknown lighting',
  };
  const WEATHER = {
    '1': 'Fine', '2': 'Raining', '3': 'Snowing', '4': 'Fine + high winds',
    '5': 'Rain + high winds', '6': 'Snow + high winds', '7': 'Fog / mist', '8': 'Other', '9': 'Unknown',
  };
  const SURFACE = {
    '1': 'Dry', '2': 'Wet / damp', '3': 'Snow', '4': 'Frost or ice',
    '5': 'Flood over road', '6': 'Oil or diesel', '7': 'Mud',
  };
  const JUNC = {
    '0': 'Not at junction', '1': 'Roundabout', '2': 'Mini-roundabout',
    '3': 'T or Y junction', '5': 'Slip road', '6': 'Crossroads',
    '7': 'Multiple junction', '8': 'Private entrance', '9': 'Other junction',
  };

  // ── State ──────────────────────────────────────────────────────
  const st = {
    selectedYear:  YEARS[YEARS.length - 1],
    vis:           { fatal: true, serious: true, slight: true },
    layerOn:       true,
    yearCounts:    {},
    loading:       false,
    hampshireRings: [],   // extracted polygon rings for point-in-polygon test
  };

  // ── Point-in-polygon (ray casting) ────────────────────────────
  // GeoJSON coords are [lng, lat] — we test against [lat, lng] from CSV
  function extractRings(geojson) {
    const rings = [];
    geojson.features.forEach(f => {
      const g = f.geometry;
      if (g.type === 'Polygon') {
        rings.push(g.coordinates[0]);       // outer ring only
      } else if (g.type === 'MultiPolygon') {
        g.coordinates.forEach(poly => rings.push(poly[0]));
      }
    });
    return rings;
  }

  function inHampshire(lat, lng) {
    if (!st.hampshireRings.length) return true;  // fallback: allow all if not loaded
    return st.hampshireRings.some(ring => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];  // [lng, lat]
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    });
  }

  const mGroups = { fatal: null, serious: null, slight: null };

  // ── Map ────────────────────────────────────────────────────────
  // Constrain to Hampshire — no point panning to wider UK
  const BOUNDS = L.latLngBounds(
    [BB.s - 0.05, BB.w - 0.1],
    [BB.n + 0.05, BB.e + 0.1]
  );

  const map = L.map('map', {
    center:     LYNDHURST,
    zoom:       10,
    minZoom:    9,        // far enough out to see all of Hampshire
    maxZoom:    18,
    maxBounds:  BOUNDS,
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/" target="_blank">CartoDB</a> &copy; <a href="https://openstreetmap.org/copyright" target="_blank">OSM</a>',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.circleMarker(LYNDHURST, {
    radius: 6, color: '#4d9de0', fillColor: '#4d9de0', fillOpacity: 0.9, weight: 2,
  }).bindTooltip('Lyndhurst', { permanent: false, direction: 'right' }).addTo(map);

  // ── Hampshire boundary ─────────────────────────────────────────
  // Bundled locally — no external dependency, always loads instantly
  fetch('/data/hampshire.geojson')
    .then(r => r.json())
    .then(geojson => {
      st.hampshireRings = extractRings(geojson);
      L.geoJSON(geojson, {
        style: {
          color:       '#4d9de0',
          weight:      1.5,
          opacity:     1.0,
          fillColor:   '#4d9de0',
          fillOpacity: 0.04,
          dashArray:   '4 4',
        },
      }).addTo(map);
    })
    .catch(() => {
      // Boundary is cosmetic — silently ignore if fetch fails
    });

  map.on('mousemove', e => {
    document.getElementById('coord').textContent =
      `${e.latlng.lat.toFixed(4)}°N  ${e.latlng.lng.toFixed(4)}°`;
  });

  // ── Year selector ──────────────────────────────────────────────
  function buildYearSelector() {
    const el = document.getElementById('yr-selector');
    el.innerHTML = '';
    [...YEARS].reverse().forEach(y => {
      const btn = document.createElement('div');
      btn.className = 'year-btn' + (y === st.selectedYear ? ' selected' : '');
      btn.textContent = y;
      btn.dataset.y = y;
      btn.addEventListener('click', () => {
        if (st.loading || +btn.dataset.y === st.selectedYear) return;
        st.selectedYear = +btn.dataset.y;
        el.querySelectorAll('.year-btn').forEach(b =>
          b.classList.toggle('selected', +b.dataset.y === st.selectedYear));
        loadYear(st.selectedYear);
      });
      el.appendChild(btn);
    });
  }

  // ── Layer toggle ───────────────────────────────────────────────
  document.getElementById('toggle-stats19').addEventListener('click', e => {
    e.stopPropagation();
    st.layerOn = !st.layerOn;
    document.getElementById('layer-stats19').classList.toggle('active', st.layerOn);
    ['fatal', 'serious', 'slight'].forEach(k => {
      if (!mGroups[k]) return;
      st.layerOn && st.vis[k] ? mGroups[k].addTo(map) : map.removeLayer(mGroups[k]);
    });
  });

  ['fatal', 'serious', 'slight'].forEach(k => {
    document.getElementById(`sev-${k}`).addEventListener('click', () => {
      st.vis[k] = !st.vis[k];
      document.getElementById(`sev-${k}`).classList.toggle('off', !st.vis[k]);
      if (!mGroups[k]) return;
      st.vis[k] && st.layerOn ? mGroups[k].addTo(map) : map.removeLayer(mGroups[k]);
    });
  });

  // ── Load a year (+ previous for comparison) ────────────────────
  async function loadYear(year) {
    st.loading = true;
    clearMarkers();
    setLoading(true, `Loading ${year}…`, 'Filtering to New Forest area');
    setProgress(5);

    mGroups.fatal   = makeClusterGroup('fatal',   '#ff3b30');
    mGroups.serious = makeClusterGroup('serious', '#ff9500');
    mGroups.slight  = makeClusterGroup('slight',  '#ffd60a');

    // Always fetch selected year + previous for trend comparison
    const prevYear = year - 1;
    const hasPrev  = YEARS.includes(prevYear);

    try {
      // Fetch selected year (builds map markers + counts)
      await fetchYear(year, true);
      setProgress(hasPrev ? 60 : 95);

      // Fetch previous year (counts only — no markers)
      if (hasPrev) {
        setLoadingText(`Loading ${prevYear} for comparison…`, '');
        if (!st.yearCounts[prevYear]) {
          await fetchYear(prevYear, false);
        }
        setProgress(95);
      }
    } catch (err) {
      status(`⚠ Error: ${err.message}`, true);
    }

    // Add map layers
    ['fatal', 'serious', 'slight'].forEach(k => {
      if (st.layerOn && st.vis[k]) mGroups[k].addTo(map);
    });

    updateHeaderCounts(year);
    updateSidebarCounts(year);
    renderTrend(year, hasPrev ? prevYear : null);

    setProgress(100);
    setTimeout(() => setProgress(0), 600);

    const c = st.yearCounts[year] || { fatal: 0, serious: 0, slight: 0 };
    const total = c.fatal + c.serious + c.slight;
    status(`${total.toLocaleString()} collisions in ${year} · Hampshire`);

    setLoading(false);
    st.loading = false;
  }

  function fetchYear(year, buildMarkers) {
    return new Promise((resolve, reject) => {
      const url = `/dft/road-accidents-safety-data/dft-road-casualty-statistics-collision-${year}.csv`;
      let rows = 0;
      st.yearCounts[year] = { fatal: 0, serious: 0, slight: 0 };

      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: true,
        step(result) {
          rows++;
          const r   = result.data;
          const lat = parseFloat(r.latitude);
          const lon = parseFloat(r.longitude);
          if (!isNaN(lat) && !isNaN(lon) &&
              lat >= BB.s && lat <= BB.n &&
              lon >= BB.w && lon <= BB.e &&
              inHampshire(lat, lon)) {
            const sev = SEV[r.accident_severity] || SEV['3'];
            st.yearCounts[year][sev.key]++;
            if (buildMarkers) mGroups[sev.key].addLayer(makeMarker(r, sev));
          }
          if (rows % 10000 === 0) {
            status(`Scanning ${year}… ${rows.toLocaleString()} rows`);
          }
        },
        complete() { resolve(rows); },
        error(err)  { reject(new Error(String(err))); },
      });
    });
  }

  // ── Trend panel ────────────────────────────────────────────────
  function renderTrend(year, prevYear) {
    const panel = document.getElementById('trend-panel');
    const c     = st.yearCounts[year]     || { fatal: 0, serious: 0, slight: 0 };
    const p     = prevYear ? (st.yearCounts[prevYear] || { fatal: 0, serious: 0, slight: 0 }) : null;

    const rows = ['fatal', 'serious', 'slight'].map(k => {
      const cur  = c[k];
      const prev = p ? p[k] : null;
      const diff = prev !== null ? cur - prev : null;
      const pct  = (prev && prev > 0) ? Math.round((diff / prev) * 100) : null;

      // For road safety: down = good (green), up = bad (red)
      let changeHtml = '';
      if (diff !== null) {
        const dir   = diff < 0 ? 'down' : diff > 0 ? 'up' : 'flat';
        const arrow = diff < 0 ? '↓' : diff > 0 ? '↑' : '→';
        const cls   = diff < 0 ? 'trend-good' : diff > 0 ? 'trend-bad' : 'trend-flat';
        const label = diff === 0 ? 'No change'
          : `${arrow} ${Math.abs(diff)} (${pct !== null ? (pct > 0 ? '+' : '') + pct + '%' : ''})`;
        changeHtml = `<span class="trend-change ${cls}">${label}</span>`;
      }

      const sevColor = { fatal: 'var(--fatal)', serious: 'var(--serious)', slight: 'var(--slight)' }[k];

      return `
        <div class="trend-row">
          <div class="trend-sev" style="color:${sevColor}">${k.charAt(0).toUpperCase() + k.slice(1)}</div>
          <div class="trend-counts">
            <span class="trend-cur" style="color:${sevColor}">${cur}</span>
            ${prev !== null ? `<span class="trend-prev">${prevYear}: ${prev}</span>` : ''}
          </div>
          ${changeHtml}
        </div>`;
    }).join('');

    const totalCur  = c.fatal + c.serious + c.slight;
    const totalPrev = p ? (p.fatal + p.serious + p.slight) : null;
    const totalDiff = totalPrev !== null ? totalCur - totalPrev : null;
    const totalPct  = (totalPrev && totalPrev > 0) ? Math.round((totalDiff / totalPrev) * 100) : null;
    const totalCls  = totalDiff < 0 ? 'trend-good' : totalDiff > 0 ? 'trend-bad' : 'trend-flat';
    const totalArrow = totalDiff < 0 ? '↓' : totalDiff > 0 ? '↑' : '→';

    document.getElementById('trend-section').style.display = 'block';
    panel.innerHTML = `
      <div class="trend-header">
        <span class="trend-year">${year}</span>
        ${prevYear ? `<span class="trend-vs">vs ${prevYear}</span>` : ''}
        ${totalDiff !== null ? `<span class="trend-total ${totalCls}">${totalArrow} ${Math.abs(totalDiff)} total (${totalPct !== null ? (totalPct > 0 ? '+' : '') + totalPct + '%' : ''})</span>` : ''}
      </div>
      ${rows}
    `;
    panel.style.display = 'block';
  }

  // ── Markers ────────────────────────────────────────────────────
  function makeClusterGroup(key, color) {
    const rgb = hexRgb(color);
    return L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        const n = cluster.getChildCount();
        const label = n < 1000 ? n : Math.round(n / 100) + 'h';
        return L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;border-radius:50%;background:rgba(${rgb},0.14);border:1.5px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;">${label}</div>`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        });
      },
    });
  }

  function makeMarker(r, sev) {
    const fo = sev.key === 'fatal' ? 0.85 : sev.key === 'serious' ? 0.75 : 0.55;
    const m  = L.circleMarker([parseFloat(r.latitude), parseFloat(r.longitude)], {
      radius: sev.r, color: sev.color, fillColor: sev.color,
      fillOpacity: fo, weight: sev.key === 'fatal' ? 2 : 1, opacity: 0.9,
    });
    m.bindPopup(() => buildPopup(r, sev), { maxWidth: 300, minWidth: 220 });
    return m;
  }

  function buildPopup(r, sev) {
    const d    = decodeRow(r);
    const junc = (r.junction_detail && r.junction_detail !== '0')
      ? `<div class="popup-row"><div class="popup-icon">🔀</div><div class="popup-val">${d.junc}</div></div>` : '';

    return `<div class="popup">
      <div class="popup-head c-${sev.key}">${sev.label} Collision<div class="bar b-${sev.key}"></div></div>
      <div class="popup-row"><div class="popup-icon">📅</div><div class="popup-val"><strong>${fmtDate(r.date)}</strong>&ensp;${r.time || '—'}</div></div>
      <div class="popup-row"><div class="popup-icon">🛣️</div><div class="popup-val">${d.road} · ${r.speed_limit || '?'}mph</div></div>
      ${junc}
      <div class="popup-row"><div class="popup-icon">🚗</div><div class="popup-val"><strong>${r.number_of_vehicles || '?'}</strong> vehicle${r.number_of_vehicles == 1 ? '' : 's'} · <strong>${r.number_of_casualties || '?'}</strong> casualt${r.number_of_casualties == 1 ? 'y' : 'ies'}</div></div>
      <hr class="popup-hr">
      <div class="popup-row"><div class="popup-icon">☀️</div><div class="popup-val">${d.light} · ${d.weather}</div></div>
      <div class="popup-row"><div class="popup-icon">🛤️</div><div class="popup-val">Surface: ${d.surface}</div></div>
      ${r.urban_or_rural_area ? `<div class="popup-row"><div class="popup-icon">🗺️</div><div class="popup-val">${r.urban_or_rural_area === '1' ? 'Urban' : 'Rural'} area</div></div>` : ''}
      <div class="popup-ref">REF: ${r.accident_reference || r.accident_index || 'N/A'}</div>
    </div>`;
  }

  function decodeRow(r) {
    return {
      road:    ROAD_TYPE[r.road_type]             || 'Unknown road',
      light:   LIGHT[r.light_conditions]          || 'Unknown light',
      weather: WEATHER[r.weather_conditions]      || 'Unknown weather',
      surface: SURFACE[r.road_surface_conditions] || 'Unknown surface',
      junc:    JUNC[r.junction_detail]            || 'Junction',
    };
  }

  function fmtDate(s) {
    if (!s) return '—';
    try {
      const d = s.includes('/')
        ? (() => { const p = s.split('/'); return new Date(`${p[2]}-${p[1]}-${p[0]}`); })()
        : new Date(s);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return s; }
  }

  // ── UI helpers ─────────────────────────────────────────────────
  function clearMarkers() {
    ['fatal', 'serious', 'slight'].forEach(k => {
      if (mGroups[k]) { map.removeLayer(mGroups[k]); mGroups[k] = null; }
    });
  }

  function updateHeaderCounts(year) {
    const c = st.yearCounts[year] || { fatal: 0, serious: 0, slight: 0 };
    document.getElementById('hs-fatal').textContent   = c.fatal   || '—';
    document.getElementById('hs-serious').textContent = c.serious || '—';
    document.getElementById('hs-slight').textContent  = c.slight  || '—';
  }

  function updateSidebarCounts(year) {
    const c = st.yearCounts[year] || { fatal: 0, serious: 0, slight: 0 };
    document.getElementById('cnt-fatal').textContent   = c.fatal.toLocaleString();
    document.getElementById('cnt-serious').textContent = c.serious.toLocaleString();
    document.getElementById('cnt-slight').textContent  = c.slight.toLocaleString();
  }

  function setLoading(show, text, sub) {
    document.getElementById('loading-overlay').classList.toggle('show', show);
    if (text) setLoadingText(text, sub || '');
  }

  function setLoadingText(t, s) {
    document.getElementById('loading-text').textContent = t;
    document.getElementById('loading-sub').textContent  = s || '';
  }

  function setProgress(pct) {
    document.getElementById('progress').style.width = pct + '%';
  }

  function status(msg, err) {
    document.getElementById('status-msg').innerHTML =
      `<span class="pulse${err ? ' err' : ''}"></span>${msg}`;
  }

  function hexRgb(h) {
    return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;
  }

  // Keyboard: left/right arrows to step through years
  document.addEventListener('keydown', e => {
    if (st.loading) return;
    const idx = YEARS.indexOf(st.selectedYear);
    if (e.key === 'ArrowRight' && idx < YEARS.length - 1) {
      st.selectedYear = YEARS[idx + 1];
      buildYearSelector();
      loadYear(st.selectedYear);
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      st.selectedYear = YEARS[idx - 1];
      buildYearSelector();
      loadYear(st.selectedYear);
    }
  });

  // ── Init ───────────────────────────────────────────────────────
  buildYearSelector();
  status(`Loading ${st.selectedYear} data…`);
  loadYear(st.selectedYear);

}); // end DOMContentLoaded
