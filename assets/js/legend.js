// GLOBALE VARIABELE om roadColors bij te houden
let currentRoadColors = {};

// Toggle visibility van een laag
function toggleVisibility(eye) {
    const newState = eye.dataset.state === "on" ? "off" : "on";
    eye.dataset.state = newState;
    eye.textContent = newState === "on" ? "visibility" : "visibility_off";
    eye.style.color = newState === "on" ? "#333" : "#aaa";

    const layer = eye.dataset.layer;
    const type = eye.dataset.type;

    // console.log(`Toggle visibility voor layer: ${layer}, type: ${type}, nieuwe state: ${newState}`);

    if (layer === "nodes_points") {
        updateNodes();
    } else if (layer === "rvm-lines") {
        updateRvm();
    } else if (layer === "traffic-arrows" || layer === "driving-arrows") {
        updateArrows(layer);
    }
}

// Update node visibility
function updateNodes() {
    if (!window.map || !window.map.getLayer("nodes_points")) {
        console.warn("Kan nodes niet updaten: map of laag niet beschikbaar");
        return;
    }

    // console.log("Update nodes visibility...");

    const eyes = [...document.querySelectorAll(".legend-eye[data-layer='nodes_points']")];
    const colorExpr = ["match", ["get", "node_cat"]];
    const strokeExpr = ["match", ["get", "node_cat"]];

    const colorMap = getNodeColorMap();

    eyes.forEach(eye => {
        const type = eye.dataset.type;
        const isVisible = eye.dataset.state === "on";
        const color = isVisible ? colorMap[type] : "rgba(0,0,0,0)";
        colorExpr.push(type, color);
        strokeExpr.push(type, isVisible ? "#ffffff" : "rgba(0,0,0,0)");
    });

    colorExpr.push("rgba(0,0,0,0)");
    strokeExpr.push("rgba(0,0,0,0)");

    window.map.setPaintProperty("nodes_points", "circle-color", colorExpr);
    window.map.setPaintProperty("nodes_points", "circle-stroke-color", strokeExpr);

    // console.log("Nodes visibility geupdate");
}

// Update RVM lines colors
function updateRvm() {
    if (!window.map || !window.map.getLayer("rvm-lines")) {
        console.warn("Kan RVM niet updaten: map of laag niet beschikbaar");
        return;
    }

    // console.log("Update RVM kleuren...");

    const eyes = [...document.querySelectorAll(".legend-eye[data-layer='rvm-lines']")];
    const activeColors = {};
    eyes.forEach(eye => {
        activeColors[eye.dataset.type] = eye.dataset.state === "on";
    });

    const expr = ["match", ["get", "roadSectionId"]];
    const colorMap = {
        "white": "#ffffff",
        "red": "#ff3333",
        "blue": "#3399ff",
        "orange": "#ff9900",
        "green": "#00cc00"
    };

    if (currentRoadColors && typeof currentRoadColors === 'object') {
        for (const [color, ids] of Object.entries(currentRoadColors)) {
            if (ids && Array.isArray(ids)) {
                // VOEG ALTIJD ID'S TOE, MAAR GEEN KLEUR ALS NIET ACTIEF
                if (activeColors[color]) {
                    ids.forEach(id => {
                        expr.push(id, colorMap[color] || "#00cc00");
                    });
                } else {
                    // Als de kleur niet actief is, voeg de IDs toe met transparante kleur
                    ids.forEach(id => {
                        expr.push(id, "rgba(0,0,0,0)");
                    });
                }
            }
        }
    }

    // FALLBACK: voeg "green" IDs toe als die actief is, anders transparant
    if (activeColors.green) {
        // Als er groene IDs zijn in currentRoadColors
        if (currentRoadColors.green && Array.isArray(currentRoadColors.green)) {
            currentRoadColors.green.forEach(id => {
                expr.push(id, "#00cc00");
            });
        }
        // Fallback voor ALLE andere wegen die niet in de categorieën zitten
        expr.push("#00cc00");
    } else {
        // Als groen niet actief is, maak alles transparant
        expr.push("rgba(0,0,0,0)");
    }

    try {
        window.map.setPaintProperty("rvm-lines", "line-color", expr);
        // console.log("RVM kleuren succesvol bijgewerkt");
    } catch (error) {
        console.error("Fout bij updateRvm:", error);
    }
}


