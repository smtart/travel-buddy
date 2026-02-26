/* ==========================================
   FIREBASE CONFIGURATION - TRAVEL BUDDY
   ========================================== */

// Firebase CDN Imports (using compat mode for simplicity)
// These are loaded via script tags in index.html

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBOrEHm2nBW1QuFK0xPhATmmEjdEAKMmk4",
    authDomain: "travel-buddy-23db4.firebaseapp.com",
    databaseURL: "https://travel-buddy-23db4-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "travel-buddy-23db4",
    storageBucket: "travel-buddy-23db4.firebasestorage.app",
    messagingSenderId: "532810264523",
    appId: "1:532810264523:web:e0352375cf70af981d904e",
    measurementId: "G-2K8M9C68S7"
};

// Initialize Firebase
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;
let firebaseRealtimeDB = null;

function initializeFirebase() {
    try {
        // Initialize Firebase App
        firebaseApp = firebase.initializeApp(firebaseConfig);

        // Initialize Services
        firebaseAuth = firebase.auth();
        firebaseDB = firebase.firestore();
        firebaseRealtimeDB = firebase.database();

        console.log('🔥 Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        return false;
    }
}

// ============ Authentication Helpers ============

// Sign up with email and password
async function firebaseSignUp(email, password) {
    try {
        const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Signup error:', error);
        return { success: false, error: error.message };
    }
}

// Sign in with email and password
async function firebaseSignIn(email, password) {
    try {
        const userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

// Sign out
async function firebaseSignOut() {
    try {
        await firebaseAuth.signOut();
        return { success: true };
    } catch (error) {
        console.error('Sign out error:', error);
        return { success: false, error: error.message };
    }
}

// Get current user
function getCurrentUser() {
    return firebaseAuth?.currentUser || null;
}

// Auth state listener
function onAuthStateChange(callback) {
    return firebaseAuth.onAuthStateChanged(callback);
}

// ============ Firestore Helpers ============

// Save user profile to Firestore
async function saveUserProfile(userId, userData) {
    try {
        await firebaseDB.collection('users').doc(userId).set(userData, { merge: true });
        return { success: true };
    } catch (error) {
        console.error('Save profile error:', error);
        return { success: false, error: error.message };
    }
}

// Get user profile from Firestore
async function getUserProfile(userId) {
    try {
        const doc = await firebaseDB.collection('users').doc(userId).get();
        if (doc.exists) {
            return { success: true, data: { id: doc.id, ...doc.data() } };
        }
        return { success: false, error: 'User not found' };
    } catch (error) {
        console.error('Get profile error:', error);
        return { success: false, error: error.message };
    }
}

// Get user profile by email
async function getUserByEmailFromFirestore(email) {
    try {
        const snapshot = await firebaseDB.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return { success: true, data: { id: doc.id, ...doc.data() } };
        }
        return { success: false, error: 'User not found' };
    } catch (error) {
        console.error('Get user by email error:', error);
        return { success: false, error: error.message };
    }
}

// Update user profile
async function updateUserProfile(userId, updates) {
    try {
        await firebaseDB.collection('users').doc(userId).update(updates);
        return { success: true };
    } catch (error) {
        console.error('Update profile error:', error);
        return { success: false, error: error.message };
    }
}

// Get all users (for companion search)
async function getAllUsers() {
    try {
        const snapshot = await firebaseDB.collection('users').get();
        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, data: users };
    } catch (error) {
        console.error('Get all users error:', error);
        return { success: false, error: error.message };
    }
}

// Query users by college
async function getUsersByCollege(collegeName) {
    try {
        const snapshot = await firebaseDB.collection('users')
            .where('collegeName', '==', collegeName)
            .get();

        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return { success: true, data: users };
    } catch (error) {
        console.error('Get users by college error:', error);
        return { success: false, error: error.message };
    }
}

// ============ 9-Cell Geohash Query (Optimized Search) ============

/**
 * Find nearby users using 9-cell geohash query
 * This is efficient for large datasets (100K+ users) on the free plan
 * 
 * @param {number} latitude - Search center latitude
 * @param {number} longitude - Search center longitude
 * @param {string} collegeName - User's college name for filtering
 * @param {string} currentUserEmail - Current user's email to exclude
 * @param {number} precision - Geohash precision (default: 5 for ~5km cells)
 * @returns {Promise<Object>} - Result with users array
 */
async function findNearbyUsersWithGeohash(latitude, longitude, collegeName, currentUserEmail, precision = 5) {
    try {
        if (!window.GeohashUtils) {
            console.warn('⚠️ GeohashUtils not loaded, falling back to full query');
            return { success: false, error: 'GeohashUtils not available' };
        }

        console.log(`🔍 9-Cell Geohash Search: (${latitude}, ${longitude})`);
        console.log(`   📏 Precision: ${precision} (~${precision === 4 ? '39km' : precision === 5 ? '5km' : precision === 6 ? '1.2km' : '150m'} cells)`);

        // Get the geohash for the search location
        const centerGeohash = GeohashUtils.encode(latitude, longitude, precision);
        console.log(`   📍 Center geohash: ${centerGeohash}`);

        // Get 9-cell neighbors (solves edge case problem)
        const neighbors = GeohashUtils.getNeighbors(centerGeohash);
        console.log(`   🔲 Querying ${neighbors.length} cells:`, neighbors);

        // Query each neighbor cell in parallel
        const queryPromises = neighbors.map(async (geohashPrefix) => {
            const bounds = GeohashUtils.getQueryBounds(geohashPrefix);

            let query = firebaseDB.collection('users')
                .where('destinationGeohash', '>=', bounds.start)
                .where('destinationGeohash', '<', bounds.end);

            // Add college filter if provided
            // Note: Firestore requires a composite index for this
            // If it fails, we filter college in memory

            const snapshot = await query.get();
            const users = [];
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
            return users;
        });

        // Wait for all queries to complete
        const results = await Promise.all(queryPromises);

        // Flatten and deduplicate results
        const userMap = new Map();
        results.flat().forEach(user => {
            if (user.email !== currentUserEmail) {
                userMap.set(user.email, user);
            }
        });

        let users = Array.from(userMap.values());
        console.log(`   📊 Found ${users.length} unique users in 9 cells`);

        // Filter by college in memory (since composite indexes may not exist)
        if (collegeName) {
            const originalCount = users.length;
            users = users.filter(u =>
                u.collegeName?.toLowerCase() === collegeName.toLowerCase()
            );
            console.log(`   🏫 Filtered to ${users.length} users in same college (from ${originalCount})`);
        }

        // Calculate exact distances and sort
        users = users.map(user => {
            const userLat = parseFloat(user.latitude);
            const userLng = parseFloat(user.longitude);
            const distance = GeohashUtils.calculateDistance(latitude, longitude, userLat, userLng);
            return { ...user, distance };
        });

        // Sort by distance (nearest first)
        users.sort((a, b) => a.distance - b.distance);

        console.log(`   ✅ Returning ${users.length} users sorted by distance`);

        return {
            success: true,
            data: users,
            searchCenter: { latitude, longitude },
            geohashPrecision: precision,
            cellsQueried: neighbors.length
        };

    } catch (error) {
        console.error('❌ 9-cell geohash query error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Find same-college users near a destination — compound index query with fallback
 * 
 * 3-tier strategy for scaling on Firestore free tier:
 * 
 * TIER 1 — Compound query (requires composite index: collegeName + destinationGeohash)
 *   Queries Firestore with WHERE collegeName == X AND geohash in range for each
 *   of 9 neighboring cells. Only pulls users matching BOTH college AND location.
 *   Reads: ~9 queries × only matching docs (e.g., 5-50 docs total for a city).
 *   This is 10-100x fewer reads than a full college scan at scale.
 * 
 * TIER 2 — Full college scan + in-memory geohash bucketing (fallback)
 *   If the composite index doesn't exist, Firestore throws error code
 *   'failed-precondition'. We catch this and fall back to getUsersByCollege()
 *   with in-memory prefix bucketing (the previous approach).
 * 
 * CACHE — sessionStorage with 5-minute TTL
 *   Both tiers cache results to avoid repeat Firestore reads within a session.
 *   Cache key includes college name + geohash prefix so different searches
 *   get different cache entries.
 * 
 * To enable Tier 1: Create composite index in Firebase Console:
 *   Collection: users | Fields: collegeName (Asc), destinationGeohash (Asc)
 *   Or deploy firestore.indexes.json via `firebase deploy --only firestore:indexes`
 * 
 * @param {number} latitude - Search center latitude
 * @param {number} longitude - Search center longitude  
 * @param {string} collegeName - College name to filter by
 * @param {string} currentUserEmail - Current user's email to exclude
 * @returns {Promise<Object>} - { success, data: sorted users[], meta }
 */
async function findSameCollegeNearby(latitude, longitude, collegeName, currentUserEmail) {
    try {
        console.log(`🏫 College search: "${collegeName}" near (${latitude}, ${longitude})`);

        // --- Constants ---
        const BUCKET_PRECISION = 4; // ~39km cells for compound query
        const MIN_NEARBY = 5;
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

        // Encode search location
        let searchPrefix = '';
        let neighbors = [];
        if (window.GeohashUtils) {
            try {
                searchPrefix = GeohashUtils.encode(latitude, longitude, BUCKET_PRECISION);
                neighbors = GeohashUtils.getNeighbors(searchPrefix);
            } catch (e) {
                console.warn('   ⚠️ Geohash encoding failed', e);
            }
        }

        // --- Check cache ---
        const cacheKey = `tb_search_${collegeName}_${searchPrefix || 'all'}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const { data, timestamp, meta } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    console.log(`   ⚡ Cache hit (${data.length} users, ${Math.round((Date.now() - timestamp) / 1000)}s old)`);
                    // Recalculate distances from current search point (may differ from cached search)
                    const recalculated = recalcDistances(data, latitude, longitude, currentUserEmail);
                    return {
                        success: true,
                        data: recalculated,
                        meta: { ...meta, cached: true }
                    };
                }
            }
        } catch (e) { /* sessionStorage may be unavailable */ }

        // === TIER 1: Compound query (collegeName + geohash range) ===
        if (searchPrefix && neighbors.length > 0) {
            try {
                console.log(`   🔍 Tier 1: Compound query (${neighbors.length} cells, prefix "${searchPrefix}")`);

                const queryPromises = neighbors.map(async (geohashPrefix) => {
                    const bounds = GeohashUtils.getQueryBounds(geohashPrefix);
                    const snapshot = await firebaseDB.collection('users')
                        .where('collegeName', '==', collegeName)
                        .where('destinationGeohash', '>=', bounds.start)
                        .where('destinationGeohash', '<', bounds.end)
                        .get();

                    const users = [];
                    snapshot.forEach(doc => {
                        users.push({ id: doc.id, ...doc.data() });
                    });
                    return users;
                });

                const results = await Promise.all(queryPromises);

                // Deduplicate by email
                const userMap = new Map();
                results.flat().forEach(user => {
                    if (user.email !== currentUserEmail) {
                        userMap.set(user.email, user);
                    }
                });

                let users = Array.from(userMap.values())
                    .filter(u => !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude)));

                const totalReads = results.reduce((sum, r) => sum + r.length, 0);
                console.log(`   📊 Compound query: ${totalReads} docs read → ${users.length} unique eligible`);

                // Calculate distances & sort ascending
                let companions = users.map(user => {
                    const uLat = parseFloat(user.latitude);
                    const uLng = parseFloat(user.longitude);
                    const distance = GeohashUtils.calculateDistance(latitude, longitude, uLat, uLng);
                    return { ...user, distance, isExact: true };
                });
                companions.sort((a, b) => a.distance - b.distance);

                console.log(`   ✅ Tier 1: ${companions.length} companions in ~39km area`);
                logDistanceRange(companions);

                // If enough results, return. Otherwise fall through to Tier 2 for full college scan.
                if (companions.length >= MIN_NEARBY) {
                    cacheResults(cacheKey, users, {
                        college: collegeName,
                        method: 'compound-index',
                        cellsQueried: neighbors.length,
                        docsRead: totalReads
                    });

                    return {
                        success: true,
                        data: companions,
                        meta: {
                            college: collegeName,
                            totalEligible: users.length,
                            method: 'compound-index',
                            cellsQueried: neighbors.length,
                            docsRead: totalReads
                        }
                    };
                } else {
                    console.log(`   🔄 Only ${companions.length} nearby — expanding to full college scan (Tier 2)`);
                    // Fall through to Tier 2
                }

            } catch (error) {
                // Firestore throws 'failed-precondition' when composite index is missing
                if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                    console.warn('   ⚠️ Composite index not found, falling back to Tier 2');
                    console.warn('   📋 Create index: Firebase Console → Firestore → Indexes');
                    console.warn('   📋 Collection: users | Fields: collegeName (Asc), destinationGeohash (Asc)');
                } else {
                    console.error('   ❌ Compound query error:', error);
                }
                // Fall through to Tier 2
            }
        }

        // === TIER 2: Full college scan + in-memory geohash bucketing ===
        console.log('   🔄 Tier 2: Full college scan + in-memory bucketing');

        const collegeResult = await getUsersByCollege(collegeName);
        if (!collegeResult.success || !collegeResult.data) {
            return { success: false, error: 'Failed to fetch college users' };
        }

        let users = collegeResult.data;
        console.log(`   📊 Fetched ${users.length} users from same college`);

        // Filter out current user and users without coordinates
        users = users.filter(u => {
            if (u.email === currentUserEmail) return false;
            return !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
        });
        console.log(`   👥 ${users.length} eligible users`);

        if (users.length === 0) {
            return {
                success: true,
                data: [],
                meta: { college: collegeName, totalEligible: 0, method: 'college-scan' }
            };
        }

        // Geohash prefix bucketing
        let nearbyBucket = [];
        let fartherBucket = [];

        if (searchPrefix) {
            for (const user of users) {
                if (user.destinationGeohash && user.destinationGeohash.startsWith(searchPrefix)) {
                    nearbyBucket.push(user);
                } else {
                    fartherBucket.push(user);
                }
            }
            console.log(`   📍 Buckets: nearby=${nearbyBucket.length}, farther=${fartherBucket.length}`);
        } else {
            nearbyBucket = users;
        }

        // Calculate distances
        const calcDist = (user) => {
            const uLat = parseFloat(user.latitude);
            const uLng = parseFloat(user.longitude);
            const distance = (window.GeohashUtils)
                ? GeohashUtils.calculateDistance(latitude, longitude, uLat, uLng)
                : calculateHaversineDistance(latitude, longitude, uLat, uLng);
            return { ...user, distance, isExact: true };
        };

        let companions = nearbyBucket.map(calcDist);
        if (companions.length < MIN_NEARBY && fartherBucket.length > 0) {
            console.log(`   🔄 Expanding: nearby (${companions.length}) < ${MIN_NEARBY}`);
            companions = companions.concat(fartherBucket.map(calcDist));
        }

        companions.sort((a, b) => a.distance - b.distance);

        // Cache
        cacheResults(cacheKey, users, {
            college: collegeName,
            method: 'college-scan-geohash',
            totalFetched: collegeResult.data.length
        });

        console.log(`   ✅ Tier 2 success: ${companions.length} companions`);
        logDistanceRange(companions);

        return {
            success: true,
            data: companions,
            meta: {
                college: collegeName,
                totalEligible: users.length,
                nearbyBucket: nearbyBucket.length,
                fartherBucket: fartherBucket.length,
                method: 'college-scan-geohash'
            }
        };

    } catch (error) {
        console.error('❌ findSameCollegeNearby error:', error);
        return { success: false, error: error.message };
    }
}

// --- Helper: Cache results to sessionStorage ---
function cacheResults(key, users, meta) {
    try {
        sessionStorage.setItem(key, JSON.stringify({
            data: users,
            meta: meta,
            timestamp: Date.now()
        }));
    } catch (e) { /* storage full or unavailable */ }
}

// --- Helper: Recalculate distances from cache (search point may differ) ---
function recalcDistances(users, latitude, longitude, excludeEmail) {
    const calcDist = window.GeohashUtils
        ? GeohashUtils.calculateDistance
        : calculateHaversineDistance;

    return users
        .filter(u => u.email !== excludeEmail && !isNaN(parseFloat(u.latitude)))
        .map(u => ({
            ...u,
            distance: calcDist(latitude, longitude, parseFloat(u.latitude), parseFloat(u.longitude)),
            isExact: true
        }))
        .sort((a, b) => a.distance - b.distance);
}

// --- Helper: Log distance range ---
function logDistanceRange(companions) {
    if (companions.length > 0) {
        console.log(`   📏 Range: ${companions[0].distance.toFixed(2)}km → ${companions[companions.length - 1].distance.toFixed(2)}km`);
    }
}

/**
 * Update user's geohash when their destination changes
 * Call this when saving user profile or updating destination
 */
async function updateUserGeohash(userId, latitude, longitude, precision = 5) {
    try {
        if (!window.GeohashUtils) {
            console.warn('GeohashUtils not loaded');
            return { success: false, error: 'GeohashUtils not available' };
        }

        const geohash = GeohashUtils.encode(parseFloat(latitude), parseFloat(longitude), precision);

        await firebaseDB.collection('users').doc(userId).update({
            destinationGeohash: geohash,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude)
        });

        console.log(`📍 Updated geohash for user ${userId}: ${geohash}`);
        return { success: true, geohash };

    } catch (error) {
        console.error('Update geohash error:', error);
        return { success: false, error: error.message };
    }
}

// ============ Realtime Database Helpers (Messaging) ============

// Get chat key from two emails
function getFirebaseChatKey(email1, email2) {
    return [email1, email2].sort().join('_').replace(/[.#$[\]]/g, '_');
}

// Send message + update user_chats index for both participants
async function sendFirebaseMessage(chatKey, message) {
    try {
        // 1. Push the actual message to the chat
        const messagesRef = firebaseRealtimeDB.ref(`chats/${chatKey}/messages`);
        await messagesRef.push(message);

        // 2. Build the lightweight index entry
        const preview = (message.text || '').substring(0, 60);
        const indexEntry = {
            lastMsg: preview,
            lastTimestamp: message.timestamp || new Date().toISOString(),
            fromName: message.fromName || '',
            fromEmail: message.from || ''
        };

        // 3. Write to sender's index (unread = 0 — they sent it)
        const senderKey = sanitizeEmailForPath(message.from);
        const recipientKey = sanitizeEmailForPath(message.to);

        await firebaseRealtimeDB.ref(`user_chats/${senderKey}/${chatKey}`).set({
            ...indexEntry,
            unread: 0
        });

        // 4. Increment unread on recipient's index
        const recipientRef = firebaseRealtimeDB.ref(`user_chats/${recipientKey}/${chatKey}`);
        const recipSnap = await recipientRef.once('value');
        const existing = recipSnap.val() || {};
        await recipientRef.set({
            ...indexEntry,
            unread: (existing.unread || 0) + 1
        });

        return { success: true };
    } catch (error) {
        console.error('Send message error:', error);
        return { success: false, error: error.message };
    }
}

// Listen to messages
function listenToMessages(chatKey, callback) {
    const messagesRef = firebaseRealtimeDB.ref(`chats/${chatKey}/messages`);

    messagesRef.on('value', (snapshot) => {
        const messages = [];
        snapshot.forEach((child) => {
            messages.push({
                id: child.key,
                ...child.val()
            });
        });
        callback(messages);
    });

    // Return unsubscribe function
    return () => messagesRef.off('value');
}

// Listen ONLY to user's own tiny chat index node (efficient — not the full /chats tree)
// Each entry: { chatKey, lastMsg, lastTimestamp, fromName, fromEmail, unread }
function listenToUserChatIndex(userEmail, callback) {
    if (!firebaseRealtimeDB || !userEmail) return () => { };
    const myKey = sanitizeEmailForPath(userEmail);
    const indexRef = firebaseRealtimeDB.ref(`user_chats/${myKey}`);

    indexRef.on('value', (snapshot) => {
        const entries = [];
        snapshot.forEach((child) => {
            entries.push({ chatKey: child.key, ...child.val() });
        });
        callback(entries);
    });

    return () => indexRef.off('value');
}

// Reset unread count in index when a chat is opened (server-side clear)
async function clearUnreadInIndex(userEmail, chatKey) {
    if (!firebaseRealtimeDB || !userEmail || !chatKey) return;
    try {
        const myKey = sanitizeEmailForPath(userEmail);
        await firebaseRealtimeDB.ref(`user_chats/${myKey}/${chatKey}/unread`).set(0);
    } catch (e) {
        console.warn('clearUnreadInIndex error:', e);
    }
}

// Get messages once
async function getMessages(chatKey) {
    try {
        const snapshot = await firebaseRealtimeDB.ref(`chats/${chatKey}/messages`).once('value');
        const messages = [];
        snapshot.forEach((child) => {
            messages.push({
                id: child.key,
                ...child.val()
            });
        });
        return { success: true, data: messages };
    } catch (error) {
        console.error('Get messages error:', error);
        return { success: false, error: error.message };
    }
}

// ============ Presence (Online / Offline) ============

function sanitizeEmailForPath(email) {
    return email.replace(/[.#$\[\]]/g, '_');
}

// Set user online — call on login/app load
function setUserOnline(email) {
    if (!firebaseRealtimeDB || !email) return;
    const key = sanitizeEmailForPath(email);
    const presenceRef = firebaseRealtimeDB.ref(`presence/${key}`);

    presenceRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });

    // Auto-set offline on disconnect
    presenceRef.onDisconnect().set({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

// Set user offline — call on logout
function setUserOffline(email) {
    if (!firebaseRealtimeDB || !email) return;
    const key = sanitizeEmailForPath(email);
    firebaseRealtimeDB.ref(`presence/${key}`).set({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

// Listen to another user's presence
function listenToPresence(email, callback) {
    if (!firebaseRealtimeDB || !email) return () => { };
    const key = sanitizeEmailForPath(email);
    const ref = firebaseRealtimeDB.ref(`presence/${key}`);
    ref.on('value', snap => {
        const val = snap.val() || { online: false, lastSeen: null };
        callback(val);
    });
    return () => ref.off('value');
}

// ============ Typing Indicator ============

function setTyping(chatKey, email, isTyping) {
    if (!firebaseRealtimeDB || !chatKey || !email) return;
    const key = sanitizeEmailForPath(email);
    const ref = firebaseRealtimeDB.ref(`chats/${chatKey}/typing/${key}`);
    if (isTyping) {
        ref.set(true);
        ref.onDisconnect().remove();
    } else {
        ref.remove();
    }
}

function listenToTyping(chatKey, excludeEmail, callback) {
    if (!firebaseRealtimeDB || !chatKey) return () => { };
    const ref = firebaseRealtimeDB.ref(`chats/${chatKey}/typing`);
    const myKey = sanitizeEmailForPath(excludeEmail);
    ref.on('value', snap => {
        const val = snap.val() || {};
        // Remove own typing
        delete val[myKey];
        const isTyping = Object.keys(val).length > 0;
        callback(isTyping);
    });
    return () => ref.off('value');
}

// ============ Message Status (Ticks) ============

// Update a single message status
async function updateMessageStatus(chatKey, msgId, status) {
    if (!firebaseRealtimeDB) return;
    try {
        await firebaseRealtimeDB.ref(`chats/${chatKey}/messages/${msgId}/status`).set(status);
    } catch (e) {
        console.error('Update message status error:', e);
    }
}

// Mark all messages from other user as read
async function markMessagesAsRead(chatKey, readerEmail) {
    if (!firebaseRealtimeDB) return;
    try {
        const snap = await firebaseRealtimeDB.ref(`chats/${chatKey}/messages`).once('value');
        const updates = {};
        snap.forEach(child => {
            const msg = child.val();
            if (msg.from !== readerEmail && msg.status !== 'read') {
                updates[`${child.key}/status`] = 'read';
            }
        });
        if (Object.keys(updates).length > 0) {
            await firebaseRealtimeDB.ref(`chats/${chatKey}/messages`).update(updates);
        }
    } catch (e) {
        console.error('Mark messages as read error:', e);
    }
}

// ============ Reactions ============

async function toggleReaction(chatKey, msgId, emoji, email) {
    if (!firebaseRealtimeDB) return;
    try {
        const ref = firebaseRealtimeDB.ref(`chats/${chatKey}/messages/${msgId}/reactions/${emoji}`);
        const snap = await ref.once('value');
        const users = snap.val() || [];
        const idx = users.indexOf(email);
        if (idx > -1) {
            users.splice(idx, 1);
        } else {
            users.push(email);
        }
        if (users.length === 0) {
            await ref.remove();
        } else {
            await ref.set(users);
        }
        return { success: true };
    } catch (e) {
        console.error('Toggle reaction error:', e);
        return { success: false, error: e.message };
    }
}

// ============ Delete / Unsend ============

async function deleteMessage(chatKey, msgId, email) {
    if (!firebaseRealtimeDB) return { success: false };
    try {
        // Only allow sender to delete their own message
        const snap = await firebaseRealtimeDB.ref(`chats/${chatKey}/messages/${msgId}`).once('value');
        const msg = snap.val();
        if (!msg || msg.from !== email) {
            return { success: false, error: 'Unauthorized' };
        }
        await firebaseRealtimeDB.ref(`chats/${chatKey}/messages/${msgId}`).update({
            deleted: true,
            text: ''
        });
        return { success: true };
    } catch (e) {
        console.error('Delete message error:', e);
        return { success: false, error: e.message };
    }
}

// ============ Group Chat ============

async function createGroup(groupData) {
    if (!firebaseRealtimeDB) return { success: false };
    try {
        const groupRef = firebaseRealtimeDB.ref('groups').push();
        const groupId = groupRef.key;
        await groupRef.set({
            ...groupData,
            id: groupId,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        return { success: true, groupId };
    } catch (e) {
        console.error('Create group error:', e);
        return { success: false, error: e.message };
    }
}

async function getGroupsForUser(email) {
    if (!firebaseRealtimeDB || !email || typeof email !== 'string' || !email.trim()) {
        return { success: false, data: [] };
    }
    try {
        // Race against a 10-second timeout to prevent hanging on slow connections
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('getGroupsForUser timed out')), 10000)
        );
        const snap = await Promise.race([
            firebaseRealtimeDB.ref('groups').once('value'),
            timeoutPromise
        ]);
        const groups = [];
        const key = sanitizeEmailForPath(email);
        snap.forEach(child => {
            const g = child.val();
            if (g && g.members && g.members[key]) {
                groups.push({ ...g, id: child.key });
            }
        });
        return { success: true, data: groups };
    } catch (e) {
        console.error('Get groups error:', e);
        return { success: false, data: [] };
    }
}

async function findMatchingGroups(college, destinationGeohash) {
    if (!firebaseRealtimeDB) return { success: false, data: [] };
    // If neither filter is provided, return early — nothing to match against
    if ((!college || !college.trim()) && (!destinationGeohash || !destinationGeohash.trim())) {
        return { success: true, data: [] };
    }
    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('findMatchingGroups timed out')), 10000)
        );
        const snap = await Promise.race([
            firebaseRealtimeDB.ref('groups').once('value'),
            timeoutPromise
        ]);
        const groups = [];
        const prefix = destinationGeohash ? destinationGeohash.substring(0, 4) : '';
        const collegeLower = college ? college.toLowerCase() : '';
        snap.forEach(child => {
            const g = child.val();
            if (!g) return;
            const matchCollege = collegeLower && g.college && g.college.toLowerCase() === collegeLower;
            const matchDest = prefix && g.destinationGeohash && g.destinationGeohash.startsWith(prefix);
            if (matchCollege || matchDest) {
                groups.push({ ...g, id: child.key });
            }
        });
        return { success: true, data: groups };
    } catch (e) {
        console.error('Find matching groups error:', e);
        return { success: false, data: [] };
    }
}

async function joinGroup(groupId, email) {
    if (!firebaseRealtimeDB) return { success: false };
    try {
        const key = sanitizeEmailForPath(email);
        await firebaseRealtimeDB.ref(`groups/${groupId}/members/${key}`).set(true);
        return { success: true };
    } catch (e) {
        console.error('Join group error:', e);
        return { success: false, error: e.message };
    }
}

async function leaveGroup(groupId, email) {
    if (!firebaseRealtimeDB) return { success: false };
    try {
        const key = sanitizeEmailForPath(email);
        await firebaseRealtimeDB.ref(`groups/${groupId}/members/${key}`).remove();
        return { success: true };
    } catch (e) {
        console.error('Leave group error:', e);
        return { success: false, error: e.message };
    }
}

function listenToGroupMessages(groupId, callback) {
    if (!firebaseRealtimeDB) return () => { };
    const ref = firebaseRealtimeDB.ref(`chats/group_${groupId}/messages`);
    ref.on('value', snap => {
        const messages = [];
        snap.forEach(child => {
            messages.push({ id: child.key, ...child.val() });
        });
        callback(messages);
    });
    return () => ref.off('value');
}

async function sendGroupMessage(groupId, message) {
    if (!firebaseRealtimeDB) return { success: false };
    try {
        await firebaseRealtimeDB.ref(`chats/group_${groupId}/messages`).push(message);
        return { success: true };
    } catch (e) {
        console.error('Send group message error:', e);
        return { success: false, error: e.message };
    }
}

// ============ Utility: Check if Firebase is available ============
function isFirebaseAvailable() {
    return firebaseApp !== null && firebaseAuth !== null && firebaseDB !== null;
}

// ============ Cloud Functions Helpers ============

// Initialize Firebase Functions (for region-specific calls)
let firebaseFunctions = null;

function initializeFunctions() {
    if (typeof firebase !== 'undefined' && firebase.functions) {
        // Use asia-south1 region (same as Cloud Function)
        firebaseFunctions = firebase.app().functions('asia-south1');
        console.log('⚡ Firebase Functions initialized (asia-south1)');
        return true;
    }
    return false;
}

/**
 * Find nearby companions using Cloud Function
 * This is much faster than fetching all users client-side
 * 
 * @param {number} latitude - Search center latitude
 * @param {number} longitude - Search center longitude
 * @param {string} collegeName - User's college name for filtering
 * @param {string} currentUserEmail - Email of current user to exclude
 * @param {number} radiusKm - Search radius in kilometers (default: 100)
 * @returns {Promise<Object>} - Result with companions array
 */
async function findNearbyCompanionsCloud(latitude, longitude, collegeName, currentUserEmail, radiusKm = 100) {
    try {
        // Initialize functions if not already
        if (!firebaseFunctions) {
            initializeFunctions();
        }

        if (!firebaseFunctions) {
            console.warn('⚠️ Cloud Functions not available, falling back to local search');
            return { success: false, error: 'Cloud Functions not initialized' };
        }

        console.log(`☁️ Calling Cloud Function: findNearbyCompanions`);
        console.log(`   📍 Coordinates: (${latitude}, ${longitude})`);
        console.log(`   🏫 College: ${collegeName}`);
        console.log(`   📏 Radius: ${radiusKm}km`);

        const findNearbyCompanions = firebaseFunctions.httpsCallable('findNearbyCompanions');

        const result = await findNearbyCompanions({
            latitude,
            longitude,
            collegeName,
            currentUserEmail,
            radiusKm,
            maxResults: 50
        });

        console.log(`✅ Cloud Function returned ${result.data.count} companions`);
        return { success: true, data: result.data };

    } catch (error) {
        console.error('❌ Cloud Function error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Progressive companion search - expands radius until enough results found
 */
async function findCompanionsProgressiveCloud(latitude, longitude, collegeName, currentUserEmail) {
    try {
        if (!firebaseFunctions) {
            initializeFunctions();
        }

        if (!firebaseFunctions) {
            return { success: false, error: 'Cloud Functions not initialized' };
        }

        const findCompanionsProgressive = firebaseFunctions.httpsCallable('findCompanionsProgressive');

        const result = await findCompanionsProgressive({
            latitude,
            longitude,
            collegeName,
            currentUserEmail,
            minResults: 10,
            maxRadius: 200
        });

        return { success: true, data: result.data };

    } catch (error) {
        console.error('❌ Progressive search error:', error);
        return { success: false, error: error.message };
    }
}

// Export for use in app.js (global scope for non-module usage)
window.FirebaseService = {
    init: initializeFirebase,
    isAvailable: isFirebaseAvailable,
    initFunctions: initializeFunctions,

    // Auth
    signUp: firebaseSignUp,
    signIn: firebaseSignIn,
    signOut: firebaseSignOut,
    getCurrentUser,
    onAuthStateChange,

    // Firestore
    saveUserProfile,
    getUserProfile,
    getUserByEmail: getUserByEmailFromFirestore,
    updateUserProfile,
    getAllUsers,
    getUsersByCollege,

    // Geohash-based Search (Free Tier)
    findNearbyUsersGeohash: findNearbyUsersWithGeohash,
    findSameCollegeNearby: findSameCollegeNearby,
    updateUserGeohash: updateUserGeohash,

    // Cloud Functions - Optimized Search (Blaze plan)
    findNearbyCompanions: findNearbyCompanionsCloud,
    findCompanionsProgressive: findCompanionsProgressiveCloud,

    // Realtime DB (Messaging)
    getChatKey: getFirebaseChatKey,
    sendMessage: sendFirebaseMessage,
    listenToMessages,
    getMessages,
    listenToUserChatIndex,
    clearUnreadInIndex,

    // Presence
    setUserOnline,
    setUserOffline,
    listenToPresence,

    // Typing
    setTyping,
    listenToTyping,

    // Message Status
    updateMessageStatus,
    markMessagesAsRead,

    // Reactions
    toggleReaction,

    // Delete
    deleteMessage,

    // Group Chat
    createGroup,
    getGroupsForUser,
    findMatchingGroups,
    joinGroup,
    leaveGroup,
    listenToGroupMessages,
    sendGroupMessage,
    listenToAllUserChats
};

