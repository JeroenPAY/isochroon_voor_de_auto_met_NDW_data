// data/js/script3.js - Gebaseerd op werkende code met isochroon functionaliteit
let map;
let gemeenteData = null;
let grenzenZichtbaar = true;
let currentBasemap = 'pdok-grijs';

// Initialiseer de kaart (zoals in werkende code)
function initMap() {
    console.log("[Script] Initialiseer map...");
    window.utils?.showLoading();
    
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

    window.map = map;
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
    
    map.once("load", () => {
        console.log("[Script] Map geladen");
        
        // Laad gemeentegrenzen
        loadMunicipalities();
        
        window.utils?.hideLoading();
        
        // Setup extra features
        setupMapFeatures();
        
        // Laad initiële data (Helmond)
        if (window.GemeenteManager) {
            window.GemeenteManager.loadGemeenteData('0794');
        }
        
        // Positioneer sidebar
        setTimeout(positionSidebar, 500);
    });
    
    map.on('error', e => console.error('[Script] MapLibre error:', e.error));
    setTimeout(() => window.utils?.hideLoading(), 5000);
    
    return map;
}

// Laad gemeentegrenzen van PDOK WFS (werkende versie)
async function loadMunicipalities() {
    console.log("[Script] Laden van gemeentegrenzen...");
    setStatus("Gemeentegrenzen laden...", false);
    
    try {
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
        
        // Setup click handlers
        setupGemeenteClickHandlers();
        
        setStatus(`${features.length} gemeenten geladen!`, false);
        console.log(`[Script] ${features.length} gemeenten geladen`);
        
    } catch (error) {
        console.error("[Script] Fout bij laden gemeentegrenzen:", error);
        setStatus("Kon gemeentegrenzen niet laden", true);
    }
}

// Setup klik handlers voor gemeente vlakken en labels
function setupGemeenteClickHandlers() {
    // Klik op gemeentevlak
    map.on('click', 'gemeente-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        if (naam) selectGemeente(naam);
    });
    
    // Klik op gemeentelabel
    map.on('click', 'gemeente-labels', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        if (naam) selectGemeente(naam);
    });
    
    // Cursor verandering bij hover
    map.on('mouseenter', 'gemeente-fill', () => { 
        map.getCanvas().style.cursor = 'pointer'; 
    });
    map.on('mouseleave', 'gemeente-fill', () => { 
        map.getCanvas().style.cursor = ''; 
    });
    map.on('mouseenter', 'gemeente-labels', () => { 
        map.getCanvas().style.cursor = 'pointer'; 
    });
    map.on('mouseleave', 'gemeente-labels', () => { 
        map.getCanvas().style.cursor = ''; 
    });
}

// Selecteer een gemeente op naam
function selectGemeente(naam) {
    if (!naam || !gemeenteData) return;
    
    console.log("[Script] Selecteer gemeente:", naam);
    
    // Update input veld
    const inputField = document.getElementById('gemeenteInput');
    if (inputField) inputField.value = naam;
    
    // Filter NDW lagen
    if (map && map.getLayer('rvm-lines')) {
        map.setFilter('rvm-lines', ['==', ['get', 'municipalityName'], naam]);
        console.log("[Script] RVM filter geupdate:", naam);
    }
    
    // Zoek de gemeente in de data en zoom er naartoe
    const feature = gemeenteData.features.find(f => f.properties.naam === naam);
    if (feature) {
        try {
            // Bereken bounding box handmatig (zonder turf)
            const coords = feature.geometry.coordinates;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            function processCoords(coordsArray) {
                if (typeof coordsArray[0] === 'number') {
                    minX = Math.min(minX, coordsArray[0]);
                    minY = Math.min(minY, coordsArray[1]);
                    maxX = Math.max(maxX, coordsArray[0]);
                    maxY = Math.max(maxY, coordsArray[1]);
                } else {
                    coordsArray.forEach(processCoords);
                }
            }
            
            processCoords(coords);
            
            if (isFinite(minX)) {
                map.fitBounds([[minX, minY], [maxX, maxY]], { 
                    padding: 50, 
                    duration: 800 
                });
            }
        } catch(e) {
            console.warn("Kon niet inzoomen op gemeente:", e);
            fallbackZoomToMunicipality(naam);
        }
    } else {
        fallbackZoomToMunicipality(naam);
    }
    
    // Stuur event naar GemeenteManager
    if (window.GemeenteManager) {
        const gemeenteInfo = window.GemeenteManager.getAllGemeenten?.()?.find(g => g.naam === naam);
        if (gemeenteInfo) {
            window.GemeenteManager.loadGemeenteData(gemeenteInfo.code);
        }
    }
    
    setStatus(`${naam} - NDW wegvakken geladen`, false);
    window.utils?.showNotification(`${naam} - NDW wegvakken geladen`, 'success', 2000);
    
    // Clear isochroon
    if (window.IsochroonCalculator?.getCurrentIsochroon()) {
        window.IsochroonCalculator.clearIsochroonFromMap(map);
    }
}

