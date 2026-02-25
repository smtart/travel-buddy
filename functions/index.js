/**
 * Firebase Cloud Functions for Travel Buddy
 * 
 * findNearbyCompanions - Efficiently finds nearby travel companions
 * using bounding box queries + Haversine distance calculation
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

/**
 * Haversine formula - calculates distance between two coordinates
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
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
 * Calculate bounding box for a given point and radius
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Object} Bounding box with min/max lat/lng
 */
function getBoundingBox(lat, lng, radiusKm) {
    // ~111 km per degree latitude
    // Longitude varies by latitude
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos(toRad(lat)));

    return {
        minLat: lat - latDelta,
        maxLat: lat + latDelta,
        minLng: lng - lngDelta,
        maxLng: lng + lngDelta
    };
}

/**
 * Cloud Function: Find Nearby Companions
 * 
 * Uses bounding box pre-filtering + Haversine for accurate distances
 * This is much faster than calculating distance for all 100K+ users
 */
exports.findNearbyCompanions = functions
    .region('asia-south1') // India region for lower latency
    .https.onCall(async (data, context) => {
        try {
            const {
                latitude,
                longitude,
                collegeName,
                currentUserEmail,
                radiusKm = 100,  // Default 100km search radius
                maxResults = 50  // Maximum results to return
            } = data;

            // Validate required parameters
            if (!latitude || !longitude) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Latitude and longitude are required'
                );
            }

            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng)) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Invalid latitude or longitude values'
                );
            }

            console.log(`🔍 Searching for companions near (${lat}, ${lng})`);
            console.log(`📍 College: ${collegeName}, Radius: ${radiusKm}km`);

            // Step 1: Calculate bounding box for initial filtering
            const box = getBoundingBox(lat, lng, radiusKm);
            console.log(`📦 Bounding box: lat[${box.minLat}, ${box.maxLat}] lng[${box.minLng}, ${box.maxLng}]`);

            // Step 2: Query Firestore with bounding box filter
            // Note: Firestore can only do range queries on one field at a time
            // So we filter by latitude range, then filter longitude in memory
            let query = db.collection('users')
                .where('latitude', '>=', box.minLat)
                .where('latitude', '<=', box.maxLat);

            // Add college filter if provided (same college matching)
            if (collegeName) {
                query = query.where('collegeName', '==', collegeName);
            }

            const snapshot = await query.get();
            console.log(`📊 Firestore returned ${snapshot.size} users in latitude range`);

            // Step 3: Filter by longitude + calculate exact Haversine distance
            const companions = [];

            snapshot.forEach(doc => {
                const user = { id: doc.id, ...doc.data() };

                // Skip current user
                if (user.email === currentUserEmail) return;

                const userLat = parseFloat(user.latitude);
                const userLng = parseFloat(user.longitude);

                // Skip users without valid coordinates
                if (isNaN(userLat) || isNaN(userLng)) return;

                // Filter by longitude (second part of bounding box)
                if (userLng < box.minLng || userLng > box.maxLng) return;

                // Calculate exact Haversine distance
                const distance = calculateDistance(lat, lng, userLat, userLng);

                // Only include if within radius
                if (distance <= radiusKm) {
                    companions.push({
                        ...user,
                        distance: Math.round(distance * 100) / 100, // Round to 2 decimals
                        isExact: true
                    });
                }
            });

            console.log(`✅ Found ${companions.length} companions within ${radiusKm}km`);

            // Step 4: Sort by distance (nearest first) and limit results
            companions.sort((a, b) => a.distance - b.distance);
            const results = companions.slice(0, maxResults);

            // Return results with metadata
            return {
                success: true,
                count: results.length,
                totalInRange: companions.length,
                searchRadius: radiusKm,
                searchCenter: { lat, lng },
                companions: results
            };

        } catch (error) {
            console.error('❌ findNearbyCompanions error:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });

/**
 * Cloud Function: Progressive Companion Search
 * 
 * Starts with a small radius and expands if not enough results found
 * Useful when user's area might have sparse data
 */
exports.findCompanionsProgressive = functions
    .region('asia-south1')
    .https.onCall(async (data, context) => {
        try {
            const {
                latitude,
                longitude,
                collegeName,
                currentUserEmail,
                minResults = 10,  // Try to find at least this many
                maxRadius = 200   // Maximum radius to search
            } = data;

            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng)) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Invalid coordinates'
                );
            }

            // Progressive radius expansion: 10km -> 25km -> 50km -> 100km -> 200km
            const radiusSteps = [10, 25, 50, 100, maxRadius];
            let companions = [];
            let finalRadius = 0;

            for (const radius of radiusSteps) {
                const box = getBoundingBox(lat, lng, radius);

                let query = db.collection('users')
                    .where('latitude', '>=', box.minLat)
                    .where('latitude', '<=', box.maxLat);

                if (collegeName) {
                    query = query.where('collegeName', '==', collegeName);
                }

                const snapshot = await query.get();
                companions = [];

                snapshot.forEach(doc => {
                    const user = { id: doc.id, ...doc.data() };
                    if (user.email === currentUserEmail) return;

                    const userLat = parseFloat(user.latitude);
                    const userLng = parseFloat(user.longitude);
                    if (isNaN(userLat) || isNaN(userLng)) return;
                    if (userLng < box.minLng || userLng > box.maxLng) return;

                    const distance = calculateDistance(lat, lng, userLat, userLng);
                    if (distance <= radius) {
                        companions.push({ ...user, distance: Math.round(distance * 100) / 100 });
                    }
                });

                finalRadius = radius;
                console.log(`🔍 Radius ${radius}km: found ${companions.length} companions`);

                // Stop if we have enough results
                if (companions.length >= minResults) break;
            }

            companions.sort((a, b) => a.distance - b.distance);

            return {
                success: true,
                count: companions.length,
                searchRadius: finalRadius,
                companions: companions.slice(0, 50)
            };

        } catch (error) {
            console.error('❌ findCompanionsProgressive error:', error);
            throw new functions.https.HttpsError('internal', error.message);
        }
    });
