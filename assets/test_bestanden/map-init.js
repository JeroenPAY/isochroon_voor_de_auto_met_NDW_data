// map-init.js - Initialiseert de kaart en basis lagen

// Globale variabelen
let map;
let gemeenteData = null;
let grenzenZichtbaar = true;

// Initialiseer de kaart
function initMap() {
    map = new maplibregl.Map({
        container: "map",
        style: {
            version: 8,
            glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
            sources: {
                satellite: {
                    type: "raster",
                    tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"],
                    tileSize: 256
                },
                rvm_segments: {
                    type: "vector",
                    tiles: ["https://maps.ndw.nu/api/v1/nwb/latest/mbtiles/roadSections/tiles/{z}/{x}/{y}.pbf"],
                    maxzoom: 14
                }
            },
            layers: [
                {
                    id: "background",
                    type: "raster",
                    source: "satellite",
                    paint: { "raster-opacity": 0.85, "raster-saturation": -0.7 }
                },
                {
                    id: "rvm-lines",
                    type: "line",
                    source: "rvm_segments",
                    "source-layer": "roadSections",
                    paint: { "line-color": "#f97316", "line-width": 2.5, "line-opacity": 0.95 },
                    filter: ["==", ["get", "municipalityName"], "Helmond"]
                }
            ]
        },
        center: [5.387, 52.156],
        zoom: 9
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    
    // NDW popup bij klikken op wegvak
    map.on('click', 'rvm-lines', (e) => {
        const p = e.features[0].properties;
        let html = `<strong>🛣️ NDW Wegvak</strong><hr>`;
        ['roadSectionId', 'municipalityName', 'drivingDirection', 'carriagewayTypeCode', 'roadNumber'].forEach(k => {
            if (p[k]) html += `<b>${k}:</b> ${p[k]}<br>`;
        });
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    
    map.on('mouseenter', 'rvm-lines', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'rvm-lines', () => { map.getCanvas().style.cursor = ''; });
    
    return map;
}

// Laad gemeentegrenzen van PDOK WFS
async function loadMunicipalities() {
    setStatus("Gemeentegrenzen laden...", false);
    
    proj4.defs("EPSG:28992", "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.2369,50.0087,465.658,-0.406857,0.350733,-1.87035,4.0812 +units=m +no_defs");
    const rdToWgs84 = proj4("EPSG:28992", "EPSG:4326");
    
    const url = "https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0?service=WFS&version=2.0.0&request=GetFeature&typeName=bestuurlijkegebieden:Gemeentegebied&outputFormat=application/json&srsName=EPSG:28992";
    
    const response = await fetch(url);
    const data = await response.json();
    
    function convertCoords(coords) {
        if (typeof coords[0] === 'number') {
            return rdToWgs84.forward([coords[0], coords[1]]);
        }
        return coords.map(c => convertCoords(c));
    }
    
    const features = data.features.map(f => {
        const geom = f.geometry;
        let newCoords;
        if (geom.type === 'Polygon') {
            newCoords = geom.coordinates.map(ring => convertCoords(ring));
        } else {
            newCoords = geom.coordinates.map(poly => poly.map(ring => convertCoords(ring)));
        }
        return {
            type: "Feature",
            properties: { naam: f.properties.naam, code: f.properties.code, identificatie: f.properties.identificatie },
            geometry: { type: geom.type, coordinates: newCoords }
        };
    });
    
    gemeenteData = { type: "FeatureCollection", features: features };
    
    if (map.getSource('gemeenten')) {
        map.getSource('gemeenten').setData(gemeenteData);
    } else {
        map.addSource('gemeenten', { type: 'geojson', data: gemeenteData });
    }
    
    // Verwijder oude lagen
    ['gemeente-fill', 'gemeente-outline', 'gemeente-labels'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
    });
    
    map.addLayer({
        id: 'gemeente-fill',
        type: 'fill',
        source: 'gemeenten',
        paint: { 'fill-color': '#86efac', 'fill-opacity': 0.55, 'fill-outline-color': '#166534' }
    });
    
    map.addLayer({
        id: 'gemeente-outline',
        type: 'line',
        source: 'gemeenten',
        paint: { 'line-color': '#22c55e', 'line-width': 2 }
    });
    
    map.addLayer({
        id: 'gemeente-labels',
        type: 'symbol',
        source: 'gemeenten',
        layout: {
            'text-field': ['get', 'naam'],
            'text-font': ['Open Sans Regular'],
            'text-size': 12,
            'text-anchor': 'center'
        },
        paint: { 'text-color': '#1a3a2a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
    });
    
    setStatus(`${features.length} gemeenten geladen!`, false);
    return gemeenteData;
}

// Statusmelding functie
function setStatus(text, isError = false) {
    const el = document.getElementById("statusMsg");
    if (!el) return;
    el.style.backgroundColor = isError ? "#b91c1c" : "#0f172a";
    el.innerText = isError ? `⚠️ ${text}` : `✓ ${text}`;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 3000);
}

// Toggle functie voor gemeentegrenzen
function toggleGrenzen() {
    const fillLayer = map.getLayer('gemeente-fill');
    const outlineLayer = map.getLayer('gemeente-outline');
    const labelsLayer = map.getLayer('gemeente-labels');
    
    if (grenzenZichtbaar) {
        if (fillLayer) map.setLayoutProperty('gemeente-fill', 'visibility', 'none');
        if (outlineLayer) map.setLayoutProperty('gemeente-outline', 'visibility', 'none');
        if (labelsLayer) map.setLayoutProperty('gemeente-labels', 'visibility', 'none');
        grenzenZichtbaar = false;
        const btn = document.getElementById('toggleGrenzenBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined">layers</span> Toon grenzen';
            btn.style.background = '#2c3e66';
        }
        setStatus('Gemeentegrenzen verborgen', false);
    } else {
        if (fillLayer) map.setLayoutProperty('gemeente-fill', 'visibility', 'visible');
        if (outlineLayer) map.setLayoutProperty('gemeente-outline', 'visibility', 'visible');
        if (labelsLayer) map.setLayoutProperty('gemeente-labels', 'visibility', 'visible');
        grenzenZichtbaar = true;
        const btn = document.getElementById('toggleGrenzenBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined">layers</span> Verberg grenzen';
            btn.style.background = '#4a6741';
        }
        setStatus('Gemeentegrenzen zichtbaar', false);
    }
}

// Reset view naar heel Nederland
function resetView() {
    map.flyTo({ center: [5.387, 52.156], zoom: 8.5, duration: 1000 });
    setStatus('Heel Nederland', false);
}

// Start de kaart
const mapInstance = initMap();