// Fallback zoom via NDW features
function fallbackZoomToMunicipality(naam) {
    let retries = 0;
    function tryZoom() {
        if (!map || !map.isStyleLoaded()) {
            if (retries < 10) {
                retries++;
                setTimeout(tryZoom, 400);
            }
            return;
        }
        
        const features = map.querySourceFeatures("rvm_segments", {
            sourceLayer: "roadSections",
            filter: ["==", ["get", "municipalityName"], naam]
        });
        
        if (features && features.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            features.forEach(f => {
                const geom = f.geometry;
                if (geom.type === "LineString") {
                    geom.coordinates.forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                } else if (geom.type === "MultiLineString") {
                    geom.coordinates.flat().forEach(([x, y]) => {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    });
                }
            });
            if (isFinite(minX)) {
                map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 50, duration: 800 });
            }
            return;
        }
        if (retries < 10) {
            retries++;
            setTimeout(tryZoom, 400);
        }
    }
    setTimeout(tryZoom, 500);
}

// Zoek een gemeente op basis van input veld
function searchGemeente() {
    const inputField = document.getElementById('gemeenteInput');
    if (!inputField) return;
    
    const naam = inputField.value.trim();
    if (!naam) {
        setStatus("Typ een gemeentenaam", true);
        return;
    }
    
    if (gemeenteData) {
        const exists = gemeenteData.features.some(f => f.properties.naam === naam);
        if (!exists) {
            setStatus(`Gemeente "${naam}" niet gevonden in dataset`, true);
            return;
        }
    }
    
    selectGemeente(naam);
}

// Toggle functie voor gemeentegrenzen
function toggleGrenzen() {
    const fillLayer = map.getLayer('gemeente-fill');
    const outlineLayer = map.getLayer('gemeente-outline');
    const labelsLayer = map.getLayer('gemeente-labels');
    const toggleBtn = document.getElementById('toggleGrenzenBtn');
    
    if (grenzenZichtbaar) {
        if (fillLayer) map.setLayoutProperty('gemeente-fill', 'visibility', 'none');
        if (outlineLayer) map.setLayoutProperty('gemeente-outline', 'visibility', 'none');
        if (labelsLayer) map.setLayoutProperty('gemeente-labels', 'visibility', 'none');
        grenzenZichtbaar = false;
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="material-symbols-outlined">layers</span> Toon grenzen';
            toggleBtn.style.backgroundColor = '#2c3e66';
        }
        setStatus('Gemeentegrenzen verborgen', false);
    } else {
        if (fillLayer) map.setLayoutProperty('gemeente-fill', 'visibility', 'visible');
        if (outlineLayer) map.setLayoutProperty('gemeente-outline', 'visibility', 'visible');
        if (labelsLayer) map.setLayoutProperty('gemeente-labels', 'visibility', 'visible');
        grenzenZichtbaar = true;
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="material-symbols-outlined">layers</span> Verberg grenzen';
            toggleBtn.style.backgroundColor = '#4a6741';
        }
        setStatus('Gemeentegrenzen zichtbaar', false);
    }
}

// Reset view naar heel Nederland
function resetView() {
    if (map) {
        map.flyTo({ center: [5.387, 52.156], zoom: 8.5, duration: 1000 });
        
        // Reset RVM filter naar Helmond
        if (map.getLayer('rvm-lines')) {
            map.setFilter('rvm-lines', ['==', ['get', 'municipalityName'], 'Helmond']);
        }
        
        const inputField = document.getElementById('gemeenteInput');
        if (inputField) inputField.value = 'Helmond';
        
        setStatus('Heel Nederland', false);
        window.utils?.showNotification('Heel Nederland - Helmond als default', 'info', 2000);
    }
}

