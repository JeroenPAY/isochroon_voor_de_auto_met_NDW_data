// data/js/input_nodes.js
// Node selector voor kaartinteractie

class NodeSelector {
    constructor() {
        this.layerId = 'selectable-nodes';
        this.sourceId = 'selectable-nodes-source';
        this.hoverLayerId = 'selectable-nodes-hover';
        this.selectedNode = null;
        this.currentInputField = null;
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
    }
    
    // NIEUW: Luister naar gemeente wijzigingen
    setupGemeenteChangeListener() {
        document.addEventListener('gemeenteChanged', this.onGemeenteChanged);
        document.addEventListener('gemeenteDeselected', this.onGemeenteChanged);
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

    loadNodes() {
        if (typeof nodesData === 'undefined') {
            console.error('Bereikbaarheid data niet gevonden');
            window.utils?.showNotification('Bereikbaarheid data niet gevonden', 'error', 5000);
            return false;
        }

        return {
            type: 'FeatureCollection',
            features: nodesData.features.map(feature => ({
                type: 'Feature',
                properties: {
                    node: feature.properties.node,
                    gme_naam: feature.properties.gme_naam
                },
                geometry: {
                    type: 'Point',
                    coordinates: feature.geometry.coordinates[0]
                }
            }))
        };
    }

    showNodes(inputFieldId = null) {
        if (!window.map) return false;
        
        this.hideNodes();
        const dataNodes = this.loadNodes();
        if (!dataNodes?.features.length) {
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
        // Disable alle popup handlers op de interactieve lagen
        if (window.INTERACTIVE_LAYERS && window.map) {
            window.INTERACTIVE_LAYERS.forEach(layerId => {
                // Verwijder click handlers voor popups
                window.map.off('click', layerId);
                // Verwijder hover handlers voor popups
                window.map.off('mouseenter', layerId);
                window.map.off('mouseleave', layerId);
            });
        }
    }

    enableMapPopups() {
        // Herstel de popup handlers na het selecteren
        if (window.INTERACTIVE_LAYERS && window.map && window.setupPopupHandlers) {
            // Opnieuw setup van popup handlers
            window.setupClickHandlers(window.map);
            window.setupCursorInteractions(window.map);
        }
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
        if (typeof nodesData === 'undefined') return null;
        
        const nodeFeature = nodesData.features.find(
            feature => parseInt(feature.properties.node) === parseInt(nodeId)
        );
        
        return nodeFeature ? {
            id: nodeFeature.properties.node,
            coordinates: nodeFeature.geometry.coordinates[0],
            gemeente: nodeFeature.properties.gme_naam
        } : null;
    }

    getNodesByGemeente(gemeenteNaam) {
        if (typeof nodesData === 'undefined') return [];
        
        return nodesData.features
            .filter(feature => feature.properties.gme_naam === gemeenteNaam)
            .map(feature => ({
                id: feature.properties.node,
                coordinates: feature.geometry.coordinates[0]
            }));
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