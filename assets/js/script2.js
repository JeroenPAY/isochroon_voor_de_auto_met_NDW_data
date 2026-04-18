// data/js/script.js - Vereenvoudigde versie: alleen isochroon functionaliteit met NDW basemap
let map;
let currentBasemap = 'ndw';
let currentRoadLayers = []; // Houdt bij welke weg lagen we gebruiken in NDW stijl

// NDW stijlen
const ndwStyles = {
    ndw: "https://maps.ndw.nu/styles/ndw-basemap/dev/style.json",
    "ndw-demo": "https://maps.ndw.nu/styles/ndw-basemap/dev/style_demo.json",
    "pdok-luchtfoto": "pdok-luchtfoto"
};

// PDOK Luchtfoto stijl (voor de dropdown optie)
const pdokLuchtfotoStyle = {
    version: 8,
    sources: {
        luchtfoto: {
            type: "raster",
            tiles: [
                "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"
            ],
            tileSize: 256,
            attribution: "© PDOK"
        },
        "rvm_segments": { 
            type: "vector", 
            tiles: ["https://maps.ndw.nu/api/v1/nwb/latest/mbtiles/roadSections/tiles/{z}/{x}/{y}.pbf"] 
        }
    },
    layers: [
        {
            id: "luchtfoto",
            type: "raster",
            source: "luchtfoto",
            paint: {
                "raster-opacity": 0.9
            }
        }
    ]
};

function initMap(center, zoom) {
    console.log("[Script] Initialiseer map met NDW basemap...");
    window.utils?.showLoading();
    
    map = new maplibregl.Map({
        container: "map",
        style: ndwStyles.ndw,
        center: center || [5.66, 51.47],
        zoom: zoom || 12,
        attributionControl: false
    });

    window.map = map;

    map.once("load", () => {
        console.log("[Script] Map geladen");
        window.utils?.hideLoading();
        
        // Vind de juiste weg lagen in NDW stijl
        findNDWRoadLayers();
        
        // Setup map features
        setupMapFeatures();
        
        // Voeg stijlkiezer toe
        setupStyleSelector();
        
        // Laad initiële data
        window.GemeenteManager?.loadGemeenteData('0794');
        
        // Positioneer sidebar
        setTimeout(positionSidebar, 500);
    });
    
    map.on('error', e => {
        // Negeer 404 errors voor icon bestanden, die zijn niet kritiek
        if (!e.error.message.includes('404') && !e.error.message.includes('image')) {
            console.error('[Script] MapLibre error:', e.error);
        }
    });
    
    setTimeout(() => window.utils?.hideLoading(), 5000);
}

function findNDWRoadLayers() {
    console.log("[Script] Zoeken naar NDW weg lagen...");
    
    const layers = map.getStyle().layers;
    
    // NDW weg lagen hebben 'NDW-road-sections' in de naam
    const ndwRoadLayers = layers.filter(layer => 
        layer.id.includes('NDW-road-sections') && layer.type === 'line'
    );
    
    console.log(`[Script] Gevonden NDW weg lagen:`, ndwRoadLayers.map(l => l.id));
    
    if (ndwRoadLayers.length > 0) {
        currentRoadLayers = ndwRoadLayers.map(l => l.id);
        setupNDWPopupHandlers();
    } else {
        console.warn("[Script] Geen NDW weg lagen gevonden");
        // Probeer opnieuw na 1 seconde
        setTimeout(findNDWRoadLayers, 1000);
    }
}

function setupNDWPopupHandlers() {
    console.log(`[Script] Popup handlers instellen voor:`, currentRoadLayers);
    
    // Verwijder bestaande handlers
    currentRoadLayers.forEach(layerId => {
        map.off('click', layerId, handleNDWRoadClick);
        map.off('mouseenter', layerId, handleNDWRoadMouseEnter);
        map.off('mouseleave', layerId, handleNDWRoadMouseLeave);
    });
    
    // Voeg nieuwe handlers toe
    currentRoadLayers.forEach(layerId => {
        map.on('click', layerId, handleNDWRoadClick);
        map.on('mouseenter', layerId, handleNDWRoadMouseEnter);
        map.on('mouseleave', layerId, handleNDWRoadMouseLeave);
    });
    
    console.log("[Script] NDW popup handlers toegevoegd");
}

