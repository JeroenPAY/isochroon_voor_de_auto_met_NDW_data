// data/js/gemeente-manager.js
// Vereenvoudigde Gemeente Manager - alleen isochroon functionaliteit

const boundsCache = new Map(); // Alleen voor bounds van gemeenten
const dataFileCache = new Map();

let current = {
    code: null,
    activeCodes: [],
    roadCost: null,
    nodes: null,
    loading: { roadCost: false, nodes: false }
};

let omstrekenEnabled = false;
let loadSequence = 0;

function getGemeenteCodesForLoad(gemeenteCode) {
    const surroundingCodes = omstrekenEnabled && typeof omstreken !== 'undefined'
        ? (omstreken[gemeenteCode] || [])
        : [];

    return [...new Set([gemeenteCode, ...surroundingCodes])]
        .filter(code => code && code !== '0000');
}

function getGemeenteNamesForCodes(codes) {
    return codes
        .map(code => gemeenten.find(g => g.code === code)?.naam)
        .filter(Boolean);
}

function getMunicipalityFilterForCodes(codes) {
    const names = getGemeenteNamesForCodes(codes);
    if (names.length === 1) {
        return ["==", ["get", "municipalityName"], names[0]];
    }
    return ["in", ["get", "municipalityName"], ["literal", names]];
}

function mergeFeatureCollections(collections, name) {
    return {
        type: 'FeatureCollection',
        name,
        features: collections.flatMap(collection => collection?.features || [])
    };
}

function loadGemeenteData(gemeenteCode) {
    console.log(`[Gemeente Manager] Laden gemeente ${gemeenteCode}...`);
    const loadId = ++loadSequence;
    
    // Verwijder oude scripts en globale variabelen
    cleanupGlobals();
    
    // Reset current object
    const activeCodes = getGemeenteCodesForLoad(gemeenteCode);
    current = {
        code: gemeenteCode,
        activeCodes,
        roadCost: null,
        nodes: null,
        loading: { roadCost: false, nodes: false }
    };
    
    // Stuur loading event
    document.dispatchEvent(new CustomEvent('gemeenteLoadingStarted', { detail: { gemeenteCode } }));
    
    // Laad alle data
    loadAllData(gemeenteCode, activeCodes, loadId);
    
    // Update map en events
    const gemeenteInfo = gemeenten.find(g => g.code === gemeenteCode);
    if (gemeenteInfo && window.map) {
        window.map.setFilter("rvm-lines", getMunicipalityFilterForCodes(activeCodes));
        window.updateArrowFilters?.(getGemeenteNamesForCodes(activeCodes));
        document.dispatchEvent(new CustomEvent('gemeenteChanged', { 
            detail: { gemeenteCode, gemeenteInfo, gemeenteNaam: gemeenteInfo.naam, activeCodes } 
        }));
        zoomToGemeente(gemeenteInfo);
    }
    
    // Update input veld
    updateGemeenteInput(gemeenteCode);
}

