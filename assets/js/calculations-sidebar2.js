// data/js/calculations-sidebar.js
const CalculationsSidebar = (function() {
    let sidebarInitialized = false;
    let mapInstance = null;
    
    const elementIds = {
        sidebar: 'calculationsSidebar',
        toggleIcon: '.calculations-toggle-icon',
        tabs: '.calculation-tab',
        tabContents: '.calculation-tab-content',
        isochroon: {
            start: 'isochroonStartNode', 
            limitValue: 'limitValue', 
            result: 'isochroonResult',
            calculate: 'calculateIsochroon', 
            clear: 'clearIsochroon', 
            visibility: 'toggleIsochroonVisibility'
        }
    };
    
    function getElement(id) {
        return typeof id === 'string' ? document.getElementById(id) : id;
    }
    
    function showResult(element, message, type = 'info') {
        if (!element) return;
        const colors = { error: '#dc3545', success: '#28a745', loading: '#6c757d' };
        const style = colors[type] ? `color: ${colors[type]}; ${type === 'loading' ? 'font-style: italic;' : ''}` : '';
        element.innerHTML = style ? `<span style="${style}">${message}</span>` : message;
        element.scrollTop = 0;
    }
    
    function setupHandlers() {
        const handlers = {
            [elementIds.isochroon.calculate]: () => handleCalculateIsochroon(),
            [elementIds.isochroon.clear]: () => handleClearIsochroon(),
            [elementIds.isochroon.visibility]: () => handleIsochroonVisibility()
        };
        
        Object.entries(handlers).forEach(([id, handler]) => {
            const element = getElement(id);
            if (element) element.addEventListener('click', handler);
        });
        
        [elementIds.isochroon.start, elementIds.isochroon.limitValue].forEach(id => {
            getElement(id)?.addEventListener('keypress', e => {
                if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    handleCalculateIsochroon(); 
                }
            });
        });
        
        getElement(elementIds.isochroon.start)?.addEventListener('input', () => handleIsochroonStartInput());
        
        setupGemeenteChangeListener();
        setupNodeSelectorListener();
    }
    
    function setupGemeenteChangeListener() {
        document.addEventListener('gemeenteChanged', () => {
            console.log('[CalculationsSidebar] Gemeente gewijzigd - startpunt wissen');
            clearStartPointAndIsochroon();
        });
        
        document.addEventListener('gemeenteDeselected', () => {
            console.log('[CalculationsSidebar] Gemeente gedeselecteerd - startpunt wissen');
            clearStartPointAndIsochroon();
        });
    }
    
    function setupNodeSelectorListener() {
        document.addEventListener('nodeSelected', (e) => {
            const { nodeId, inputField, coordinates } = e.detail;
            console.log(`[CalculationsSidebar] Node ${nodeId} geselecteerd voor ${inputField}`);
            
            if (inputField === 'isochroonStartNode') {
                const startInput = getElement(elementIds.isochroon.start);
                if (startInput) {
                    startInput.value = nodeId;
                    handleIsochroonStartInput();
                }
            }
            
            if (coordinates && mapInstance) {
                mapInstance.flyTo({
                    center: coordinates,
                    zoom: 15,
                    duration: 1000
                });
            }
        });
    }
    
    function clearStartPointAndIsochroon() {
        const startInput = getElement(elementIds.isochroon.start);
        if (startInput) startInput.value = '';
        
        const limitInput = getElement(elementIds.isochroon.limitValue);
        if (limitInput) limitInput.value = '2.5';
        
        showResult(getElement(elementIds.isochroon.result), 
                   "Vul startnode en tijdlimiet (minuten) in om bereikbaar gebied te berekenen.", 
                   'info');
        
        hideStartPointFromMap();
        
        if (window.IsochroonCalculator && mapInstance) {
            window.IsochroonCalculator.clearIsochroonFromMap(mapInstance);
        }
        
        updateVisibilityIcon(true);
        document.dispatchEvent(new CustomEvent('isochroonCleared'));
    }
    
    function init(map) {
        if (sidebarInitialized) return;
        mapInstance = map;
        
        if (!getElement(elementIds.sidebar)) {
            console.warn("[CalculationsSidebar] Sidebar element niet gevonden");
            return;
        }
        
        setupCollapseExpand();
        setupTabs();
        setupHandlers();
        removeObsoleteElements();
        showOnlyIsochroonTab();
        initializeDefaultValues();
        setupIsochroonStartButton();
        
        // Initialiseer isochroon calculator
        if (window.IsochroonCalculator) {
            window.IsochroonCalculator.init();
            window.IsochroonCalculator.setMap(mapInstance);
        }
        
        sidebarInitialized = true;
        console.log("[CalculationsSidebar] Geïnitialiseerd");
    }
    
    function setupCollapseExpand() {
        document.querySelector('.calculations-sidebar-title')?.addEventListener('click', () => {
            const sidebar = getElement(elementIds.sidebar);
            sidebar.classList.toggle('collapsed');
            const toggleIcon = document.querySelector(elementIds.toggleIcon);
            if (toggleIcon) {
                toggleIcon.textContent = sidebar.classList.contains('collapsed') ? 'expand_less' : 'expand_more';
            }
        });
    }
    
    function setupTabs() {
        document.querySelectorAll(elementIds.tabs).forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                if (tabId !== 'isochroon') return;
                
                document.querySelectorAll(elementIds.tabs).forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll(elementIds.tabContents).forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabId}Tab`) content.classList.add('active');
                });
            });
        });
    }
    
    function removeObsoleteElements() {
        const limitTypeSelect = document.getElementById('limitType');
        if (limitTypeSelect) limitTypeSelect.parentNode?.removeChild(limitTypeSelect.parentNode);
        
        const transportSelect = document.getElementById('transport');
        if (transportSelect) transportSelect.parentNode?.removeChild(transportSelect.parentNode);
        
        document.querySelectorAll('label[for="limitType"], label[for="transport"]').forEach(label => {
            label.parentNode?.removeChild(label.parentNode);
        });
    }
    
    function showOnlyIsochroonTab() {
        const routeTab = document.querySelector('[data-tab="route"]');
        if (routeTab) routeTab.style.display = 'none';
        
        const routeTabContent = document.getElementById('routeTab');
        if (routeTabContent) routeTabContent.style.display = 'none';
        
        const isochroonTab = document.querySelector('[data-tab="isochroon"]');
        if (isochroonTab) isochroonTab.classList.add('active');
        
        const isochroonTabContent = document.getElementById('isochroonTab');
        if (isochroonTabContent) isochroonTabContent.classList.add('active');
    }
    
    function initializeDefaultValues() {
        const limitInput = getElement(elementIds.isochroon.limitValue);
        if (limitInput) {
            limitInput.value = '2.5';
            limitInput.placeholder = 'minuten';
        }
    }
    
    function setupIsochroonStartButton() {
        setTimeout(() => {
            const input = document.getElementById('isochroonStartNode');
            if (!input) {
                console.error("[CalculationsSidebar] isochroonStartNode input niet gevonden!");
                return;
            }
            
            const button = createIsochroonButton('Kies startpunt');
            input.parentNode.insertBefore(button, input.nextSibling);
            console.log("[CalculationsSidebar] Isochroon start knop toegevoegd");
        }, 1000);
    }
    
    function createIsochroonButton(buttonText) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'isochroon-select-button';
        button.innerHTML = `
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">location_on</span>
            ${buttonText}
        `;
        button.style.cssText = `
            margin-left: 8px;
            padding: 6px 12px;
            background-color: #377d39;
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
        
        button.addEventListener('mouseenter', () => button.style.backgroundColor = '#2e672f');
        button.addEventListener('mouseleave', () => button.style.backgroundColor = '#377d39');
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log(`[CalculationsSidebar] Startpunt selectie voor isochroon`);
            
            if (window.NodeSelector) {
                window.NodeSelector.setMode('isochroon', 'isochroonStartNode');
                const nodesVisible = window.NodeSelector.toggleNodes('isochroonStartNode');
                
                if (!nodesVisible) {
                    window.utils?.showNotification('Geen startpunten beschikbaar voor huidige gemeente', 'warning', 3000);
                }
            } else {
                console.error('[CalculationsSidebar] NodeSelector niet beschikbaar');
                window.utils?.showNotification('Startpunt selector functionaliteit niet beschikbaar', 'error', 3000);
            }
        });
        
        return button;
    }
    
    function handleIsochroonStartInput() {
        const startInput = getElement(elementIds.isochroon.start);
        if (!startInput) return;
        
        const nodeId = startInput.value.trim();
        if (nodeId && !isNaN(Number(nodeId))) {
            showStartPointOnMap(Number(nodeId));
        } else {
            hideStartPointFromMap();
        }
    }
    
    function handleCalculateIsochroon() {
        const start = getElement(elementIds.isochroon.start)?.value.trim();
        const limitValue = getElement(elementIds.isochroon.limitValue)?.value.trim();
        const resultDiv = getElement(elementIds.isochroon.result);
        
        if (!start || !limitValue) {
            showResult(resultDiv, "Voer een startnode ID en tijdlimiet in.", 'error');
            return;
        }
        
        const numericLimit = parseFloat(limitValue);
        if (isNaN(numericLimit) || numericLimit <= 0) {
            showResult(resultDiv, "Voer een geldige positieve tijdlimiet in (minuten).", 'error');
            return;
        }
        
        if (!window.IsochroonCalculator) {
            showResult(resultDiv, "Isochroon calculator niet beschikbaar.", 'error');
            return;
        }
        
        showResult(resultDiv, `Isochroon wordt berekend voor ${numericLimit} minuten...`, 'loading');
        
        const result = window.IsochroonCalculator.calculateIsochroon(Number(start), numericLimit);
        
        if (!result.success) {
            showResult(resultDiv, result.message, 'error');
            return;
        }
        
        const resultHTML = createIsochroonResultHTML(start, numericLimit, result);
        showResult(resultDiv, resultHTML, 'success');
        
        if (mapInstance && result.edges.length > 0) {
            ensureIsochroonVisibility();
            window.IsochroonCalculator.showIsochroonOnMap(result.edges, mapInstance, numericLimit);
        }
        
        document.dispatchEvent(new CustomEvent('isochroonCalculated', {
            detail: { success: true, edges: result.edges, stats: result.stats }
        }));
        
        window.utils?.showNotification(`${result.edges.length} wegen bereikbaar binnen ${numericLimit} minuten`, 'success');
    }
    
    function handleClearIsochroon() {
        getElement(elementIds.isochroon.start).value = '';
        getElement(elementIds.isochroon.limitValue).value = '2.5';
        
        showResult(getElement(elementIds.isochroon.result), 
                   "Vul startnode en tijdlimiet (minuten) in om bereikbaar gebied te berekenen.", 
                   'info');
        
        hideStartPointFromMap();
        
        if (window.IsochroonCalculator && mapInstance) {
            window.IsochroonCalculator.clearIsochroonFromMap(mapInstance);
        }
        
        window.utils?.showNotification("Isochroon gewist", 'info');
        document.dispatchEvent(new CustomEvent('isochroonCleared'));
    }
    
    function handleIsochroonVisibility() {
        if (!window.IsochroonCalculator || !mapInstance) return;
        const isVisible = window.IsochroonCalculator.toggleIsochroonVisibility(mapInstance);
        updateVisibilityIcon(isVisible);
    }
    
    function updateVisibilityIcon(isVisible) {
        const icon = document.querySelector('.isochroon-visibility-icon');
        const text = document.querySelector('.isochroon-visibility-text');
        
        if (icon) icon.textContent = isVisible ? 'visibility' : 'visibility_off';
        if (text) text.textContent = isVisible ? 'Isochroon weergeven' : 'Isochroon verbergen';
    }
    
    function ensureIsochroonVisibility() {
        if (!window.IsochroonCalculator || !mapInstance) return;
        
        if (typeof window.IsochroonCalculator.isIsochroonVisible === 'function' && 
            !window.IsochroonCalculator.isIsochroonVisible()) {
            window.IsochroonCalculator.toggleIsochroonVisibility(mapInstance);
            updateVisibilityIcon(true);
        }
    }
    
    function createIsochroonResultHTML(start, timeLimitMinutes, result) {
        let html = `<strong>✓ ${result.message}</strong><br>`;
        html += `<strong>Start node:</strong> ${start}<br>`;
        html += `<strong>Tijdlimiet:</strong> ${timeLimitMinutes} minuten<br><br>`;
        
        if (result.stats) {
            html += `<strong>Statistieken:</strong><br>`;
            html += `• ${result.stats.edgeCount} wegsegmenten bereikbaar<br>`;
            html += `• ${result.stats.nodeCount} knooppunten bereikbaar<br>`;
            html += `• Dekking: ${result.stats.coverage} van het netwerk<br>`;
            html += `• Gemiddelde reistijd: ${result.stats.avgTimeMinutes} minuten<br>`;
            html += `• Maximale reistijd: ${result.stats.maxTimeMinutes} minuten<br><br>`;
        }
        
        const displayEdges = result.edges.slice(0, 3);
        if (displayEdges.length > 0) {
            html += `<strong>Voorbeeld edges:</strong><br>`;
            displayEdges.forEach(edge => {
                const timeMinutes = edge.time_minutes ? edge.time_minutes.toFixed(2) : 
                                 (window.IsochroonCalculator?.secondsToMinutes ? 
                                  window.IsochroonCalculator.secondsToMinutes(edge.time_seconds || edge.agg_cost || 0).toFixed(2) : 'N/A');
                html += `Edge ${edge.edgeId} (${timeMinutes} min)<br>`;
            });
            if (result.edges.length > 3) {
                html += `... en ${result.edges.length - 3} meer<br>`;
            }
        }
        return html;
    }
    
    function showStartPointOnMap(nodeId) {
        if (!mapInstance || !nodeId || !window.NodeSelector) return false;
        
        hideStartPointFromMap();
        
        const nodeData = window.NodeSelector.findNodeById(nodeId);
        if (!nodeData) return false;
        
        try {
            mapInstance.addSource('isochroon-start-point', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: { id: nodeId, label: 'Startpunt' },
                    geometry: { type: 'Point', coordinates: nodeData.coordinates }
                }
            });
            
            mapInstance.addLayer({
                id: 'isochroon-start-point-layer',
                type: 'circle',
                source: 'isochroon-start-point',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#FFD700',
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.9,
                    'circle-stroke-opacity': 1
                }
            });
            
            mapInstance.addLayer({
                id: 'isochroon-start-point-label',
                type: 'symbol',
                source: 'isochroon-start-point',
                layout: {
                    'text-field': 'Startpunt',
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
            
            return true;
        } catch (error) {
            console.error('[CalculationsSidebar] Fout bij tonen startpunt:', error);
            return false;
        }
    }
    
    function hideStartPointFromMap() {
        if (!mapInstance) return;
        try {
            if (mapInstance.getLayer('isochroon-start-point-label')) mapInstance.removeLayer('isochroon-start-point-label');
            if (mapInstance.getLayer('isochroon-start-point-layer')) mapInstance.removeLayer('isochroon-start-point-layer');
            if (mapInstance.getSource('isochroon-start-point')) mapInstance.removeSource('isochroon-start-point');
        } catch(e) {}
    }
    
    function updateForGemeente(gemeenteNaam) {
        const isEnabled = gemeenteNaam === 'Helmond';
        Object.values(elementIds.isochroon).forEach(id => {
            const element = getElement(id);
            if (element) element.disabled = !isEnabled;
        });
        
        if (!isEnabled) {
            showResult(getElement(elementIds.isochroon.result), 
                      'Isochroonberekening momenteel alleen beschikbaar voor Helmond', 'warning');
        } else {
            showResult(getElement(elementIds.isochroon.result), 
                      "Vul startnode en tijdlimiet (minuten) in om bereikbaar gebied te berekenen.", 'info');
        }
    }
    
    return {
        init,
        updateForGemeente,
        clearStartPointAndIsochroon,
        getMap: () => mapInstance
    };
})();

window.CalculationsSidebar = CalculationsSidebar;