function handleNDWRoadClick(e) {
    console.log("[Script] Klik op NDW weg detected!");
    
    if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const properties = feature.properties || {};
        const layerId = feature.layer.id;
        
        // Bouw popup inhoud in dezelfde stijl als de originele popup
        let html = `<div style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; max-width: 250px;">`;
        html += `<strong style="font-size: 14px; color: #333;">Weginformatie (NDW)</strong><br><br>`;
        
        // Toon relevante properties
        const relevantProps = [
            'roadSectionId', 'roadName', 'municipalityName', 
            'roadType', 'maxSpeed', 'length', 'direction',
            'roadNumber', 'roadNumberType'
        ];
        
        let hasProps = false;
        relevantProps.forEach(prop => {
            if (properties[prop] !== undefined && properties[prop] !== null && properties[prop] !== '') {
                const label = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                html += `<strong style="color: #555;">${label}:</strong> ${properties[prop]}<br>`;
                hasProps = true;
            }
        });
        
        if (!hasProps) {
            html += `<em>Geen weginformatie beschikbaar</em><br>`;
        }
        
        // Zoek naar fiets data in wkd_traffic bron
        const roadSectionId = properties.roadSectionId || properties.id;
        if (roadSectionId) {
            try {
                // Probeer traffic features te vinden
                const trafficFeatures = map.querySourceFeatures('wkd_traffic', {
                    sourceLayer: 'segments'
                });
                
                const matchingFeatures = trafficFeatures.filter(f => {
                    const props = f.properties;
                    return props && props.nwbRoadSectionId == roadSectionId;
                });
                
                if (matchingFeatures.length > 0) {
                    const trafficProps = matchingFeatures[0].properties;
                    
                    if (trafficProps.bicycleForward !== undefined) {
                        html += `<strong style="color: #555;">Fiets H:</strong> ${trafficProps.bicycleForward ? 'Ja' : 'Nee'}<br>`;
                    }
                    if (trafficProps.bicycleBackward !== undefined) {
                        html += `<strong style="color: #555;">Fiets T:</strong> ${trafficProps.bicycleBackward ? 'Ja' : 'Nee'}<br>`;
                    }
                }
            } catch (error) {
                // Stil negeren
            }
        }
        
        // Voeg George link toe
        if (roadSectionId) {
            const georgeLink = `https://wegkenmerken.ndw.nu/kaart/wegvakken/${roadSectionId}/kenmerken/verkeerstype?kaartlagen=ADMINISTRATIVE_DIVISION,TRAFFIC_TYPE,TRAFFIC_SIGN,BRT&zoom=true`;
            html += `<br><div style="text-align: center;">`;
            html += `<a href="${georgeLink}" target="_blank" 
                    style="display: inline-block; 
                           padding: 4px 8px; 
                           background-color: #007cff; 
                           color: white; 
                           text-decoration: none; 
                           border-radius: 6px; 
                           font-weight: bold;
                           font-size: 12px;
                           width: 85%;
                           box-shadow: 0 2px 4px rgba(0, 124, 255, 0.3);">
              <span style="display: inline-flex; gap: 6px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" style="vertical-align: middle;">
                  <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
                George
              </span>
            </a>`;
            html += `</div>`;
        }
        
        html += `</div>`;
        
        // Toon popup
        if (window.activePopup) {
            window.activePopup.remove();
        }
        
        window.activePopup = new maplibregl.Popup({
            closeOnClick: false
        })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    }
}

function handleNDWRoadMouseEnter() {
    if (!window.NodeSelector || !window.NodeSelector.areNodesVisible()) {
        map.getCanvas().style.cursor = 'pointer';
    }
}

function handleNDWRoadMouseLeave() {
    if (!window.NodeSelector || !window.NodeSelector.areNodesVisible()) {
        map.getCanvas().style.cursor = '';
    }
}

