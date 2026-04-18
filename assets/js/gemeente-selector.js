// gemeente-selector.js - Externe gemeente selector met data loading

// Globale variabelen
let gemeenteData = null;
let grenzenZichtbaar = false;
let currentlySelectedGemeente = null;
let currentGemeenteCode = null;

// Wacht tot de kaart geladen is en initialiseer
function initGemeenteSelector(mapInstance) {
    if (!mapInstance) {
        console.error("Geen kaart object doorgegeven");
        return;
    }
    
    window.map = mapInstance;
    
    if (mapInstance.loaded()) {
        loadMunicipalities();
    } else {
        mapInstance.on('load', () => {
            loadMunicipalities();
        });
    }
    
    setupUIEvents();
}

// Setup klik handlers voor gemeente vlakken en labels
function setupGemeenteClickHandlers() {
    if (!window.map) return;
    
    window.map.off('click', 'gemeente-fill');
    window.map.off('click', 'gemeente-labels');
    
    window.map.on('click', 'gemeente-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        selectGemeente(naam);
    });
    
    window.map.on('click', 'gemeente-labels', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        selectGemeente(naam);
    });
    
    window.map.on('mouseenter', 'gemeente-fill', () => { 
        window.map.getCanvas().style.cursor = 'pointer'; 
    });
    window.map.on('mouseleave', 'gemeente-fill', () => { 
        window.map.getCanvas().style.cursor = ''; 
    });
    window.map.on('mouseenter', 'gemeente-labels', () => { 
        window.map.getCanvas().style.cursor = 'pointer'; 
    });
    window.map.on('mouseleave', 'gemeente-labels', () => { 
        window.map.getCanvas().style.cursor = ''; 
    });
    
    if (window.map.getLayer('rvm-lines')) {
        window.map.off('mouseenter', 'rvm-lines');
        window.map.off('mouseleave', 'rvm-lines');
        window.map.on('mouseenter', 'rvm-lines', () => { 
            window.map.getCanvas().style.cursor = ''; 
        });
    }
}

// Zoek gemeente code op basis van naam
function findGemeenteCodeByName(naam) {
    if (typeof gemeenten !== 'undefined' && gemeenten.length) {
        const gemeente = gemeenten.find(g => g.naam === naam);
        if (gemeente && gemeente.code && gemeente.code !== "0000") {
            return gemeente.code;
        }
    }
    
    const gemeenteCodes = {
        'Helmond': '0794',
        'Eindhoven': '0772',
        'Amsterdam': '0363',
        'Rotterdam': '0599',
        'Utrecht': '0344',
        'Den Haag': '0518',
        'Groningen': '0014',
        'Tilburg': '0855',
        'Breda': '0758',
        'Nijmegen': '0268',
        'Almere': '0034',
        'Arnhem': '0202',
        'Enschede': '0153',
        'Haarlem': '0392',
        'Leeuwarden': '0080',
        'Maastricht': '0935',
        'Zwolle': '0193'
    };
    
    return gemeenteCodes[naam] || null;
}

// Zoek gemeente naam op basis van code
function findGemeenteNameByCode(code) {
    if (typeof gemeenten !== 'undefined' && gemeenten.length) {
        const gemeente = gemeenten.find(g => g.code === code);
        if (gemeente && gemeente.naam) {
            return gemeente.naam;
        }
    }
    return null;
}