function loadAllDataLegacy(gemeenteCode) {
    const baseUrl = `data/gemeentes/${gemeenteCode}`;
    
    const loadDataset = (url, varName) => 
        loadScript(url, varName, gemeenteCode)
            .then(data => {
                // Map de variabele naam naar het juiste loading veld
                let loadingKey;
                if (varName === 'roadCost') loadingKey = 'roadCost';
                else if (varName === 'nodes') loadingKey = 'nodes';
                else loadingKey = varName;
                
                // Sla data op
                current[varName] = data;
                current.loading[loadingKey] = true;
                
                // Stuur het juiste event
                let eventName;
                if (varName === 'roadCost') eventName = 'gemeenteRoadCostLoaded';
                else if (varName === 'nodes') eventName = 'gemeenteBereikbaarheidLoaded';
                else eventName = `gemeente${varName.charAt(0).toUpperCase() + varName.slice(1)}Loaded`;
                
                document.dispatchEvent(new CustomEvent(eventName, {
                    detail: { gemeenteCode, [varName]: data }
                }));
                
                console.log(`✓ ${varName} geladen voor ${gemeenteCode}`);
                return data;
            })
            .catch(error => {
                console.warn(`${varName} niet beschikbaar voor ${gemeenteCode}:`, error.message);
                
                // Map de variabele naam naar het juiste loading veld
                let loadingKey;
                if (varName === 'roadCost') loadingKey = 'roadCost';
                else if (varName === 'nodes') loadingKey = 'nodes';
                else loadingKey = varName;
                
                // Zet default waarden
                current[varName] = null;
                current.loading[loadingKey] = true;
                return null;
            });
    
    // Laad alleen roadCost en nodes (voor isochroon)
    const promises = [
        loadDataset(`${baseUrl}/roadCost.js`, 'roadCost'),
        loadDataset(`${baseUrl}/nodes.js`, 'nodes')
    ];
    
    // Wacht tot alle data geladen is (of gefaald heeft)
    Promise.allSettled(promises).then(() => {
        console.log(`[Gemeente Manager] Data geladen voor ${gemeenteCode}`);
        
        const availableData = {
            roadCost: current.roadCost !== null,
            nodes: current.nodes !== null
        };
        
        // Stuur all data loaded event
        document.dispatchEvent(new CustomEvent('gemeenteAllDataLoaded', {
            detail: { 
                gemeenteCode,
                availableData,
                roadCost: current.roadCost,
                nodes: current.nodes
            }
        }));
        
        console.log(`[Gemeente Manager] Beschikbare data voor ${gemeenteCode}:`, availableData);
        
        // Toon notificatie
        if (window.utils?.showNotification) {
            window.utils.showNotification(
                `Gemeente ${gemeenten.find(g => g.code === gemeenteCode)?.naam || gemeenteCode} geladen`,
                'success'
            );
        }
    });
}

async function loadAllData(gemeenteCode, codesToLoad = [gemeenteCode], loadId = loadSequence) {
    const nodeCollections = await loadCollectionsForCodes(codesToLoad, 'nodes', loadId);

    if (loadId !== loadSequence) return;

    current.nodes = mergeFeatureCollections(nodeCollections, `nodes_${codesToLoad.join('_')}`);
    current.loading.nodes = true;
    window.nodesData = current.nodes;

    document.dispatchEvent(new CustomEvent('gemeenteNodesDataLoaded', {
        detail: {
            gemeenteCode,
            activeCodes: [...codesToLoad],
            nodes: current.nodes
        }
    }));

    const roadCostCollections = await loadCollectionsForCodes(codesToLoad, 'roadCost', loadId);

    if (loadId !== loadSequence) return;

    current.roadCost = mergeFeatureCollections(roadCostCollections, `roadCost_${codesToLoad.join('_')}`);
    current.loading.roadCost = true;
    window.roadCost = current.roadCost;

    const availableData = {
        roadCost: current.roadCost.features.length > 0,
        nodes: current.nodes.features.length > 0
    };

    document.dispatchEvent(new CustomEvent('gemeenteAllDataLoaded', {
        detail: { 
            gemeenteCode,
            activeCodes: [...codesToLoad],
            availableData,
            roadCost: current.roadCost,
            nodes: current.nodes
        }
    }));

    console.log(`[Gemeente Manager] Data geladen voor codes: ${codesToLoad.join(', ')}`, availableData);

    if (window.utils?.showNotification) {
        const gemeenteNaam = gemeenten.find(g => g.code === gemeenteCode)?.naam || gemeenteCode;
        const extraCount = Math.max(0, codesToLoad.length - 1);
        window.utils.showNotification(
            extraCount ? `${gemeenteNaam} + ${extraCount} omstreken geladen` : `Gemeente ${gemeenteNaam} geladen`,
            'success'
        );
    }
}

async function loadDatasetForCode(url, varName, gemeenteCode) {
    try {
        return await loadDataFile(url, varName, gemeenteCode);
    } catch (error) {
        console.warn(`${varName} niet beschikbaar voor ${gemeenteCode}:`, error.message);
        return null;
    }
}

