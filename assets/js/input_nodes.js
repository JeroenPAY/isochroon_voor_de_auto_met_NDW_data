// data/js/input_nodes.js
// Node selector voor kaartinteractie

class NodeSelector {
    constructor() {
        this.layerId = 'selectable-nodes';
        this.sourceId = 'selectable-nodes-source';
        this.hoverLayerId = 'selectable-nodes-hover';
        this.selectedNode = null;
        this.currentInputField = null;
        this.pendingInputField = null;
        this.bindEvents();
        
        // LUISTER NAAR GEMEENTE WIJZIGINGEN OM NODES TE VERBERGEN
        this.setupGemeenteChangeListener();
    }

    bindEvents() {
        this.showNodes = this.showNodes.bind(this);
        this.hideNodes = this.hideNodes.bind(this);
        this.toggleNodes = this.toggleNodes.bind(this);
        this.onNodeClick = this.onNodeClick.bind(this);
        this.onNodeHover = this.onNodeHover.bind(this);
        this.onNodeLeave = this.onNodeLeave.bind(this);
        this.handleMapClick = this.handleMapClick.bind(this);
        this.onGemeenteChanged = this.onGemeenteChanged.bind(this);
        this.onNodesDataLoaded = this.onNodesDataLoaded.bind(this);
    }
    
    // NIEUW: Luister naar gemeente wijzigingen
    setupGemeenteChangeListener() {
        document.addEventListener('gemeenteChanged', this.onGemeenteChanged);
        document.addEventListener('gemeenteDeselected', this.onGemeenteChanged);
        document.addEventListener('gemeenteNodesDataLoaded', this.onNodesDataLoaded);
    }
    
    // NIEUW: Wordt aangeroepen wanneer gemeente verandert
    onGemeenteChanged() {
        console.log('[NodeSelector] Gemeente gewijzigd - nodes verbergen');
        
        // Verberg nodes als ze zichtbaar zijn
        if (this.areNodesVisible()) {
            this.hideNodes();
        }
        
        // Reset de huidige input field
        this.currentInputField = null;
        this.selectedNode = null;
    }

    onNodesDataLoaded() {
        if (!this.pendingInputField || this.areNodesVisible()) return;

        const inputField = this.pendingInputField;
        this.pendingInputField = null;
        this.showNodes(inputField);
    }

    getNodesData() {
        if (window.GemeenteManager?.getData) {
            if (!window.GemeenteManager.isDataAvailable?.('nodes')) {
                return null;
            }

            const nodes = window.GemeenteManager.getData('nodes');
            if (!nodes?.features?.length) return null;

            const allGemeenten = typeof gemeenten !== 'undefined' ? gemeenten : [];
            const activeCodes = window.GemeenteManager.getActiveGemeenteCodes?.() || [];
            const activeNames = activeCodes
                .map(code => allGemeenten.find(gemeente => gemeente.code === code)?.naam)
                .filter(Boolean);

            if (!activeNames.length) return nodes;

            return {
                ...nodes,
                features: nodes.features.filter(feature => activeNames.includes(feature.properties?.gme_naam))
            };
        }

        return window.nodesData || null;
    }

    getNodeCoordinates(feature) {
        const coordinates = feature?.geometry?.coordinates;
        if (!coordinates) return null;
        return typeof coordinates[0] === 'number' ? coordinates : coordinates[0];
    }

    loadNodes() {
        const nodes = this.getNodesData();
        if (!nodes?.features?.length) {
            const message = window.GemeenteManager?.isDataAvailable?.('nodes') === false
                ? 'Bereikbaarheid data wordt nog geladen'
                : 'Bereikbaarheid data niet gevonden';
            console.error(message);
            window.utils?.showNotification(message, 'error', 5000);
            return false;
        }

        return {
            type: 'FeatureCollection',
            features: nodes.features
                .map(feature => {
                    const coordinates = this.getNodeCoordinates(feature);
                    if (!coordinates) return null;

                    return {
                        type: 'Feature',
                        properties: {
                            node: feature.properties.node,
                            gme_naam: feature.properties.gme_naam
                        },
                        geometry: {
                            type: 'Point',
                            coordinates
                        }
                    };
                })
                .filter(Boolean)
        };
    }

