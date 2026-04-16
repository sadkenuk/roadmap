// RoadMap — DfT STATS19 collision viewer for the New Forest
// Data fetched via /dft/ nginx proxy (avoids CORS, no third-party proxy needed)

document.addEventListener('DOMContentLoaded', function () {

  // Guard: if CDN scripts failed to load
  if (typeof L === 'undefined') {
    document.getElementById('status-msg').innerHTML =
      '<span class="pulse err"></span>Error: Leaflet failed to load — check network connection.';
    return;
  }
  if (typeof Papa === 'undefined') {
    document.getElementById('status-msg').innerHTML =
      '<span class="pulse err"></span>Error: PapaParse failed to load — check network connection.';
    return;
  }

  // ── Constants ──────────────────────────────────────────────────
  const LYNDHURST = [50.8726, -1.5707];
  const YEARS     = [2019, 2020, 2021, 2022, 2023, 2024];

  // New Forest bounding box
  const BB = { n: 51.05, s: 50.70, e: -1.15, w: -1.95 };

  const SEV = {
    '1': { label: 'Fatal',   cls: 'fatal',   color: '#ff3b30', r: 9, key: 'fatal'   },
    '2': { label: 'Serious', cls: 'serious', color: '#ff9500', r: 7, key: 'serious' },
    '3': { label: 'Slight',  cls: 'slight',  color: '#ffd60a', r: 5, key: 'slight'  },
  };

  const ROAD_TYPE = {
    '1': 'Roundabout', '2': 'One-way street', '3': 'Dual carriageway',
    '6': 'Single carriageway', '7': 'Slip road', '9': 'Unknown road type', '12': 'One-way/slip road',
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
    singleYear: 2024,
    multiMode:  false,
    fromYear:   2020,
    toYear:     2024,
    vis:        { fatal: true, serious: true, slight: true },
    layerOn:    true,
    counts:     { fatal: 0, serious: 0, slight: 0 },
  };

  const mGroups = { fatal: null, serious: null, slight: null };

  // ── Map ────────────────────────────────────────────────────────
  const map = L.map('map', {
    center: LYNDHURST, zoom: 12,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_matter_no_labels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/" target="_blank">CartoDB</a> &copy; <a href="https://openstreetmap.org/copyright" target="_blank">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_matter_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19, opacity: 0.7,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Village centre marker
  L.circleMarker(LYNDHURST, {
    radius: 6, color: '#4d9de0', fillColor: '#4d9de0', fillOpacity: 0.9, weight: 2,
  }).bindTooltip('Lyndhurst', { permanent: false, direction: 'right' }).addTo(map);

  // Coordinates in status bar
  map.on('mousemove', e => {
    document.getElementById('coord').textContent =
      `${e.latlng.lat.toFixed(4)}°N  ${e.latlng.lng.toFixed(4)}°`;
  });

  // ── Year selector UI ───────────────────────────────────────────
  function buildYearSelectors() {
    const single = document.getElementById('yr-single');
    const from   = document.getElementById('yr-from');
    const to     = document.getElementById('yr-to');

    [...YEARS].reverse().forEach(y => {
      single.appendChild(makeYrBtn(y, y === st.singleYear, () => {
        st.singleYear = y;
        single.querySelectorAll('.year-btn').forEach(b =>
          b.classList.toggle('selected', +b.dataset.y === y));
      }));
    });

    YEARS.forEach(y => {
      from.appendChild(makeYrBtn(y, y === st.fromYear, () => {
        st.fromYear = y;
        from.querySelectorAll('.year-btn').forEach(b =>
          b.classList.toggle('selected', +b.dataset.y === y));
      }));
      to.appendChild(makeYrBtn(y, y === st.toYear, () => {
        st.toYear = y;
        to.querySelectorAll('.year-btn').forEach(b =>
          b.classList.toggle('selected', +b.dataset.y === y));
      }));
    });
  }

  function makeYrBtn(y, active, cb) {
    const el = document.createElement('div');
    el.className = 'year-btn' + (active ? ' selected' : '');
    el.textContent = y;
    el.dataset.y = y;
    el.addEventListener('click', cb);
    return el;
  }

  document.getElementById('multi-toggle').addEventListener('click', () => {
    st.multiMode = !st.multiMode;
    document.getElementById('multi-toggle').classList.toggle('open', st.multiMode);
    document.getElementById('yr-range-panel').style.display = st.multiMode ? 'block' : 'none';
    document.getElementById('yr-single').style.display      = st.multiMode ? 'none'  : 'flex';
  });

  buildYearSelectors();

  // ── Controls ───────────────────────────────────────────────────
  document.getElementById('load-btn').addEventListener('click', loadStats19);
  document.getElementById('clear-btn').addEventListener('click', () => clearAll(true));

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

  // ── Data loading ───────────────────────────────────────────────
  function yearsToLoad() {
    if (!st.multiMode) return [st.singleYear];
    const lo = Math.min(st.fromYear, st.toYear);
    const hi = Math.max(st.fromYear, st.toYear);
    return YEARS.filter(y => y >= lo && y <= hi);
  }

  async function loadStats19() {
    const years = yearsToLoad();
    clearAll(false);
    setLoading(true, `Loading ${years.length > 1 ? years[0] + '–' + years[years.length - 1] : years[0]}…`);
    setBtn(true);
    setProgress(5);

    mGroups.fatal   = makeClusterGroup('fatal',   '#ff3b30');
    mGroups.serious = makeClusterGroup('serious', '#ff9500');
    mGroups.slight  = makeClusterGroup('slight',  '#ffd60a');

    for (let i = 0; i < years.length; i++) {
      setProgress(5 + (i / years.length) * 85);
      setLoadingText(`Loading ${years[i]}…`, `Year ${i + 1} of ${years.length}`);
      try {
        await fetchYear(years[i]);
      } catch (err) {
        status(`⚠ ${years[i]}: ${err.message}`, true);
      }
    }

    ['fatal', 'serious', 'slight'].forEach(k => {
      if (st.layerOn && st.vis[k]) mGroups[k].addTo(map);
    });

    updateCounts();
    setProgress(100);
    setTimeout(() => setProgress(0), 700);

    const total = st.counts.fatal + st.counts.serious + st.counts.slight;
    const yStr  = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0];
    status(`${total.toLocaleString()} collisions loaded for ${yStr} · New Forest area`);
    setLoading(false);
    setBtn(false);
    document.getElementById('clear-btn').style.display = 'block';
  }

  function fetchYear(year) {
    return new Promise((resolve, reject) => {
      // Proxied via nginx /dft/ → data.dft.gov.uk — no CORS issues, no third-party proxy
      const url = `/dft/road-accidents-safety-data/dft-road-casualty-statistics-collision-${year}.csv`;
      let rows = 0;

      Papa.parse(url, {
        download:       true,
        header:         true,
        skipEmptyLines: true,
        step(result) {
          rows++;
          const r   = result.data;
          const lat = parseFloat(r.latitude);
          const lon = parseFloat(r.longitude);
          if (!isNaN(lat) && !isNaN(lon) &&
              lat >= BB.s && lat <= BB.n &&
              lon >= BB.w && lon <= BB.e) {
            const sev = SEV[r.accident_severity] || SEV['3'];
            mGroups[sev.key].addLayer(makeMarker(r, sev));
            st.counts[sev.key]++;
          }
          if (rows % 8000 === 0) {
            updateCounts();
            status(`Scanning ${year}… ${rows.toLocaleString()} rows checked`);
          }
        },
        complete() { updateCounts(); resolve(rows); },
        error(err)  { reject(new Error(String(err))); },
      });
    });
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
    const date = fmtDate(r.date);
    const time = r.time || '—';
    const junc = (r.junction_detail && r.junction_detail !== '0')
      ? `<div class="popup-row"><div class="popup-icon">🔀</div><div class="popup-val">${d.junc}</div></div>` : '';

    return `<div class="popup">
      <div class="popup-head c-${sev.key}">${sev.label} Collision<div class="bar b-${sev.key}"></div></div>
      <div class="popup-row"><div class="popup-icon">📅</div><div class="popup-val"><strong>${date}</strong>&ensp;${time}</div></div>
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
  function clearAll(resetUI) {
    ['fatal', 'serious', 'slight'].forEach(k => {
      if (mGroups[k]) { map.removeLayer(mGroups[k]); mGroups[k] = null; }
    });
    st.counts = { fatal: 0, serious: 0, slight: 0 };
    updateCounts();
    if (resetUI) {
      document.getElementById('clear-btn').style.display = 'none';
      status('Map cleared — select a year and click Load Data');
    }
  }

  function updateCounts() {
    const { fatal, serious, slight } = st.counts;
    document.getElementById('cnt-fatal').textContent   = fatal.toLocaleString();
    document.getElementById('cnt-serious').textContent = serious.toLocaleString();
    document.getElementById('cnt-slight').textContent  = slight.toLocaleString();
    document.getElementById('hs-fatal').textContent    = fatal   || '—';
    document.getElementById('hs-serious').textContent  = serious || '—';
    document.getElementById('hs-slight').textContent   = slight  || '—';
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

  function setBtn(loading) {
    const b = document.getElementById('load-btn');
    b.disabled    = loading;
    b.textContent = loading ? 'Loading…' : 'Load Data';
  }

  function status(msg, err) {
    document.getElementById('status-msg').innerHTML =
      `<span class="pulse${err ? ' err' : ''}"></span>${msg}`;
  }

  function hexRgb(h) {
    return `${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;
  }

  // Keyboard shortcut: L = load
  document.addEventListener('keydown', e => {
    if ((e.key === 'l' || e.key === 'L') && !document.getElementById('load-btn').disabled) {
      loadStats19();
    }
  });

  status('Ready — select a year and click Load Data');

}); // end DOMContentLoaded
