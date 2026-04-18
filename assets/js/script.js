// data/js/script.js
let map;
let currentBasemap = 'pdok-grijs';

function initMap(center, zoom) {
    console.log("[Script] Initialiseer map...");
    
    const loadingStartTime = Date.now();
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
    
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

        const elapsed = Date.now() - loadingStartTime;
        const minTime = 2000;
        const delay = Math.max(0, minTime - elapsed);

        setTimeout(() => {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'none';
        }, delay);
        
        setupMapFeatures();
        
        if (window.initGemeenteSelector) {
            window.initGemeenteSelector(map);
        }
        
        window.GemeenteManager?.loadGemeenteData('0794');
        setTimeout(() => {
            if (window.positionSidebar) window.positionSidebar();
        }, 500);
    });
    
    map.on('error', e => console.error('[Script] MapLibre error:', e.error));
    
    setTimeout(() => {
        console.warn("[Script] Fallback loading hide");
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }, 5000);
}

function getMapStyle() {
    return {
        "version": 8,
        "glyphs": "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
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
                "layout": { "visibility": "none" }
            },
            { 
                "id": "rvm-lines", 
                "type": "line", 
                "source": "rvm_segments", 
                "source-layer": "roadSections", 
                "paint": { 
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
    
    map.addControl(new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true
    }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    
    window.addArrowLayers?.(map) || console.error("[Script] addArrowLayers niet gevonden!");
    
    setupBasemapRadio();
    window.setupPopupHandlers?.(map);
    
    // Initialiseer isochroon calculator via sidebar
    if (window.CalculationsSidebar) {
        window.CalculationsSidebar.init(map);
    }
    
    // Update sidebar voor Helmond
    if (window.CalculationsSidebar && window.CalculationsSidebar.updateForGemeente) {
        window.CalculationsSidebar.updateForGemeente('Helmond');
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

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
    console.log("[Script] DOM geladen");
    
    setTimeout(() => {
        window.GemeenteManager?.setupGemeenteInput();
    }, 100);
    
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

window.initMap = initMap;
window.positionSidebar = positionSidebar;