async function loadCollectionsForCodes(codesToLoad, varName, loadId) {
    const fetchResults = await Promise.all(codesToLoad.map(async code => {
        const baseUrl = `data/gemeentes/${code}`;
        const url = `${baseUrl}/${varName === 'nodes' ? 'nodes' : 'roadCost'}.js`;
        const gemeenteNaam = gemeenten.find(g => g.code === code)?.naam || code;

        try {
            const data = await loadDataFileFast(url, varName, code);
            if (data) {
                console.log(`[Gemeente Manager] ${varName} geladen voor ${gemeenteNaam}`);
            }
            return { code, url, gemeenteNaam, data };
        } catch (error) {
            return { code, url, gemeenteNaam, data: null, error };
        }
    }));

    const collections = fetchResults
        .filter(result => result.data)
        .map(result => result.data);

    for (const result of fetchResults.filter(result => !result.data)) {
        if (loadId !== loadSequence) return collections;

        const fallbackData = await loadDatasetForCode(result.url, varName, result.code);
        if (fallbackData) {
            collections.push(fallbackData);
            console.log(`[Gemeente Manager] ${varName} geladen voor ${result.gemeenteNaam}`);
        }
    }

    return collections;
}

async function loadDataFile(url, varName, gemeenteCode) {
    try {
        return await loadDataFileFast(url, varName, gemeenteCode);
    } catch (error) {
        return loadScript(url, varName, gemeenteCode);
    }
}

async function loadDataFileFast(url, varName, gemeenteCode) {
    const cacheKey = `${varName}:${gemeenteCode}:${url}`;
    if (dataFileCache.has(cacheKey)) {
        return dataFileCache.get(cacheKey);
    }

    const promise = fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.text();
        })
        .then(text => parseAssignedData(text, varName));

    dataFileCache.set(cacheKey, promise);
    return promise;
}

function parseAssignedData(text, varName) {
    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) {
        throw new Error(`Geen object gevonden voor ${varName}`);
    }

    return JSON.parse(text.slice(objectStart, objectEnd + 1));
}

