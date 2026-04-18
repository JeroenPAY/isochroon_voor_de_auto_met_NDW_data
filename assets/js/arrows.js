// Arrow functionaliteit

// Arrow configuraties - PRECIES ZOALS IN WERKENDE VERSIE
const ARROW_CONFIGS = [
    { 
        id: 'traffic-arrows-forward', 
        source: 'wkd_traffic', 
        arrowColor: 'blue', 
        filter: ["all", 
            ["==", ["get", "bicycleForward"], true], 
            ["==", ["get", "bicycleBackward"], false]
        ], 
        offset: [0, -10], 
        rotation: 0 
    },
    { 
        id: 'traffic-arrows-backward', 
        source: 'wkd_traffic', 
        arrowColor: 'blue', 
        filter: ["all", 
            ["==", ["get", "bicycleBackward"], true], 
            ["==", ["get", "bicycleForward"], false]
        ], 
        offset: [0, 10], 
        rotation: 180 
    },
    { 
        id: 'driving-arrows-H', 
        source: 'rvm_segments', 
        arrowColor: 'pink', 
        filter: ["all", 
            ["==", ["get", "municipalityName"], "Helmond"], 
            ["==", ["get", "drivingDirection"], "H"]
        ], 
        offset: [0, 10], 
        rotation: 0 
    },
    { 
        id: 'driving-arrows-T', 
        source: 'rvm_segments', 
        arrowColor: 'pink', 
        filter: ["all", 
            ["==", ["get", "municipalityName"], "Helmond"], 
            ["==", ["get", "drivingDirection"], "T"]
        ], 
        offset: [0, 10], 
        rotation: 180 
    }
];

// Maak arrow image - PRECIES ZOALS IN WERKENDE VERSIE
function createArrow(color, borderColorHex) {
    const canvas = document.getElementById('arrowCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 60, 60);
    
    const centerX = 30, centerY = 30;
    const borderColor = borderColorHex, fillColor = '#ffffff';
    
    ctx.strokeStyle = borderColor;
    ctx.fillStyle = borderColor;
    ctx.lineWidth = 6;
    ctx.lineCap = ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY);
    ctx.lineTo(centerX + 10, centerY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX + 10, centerY);
    ctx.lineTo(centerX, centerY - 6);
    ctx.lineTo(centerX, centerY + 6);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    
    ctx.strokeStyle = ctx.fillStyle = fillColor;
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(centerX - 14, centerY);
    ctx.lineTo(centerX + 8, centerY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(centerX + 8, centerY);
    ctx.lineTo(centerX + 1, centerY - 4);
    ctx.lineTo(centerX + 1, centerY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    return ctx.getImageData(0, 0, 60, 60);
}

// Voeg arrow layers toe aan map
function addArrowLayers(map) {
    if (!map) {
        console.error("Map niet beschikbaar voor addArrowLayers");
        return;
    }
    
    // console.log("Voeg arrow layers toe aan map");
    
    // Maak arrow images aan
    const blueArrow = createArrow('blue', '#080808');  // zwart voor blauwe arrow
    const pinkArrow = createArrow('pink', '#808080');  // grijs voor roze arrow 
    
    // Voeg images toe aan map
    try {
        map.addImage('arrow-blue', blueArrow, { width: 60, height: 60 });
    } catch (error) {
    }
    
    try {
        map.addImage('arrow-pink', pinkArrow, { width: 60, height: 60 });
    } catch (error) {
    }
    
    // Voeg layers toe
    ARROW_CONFIGS.forEach(config => {
        if (map.getLayer(config.id)) {
            console.log(`Laag ${config.id} bestaat al, overslaan`);
            return;
        }
        
        map.addLayer({
            id: config.id,
            type: 'symbol',
            source: config.source,
            'source-layer': config.source === 'wkd_traffic' ? 'segments' : 'roadSections',
            minzoom: 13,
            layout: {
                'symbol-placement': 'line',
                'symbol-spacing': 60,
                'icon-image': `arrow-${config.arrowColor}`,
                'icon-size': 0.6,
                'icon-rotation-alignment': 'map',
                'icon-allow-overlap': true,
                'icon-rotate': config.rotation || 0,
                'icon-offset': config.offset || [0, 0]
            },
            paint: { 'icon-opacity': 0.9 },
            filter: config.filter
        });
        
        // console.log(`Arrow laag ${config.id} toegevoegd (${config.arrowColor})`);
    });
}

// Update arrow visibility - aangepast voor jouw legenda structuur
function updateArrows(map, layerType) {
    if (!map) return;
    
    const eye = document.querySelector(`.legend-eye[data-layer='${layerType}']`);
    if (!eye) {
        console.log(`Geen legend-eye gevonden voor ${layerType}`);
        return;
    }
    
    const showLayer = eye.dataset.state === "on";
    const opacity = showLayer ? 0.9 : 0;
    
    let layers = [];
    if (layerType === 'traffic-arrows') {
        layers = ['traffic-arrows-forward', 'traffic-arrows-backward'];
    } else if (layerType === 'driving-arrows') {
        layers = ['driving-arrows-H', 'driving-arrows-T'];
    }
    
    // console.log(`Update arrows voor ${layerType}: opacity = ${opacity}, layers:`, layers);
    
    layers.forEach(layer => {
        if (map.getLayer(layer)) {
            map.setPaintProperty(layer, 'icon-opacity', opacity);
        } else {
            console.log(`Laag ${layer} bestaat niet op map`);
        }
    });
}

// Update arrow filters voor nieuwe gemeente
function updateArrowFilters(gemeenteNaam) {
    if (!window.map || !ARROW_CONFIGS) {
        console.log("updateArrowFilters: map of ARROW_CONFIGS niet beschikbaar");
        return;
    }
    
    // console.log(`Update arrow filters voor gemeente: ${gemeenteNaam}`);
    
    ARROW_CONFIGS.forEach(config => {
        if (window.map.getLayer(config.id)) {
            let newFilter;
            
            if (config.source === 'rvm_segments') {
                // Driving arrows (roze) - voeg gemeentefilter toe
                newFilter = ["all", 
                    ["==", ["get", "municipalityName"], gemeenteNaam], 
                    ["==", ["get", "drivingDirection"], config.id.includes('-H') ? "H" : "T"]
                ];
            } else {
                // Traffic arrows (blauw) - behoud dezelfde logica maar voeg gemeentenaam toe
                if (config.id === 'traffic-arrows-forward') {
                    newFilter = ["all", 
                        ["==", ["get", "bicycleForward"], true], 
                        ["==", ["get", "bicycleBackward"], false]
                    ];
                } else if (config.id === 'traffic-arrows-backward') {
                    newFilter = ["all", 
                        ["==", ["get", "bicycleBackward"], true], 
                        ["==", ["get", "bicycleForward"], false]
                    ];
                }
            }
            
            window.map.setFilter(config.id, newFilter);
            // console.log(`Filter voor ${config.id} bijgewerkt:`, newFilter);
        } else {
            console.log(`Laag ${config.id} bestaat niet op map`);
        }
    });
}

// Maak functies globaal beschikbaar
window.ARROW_CONFIGS = ARROW_CONFIGS;
window.addArrowLayers = addArrowLayers;
window.updateArrows = updateArrows;
window.updateArrowFilters = updateArrowFilters;