// Laad gemeentegrenzen van PDOK WFS
async function loadMunicipalities() {
    if (!window.map) return;
    
    setStatus("Gemeentegrenzen laden...", false);
    
    proj4.defs("EPSG:28992", "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.2369,50.0087,465.658,-0.406857,0.350733,-1.87035,4.0812 +units=m +no_defs");
    const rdToWgs84 = proj4("EPSG:28992", "EPSG:4326");
    
    const url = "https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0?service=WFS&version=2.0.0&request=GetFeature&typeName=bestuurlijkegebieden:Gemeentegebied&outputFormat=application/json&srsName=EPSG:28992";
    
    try {
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
        
        if (window.map.getSource('gemeenten')) {
            window.map.getSource('gemeenten').setData(gemeenteData);
        } else {
            window.map.addSource('gemeenten', { type: 'geojson', data: gemeenteData });
        }
        
        ['gemeente-fill', 'gemeente-outline', 'gemeente-labels'].forEach(id => {
            if (window.map.getLayer(id)) window.map.removeLayer(id);
        });
        
        window.map.addLayer({
            id: 'gemeente-fill',
            type: 'fill',
            source: 'gemeenten',
            paint: { 'fill-color': '#86efac', 'fill-opacity': 0.45, 'fill-outline-color': '#166534' }
        });
        
        window.map.addLayer({
            id: 'gemeente-outline',
            type: 'line',
            source: 'gemeenten',
            paint: { 'line-color': '#22c55e', 'line-width': 2 }
        });
        
        window.map.addLayer({
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
        
        if (!grenzenZichtbaar) {
            window.map.setLayoutProperty('gemeente-fill', 'visibility', 'none');
            window.map.setLayoutProperty('gemeente-outline', 'visibility', 'none');
            window.map.setLayoutProperty('gemeente-labels', 'visibility', 'none');
        }
        
        setStatus(`${features.length} gemeenten geladen!`, false);
        
        document.dispatchEvent(new CustomEvent('gemeentenLoaded', { 
            detail: { count: features.length, data: gemeenteData } 
        }));
        
        setupGemeenteClickHandlers();
        
        return gemeenteData;
    } catch (error) {
        console.error("Fout bij laden gemeentegrenzen:", error);
        setStatus("Fout bij laden gemeentegrenzen", true);
        return null;
    }
}

// Selecteer een gemeente op naam
function selectGemeente(naam) {
    if (!naam || !gemeenteData || !window.map) return;
    
    console.log(`[Gemeente Selector] Selecteer: ${naam}`);
    
    const gemeenteCode = findGemeenteCodeByName(naam);
    currentGemeenteCode = gemeenteCode;
    currentlySelectedGemeente = naam;
    
    // Update input veld - alleen de naam (geen code tussen haakjes)
    const inputField = document.getElementById('gemeenteInput');
    if (inputField) inputField.value = naam;
    
    if (window.map.getLayer('rvm-lines')) {
        window.map.setFilter('rvm-lines', ['==', ['get', 'municipalityName'], naam]);
    }
    
    if (window.updateArrowFilters) {
        window.updateArrowFilters(naam);
    }
    
    if (gemeenteCode && window.GemeenteManager && window.GemeenteManager.loadGemeenteData) {
        window.GemeenteManager.loadGemeenteData(gemeenteCode);
    } else if (gemeenteCode) {
        document.dispatchEvent(new CustomEvent('gemeenteChanged', { 
            detail: { gemeenteNaam: naam, gemeenteCode: gemeenteCode } 
        }));
    }
    
    clearHighlight();
    
    if (grenzenZichtbaar) {
        toggleGrenzen();
    } else {
        const fillLayer = window.map.getLayer('gemeente-fill');
        const outlineLayer = window.map.getLayer('gemeente-outline');
        const labelsLayer = window.map.getLayer('gemeente-labels');
        if (fillLayer) window.map.setLayoutProperty('gemeente-fill', 'visibility', 'none');
        if (outlineLayer) window.map.setLayoutProperty('gemeente-outline', 'visibility', 'none');
        if (labelsLayer) window.map.setLayoutProperty('gemeente-labels', 'visibility', 'none');
    }
    
    const feature = gemeenteData.features.find(f => f.properties.naam === naam);
    if (feature) {
        try {
            const bbox = turf.bbox(feature);
            if (bbox && bbox.length === 4) {
                window.map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { 
                    padding: 50, 
                    duration: 800 
                });
            }
        } catch(e) {
            fallbackZoomToMunicipality(naam);
        }
    } else {
        fallbackZoomToMunicipality(naam);
    }
    
    setStatus(`${naam} - NDW wegvakken geladen`, false);
}

function clearHighlight() {
    if (!window.map) return;
    
    if (window.map.getLayer('gemeente-fill')) {
        window.map.setPaintProperty('gemeente-fill', 'fill-color', '#86efac');
        window.map.setPaintProperty('gemeente-fill', 'fill-opacity', 0.45);
    }
    
    if (window.map.getLayer('gemeente-labels')) {
        window.map.setPaintProperty('gemeente-labels', 'text-color', '#1a3a2a');
        window.map.setLayoutProperty('gemeente-labels', 'text-size', 12);
    }
    
    if (window.map.getSource('gemeente-highlight')) {
        if (window.map.getLayer('gemeente-highlight-fill')) {
            window.map.removeLayer('gemeente-highlight-fill');
        }
        if (window.map.getLayer('gemeente-highlight-outline')) {
            window.map.removeLayer('gemeente-highlight-outline');
        }
        window.map.removeSource('gemeente-highlight');
    }
}

function fallbackZoomToMunicipality(naam) {
    if (!window.map) return;
    
    let retries = 0;
    function tryZoom() {
        if (!window.map) return;
        
        try {
            const features = window.map.querySourceFeatures("rvm_segments", {
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
                    window.map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 50, duration: 800 });
                }
                return;
            }
        } catch(e) {}
        
        if (retries < 10) {
            retries++;
            setTimeout(tryZoom, 400);
        }
    }
    setTimeout(tryZoom, 500);
}