function loadScript(url, varName, gemeenteCode) {
    return new Promise((resolve, reject) => {
        console.log(`[Gemeente Manager] Laden: ${url}`);
        clearDatasetGlobals(varName);
        
        // Maak unieke script ID om later te kunnen verwijderen
        const scriptId = `script-${gemeenteCode}-${varName}-${Date.now()}`;
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = url;
        
        const timeoutId = setTimeout(() => {
            // Timeout: verwijder script en reject
            const scriptElement = document.getElementById(scriptId);
            if (scriptElement && scriptElement.parentNode) {
                scriptElement.parentNode.removeChild(scriptElement);
            }
            reject(new Error(`Timeout bij laden van ${url}`));
        }, 15000); // 15 seconden timeout
        
        script.onload = function() {
            clearTimeout(timeoutId);
            
            // Wacht even zodat script kan uitvoeren
            setTimeout(() => {
                try {
                    // Haal data op
                    const data = getGlobalVar(varName);
                    
                    if (!data) {
                        console.warn(`Geen data gevonden voor ${varName} in ${url}`);
                        reject(new Error(`Geen data gevonden voor ${varName}`));
                        return;
                    }
                    
                    // Verwijder script tag na succesvol laden
                    const scriptElement = document.getElementById(scriptId);
                    if (scriptElement && scriptElement.parentNode) {
                        scriptElement.parentNode.removeChild(scriptElement);
                    }
                    
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            }, 0);
        };
        
        script.onerror = function() {
            clearTimeout(timeoutId);
            
            // Verwijder script tag bij error
            const scriptElement = document.getElementById(scriptId);
            if (scriptElement && scriptElement.parentNode) {
                scriptElement.parentNode.removeChild(scriptElement);
            }
            
            reject(new Error(`Kon ${url} niet laden`));
        };
        
        // Voeg script toe aan DOM
        document.head.appendChild(script);
    });
}

function clearDatasetGlobals(varName) {
    const names = varName === 'nodes' ? ['nodes', 'nodesData'] : [varName];
    names.forEach(name => {
        delete window[name];
        try {
            if (eval(`typeof ${name} !== 'undefined'`)) {
                eval(`${name} = null`);
            }
        } catch (e) {}
    });
}

function getGlobalVar(varName) {
    if (varName === 'nodes' && typeof nodesData !== 'undefined') {
        return nodesData;
    }

    // Eerst proberen via window object
    if (window[varName] !== undefined) {
        return window[varName];
    }
    
    // Dan proberen via eval (voor globale variabelen die niet op window staan)
    try {
        const result = eval(varName);
        if (result !== undefined) {
            return result;
        }
    } catch (e) {
        // Variabele bestaat niet als globale - dat is oké
    }
    
    return null;
}

function cleanupGlobals() {
    // Verwijder alle script tags van vorige gemeente
    const oldScripts = document.querySelectorAll('script[src*="/gemeentes/"]');
    oldScripts.forEach(script => {
        if (script.parentNode) {
            script.parentNode.removeChild(script);
        }
    });
    
    // Wis alle globale variabelen
    const globalVars = ['roadCost', 'nodes', 'nodesData'];
    
    globalVars.forEach(varName => {
        // Verwijder van window object
        delete window[varName];
        
        // Probeer ook de globale scope te wissen
        try {
            if (eval(`typeof ${varName} !== 'undefined'`)) {
                eval(`${varName} = null`);
            }
        } catch (e) {
            // Negeer errors
        }
    });
    
    console.log('[Gemeente Manager] Oude scripts en globale variabelen opgeruimd');
}

function zoomToGemeente(gemeenteInfo) {
    if (!window.map || !gemeenteInfo) return;
    
    console.log(`[Gemeente Manager] Zoom naar gemeente: ${gemeenteInfo.naam}`);
    
    // Prioriteit 1: Gebruik bounding box als beschikbaar
    if (gemeenteInfo.bounds && Array.isArray(gemeenteInfo.bounds) && gemeenteInfo.bounds.length === 2) {
        window.map.fitBounds(gemeenteInfo.bounds, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            duration: 1500,
            maxZoom: gemeenteInfo.zoom || 15,
            essential: true
        });
        return;
    }
    
    // Prioriteit 2: Gebruik center + zoom als beschikbaar
    if (gemeenteInfo.center && Array.isArray(gemeenteInfo.center) && gemeenteInfo.center.length === 2) {
        window.map.flyTo({
            center: gemeenteInfo.center,
            zoom: gemeenteInfo.zoom || 12,
            duration: 1500,
            essential: true
        });
        return;
    }
    
    // Prioriteit 3: Gebruik cached bounds van API
    if (boundsCache.has(gemeenteInfo.code)) {
        window.map.fitBounds(boundsCache.get(gemeenteInfo.code), {
            padding: 50,
            duration: 1500,
            maxZoom: 15,
            essential: true
        });
        return;
    }
    
    // Prioriteit 4: PDOK API fallback voor bounds
    fetchGemeenteBounds(gemeenteInfo)
        .then(bounds => {
            if (bounds) {
                boundsCache.set(gemeenteInfo.code, bounds);
                window.map.fitBounds(bounds, {
                    padding: 50,
                    duration: 1500,
                    maxZoom: 15,
                    essential: true
                });
            } else {
                fallbackToDefaultLocation();
            }
        })
        .catch(() => fallbackToDefaultLocation());
}

async function fetchGemeenteBounds(gemeenteInfo) {
    try {
        const url = `https://geodata.nationaalgeoregister.nl/locatieserver/v3/suggest?q=${encodeURIComponent(gemeenteInfo.naam)}&type=gemeente&rows=1`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.response && data.response.docs && data.response.docs.length > 0) {
            const doc = data.response.docs[0];
            const bbox = doc.boundingbox || doc.bbox;
            
            if (bbox) {
                const [west, south, east, north] = bbox.split(' ').map(Number);
                return [[west, south], [east, north]];
            } else if (doc.centroide_ll) {
                const [lon, lat] = doc.centroide_ll.split(' ').map(Number);
                const offset = 0.05;
                return [[lon - offset, lat - offset], [lon + offset, lat + offset]];
            }
        }
        return null;
    } catch (error) {
        console.error('[Gemeente Manager] Fout bij PDOK API:', error);
        return null;
    }
}

function fallbackToDefaultLocation() {
    if (!window.map) return;
    window.map.flyTo({ center: [5.66, 51.47], zoom: 12, duration: 1500 });
}

