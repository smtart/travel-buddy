/**
 * Ola Maps Service Module
 * Handles location autocomplete and geocoding using Ola Maps API
 * Map rendering uses Leaflet + Carto Dark tiles
 */

const OlaMapsService = (function () {
    // Configuration
    let apiKey = null;
    let map = null;
    let marker = null;

    // API endpoints (Ola Maps for autocomplete & geocoding)
    const AUTOCOMPLETE_URL = 'https://api.olamaps.io/places/v1/autocomplete';
    const GEOCODE_URL = 'https://api.olamaps.io/places/v1/geocode';

    // Carto Dark tile layer URL
    const CARTO_LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

    /**
     * Initialize the service with API key
     * @param {string} key - Ola Maps API key
     */
    function init(key) {
        if (!key || key === 'YOUR_OLA_MAPS_API_KEY') {
            console.warn('OlaMapsService: Please set a valid API key');
            return false;
        }
        apiKey = key;
        console.log('OlaMapsService: Initialized');
        return true;
    }

    /**
     * Get autocomplete suggestions for a query
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of place suggestions
     */
    async function autocomplete(query) {
        if (!apiKey) {
            console.error('OlaMapsService: API key not set');
            return [];
        }

        if (!query || query.length < 2) {
            return [];
        }

        try {
            const url = `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(query)}&api_key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'ok' && data.predictions) {
                return data.predictions.map(place => ({
                    placeId: place.place_id,
                    mainText: place.structured_formatting?.main_text || place.description,
                    secondaryText: place.structured_formatting?.secondary_text || '',
                    description: place.description,
                    geometry: place.geometry // May contain lat/lng directly
                }));
            }

            return [];
        } catch (error) {
            console.error('OlaMapsService autocomplete error:', error);
            return [];
        }
    }

    /**
     * Get place details (lat/lng) for a place ID
     * @param {string} placeId - Place ID from autocomplete
     * @param {string} address - Address string for geocoding fallback
     * @returns {Promise<Object|null>} Location object with lat, lng, and name
     */
    async function getPlaceDetails(placeId, address) {
        if (!apiKey) {
            console.error('OlaMapsService: API key not set');
            return null;
        }

        try {
            // Use geocode API with the address
            const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&api_key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'ok' && data.geocodingResults && data.geocodingResults.length > 0) {
                const result = data.geocodingResults[0];
                return {
                    lat: result.geometry.location.lat,
                    lng: result.geometry.location.lng,
                    name: result.formatted_address || address
                };
            }

            return null;
        } catch (error) {
            console.error('OlaMapsService getPlaceDetails error:', error);
            return null;
        }
    }

    // Satellite (ESRI World Imagery) tile layer URL
    const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const SATELLITE_ATTRIBUTION = '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics';

    /**
     * Initialize a Leaflet map with Carto Dark tiles
     * @param {string} containerId - ID of the container element
     * @param {Object} options - Map options (center, zoom, satellite)
     * @returns {Object|null} Leaflet Map instance
     */
    function initMap(containerId, options = {}) {
        if (!apiKey) {
            console.error('OlaMapsService: API key not set');
            return null;
        }

        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`OlaMapsService: Container #${containerId} not found`);
            return null;
        }

        // Default options (centered on India)
        // Note: Leaflet uses [lat, lng] order, not [lng, lat]
        const defaultOptions = {
            center: [20.5937, 78.9629], // India center [lat, lng]
            zoom: 4
        };

        const mapOptions = { ...defaultOptions, ...options };

        try {
            map = L.map(containerId, {
                center: mapOptions.center,
                zoom: mapOptions.zoom,
                zoomControl: false  // We'll add it manually to top-right
            });

            // Choose tile layer based on satellite flag
            if (options.satellite) {
                L.tileLayer(SATELLITE_TILES, {
                    attribution: SATELLITE_ATTRIBUTION,
                    maxZoom: 19
                }).addTo(map);
            } else {
                L.tileLayer(CARTO_LIGHT_TILES, {
                    attribution: CARTO_ATTRIBUTION,
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(map);
            }

            // Add zoom control to top-right (matching previous layout)
            L.control.zoom({ position: 'topright' }).addTo(map);

            return map;
        } catch (error) {
            console.error('OlaMapsService initMap error:', error);
            return null;
        }
    }

    /**
     * Set or update marker on the map
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Object|null} Leaflet Marker instance
     */
    function setMarker(lat, lng) {
        if (!map) {
            console.error('OlaMapsService: Map not initialized');
            return null;
        }

        // Remove existing marker
        if (marker) {
            map.removeLayer(marker);
        }

        // Create custom icon using DivIcon
        const customIcon = L.divIcon({
            className: 'ola-map-marker',
            html: '<i class="fas fa-map-marker-alt"></i>',
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -42]
        });

        marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

        return marker;
    }

    /**
     * Animate camera to a location
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} zoom - Zoom level (default: 14)
     */
    function flyTo(lat, lng, zoom = 14) {
        if (!map) {
            console.error('OlaMapsService: Map not initialized');
            return;
        }

        map.flyTo([lat, lng], zoom, {
            duration: 1.5
        });
    }

    /**
     * Get the current map instance
     * @returns {Object|null} Map instance
     */
    function getMap() {
        return map;
    }

    /**
     * Check if service is initialized
     * @returns {boolean}
     */
    function isInitialized() {
        return apiKey !== null && apiKey !== 'YOUR_OLA_MAPS_API_KEY';
    }

    /**
     * Reverse geocode - get address from lat/lng
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object|null>} Location object with address
     */
    async function reverseGeocode(lat, lng) {
        if (!apiKey) {
            console.error('OlaMapsService: API key not set');
            return null;
        }

        try {
            const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lng}&api_key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'ok' && data.results && data.results.length > 0) {
                const result = data.results[0];
                return {
                    lat: lat,
                    lng: lng,
                    name: result.name || result.formatted_address?.split(',')[0] || 'Selected Location',
                    address: result.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
                };
            }

            // Fallback - return coordinates as name
            return {
                lat: lat,
                lng: lng,
                name: 'Selected Location',
                address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
            };
        } catch (error) {
            console.error('OlaMapsService reverseGeocode error:', error);
            // Return fallback on error
            return {
                lat: lat,
                lng: lng,
                name: 'Selected Location',
                address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
            };
        }
    }

    /**
     * Get map center coordinates
     * @returns {Object|null} {lat, lng}
     */
    function getCenter() {
        if (!map) return null;
        const center = map.getCenter();
        return {
            lat: center.lat,
            lng: center.lng
        };
    }

    /**
     * Add a fixed center pin (for drag-to-select)
     * @param {string} containerId - Container element ID
     * @returns {HTMLElement} The center pin element
     */
    function addCenterPin(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Remove existing center pin if any
        const existingPin = container.querySelector('.map-center-pin');
        if (existingPin) existingPin.remove();

        // Create center pin element
        const pin = document.createElement('div');
        pin.className = 'map-center-pin';
        pin.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
        container.appendChild(pin);

        return pin;
    }

    /**
     * Setup drag-to-select with callback
     * @param {Function} onLocationSelect - Callback when location is selected (receives {lat, lng, name, address})
     */
    function setupDragToSelect(onLocationSelect) {
        if (!map) {
            console.error('OlaMapsService: Map not initialized');
            return;
        }

        let isDragging = false;
        const pin = document.querySelector('.map-center-pin');

        // When map starts moving
        map.on('movestart', () => {
            isDragging = true;
            if (pin) {
                pin.classList.add('dragging');
            }
        });

        // When map stops moving
        map.on('moveend', async () => {
            if (!isDragging) return;
            isDragging = false;

            if (pin) {
                pin.classList.remove('dragging');
                pin.classList.add('dropped');
                setTimeout(() => pin.classList.remove('dropped'), 300);
            }

            // Get center coordinates
            const center = getCenter();
            if (center && onLocationSelect) {
                // Reverse geocode to get address
                const location = await reverseGeocode(center.lat, center.lng);
                if (location) {
                    onLocationSelect(location);
                }
            }
        });
    }

    // Public API
    return {
        init,
        autocomplete,
        getPlaceDetails,
        initMap,
        setMarker,
        flyTo,
        getMap,
        isInitialized,
        reverseGeocode,
        getCenter,
        addCenterPin,
        setupDragToSelect
    };
})();

// Explicitly attach to window for global access
window.OlaMapsService = OlaMapsService;

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OlaMapsService;
}
