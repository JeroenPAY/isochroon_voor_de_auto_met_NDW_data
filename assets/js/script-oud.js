// data/js/script.js - Vereenvoudigde versie: alleen isochroon functionaliteit
let map;
let currentBasemap = 'pdok-grijs';

function initMap(center, zoom) {
    console.log("[Script] Initialiseer map...");
    window.utils?.showLoading();
    
    map = new maplibregl.Map({
        container: "map",
        style: getMapStyle(),
        center: center || [5.66, 51.47],
        zoom: zoom || 12,
        attributionControl: false
    });

    window.map = map;

    map.once("load", () => {
        console.log("[Script] Map geladen");
        window.utils?.hideLoading();
        
        // Setup functies
        setupMapFeatures();
        
        // Laad initiële data
        window.GemeenteManager?.loadGemeenteData('0794');
        
        // Positioneer sidebar
        setTimeout(positionSidebar, 500);
    });
    
    map.on('error', e => console.error('[Script] MapLibre error:', e.error));
    
    setTimeout(() => window.utils?.hideLoading(), 5000);
}

function getMapStyle() {
    return {
        "version": 8,
        "sources": {
            "pdok-grijs": { 
                "type": "raster", 
                "tiles": ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"], 
                "tileSize": 256,
                "attribution": "© PDOK"
            },
            "esri-satellite": { 
                "type": "raster", 
                "tiles": ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"], 
                "tileSize": 256,
                "attribution": "© Esri"
            },
            "rvm_segments": { 
                "type": "vector", 
                "tiles": ["https://maps.ndw.nu/api/v1/nwb/latest/mbtiles/roadSections/tiles/{z}/{x}/{y}.pbf"] 
            },
            "wkd_traffic": { 
                "type": "vector", 
                "tiles": ["https://maps.ndw.nu/api/v1/wkdTrafficTypes/20251101/mbtiles/segments/tiles/{z}/{x}/{y}.pbf"], 
                "maxzoom": 20, 
                "minzoom": 4 
            }
        },
        "layers": [
            { 
                "id": "pdok-grijs-layer", 
                "type": "raster", 
                "source": "pdok-grijs", 
                "paint": { 
                    "raster-brightness-max": 0.3,
                    "raster-contrast": 0.3, 
                    "raster-saturation": -0.8,
                    "raster-opacity": 0.9 
                } 
            },
            { 
                "id": "esri-satellite-layer", 
                "type": "raster", 
                "source": "esri-satellite", 
                "paint": {
                    "raster-opacity": 0.9,
                    "raster-brightness-max": 0.6,
                    "raster-contrast": 0.5,
                    "raster-saturation": 0.0
                },
                "layout": { "visibility": "none" } // standaard verborgen
            },
            { 
                "id": "rvm-lines", 
                "type": "line", 
                "source": "rvm_segments", 
                "source-layer": "roadSections", 
                "paint": { 
                    // ALLE wegen krijgen dezelfde kleur: rgba(11, 11, 11, 1)
                    "line-color": "rgba(11, 11, 11, 1)",
                    "line-width": 2.5,
                    "line-opacity": 0.8
                }, 
                "filter": ["==", ["get", "municipalityName"], "Helmond"] 
            }
        ]
    };
}

function setupMapFeatures() {
       window.setupLegendControls?.(map);
    // Controls
    map.addControl(new maplibregl.NavigationControl({
        showCompass: false,   // geen kompas
        showZoom: true        // alleen zoom knoppen
    }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    
    // Layers
    window.addArrowLayers?.(map) || console.error("[Script] addArrowLayers niet gevonden!");
    
    // Event listeners
    setupGemeenteEventListeners();
    setupBasemapRadio();
    setupIsochroonStartButton();
    window.setupPopupHandlers?.(map);
    
    // Alleen isochroon calculator
    initIsochroonCalculator();
    
    // Update sidebar
    window.CalculationsSidebar?.init();
    window.CalculationsSidebar?.updateForGemeente('Helmond');
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
        const { success, edges } = e.detail;
        if (success) {
            window.utils?.showNotification(
                `${edges?.length || 0} wegen bereikbaar binnen limiet`,
                'success',
                3000
            );
        }
    });
    
    // Node selected (alleen voor isochroon)
    document.addEventListener('nodeSelected', (e) => {
        const { nodeId, inputField, coordinates } = e.detail;
        console.log(`[Script] Node ${nodeId} geselecteerd voor ${inputField}`);
        
        // Vul het isochroon start veld in
        const isochroonInput = document.getElementById('isochroonStartNode');
        if (isochroonInput && inputField === 'isochroonStartNode') {
            isochroonInput.value = nodeId;
        }
        
        // Zoom naar de geselecteerde node
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
        if (type && window.updateArrowCounts) {
            window.updateArrowCounts(type, count);
        }
    });
}

