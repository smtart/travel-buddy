// Backfill script for existing users
// Run this once to add geohash to all existing users

// Wait for Firebase to initialize before running
function waitForFirebase() {
    return new Promise((resolve) => {
        const check = () => {
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
                resolve();
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

async function runBackfill() {
    console.log('⏳ Waiting for Firebase...');
    await waitForFirebase();

    // Wait a bit more for Firestore to be ready
    await new Promise(r => setTimeout(r, 2000));

    console.log('🔄 Starting geohash backfill...');

    try {
        const snapshot = await firebase.firestore().collection('users').get();
        const batch = firebase.firestore().batch();
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.latitude && data.longitude && !data.destinationGeohash) {
                const geohash = GeohashUtils.encode(
                    parseFloat(data.latitude),
                    parseFloat(data.longitude),
                    5
                );
                batch.update(doc.ref, { destinationGeohash: geohash });
                count++;
                console.log(`  📍 ${data.fullName || data.email}: ${geohash}`);
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`✅ Updated ${count} users with geohash!`);
            alert(`Backfill complete! Updated ${count} users.`);
        } else {
            console.log('ℹ️ No users need updating.');
            alert('No users need updating - all already have geohash or no users found.');
        }
    } catch (error) {
        console.error('❌ Backfill error:', error);
        alert('Error: ' + error.message);
    }
}

// Run when page loads
runBackfill();
