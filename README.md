# RoadMap

**Road collision data for Hampshire, visualised.**

A free, community-built web app that plots DfT STATS19 injury collision data across Hampshire, Southampton City and Portsmouth City on an interactive dark-theme map. Filter by year and severity, compare year-on-year trends, and toggle coverage areas — all from public government data that most people don't know how to access.

**Live at → [roadmap.sadken.co.uk](https://roadmap.sadken.co.uk)**  
Part of the [sadken.co.uk](https://sadken.co.uk) community data project. Read more on the [blog](https://blog.sadken.co.uk).

---

## Features

- **STATS19 collision data** — 2019–present (DfT open dataset, updated annually)
- **Severity filter** — Fatal / Serious / Slight, independently toggleable
- **Coverage areas** — Hampshire, Southampton City and Portsmouth City as separate toggleable layers, each with its own boundary overlay
- **Year selector** — tap any year to load; arrow keys to step through
- **Year-on-year trend panel** — compares selected year vs previous, with ↑↓ indicators (green = fewer collisions = good)
- **Popup detail** — click any collision marker for date, time, road type, speed limit, weather, surface conditions and reference
- **Precise boundary filtering** — point-in-polygon against ONS county/UA boundaries; no data bleed into IoW, Dorset or Wiltshire
- **About overlay** — explains data provenance, limitations and community context
- **Responsive** — works on mobile and desktop

---

## Data Sources

| Dataset | Source | Licence | Notes |
|---|---|---|---|
| STATS19 Collision Records | [DfT Open Data](https://www.gov.uk/government/statistical-data-sets/road-safety-open-data) | Open Government Licence | Injury collisions reported to police; published ~12–18 months after year end |
| Hampshire County Boundary | [ONS Open Geography Portal](https://geoportal.statistics.gov.uk) | Open Government Licence | Counties and Unitary Authorities (May 2023), simplified to 4dp |
| Southampton City Boundary | ONS Open Geography Portal | Open Government Licence | As above |
| Portsmouth City Boundary | ONS Open Geography Portal | Open Government Licence | As above |
| Map tiles | [CartoDB](https://carto.com/basemaps/) | © CartoDB, © OpenStreetMap contributors | dark_all style |

---

## Architecture

Pure vanilla JS — no build step, no framework, no npm.

```
roadmap/
├── index.html          # Single-page app shell
├── js/app.js           # All application logic (~500 lines)
├── css/style.css       # Dark theme styles
├── data/
│   └── hampshire.geojson  # Bundled ONS boundaries (Hampshire + Southampton + Portsmouth)
├── favicon.svg         # Map-pin favicon in Sadken blue
├── nginx.conf          # Reverse proxy: /dft/ → data.dft.gov.uk
└── Dockerfile          # nginx:1.27-alpine
```

**Key libraries** (CDN, no local install):
- [Leaflet 1.9.4](https://leafletjs.com/) — mapping
- [Leaflet.markercluster 1.5.3](https://github.com/Leaflet/Leaflet.markercluster) — collision clustering
- [PapaParse 5.4.1](https://www.papaparse.com/) — streaming CSV parsing (national DfT files are ~20MB)

**CORS solution:** nginx proxies `/dft/` to `https://data.dft.gov.uk` — no third-party proxy dependency.

**Boundary filtering:** Bounding-box pre-filter (fast) → ray-casting point-in-polygon per area (precise). Collisions are assigned to exactly one of the three areas (Hampshire / Southampton / Portsmouth), enabling independent toggling.

---

## Running Locally

```bash
# Build and run
docker build -t roadmap .
docker run -p 8082:80 roadmap

# Open
open http://localhost:8082
```

---

## Deployment

Deployed on a Hetzner VPS via GitHub Actions on every push to `main`.

The [universal deploy script](https://github.com/sadkenuk/homeserver/blob/main/deploy.sh) handles:
1. Cloudflare DNS CNAME creation
2. Docker image build
3. Traefik reverse proxy config (HTTPS via Let's Encrypt / Cloudflare DNS challenge)
4. Container restart

Required GitHub Actions secrets: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`.

---

## Planned Data Layers

| Layer | Status | Source |
|---|---|---|
| 🦌 Animal Road Incidents (New Forest) | FOI pending — Hampshire Constabulary | Date/location/animal type for commoners' animals on roads |
| 📷 Speed Camera Sites | FOI pending — Hampshire & IoW Safety Camera Partnership | Locations + installation dates for before/after collision analysis |
| 🚗 Community Speedwatch Sessions | Planned | Hampshire Constabulary volunteer speed recording programme |
| 🚧 Street Manager Roadworks | Planned | DfT Street Manager open data API |
| 🌡️ Weather Correlation | Planned | Met Office historic weather data |

---

## Limitations

- Only **injury collisions** attended by police are recorded in STATS19 — near-misses and damage-only incidents are excluded
- Data is **historical, not live** — published annually, typically 12–18 months after year end
- Location precision depends on the attending officer's GPS accuracy
- Pre-2019 year files may be unavailable depending on DfT hosting (the app probes and hides unavailable years automatically)
- This tool is in **Beta** — expect changes

---

## Licence

Application code: MIT  
Data: see table above — all open data under Open Government Licence or equivalent

---

*Built with ♥ for the Lyndhurst & New Forest community. [sadken.co.uk](https://sadken.co.uk)*