function updateGemeenteInput(selectedCode) {
    const input = document.getElementById("gemeenteInput");
    const datalist = document.getElementById("gemeenteOptions");
    if (input && datalist) {
        const gemeente = gemeenten.find(g => g.code === selectedCode);
        if (gemeente) input.value = `${gemeente.naam} (${gemeente.code})`;
    }
}

function setupGemeenteInput() {
    const input = document.getElementById("gemeenteInput");
    const datalist = document.getElementById("gemeenteOptions");
    if (!input || !datalist) return;
    
    // Vul de datalist met alle gemeenten
    function updateDatalist() {
        datalist.innerHTML = '';
        if (typeof gemeenten !== 'undefined' && gemeenten.length) {
            gemeenten.forEach(gemeente => {
                if (gemeente.code && gemeente.code !== "0000" && gemeente.naam) {
                    const option = document.createElement("option");
                    option.value = `${gemeente.naam} (${gemeente.code})`;
                    option.dataset.code = gemeente.code;
                    datalist.appendChild(option);
                }
            });
        }
        console.log(`Datalist gevuld met ${datalist.options.length} gemeenten`);
    }
    
    updateDatalist();
    
    // Filter suggesties op basis van input
    input.addEventListener("input", function() {
        const value = this.value.toLowerCase();
        let matchFound = false;
        
        // Check of de huidige waarde overeenkomt met een gemeente
        for (let i = 0; i < datalist.options.length; i++) {
            const optValue = datalist.options[i].value.toLowerCase();
            if (optValue === value || optValue.includes(value)) {
                matchFound = true;
                break;
            }
        }
        
        // Als er een exacte match is, selecteer direct (optioneel)
        if (matchFound && value.length > 2) {
            // Optionele auto-selectie
        }
    });
    
    // Bij selectie uit de dropdown
    input.addEventListener("change", function() {
        const value = this.value;
        const codeMatch = value.match(/\((\d+)\)/);
        
        if (codeMatch) {
            const gemeenteCode = codeMatch[1];
            const gemeente = gemeenten.find(g => g.code === gemeenteCode);
            if (gemeente && window.selectGemeente) {
                window.selectGemeente(gemeente.naam);
            } else if (gemeenteCode && window.GemeenteManager) {
                window.GemeenteManager.loadGemeenteData(gemeenteCode);
            }
        } else if (value.trim() !== '') {
            // Probeer te zoeken op naam
            const gemeente = gemeenten.find(g => 
                g.naam.toLowerCase() === value.toLowerCase()
            );
            if (gemeente && window.selectGemeente) {
                window.selectGemeente(gemeente.naam);
            }
        }
    });
    
    // Enter toets
    input.addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            this.dispatchEvent(new Event("change"));
        }
    });
    
    // Escape toets
    input.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
            this.value = '';
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function getData(type) {
    switch(type) {
        case 'roadCost': return current.roadCost;
        case 'nodes': return current.nodes;
        default: return null;
    }
}

function isDataAvailable(type) {
    const data = getData(type);
    return data !== null;
}

function isAllDataLoaded() {
    return Object.values(current.loading).every(status => status === true);
}

function getAllGemeenten() {
    return typeof gemeenten !== 'undefined' ? [...gemeenten] : [];
}

function clearCache() {
    boundsCache.clear();
    console.log('[Gemeente Manager] Bounds cache gewist');
}

function setOmstrekenEnabled(enabled) {
    omstrekenEnabled = !!enabled;
    console.log(`[Gemeente Manager] Omstreken ${omstrekenEnabled ? 'aan' : 'uit'}`);

    if (current.code) {
        loadGemeenteData(current.code);
    }
}

function isOmstrekenEnabled() {
    return omstrekenEnabled;
}

// Exporteer functies voor gebruik in andere scripts
window.GemeenteManager = {
    loadGemeenteData,
    setupGemeenteInput,
    getCurrentGemeenteData: () => ({ ...current }),
    getCurrentGemeenteCode: () => current.code,
    getData,
    isDataAvailable,
    isAllDataLoaded,
    getAllGemeenten,
    getActiveGemeenteCodes: () => [...current.activeCodes],
    setOmstrekenEnabled,
    isOmstrekenEnabled,
    zoomToGemeente,
    clearCache
};