    showNodes(inputFieldId = null) {
        if (!window.map) return false;
        
        this.hideNodes();
        const dataNodes = this.loadNodes();
        if (!dataNodes?.features.length) {
            if (window.GemeenteManager?.isDataAvailable?.('nodes') === false) {
                this.pendingInputField = inputFieldId;
            }
            console.warn('Geen nodes om te tonen');
            return false;
        }

        try {
            // VERWIJDER OUDE POPUP HANDLERS VOOR NODE LAYERS
            this.disableMapPopups();
            
            window.map.addSource(this.sourceId, {
                type: 'geojson',
                data: dataNodes
            });

            window.map.addLayer({
                id: this.layerId,
                type: 'circle',
                source: this.sourceId,
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#47a34a',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.8
                }
            });

            window.map.addLayer({
                id: this.hoverLayerId,
                type: 'circle',
                source: this.sourceId,
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#FFEB3B',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0
                },
                filter: ['==', 'node', '']
            });

            window.map.on('click', this.layerId, this.onNodeClick);
            window.map.on('mouseenter', this.layerId, this.onNodeHover);
            window.map.on('mouseleave', this.layerId, this.onNodeLeave);
            window.map.on('click', this.handleMapClick);

            this.currentInputField = inputFieldId;
            
            window.utils?.showNotification(
                `${dataNodes.features.length} nodes getoond. Klik op een node om te selecteren.`,
                'info',
                4000
            );
            return true;
        } catch (error) {
            console.error('Fout bij tonen nodes:', error);
            return false;
        }
    }

    disableMapPopups() {
        // Popup handlers blijven geregistreerd; ze negeren clicks zolang nodes zichtbaar zijn.
    }

    enableMapPopups() {
        // Geen herstel nodig, zie disableMapPopups.
    }

    handleMapClick(e) {
        if (!this.areNodesVisible()) return;
        
        const features = window.map.queryRenderedFeatures(e.point, {
            layers: [this.layerId]
        });
        
        if (features.length > 0) {
            // Stop propagation om te voorkomen dat andere handlers worden geactiveerd
            e.preventDefault();
            e.stopPropagation();
        }
    }

    hideNodes() {
        if (!window.map) return;

        try {
            if (window.map.getLayer(this.layerId)) {
                window.map.off('click', this.layerId, this.onNodeClick);
                window.map.off('mouseenter', this.layerId, this.onNodeHover);
                window.map.off('mouseleave', this.layerId, this.onNodeLeave);
            }

            window.map.off('click', this.handleMapClick);
            
            if (window.map.getLayer(this.hoverLayerId)) {
                window.map.removeLayer(this.hoverLayerId);
            }
            
            if (window.map.getLayer(this.layerId)) {
                window.map.removeLayer(this.layerId);
            }
            
            if (window.map.getSource(this.sourceId)) {
                window.map.removeSource(this.sourceId);
            }

            this.selectedNode = null;
            this.currentInputField = null;
            
            // HERSTEL POPUP HANDLERS NA HET VERBERGEN VAN NODES
            this.enableMapPopups();
        } catch (error) {
            console.error('Fout bij verbergen nodes:', error);
        }
    }

    onNodeHover(e) {
        if (!e.features?.length) return;
        
        const nodeId = e.features[0].properties.node;
        window.map.getCanvas().style.cursor = 'pointer';
        window.map.setFilter(this.hoverLayerId, ['==', 'node', nodeId]);
        window.map.setPaintProperty(this.hoverLayerId, 'circle-opacity', 0.9);
    }

    onNodeLeave() {
        window.map.getCanvas().style.cursor = '';
        window.map.setPaintProperty(this.hoverLayerId, 'circle-opacity', 0);
    }

    onNodeClick(e) {
        const feature = e.features[0];
        if (!feature) return;

        const nodeId = feature.properties.node;
        this.selectedNode = nodeId;

        // Verwijder eventuele bestaande popups
        const popups = document.getElementsByClassName('maplibregl-popup');
        while (popups[0]) {
            popups[0].remove();
        }

        window.map.setPaintProperty(this.hoverLayerId, 'circle-color', '#FF5722');
        window.map.setPaintProperty(this.hoverLayerId, 'circle-opacity', 0.9);

        if (this.currentInputField) {
            const inputField = document.getElementById(this.currentInputField);
            if (inputField) {
                inputField.value = nodeId;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
                inputField.focus();
            }
        }

        window.utils?.showNotification(`Node ${nodeId} geselecteerd`, 'success', 2000);

        setTimeout(() => this.hideNodes(), 500);

        document.dispatchEvent(new CustomEvent('nodeSelected', {
            detail: {
                nodeId: nodeId,
                inputField: this.currentInputField,
                coordinates: feature.geometry.coordinates
            }
        }));
        
        // Stop event propagation om te voorkomen dat andere handlers worden geactiveerd
        e.preventDefault();
        e.stopPropagation();
        
        // VOORKOM DAT DE MAP CLICK HANDLER WORDT GEACTIVEERD
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        
        // Return false om verdere bubbling te stoppen
        return false;
    }

    toggleNodes(inputFieldId = null) {
        return window.map?.getLayer(this.layerId) 
            ? (this.hideNodes(), false) 
            : this.showNodes(inputFieldId);
    }

    setMode(mode, inputFieldId) {
        this.currentInputField = inputFieldId;
        console.log(`Mode: ${mode} voor input ${inputFieldId}`);
    }

    findNodeById(nodeId) {
        const nodes = this.getNodesData();
        if (!nodes?.features?.length) return null;
        
        const nodeFeature = nodes.features.find(
            feature => parseInt(feature.properties.node) === parseInt(nodeId)
        );

        const coordinates = this.getNodeCoordinates(nodeFeature);
        
        return nodeFeature && coordinates ? {
            id: nodeFeature.properties.node,
            coordinates,
            gemeente: nodeFeature.properties.gme_naam
        } : null;
    }

    getNodesByGemeente(gemeenteNaam) {
        const nodes = this.getNodesData();
        if (!nodes?.features?.length) return [];
        
        return nodes.features
            .filter(feature => feature.properties.gme_naam === gemeenteNaam)
            .map(feature => {
                const coordinates = this.getNodeCoordinates(feature);
                if (!coordinates) return null;
                return {
                    id: feature.properties.node,
                    coordinates
                };
            })
            .filter(Boolean);
    }

    areNodesVisible() {
        return window.map?.getLayer(this.layerId);
    }
    
    // Toon node direct op kaart zonder selectie modus
    showNodeOnMap(nodeId, options = {}) {
        if (!window.map || !nodeId || isNaN(Number(nodeId))) return false;
        
        const nodeData = this.findNodeById(Number(nodeId));
        if (!nodeData) return false;
        
        const defaults = {
            sourceId: 'node-marker',
            layerId: 'node-marker-layer',
            labelId: 'node-marker-label',
            color: '#2196F3',
            label: `Node ${nodeId}`,
            radius: 8,
            showLabel: true
        };
        
        const config = { ...defaults, ...options };
        
        try {
            // Verwijder eerst als het al bestaat
            this.hideNodeFromMap(config);
            
            window.map.addSource(config.sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: { id: nodeId, label: config.label },
                    geometry: { type: 'Point', coordinates: nodeData.coordinates }
                }
            });
            
            window.map.addLayer({
                id: config.layerId,
                type: 'circle',
                source: config.sourceId,
                paint: {
                    'circle-radius': config.radius,
                    'circle-color': config.color,
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.9,
                    'circle-stroke-opacity': 1
                }
            });
            
            if (config.showLabel) {
                window.map.addLayer({
                    id: config.labelId,
                    type: 'symbol',
                    source: config.sourceId,
                    layout: {
                        'text-field': config.label,
                        'text-font': ['Open Sans Bold'],
                        'text-size': 12,
                        'text-offset': [0, -2],
                        'text-anchor': 'top'
                    },
                    paint: {
                        'text-color': '#000000',
                        'text-halo-color': '#FFFFFF',
                        'text-halo-width': 2
                    }
                });
            }
            
            return true;
        } catch (error) {
            console.error('Fout bij tonen node op kaart:', error);
            return false;
        }
    }
    
    // Verwijder node van kaart
    hideNodeFromMap(options = {}) {
        if (!window.map) return;
        
        const defaults = {
            sourceId: 'node-marker',
            layerId: 'node-marker-layer',
            labelId: 'node-marker-label'
        };
        
        const config = { ...defaults, ...options };
        
        try {
            if (window.map.getLayer(config.labelId)) window.map.removeLayer(config.labelId);
            if (window.map.getLayer(config.layerId)) window.map.removeLayer(config.layerId);
            if (window.map.getSource(config.sourceId)) window.map.removeSource(config.sourceId);
        } catch (error) {
            console.error('Fout bij verbergen node van kaart:', error);
        }
    }
}

window.NodeSelector = new NodeSelector();
