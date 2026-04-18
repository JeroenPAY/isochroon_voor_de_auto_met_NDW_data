// data/js/isochroon-calculator.js
const IsochroonCalculator = (function () {
    let graph = null;
    let currentIsochroon = null;
    let isochroonVisible = true;
    let reachableEdges = new Map();
    let mapInstance = null;

    const helpers = {
        getRoadCostData: (d) => d || window.GemeenteManager?.getData('roadCost') || window.roadCost,
        minutesToSeconds: (m) => m * 60,
        secondsToMinutes: (s) => s / 60,
        formatTime: (s) => `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')}`,
        hexToRgb: (h) => ({
            r: parseInt(h.slice(1,3),16),
            g: parseInt(h.slice(3,5),16),
            b: parseInt(h.slice(5,7),16)
        })
    };

    function buildGraph(data = null) {
        const d = helpers.getRoadCostData(data);
        if (!d?.features) {
            console.error("[IsochroonCalculator] Geen roadCost data!");
            return new Map();
        }

        const g = new Map();
        d.features.forEach(f => {
            const {source, target, cost, reverse_cost, id} = f.properties;
            [source, target].forEach(n => !g.has(n) && g.set(n, []));
            if (cost >= 0) g.get(source).push({to: target, cost, edgeId: id, direction: 'forward'});
            if (reverse_cost >= 0) g.get(target).push({to: source, cost: reverse_cost, edgeId: id, direction: 'backward'});
        });

        console.log(`[IsochroonCalculator] Graph: ${g.size} nodes, ${Array.from(g.values()).reduce((sum, edges) => sum + edges.length, 0)} edges`);
        return g;
    }

    function init(data = null) {
        graph = buildGraph(data);
        return !!(graph && graph.size > 0);
    }
    
    function setMap(map) {
        mapInstance = map;
    }
 
    function calculateIsochroon(start, timeLimitMinutes) {
        if (!graph?.size) return error("Geen netwerkdata geladen.");
        if (!graph.has(start)) return error("Startnode komt niet voor in netwerk.");
        if (timeLimitMinutes <= 0) return error("Voer positieve tijdslimiet in.");

        const timeLimitSeconds = helpers.minutesToSeconds(timeLimitMinutes);
        reachableEdges = new Map();
        
        const minTimesToNodes = new Map([[start, 0]]);
        
        const priorityQueue = {
            items: [],
            enqueue: function(item) {
                this.items.push(item);
                let i = this.items.length - 1;
                while (i > 0 && this.items[i].cost < this.items[Math.floor((i-1)/2)].cost) {
                    const parent = Math.floor((i-1)/2);
                    [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
                    i = parent;
                }
            },
            dequeue: function() {
                if (this.items.length === 0) return null;
                const result = this.items[0];
                const last = this.items.pop();
                if (this.items.length > 0) {
                    this.items[0] = last;
                    let i = 0;
                    while (true) {
                        const left = 2*i + 1;
                        const right = 2*i + 2;
                        let smallest = i;
                        
                        if (left < this.items.length && this.items[left].cost < this.items[smallest].cost) {
                            smallest = left;
                        }
                        if (right < this.items.length && this.items[right].cost < this.items[smallest].cost) {
                            smallest = right;
                        }
                        if (smallest === i) break;
                        
                        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
                        i = smallest;
                    }
                }
                return result;
            },
            isEmpty: function() {
                return this.items.length === 0;
            }
        };
        
        console.log(`[IsochroonCalculator] Start isochroon berekening: node ${start}, limit ${timeLimitSeconds}s`);
        
        priorityQueue.enqueue({ node: start, cost: 0 });

        while (!priorityQueue.isEmpty()) {
            const { node, cost: currentCost } = priorityQueue.dequeue();
            
            const bestTimeToNode = minTimesToNodes.get(node);
            if (bestTimeToNode !== undefined && currentCost > bestTimeToNode) {
                continue;
            }
            
            const neighbors = graph.get(node) || [];
            
            for (const edge of neighbors) {
                const newCost = currentCost + edge.cost;
                
                if (newCost > timeLimitSeconds) continue;
                
                const existingBestTime = minTimesToNodes.get(edge.to);
                if (existingBestTime === undefined || newCost < existingBestTime) {
                    minTimesToNodes.set(edge.to, newCost);
                    priorityQueue.enqueue({ node: edge.to, cost: newCost });
                }
                
                const edgeKey = `${edge.edgeId}_${edge.direction || 'forward'}_${node}_${edge.to}`;
                
                if (!reachableEdges.has(edgeKey) || newCost - edge.cost < reachableEdges.get(edgeKey).startTime) {
                    reachableEdges.set(edgeKey, {
                        edgeId: edge.edgeId,
                        edgeKey: edgeKey,
                        time_seconds: newCost,
                        time_minutes: helpers.secondsToMinutes(newCost),
                        source: node,
                        target: edge.to,
                        direction: edge.direction || 'forward',
                        agg_cost: newCost,
                        startTime: newCost - edge.cost,
                        endTime: newCost
                    });
                }
            }
            
            if (reachableEdges.size > 50000) {
                console.warn("[IsochroonCalculator] Veel edges gevonden, break preventie");
                break;
            }
        }

        const edges = Array.from(reachableEdges.values());
        const stats = calculateStats(edges, minTimesToNodes.size, timeLimitMinutes);
        currentIsochroon = {
            edges, 
            startNode: start, 
            timeLimitMinutes, 
            timeLimitSeconds, 
            visitedNodes: minTimesToNodes.size
        };

        console.log(`[IsochroonCalculator] ${edges.length} edges binnen ${timeLimitMinutes} min, ${minTimesToNodes.size} nodes bezocht`);
        
        return {
            success: true, 
            message: `${edges.length} wegen bereikbaar binnen ${timeLimitMinutes} minuten`, 
            edges, 
            stats, 
            visitedNodes: minTimesToNodes.size
        };
    }

    function calculateStats(edges, nodeCount, timeLimitMinutes) {
        if (!edges.length) return {edgeCount: 0, nodeCount: 0, avgTimeMinutes: 0, maxTimeMinutes: 0};

        const totalSeconds = edges.reduce((sum, e) => sum + e.time_seconds, 0);
        const maxSeconds = Math.max(...edges.map(e => e.time_seconds));
        const coverage = graph ? `${Math.min(100, (nodeCount / graph.size * 100)).toFixed(1)}%` : "0%";

        return {
            edgeCount: edges.length,
            nodeCount,
            totalTimeMinutes: helpers.secondsToMinutes(totalSeconds).toFixed(2),
            avgTimeMinutes: helpers.secondsToMinutes(totalSeconds / edges.length).toFixed(2),
            maxTimeMinutes: helpers.secondsToMinutes(maxSeconds).toFixed(2),
            coverage,
            timeLimitMinutes,
            timeLimitFormatted: helpers.formatTime(helpers.minutesToSeconds(timeLimitMinutes))
        };
    }

    function showIsochroonOnMap(edges, map, timeLimitMinutes = null) {
        if (!map) return console.error("[IsochroonCalculator] Geen map!");
        
        removeIsochroonLayers(map);
        if (!edges?.length) return removeIsochroonLegend();
        
        const timeLimit = timeLimitMinutes || currentIsochroon?.timeLimitMinutes || 5;
        const edgeMap = new Map();
        
        edges.forEach(edge => {
            const timeSeconds = edge.time_seconds || edge.agg_cost || 0;
            const existing = edgeMap.get(edge.edgeId);
            
            if (!existing || timeSeconds < existing.timeSeconds) {
                edgeMap.set(edge.edgeId, {
                    edgeId: edge.edgeId,
                    timeSeconds,
                    timePercentage: Math.min(100, (timeSeconds / helpers.minutesToSeconds(timeLimit)) * 100)
                });
            }
        });

        const uniqueEdges = Array.from(edgeMap.values());
        const colorClasses = getColorClasses(timeLimit);

        console.log(`[IsochroonCalculator] ${uniqueEdges.length} unieke edges voor visualisatie`);
        
        colorClasses.forEach((cls, i) => {
            const roadSectionIds = uniqueEdges
                .filter(e => {
                    const p = e.timePercentage;
                    if (i === 0) return p <= cls.max;
                    if (i === 3) return p > cls.min;
                    return p > cls.min && p <= cls.max;
                })
                .map(e => e.edgeId);
            
            console.log(`[IsochroonCalculator] Klasse ${i} (${cls.min}%-${cls.max}%): ${roadSectionIds.length} edges`);
            
            if (!roadSectionIds.length) return;

            const config = {
                id: `isochroon-roads-${i}`,
                type: 'line',
                source: 'rvm_segments',
                'source-layer': 'roadSections',
                paint: {
                    'line-color': cls.color,
                    'line-width': 3,
                    'line-opacity': isochroonVisible ? 0.9 : 0,
                    'line-blur': 0
                },
                filter: ['in', ['get', 'roadSectionId'], ['literal', roadSectionIds]]
            };

            try {
                if (map.getLayer('rvm-lines')) {
                    const layers = map.getStyle().layers;
                    const rvmLinesIndex = layers.findIndex(l => l.id === 'rvm-lines');
                    if (rvmLinesIndex !== -1 && rvmLinesIndex + 1 < layers.length) {
                        map.addLayer(config, layers[rvmLinesIndex + 1].id);
                        return;
                    }
                }
                map.addLayer(config);
                setTimeout(() => { 
                    try { map.moveLayer(`isochroon-roads-${i}`); } catch {} 
                }, 100);
            } catch (err) {
                console.error(`[IsochroonCalculator] Laag ${i} error:`, err);
                try { map.addLayer(config); } catch (e2) {}
            }
        });

        addIsochroonLegend(colorClasses, timeLimit);
    }

    function getColorClasses(timeLimitMinutes) {
        const colors = ['#e5ff00e0', '#00d131', '#00b4d4', '#5407e3'];
        const classWidth = 25;
        
        return colors.map((color, i) => {
            const min = i * classWidth;
            const max = i === 3 ? 100 : (i + 1) * classWidth;
            const minMin = helpers.secondsToMinutes((min / 100) * helpers.minutesToSeconds(timeLimitMinutes));
            const maxMin = helpers.secondsToMinutes((max / 100) * helpers.minutesToSeconds(timeLimitMinutes));
            
            let label = '';
            if (i === 0) label = `≤ ${maxMin.toFixed(0)} min`;
            else if (i === 3) label = `${minMin.toFixed(0)}+ min`;
            else label = `${minMin.toFixed(0)}-${maxMin.toFixed(0)} min`;
            
            return {min, max, color, label};
        });
    }

    function addIsochroonLegend(colorClasses, timeLimitMinutes) {
        removeIsochroonLegend();
        const legend = document.getElementById('legend');
        const content = legend?.querySelector('.legend-content');
        if (!legend || !content) return;

        const section = document.createElement('div');
        section.className = 'legend-section isochroon-section';
        section.innerHTML = `
            <div class="legend-section-title">
                <span>Isochroon (${timeLimitMinutes} min)</span>
                <span class="legend-toggle-icon material-symbols-outlined" style="font-size:16px;cursor:pointer;margin-left:5px;">
                    ${isochroonVisible ? 'visibility' : 'visibility_off'}
                </span>
            </div>
            <div class="isochroon-legend-items" style="margin-top:8px">
                ${colorClasses.map(cls => `
                    <div class="legend-item" style="margin-bottom:4px;display:flex;align-items:center">
                        <div class="legend-symbol" style="width:20px;height:12px;margin-right:8px">
                            <div class="legend-line" style="background-color:${cls.color};height:100%;width:100%;border-radius:2px;opacity:${isochroonVisible ? '1' : '0.3'}"></div>
                        </div>
                        <div class="legend-text" style="font-size:12px">${cls.label}</div>
                    </div>
                `).join('')}
            </div>
        `;

        const wegenSection = [...content.querySelectorAll('.legend-section')]
            .find(s => s.querySelector('.legend-section-title')?.textContent.includes('Wegen'));
        content.insertBefore(section, wegenSection ? wegenSection.nextSibling : content.firstChild);

        section.querySelector('.legend-toggle-icon')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.IsochroonCalculator && mapInstance) {
                const visible = window.IsochroonCalculator.toggleIsochroonVisibility(mapInstance);
                e.target.textContent = visible ? 'visibility' : 'visibility_off';
                updateLegendOpacity(visible);
            }
        });

        const legendElement = document.getElementById('legend');
        if (legendElement?.classList.contains('collapsed')) {
            legendElement.classList.remove('collapsed');
            const legendContent = legendElement.querySelector('.legend-content');
            const icon = legendElement.querySelector('.toggle-icon');
            if (legendContent) legendContent.style.display = 'block';
            if (icon) icon.textContent = 'expand_more';
        }
    }

    function updateLegendOpacity(isVisible) {
        document.querySelectorAll('.isochroon-section .legend-line').forEach(line => {
            const rgb = helpers.hexToRgb(line.style.backgroundColor);
            line.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isVisible ? 1 : 0.3})`;
        });
    }

    function removeIsochroonLegend() {
        document.querySelector('.legend-section.isochroon-section')?.remove();
    }

    function removeIsochroonLayers(map) {
        if (!map) return;
        for (let i = 0; i < 4; i++) {
            try { 
                if (map.getLayer(`isochroon-roads-${i}`)) {
                    map.removeLayer(`isochroon-roads-${i}`);
                }
            } catch(e) {}
        }
        try { 
            if (map.getLayer('isochroon-roads')) {
                map.removeLayer('isochroon-roads');
            }
        } catch(e) {}
    }

    function clearIsochroonFromMap(map) {
        if (!map) return;
        removeIsochroonLayers(map);
        removeIsochroonLegend();
        currentIsochroon = null;
        reachableEdges = new Map();
    }

    function toggleIsochroonVisibility(map) {
        if (!map) return isochroonVisible;
        
        isochroonVisible = !isochroonVisible;
        console.log(`[IsochroonCalculator] Zichtbaar: ${isochroonVisible ? 'AAN' : 'UIT'}`);

        for (let i = 0; i < 4; i++) {
            try {
                if (map.getLayer(`isochroon-roads-${i}`)) {
                    map.setPaintProperty(`isochroon-roads-${i}`, 'line-opacity', isochroonVisible ? 0.9 : 0);
                }
            } catch(e) {}
        }

        updateLegendOpacity(isochroonVisible);
        const icon = document.querySelector('.isochroon-section .legend-toggle-icon');
        if (icon) icon.textContent = isochroonVisible ? 'visibility' : 'visibility_off';

        return isochroonVisible;
    }

    function updateData(roadCostData) {
        currentIsochroon = null;
        reachableEdges = new Map();
        graph = buildGraph(roadCostData);
        console.log(`[IsochroonCalculator] Data geüpdatet: ${graph?.size || 0} nodes`);
    }

    function clear() {
        graph = currentIsochroon = null;
        reachableEdges = new Map();
        if (mapInstance) clearIsochroonFromMap(mapInstance);
    }

    function nodeExists(nodeId) {
        return graph?.has(Number(nodeId)) || false;
    }

    function getSampleNodes() {
        return graph ? Array.from(graph.keys()).slice(0, 5) : [];
    }

    function error(message) {
        return {success: false, message, edges: [], stats: {}};
    }

    return {
        init, 
        setMap,
        updateData, 
        clear, 
        calculateIsochroon, 
        showIsochroonOnMap, 
        clearIsochroonFromMap,
        toggleIsochroonVisibility, 
        getSampleNodes, 
        nodeExists, 
        getCurrentIsochroon: () => currentIsochroon,
        isIsochroonVisible: () => isochroonVisible, 
        getGraphSize: () => graph?.size || 0,
        minutesToSeconds: helpers.minutesToSeconds, 
        secondsToMinutes: helpers.secondsToMinutes,
        formatTime: helpers.formatTime
    };
})();

window.IsochroonCalculator = IsochroonCalculator;

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('gemeenteAllDataLoaded', (event) => {
        const {gemeenteCode, roadCost} = event.detail;
        if (window.GemeenteManager && gemeenteCode === window.GemeenteManager.getCurrentGemeenteCode()) {
            window.IsochroonCalculator.updateData(roadCost);
        }
    });
});