function setupStyleSelector() {
    console.log("[Script] Setup stijlkiezer");
    
    if (document.getElementById('styleSelect')) {
        return;
    }
    
    const controlDiv = document.createElement('div');
    controlDiv.className = 'style-selector';
    controlDiv.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        background: white;
        padding: 8px 12px;
        border-radius: 6px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        z-index: 10;
        font-family: system-ui, sans-serif;
        display: flex;
        align-items: center;
        gap: 8px;
    `;
    
    controlDiv.innerHTML = `
        <label style="font-weight: 600; font-size: 13px; white-space: nowrap;">
            Kaart:
        </label>
        <select id="styleSelect" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; font-size: 13px;">
            <option value="ndw" selected>NDW Basemap</option>
            <option value="ndw-demo">NDW Demo style</option>
            <option value="pdok-luchtfoto">PDOK Luchtfoto</option>
        </select>
    `;
    
    document.body.appendChild(controlDiv);
    
    const styleSelect = document.getElementById('styleSelect');
    
    styleSelect.addEventListener('change', () => {
        const selectedValue = styleSelect.value;
        
        if (selectedValue === 'pdok-luchtfoto') {
            map.setStyle(pdokLuchtfotoStyle);
            map.once('style.load', () => {
                console.log("[Script] PDOK Luchtfoto stijl geladen");
                // Voor PDOK gebruiken we de bestaande popup handlers
                setTimeout(() => {
                    if (window.setupPopupHandlers) {
                        window.setupPopupHandlers(map);
                    }
                }, 500);
            });
        } else {
            map.setStyle(ndwStyles[selectedValue]);
            map.once('style.load', () => {
                console.log("[Script] NDW stijl geladen");
                // Voor NDW zoeken we de juiste lagen
                setTimeout(() => {
                    findNDWRoadLayers();
                }, 500);
            });
        }
        
        window.utils?.showNotification(`Kaartstijl gewijzigd`, 'info', 1500);
    });
}

function setupMapFeatures() {
    // Navigatie controls
    map.addControl(new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true
    }), 'bottom-right');
    
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    
    // Arrow layers (voor isochroon resultaten)
    setTimeout(() => {
        if (window.addArrowLayers) {
            console.log("[Script] Arrow layers toevoegen");
            window.addArrowLayers(map);
        } else {
            console.warn("[Script] addArrowLayers niet gevonden!");
        }
    }, 1500);
    
    // Event listeners
    setupGemeenteEventListeners();
    setupIsochroonStartButton();
    
    // Alleen isochroon calculator
    initIsochroonCalculator();
    
    // Update sidebar
    if (window.CalculationsSidebar) {
        window.CalculationsSidebar.init();
        window.CalculationsSidebar.updateForGemeente('Helmond');
    }
}

function initIsochroonCalculator() {
    if (!window.IsochroonCalculator?.init) {
        console.error("[Script] IsochroonCalculator niet beschikbaar!");
        window.utils?.showNotification(
            "Isochroon calculator niet beschikbaar",
            "error",
            5000
        );
        return false;
    }
    
    console.log("[Script] Initialiseer isochroon calculator...");
    const success = window.IsochroonCalculator.init();
    
    if (success) {
        setTimeout(() => {
            const size = window.IsochroonCalculator.getGraphSize?.() || 0;
            console.log(`[Script] Isochroon graph bevat ${size} nodes`);
            
            if (size === 0) {
                console.warn(`[Script] Isochroon graph is leeg!`);
                window.utils?.showNotification(
                    "Isochroon data niet geladen. Controleer cost_helmond.js bestand.",
                    "warning",
                    5000
                );
            }
        }, 1500);
    }
    
    return success;
}

function setupGemeenteEventListeners() {
    // Gemeente change
    document.addEventListener('gemeenteChanged', (e) => {
        const { gemeenteNaam } = e.detail;
        console.log("[Script] Gemeente gewijzigd:", gemeenteNaam);
        
        updateGemeenteFeatures(gemeenteNaam);
        
        if (gemeenteNaam !== 'Helmond') {
            window.utils?.showNotification(
                `Isochroonberekening is momenteel alleen beschikbaar voor Helmond`,
                'warning',
                4000
            );
        }
    });
    
    // Isochroon events
    document.addEventListener('isochroonCalculated', (e) => {
        const { success, edges, stats } = e.detail;
        if (success) {
            console.log(`[Script] Isochroon berekend: ${edges?.length} edges`);
            window.utils?.showNotification(
                `${edges?.length || 0} wegen bereikbaar binnen limiet`,
                'success',
                3000
            );
            
            // Toon de isochroon lijnen op kaart
            if (window.IsochroonCalculator && window.IsochroonCalculator.showIsochroonOnMap) {
                const timeLimit = stats?.timeLimitMinutes || 5;
                console.log("[Script] Isochroon lijnen tonen op kaart");
                window.IsochroonCalculator.showIsochroonOnMap(edges, map, timeLimit);
            }
        }
    });
    
    // Node selected
    document.addEventListener('nodeSelected', (e) => {
        const { nodeId, inputField, coordinates } = e.detail;
        console.log(`[Script] Node ${nodeId} geselecteerd voor ${inputField}`);
        
        const isochroonInput = document.getElementById('isochroonStartNode');
        if (isochroonInput && inputField === 'isochroonStartNode') {
            isochroonInput.value = nodeId;
        }
        
        if (coordinates && map) {
            map.flyTo({
                center: coordinates,
                zoom: 15,
                duration: 1000
            });
        }
    });
    
    // Arrows loaded event
    document.addEventListener('arrowsLoaded', (e) => {
        const { type, count } = e.detail || {};
        console.log(`[Script] Arrows geladen: ${type} - ${count}`);
        if (type && window.updateArrowCounts) {
            window.updateArrowCounts(type, count);
        }
    });
}

function updateGemeenteFeatures(gemeenteNaam) {
    // Update arrow filters
    if (window.updateArrowFilters) {
        window.updateArrowFilters(gemeenteNaam);
    }
    
    // Update sidebar
    if (window.CalculationsSidebar) {
        window.CalculationsSidebar.updateForGemeente(gemeenteNaam);
    }
    
    // Clear isochroon
    if (window.IsochroonCalculator?.getCurrentIsochroon()) {
        console.log("[Script] Wis isochroon bij gemeentewissel");
        if (window.IsochroonCalculator.clearIsochroonFromMap) {
            window.IsochroonCalculator.clearIsochroonFromMap(map);
        }
        window.utils?.showNotification(`Isochroon gewist (gemeente gewijzigd naar ${gemeenteNaam})`, 'info');
    }
}

function setupIsochroonStartButton() {
    console.log("[Script] Setup isochroon start knop");
    
    setTimeout(() => {
        const input = document.getElementById('isochroonStartNode');
        if (!input) {
            console.error("[Script] isochroonStartNode input niet gevonden!");
            return;
        }
        
        if (input.nextSibling && input.nextSibling.className === 'isochroon-select-button') {
            return;
        }
        
        const button = createIsochroonButton('Kies startpunt');
        input.parentNode.insertBefore(button, input.nextSibling);
        console.log("[Script] Isochroon start knop toegevoegd");
    }, 1000);
}

function createIsochroonButton(buttonText) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'isochroon-select-button';
    button.innerHTML = `
        <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">
            location_on
        </span>
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
        transition: background-color 0.2s;
    `;
    
    button.addEventListener('mouseenter', () => button.style.backgroundColor = '#45a049');
    button.addEventListener('mouseleave', () => button.style.backgroundColor = '#4CAF50');
    
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`[Script] Startpunt selectie voor isochroon`);
        
        if (window.NodeSelector) {
            window.NodeSelector.setMode('isochroon', 'isochroonStartNode');
            
            const nodesVisible = window.NodeSelector.toggleNodes('isochroonStartNode');
            
            if (!nodesVisible) {
                window.utils?.showNotification(
                    'Geen startpunten beschikbaar voor huidige gemeente',
                    'warning',
                    3000
                );
            }
        } else {
            console.error('[Script] NodeSelector niet beschikbaar');
            window.utils?.showNotification(
                'Startpunt selector functionaliteit niet beschikbaar',
                'error',
                3000
            );
        }
    });
    
    return button;
}

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
    console.log("[Script] DOM geladen");
    
    if (window.GemeenteManager) {
        window.GemeenteManager.setupGemeenteInput();
    }
    
    initMap();
    
    window.addEventListener('resize', debounce(() => {
        console.log("[Script] Scherm grootte gewijzigd");
        positionSidebar();
    }, 250));
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function positionSidebar() {
    const sidebar = document.getElementById('calculations-sidebar');
    if (sidebar && map) {
        const canvas = map.getCanvas();
        if (canvas) {
            sidebar.style.top = '10px';
            sidebar.style.right = '10px';
        }
    }
}

window.addEventListener('error', e => {
    // Negeer errors over 'rvm-lines' omdat die niet bestaan in NDW stijl
    if (!e.message.includes('rvm-lines')) {
        console.error('[Script] JavaScript error:', e.message, 'at', e.filename, 'line', e.lineno);
        window.utils?.showNotification(`Er is een fout opgetreden: ${e.message}`, 'error', 5000);
    }
});

window.addEventListener('online', () => {
    console.log("[Script] Netwerk hersteld");
    
    if (window.IsochroonCalculator?.getGraphSize?.() === 0) {
        console.log("[Script] Herinitialiseer isochroon calculator");
        setTimeout(() => window.IsochroonCalculator?.init?.(), 1500);
    }
});

window.initMap = initMap;
window.positionSidebar = positionSidebar;