function searchGemeente() {
    const inputField = document.getElementById('gemeenteInput');
    if (!inputField) return;
    
    let value = inputField.value.trim();
    if (!value) {
        setStatus("Typ een gemeentenaam", true);
        return;
    }
    
    // Haal code uit haakjes of gebruik direct de naam
    let codeMatch = value.match(/\((\d+)\)/);
    let gemeenteCode = null;
    let gemeenteNaam = null;
    
    if (codeMatch) {
        gemeenteCode = codeMatch[1];
        gemeenteNaam = findGemeenteNameByCode(gemeenteCode);
    } else {
        gemeenteNaam = value.replace(/\s*\([^)]*\)\s*$/, '');
    }
    
    if (gemeenteNaam && gemeenteData) {
        const exists = gemeenteData.features.some(f => f.properties.naam === gemeenteNaam);
        if (!exists) {
            setStatus(`Gemeente "${gemeenteNaam}" niet gevonden`, true);
            return;
        }
        selectGemeente(gemeenteNaam);
    } else if (gemeenteCode) {
        setStatus(`Geen gemeente gevonden voor code ${gemeenteCode}`, true);
    } else {
        setStatus("Typ een geldige gemeentenaam", true);
    }
}

// AANGEPASTE toggleGrenzen functie met uitzoomen en max zoom
// AANGEPASTE toggleGrenzen functie - alleen uitzoomen, niet inzoomen
// ALTERNATIEF: Alleen uitzoomen, nooit inzoomen
function toggleGrenzen() {
    if (!window.map) return;
    
    const fillLayer = window.map.getLayer('gemeente-fill');
    const outlineLayer = window.map.getLayer('gemeente-outline');
    const labelsLayer = window.map.getLayer('gemeente-labels');
    
    if (grenzenZichtbaar) {
        // Verberg de grenzen
        if (fillLayer) window.map.setLayoutProperty('gemeente-fill', 'visibility', 'none');
        if (outlineLayer) window.map.setLayoutProperty('gemeente-outline', 'visibility', 'none');
        if (labelsLayer) window.map.setLayoutProperty('gemeente-labels', 'visibility', 'none');
        grenzenZichtbaar = false;
        const btn = document.getElementById('toggleGrenzenBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined">arrow_selector_tool</span> Selecteer gemeente';
            btn.style.background = '#4263a9';
        }
        setStatus('Gemeentegrenzen verborgen', false);
        
        // ZOOM UIT naar zoom level 11 (heel Nederland overzicht)
            window.map.flyTo({
            zoom: 12,
            duration: 600
        });
    } else {
        // Toon de grenzen - GEEN ZOOM ACTIE
        if (fillLayer) window.map.setLayoutProperty('gemeente-fill', 'visibility', 'visible');
        if (outlineLayer) window.map.setLayoutProperty('gemeente-outline', 'visibility', 'visible');
        if (labelsLayer) window.map.setLayoutProperty('gemeente-labels', 'visibility', 'visible');
        grenzenZichtbaar = true;
        const btn = document.getElementById('toggleGrenzenBtn');
        if (btn) {
            btn.innerHTML = '<span class="material-symbols-outlined">arrow_selector_tool</span> Selecteer gemeente';
            btn.style.background = '#4a6741';
        }
        setStatus('Gemeentegrenzen zichtbaar', false);
        
        // GEEN INZOOMEN - blijf op huidige zoom positie
        window.map.flyTo({
            zoom: 10,
            duration: 600
        });
    }
}

function resetView() {
    if (!window.map) return;
    window.map.flyTo({ center: [5.387, 52.156], zoom: 8.5, duration: 1000 });
    setStatus('Heel Nederland', false);
}

function setupUIEvents() {
    const toggleBtn = document.getElementById('toggleGrenzenBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleGrenzen);
    }
    
    const inputField = document.getElementById('gemeenteInput');
    if (inputField) {
        // Enter key = zoeken
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchGemeente();
            }
        });
        
        // Escape = leegmaken
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                inputField.value = '';
            }
        });
        
        // Verwijder de standaard form submit
        inputField.closest('form')?.addEventListener('submit', (e) => e.preventDefault());
    }
}

function setStatus(text, isError = false) {
    const el = document.getElementById("statusMsg");
    if (!el) return;
    el.style.backgroundColor = isError ? "#b91c1c" : "#0f172a";
    el.innerText = isError ? `⚠️ ${text}` : `✓ ${text}`;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; }, 3000);
}

// Exporteer functies
window.selectGemeente = selectGemeente;
window.searchGemeente = searchGemeente;
window.toggleGrenzen = toggleGrenzen;
window.resetView = resetView;
window.initGemeenteSelector = initGemeenteSelector;
window.getSelectedGemeente = () => currentlySelectedGemeente;

console.log("gemeente-selector.js geladen");