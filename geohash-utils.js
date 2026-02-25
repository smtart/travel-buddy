/**
 * Geohash Utilities for Travel Buddy
 * 
 * Implements geohash encoding/decoding and 9-cell neighbor calculation
 * for efficient spatial queries on Firebase free tier
 */

// Base32 character set for geohash
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode latitude and longitude to a geohash
 * @param {number} latitude - Latitude (-90 to 90)
 * @param {number} longitude - Longitude (-180 to 180)
 * @param {number} precision - Geohash precision (default: 6)
 * @returns {string} Geohash string
 * 
 * Precision guide:
 * - 4: ~39km x 19km (city level)
 * - 5: ~5km x 5km (town level)
 * - 6: ~1.2km x 0.6km (neighborhood) ← recommended
 * - 7: ~150m x 150m (street level)
 * - 8: ~38m x 19m (building level)
 */
function encodeGeohash(latitude, longitude, precision = 6) {
    if (latitude < -90 || latitude > 90) {
        throw new Error('Latitude must be between -90 and 90');
    }
    if (longitude < -180 || longitude > 180) {
        throw new Error('Longitude must be between -180 and 180');
    }

    let latRange = { min: -90, max: 90 };
    let lngRange = { min: -180, max: 180 };
    let hash = '';
    let bit = 0;
    let ch = 0;
    let isEven = true;

    while (hash.length < precision) {
        if (isEven) {
            // Longitude
            const mid = (lngRange.min + lngRange.max) / 2;
            if (longitude >= mid) {
                ch |= (1 << (4 - bit));
                lngRange.min = mid;
            } else {
                lngRange.max = mid;
            }
        } else {
            // Latitude
            const mid = (latRange.min + latRange.max) / 2;
            if (latitude >= mid) {
                ch |= (1 << (4 - bit));
                latRange.min = mid;
            } else {
                latRange.max = mid;
            }
        }

        isEven = !isEven;
        bit++;

        if (bit === 5) {
            hash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }

    return hash;
}

/**
 * Decode a geohash to latitude and longitude bounds
 * @param {string} geohash - Geohash string
 * @returns {Object} { lat: { min, max }, lng: { min, max }, center: { lat, lng } }
 */
function decodeGeohash(geohash) {
    let latRange = { min: -90, max: 90 };
    let lngRange = { min: -180, max: 180 };
    let isEven = true;

    for (const char of geohash.toLowerCase()) {
        const idx = BASE32.indexOf(char);
        if (idx === -1) continue;

        for (let bit = 4; bit >= 0; bit--) {
            const bitValue = (idx >> bit) & 1;

            if (isEven) {
                const mid = (lngRange.min + lngRange.max) / 2;
                if (bitValue === 1) {
                    lngRange.min = mid;
                } else {
                    lngRange.max = mid;
                }
            } else {
                const mid = (latRange.min + latRange.max) / 2;
                if (bitValue === 1) {
                    latRange.min = mid;
                } else {
                    latRange.max = mid;
                }
            }
            isEven = !isEven;
        }
    }

    return {
        lat: latRange,
        lng: lngRange,
        center: {
            lat: (latRange.min + latRange.max) / 2,
            lng: (lngRange.min + lngRange.max) / 2
        }
    };
}

/**
 * Get the 8 neighboring geohashes + center (9 cells total)
 * This solves the edge case problem where nearby users are in different cells
 * 
 * @param {string} geohash - Center geohash
 * @returns {string[]} Array of 9 geohash prefixes (center + 8 neighbors)
 */
function getGeohashNeighbors(geohash) {
    if (!geohash || geohash.length === 0) return [geohash];

    const bounds = decodeGeohash(geohash);
    const precision = geohash.length;

    // Calculate the size of the geohash cell
    const latStep = (bounds.lat.max - bounds.lat.min);
    const lngStep = (bounds.lng.max - bounds.lng.min);

    const centerLat = bounds.center.lat;
    const centerLng = bounds.center.lng;

    // Generate 9 cells (3x3 grid centered on the original geohash)
    const neighbors = [];
    const offsets = [-1, 0, 1];

    for (const latOffset of offsets) {
        for (const lngOffset of offsets) {
            const newLat = centerLat + (latOffset * latStep);
            const newLng = centerLng + (lngOffset * lngStep);

            // Clamp to valid ranges
            const clampedLat = Math.max(-90, Math.min(90, newLat));
            const clampedLng = Math.max(-180, Math.min(180, newLng));

            try {
                const neighborHash = encodeGeohash(clampedLat, clampedLng, precision);
                if (!neighbors.includes(neighborHash)) {
                    neighbors.push(neighborHash);
                }
            } catch (e) {
                // Skip invalid coordinates
            }
        }
    }

    return neighbors;
}

/**
 * Get geohash bounds for querying (for Firestore range queries)
 * Returns start and end bounds for a geohash prefix query
 * 
 * @param {string} geohash - Geohash prefix
 * @returns {Object} { start: string, end: string }
 */
function getGeohashQueryBounds(geohash) {
    // All geohashes starting with this prefix will be between
    // geohash + "0000..." and geohash + "zzzz..."
    return {
        start: geohash,
        end: geohash + '~' // ~ is after z in ASCII
    };
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Get the recommended geohash precision based on search radius
 * @param {number} radiusKm - Search radius in kilometers
 * @returns {number} Recommended geohash precision
 */
function getPrecisionForRadius(radiusKm) {
    // Approximate cell sizes at different precisions:
    // 4: ~39km, 5: ~5km, 6: ~1.2km, 7: ~150m, 8: ~38m
    if (radiusKm > 20) return 4;
    if (radiusKm > 5) return 5;
    if (radiusKm > 1) return 6;
    if (radiusKm > 0.2) return 7;
    return 8;
}

// Export for use in other files
window.GeohashUtils = {
    encode: encodeGeohash,
    decode: decodeGeohash,
    getNeighbors: getGeohashNeighbors,
    getQueryBounds: getGeohashQueryBounds,
    calculateDistance: calculateHaversineDistance,
    getPrecisionForRadius
};
