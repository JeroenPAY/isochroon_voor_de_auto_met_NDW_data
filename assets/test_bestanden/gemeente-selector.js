// gemeente-selector.js - Behandelt gemeente selectie en filtering

// Wacht tot de kaart geladen is
map.on('load', async () => {
    await loadMunicipalities();
    setupGemeenteClickHandlers();
    setupUIEvents();
});

// Setup klik handlers voor gemeente vlakken en labels
function setupGemeenteClickHandlers() {
    // Klik op gemeentevlak
    map.on('click', 'gemeente-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        selectGemeente(naam);
    });
    
    // Klik op gemeentelabel
    map.on('click', 'gemeente-labels', (e) => {
        if (!e.features || e.features.length === 0) return;
        const naam = e.features[0].properties.naam;
        selectGemeente(naam);
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
    
    // Update input veld
    const inputField = document.getElementById('gemeenteInput');
    if (inputField) inputField.value = naam;
    
    // Filter NDW lagen
    map.setFilter('rvm-lines', ['==', ['get', 'municipalityName'], naam]);
    
    // Zoek de gemeente in de data en zoom er naartoe
    const feature = gemeenteData.features.find(f => f.properties.naam === naam);
    if (feature) {
        try {
            const bbox = turf.bbox(feature);
            if (bbox && bbox.length === 4) {
                map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { 
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
    
    setStatus(`${naam} - NDW wegvakken geladen`, false);
}

// Fallback zoom via NDW features als de gemeente niet in de dataset zit
function fallbackZoomToMunicipality(naam) {
    let retries = 0;
    function tryZoom() {
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
        }
    }
    
    selectGemeente(naam);
}

// Setup UI event listeners
function setupUIEvents() {
    const zoekBtn = document.getElementById('zoekGemeenteBtn');
    if (zoekBtn) {
        zoekBtn.addEventListener('click', searchGemeente);
    }
    
    const toggleBtn = document.getElementById('toggleGrenzenBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleGrenzen);
    }
    
    const resetBtn = document.getElementById('resetViewBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetView);
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

// Exporteer functies voor debugging (optioneel)
window.selectGemeente = selectGemeente;
window.searchGemeente = searchGemeente;
window.toggleGrenzen = toggleGrenzen;
window.resetView = resetView;