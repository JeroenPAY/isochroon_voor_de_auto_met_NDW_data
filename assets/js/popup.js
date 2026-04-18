// Popup functionaliteit
let activePopup = null;
// Click handler configuraties - centrale definitie
const CLICK_HANDLERS = {
    'nodes_points': {
        title: 'Node categorie',
        fields: [
            { name: 'node_cat', label: 'Categorie' },
            { name: 'name', label: 'Naam' },
            { name: 'description', label: 'Beschrijving' },
            { name: 'roadSectionId', label: 'Road ID' }
        ]
    },
    'rvm-lines': {
        title: 'RVM wegsegment',
        fields: [
            { name: 'roadSectionId', label: 'Road ID' },
            { name: 'municipalityName', label: 'Gemeente' },
            { name: 'drivingDirection', label: 'Rijrichting' }
        ]
    }
};

// Interactieve lagen - ALLEEN nodes_points en rvm-lines (GEEN pijltjes!)
const INTERACTIVE_LAYERS = Object.keys(CLICK_HANDLERS);

// Popup click handler - GEFIXTE VERSIE
function setupClickHandlers(map) {
    INTERACTIVE_LAYERS.forEach(layerId => {
        map.on("click", layerId, e => {
            // Controleer of nodes zichtbaar zijn - als dat zo is, geen popup tonen
            if (window.NodeSelector && window.NodeSelector.areNodesVisible()) {
                return;
            }

            // BELANGRIJK: Gebruik queryRenderedFeatures met specifieke laag
            // Dit zorgt dat we alleen features van DEZE laag krijgen
            const features = map.queryRenderedFeatures(e.point, {
                layers: [layerId]
            });

            if (features.length === 0) return;

            const feature = features[0];
            const p = feature.properties;
            const config = CLICK_HANDLERS[layerId];

            let html = `<div style="font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4;">`;
            html += `<strong style="font-size: 14px; color: #333;">${config.title}</strong><br><br>`;

            // Toon standaard velden
            config.fields.forEach(field => {
                if (p[field.name]) html += `<strong style="color: #555;">${field.label}:</strong> ${p[field.name]}<br>`;
            });

            // Voor rvm-lines: zoek ook FIETS traffic data
            if (layerId === 'rvm-lines') {
                const roadSectionId = p.roadSectionId;

                try {
                    // Zoek traffic features
                    const trafficFeatures = map.querySourceFeatures('wkd_traffic', {
                        sourceLayer: 'segments'
                    });

                    // Filter op roadSectionId
                    const matchingFeatures = trafficFeatures.filter(f => {
                        const props = f.properties;
                        return props && props.nwbRoadSectionId == roadSectionId;
                    });

                    if (matchingFeatures.length > 0) {
                        const trafficProps = matchingFeatures[0].properties;

                        // Toon alleen Fiets H en Fiets T
                        if (trafficProps.bicycleForward !== undefined) {
                            html += `<strong style="color: #555;">Fiets H:</strong> ${trafficProps.bicycleForward ? 'Ja' : 'Nee'}<br>`;
                        }
                        if (trafficProps.bicycleBackward !== undefined) {
                            html += `<strong style="color: #555;">Fiets T:</strong> ${trafficProps.bicycleBackward ? 'Ja' : 'Nee'}<br>`;
                        }
                    } else {
                        html += `<strong style="color: #555;">Fiets H:</strong> Onbekend<br>`;
                        html += `<strong style="color: #555;">Fiets T:</strong> Onbekend<br>`;
                    }
                } catch (error) {
                    html += `<strong style="color: #555;">Fiets H:</strong> Fout<br>`;
                    html += `<strong style="color: #555;">Fiets T:</strong> Fout<br>`;
                }
            }

            // VOEG DE LINK TOE ALS ER EEN roadSectionId IS
            const roadSectionId = p.roadSectionId;
            if (roadSectionId) {
                const georgeLink = `https://wegkenmerken.ndw.nu/kaart/wegvakken/${roadSectionId}/kenmerken/verkeerstype?kaartlagen=ADMINISTRATIVE_DIVISION,TRAFFIC_TYPE,TRAFFIC_SIGN,BRT&zoom=true`;
                html += `<br><div style="text-align: center; ">`;
                html += `<a href="${georgeLink}" target="_blank" 
                        style="display: inline-block; 
                               padding: 4px 8px; 
                               background-color: #007cff; 
                               color: white; 
                               text-decoration: none; 
                               border-radius: 6px; 
                               font-weight: bold;
                               font-size: 12px;
                               transition: all 0.2s ease;
                               width: 85%;
                               box-shadow: 0 2px 4px rgba(0, 124, 255, 0.3);">
                  <span style="display: inline-flex; gap: 6px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" text-align="center" fill="white" style="vertical-align: middle;">
                      <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                    </svg>
                    George
                  </span>
                </a>`;
                html += `</div>`;
            }
            html += `</div>`;


            if (activePopup) {
                activePopup.remove();
            }

            activePopup = new maplibregl.Popup({
                closeOnClick: false
            })
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map);

        });
    });
}

// interactive cursor changes
function setupCursorInteractions(map) {
    INTERACTIVE_LAYERS.forEach(layer => {
        map.on("mouseenter", layer, () => {

            if (!window.NodeSelector || !window.NodeSelector.areNodesVisible()) {
                map.getCanvas().style.cursor = "pointer";
            }
        });
        map.on("mouseleave", layer, () => {
            if (!window.NodeSelector || !window.NodeSelector.areNodesVisible()) {
                map.getCanvas().style.cursor = "";
            }
        });
    });
}

// Setup popup handlers (hoofdfunctie om alles te initialiseren)
function setupPopupHandlers(map) {
    if (!map) {
        console.error("Map niet beschikbaar voor setupPopupHandlers");
        return;
    }

    console.log("Setup popup handlers voor:", INTERACTIVE_LAYERS);

    // Wacht tot de lagen bestaan voordat we handlers toevoegen
    function addHandlersWhenLayersExist() {
        const allLayersExist = INTERACTIVE_LAYERS.every(layerId => map.getLayer(layerId));

        if (allLayersExist) {
            setupClickHandlers(map);
            setupCursorInteractions(map);
            console.log("Popup handlers toegevoegd aan:", INTERACTIVE_LAYERS);
        } else {
            // Wacht en probeer opnieuw
            setTimeout(addHandlersWhenLayersExist, 100);
        }
    }

    // Start het proces
    addHandlersWhenLayersExist();
}

// Maak functies globaal beschikbaar
window.CLICK_HANDLERS = CLICK_HANDLERS;
window.INTERACTIVE_LAYERS = INTERACTIVE_LAYERS;
window.setupClickHandlers = setupClickHandlers;
window.setupCursorInteractions = setupCursorInteractions;
window.setupPopupHandlers = setupPopupHandlers;

// Automatische initialisatie als map beschikbaar is
function initPopupModule() {
    console.log("Popup module geladen");

    // Als map al bestaat, setup handlers
    if (window.map) {
        if (window.map.loaded()) {
            setupPopupHandlers(window.map);
        } else {
            window.map.on('load', function () {
                setupPopupHandlers(window.map);
            });
        }
    }
}

// Initialiseer popup module wanneer DOM klaar is
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopupModule);
} else {
    initPopupModule();
}