// data/js/calculations-sidebar.js
// Sidebar management voor isochroon berekeningen (alleen tijd in minuten)

const CalculationsSidebar = (function() {
    let sidebarInitialized = false;
    
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
            [elementIds.isochroon.calculate]: handleCalculateIsochroon,
            [elementIds.isochroon.clear]: handleClearIsochroon,
            [elementIds.isochroon.visibility]: handleIsochroonVisibility
        };
        
        Object.entries(handlers).forEach(([id, handler]) => {
            const element = getElement(id);
            if (element) element.addEventListener('click', handler);
        });
        
        // Enter handlers voor isochroon
        [elementIds.isochroon.start, elementIds.isochroon.limitValue].forEach(id => {
            getElement(id)?.addEventListener('keypress', e => {
                if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    handleCalculateIsochroon(); 
                }
            });
        });
        
        // Toon startpunt bij input change
        getElement(elementIds.isochroon.start)?.addEventListener('input', handleIsochroonStartInput);
        
        // LUISTER NAAR GEMEENTE WIJZIGINGEN OM START PUNT TE WISSEN
        setupGemeenteChangeListener();
    }
    
    // NIEUW: Luister naar gemeente wijzigingen
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
    
    // NIEUW: Wis startpunt en isochroon bij gemeente wissel
    function clearStartPointAndIsochroon() {
        // Wis het startpunt input veld
        const startInput = getElement(elementIds.isochroon.start);
        if (startInput) {
            startInput.value = '';
        }
        
        // Reset tijdlimiet naar standaardwaarde (optioneel)
        const limitInput = getElement(elementIds.isochroon.limitValue);
        if (limitInput) {
            limitInput.value = '2.5';
        }
        
        // Reset resultaatmelding
        showResult(getElement(elementIds.isochroon.result), 
                   "Vul startnode en tijdlimiet (minuten) in om bereikbaar gebied te berekenen.", 
                   'info');
        
        // Verwijder startpunt van kaart
        hideStartPointFromMap();
        
        // Verwijder isochroon van kaart
        if (window.IsochroonCalculator && window.map) {
            if (typeof window.IsochroonCalculator.clearIsochroonFromMap === 'function') {
                window.IsochroonCalculator.clearIsochroonFromMap(window.map);
            } else if (typeof window.IsochroonCalculator.clearIsochroon === 'function') {
                window.IsochroonCalculator.clearIsochroon();
            }
        }
        
        // Update visibility icon
        updateVisibilityIcon(true);
        
        // Stuur clear event
        document.dispatchEvent(new CustomEvent('isochroonCleared'));
    }
    
    function init() {
        if (sidebarInitialized || !getElement(elementIds.sidebar)) return;
        
        // Collapse/expand functionaliteit
        document.querySelector('.calculations-sidebar-title')?.addEventListener('click', () => {
            const sidebar = getElement(elementIds.sidebar);
            sidebar.classList.toggle('collapsed');
            const toggleIcon = document.querySelector(elementIds.toggleIcon);
            if (toggleIcon) toggleIcon.textContent = sidebar.classList.contains('collapsed') ? 'expand_less' : 'expand_more';
        });
        
        // Tab functionaliteit (nu alleen isochroon tab)
        document.querySelectorAll(elementIds.tabs).forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                // Alleen isochroon tab laten werken
                if (tabId !== 'isochroon') return;
                
                document.querySelectorAll(elementIds.tabs).forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll(elementIds.tabContents).forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabId}Tab`) content.classList.add('active');
                });
            });
        });
        
        setupHandlers();
        
        // Verwijder overbodige HTML elementen
        removeObsoleteElements();
        
        sidebarInitialized = true;
        
        // Toon alleen isochroon tab
        showOnlyIsochroonTab();
        
        // Stel standaardwaarde in voor tijdlimiet
        initializeDefaultValues();
    }
    
    function removeObsoleteElements() {
        // Verwijder limitType select
        const limitTypeSelect = document.getElementById('limitType');
        if (limitTypeSelect) {
            limitTypeSelect.parentNode?.removeChild(limitTypeSelect.parentNode);
        }
        
        // Verwijder transport select
        const transportSelect = document.getElementById('transport');
        if (transportSelect) {
            transportSelect.parentNode?.removeChild(transportSelect.parentNode);
        }
        
        // Verwijder bijbehorende labels
        document.querySelectorAll('label[for="limitType"], label[for="transport"]').forEach(label => {
            label.parentNode?.removeChild(label.parentNode);
        });
        
        console.log("[CalculationsSidebar] Overbodige form elementen verwijderd");
    }
    
    function showOnlyIsochroonTab() {
        // Verberg route tab
        const routeTab = document.querySelector('[data-tab="route"]');
        if (routeTab) routeTab.style.display = 'none';
        
        const routeTabContent = document.getElementById('routeTab');
        if (routeTabContent) routeTabContent.style.display = 'none';
        
        // Zorg dat isochroon tab actief is
        const isochroonTab = document.querySelector('[data-tab="isochroon"]');
        if (isochroonTab) {
            isochroonTab.classList.add('active');
        }
        
        const isochroonTabContent = document.getElementById('isochroonTab');
        if (isochroonTabContent) {
            isochroonTabContent.classList.add('active');
        }
    }
    
    function initializeDefaultValues() {
        // Stel standaard tijdlimiet in (5 minuten)
        const limitInput = getElement(elementIds.isochroon.limitValue);
        if (limitInput) {
            limitInput.value = '2.5';
            limitInput.placeholder = 'minuten';
        }
    }
    
    function handleIsochroonStartInput() {
        const startInput = getElement(elementIds.isochroon.start);
        if (!startInput) return;
        
        const nodeId = startInput.value.trim();
        if (nodeId && !isNaN(Number(nodeId))) {
            // Toon startpunt op kaart
            showStartPointOnMap(Number(nodeId));
        } else {
            // Verwijder startpunt als input leeg is
            hideStartPointFromMap();
        }
    }
    
    function handleCalculateIsochroon() {
        const ids = elementIds.isochroon;
        const start = getElement(ids.start)?.value.trim();
        const limitValue = getElement(ids.limitValue)?.value.trim();
        const resultDiv = getElement(ids.result);
        
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
        
        if (window.map && result.edges.length > 0) {
            ensureIsochroonVisibility();
            
            // ROEP DE NIEUWE FUNCTIE AAN MET DE TIJD LIMIET
            window.IsochroonCalculator.showIsochroonOnMap(result.edges, window.map, numericLimit);
        }
        
        // Stuur event met nieuwe data structuur
        document.dispatchEvent(new CustomEvent('isochroonCalculated', {
            detail: { 
                success: true, 
                edges: result.edges,
                stats: result.stats
            }
        }));
        
        showNotification(`${result.edges.length} wegen bereikbaar binnen ${numericLimit} minuten`, 'success');
        switchToTab('isochroon');
    }
    
    function handleClearIsochroon() {
        // Wis de inputs
        getElement(elementIds.isochroon.start).value = '';
        getElement(elementIds.isochroon.limitValue).value = '2.5';
        
        // Reset resultaatmelding
        showResult(getElement(elementIds.isochroon.result), 
                   "Vul startnode en tijdlimiet (minuten) in om bereikbaar gebied te berekenen.", 
                   'info');
        
        // Verwijder startpunt van kaart
        hideStartPointFromMap();
        
        // BELANGRIJK: Roep de correcte functie aan om isochroon te verwijderen
        // Controleer eerst of de calculator bestaat
        if (window.IsochroonCalculator && window.map) {
            // Gebruik de nieuwe clear functie
            if (typeof window.IsochroonCalculator.clearIsochroonFromMap === 'function') {
                window.IsochroonCalculator.clearIsochroonFromMap(window.map);
            } 
            // Fallback voor oude versie
            else if (typeof window.IsochroonCalculator.clearIsochroon === 'function') {
                window.IsochroonCalculator.clearIsochroon();
            }
        }
        
        showNotification("Isochroon gewist", 'info');
        
        // Stuur clear event
        document.dispatchEvent(new CustomEvent('isochroonCleared'));
    }
    
    function handleIsochroonVisibility() {
        if (!window.IsochroonCalculator || !window.map) return;
        
        // Controleer of de nieuwe toggle functie bestaat
        if (typeof window.IsochroonCalculator.toggleIsochroonVisibility === 'function') {
            const isVisible = window.IsochroonCalculator.toggleIsochroonVisibility(window.map);
            updateVisibilityIcon(isVisible);
        }
    }
    
    function updateVisibilityIcon(isVisible) {
        const icon = document.querySelector('.isochroon-visibility-icon');
        const text = document.querySelector('.isochroon-visibility-text');
        
        if (icon) {
            icon.textContent = isVisible ? 'visibility' : 'visibility_off';
        }
        if (text) {
            text.textContent = isVisible ? 'Isochroon weergeven' : 'Isochroon verbergen';
        }
    }
    
    // functie om isochroon zichtbaar te maken als het uit staat
    function ensureIsochroonVisibility() {
        if (!window.IsochroonCalculator || !window.map) return;
        
        if (typeof window.IsochroonCalculator.isIsochroonVisible === 'function' && 
            !window.IsochroonCalculator.isIsochroonVisible()) {
            window.IsochroonCalculator.toggleIsochroonVisibility(window.map);
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
    
    function switchToTab(tabName) {
        // Alleen isochroon tab ondersteunen
        if (tabName !== 'isochroon') return;
        
        document.querySelectorAll(elementIds.tabs).forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll(elementIds.tabContents).forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });
    }
    
    function showPointOnMap(nodeId, sourceId, layerId, labelId, color, labelText) {
        if (!window.map || !nodeId || !window.NodeSelector) return false;
        
        hidePointFromMap([layerId, labelId], sourceId);
        
        const nodeData = window.NodeSelector.findNodeById(nodeId);
        if (!nodeData) return false;
        
        try {
            window.map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: { id: nodeId, label: labelText },
                    geometry: { type: 'Point', coordinates: nodeData.coordinates }
                }
            });
            
            window.map.addLayer({
                id: layerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': 8,
                    'circle-color': color,
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#000000',
                    'circle-opacity': 0.9,
                    'circle-stroke-opacity': 1
                }
            });
            
            window.map.addLayer({
                id: labelId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'text-field': labelText,
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
            console.error('[CalculationsSidebar] Fout bij tonen punt:', error);
            return false;
        }
    }
    
    function hidePointFromMap(layers, sourceId) {
        if (!window.map) return;
        layers.forEach(layerId => {
            if (window.map.getLayer(layerId)) window.map.removeLayer(layerId);
        });
        if (window.map.getSource(sourceId)) window.map.removeSource(sourceId);
    }
    
    function showStartPointOnMap(nodeId) {
        return showPointOnMap(nodeId, 'isochroon-start-point', 'isochroon-start-point-layer', 
                            'isochroon-start-point-label', '#FFD700', `Startpunt`);
    }
    
    function hideStartPointFromMap() {
        hidePointFromMap(['isochroon-start-point-label', 'isochroon-start-point-layer'], 'isochroon-start-point');
    }
    
    function toggleVisibility(iconSelector, textSelector, calculator, name) {
        const icon = document.querySelector(iconSelector);
        const text = document.querySelector(textSelector);
        if (!icon || !text || !calculator || !window.map) return;
        
        let newVisibility;
        if (name === 'Isochroon' && typeof calculator.toggleIsochroonVisibility === 'function') {
            newVisibility = calculator.toggleIsochroonVisibility(window.map);
        } else return;
        
        icon.textContent = newVisibility ? 'visibility' : 'visibility_off';
        text.textContent = newVisibility ? `${name} weergeven` : `${name} verbergen`;
    }
    
    function showNotification(message, type) {
        window.utils?.showNotification?.(message, type);
    }
    
    function updateForGemeente(gemeenteNaam) {
        const isEnabled = true;
        Object.values(elementIds.isochroon).forEach(id => {
            const element = getElement(id);
            if (element) element.toggleAttribute('disabled', !isEnabled);
        });
        
        if (!isEnabled) {
            showResult(getElement(elementIds.isochroon.result), 'Isochroonberekening momenteel alleen beschikbaar voor Helmond');
        }
    }
    
    return {
        init,
        switchToTab,
        updateForGemeente,
        showStartPointOnMap,
        hideStartPointFromMap,
        ensureIsochroonVisibility,
        clearStartPointAndIsochroon  // Exporteer voor externe calls
    };
})();

window.CalculationsSidebar = CalculationsSidebar;
document.addEventListener('DOMContentLoaded', CalculationsSidebar.init);