// Statusmelding functie
function setStatus(text, isError = false) {
    const el = document.getElementById("statusMsg");
    if (el) {
        el.style.backgroundColor = isError ? "#b91c1c" : "#0f172a";
        el.innerText = isError ? `⚠️ ${text}` : `✓ ${text}`;
        el.style.opacity = "1";
        setTimeout(() => { el.style.opacity = "0"; }, 3000);
    }
    window.utils?.showNotification(text, isError ? 'error' : 'success', 3000);
}

function setupMapFeatures() {
    // Setup UI events voor gemeente buttons
    setupUIEvents();
    
    // Setup basemap radio (vereenvoudigd)
    setupBasemapRadio();
    
    // Setup isochroon start button
    setupIsochroonStartButton();
    
    // Alleen isochroon calculator
    initIsochroonCalculator();
    
    // Update sidebar
    window.CalculationsSidebar?.init();
    window.CalculationsSidebar?.updateForGemeente('Helmond');
}

function setupUIEvents() {
    const zoekBtn = document.getElementById('zoekGemeenteBtn');
    if (zoekBtn) {
        const newZoekBtn = zoekBtn.cloneNode(true);
        zoekBtn.parentNode?.replaceChild(newZoekBtn, zoekBtn);
        newZoekBtn.addEventListener('click', searchGemeente);
    }
    
    const toggleBtn = document.getElementById('toggleGrenzenBtn');
    if (toggleBtn) {
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode?.replaceChild(newToggleBtn, toggleBtn);
        newToggleBtn.addEventListener('click', toggleGrenzen);
    }
    
    const resetBtn = document.getElementById('resetViewBtn');
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode?.replaceChild(newResetBtn, resetBtn);
        newResetBtn.addEventListener('click', resetView);
    }
    
    const inputField = document.getElementById('gemeenteInput');
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchGemeente();
            }
        });
    }
}

function setupBasemapRadio() {
    // Vereenvoudigd - geen complexe basemap switching voor nu
    console.log("[Script] Setup basemap radio (vereenvoudigd)");
}

function setupIsochroonStartButton() {
    console.log("[Script] Setup isochroon start knop");
    
    setTimeout(() => {
        const input = document.getElementById('isochroonStartNode');
        if (!input) {
            console.error("[Script] isochroonStartNode input niet gevonden!");
            return;
        }
        
        if (!document.querySelector('.isochroon-select-button')) {
            const button = createIsochroonButton('Kies startpunt');
            input.parentNode.insertBefore(button, input.nextSibling);
            console.log("[Script] Isochroon start knop toegevoegd");
        }
    }, 1000);
}

function createIsochroonButton(buttonText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'isochroon-select-button';
    button.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">location_on</span>
        ${buttonText}
    `;
    button.style.cssText = `
        margin-left: 8px;
        padding: 6px 12px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    `;
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (window.NodeSelector) {
            window.NodeSelector.setMode('isochroon', 'isochroonStartNode');
            window.NodeSelector.toggleNodes('isochroonStartNode');
        } else {
            window.utils?.showNotification('Startpunt selector niet beschikbaar', 'error', 3000);
        }
    });
    
    return button;
}

function initIsochroonCalculator() {
    if (!window.IsochroonCalculator?.init) {
        console.error("[Script] IsochroonCalculator niet beschikbaar!");
        return false;
    }
    
    console.log("[Script] Initialiseer isochroon calculator...");
    const success = window.IsochroonCalculator.init();
    
    if (success) {
        setTimeout(() => {
            const size = window.IsochroonCalculator.getGraphSize?.() || 0;
            console.log(`[Script] Isochroon graph bevat ${size} nodes`);
        }, 1500);
    }
    
    return success;
}

function positionSidebar() {
    const sidebar = document.getElementById('calculationsSidebar');
    if (sidebar && map) {
        sidebar.style.top = '10px';
        sidebar.style.right = '10px';
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
    console.log("[Script] DOM geladen");
    
    if (window.GemeenteManager?.setupGemeenteInput) {
        window.GemeenteManager.setupGemeenteInput();
    }
    
    initMap();
    
    window.addEventListener('resize', debounce(() => {
        positionSidebar();
    }, 250));
});

// Exporteer functies
window.selectGemeente = selectGemeente;
window.searchGemeente = searchGemeente;
window.toggleGrenzen = toggleGrenzen;
window.resetView = resetView;
window.setStatus = setStatus;