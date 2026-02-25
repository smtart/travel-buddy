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

// Send message
async function sendFirebaseMessage(chatKey, message) {
    try {
        const messagesRef = firebaseRealtimeDB.ref(`chats/${chatKey}/messages`);
        await messagesRef.push(message);
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

    // Geohash-based Search (Free Tier - 9-cell query)
    findNearbyUsersGeohash: findNearbyUsersWithGeohash,
    updateUserGeohash: updateUserGeohash,

    // Cloud Functions - Optimized Search (Blaze plan)
    findNearbyCompanions: findNearbyCompanionsCloud,
    findCompanionsProgressive: findCompanionsProgressiveCloud,

    // Realtime DB (Messaging)
    getChatKey: getFirebaseChatKey,
    sendMessage: sendFirebaseMessage,
    listenToMessages,
    getMessages
};