function updateGemeenteFeatures(gemeenteNaam) {
    // Update arrow filters
    window.updateArrowFilters?.(gemeenteNaam);
    
    // Update RVM filter
    if (map?.getLayer('rvm-lines')) {
        map.setFilter('rvm-lines', ["==", ["get", "municipalityName"], gemeenteNaam]);
        console.log("[Script] RVM filter geupdate:", gemeenteNaam);
    }
    
    // Update sidebar
    window.CalculationsSidebar?.updateForGemeente(gemeenteNaam);
    
    // Clear isochroon als er een actieve is
    if (window.IsochroonCalculator?.getCurrentIsochroon()) {
        console.log("[Script] Wis isochroon bij gemeentewissel");
        window.IsochroonCalculator.clearIsochroonFromMap(map);
        window.utils?.showNotification(`Isochroon gewist (gemeente gewijzigd naar ${gemeenteNaam})`, 'info');
    }
}

function setupBasemapRadio() {
    const radioButtons = document.querySelectorAll('input[name="basemap"]');
    if (!radioButtons.length) return console.warn("[Script] Geen basemap radio buttons");
    
    console.log("[Script] Setup basemap radio");
    
    const currentRadio = document.querySelector(`input[name="basemap"][value="${currentBasemap}"]`);
    currentRadio && (currentRadio.checked = true);
    
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function() {
            if (!this.checked) return;
            
            const basemap = this.value;
            console.log("[Script] Basemap gewijzigd:", basemap);
            
            if (basemap === 'esri-satellite') {
                map.setLayoutProperty('pdok-grijs-layer', 'visibility', 'none');
                map.setLayoutProperty('esri-satellite-layer', 'visibility', 'visible');
            } else {
                map.setLayoutProperty('esri-satellite-layer', 'visibility', 'none');
                map.setLayoutProperty('pdok-grijs-layer', 'visibility', 'visible');
            }
            
            currentBasemap = basemap;
            window.utils?.showNotification(
                `Achtergrond: ${basemap === 'esri-satellite' ? 'Luchtfoto' : 'PDOK Grijs'}`,
                'info'
            );
        });
    });
}

function setupIsochroonStartButton() {
    console.log("[Script] Setup isochroon start knop");
    
    setTimeout(() => {
        const input = document.getElementById('isochroonStartNode');
        if (!input) {
            console.error("[Script] isochroonStartNode input niet gevonden!");
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
    
    window.GemeenteManager?.setupGemeenteInput();
    
    initMap();
    
    window.addEventListener('resize', debounce(() => {
        console.log("[Script] Scherm grootte gewijzigd");
        positionSidebar();
    }, 250));
});

// Utility functies
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

// Global error handling
window.addEventListener('error', e => {
    console.error('[Script] JavaScript error:', e.message, 'at', e.filename, 'line', e.lineno);
    window.utils?.showNotification(`Er is een fout opgetreden: ${e.message}`, 'error', 5000);
});

// Herinitialiseer bij netwerk herstel
window.addEventListener('online', () => {
    console.log("[Script] Netwerk hersteld");
    
    if (window.IsochroonCalculator?.getGraphSize() === 0) {
        console.log("[Script] Herinitialiseer isochroon calculator");
        setTimeout(() => window.IsochroonCalculator?.init?.(), 1500);
    }
});




// Exporteer functies
window.initMap = initMap;
window.positionSidebar = positionSidebar;