// Update arrow visibility
function updateArrows(layerType) {
    if (!window.map) {
        console.warn("Kan arrows niet updaten: map niet beschikbaar");
        return;
    }

    // console.log(`Update arrow visibility voor: ${layerType}`);

    const eye = document.querySelector(`.legend-eye[data-layer='${layerType}']`);
    if (!eye) return;

    const showLayer = eye.dataset.state === "on";
    const opacity = showLayer ? 0.9 : 0;

    let layers = [];
    if (layerType === 'traffic-arrows') {
        layers = ['traffic-arrows-forward', 'traffic-arrows-backward'];
    } else if (layerType === 'driving-arrows') {
        layers = ['driving-arrows-H', 'driving-arrows-T'];
    }

    layers.forEach(layer => {
        if (window.map.getLayer(layer)) {
            window.map.setPaintProperty(layer, 'icon-opacity', opacity);
        }
    });
}

// Verwerk radio button selectie
function handleBasemapChange(basemapType) {
    if (!window.map) {
        console.warn("Kan basemap niet wijzigen: map niet beschikbaar");
        return;
    }

    // console.log(`Wijzig achtergrondkaart naar: ${basemapType}`);

    if (basemapType === "esri-satellite") {
        showEsriSatellite();
    } else if (basemapType === "pdok-grijs") {
        showGrayBackground();
    }
}

// Toon Esri satelliet
function showEsriSatellite() {
    if (!window.map) return;

    // console.log("Toon Esri satelliet achtergrond");

    // Verberg grijze achtergrond
    if (window.map.getLayer('background-layer')) {
        window.map.setLayoutProperty('background-layer', 'visibility', 'none');
    }

    // Toon Esri satelliet
    if (window.map.getLayer('esri-satellite-layer')) {
        window.map.setLayoutProperty('esri-satellite-layer', 'visibility', 'visible');
    }
}

// Toon grijze achtergrondkaart
function showGrayBackground() {
    if (!window.map) return;

    // console.log("Toon grijze achtergrondkaart");

    // Verberg Esri satelliet
    if (window.map.getLayer('esri-satellite-layer')) {
        window.map.setLayoutProperty('esri-satellite-layer', 'visibility', 'none');
    }

    // Toon grijze achtergrond
    if (window.map.getLayer('background-layer')) {
        window.map.setLayoutProperty('background-layer', 'visibility', 'visible');
    }
}

// Setup legend controls
function setupLegendControls(map) {
    // Initialiseer alle oogjes
    document.querySelectorAll(".legend-eye").forEach(eye => {
        // Stel initiële state in
        const initialState = eye.dataset.state || "on";
        eye.dataset.state = initialState;
        eye.textContent = initialState === "on" ? "visibility" : "visibility_off";
        eye.style.color = initialState === "on" ? "#333" : "#aaa";

        // Voeg click handler toe
        eye.addEventListener("click", () => toggleVisibility(eye));
    });

    // Setup radio buttons voor achtergrondkaarten
    const radioButtons = document.querySelectorAll('.basemap-radio');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                handleBasemapChange(this.value);
            }
        });
    });

    // Legenda toggle (expand/collapse)
    const legend = document.getElementById('legend');
    const title = document.querySelector('.legend-title');
    const toggleIcon = document.querySelector('.toggle-icon');

    if (title && toggleIcon) {
        title.addEventListener('click', () => {
            const isCollapsed = legend.classList.toggle('collapsed');
            toggleIcon.textContent = isCollapsed ? 'expand_less' : 'expand_more';
        });
    }

    // console.log("Legend controls setup voltooid");
}

// Get node color map
function getNodeColorMap() {
    return {
        "Bron / Gat": "#ff69b4",
        "Rijrichting": "#add8e6",
        "Niet toegestaan": "#800080",
        "Verkeestype Ontbreekt": "#040843",
        "Fout fietspad": "#ff0000"
    };
}

// Functie om roadColors in te stellen
function setRoadColors(roadColors) {
    if (!roadColors || typeof roadColors !== 'object') {
        console.warn("Ongeldige roadColors ontvangen:", roadColors);
        currentRoadColors = {};
        return;
    }

    currentRoadColors = roadColors;
    // console.log("RoadColors ingesteld in legend.js:", Object.keys(currentRoadColors).length, "categorieën");

    // Voeg ook een "green" categorie toe voor alle andere wegen
    if (!currentRoadColors.green) {
        currentRoadColors.green = [];
    }
}

// Maak alle functies globaal beschikbaar
window.toggleVisibility = toggleVisibility;
window.updateNodes = updateNodes;
window.updateRvm = updateRvm;
window.updateArrows = updateArrows;
window.handleBasemapChange = handleBasemapChange;
window.showEsriSatellite = showEsriSatellite;
window.showGrayBackground = showGrayBackground;
window.setRoadColors = setRoadColors;
window.setupLegendControls = setupLegendControls;

console.log("legend.js geladen en functies globaal beschikbaar gemaakt");