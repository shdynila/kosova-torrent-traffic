// Kosovo Bounding Box
const KOSOVO_BOUNDS = {
    latMin: 41.85,
    latMax: 43.27,
    lngMin: 20.0,
    lngMax: 21.8
};

const MOCK_TORRENTS = [
    "Ubuntu 24.04 Desktop ISO",
    "Debian 12.5 netinst",
    "Arch Linux 2024.07",
    "Blender Studio - Spring (4K).mkv",
    "Sintel - Open Movie Project.mp4",
    "Tears of Steel - Blender.mkv",
    "Kali Linux 2024.2 Installer",
    "Fedora Workstation 40",
    "Linux Mint 21.3 Cinnamon",
    "Raspberry Pi OS Lite",
    "Big Buck Bunny (1080p).mp4"
];

let map;
let heatLayer;
let tooltipLayer;
let activeLocations = [];
const MAX_LOCATIONS = 150; 

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadKosovoOutline();
    seedLocations();
    updateHeatmap();
    
    // Attempt to fetch live data from internal API, fallback to simulation if offline
    setInterval(fetchNetworkTraffic, 3000);
});

// New Fetch Logic
async function fetchNetworkTraffic() {
    try {
        // Placeholder for your internal network API
        // Example: fetch('https://api.your-network.com/internal-torrent-metrics')
        const response = await fetch('http://localhost:8080/api/torrent-metrics');
        
        if (!response.ok) throw new Error("API not reachable");
        
        const liveData = await response.json();
        
        // Feed the live data into the dashboard 
        // Expected format: [{lat, lng, intensity, torrent}, ...]
        activeLocations = liveData; 
        updateHeatmap();
        
    } catch (error) {
        // Gracefully fallback to the simulation engine so the UI remains active
        simulateNetworkTraffic(); 
    }
}

function initMap() {
    const bounds = L.latLngBounds(
        L.latLng(KOSOVO_BOUNDS.latMin, KOSOVO_BOUNDS.lngMin),
        L.latLng(KOSOVO_BOUNDS.latMax, KOSOVO_BOUNDS.lngMax)
    );

    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        maxBounds: bounds.pad(0.05),
        maxBoundsViscosity: 1.0, 
        minZoom: 9
    }).setView([42.5861, 20.9022], 9);
    
    // Layer group for invisible interactive markers (for hover tooltips)
    tooltipLayer = L.layerGroup().addTo(map);
}

function loadKosovoOutline() {
    if (typeof KOSOVO_GEOJSON !== 'undefined') {
        L.geoJSON(KOSOVO_GEOJSON, {
            pane: 'tilePane', 
            style: {
                color: '#8b5cf6',      
                weight: 3,
                opacity: 1,
                fillColor: '#1e293b',  
                fillOpacity: 1
            }
        }).addTo(map);
    } else {
        console.error("GeoJSON data not found.");
    }
}

function seedLocations() {
    for(let i = 0; i < MAX_LOCATIONS; i++) {
        activeLocations.push(generateRandomLocation());
    }
}

function generateRandomLocation() {
    let lat, lng;
    let isInside = false;
    let attempts = 0;
    
    while (!isInside && attempts < 100) {
        lat = KOSOVO_BOUNDS.latMin + Math.random() * (KOSOVO_BOUNDS.latMax - KOSOVO_BOUNDS.latMin);
        lng = KOSOVO_BOUNDS.lngMin + Math.random() * (KOSOVO_BOUNDS.lngMax - KOSOVO_BOUNDS.lngMin);
        
        if (typeof turf !== 'undefined' && typeof KOSOVO_GEOJSON !== 'undefined') {
            const pt = turf.point([lng, lat]); 
            const poly = KOSOVO_GEOJSON.features[0];
            isInside = turf.booleanPointInPolygon(pt, poly);
        } else {
            isInside = true;
        }
        attempts++;
    }

    const randomTorrent = MOCK_TORRENTS[Math.floor(Math.random() * MOCK_TORRENTS.length)];

    return {
        lat: lat,
        lng: lng,
        intensity: 0.1 + Math.random() * 0.9,
        torrent: randomTorrent
    };
}

function simulateNetworkTraffic() {
    activeLocations.forEach(loc => {
        loc.intensity -= 0.1; 
    });

    activeLocations = activeLocations.filter(loc => loc.intensity > 0);

    const newDownloadsCount = Math.floor(Math.random() * 15);
    for(let i = 0; i < newDownloadsCount; i++) {
        activeLocations.push(generateRandomLocation());
    }

    if (activeLocations.length > MAX_LOCATIONS) {
        activeLocations = activeLocations.slice(activeLocations.length - MAX_LOCATIONS);
    }

    updateHeatmap();
}

function updateHeatmap() {
    // 1. Update visual heatmap layer
    const heatData = activeLocations.map(loc => [loc.lat, loc.lng, loc.intensity]);
    
    if (heatLayer) {
        heatLayer.setLatLngs(heatData);
    } else {
        heatLayer = L.heatLayer(heatData, {
            radius: 12, 
            blur: 10,
            maxZoom: 10,
            gradient: {
                0.3: '#06b6d4', 
                0.6: '#3b82f6', 
                0.8: '#8b5cf6', 
                1.0: '#ec4899'  
            }
        }).addTo(map);
    }

    // 2. Update invisible interactive markers for hover tooltips
    tooltipLayer.clearLayers();
    
    activeLocations.forEach(loc => {
        // Only show tooltips for reasonably active downloads to avoid clutter
        if (loc.intensity > 0.4) {
            const marker = L.circleMarker([loc.lat, loc.lng], {
                radius: 12,
                opacity: 0,      // Invisible border
                fillOpacity: 0,  // Invisible fill
                interactive: true
            });
            
            // Custom CSS tooltip class defined in style.css
            marker.bindTooltip(`<strong>Transfer:</strong> ${loc.torrent}<br/><span style="color:#06b6d4;">Simulated Data</span>`, {
                direction: 'top',
                className: 'custom-tooltip',
                offset: [0, -10]
            });
            
            tooltipLayer.addLayer(marker);
        }
    });
}
