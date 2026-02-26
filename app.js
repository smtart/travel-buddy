/* ==========================================
   TRAVEL BUDDY - APPLICATION JAVASCRIPT
   ========================================== */

// ============ State Management ============
const AppState = {
    currentStep: 1,
    totalSteps: 5,
    colleges: [],
    userData: null,
    currentPage: 'home',
    editField: null,
    useFirebase: false,  // Will be set to true if Firebase initializes successfully
    firebaseUserId: null // Current Firebase user ID
};

// ============ API Configuration ============
const API = {
    colleges: 'https://campusloop.in/wp-json/neo-pop/v1/colleges'
};

// ============ DOM Elements ============
const DOM = {
    // Auth pages
    authPages: document.getElementById('authPages'),
    signupPage: document.getElementById('signupPage'),
    loginPage: document.getElementById('loginPage'),
    mainApp: document.getElementById('mainApp'),

    // Forms
    signupForm: document.getElementById('signupForm'),
    loginForm: document.getElementById('loginForm'),

    // Progress
    progressFill: document.getElementById('progressFill'),
    progressSteps: document.querySelectorAll('.progress-steps .step'),
    formSteps: document.querySelectorAll('.form-step'),

    // Navigation buttons
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    submitBtn: document.getElementById('submitBtn'),

    // Auth links
    showLogin: document.getElementById('showLogin'),
    showSignup: document.getElementById('showSignup'),

    // File upload
    profilePicInput: document.getElementById('profilePic'),
    uploadPreview: document.getElementById('uploadPreview'),
    previewImage: document.getElementById('previewImage'),

    // College dropdown (signup)
    startingCollegeSearch: document.getElementById('startingCollegeSearch'),
    collegeDropdownList: document.getElementById('collegeDropdownList'),
    selectedCollege: document.getElementById('selectedCollege'),
    removeCollege: document.getElementById('removeCollege'),

    // College dropdown (home)
    homeCollegeSearch: document.getElementById('homeCollegeSearch'),
    homeCollegeDropdownList: document.getElementById('homeCollegeDropdownList'),
    homeSelectedCollege: document.getElementById('homeSelectedCollege'),
    homeRemoveCollege: document.getElementById('homeRemoveCollege'),

    // App pages
    appPages: document.querySelectorAll('.app-page'),
    navItems: document.querySelectorAll('.nav-item'),

    // Dashboard
    logoutBtn: document.getElementById('logoutBtn'),
    editBtns: document.querySelectorAll('.edit-btn'),

    // Modal
    editModal: document.getElementById('editModal'),
    editModalTitle: document.getElementById('editModalTitle'),
    editInput: document.getElementById('editInput'),
    editTextarea: document.getElementById('editTextarea'),
    editSelect: document.getElementById('editSelect'),
    closeEditModal: document.getElementById('closeEditModal'),
    cancelEdit: document.getElementById('cancelEdit'),
    saveEdit: document.getElementById('saveEdit'),

    // Find companion
    findCompanionBtn: document.getElementById('findCompanionBtn'),
    resultsSection: document.getElementById('resultsSection'),
    companionsList: document.getElementById('companionsList'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ============ Utility Functions ============
function showToast(message, type = 'info') {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <span>${message}</span>
    `;

    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function saveToLocalStorage(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function getFromLocalStorage(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
}

// ============ Cached Firebase Fetch ============
// Cache-first strategy: fetch from localStorage first, hit Firebase only if cache is stale.
// TTL = 5 minutes. Cuts Firebase reads from ~4/session to ~1-2.
const USERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function cachedFetchUsers(scope = 'college') {
    const currentUser = AppState.userData;
    if (!currentUser) return [];

    const cacheKey = scope === 'college'
        ? `tb_cache_college_${(currentUser.collegeName || '').toLowerCase()}`
        : 'tb_cache_all';

    // 1. Check cache
    const cached = getFromLocalStorage(cacheKey);
    if (cached && cached.ts && (Date.now() - cached.ts < USERS_CACHE_TTL)) {
        console.log(`📦 Using cached users (${scope}), age: ${Math.round((Date.now() - cached.ts) / 1000)}s`);
        return cached.data;
    }

    // 2. Fetch from Firebase
    if (AppState.useFirebase && window.FirebaseService) {
        try {
            const result = scope === 'college'
                ? await FirebaseService.getUsersByCollege(currentUser.collegeName)
                : await FirebaseService.getAllUsers();
            if (result.success) {
                // Save to cache with timestamp
                saveToLocalStorage(cacheKey, { data: result.data, ts: Date.now() });
                console.log(`🔥 Fetched ${result.data.length} users from Firebase (${scope}), cached locally`);
                return result.data;
            }
        } catch (error) {
            console.error(`Firebase fetch (${scope}) error:`, error);
        }
    }

    // 3. Fallback: stale cache or legacy localStorage
    if (cached && cached.data) return cached.data;
    return getFromLocalStorage('travelBuddyUsers') || [];
}

// Force-refresh cache (call after user edits profile, signs up, etc.)
function invalidateUsersCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('tb_cache_'));
    keys.forEach(k => localStorage.removeItem(k));
    console.log('🗑️ Users cache invalidated');
}

// ============ Multi-Step Form Logic ============
function updateProgress() {
    const progress = (AppState.currentStep / AppState.totalSteps) * 100;
    DOM.progressFill.style.width = `${progress}%`;

    DOM.progressSteps.forEach((step, index) => {
        step.classList.remove('active', 'completed');
        if (index + 1 === AppState.currentStep) {
            step.classList.add('active');
        } else if (index + 1 < AppState.currentStep) {
            step.classList.add('completed');
        }
    });
}

function showStep(step) {
    DOM.formSteps.forEach(formStep => {
        formStep.classList.remove('active');
        if (parseInt(formStep.dataset.step) === step) {
            formStep.classList.add('active');
        }
    });

    // Update navigation buttons
    DOM.prevBtn.style.display = step === 1 ? 'none' : 'flex';
    DOM.nextBtn.style.display = step === AppState.totalSteps ? 'none' : 'flex';
    DOM.submitBtn.style.display = step === AppState.totalSteps ? 'flex' : 'none';

    updateProgress();
}

function validateStep(step) {
    const formStep = document.querySelector(`.form-step[data-step="${step}"]`);
    const inputs = formStep.querySelectorAll('input[required], select[required], textarea[required]');

    let isValid = true;
    inputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.style.borderColor = 'var(--danger)';
        } else {
            input.style.borderColor = '';
        }
    });

    if (!isValid) {
        showToast('Please fill in all required fields', 'error');
    }

    return isValid;
}

function nextStep() {
    if (!validateStep(AppState.currentStep)) return;

    if (AppState.currentStep < AppState.totalSteps) {
        AppState.currentStep++;
        showStep(AppState.currentStep);
    }
}

function prevStep() {
    if (AppState.currentStep > 1) {
        AppState.currentStep--;
        showStep(AppState.currentStep);
    }
}

// ============ College API Integration ============
async function fetchColleges() {
    try {
        const response = await fetch(API.colleges);
        const result = await response.json();

        if (result.success && result.data) {
            AppState.colleges = result.data;
            return result.data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching colleges:', error);
        showToast('Failed to load colleges', 'error');
        return [];
    }
}

function renderCollegeDropdown(colleges, dropdownList, searchInput, selectedDisplay, isHome = false) {
    if (colleges.length === 0) {
        dropdownList.innerHTML = '<div class="dropdown-loading">No colleges found</div>';
        return;
    }

    dropdownList.innerHTML = colleges.map(college => `
        <div class="dropdown-item" data-id="${college.id}" data-name="${college.name}" 
             data-location="${college.location}" data-photo="${college.photo_url || ''}">
            <img src="${college.photo_url || 'https://via.placeholder.com/50'}" alt="${college.name}">
            <div class="college-details">
                <h4>${college.name}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${college.location}</p>
            </div>
        </div>
    `).join('');

    // Add click handlers
    dropdownList.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            selectCollege(item, searchInput, dropdownList, selectedDisplay, isHome);
        });
    });
}

function selectCollege(item, searchInput, dropdownList, selectedDisplay, isHome = false) {
    const data = {
        id: item.dataset.id,
        name: item.dataset.name,
        location: item.dataset.location,
        photo: item.dataset.photo
    };

    const prefix = isHome ? 'home' : '';

    // Update hidden input
    if (!isHome) {
        document.getElementById('startingCollegeId').value = data.id;
    }

    // Update selected display
    const imgEl = document.getElementById(`${prefix}SelectedCollegeImg`);
    const nameEl = document.getElementById(`${prefix}SelectedCollegeName`);
    const locationEl = document.getElementById(`${prefix}SelectedCollegeLocation`);

    if (imgEl) imgEl.src = data.photo || 'https://via.placeholder.com/50';
    if (nameEl) nameEl.textContent = data.name;
    if (locationEl) locationEl.textContent = data.location;

    // Show selected, hide search
    searchInput.style.display = 'none';
    selectedDisplay.style.display = 'flex';
    dropdownList.classList.remove('active');

    // Store selected college
    if (isHome) {
        AppState.homeSelectedCollege = data;
    } else {
        AppState.signupSelectedCollege = data;
    }
}

function setupCollegeDropdown(searchInput, dropdownList, selectedDisplay, removeBtn, isHome = false) {
    // Show dropdown on focus
    searchInput.addEventListener('focus', async () => {
        if (AppState.colleges.length === 0) {
            dropdownList.innerHTML = '<div class="dropdown-loading"><i class="fas fa-spinner fa-spin"></i> Loading colleges...</div>';
            dropdownList.classList.add('active');
            await fetchColleges();
        }
        renderCollegeDropdown(AppState.colleges, dropdownList, searchInput, selectedDisplay, isHome);
        dropdownList.classList.add('active');
    });

    // Filter on input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = AppState.colleges.filter(college =>
            college.name.toLowerCase().includes(query) ||
            college.location.toLowerCase().includes(query)
        );
        renderCollegeDropdown(filtered, dropdownList, searchInput, selectedDisplay, isHome);
        dropdownList.classList.add('active');
    });

    // Hide dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdownList.contains(e.target)) {
            dropdownList.classList.remove('active');
        }
    });

    // Remove selection
    removeBtn.addEventListener('click', () => {
        searchInput.style.display = 'block';
        searchInput.value = '';
        selectedDisplay.style.display = 'none';
        if (!isHome) {
            document.getElementById('startingCollegeId').value = '';
            AppState.signupSelectedCollege = null;
        } else {
            AppState.homeSelectedCollege = null;
        }
    });
}

// ============ File Upload ============
function setupFileUpload() {
    DOM.profilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                DOM.previewImage.src = event.target.result;
                DOM.previewImage.classList.add('visible');
                DOM.uploadPreview.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });
}

// ============ Form Submission ============
async function handleSignup(e) {
    e.preventDefault();

    if (!validateStep(AppState.currentStep)) return;

    // Collect form data
    const selectedDays = [];
    document.querySelectorAll('input[name="days"]:checked').forEach(cb => {
        selectedDays.push(cb.value);
    });

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const userData = {
        fullName: document.getElementById('fullName').value,
        email: email,
        collegeName: document.getElementById('collegeName').value,
        gender: document.getElementById('gender').value,
        profilePic: DOM.previewImage.src || '',
        startingCollege: AppState.signupSelectedCollege || null,
        latitude: parseFloat(document.getElementById('latitude').value),
        longitude: parseFloat(document.getElementById('longitude').value),
        destinationName: document.getElementById('destinationName').value,
        travelMode: document.getElementById('travelMode').value,
        expectations: document.getElementById('expectations').value,
        travelDays: selectedDays,
        createdAt: new Date().toISOString()
    };

    // Generate geohash for efficient nearby search
    if (window.GeohashUtils && !isNaN(userData.latitude) && !isNaN(userData.longitude)) {
        userData.destinationGeohash = GeohashUtils.encode(userData.latitude, userData.longitude, 5);
        console.log(`ðŸ“ Generated geohash: ${userData.destinationGeohash}`);
    }

    // Try Firebase first
    if (AppState.useFirebase && window.FirebaseService) {
        try {
            showToast('Creating account...', 'info');

            // Create Firebase Auth user
            const authResult = await FirebaseService.signUp(email, password);

            if (!authResult.success) {
                showToast(authResult.error || 'Signup failed', 'error');
                return;
            }

            // Save profile to Firestore
            const userId = authResult.user.uid;
            AppState.firebaseUserId = userId;

            const saveResult = await FirebaseService.saveUserProfile(userId, userData);

            if (!saveResult.success) {
                showToast('Profile save failed: ' + saveResult.error, 'error');
                return;
            }

            // Also save locally for offline access
            userData.firebaseUserId = userId;
            saveToLocalStorage('travelBuddyUser', userData);

            showToast('Account created successfully!', 'success');
            AppState.userData = userData;
            invalidateUsersCache();
            showMainApp();

        } catch (error) {
            console.error('Firebase signup error:', error);
            showToast('Signup error: ' + error.message, 'error');
        }
    } else {
        // Fallback to localStorage only
        userData.password = password; // Only store password in localStorage mode
        saveToLocalStorage('travelBuddyUser', userData);

        let users = getFromLocalStorage('travelBuddyUsers') || [];
        users.push(userData);
        saveToLocalStorage('travelBuddyUsers', users);

        showToast('Account created successfully!', 'success');
        AppState.userData = userData;
        showMainApp();
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    // Try Firebase first
    if (AppState.useFirebase && window.FirebaseService) {
        try {
            showToast('Logging in...', 'info');

            const authResult = await FirebaseService.signIn(email, password);

            if (!authResult.success) {
                showToast('Invalid email or password. Please try again.', 'error');
                return;
            }

            // Get user profile from Firestore
            const userId = authResult.user.uid;
            AppState.firebaseUserId = userId;

            const profileResult = await FirebaseService.getUserProfile(userId);

            if (profileResult.success) {
                AppState.userData = profileResult.data;
                AppState.userData.firebaseUserId = userId;

                // Auto-set geohash if user has coordinates but no geohash
                if (window.GeohashUtils && AppState.userData.latitude && AppState.userData.longitude && !AppState.userData.destinationGeohash) {
                    const lat = parseFloat(AppState.userData.latitude);
                    const lng = parseFloat(AppState.userData.longitude);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        const geohash = GeohashUtils.encode(lat, lng, 5);
                        AppState.userData.destinationGeohash = geohash;
                        console.log(`📍 Auto-generated missing geohash on login: ${geohash}`);
                        // Save to Firestore in the background
                        FirebaseService.updateUserProfile(userId, { destinationGeohash: geohash })
                            .then(r => r.success ? console.log('✅ Geohash saved to Firestore') : console.warn('⚠️ Failed to save geohash'))
                            .catch(err => console.warn('⚠️ Geohash save error:', err));
                    }
                }

                saveToLocalStorage('travelBuddyUser', AppState.userData);
                showToast('Welcome back!', 'success');
                showMainApp();
            } else {
                showToast('Failed to load profile', 'error');
            }

        } catch (error) {
            console.error('Firebase login error:', error);
            showToast('Invalid email or password. Please try again.', 'error');
        }
    } else {
        // Fallback to localStorage
        const users = getFromLocalStorage('travelBuddyUsers') || [];
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            AppState.userData = user;
            saveToLocalStorage('travelBuddyUser', user);
            showToast('Welcome back!', 'success');
            showMainApp();
        } else {
            showToast('Invalid email or password', 'error');
        }
    }
}

// ============ App Navigation ============
function showMainApp() {
    DOM.authPages.style.display = 'none';
    DOM.mainApp.style.display = 'block';
    loadDashboard();
    // Auto-discover nearby travel buddies
    loadTravelBuddies();
}

function showAuthPages() {
    DOM.authPages.style.display = 'flex';
    DOM.mainApp.style.display = 'none';
}

function switchPage(pageName) {
    AppState.currentPage = pageName;

    DOM.appPages.forEach(page => {
        page.classList.remove('active');
    });

    document.getElementById(`${pageName}Page`).classList.add('active');

    DOM.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });

    // Hide/show fixed weather overlays based on current page
    const weatherEls = ['rain-container', 'winter-container', 'bg-normal-gif', 'weatherOverlay'];
    weatherEls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (pageName !== 'home') {
                el.dataset.prevDisplay = el.style.display;
                el.style.visibility = 'hidden';
            } else {
                el.style.visibility = '';
            }
        }
    });

    // Initialize map page when switching to it
    if (pageName === 'map') {
        setTimeout(() => initMapPage(), 150);
    }
}

function setupNavigation() {
    DOM.navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchPage(item.dataset.page);
            // Always show nav after switching pages
            showFooterNav();
        });
    });

    setupScrollHideNav();
}

// â”€â”€â”€ Scroll-hide footer nav â”€â”€â”€
function setupScrollHideNav() {
    const nav = document.querySelector('.footer-nav');
    if (!nav) return;

    // Play entrance animation on first load
    nav.classList.add('nav-enter');
    nav.addEventListener('animationend', () => {
        nav.classList.remove('nav-enter');
    }, { once: true });

    let lastScrollY = 0;
    let scrollTimer = null;
    const SCROLL_THRESHOLD = 40;

    function onScroll(e) {
        const target = e.target === document ? document.documentElement : e.target;
        const currentScrollY = target.scrollTop !== undefined ? target.scrollTop : window.scrollY;
        const delta = currentScrollY - lastScrollY;

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            if (delta > 4 && currentScrollY > SCROLL_THRESHOLD) {
                nav.classList.add('nav-hidden');
            } else if (delta < -2) {
                nav.classList.remove('nav-hidden');
            }
            lastScrollY = currentScrollY;
        }, 50);
    }

    // Listen on window AND every scrollable container
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true });

    // Also observe any scrollable children dynamically
    const scrollTargets = [
        document.querySelector('.main-app'),
        document.querySelector('.page-content'),
        document.querySelector('.users-list'),
        document.querySelector('.chat-messages'),
    ];
    scrollTargets.forEach(el => {
        if (el) el.addEventListener('scroll', onScroll, { passive: true });
    });
}

function showFooterNav() {
    const nav = document.querySelector('.footer-nav');
    if (nav) nav.classList.remove('nav-hidden');
}

// ============ Dashboard ============
function loadDashboard() {
    if (!AppState.userData) return;

    const user = AppState.userData;

    // Profile header
    document.getElementById('dashboardProfilePic').src = user.profilePic || 'https://via.placeholder.com/70';
    document.getElementById('dashboardName').textContent = user.fullName;
    document.getElementById('dashboardEmail').textContent = user.email;

    // Details
    document.getElementById('detailFullName').textContent = user.fullName;
    document.getElementById('detailEmail').textContent = user.email;
    document.getElementById('detailCollegeName').textContent = user.collegeName;
    document.getElementById('detailGender').textContent = capitalizeFirst(user.gender);
    document.getElementById('detailStartingCollege').textContent = user.startingCollege?.name || 'Not set';
    document.getElementById('detailDestination').textContent = user.destinationName;
    document.getElementById('detailLocation').textContent = `${user.latitude}, ${user.longitude}`;
    document.getElementById('detailTravelMode').textContent = capitalizeFirst(user.travelMode);
    document.getElementById('detailExpectations').textContent = user.expectations || 'Not specified';
    document.getElementById('detailDays').textContent = user.travelDays?.map(capitalizeFirst).join(', ') || 'Not set';
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============ Edit Modal ============
function setupEditModal() {
    DOM.editBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            openEditModal(btn.dataset.field);
        });
    });

    DOM.closeEditModal.addEventListener('click', closeModal);
    DOM.cancelEdit.addEventListener('click', closeModal);
    DOM.saveEdit.addEventListener('click', saveEditedField);

    DOM.editModal.addEventListener('click', (e) => {
        if (e.target === DOM.editModal) closeModal();
    });
}

function openEditModal(field) {
    AppState.editField = field;

    const fieldLabels = {
        fullName: 'Full Name',
        email: 'Email',
        collegeName: 'College Name',
        gender: 'Gender',
        startingCollege: 'Starting College',
        destination: 'Destination',
        location: 'Location',
        travelMode: 'Travel Mode',
        expectations: 'Expectations',
        days: 'Travel Days'
    };

    DOM.editModalTitle.textContent = `Edit ${fieldLabels[field]}`;

    // Reset all inputs
    DOM.editInput.style.display = 'none';
    DOM.editTextarea.style.display = 'none';
    DOM.editSelect.style.display = 'none';

    const user = AppState.userData;

    switch (field) {
        case 'gender':
            DOM.editSelect.style.display = 'block';
            DOM.editSelect.innerHTML = `
                <option value="male" ${user.gender === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${user.gender === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${user.gender === 'other' ? 'selected' : ''}>Other</option>
                <option value="prefer-not" ${user.gender === 'prefer-not' ? 'selected' : ''}>Prefer not to say</option>
            `;
            break;
        case 'travelMode':
            DOM.editSelect.style.display = 'block';
            DOM.editSelect.innerHTML = `
                <option value="bus" ${user.travelMode === 'bus' ? 'selected' : ''}>ðŸšŒ Bus</option>
                <option value="personal" ${user.travelMode === 'personal' ? 'selected' : ''}>ðŸš— Personal Vehicle</option>
                <option value="train" ${user.travelMode === 'train' ? 'selected' : ''}>ðŸš‚ Train</option>
                <option value="metro" ${user.travelMode === 'metro' ? 'selected' : ''}>ðŸš‡ Metro</option>
                <option value="bike" ${user.travelMode === 'bike' ? 'selected' : ''}>ðŸï¸ Bike</option>
                <option value="carpool" ${user.travelMode === 'carpool' ? 'selected' : ''}>ðŸš™ Carpool</option>
            `;
            break;
        case 'expectations':
            DOM.editTextarea.style.display = 'block';
            DOM.editTextarea.value = user.expectations || '';
            break;
        case 'destination':
            DOM.editInput.style.display = 'block';
            DOM.editInput.value = user.destinationName || '';
            break;
        case 'location':
            DOM.editInput.style.display = 'block';
            DOM.editInput.value = `${user.latitude}, ${user.longitude}`;
            DOM.editInput.placeholder = 'Format: latitude, longitude';
            break;
        default:
            DOM.editInput.style.display = 'block';
            DOM.editInput.value = user[field] || '';
    }

    DOM.editModal.classList.add('active');
}

function closeModal() {
    DOM.editModal.classList.remove('active');
    AppState.editField = null;
}

async function saveEditedField() {
    const field = AppState.editField;
    let value;

    if (DOM.editSelect.style.display !== 'none') {
        value = DOM.editSelect.value;
    } else if (DOM.editTextarea.style.display !== 'none') {
        value = DOM.editTextarea.value;
    } else {
        value = DOM.editInput.value;
    }

    // Update user data
    let updates = {};
    switch (field) {
        case 'destination':
            AppState.userData.destinationName = value;
            updates.destinationName = value;
            break;
        case 'location':
            const [lat, lng] = value.split(',').map(v => parseFloat(v.trim()));
            AppState.userData.latitude = lat;
            AppState.userData.longitude = lng;
            updates = { latitude: lat, longitude: lng };

            // Regenerate geohash when location changes
            if (window.GeohashUtils && !isNaN(lat) && !isNaN(lng)) {
                const newGeohash = GeohashUtils.encode(lat, lng, 5);
                AppState.userData.destinationGeohash = newGeohash;
                updates.destinationGeohash = newGeohash;
                console.log(`ðŸ“ Updated geohash: ${newGeohash}`);
            }
            break;
        default:
            AppState.userData[field] = value;
            updates[field] = value;
    }

    // Save to Firebase if available
    if (AppState.useFirebase && window.FirebaseService && AppState.firebaseUserId) {
        try {
            const result = await FirebaseService.updateUserProfile(AppState.firebaseUserId, updates);
            if (!result.success) {
                console.error('Firebase update failed:', result.error);
            }
        } catch (error) {
            console.error('Firebase update error:', error);
        }
    }

    // Also save to localStorage for offline access
    saveToLocalStorage('travelBuddyUser', AppState.userData);

    // Update users list in localStorage (for backward compatibility)
    let users = getFromLocalStorage('travelBuddyUsers') || [];
    const index = users.findIndex(u => u.email === AppState.userData.email);
    if (index !== -1) {
        users[index] = AppState.userData;
        saveToLocalStorage('travelBuddyUsers', users);
    }

    loadDashboard();
    closeModal();
    invalidateUsersCache();
    showToast('Profile updated successfully!', 'success');
}

// ============ Distance Utilities ============

// Haversine distance calculation (km)
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

// Format distance for display
function formatDistance(km) {
    if (km < 1) {
        return `${Math.round(km * 1000)} m`;
    } else if (km < 10) {
        return `${km.toFixed(1)} km`;
    } else {
        return `${Math.round(km)} km`;
    }
}

// ============ Find Companion ============

// Pagination state
const PaginationState = {
    allCompanions: [],
    currentPage: 0,
    pageSize: 50
};

// ============ Travel Buddies Auto-Discovery ============

async function loadTravelBuddies() {
    const section = document.getElementById('travelBuddiesSection');
    const carousel = document.getElementById('tbCarousel');
    const countBadge = document.getElementById('tbCountBadge');

    if (!section || !carousel) return;

    const currentUser = AppState.userData;
    if (!currentUser) return;

    // Update place name in header
    const placeText = document.getElementById('tbPlaceText');
    if (placeText) {
        placeText.textContent = currentUser.destinationName
            ? `Near ${currentUser.destinationName}`
            : 'Near your destination';
    }

    // Show section with loading state
    section.style.display = 'block';
    carousel.innerHTML = `
        <div class="tb-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Discovering travel buddies...</span>
        </div>
    `;

    // Fetch same-college users (cache-first — avoids Firebase on every load)
    let users = await cachedFetchUsers('college');

    // Get current user's coordinates
    const userLat = parseFloat(currentUser.latitude);
    const userLng = parseFloat(currentUser.longitude);
    const hasUserCoords = !isNaN(userLat) && !isNaN(userLng);

    // Filter out current user and users without coordinates
    let eligibleUsers = users.filter(u => {
        if (u.email === currentUser.email) return false;
        const hasCoords = !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
        return hasCoords;
    });

    if (eligibleUsers.length === 0) {
        carousel.innerHTML = `
            <div class="tb-empty">
                <i class="fas fa-users-slash"></i>
                <span>No travel buddies found yet</span>
            </div>
        `;
        countBadge.textContent = '0 Available';
        return;
    }

    // Calculate distance and assign priority
    let buddies = eligibleUsers.map(user => {
        const compLat = parseFloat(user.latitude);
        const compLng = parseFloat(user.longitude);
        const distance = hasUserCoords ? calculateDistance(userLat, userLng, compLat, compLng) : 9999;

        // Priority scoring
        let priority = 3; // Default: all users
        const sameCollege = user.collegeName?.toLowerCase() === currentUser.collegeName?.toLowerCase();
        const sameStarting = user.startingCollege?.id === currentUser.startingCollege?.id;

        if (sameCollege && sameStarting) {
            priority = 1; // Best match
        } else if (sameCollege) {
            priority = 2; // Good match
        }

        return {
            ...user,
            distance,
            priority
        };
    });

    // Sort: first by priority (lower is better), then by distance (nearest first)
    buddies.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.distance - b.distance;
    });

    // Take top 50
    const topBuddies = buddies.slice(0, 50);

    // Store for profile modal access
    if (!PaginationState.allCompanions || PaginationState.allCompanions.length === 0) {
        PaginationState.allCompanions = topBuddies;
    }

    // Update count badge
    countBadge.textContent = `${buddies.length} Available`;

    // Render cards
    renderTravelBuddyCards(topBuddies, carousel);
}

function renderTravelBuddyCards(buddies, container) {
    // Cache all buddies for profile modal lookup
    buddies.forEach(b => cacheUser(b));

    const cardsHtml = buddies.map(buddy => {
        const distanceText = buddy.distance < 9999 ? formatDistance(buddy.distance) + ' away' : 'Distance N/A';
        const collegeName = buddy.collegeName || 'Unknown College';
        // Truncate college name for badge
        const collegeShort = collegeName.length > 20 ? collegeName.slice(0, 18) + '…' : collegeName;

        return `
            <div class="tb-card" onclick="openProfileModalByEmail('${buddy.email}')" data-email="${buddy.email}">
                <div class="tb-avatar-wrap">
                    <img src="${buddy.profilePic || 'https://via.placeholder.com/72'}" alt="${buddy.fullName}" loading="lazy">
                    <span class="tb-online-dot"></span>
                </div>
                <span class="tb-name">${buddy.fullName}</span>
                <span class="tb-distance"><i class="fas fa-location-dot"></i> ${distanceText}</span>
                <span class="tb-college-badge">${collegeShort}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}

// ============ Google Maps-style Search Bar ============

function setupSearchBarToggle() {
    const searchBar = document.getElementById('gmapSearchBar');
    const searchPill = document.getElementById('gmapSearchPill');
    const searchSection = document.getElementById('searchSection');
    const closeBtn = document.getElementById('searchSectionClose');
    const searchHint = document.getElementById('gmapSearchHint');

    if (!searchBar || !searchSection || !searchPill) return;

    // Update hint with saved destination
    updateSearchBarHint();

    // Click on search pill â†’ expand search section
    searchPill.addEventListener('click', () => {
        openSearchSection();
    });

    // Click on close button â†’ collapse search section
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeSearchSection();
        });
    }
}

function openSearchSection() {
    const searchBar = document.getElementById('gmapSearchBar');
    const searchSection = document.getElementById('searchSection');

    if (!searchBar || !searchSection) return;

    // Hide the pill
    searchBar.classList.add('gmap-search-bar--hidden');

    // Expand the search section
    searchSection.classList.remove('search-section--collapsed');
    searchSection.classList.add('search-section--expanded');

    // Focus first input after animation
    setTimeout(() => {
        const firstInput = searchSection.querySelector('input:not([type="hidden"])');
        if (firstInput) firstInput.focus();
    }, 350);
}

function closeSearchSection() {
    const searchBar = document.getElementById('gmapSearchBar');
    const searchSection = document.getElementById('searchSection');

    if (!searchBar || !searchSection) return;

    // Show the pill
    searchBar.classList.remove('gmap-search-bar--hidden');

    // Collapse the search section
    searchSection.classList.remove('search-section--expanded');
    searchSection.classList.add('search-section--collapsed');

    // Update the search hint with current data
    updateSearchBarHint();
}

function updateSearchBarHint() {
    const searchHint = document.getElementById('gmapSearchHint');
    const searchLabel = document.getElementById('gmapSearchLabel');
    if (!searchHint) return;

    // Priority: searched location > saved destination > default
    const searchedName = document.getElementById('homeDestName')?.value;
    const user = AppState.userData;

    if (searchedName) {
        searchHint.textContent = searchedName;
    } else if (user && user.destinationName) {
        searchHint.textContent = user.destinationName;
    } else {
        searchHint.textContent = 'Search destination & find companions';
    }
}

function setupFindCompanion() {
    // Initialize destination UI
    initDestinationUI();

    // â”€â”€ Google Maps-style Search Bar Toggle â”€â”€
    setupSearchBarToggle();

    // Wire up "View All" button in Travel Buddies section
    const viewAllBtn = document.getElementById('tbViewAll');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            // Trigger find companions with user's saved destination
            const currentUser = AppState.userData;
            if (currentUser && currentUser.latitude && currentUser.longitude) {
                const lat = parseFloat(currentUser.latitude);
                const lng = parseFloat(currentUser.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    PaginationState.currentPage = 0;
                    PaginationState.allCompanions = [];
                    findCompanions(lat, lng);
                    // Scroll to results after a brief delay
                    setTimeout(() => {
                        const resultsSection = document.getElementById('resultsSection');
                        if (resultsSection) {
                            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 500);
                }
            } else {
                showToast('Please set your destination first', 'info');
            }
        });
    }

    DOM.findCompanionBtn.addEventListener('click', () => {
        let searchLat, searchLng;

        // Hide Travel Buddies section when searching
        const tbSection = document.getElementById('travelBuddiesSection');
        if (tbSection) tbSection.style.display = 'none';

        const savedDestDisplay = document.getElementById('savedDestinationDisplay');
        const coordsSection = document.getElementById('coordsSection');

        // Check if using saved destination or manual coords
        if (savedDestDisplay && savedDestDisplay.style.display !== 'none') {
            // Using saved destination - use cleaned coords from user data
            const cleanCoord = (val) => {
                if (typeof val === 'number') return val;
                return parseFloat(String(val).replace(/[Â°'"NSEW\s]/gi, '').replace(/Ã‚/g, ''));
            };
            searchLat = cleanCoord(AppState.userData.latitude);
            searchLng = cleanCoord(AppState.userData.longitude);

            // Clear searched name so pill shows saved destination
            const dn = document.getElementById('homeDestName');
            if (dn) dn.value = '';
        } else {
            // Using manual coords
            searchLat = parseFloat(document.getElementById('homeDestLat').value);
            searchLng = parseFloat(document.getElementById('homeDestLng').value);
        }

        // Check if coordinates are valid
        if (isNaN(searchLat) || isNaN(searchLng)) {
            showToast('Please enter destination coordinates (Latitude & Longitude)', 'error');
            return;
        }

        // Reset pagination
        PaginationState.currentPage = 0;
        PaginationState.allCompanions = [];

        // Pass the search coordinates
        findCompanions(searchLat, searchLng);

        // Update weather badge for the searched location
        const searchedDestName = document.getElementById('homeDestName')?.value || '';
        if (typeof checkWeatherAndAnimate === 'function') {
            checkWeatherAndAnimate(searchLat, searchLng, searchedDestName || undefined);
        }

        // Collapse search section after searching
        closeSearchSection();
    });
}

// Initialize destination UI - show saved destination or coords input
function initDestinationUI() {
    const savedDestDisplay = document.getElementById('savedDestinationDisplay');
    const savedDestName = document.getElementById('savedDestName');
    const coordsSection = document.getElementById('coordsSection');
    const searchAnotherBtn = document.getElementById('searchAnotherBtn');
    const useSavedDestBtn = document.getElementById('useSavedDestBtn');

    if (!savedDestDisplay || !coordsSection) return;

    // Check if user has saved destination
    const hasSavedDest = AppState.userData &&
        AppState.userData.destinationName &&
        AppState.userData.latitude &&
        AppState.userData.longitude;

    if (hasSavedDest) {
        // Show saved destination, hide coords
        savedDestName.textContent = AppState.userData.destinationName;
        savedDestDisplay.style.display = 'block';
        coordsSection.style.display = 'none';
        useSavedDestBtn.style.display = 'inline-flex';
        console.log('ðŸ“ Showing saved destination:', AppState.userData.destinationName);
    } else {
        // No saved destination - show coords input
        savedDestDisplay.style.display = 'none';
        coordsSection.style.display = 'block';
        useSavedDestBtn.style.display = 'none';
    }

    // "Search for another location" button - switch to coords input
    if (searchAnotherBtn) {
        searchAnotherBtn.onclick = () => {
            savedDestDisplay.style.display = 'none';
            coordsSection.style.display = 'block';
            document.getElementById('homeDestLat').focus();
        };
    }

    // "Use my saved destination" button - switch back to saved destination
    if (useSavedDestBtn && hasSavedDest) {
        useSavedDestBtn.onclick = () => {
            savedDestDisplay.style.display = 'block';
            coordsSection.style.display = 'none';
            // Clear manual inputs (including searched name)
            document.getElementById('homeDestLat').value = '';
            document.getElementById('homeDestLng').value = '';
            const destNameInput = document.getElementById('homeDestName');
            if (destNameInput) destNameInput.value = '';

            // Update search pill and travel buddies place name to saved destination
            updateSearchBarHint();
            const tbPlaceText = document.getElementById('tbPlaceText');
            if (tbPlaceText) {
                tbPlaceText.textContent = `Near ${AppState.userData.destinationName}`;
            }
        };
    }
}

// Alias for backward compatibility
function updateSavedDestinationHint() {
    initDestinationUI();
}

async function findCompanions(searchLat, searchLng) {
    const currentUser = AppState.userData;

    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }

    // Use search coordinates if provided, otherwise fall back to user's saved coords
    let userLat = searchLat;
    let userLng = searchLng;

    if (isNaN(userLat) || isNaN(userLng)) {
        userLat = parseFloat(currentUser.latitude);
        userLng = parseFloat(currentUser.longitude);
    }

    if (isNaN(userLat) || isNaN(userLng)) {
        showToast('Please enter destination coordinates', 'error');
        return;
    }

    // Store search coords for reference
    PaginationState.searchCoords = { lat: userLat, lng: userLng };

    showToast('Searching for companions...', 'info');

    // === PRIMARY PATH: College-first + geohash bucketing (1 Firestore read) ===
    if (AppState.useFirebase && window.FirebaseService && window.FirebaseService.findSameCollegeNearby) {
        try {
            console.log('🏫 Using college-first geohash search (primary path)');
            const result = await FirebaseService.findSameCollegeNearby(
                userLat,
                userLng,
                currentUser.collegeName,
                currentUser.email
            );

            if (result.success && result.data && result.data.length > 0) {
                const companions = result.data;
                const meta = result.meta || {};

                // Determine search radius for display
                let searchRadius = '';
                if (companions.length > 0) {
                    const minDist = companions[0].distance;
                    const maxDist = companions[companions.length - 1].distance;
                    searchRadius = `${formatDistance(minDist)} - ${formatDistance(maxDist)}`;
                }

                PaginationState.searchRadius = searchRadius;
                PaginationState.filterLevel = 'Same college';
                PaginationState.collegeName = currentUser.collegeName;
                PaginationState.searchMeta = meta;
                PaginationState.allCompanions = companions;
                PaginationState.currentPage = 0;

                renderCompanionsPaginated();
                return;
            } else {
                console.warn('College-first search returned 0 results, trying 9-cell geohash fallback...');
            }
        } catch (error) {
            console.error('College-first search error:', error);
        }
    }

    // === SECONDARY FALLBACK: 9-cell geohash query (for cross-college or large datasets) ===
    if (AppState.useFirebase && window.FirebaseService && window.FirebaseService.findNearbyUsersGeohash) {
        const precisionLevels = [5, 4, 3];

        for (const precision of precisionLevels) {
            try {
                const precisionLabel = precision === 5 ? '~5km' : precision === 4 ? '~39km' : '~156km';
                console.log('Trying 9-cell Geohash query at precision ' + precision + ' (' + precisionLabel + ')');

                const result = await FirebaseService.findNearbyUsersGeohash(
                    userLat,
                    userLng,
                    currentUser.collegeName,
                    currentUser.email,
                    precision
                );

                if (result.success && result.data && result.data.length > 0) {
                    const companions = result.data;

                    let searchRadius = '';
                    if (companions.length > 0) {
                        const minDist = companions[0].distance;
                        const maxDist = companions[companions.length - 1].distance;
                        searchRadius = `${formatDistance(minDist)} - ${formatDistance(maxDist)}`;
                    }

                    PaginationState.searchRadius = searchRadius;
                    PaginationState.filterLevel = 'Same college (Geohash p' + precision + ')';
                    PaginationState.collegeName = currentUser.collegeName;
                    PaginationState.allCompanions = companions;
                    PaginationState.currentPage = 0;

                    renderCompanionsPaginated();
                    return;
                }
            } catch (error) {
                console.error('Geohash query error at precision ' + precision + ':', error);
            }
        }
        console.warn('All geohash precisions returned no results, falling back to local search');
    }

    // === LAST RESORT: Local search (brute-force) ===
    console.log('Using local search (last resort)');
    await findCompanionsLocal(userLat, userLng, currentUser);
}

// Local fallback search — uses geohash prefix bucketing when available
async function findCompanionsLocal(userLat, userLng, currentUser) {
    // Fetch same-college users (cache-first — avoids Firebase on every load)
    let users = await cachedFetchUsers('college');

    // Step 1: Progressive filtering with fallback
    let eligibleUsers = [];
    let filterLevel = '';

    // Level 1: Same college + Same starting location (strictest)
    eligibleUsers = users.filter(u => {
        if (u.email === currentUser.email) return false;
        const sameCollege = u.collegeName?.toLowerCase() === currentUser.collegeName?.toLowerCase();
        const sameStarting = u.startingCollege?.id === currentUser.startingCollege?.id;
        const hasCoords = !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
        return sameCollege && sameStarting && hasCoords;
    });

    if (eligibleUsers.length > 0) {
        filterLevel = 'Same college & starting point';
    } else {
        // Level 2: Same college only
        eligibleUsers = users.filter(u => {
            if (u.email === currentUser.email) return false;
            const sameCollege = u.collegeName?.toLowerCase() === currentUser.collegeName?.toLowerCase();
            const hasCoords = !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
            return sameCollege && hasCoords;
        });

        if (eligibleUsers.length > 0) {
            filterLevel = 'Same college';
        } else {
            // Level 3: All users with coordinates (most relaxed)
            eligibleUsers = users.filter(u => {
                if (u.email === currentUser.email) return false;
                const hasCoords = !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
                return hasCoords;
            });
            filterLevel = 'All users';
        }
    }

    // Store filter level and college for display
    PaginationState.filterLevel = filterLevel;
    PaginationState.collegeName = currentUser.collegeName;

    console.log('🔍 Local search from:', { userLat, userLng });
    console.log('👥 Eligible users:', eligibleUsers.length);

    // Step 2: Geohash prefix bucketing + Haversine distance calculation
    // Use geohash to skip Haversine for obviously-far users when dataset > threshold
    const BUCKET_PRECISION = 4; // ~39km cells — city-level proximity
    const MIN_NEARBY = 5;       // Expand to all if nearby bucket < 5
    let companions = [];

    const hasGeohash = window.GeohashUtils && eligibleUsers.length > MIN_NEARBY;
    let searchPrefix = '';

    if (hasGeohash) {
        try {
            searchPrefix = GeohashUtils.encode(userLat, userLng, BUCKET_PRECISION);
        } catch (e) {
            // Fall through to brute-force
        }
    }

    if (searchPrefix) {
        // Bucket using stored destinationGeohash — O(1) string check per user
        const nearbyBucket = [];
        const fartherBucket = [];

        for (const user of eligibleUsers) {
            if (user.destinationGeohash && user.destinationGeohash.startsWith(searchPrefix)) {
                nearbyBucket.push(user);
            } else {
                fartherBucket.push(user);
            }
        }

        console.log(`📍 Geohash bucketing: nearby=${nearbyBucket.length}, farther=${fartherBucket.length}`);

        // Compute distances for nearby bucket
        companions = nearbyBucket.map(user => ({
            ...user,
            distance: calculateDistance(userLat, userLng, parseFloat(user.latitude), parseFloat(user.longitude)),
            isExact: true
        }));

        // Expand if nearby bucket is sparse
        if (companions.length < MIN_NEARBY && fartherBucket.length > 0) {
            console.log(`🔄 Nearby (${companions.length}) < ${MIN_NEARBY}, computing all distances`);
            const fartherCompanions = fartherBucket.map(user => ({
                ...user,
                distance: calculateDistance(userLat, userLng, parseFloat(user.latitude), parseFloat(user.longitude)),
                isExact: true
            }));
            companions = companions.concat(fartherCompanions);
        }
    } else {
        // Brute-force: calculate distance for all eligible users
        companions = eligibleUsers.map(user => ({
            ...user,
            distance: calculateDistance(userLat, userLng, parseFloat(user.latitude), parseFloat(user.longitude)),
            isExact: true
        }));
    }

    // Sort ascending by distance (nearest first)
    companions.sort((a, b) => a.distance - b.distance);

    // Determine search radius label based on results
    let searchRadius = '';
    if (companions.length > 0) {
        const minDist = companions[0].distance;
        const maxDist = companions[companions.length - 1].distance;
        searchRadius = `${formatDistance(minDist)} - ${formatDistance(maxDist)}`;
    }

    PaginationState.searchRadius = searchRadius;
    PaginationState.allCompanions = companions;
    PaginationState.currentPage = 0;

    // Render first page
    renderCompanionsPaginated();
}

function renderCompanionsPaginated() {
    DOM.resultsSection.style.display = 'block';

    const { allCompanions, currentPage, pageSize } = PaginationState;
    const startIdx = currentPage * pageSize;
    const endIdx = startIdx + pageSize;
    const pageCompanions = allCompanions.slice(startIdx, endIdx);
    const hasMore = endIdx < allCompanions.length;
    const totalShowing = Math.min(endIdx, allCompanions.length);

    if (allCompanions.length === 0) {
        DOM.companionsList.innerHTML = `
            <div class="empty-state" style="padding: 2rem;">
                <i class="fas fa-search" style="font-size: 2rem;"></i>
                <h4>No companions found</h4>
                <p>No students from your college with the same starting location found.</p>
            </div>
        `;
        return;
    }

    // Update route info labels
    const startEl = document.getElementById('resultsStartLocation');
    const endEl = document.getElementById('resultsEndLocation');
    if (startEl) {
        const startName = AppState.userData?.startingCollege?.name || AppState.userData?.startingCollege?.id || 'Your location';
        startEl.textContent = startName;
    }
    if (endEl) {
        const searchedName = document.getElementById('homeDestName')?.value;
        const savedName = AppState.userData?.destinationName;
        endEl.textContent = searchedName || savedName || 'Destination';
    }

    // Update college badge and count
    const collegeRow = document.getElementById('resultsCollegeRow');
    const collegeName = document.getElementById('resultsCollegeName');
    const countBadge = document.getElementById('resultsCountBadge');

    if (PaginationState.collegeName && collegeRow && collegeName) {
        collegeName.textContent = PaginationState.collegeName;
        collegeRow.style.display = 'flex';
    } else if (collegeRow) {
        collegeRow.style.display = 'none';
    }

    if (countBadge) {
        countBadge.textContent = `${allCompanions.length} found`;
    }

    // Build companion cards HTML
    // Cache all companions for profile modal lookup
    pageCompanions.forEach(c => cacheUser(c));

    const cardsHtml = pageCompanions.map(companion => {
        const distanceFormatted = formatDistance(companion.distance);
        const proximityClass = companion.distance < 5 ? 'nearby' : companion.distance < 20 ? 'moderate' : 'far';
        const isEstimate = !companion.isExact;

        return `
        <div class="companion-card enhanced" data-email="${companion.email}">
            <div class="companion-avatar" onclick="openProfileModalByEmail('${companion.email}')">
                <img src="${companion.profilePic || 'https://via.placeholder.com/60'}" alt="${companion.fullName}">
                <span class="distance-badge ${proximityClass}">${distanceFormatted}${isEstimate ? '~' : ''}</span>
            </div>
            <div class="companion-info">
                <h4>${companion.fullName}</h4>
                <p class="companion-college"><i class="fas fa-university"></i> ${companion.collegeName}</p>
                <p class="companion-route">
                    <i class="fas fa-route"></i> 
                    ${capitalizeFirst(companion.startingCollege?.location || companion.startingCollege?.name || companion.startingCollege?.id || 'N/A')} → ${capitalizeFirst(companion.destinationName || 'N/A')}
                </p>
                <div class="companion-meta">
                    <span class="travel-mode"><i class="fas fa-${getTravelModeIcon(companion.travelMode)}"></i> ${capitalizeFirst(companion.travelMode)}</span>
                    <span class="travel-days"><i class="fas fa-calendar-alt"></i> ${companion.travelDays?.map(d => d.slice(0, 3)).join(', ') || 'N/A'}</span>
                </div>
            </div>
            <div class="companion-actions">
                <button class="btn btn-primary message-btn" onclick="startChatWithUser('${companion.email}')">
                    <i class="fas fa-comment"></i>
                    <span>Message</span>
                </button>
            </div>
        </div>
    `}).join('');

    // If first page, replace content; otherwise append
    if (currentPage === 0) {
        DOM.companionsList.innerHTML = cardsHtml;
    } else {
        // Remove old load more button
        const oldBtn = DOM.companionsList.querySelector('.load-more-container');
        if (oldBtn) oldBtn.remove();

        DOM.companionsList.insertAdjacentHTML('beforeend', cardsHtml);
    }

    // Add Load More button if there are more results
    if (hasMore) {
        const remaining = allCompanions.length - endIdx;
        DOM.companionsList.insertAdjacentHTML('beforeend', `
            <div class="load-more-container">
                <button class="btn btn-secondary load-more-btn" onclick="loadMoreCompanions()">
                    <i class="fas fa-chevron-down"></i>
                    Load More (${remaining} remaining)
                </button>
            </div>
        `);
    }
}

// Load more companions
function loadMoreCompanions() {
    PaginationState.currentPage++;
    renderCompanionsPaginated();
}

// Get travel mode icon
function getTravelModeIcon(mode) {
    const icons = {
        bus: 'bus',
        personal: 'car',
        train: 'train',
        metro: 'subway',
        bike: 'motorcycle',
        carpool: 'car-side'
    };
    return icons[mode] || 'car';
}

// Get user by email (helper for profile modal)
// Global cache of all rendered users keyed by email
const _userCache = new Map();

function cacheUser(user) {
    if (user && user.email) _userCache.set(user.email, user);
}

function getUserByEmail(email) {
    // 1. Check global user cache (populated when cards are rendered)
    if (_userCache.has(email)) return _userCache.get(email);
    // 2. Check current search results
    if (PaginationState.allCompanions && PaginationState.allCompanions.length > 0) {
        const fromResults = PaginationState.allCompanions.find(u => u.email === email);
        if (fromResults) { cacheUser(fromResults); return fromResults; }
    }
    // 3. Fallback to localStorage
    const users = getFromLocalStorage('travelBuddyUsers') || [];
    return users.find(u => u.email === email) || null;
}

// Open profile modal — supports async Firebase fetch if user not cached locally
async function openProfileModalByEmail(email) {
    let user = getUserByEmail(email);
    if (user) { openProfileModal(user); return; }

    // Try fetching from Firebase
    if (AppState.useFirebase && window.FirebaseService) {
        try {
            const result = await FirebaseService.getUserByEmail(email);
            if (result.success && result.data) {
                cacheUser(result.data);
                openProfileModal(result.data);
                return;
            }
        } catch (e) { /* ignore */ }
    }
    console.warn('Could not find user for profile modal:', email);
    showToast('Could not load user profile', 'error');
}

// Start chat with user from companion card
function startChatWithUser(email) {
    const user = getUserByEmail(email);
    if (user) {
        // Switch to messages page and open chat
        switchPage('messages');
        setTimeout(() => {
            openChat(user);
        }, 100);
    }
}

// ============ Map Page ============
const MapPageState = {
    map: null,
    markers: [],
    popups: [],
    users: [],
    clusterGroup: null,
    searchMarker: null,
    searchedLat: null,
    searchedLng: null,
    isInitialized: false,
    debounceTimer: null,
    // Sheet pagination
    sheetPage: 0,
    sheetPageSize: 30,
    sheetUsers: []
};

function initMapPage() {
    if (MapPageState.isInitialized) {
        // Just resize existing map
        if (MapPageState.map) {
            setTimeout(() => MapPageState.map.invalidateSize(), 100);
        }
        return;
    }

    const container = document.getElementById('buddyMap');
    if (!container) return;

    // Init OlaMaps if needed (for search autocomplete/geocoding)
    const OLA_MAPS_API_KEY = 'IiJt0dF87sckv1WEZ9aaBAxDB98MiKBv6nAB8CUu';
    if (window.OlaMapsService && !OlaMapsService.isInitialized()) {
        OlaMapsService.init(OLA_MAPS_API_KEY);
    }

    // Determine center — user's destination or India default
    const user = AppState.userData;
    let center = [20.5937, 78.9629]; // India center [lat, lng]
    let zoom = 5;
    if (user && user.latitude && user.longitude) {
        const lat = parseFloat(user.latitude);
        const lng = parseFloat(user.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            center = [lat, lng];
            zoom = 10;
        }
    }

    try {
        // Create Leaflet map with Carto Dark tiles
        MapPageState.map = L.map('buddyMap', {
            center: center,
            zoom: zoom,
            zoomControl: false
        });

        // Add Carto Dark Matter tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(MapPageState.map);

        // Add zoom control to top-right
        L.control.zoom({ position: 'topright' }).addTo(MapPageState.map);

        // Load users — delay slightly to let the container size settle
        // (map is often initialized while the page is still hidden)
        setTimeout(() => {
            MapPageState.map.invalidateSize();
            loadMapUsers();
        }, 200);

        setupMapSearch();
        setupBottomSheetDrag();

        // Delegated handler for popup "View Profile" buttons
        document.getElementById('buddyMap')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.map-popup-profile-btn');
            if (!btn) return;
            const email = btn.dataset.email;
            const user = MapPageState.users.find(u => u.email === email);
            if (user) openProfileModal(user);
        });
        MapPageState.isInitialized = true;
        console.log('🗺️ Map page initialized (Leaflet + Carto)');
    } catch (error) {
        console.error('Map init error:', error);
        const st = document.getElementById('mapSheetTitle');
        if (st) st.textContent = 'Failed to load map';
    }
}

async function loadMapUsers() {
    const currentUser = AppState.userData;
    if (!currentUser) {
        const st = document.getElementById('mapSheetTitle');
        if (st) st.textContent = 'Please log in';
        return;
    }

    // Fetch same-college users (cache-first — avoids Firebase on every load)
    let users = await cachedFetchUsers('college');

    // Filter same-college users with valid coordinates
    const sameCollegeUsers = users.filter(u => {
        if (u.email === currentUser.email) return false;
        const sameCollege = u.collegeName?.toLowerCase() === currentUser.collegeName?.toLowerCase();
        const hasCoords = !isNaN(parseFloat(u.latitude)) && !isNaN(parseFloat(u.longitude));
        return sameCollege && hasCoords;
    });

    // Clear existing markers and cluster group
    if (MapPageState.clusterGroup && MapPageState.map) {
        MapPageState.map.removeLayer(MapPageState.clusterGroup);
    }
    MapPageState.markers.forEach(m => { if (MapPageState.map) MapPageState.map.removeLayer(m); });
    MapPageState.popups = [];
    MapPageState.markers = [];
    MapPageState.users = sameCollegeUsers;

    // Create cluster group for user markers
    MapPageState.clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        disableClusteringAtZoom: 15
    });

    // Add current user marker (man standing icon) — NOT in cluster group
    if (currentUser.latitude && currentUser.longitude) {
        const lat = parseFloat(currentUser.latitude);
        const lng = parseFloat(currentUser.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            const myIcon = L.divIcon({
                className: 'map-my-marker',
                html: `<span class="map-my-label">You</span><div class="map-my-circle"><i class="fas fa-person"></i></div><span class="map-my-dest">${currentUser.destinationName || ''}</span>`,
                iconSize: [60, 60],
                iconAnchor: [30, 30],
                popupAnchor: [0, -30]
            });
            const marker = L.marker([lat, lng], { icon: myIcon })
                .bindPopup(`
                    <div class="map-popup-content">
                        <div class="map-popup-name">You</div>
                        <div class="map-popup-dest">
                            <i class="fas fa-map-marker-alt"></i>
                            ${currentUser.destinationName || 'No destination set'}
                        </div>
                    </div>
                `, { offset: [0, 0] })
                .addTo(MapPageState.map);
            MapPageState.markers.push(marker);
        }
    }

    // Add user markers to cluster group
    const bounds = L.latLngBounds();
    let hasPoints = false;

    sameCollegeUsers.forEach(user => {
        const lat = parseFloat(user.latitude);
        const lng = parseFloat(user.longitude);

        const cuLat = parseFloat(currentUser.latitude);
        const cuLng = parseFloat(currentUser.longitude);
        const hasCu = !isNaN(cuLat) && !isNaN(cuLng);
        const dist = hasCu ? calculateDistance(cuLat, cuLng, lat, lng) : undefined;
        let distLabel = '';
        if (dist !== undefined) {
            const fmt = dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} KM`;
            distLabel = `<span class="map-marker-dist">${fmt}</span>`;
        }

        const userIcon = L.divIcon({
            className: 'map-user-marker-wrap',
            html: `<div class="map-user-marker"><img src="${user.profilePic || 'https://via.placeholder.com/42'}" alt="${user.fullName}"></div>${distLabel}`,
            iconSize: [48, 60],
            iconAnchor: [24, 30],
            popupAnchor: [0, -30]
        });

        const popupHTML = buildPopupHTML(user, dist);

        const marker = L.marker([lat, lng], { icon: userIcon })
            .bindPopup(popupHTML, { offset: [0, 0] });

        marker._userData = user;

        // Add to cluster group instead of map directly
        MapPageState.clusterGroup.addLayer(marker);
        MapPageState.markers.push(marker);
        MapPageState.popups.push(marker.getPopup());
        bounds.extend([lat, lng]);
        hasPoints = true;
    });

    // Add cluster group to map
    MapPageState.map.addLayer(MapPageState.clusterGroup);

    // Also include current user in bounds
    if (currentUser.latitude && currentUser.longitude) {
        const lat = parseFloat(currentUser.latitude);
        const lng = parseFloat(currentUser.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            bounds.extend([lat, lng]);
            hasPoints = true;
        }
    }

    // Fit map to show all markers
    if (hasPoints && sameCollegeUsers.length > 0 && bounds.isValid()) {
        MapPageState.map.fitBounds(bounds, {
            paddingTopLeft: [40, 80],
            paddingBottomRight: [40, 100],
            maxZoom: 12
        });
    }

    // Update sheet header
    const sheetCount = document.getElementById('mapSheetCount');
    if (sheetCount) sheetCount.textContent = sameCollegeUsers.length;

    // Calculate distance from current user and sort nearest â†’ farthest
    const userLat = parseFloat(currentUser.latitude);
    const userLng = parseFloat(currentUser.longitude);
    const hasUserCoords = !isNaN(userLat) && !isNaN(userLng);

    const sortedUsers = sameCollegeUsers.map(u => {
        const d = hasUserCoords
            ? calculateDistance(userLat, userLng, parseFloat(u.latitude), parseFloat(u.longitude))
            : null;
        return { ...u, _distance: d };
    }).sort((a, b) => (a._distance ?? 9999) - (b._distance ?? 9999));

    // Populate bottom sheet cards (always show distance)
    renderSheetCards(sortedUsers, hasUserCoords);
}

function buildPopupHTML(user, distance) {
    let distHtml = '';
    if (distance !== undefined && distance !== null) {
        const formatted = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} KM`;
        distHtml = `
            <div class="map-popup-distance">
                <i class="fas fa-ruler-horizontal"></i>
                ${formatted} away
            </div>
        `;
    }

    return `
        <div class="map-popup-content">
            <div class="map-popup-name">${user.fullName || 'Unknown'}</div>
            <div class="map-popup-dest">
                <i class="fas fa-map-marker-alt"></i>
                ${user.destinationName || 'No destination'}
            </div>
            ${distHtml}
            <button class="map-popup-profile-btn" data-email="${user.email}">
                <i class="fas fa-user"></i> View Profile
            </button>
        </div>
    `;
}

function setupMapSearch() {
    const input = document.getElementById('mapSearchInput');
    const suggestions = document.getElementById('mapSuggestions');
    const clearBtn = document.getElementById('mapSearchClear');

    if (!input || !suggestions) return;

    // Debounced search
    input.addEventListener('input', () => {
        clearTimeout(MapPageState.debounceTimer);
        const query = input.value.trim();

        if (query.length < 2) {
            suggestions.classList.remove('active');
            clearBtn.style.display = 'none';
            return;
        }

        clearBtn.style.display = 'block';

        MapPageState.debounceTimer = setTimeout(async () => {
            if (!window.OlaMapsService || !OlaMapsService.isInitialized()) return;

            try {
                const results = await OlaMapsService.autocomplete(query);
                if (results && results.length > 0) {
                    suggestions.innerHTML = results.map((place, i) => `
                        <div class="map-suggestion-item" data-index="${i}" data-place-id="${place.placeId}" data-description="${place.description}">
                            <i class="fas fa-map-marker-alt"></i>
                            <div class="map-suggestion-text">
                                <div class="map-suggestion-main">${place.mainText}</div>
                                <div class="map-suggestion-sub">${place.secondaryText}</div>
                            </div>
                        </div>
                    `).join('');
                    suggestions.classList.add('active');

                    // Click handlers
                    suggestions.querySelectorAll('.map-suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            selectMapPlace(item.dataset.placeId, item.dataset.description);
                            suggestions.classList.remove('active');
                        });
                    });
                } else {
                    suggestions.innerHTML = `<div class="map-suggestion-item"><i class="fas fa-info-circle"></i><div class="map-suggestion-text"><div class="map-suggestion-main">No results found</div></div></div>`;
                    suggestions.classList.add('active');
                }
            } catch (error) {
                console.error('Map search error:', error);
            }
        }, 300);
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        suggestions.classList.remove('active');
        clearMapSearch();
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.map-search-bar')) {
            suggestions.classList.remove('active');
        }
    });
}

async function selectMapPlace(placeId, description) {
    const input = document.getElementById('mapSearchInput');
    input.value = description;

    const placeDetails = await OlaMapsService.getPlaceDetails(placeId, description);
    if (!placeDetails) return;

    const lat = placeDetails.lat;
    const lng = placeDetails.lng;

    MapPageState.searchedLat = lat;
    MapPageState.searchedLng = lng;

    // Remove old search marker
    if (MapPageState.searchMarker) {
        MapPageState.map.removeLayer(MapPageState.searchMarker);
    }

    // Add search location marker (pin style)
    const searchIcon = L.divIcon({
        className: 'map-search-marker',
        html: '<i class="fas fa-search"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
    MapPageState.searchMarker = L.marker([lat, lng], { icon: searchIcon })
        .addTo(MapPageState.map);

    // Fly to searched location
    MapPageState.map.flyTo([lat, lng], 10, { duration: 1.5 });

    // Calculate and show distances
    updateMapDistances(lat, lng);
}

function updateMapDistances(searchLat, searchLng) {
    // Recalculate distance for each user marker and update popups
    MapPageState.markers.forEach(marker => {
        const user = marker._userData;
        if (!user) return; // Skip current-user marker

        const userLat = parseFloat(user.latitude);
        const userLng = parseFloat(user.longitude);
        const distance = calculateDistance(searchLat, searchLng, userLat, userLng);

        // Update popup content with distance
        const popupHTML = buildPopupHTML(user, distance);
        marker.getPopup().setContent(popupHTML);

        // Store distance for sorting
        marker._distance = distance;
    });

    // Re-render bottom sheet sorted by distance
    const sorted = MapPageState.users
        .map(u => {
            const d = calculateDistance(searchLat, searchLng, parseFloat(u.latitude), parseFloat(u.longitude));
            return { ...u, _distance: d };
        })
        .sort((a, b) => a._distance - b._distance);

    renderSheetCards(sorted, true);
}

function clearMapSearch() {
    MapPageState.searchedLat = null;
    MapPageState.searchedLng = null;

    // Remove search marker
    if (MapPageState.searchMarker) {
        MapPageState.map.removeLayer(MapPageState.searchMarker);
        MapPageState.searchMarker = null;
    }

    // Reset popups to remove distance info
    MapPageState.markers.forEach(marker => {
        const user = marker._userData;
        if (!user) return;
        const popupHTML = buildPopupHTML(user);
        marker.getPopup().setContent(popupHTML);
        delete marker._distance;
    });

    // Re-render sheet without distances
    renderSheetCards(MapPageState.users);

    // Fit bounds to show all markers
    if (MapPageState.users.length > 0 && MapPageState.map) {
        const bounds = L.latLngBounds();
        MapPageState.markers.forEach(m => {
            bounds.extend(m.getLatLng());
        });
        if (bounds.isValid()) {
            MapPageState.map.fitBounds(bounds, {
                paddingTopLeft: [40, 80],
                paddingBottomRight: [40, 140],
                maxZoom: 12
            });
        }
    }
}

function renderSheetCards(users, showDistance = false) {
    const body = document.getElementById('mapSheetBody');
    if (!body) return;

    if (!users || users.length === 0) {
        body.innerHTML = `
            <div class="map-sheet-empty">
                <i class="fas fa-users-slash"></i>
                <span>No travel buddies found from your college</span>
            </div>
        `;
        MapPageState.sheetUsers = [];
        return;
    }

    // Store for pagination
    MapPageState.sheetUsers = users;
    MapPageState.sheetShowDistance = showDistance;
    MapPageState.sheetPage = 0;
    body.innerHTML = '';
    renderSheetBatch();
    setupSheetScrollObserver();
    setupSheetDelegation();
}

// Render a batch of sheet cards (30 at a time)
function renderSheetBatch() {
    const body = document.getElementById('mapSheetBody');
    const { sheetUsers, sheetPage, sheetPageSize, sheetShowDistance } = MapPageState;

    const start = sheetPage * sheetPageSize;
    const batch = sheetUsers.slice(start, start + sheetPageSize);
    if (batch.length === 0) return;

    // Remove old sentinel
    const oldSentinel = body.querySelector('.sheet-scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = batch.map(user => {
        let distBadge = '';
        if (sheetShowDistance && user._distance !== undefined) {
            const d = user._distance;
            const formatted = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} KM`;
            distBadge = `<span class="map-sheet-card-dist">${formatted}</span>`;
        }

        return `
            <div class="map-sheet-card" data-email="${user.email}" data-lat="${user.latitude}" data-lng="${user.longitude}">
                <div class="map-sheet-card-avatar">
                    <img src="${user.profilePic || 'https://via.placeholder.com/44'}" alt="${user.fullName}">
                </div>
                <div class="map-sheet-card-info">
                    <div class="map-sheet-card-name">${user.fullName || 'Unknown'}</div>
                    <div class="map-sheet-card-dest">
                        <i class="fas fa-circle"></i>
                        ${user.destinationName || 'No destination'}
                    </div>
                </div>
                ${distBadge}
            </div>
        `;
    }).join('');

    body.insertAdjacentHTML('beforeend', html);
    MapPageState.sheetPage++;

    // Add sentinel if more cards
    const totalRendered = MapPageState.sheetPage * sheetPageSize;
    if (totalRendered < sheetUsers.length) {
        body.insertAdjacentHTML('beforeend', '<div class="sheet-scroll-sentinel" style="height:1px;"></div>');
    }
}

// Infinite scroll for sheet
function setupSheetScrollObserver() {
    if (MapPageState.sheetScrollObserver) {
        MapPageState.sheetScrollObserver.disconnect();
    }

    const body = document.getElementById('mapSheetBody');
    MapPageState.sheetScrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                renderSheetBatch();
                const newSentinel = body.querySelector('.sheet-scroll-sentinel');
                if (newSentinel) MapPageState.sheetScrollObserver.observe(newSentinel);
            }
        });
    }, { root: body, rootMargin: '100px' });

    const sentinel = body.querySelector('.sheet-scroll-sentinel');
    if (sentinel) MapPageState.sheetScrollObserver.observe(sentinel);
}

// Event delegation for sheet cards (1 listener instead of N)
function setupSheetDelegation() {
    const body = document.getElementById('mapSheetBody');
    body.removeEventListener('click', _sheetClickHandler);
    body.addEventListener('click', _sheetClickHandler);
}

function _sheetClickHandler(e) {
    const card = e.target.closest('.map-sheet-card');
    if (!card) return;

    const email = card.dataset.email;

    // Avatar click → profile modal
    if (e.target.closest('.map-sheet-card-avatar')) {
        e.stopPropagation();
        const user = MapPageState.users.find(u => u.email === email);
        if (user) openProfileModal(user);
        return;
    }

    // Info click → fly to marker
    if (e.target.closest('.map-sheet-card-info')) {
        e.stopPropagation();
        const lat = parseFloat(card.dataset.lat);
        const lng = parseFloat(card.dataset.lng);
        if (!isNaN(lat) && !isNaN(lng) && MapPageState.map) {
            const sheet = document.getElementById('mapBottomSheet');
            if (sheet) {
                sheet.classList.remove('sheet-half', 'sheet-full');
                sheet.style.height = '200px';
            }

            MapPageState.map.flyTo([lat, lng], 14, { duration: 1.2 });

            setTimeout(() => {
                if (sheet) sheet.style.height = '';
            }, 1300);

            MapPageState.markers.forEach(m => {
                if (m._userData && m._userData.email === email) m.openPopup();
            });
        }
    }
}

function setupBottomSheetDrag() {
    const sheet = document.getElementById('mapBottomSheet');
    const handle = document.getElementById('mapSheetHandle');
    if (!sheet || !handle) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;

    const PEEK = 120;
    const parentHeight = () => sheet.parentElement?.clientHeight || window.innerHeight;
    const HALF = () => parentHeight() * 0.45;
    const FULL = () => parentHeight() * 0.85;

    function onStart(e) {
        isDragging = true;
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        startHeight = sheet.getBoundingClientRect().height;
        sheet.classList.add('sheet-dragging');
        e.preventDefault();
    }

    function onMove(e) {
        if (!isDragging) return;
        const currentY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const delta = startY - currentY; // positive = dragging up
        let newHeight = startHeight + delta;

        // Clamp
        newHeight = Math.max(PEEK, Math.min(FULL(), newHeight));
        sheet.style.height = newHeight + 'px';
        e.preventDefault();
    }

    function onEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        sheet.classList.remove('sheet-dragging');

        const currentHeight = sheet.getBoundingClientRect().height;
        const ph = parentHeight();

        // Remove inline height, snap to closest state
        sheet.style.height = '';
        sheet.classList.remove('sheet-half', 'sheet-full');

        if (currentHeight > ph * 0.65) {
            sheet.classList.add('sheet-full');
        } else if (currentHeight > ph * 0.25) {
            sheet.classList.add('sheet-half');
        }
        // else: peek (no class needed, default CSS)
    }

    // Touch events
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    // Mouse events (for desktop testing)
    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
}

// ============ Logout ============
function setupLogout() {
    DOM.logoutBtn.addEventListener('click', async () => {
        // Sign out from Firebase if available
        if (AppState.useFirebase && window.FirebaseService) {
            try {
                await FirebaseService.signOut();
            } catch (error) {
                console.error('Firebase signout error:', error);
            }
        }

        localStorage.removeItem('travelBuddyUser');
        AppState.userData = null;
        AppState.firebaseUserId = null;
        showToast('Logged out successfully', 'info');
        showAuthPages();

        // Reset form
        DOM.signupForm.reset();
        DOM.loginForm.reset();
        AppState.currentStep = 1;
        showStep(1);
    });
}

// ============ Auth Page Switching ============
function setupAuthSwitching() {
    DOM.showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.signupPage.classList.remove('active');
        DOM.loginPage.classList.add('active');
    });

    DOM.showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.loginPage.classList.remove('active');
        DOM.signupPage.classList.add('active');
    });
}

// ============ Check Existing Session ============
async function checkSession() {
    // First check localStorage for cached user
    const cachedUser = getFromLocalStorage('travelBuddyUser');

    // If Firebase is available, set up auth state listener
    if (AppState.useFirebase && window.FirebaseService) {
        FirebaseService.onAuthStateChange(async (firebaseUser) => {
            if (firebaseUser) {
                // User is signed in with Firebase
                AppState.firebaseUserId = firebaseUser.uid;

                // Try to get profile from Firestore
                const profileResult = await FirebaseService.getUserProfile(firebaseUser.uid);

                if (profileResult.success) {
                    AppState.userData = profileResult.data;
                    AppState.userData.firebaseUserId = firebaseUser.uid;
                    saveToLocalStorage('travelBuddyUser', AppState.userData);
                    showMainApp();
                } else if (cachedUser) {
                    // Fallback to cached data
                    AppState.userData = cachedUser;
                    showMainApp();
                }
            } else {
                // No Firebase user, check localStorage cache
                if (cachedUser && cachedUser.firebaseUserId) {
                    // Had Firebase session but now signed out
                    // Clear the cached user
                    localStorage.removeItem('travelBuddyUser');
                    AppState.userData = null;
                    showAuthPages();
                } else if (cachedUser) {
                    // localStorage-only user (no Firebase)
                    AppState.userData = cachedUser;
                    showMainApp();
                }
            }
        });
    } else {
        // No Firebase, use localStorage only
        if (cachedUser) {
            AppState.userData = cachedUser;
            showMainApp();
        }
    }
}

// ============ Initialize App ============

// ============ Signup Location Autocomplete (Ola Maps) ============
// State for signup location autocomplete
const SignupLocationState = {
    debounceTimer: null,
    map: null,
    isInitialized: false,
    centerPinSetup: false
};

function setupSignupLocationAutocomplete() {
    const searchInput = document.getElementById('signupLocationSearch');
    const suggestionsDropdown = document.getElementById('signupLocationSuggestions');
    const mapContainer = document.getElementById('signupLocationMap');
    const clearBtn = document.getElementById('clearSignupLocationBtn');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const destinationNameInput = document.getElementById('destinationName');

    if (!searchInput || !suggestionsDropdown) {
        console.log('ðŸ“ Signup location autocomplete elements not found');
        return;
    }

    // Initialize Ola Maps Service
    // IMPORTANT: Replace with your actual API key
    const OLA_MAPS_API_KEY = 'IiJt0dF87sckv1WEZ9aaBAxDB98MiKBv6nAB8CUu';

    if (window.OlaMapsService) {
        const initialized = OlaMapsService.init(OLA_MAPS_API_KEY);
        if (!initialized) {
            console.warn('âš ï¸ Ola Maps API key not set. Location autocomplete will not work.');
            // Show manual input fallback
            searchInput.placeholder = 'API key required - enter location manually';
        } else {
            console.log('âœ… Ola Maps Service initialized');
            SignupLocationState.isInitialized = true;
        }
    } else {
        console.warn('âš ï¸ OlaMapsService not loaded');
        return;
    }

    // Debounced search function
    function debounce(fn, delay) {
        return function (...args) {
            clearTimeout(SignupLocationState.debounceTimer);
            SignupLocationState.debounceTimer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Show loading state
    function showLoading() {
        suggestionsDropdown.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Searching...</span>
            </div>
        `;
        suggestionsDropdown.classList.add('active');
    }

    // Show no results
    function showNoResults() {
        suggestionsDropdown.innerHTML = `
            <div class="no-results">
                <i class="fas fa-map-marker-alt"></i>
                <span>No locations found</span>
            </div>
        `;
    }

    // Render suggestions
    function renderSuggestions(suggestions) {
        if (suggestions.length === 0) {
            showNoResults();
            return;
        }

        suggestionsDropdown.innerHTML = suggestions.map((place, index) => `
            <div class="suggestion-item" data-index="${index}" 
                 data-place-id="${place.placeId}" 
                 data-description="${place.description}">
                <i class="fas fa-map-marker-alt"></i>
                <div class="suggestion-text">
                    <div class="suggestion-main">${place.mainText}</div>
                    <div class="suggestion-sub">${place.secondaryText}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers
        suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                selectLocation(item.dataset.placeId, item.dataset.description);
            });
        });
    }

    // Select a location
    async function selectLocation(placeId, description) {
        // Update search input
        searchInput.value = description;
        clearBtn.style.display = 'block';

        // Hide suggestions
        suggestionsDropdown.classList.remove('active');

        // Show loading in map area (but don't destroy existing map)
        mapContainer.classList.add('active');

        // Only show loading spinner if map doesn't exist yet
        if (!SignupLocationState.map) {
            mapContainer.innerHTML = '<div class="loading" style="height:100%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-spinner fa-spin"></i><span>Loading map...</span></div>';
        }

        // Get place details (lat/lng)
        const placeDetails = await OlaMapsService.getPlaceDetails(placeId, description);

        if (placeDetails) {
            // Store coordinates in hidden inputs
            latInput.value = placeDetails.lat;
            lngInput.value = placeDetails.lng;

            // Update destination name
            destinationNameInput.value = placeDetails.name || description.split(',')[0];

            // Check if map exists and is still valid
            const existingMap = OlaMapsService.getMap();

            if (existingMap && SignupLocationState.map) {
                // Map exists - fly to new location; center-pin follows automatically
                OlaMapsService.flyTo(placeDetails.lat, placeDetails.lng, 14);
                setupCenterPin();
            } else {
                // Map doesn't exist or was destroyed - create new one
                mapContainer.innerHTML = ''; // Clear loading
                SignupLocationState.map = OlaMapsService.initMap('signupLocationMap', {
                    center: [placeDetails.lat, placeDetails.lng],
                    zoom: 14,
                    satellite: true
                });

                if (SignupLocationState.map) {
                    setupCenterPin();
                }
            }

        } else {
            mapContainer.innerHTML = '<div class="no-results" style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;"><i class="fas fa-exclamation-triangle"></i><span>Could not get location details</span></div>';
            showToast('Could not get location details. Please try another location.', 'error');
        }
    }

    // Helper: inject the fixed center-pin overlay and wire up map-drag listeners
    function setupCenterPin() {
        if (!SignupLocationState.map || SignupLocationState.centerPinSetup) return;
        SignupLocationState.centerPinSetup = true;

        // Inject a pure-CSS pin that stays fixed at the visual center of the map
        if (!mapContainer.querySelector('.map-center-pin')) {
            const pin = document.createElement('div');
            pin.className = 'map-center-pin';
            pin.innerHTML = `
                <i class="fas fa-map-marker-alt map-center-pin-icon"></i>
                <div class="map-center-pin-shadow"></div>
            `;
            mapContainer.appendChild(pin);
        }

        // Show drag-map hint
        if (!mapContainer.querySelector('.map-drag-hint')) {
            const hint = document.createElement('div');
            hint.className = 'map-drag-hint';
            hint.innerHTML = '<i class="fas fa-arrows-alt"></i> Move map to adjust';
            mapContainer.appendChild(hint);
            setTimeout(() => {
                hint.style.opacity = '0';
                hint.style.transition = 'opacity 0.5s';
                setTimeout(() => hint.remove(), 500);
            }, 3000);
        }

        // Live lat/lng update while the map is being dragged (lightweight — no geocode)
        SignupLocationState.map.on('move', () => {
            const c = SignupLocationState.map.getCenter();
            latInput.value = c.lat.toFixed(6);
            lngInput.value = c.lng.toFixed(6);
        });

        // Reverse-geocode once the user stops dragging
        SignupLocationState.map.on('moveend', async () => {
            const c = SignupLocationState.map.getCenter();
            latInput.value = c.lat;
            lngInput.value = c.lng;
            clearBtn.style.display = 'block';

            const location = await OlaMapsService.reverseGeocode(c.lat, c.lng);
            if (location) {
                searchInput.value = location.address;
                destinationNameInput.value = location.name;
            } else {
                searchInput.value = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
                destinationNameInput.value = 'Selected Location';
            }
        });

        // Toggle drag class for the lift animation on the center pin
        SignupLocationState.map.on('dragstart', () => mapContainer.classList.add('map-dragging'));
        SignupLocationState.map.on('dragend', () => mapContainer.classList.remove('map-dragging'));
    }


    // Handle input change (with debounce)
    const handleSearch = debounce(async (query) => {
        if (!SignupLocationState.isInitialized) return;

        if (query.length < 2) {
            suggestionsDropdown.classList.remove('active');
            return;
        }

        showLoading();

        const suggestions = await OlaMapsService.autocomplete(query);
        renderSuggestions(suggestions);
    }, 300);

    // Input event listener
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        // Show/hide clear button
        clearBtn.style.display = query.length > 0 ? 'block' : 'none';

        handleSearch(query);
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        suggestionsDropdown.classList.remove('active');
        mapContainer.classList.remove('active');
        latInput.value = '';
        lngInput.value = '';
        destinationNameInput.value = '';
        searchInput.focus();
    });

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
            suggestionsDropdown.classList.remove('active');
        }
    });

    // Focus event - show dropdown if there's text
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) {
            handleSearch(searchInput.value.trim());
        }
    });

    console.log('ðŸ“ Signup location autocomplete setup complete');
}

// ============ Homepage Location Autocomplete (Ola Maps) ============
// State for home location autocomplete
const HomeLocationState = {
    debounceTimer: null,
    map: null,
    isInitialized: false
};

function setupHomeLocationAutocomplete() {
    const searchInput = document.getElementById('homeLocationSearch');
    const suggestionsDropdown = document.getElementById('homeLocationSuggestions');
    const mapContainer = document.getElementById('homeLocationMap');
    const clearBtn = document.getElementById('clearHomeLocationBtn');
    const latInput = document.getElementById('homeDestLat');
    const lngInput = document.getElementById('homeDestLng');
    const destNameInput = document.getElementById('homeDestName');

    if (!searchInput || !suggestionsDropdown) {
        console.log('ðŸ“ Home location autocomplete elements not found');
        return;
    }

    // Initialize OlaMapsService if not already done
    const OLA_MAPS_API_KEY = 'IiJt0dF87sckv1WEZ9aaBAxDB98MiKBv6nAB8CUu';

    if (window.OlaMapsService) {
        if (!OlaMapsService.isInitialized()) {
            OlaMapsService.init(OLA_MAPS_API_KEY);
        }
        HomeLocationState.isInitialized = true;
        console.log('âœ… Home location autocomplete: OlaMapsService ready');
    } else {
        console.warn('âš ï¸ OlaMapsService not loaded');
        return;
    }

    // Debounced search function
    function debounce(fn, delay) {
        return function (...args) {
            clearTimeout(HomeLocationState.debounceTimer);
            HomeLocationState.debounceTimer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // Show loading state
    function showLoading() {
        suggestionsDropdown.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Searching...</span>
            </div>
        `;
        suggestionsDropdown.classList.add('active');
    }

    // Show no results
    function showNoResults() {
        suggestionsDropdown.innerHTML = `
            <div class="no-results">
                <i class="fas fa-map-marker-alt"></i>
                <span>No locations found</span>
            </div>
        `;
    }

    // Render suggestions
    function renderSuggestions(suggestions) {
        if (suggestions.length === 0) {
            showNoResults();
            return;
        }

        suggestionsDropdown.innerHTML = suggestions.map((place, index) => `
            <div class="suggestion-item" data-index="${index}" 
                 data-place-id="${place.placeId}" 
                 data-description="${place.description}">
                <i class="fas fa-map-marker-alt"></i>
                <div class="suggestion-text">
                    <div class="suggestion-main">${place.mainText}</div>
                    <div class="suggestion-sub">${place.secondaryText}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers
        suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                selectHomeLocation(item.dataset.placeId, item.dataset.description);
            });
        });
    }

    // Select a location
    async function selectHomeLocation(placeId, description) {
        // Update search input
        searchInput.value = description;
        clearBtn.style.display = 'block';

        // Hide suggestions
        suggestionsDropdown.classList.remove('active');

        // Show loading in map area
        mapContainer.style.display = 'block';
        mapContainer.classList.add('active');

        if (!HomeLocationState.map) {
            mapContainer.innerHTML = '<div class="loading" style="height:100%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-spinner fa-spin"></i><span>Loading map...</span></div>';
        }

        // Get place details (lat/lng)
        const placeDetails = await OlaMapsService.getPlaceDetails(placeId, description);

        if (placeDetails) {
            // Store coordinates in hidden inputs
            latInput.value = placeDetails.lat;
            lngInput.value = placeDetails.lng;
            if (destNameInput) destNameInput.value = placeDetails.name || description.split(',')[0];

            // Update search pill hint and travel buddies place name
            updateSearchBarHint();
            const tbPlaceText = document.getElementById('tbPlaceText');
            if (tbPlaceText) {
                tbPlaceText.textContent = `Near ${placeDetails.name || description.split(',')[0]}`;
            }

            // Re-check weather for the new searched destination
            if (typeof checkWeatherAndAnimate === 'function') {
                const searchedName = placeDetails.name || description.split(',')[0];
                checkWeatherAndAnimate(placeDetails.lat, placeDetails.lng, searchedName);
            }

            // Check if map exists
            if (HomeLocationState.map) {
                // Map exists - just fly to new location using the local map instance
                HomeLocationState.map.flyTo({
                    center: [placeDetails.lng, placeDetails.lat],
                    zoom: 14,
                    duration: 1500
                });
            } else {
                // Create new map
                mapContainer.innerHTML = '';

                // Create a Leaflet map for home location
                HomeLocationState.map = L.map('homeLocationMap', {
                    center: [placeDetails.lat, placeDetails.lng],
                    zoom: 14,
                    zoomControl: false
                });

                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(HomeLocationState.map);

                L.control.zoom({ position: 'topright' }).addTo(HomeLocationState.map);

                HomeLocationState.map.whenReady(() => {
                    // Add center pin
                    const pin = document.createElement('div');
                    pin.className = 'map-center-pin';
                    pin.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
                    mapContainer.appendChild(pin);

                    // Add drag hint
                    const hint = document.createElement('div');
                    hint.className = 'map-drag-hint';
                    hint.innerHTML = '<i class="fas fa-hand-pointer"></i>Drag map to adjust';
                    mapContainer.appendChild(hint);
                    setTimeout(() => {
                        hint.style.opacity = '0';
                        hint.style.transition = 'opacity 0.5s';
                        setTimeout(() => hint.remove(), 500);
                    }, 3000);

                    // Setup drag-to-select
                    let isDragging = false;
                    HomeLocationState.map.on('movestart', () => {
                        isDragging = true;
                        pin.classList.add('dragging');
                    });

                    HomeLocationState.map.on('moveend', async () => {
                        if (!isDragging) return;
                        isDragging = false;
                        pin.classList.remove('dragging');
                        pin.classList.add('dropped');
                        setTimeout(() => pin.classList.remove('dropped'), 300);

                        const center = HomeLocationState.map.getCenter();
                        latInput.value = center.lat;
                        lngInput.value = center.lng;

                        // Reverse geocode
                        const location = await OlaMapsService.reverseGeocode(center.lat, center.lng);
                        if (location) {
                            searchInput.value = location.address;
                            if (destNameInput) destNameInput.value = location.name;
                            clearBtn.style.display = 'block';
                        }
                    });
                });
            }

            console.log(`ðŸ“ Home location selected: ${description}`);
        } else {
            mapContainer.innerHTML = '<div class="no-results" style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;"><i class="fas fa-exclamation-triangle"></i><span>Could not get location details</span></div>';
            showToast('Could not get location details. Please try another location.', 'error');
        }
    }

    // Handle input change (with debounce)
    const handleSearch = debounce(async (query) => {
        if (!HomeLocationState.isInitialized) return;

        if (query.length < 2) {
            suggestionsDropdown.classList.remove('active');
            return;
        }

        showLoading();

        const suggestions = await OlaMapsService.autocomplete(query);
        renderSuggestions(suggestions);
    }, 300);

    // Input event listener
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearBtn.style.display = query.length > 0 ? 'block' : 'none';
        handleSearch(query);
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        suggestionsDropdown.classList.remove('active');
        mapContainer.style.display = 'none';
        latInput.value = '';
        lngInput.value = '';
        if (destNameInput) destNameInput.value = '';
        searchInput.focus();
    });

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
            suggestionsDropdown.classList.remove('active');
        }
    });

    // Focus event
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) {
            handleSearch(searchInput.value.trim());
        }
    });

    console.log('ðŸ“ Home location autocomplete setup complete');
}

function init() {
    // Initialize Firebase first
    if (window.FirebaseService) {
        try {
            const firebaseReady = FirebaseService.init();
            AppState.useFirebase = firebaseReady;
            console.log(firebaseReady ? 'ðŸ”¥ Firebase mode enabled' : 'ðŸ’¾ LocalStorage mode (Firebase init failed)');
        } catch (error) {
            console.error('Firebase init error:', error);
            AppState.useFirebase = false;
        }
    } else {
        console.log('ðŸ’¾ LocalStorage mode (Firebase not loaded)');
        AppState.useFirebase = false;
    }

    // Setup event listeners
    DOM.nextBtn.addEventListener('click', nextStep);
    DOM.prevBtn.addEventListener('click', prevStep);
    DOM.signupForm.addEventListener('submit', handleSignup);
    DOM.loginForm.addEventListener('submit', handleLogin);

    // Setup components
    setupAuthSwitching();
    setupFileUpload();
    setupNavigation();
    setupEditModal();
    setupFindCompanion();
    setupLogout();

    // Setup Ola Maps location autocomplete for signup Step 4
    setupSignupLocationAutocomplete();

    // Setup Ola Maps location autocomplete for homepage
    setupHomeLocationAutocomplete();

    // Setup college dropdowns
    setupCollegeDropdown(
        DOM.startingCollegeSearch,
        DOM.collegeDropdownList,
        DOM.selectedCollege,
        DOM.removeCollege,
        false
    );

    setupCollegeDropdown(
        DOM.homeCollegeSearch,
        DOM.homeCollegeDropdownList,
        DOM.homeSelectedCollege,
        DOM.homeRemoveCollege,
        true
    );

    // Initial progress
    showStep(1);

    // Check for existing session
    checkSession();

    // Prefetch colleges
    fetchColleges();
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// ==========================================
// MESSAGING FEATURE — ENHANCED
// ==========================================

// Pusher Configuration
const PUSHER_CONFIG = {
    app_id: "2112198",
    key: "37459e933b84061d1895",
    cluster: "ap2"
};

// Messaging State
const MessagingState = {
    currentFilter: 'all',
    currentChatUser: null,
    pusher: null,
    channel: null,
    messages: {},
    unreadCounts: {},
    replyingTo: null,
    contextMsgId: null,
    contextMsgFrom: null,
    presenceListeners: {},
    unsubscribeMessages: null,
    unsubscribeTyping: null,
    unsubscribePresence: null,
    typingTimeout: null,
    profileModalUser: null,
    currentGroup: null,
    // Pagination state for user list
    allFilteredUsers: [],
    usersPage: 0,
    usersPageSize: 30,
    usersScrollObserver: null,
    searchDebounceTimer: null
};

// Initialize Pusher
function initPusher() {
    if (typeof Pusher === 'undefined') {
        console.error('Pusher not loaded');
        return;
    }

    MessagingState.pusher = new Pusher(PUSHER_CONFIG.key, {
        cluster: PUSHER_CONFIG.cluster,
        forceTLS: true
    });

    if (AppState.userData) {
        const channelName = `chat-${AppState.userData.email.replace(/[^a-z0-9]/gi, '-')}`;
        MessagingState.channel = MessagingState.pusher.subscribe(channelName);

        MessagingState.channel.bind('new-message', function (data) {
            handleIncomingMessage(data);
        });
    }
}

// Handle incoming messages
function handleIncomingMessage(data) {
    const chatKey = getChatKey(data.from);

    if (!MessagingState.messages[chatKey]) {
        MessagingState.messages[chatKey] = [];
    }

    MessagingState.messages[chatKey].push({
        from: data.from,
        text: data.text,
        timestamp: data.timestamp,
        type: 'received',
        status: 'delivered'
    });

    // Save to localStorage
    saveMessagesToStorage();

    // Track unread if chat is NOT open with this user
    if (MessagingState.currentChatUser?.email !== data.from) {
        MessagingState.unreadCounts[chatKey] = (MessagingState.unreadCounts[chatKey] || 0) + 1;
        saveUnreadCounts();
        updateNavBadge();

        // Refresh the chat list UI so it jumps to top and badge updates
        if (MessagingState.currentFilter !== 'groups') {
            refreshUserListUI();
        }
    }

    // Update UI if chat is open
    if (MessagingState.currentChatUser?.email === data.from) {
        renderChatMessages();
    }

    showToast(`New message from ${data.senderName}`, 'info');
}

// Get chat key for storing messages
// Must match FirebaseService.getChatKey format (uses '_' separator + sanitizes special chars)
function getChatKey(otherEmail) {
    const myEmail = AppState.userData?.email || '';
    if (AppState.useFirebase && window.FirebaseService) {
        return FirebaseService.getChatKey(myEmail, otherEmail);
    }
    return [myEmail, otherEmail].sort().join('_').replace(/[.#$\[\]]/g, '_');
}

// ============ Unread Counts ============
function saveUnreadCounts() {
    saveToLocalStorage('travelBuddyUnread', MessagingState.unreadCounts);
}

function loadUnreadCounts() {
    MessagingState.unreadCounts = getFromLocalStorage('travelBuddyUnread') || {};
}

function clearUnreadForChat(chatKey) {
    if (MessagingState.unreadCounts[chatKey]) {
        delete MessagingState.unreadCounts[chatKey];
        saveUnreadCounts();
        updateNavBadge();
    }
}

function updateNavBadge() {
    const badge = document.getElementById('navUnreadBadge');
    if (!badge) return;
    const total = Object.values(MessagingState.unreadCounts).reduce((sum, c) => sum + c, 0);
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

// ============ Messages Storage ============
function saveMessagesToStorage() {
    saveToLocalStorage('travelBuddyMessages', MessagingState.messages);
}

function loadMessagesFromStorage() {
    MessagingState.messages = getFromLocalStorage('travelBuddyMessages') || {};
}

// ============ Setup Messaging ============
function setupMessaging() {
    const userSearchInput = document.getElementById('userSearchInput');
    const bubbleTabs = document.querySelectorAll('.bubble-tab');
    const messagesListView = document.getElementById('messagesListView');
    const chatView = document.getElementById('chatView');
    const backToMessages = document.getElementById('backToMessages');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const showUserProfile = document.getElementById('showUserProfile');
    const profileModal = document.getElementById('profileModal');
    const closeProfileModal = document.getElementById('closeProfileModal');
    const startChatFromProfile = document.getElementById('startChatFromProfile');
    const chatUserInfo = document.getElementById('chatUserInfo');

    // Initialize Pusher
    initPusher();

    // Load saved messages + unread
    loadMessagesFromStorage();
    loadUnreadCounts();
    updateNavBadge();

    // Set user online
    if (AppState.useFirebase && window.FirebaseService && AppState.userData) {
        FirebaseService.setUserOnline(AppState.userData.email);
    }

    // Bubble tabs
    bubbleTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            bubbleTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            MessagingState.currentFilter = tab.dataset.filter;
            if (tab.dataset.filter === 'groups') loadGroupsList();
            else loadUsersList();
        });
    });

    // Search users/groups (debounced — avoids re-rendering on every keystroke)
    userSearchInput.addEventListener('input', (e) => {
        clearTimeout(MessagingState.searchDebounceTimer);
        MessagingState.searchDebounceTimer = setTimeout(() => {
            if (MessagingState.currentFilter === 'groups') {
                loadGroupsList(e.target.value);
            } else {
                loadUsersList(e.target.value);
            }
        }, 300);
    });

    // Back to messages list
    backToMessages.addEventListener('click', () => {
        chatView.style.display = 'none';
        messagesListView.style.display = 'flex';
        cleanupChatSubscriptions();
        MessagingState.currentChatUser = null;
        MessagingState.currentGroup = null;
        if (MessagingState.currentFilter === 'groups') loadGroupsList();
        else loadUsersList(); // Refresh list to show updated previews
    });

    // Send message
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Typing indicator — fire on input
    messageInput.addEventListener('input', () => {
        if (!AppState.useFirebase || !window.FirebaseService || !MessagingState.currentChatUser) return;
        const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
        FirebaseService.setTyping(chatKey, AppState.userData.email, true);

        clearTimeout(MessagingState.typingTimeout);
        MessagingState.typingTimeout = setTimeout(() => {
            FirebaseService.setTyping(chatKey, AppState.userData.email, false);
        }, 2000);
    });

    // Show user profile from chat header
    showUserProfile.addEventListener('click', () => {
        if (MessagingState.currentChatUser) {
            openProfileModal(MessagingState.currentChatUser);
        }
    });

    // Chat user info click
    chatUserInfo.addEventListener('click', () => {
        if (MessagingState.currentChatUser) {
            openProfileModal(MessagingState.currentChatUser);
        }
    });

    // Close profile modal
    closeProfileModal.addEventListener('click', closeProfileModalFn);
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) closeProfileModalFn();
    });

    // Start chat from profile modal
    startChatFromProfile.addEventListener('click', () => {
        if (MessagingState.profileModalUser) {
            closeProfileModalFn();
            openChat(MessagingState.profileModalUser);
        }
    });

    // Reply preview close
    document.getElementById('replyPreviewClose')?.addEventListener('click', cancelReply);

    // Context menu setup
    setupContextMenu();

    // Group chat setup
    setupGroupChat();

    // Initial load
    loadUsersList();
}

// ============ Cleanup Chat Subscriptions ============
function cleanupChatSubscriptions() {
    if (MessagingState.unsubscribeMessages) {
        MessagingState.unsubscribeMessages();
        MessagingState.unsubscribeMessages = null;
    }
    if (MessagingState.unsubscribeTyping) {
        MessagingState.unsubscribeTyping();
        MessagingState.unsubscribeTyping = null;
    }
    if (MessagingState.unsubscribePresence) {
        MessagingState.unsubscribePresence();
        MessagingState.unsubscribePresence = null;
    }
    // Stop typing
    if (AppState.useFirebase && window.FirebaseService && MessagingState.currentChatUser && AppState.userData) {
        const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
        FirebaseService.setTyping(chatKey, AppState.userData.email, false);
    }
    clearTimeout(MessagingState.typingTimeout);
    // Hide typing indicator
    const typingEl = document.getElementById('typingIndicator');
    if (typingEl) typingEl.style.display = 'none';
}

// ============ Load Users List (Paginated) ============
async function loadUsersList(searchQuery = '') {
    const usersList = document.getElementById('usersList');
    const currentUser = AppState.userData;

    if (!currentUser) {
        usersList.innerHTML = '<div class="no-users-message"><i class="fas fa-users"></i><p>Please login to see users</p></div>';
        return;
    }

    usersList.innerHTML = '<div class="loading-users"><i class="fas fa-spinner fa-spin"></i><span>Loading users...</span></div>';

    // Fetch users (cache-first — avoids Firebase on every tab switch)
    const scope = MessagingState.currentFilter === 'myCollege' ? 'college' : 'all';
    let users = await cachedFetchUsers(scope);

    // Filter out current user
    let filteredUsers = users.filter(u => u.email !== currentUser.email);

    // Apply search filter
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredUsers = filteredUsers.filter(u =>
            u.fullName?.toLowerCase().includes(query) ||
            u.collegeName?.toLowerCase().includes(query) ||
            u.email?.toLowerCase().includes(query)
        );
    }

    if (filteredUsers.length === 0) {
        usersList.innerHTML = `
            <div class="no-users-message">
                <i class="fas fa-users-slash"></i>
                <p>${MessagingState.currentFilter === 'myCollege' ? 'No users from your college yet' : 'No users found'}</p>
            </div>
        `;
        MessagingState.allFilteredUsers = [];
        return;
    }

    // Store for pagination
    MessagingState.allFilteredUsers = filteredUsers;
    refreshUserListUI();
}

// ============ Refresh User List UI (Sorting & Badges) ============
// Lightweight local re-sorting and re-rendering without fetching
function refreshUserListUI() {
    const usersList = document.getElementById('usersList');
    if (!usersList || MessagingState.currentFilter === 'groups' || MessagingState.allFilteredUsers.length === 0) return;

    // ===== SORT BY RECENT CHATS =====
    MessagingState.allFilteredUsers.sort((a, b) => {
        const chatKeyA = getChatKey(a.email);
        const chatKeyB = getChatKey(b.email);
        const msgsA = MessagingState.messages[chatKeyA] || [];
        const msgsB = MessagingState.messages[chatKeyB] || [];
        const lastA = msgsA.length > 0 ? new Date(msgsA[msgsA.length - 1].timestamp).getTime() : 0;
        const lastB = msgsB.length > 0 ? new Date(msgsB[msgsB.length - 1].timestamp).getTime() : 0;
        return lastB - lastA; // Most recent first
    });

    MessagingState.usersPage = 0;

    // Clear list and render first batch
    usersList.innerHTML = '';
    renderUsersBatch();
    setupUsersScrollObserver();
    setupUserListDelegation();
}

// Render a batch of users (paginated — 30 at a time)
function renderUsersBatch() {
    const usersList = document.getElementById('usersList');
    const currentUser = AppState.userData;
    const { allFilteredUsers, usersPage, usersPageSize } = MessagingState;

    const start = usersPage * usersPageSize;
    const batch = allFilteredUsers.slice(start, start + usersPageSize);
    if (batch.length === 0) return;

    // Pre-compute distance
    const cuLat = parseFloat(currentUser.latitude);
    const cuLng = parseFloat(currentUser.longitude);
    const hasMyCoords = !isNaN(cuLat) && !isNaN(cuLng);

    // Remove existing sentinel before appending
    const oldSentinel = usersList.querySelector('.users-scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = batch.map(user => {
        const uLat = parseFloat(user.latitude);
        const uLng = parseFloat(user.longitude);
        let distHtml = '';
        if (hasMyCoords && !isNaN(uLat) && !isNaN(uLng)) {
            const d = calculateDistance(cuLat, cuLng, uLat, uLng);
            const fmt = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} KM`;
            distHtml = `<span class="user-item-dist">${fmt}</span>`;
        }

        const chatKey = getChatKey(user.email);
        const msgs = MessagingState.messages[chatKey] || [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        let previewHtml = '';
        if (lastMsg && !lastMsg.deleted) {
            const prefix = lastMsg.from === currentUser.email ? 'You: ' : '';
            const previewText = prefix + (lastMsg.text || '').slice(0, 40);
            const unreadCount = MessagingState.unreadCounts[chatKey] || 0;
            previewHtml = `<p class="last-msg-preview ${unreadCount > 0 ? 'unread' : ''}">${escapeHtml(previewText)}</p>`;
        } else if (lastMsg && lastMsg.deleted) {
            previewHtml = `<p class="last-msg-preview"><i>Message deleted</i></p>`;
        }

        const unreadCount = MessagingState.unreadCounts[chatKey] || 0;
        const unreadHtml = unreadCount > 0 ? `<span class="user-item-unread">${unreadCount}</span>` : '';

        return `
        <div class="user-item" data-email="${user.email}">
            <div class="user-item-avatar">
                <img src="${user.profilePic || 'https://via.placeholder.com/50'}" alt="${user.fullName}" data-email="${user.email}" class="user-avatar-img">
                <div class="online-indicator" id="presence-dot-${sanitizeEmailForPresence(user.email)}"></div>
            </div>
            <div class="user-item-info">
                <h4>${user.fullName}</h4>
                ${previewHtml || `<p><i class="fas fa-university"></i> ${user.collegeName || 'N/A'}</p>`}
            </div>
            <div class="user-item-meta">
                <span class="time">${getLastMessageTime(user.email)}</span>
                ${unreadHtml || distHtml}
            </div>
        </div>`;
    }).join('');

    usersList.insertAdjacentHTML('beforeend', html);
    MessagingState.usersPage++;

    // Add scroll sentinel if more users exist
    const totalRendered = MessagingState.usersPage * usersPageSize;
    if (totalRendered < allFilteredUsers.length) {
        usersList.insertAdjacentHTML('beforeend', '<div class="users-scroll-sentinel" style="height:1px;"></div>');
    }

    console.log(`📋 Rendered users batch ${MessagingState.usersPage} (${Math.min(totalRendered, allFilteredUsers.length)}/${allFilteredUsers.length})`);
}

// IntersectionObserver for infinite scroll
function setupUsersScrollObserver() {
    // Disconnect previous observer
    if (MessagingState.usersScrollObserver) {
        MessagingState.usersScrollObserver.disconnect();
    }

    const usersList = document.getElementById('usersList');
    MessagingState.usersScrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                renderUsersBatch();
                // Re-observe new sentinel
                const newSentinel = usersList.querySelector('.users-scroll-sentinel');
                if (newSentinel) {
                    MessagingState.usersScrollObserver.observe(newSentinel);
                }
            }
        });
    }, { root: usersList, rootMargin: '200px' });

    const sentinel = usersList.querySelector('.users-scroll-sentinel');
    if (sentinel) {
        MessagingState.usersScrollObserver.observe(sentinel);
    }
}

// Event delegation for user list (1 listener instead of N)
function setupUserListDelegation() {
    const usersList = document.getElementById('usersList');
    // Remove old delegated listener to avoid duplicates
    usersList.removeEventListener('click', _userListClickHandler);
    usersList.addEventListener('click', _userListClickHandler);
}

function _userListClickHandler(e) {
    // Avatar click → profile modal
    if (e.target.classList.contains('user-avatar-img')) {
        const email = e.target.dataset.email;
        const user = MessagingState.allFilteredUsers.find(u => u.email === email);
        if (user) openProfileModal(user);
        return;
    }
    // Row click → open chat
    const item = e.target.closest('.user-item');
    if (item) {
        const email = item.dataset.email;
        const user = MessagingState.allFilteredUsers.find(u => u.email === email);
        if (user) openChat(user);
    }
}

// Helper to sanitize email for DOM id
function sanitizeEmailForPresence(email) {
    // Must match sanitizeEmailForPath in firebase-config.js
    return email.replace(/[.#$\[\]]/g, '_');
}

// Escape HTML for message text
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Get last message time
function getLastMessageTime(userEmail) {
    const chatKey = getChatKey(userEmail);
    const messages = MessagingState.messages[chatKey];

    if (!messages || messages.length === 0) return '';

    const lastMsg = messages[messages.length - 1];
    const date = new Date(lastMsg.timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ============ Open Chat ============
function openChat(user) {
    const messagesListView = document.getElementById('messagesListView');
    const chatView = document.getElementById('chatView');
    const chatUserImg = document.getElementById('chatUserImg');
    const chatUserName = document.getElementById('chatUserName');
    const chatUserStatus = document.getElementById('chatUserStatus');

    // Cleanup previous subscriptions
    cleanupChatSubscriptions();

    MessagingState.currentChatUser = user;

    // Update chat header
    chatUserImg.src = user.profilePic || 'https://via.placeholder.com/45';
    chatUserName.textContent = user.fullName;
    chatUserStatus.textContent = 'Online';

    // Hide exit group button for 1:1 chats
    const exitBtn = document.getElementById('exitGroupBtn');
    if (exitBtn) exitBtn.style.display = 'none';

    // Hide list, show chat
    messagesListView.style.display = 'none';
    chatView.style.display = 'flex';

    // Clear unread for this chat
    const chatKey = getChatKey(user.email);
    clearUnreadForChat(chatKey);

    // Cancel any pending reply
    cancelReply();

    // Subscribe to Firebase Realtime Database for this chat
    if (AppState.useFirebase && window.FirebaseService) {
        const fbChatKey = FirebaseService.getChatKey(AppState.userData.email, user.email);

        // Listen to messages
        MessagingState.unsubscribeMessages = FirebaseService.listenToMessages(fbChatKey, (messages) => {
            MessagingState.messages[fbChatKey] = messages.map(msg => ({
                ...msg,
                type: msg.from === AppState.userData.email ? 'sent' : 'received'
            }));
            renderChatMessages();

            // Mark received messages as read
            FirebaseService.markMessagesAsRead(fbChatKey, AppState.userData.email);
        });

        // Listen to typing
        MessagingState.unsubscribeTyping = FirebaseService.listenToTyping(fbChatKey, AppState.userData.email, (isTyping) => {
            const typingEl = document.getElementById('typingIndicator');
            if (typingEl) {
                typingEl.style.display = isTyping ? 'flex' : 'none';
                // Auto-scroll when typing indicator shows
                if (isTyping) {
                    const chatMessages = document.getElementById('chatMessages');
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        });

        // Listen to presence
        MessagingState.unsubscribePresence = FirebaseService.listenToPresence(user.email, (presence) => {
            if (presence.online) {
                chatUserStatus.textContent = 'Online';
                chatUserStatus.classList.remove('offline');
            } else if (presence.lastSeen) {
                const lastSeen = new Date(presence.lastSeen);
                const now = new Date();
                let timeStr;
                if (lastSeen.toDateString() === now.toDateString()) {
                    timeStr = lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else {
                    timeStr = lastSeen.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
                        ' ' + lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                chatUserStatus.textContent = `Last seen ${timeStr}`;
                chatUserStatus.classList.add('offline');
            } else {
                chatUserStatus.textContent = 'Offline';
                chatUserStatus.classList.add('offline');
            }
        });
    } else {
        renderChatMessages();
    }

    // Focus input
    document.getElementById('messageInput').focus();
}

// ============ Render Chat Messages ============
function renderChatMessages() {
    const chatMessages = document.getElementById('chatMessages');
    const chatKey = getChatKey(MessagingState.currentChatUser.email);
    const messages = MessagingState.messages[chatKey] || [];

    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="no-users-message" style="padding: 30px;">
                <i class="fas fa-comment-dots"></i>
                <p>Start a conversation with ${MessagingState.currentChatUser.fullName}</p>
                <div class="quick-reply-chips">
                    <button class="quick-chip" data-text="What bus do you take? 🚌">🚌 What bus do you take?</button>
                    <button class="quick-chip" data-text="What time do you leave? ⏰">⏰ What time do you leave?</button>
                    <button class="quick-chip" data-text="Where do you board? 📍">📍 Where do you board?</button>
                    <button class="quick-chip" data-text="Want to travel together? 🤝">🤝 Travel together?</button>
                    <button class="quick-chip" data-text="Which college are you from? 🏫">🏫 Which college?</button>
                </div>
            </div>
        `;
        // Attach chip click handlers
        chatMessages.querySelectorAll('.quick-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.getElementById('messageInput').value = chip.dataset.text;
                sendMessage();
            });
        });
        return;
    }

    let html = '';
    let lastDate = '';

    messages.forEach((msg, idx) => {
        // ===== DATE SEPARATOR =====
        const msgDate = new Date(msg.timestamp);
        const dateKey = msgDate.toDateString();
        if (dateKey !== lastDate) {
            lastDate = dateKey;
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            let dateLabel;
            if (dateKey === now.toDateString()) {
                dateLabel = 'Today';
            } else if (dateKey === yesterday.toDateString()) {
                dateLabel = 'Yesterday';
            } else {
                dateLabel = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            }
            html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
        }

        // ===== DELETED MESSAGE =====
        if (msg.deleted) {
            html += `
                <div class="message ${msg.type} deleted">
                    <div class="message-text"><i class="fas fa-ban" style="margin-right:4px;font-size:0.75rem;"></i>This message was deleted</div>
                    <div class="message-time">${formatMessageTime(msg.timestamp)}</div>
                </div>
            `;
            return;
        }

        // ===== REPLY QUOTE =====
        let replyHtml = '';
        if (msg.replyTo) {
            replyHtml = `
                <div class="reply-quote">
                    <span class="reply-quote-name">${escapeHtml(msg.replyTo.fromName || 'User')}</span>
                    <span class="reply-quote-text">${escapeHtml(msg.replyTo.text || '')}</span>
                </div>
            `;
        }

        // ===== TICK STATUS =====
        let tickHtml = '';
        if (msg.type === 'sent') {
            const status = msg.status || 'sent';
            if (status === 'read') {
                tickHtml = '<span class="msg-tick read"><i class="fas fa-check-double"></i></span>';
            } else if (status === 'delivered') {
                tickHtml = '<span class="msg-tick delivered"><i class="fas fa-check-double"></i></span>';
            } else {
                tickHtml = '<span class="msg-tick"><i class="fas fa-check"></i></span>';
            }
        }

        // ===== REACTIONS =====
        let reactionsHtml = '';
        if (msg.reactions && typeof msg.reactions === 'object') {
            const myEmail = AppState.userData?.email || '';
            const badges = Object.entries(msg.reactions)
                .filter(([, users]) => Array.isArray(users) && users.length > 0)
                .map(([emoji, users]) => {
                    const isMine = users.includes(myEmail);
                    return `<span class="reaction-badge ${isMine ? 'my-reaction' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">
                        ${emoji}<span class="reaction-count">${users.length}</span>
                    </span>`;
                }).join('');
            if (badges) {
                reactionsHtml = `<div class="message-reactions">${badges}</div>`;
            }
        }

        html += `
            <div class="message-swipe-wrapper">
                <div class="swipe-reply-icon"><i class="fas fa-reply"></i></div>
                <div class="message ${msg.type}" data-msg-id="${msg.id || idx}" data-msg-from="${msg.from || ''}">
                    ${replyHtml}
                    <div class="message-text">${escapeHtml(msg.text)}</div>
                    <div class="message-time">${formatMessageTime(msg.timestamp)}${tickHtml}</div>
                    ${reactionsHtml}
                </div>
            </div>
        `;
    });

    chatMessages.innerHTML = html;

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Swipe-right-to-reply (WhatsApp style) + right-click context menu
    chatMessages.querySelectorAll('.message-swipe-wrapper').forEach(wrapper => {
        const msgEl = wrapper.querySelector('.message');
        if (!msgEl || msgEl.classList.contains('deleted')) return;

        let startX = 0, startY = 0, currentX = 0, isSwiping = false;
        const SWIPE_THRESHOLD = 60;

        wrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = 0;
            isSwiping = false;
            msgEl.style.transition = 'none';
        }, { passive: true });

        wrapper.addEventListener('touchmove', (e) => {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            // Only swipe right, ignore vertical scrolls
            if (!isSwiping && Math.abs(dy) > Math.abs(dx)) return;
            if (dx < 0) return; // Don't allow left swipe

            isSwiping = true;
            currentX = Math.min(dx, 100); // Cap at 100px
            msgEl.style.transform = `translateX(${currentX}px)`;

            // Show reply icon with opacity based on progress
            const icon = wrapper.querySelector('.swipe-reply-icon');
            if (icon) {
                const progress = Math.min(currentX / SWIPE_THRESHOLD, 1);
                icon.style.opacity = progress;
                icon.style.transform = `scale(${0.5 + progress * 0.5})`;
            }
        }, { passive: true });

        wrapper.addEventListener('touchend', () => {
            msgEl.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            msgEl.style.transform = 'translateX(0)';

            const icon = wrapper.querySelector('.swipe-reply-icon');
            if (icon) {
                icon.style.opacity = '0';
                icon.style.transform = 'scale(0.5)';
            }

            if (currentX >= SWIPE_THRESHOLD) {
                // Trigger reply
                startReply(msgEl.dataset.msgId);
                // Haptic feedback if available
                if (navigator.vibrate) navigator.vibrate(30);
            }
            isSwiping = false;
            currentX = 0;
        });

        // Right-click context menu (desktop) — still works for reactions/delete
        msgEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openContextMenu(msgEl.dataset.msgId, msgEl.dataset.msgFrom);
        });
    });

    // Add click handlers for reaction badges (toggle)
    chatMessages.querySelectorAll('.reaction-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const msgId = badge.dataset.msgId;
            const emoji = badge.dataset.emoji;
            handleReactionToggle(msgId, emoji);
        });
    });
}

// ============ Format Message Time ============
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============ Send Message ============
async function sendMessage() {
    // Route to group chat if in group mode
    if (MessagingState.currentGroup) {
        return sendGroupChatMessage();
    }

    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();

    if (!text || !MessagingState.currentChatUser) return;

    const message = {
        from: AppState.userData.email,
        fromName: AppState.userData.fullName,
        to: MessagingState.currentChatUser.email,
        text: text,
        timestamp: new Date().toISOString(),
        status: 'sent'
    };

    // Include reply data if replying
    if (MessagingState.replyingTo) {
        message.replyTo = {
            id: MessagingState.replyingTo.id,
            text: MessagingState.replyingTo.text,
            fromName: MessagingState.replyingTo.fromName
        };
    }

    // Clear input & cancel reply
    messageInput.value = '';
    cancelReply();

    // Stop typing indicator
    if (AppState.useFirebase && window.FirebaseService) {
        const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
        FirebaseService.setTyping(chatKey, AppState.userData.email, false);
        clearTimeout(MessagingState.typingTimeout);
    }

    // Send via Firebase if available
    if (AppState.useFirebase && window.FirebaseService) {
        try {
            const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
            const result = await FirebaseService.sendMessage(chatKey, message);

            if (!result.success) {
                console.error('Firebase send failed, falling back to Pusher');
                fallbackSendMessage(message);
            }
        } catch (error) {
            console.error('Firebase send error:', error);
            fallbackSendMessage(message);
        }
    } else {
        fallbackSendMessage(message);
    }
}

// Fallback message sending
function fallbackSendMessage(message) {
    const chatKey = getChatKey(message.to);

    if (!MessagingState.messages[chatKey]) {
        MessagingState.messages[chatKey] = [];
    }

    MessagingState.messages[chatKey].push({
        ...message,
        type: 'sent'
    });
    saveMessagesToStorage();
    renderChatMessages();
    showToast('Message sent!', 'success');
}

// ============ Reply Feature ============
function startReply(msgId) {
    const chatKey = getChatKey(MessagingState.currentChatUser.email);
    const messages = MessagingState.messages[chatKey] || [];
    const msg = messages.find(m => (m.id || '') === msgId) || messages[parseInt(msgId)];

    if (!msg || msg.deleted) return;

    MessagingState.replyingTo = {
        id: msgId,
        text: msg.text,
        fromName: msg.from === AppState.userData?.email ? 'You' : (msg.fromName || MessagingState.currentChatUser.fullName)
    };

    // Show preview bar
    const bar = document.getElementById('replyPreviewBar');
    const nameEl = document.getElementById('replyPreviewName');
    const textEl = document.getElementById('replyPreviewText');
    if (bar && nameEl && textEl) {
        nameEl.textContent = MessagingState.replyingTo.fromName;
        textEl.textContent = MessagingState.replyingTo.text;
        bar.style.display = 'flex';
    }

    document.getElementById('messageInput')?.focus();
}

function cancelReply() {
    MessagingState.replyingTo = null;
    const bar = document.getElementById('replyPreviewBar');
    if (bar) bar.style.display = 'none';
}

// ============ Context Menu ============
function setupContextMenu() {
    const backdrop = document.getElementById('msgContextBackdrop');
    const replyBtn = document.getElementById('msgContextReply');
    const deleteBtn = document.getElementById('msgContextDelete');

    backdrop?.addEventListener('click', closeContextMenu);

    replyBtn?.addEventListener('click', () => {
        if (MessagingState.contextMsgId != null) {
            startReply(MessagingState.contextMsgId);
        }
        closeContextMenu();
    });

    deleteBtn?.addEventListener('click', async () => {
        if (MessagingState.contextMsgId != null && MessagingState.contextMsgFrom === AppState.userData?.email) {
            await handleDelete(MessagingState.contextMsgId);
        }
        closeContextMenu();
    });

    // Reaction picks
    document.querySelectorAll('.reaction-pick').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            if (MessagingState.contextMsgId != null) {
                handleReactionToggle(MessagingState.contextMsgId, emoji);
            }
            closeContextMenu();
        });
    });
}

function openContextMenu(msgId, msgFrom) {
    MessagingState.contextMsgId = msgId;
    MessagingState.contextMsgFrom = msgFrom;

    const menu = document.getElementById('msgContextMenu');
    const deleteBtn = document.getElementById('msgContextDelete');

    // Only show delete for own messages
    if (deleteBtn) {
        deleteBtn.style.display = msgFrom === AppState.userData?.email ? 'flex' : 'none';
    }

    if (menu) menu.style.display = 'block';
}

function closeContextMenu() {
    const menu = document.getElementById('msgContextMenu');
    if (menu) menu.style.display = 'none';
    MessagingState.contextMsgId = null;
    MessagingState.contextMsgFrom = null;
}

// ============ Reactions Handler ============
async function handleReactionToggle(msgId, emoji) {
    if (!AppState.useFirebase || !window.FirebaseService || !MessagingState.currentChatUser) return;
    const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
    await FirebaseService.toggleReaction(chatKey, msgId, emoji, AppState.userData.email);
    // The listener will auto-update the UI
}

// ============ Delete Handler ============
async function handleDelete(msgId) {
    if (!AppState.useFirebase || !window.FirebaseService || !MessagingState.currentChatUser) return;
    const chatKey = FirebaseService.getChatKey(AppState.userData.email, MessagingState.currentChatUser.email);
    const result = await FirebaseService.deleteMessage(chatKey, msgId, AppState.userData.email);
    if (result.success) {
        showToast('Message deleted', 'info');
    } else {
        showToast('Could not delete message', 'error');
    }
}


// ==========================================
// GROUP CHAT FEATURE
// ==========================================

// Load groups list (when "Groups" tab is active)
async function loadGroupsList(searchQuery = '') {
    const usersList = document.getElementById('usersList');
    const currentUser = AppState.userData;

    if (!currentUser || !AppState.useFirebase || !window.FirebaseService) {
        usersList.innerHTML = '<div class="no-users-message"><i class="fas fa-users"></i><p>Login to see groups</p></div>';
        return;
    }

    usersList.innerHTML = '<div class="loading-users"><i class="fas fa-spinner fa-spin"></i><span>Loading groups...</span></div>';

    try {
        // Fetch user's joined groups and available groups in parallel
        const myKey = sanitizeEmailForPresence(currentUser.email);

        const [myGroupsResult, matchingResult] = await Promise.all([
            FirebaseService.getGroupsForUser(currentUser.email).catch(e => {
                console.error('Fetch my groups failed:', e);
                return { success: false, data: [] };
            }),
            FirebaseService.findMatchingGroups(
                currentUser.collegeName || '',
                currentUser.destinationGeohash || ''
            ).catch(e => {
                console.error('Fetch matching groups failed:', e);
                return { success: false, data: [] };
            })
        ]);

        const myGroups = myGroupsResult.success ? myGroupsResult.data : [];
        const myGroupIds = new Set(myGroups.map(g => g.id));

        // Available groups = matching groups the user hasn't joined yet
        const availableGroups = (matchingResult.success ? matchingResult.data : [])
            .filter(g => !myGroupIds.has(g.id));

        // Apply search filter if query is provided
        const query = searchQuery.trim().toLowerCase();
        const filterGroup = (g) => {
            if (!query) return true;
            const name = (g.name || '').toLowerCase();
            const dest = (g.destinationName || '').toLowerCase();
            const college = (g.college || '').toLowerCase();
            return name.includes(query) || dest.includes(query) || college.includes(query);
        };

        const filteredMyGroups = myGroups.filter(filterGroup);
        const filteredAvailable = availableGroups.filter(filterGroup);

        let html = '';

        // Create Group button at top
        html += `
            <div class="group-item" id="createGroupItem" style="border-style:dashed;justify-content:center;">
                <i class="fas fa-plus-circle" style="color:var(--brand-light);font-size:1.1rem;"></i>
                <span style="font-weight:600;color:var(--brand-light);font-size:0.85rem;">Create New Group</span>
            </div>
        `;

        // ── My Groups section ──
        if (filteredMyGroups.length > 0) {
            html += `<div class="group-section-label"><i class="fas fa-check-circle"></i> My Groups</div>`;
            html += filteredMyGroups.map(group => {
                const memberCount = group.members ? Object.keys(group.members).length : 0;
                return `
                    <div class="group-item" data-group-id="${group.id}">
                        <div class="group-avatar">🚌</div>
                        <div class="group-item-info">
                            <h4>${escapeHtml(group.name || 'Travel Group')}</h4>
                            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(group.destinationName || 'N/A')}</p>
                        </div>
                        <span class="group-member-count">${memberCount} <i class="fas fa-user" style="font-size:0.6rem;"></i></span>
                    </div>
                `;
            }).join('');
        } else if (!query) {
            html += `
                <div class="no-users-message" style="padding:16px 12px;">
                    <i class="fas fa-users-slash" style="font-size:1.2rem;"></i>
                    <p style="margin:4px 0 0;">You haven't joined any groups yet.</p>
                </div>
            `;
        }

        // ── Available Groups section ──
        if (filteredAvailable.length > 0) {
            html += `<div class="group-section-label" style="margin-top:12px;"><i class="fas fa-compass"></i> Available Groups</div>`;
            html += filteredAvailable.map(group => {
                const memberCount = group.members ? Object.keys(group.members).length : 0;
                return `
                    <div class="group-item group-available" data-available-group-id="${group.id}">
                        <div class="group-avatar">🚌</div>
                        <div class="group-item-info">
                            <h4>${escapeHtml(group.name || 'Travel Group')}</h4>
                            <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(group.destinationName || 'N/A')}</p>
                        </div>
                        <button class="group-suggestion-btn join-available-btn" data-join-id="${group.id}" style="padding:5px 14px;font-size:0.75rem;">Join</button>
                    </div>
                `;
            }).join('');
        }

        // No results message when searching
        if (query && filteredMyGroups.length === 0 && filteredAvailable.length === 0) {
            html += `
                <div class="no-users-message" style="padding:16px 12px;">
                    <i class="fas fa-search" style="font-size:1.2rem;"></i>
                    <p style="margin:4px 0 0;">No groups matching "${escapeHtml(searchQuery.trim())}"</p>
                </div>
            `;
        }

        usersList.innerHTML = html;

        // Create group handler
        document.getElementById('createGroupItem')?.addEventListener('click', openCreateGroupModal);

        // My group click handlers — open chat
        usersList.querySelectorAll('.group-item[data-group-id]').forEach(item => {
            item.addEventListener('click', () => {
                const group = filteredMyGroups.find(g => g.id === item.dataset.groupId);
                if (group) openGroupChat(group);
            });
        });

        // Available group Join handlers
        usersList.querySelectorAll('.join-available-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const groupId = btn.dataset.joinId;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                const res = await FirebaseService.joinGroup(groupId, currentUser.email);
                if (res.success) {
                    showToast('Joined group!', 'success');
                    loadGroupsList(); // Refresh to move it to My Groups
                } else {
                    showToast('Failed to join group', 'error');
                    btn.disabled = false;
                    btn.textContent = 'Join';
                }
            });
        });

    } catch (e) {
        console.error('Load groups error:', e);
        usersList.innerHTML = '<div class="no-users-message"><p>Error loading groups. Please try again.</p></div>';
    }
}

// Load group suggestions (auto-suggest matching groups)
async function loadGroupSuggestions() {
    const area = document.getElementById('groupSuggestionArea');
    if (!area || !AppState.userData || !AppState.useFirebase || !window.FirebaseService) return;

    const user = AppState.userData;
    if (!user.collegeName && !user.destinationGeohash) {
        area.innerHTML = '';
        return;
    }

    // If user is already a member of ANY group, hide the banner entirely
    try {
        const myGroups = await FirebaseService.getGroupsForUser(user.email);
        if (myGroups.success && myGroups.data.length > 0) {
            area.innerHTML = '';
            return;
        }
    } catch (e) {
        console.error('Group membership check error:', e);
    }

    try {
        const result = await FirebaseService.findMatchingGroups(user.collegeName, user.destinationGeohash);
        if (!result.success || result.data.length === 0) {
            area.innerHTML = '';
            return;
        }

        // Filter out groups user is already in
        const myKey = sanitizeEmailForPresence(user.email);
        const suggestions = result.data.filter(g => !g.members || !g.members[myKey]);

        if (suggestions.length === 0) {
            area.innerHTML = '';
            return;
        }

        // Show first suggestion
        const group = suggestions[0];
        const memberCount = group.members ? Object.keys(group.members).length : 0;

        area.innerHTML = `
            <div class="group-suggestion-banner" id="groupSuggestionBanner">
                <i class="fas fa-users"></i>
                <div class="group-suggestion-info">
                    <h4>${escapeHtml(group.name || 'Travel Group')}</h4>
                    <p>${memberCount} travelers • ${escapeHtml(group.destinationName || 'Same route')}</p>
                </div>
                <button class="group-suggestion-btn" id="joinSuggestedGroup">Join</button>
            </div>
        `;

        document.getElementById('joinSuggestedGroup')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const res = await FirebaseService.joinGroup(group.id, user.email);
            if (res.success) {
                showToast('Joined group!', 'success');
                area.innerHTML = '';
                // If on groups tab, refresh
                if (MessagingState.currentFilter === 'groups') loadGroupsList();
            }
        });
    } catch (e) {
        console.error('Group suggestions error:', e);
    }
}

// Open group chat
function openGroupChat(group) {
    const messagesListView = document.getElementById('messagesListView');
    const chatView = document.getElementById('chatView');
    const chatUserImg = document.getElementById('chatUserImg');
    const chatUserName = document.getElementById('chatUserName');
    const chatUserStatus = document.getElementById('chatUserStatus');

    cleanupChatSubscriptions();

    // Store group info in MessagingState
    MessagingState.currentChatUser = null;
    MessagingState.currentGroup = group;

    // Update header for group
    chatUserImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90' viewBox='0 0 90 90'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%236366f1'/%3E%3Cstop offset='100%25' stop-color='%23a78bfa'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='45' cy='45' r='45' fill='url(%23g)'/%3E%3Ccircle cx='33' cy='32' r='9' fill='white' opacity='0.9'/%3E%3Ccircle cx='57' cy='32' r='9' fill='white' opacity='0.9'/%3E%3Cellipse cx='33' cy='52' rx='13' ry='9' fill='white' opacity='0.9'/%3E%3Cellipse cx='57' cy='52' rx='13' ry='9' fill='white' opacity='0.9'/%3E%3Ccircle cx='45' cy='28' r='10' fill='white'/%3E%3Cellipse cx='45' cy='50' rx='14' ry='10' fill='white'/%3E%3C/svg%3E";
    chatUserName.textContent = group.name || 'Travel Group';
    const memberCount = group.members ? Object.keys(group.members).length : 0;
    chatUserStatus.textContent = `${memberCount} members`;
    chatUserStatus.classList.remove('offline');

    messagesListView.style.display = 'none';
    chatView.style.display = 'flex';

    // Show exit group button
    const exitBtn = document.getElementById('exitGroupBtn');
    if (exitBtn) {
        exitBtn.style.display = '';
        exitBtn.onclick = async () => {
            if (confirm('Leave this group?')) {
                await FirebaseService.leaveGroup(group.id, AppState.userData.email);
                showToast('Left group', 'info');
                cleanupChatSubscriptions();
                MessagingState.currentGroup = null;
                chatView.style.display = 'none';
                messagesListView.style.display = 'flex';
                exitBtn.style.display = 'none';
                loadGroupsList();
            }
        };
    }

    cancelReply();

    // Subscribe to group messages
    if (AppState.useFirebase && window.FirebaseService) {
        MessagingState.unsubscribeMessages = FirebaseService.listenToGroupMessages(group.id, (messages) => {
            MessagingState.messages[`group_${group.id}`] = messages.map(msg => ({
                ...msg,
                type: msg.from === AppState.userData.email ? 'sent' : 'received'
            }));
            renderGroupMessages(group.id);
        });
    }

    document.getElementById('messageInput').focus();
}

// Render group messages (with sender names)
function renderGroupMessages(groupId) {
    const chatMessages = document.getElementById('chatMessages');
    const chatKey = `group_${groupId}`;
    const messages = MessagingState.messages[chatKey] || [];

    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="no-users-message" style="padding: 30px;">
                <i class="fas fa-users"></i>
                <p>Start the group conversation!</p>
                <div class="quick-reply-chips">
                    <button class="quick-chip" data-text="Hey everyone! 👋">👋 Hey everyone!</button>
                    <button class="quick-chip" data-text="What time are we leaving? ⏰">⏰ What time?</button>
                    <button class="quick-chip" data-text="Where should we meet? 📍">📍 Meeting point?</button>
                </div>
            </div>
        `;
        chatMessages.querySelectorAll('.quick-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.getElementById('messageInput').value = chip.dataset.text;
                sendMessage();
            });
        });
        return;
    }

    let html = '';
    let lastDate = '';

    messages.forEach((msg, idx) => {
        const msgDate = new Date(msg.timestamp);
        const dateKey = msgDate.toDateString();
        if (dateKey !== lastDate) {
            lastDate = dateKey;
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            let dateLabel;
            if (dateKey === now.toDateString()) dateLabel = 'Today';
            else if (dateKey === yesterday.toDateString()) dateLabel = 'Yesterday';
            else dateLabel = msgDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
        }

        if (msg.deleted) {
            html += `<div class="message ${msg.type} deleted"><div class="message-text"><i class="fas fa-ban" style="margin-right:4px;font-size:0.75rem;"></i>Message deleted</div><div class="message-time">${formatMessageTime(msg.timestamp)}</div></div>`;
            return;
        }

        // Sender name for received messages in group
        const senderHtml = msg.type === 'received' ? `<span class="group-sender-name">${escapeHtml(msg.fromName || 'User')}</span>` : '';

        html += `
            <div class="message-swipe-wrapper">
                <div class="swipe-reply-icon"><i class="fas fa-reply"></i></div>
                <div class="message ${msg.type}" data-msg-id="${msg.id || idx}" data-msg-from="${msg.from || ''}">
                    ${senderHtml}
                    <div class="message-text">${escapeHtml(msg.text)}</div>
                    <div class="message-time">${formatMessageTime(msg.timestamp)}</div>
                </div>
            </div>
        `;
    });

    chatMessages.innerHTML = html;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Swipe-to-reply for group messages
    chatMessages.querySelectorAll('.message-swipe-wrapper').forEach(wrapper => {
        const msgEl = wrapper.querySelector('.message');
        if (!msgEl || msgEl.classList.contains('deleted')) return;

        let startX = 0, startY = 0, currentX = 0, isSwiping = false;
        const SWIPE_THRESHOLD = 60;

        wrapper.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = 0; isSwiping = false;
            msgEl.style.transition = 'none';
        }, { passive: true });

        wrapper.addEventListener('touchmove', (e) => {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (!isSwiping && Math.abs(dy) > Math.abs(dx)) return;
            if (dx < 0) return;
            isSwiping = true;
            currentX = Math.min(dx, 100);
            msgEl.style.transform = `translateX(${currentX}px)`;
            const icon = wrapper.querySelector('.swipe-reply-icon');
            if (icon) { const p = Math.min(currentX / SWIPE_THRESHOLD, 1); icon.style.opacity = p; icon.style.transform = `scale(${0.5 + p * 0.5})`; }
        }, { passive: true });

        wrapper.addEventListener('touchend', () => {
            msgEl.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            msgEl.style.transform = 'translateX(0)';
            const icon = wrapper.querySelector('.swipe-reply-icon');
            if (icon) { icon.style.opacity = '0'; icon.style.transform = 'scale(0.5)'; }
            if (currentX >= SWIPE_THRESHOLD) { startReply(msgEl.dataset.msgId); if (navigator.vibrate) navigator.vibrate(30); }
            isSwiping = false; currentX = 0;
        });

        msgEl.addEventListener('contextmenu', (e) => { e.preventDefault(); openContextMenu(msgEl.dataset.msgId, msgEl.dataset.msgFrom); });
    });
}


async function sendGroupChatMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    const group = MessagingState.currentGroup;

    if (!text || !group) return;

    const message = {
        from: AppState.userData.email,
        fromName: AppState.userData.fullName,
        text: text,
        timestamp: new Date().toISOString(),
        status: 'sent'
    };

    messageInput.value = '';
    cancelReply();

    if (AppState.useFirebase && window.FirebaseService) {
        await FirebaseService.sendGroupMessage(group.id, message);
    }
}

// Create group modal helpers
function openCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    const input = document.getElementById('groupNameInput');
    if (modal) modal.classList.add('active');
    if (input) {
        const user = AppState.userData;
        input.value = `${user?.collegeName || 'My College'} → ${user?.destinationName || 'Destination'}`;
        input.focus();
        input.select();
    }
}

function closeCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    if (modal) modal.classList.remove('active');
}

async function createGroupFromRoute() {
    const input = document.getElementById('groupNameInput');
    const name = input?.value?.trim();
    if (!name) { showToast('Enter a group name', 'error'); return; }

    const user = AppState.userData;
    if (!user || !AppState.useFirebase || !window.FirebaseService) return;

    const myKey = sanitizeEmailForPresence(user.email);
    const groupData = {
        name,
        college: user.collegeName || '',
        destinationName: user.destinationName || '',
        destinationGeohash: user.destinationGeohash || '',
        createdBy: user.email,
        members: { [myKey]: true }
    };

    const result = await FirebaseService.createGroup(groupData);
    if (result.success) {
        closeCreateGroupModal();
        showToast('Group created!', 'success');
        if (MessagingState.currentFilter === 'groups') loadGroupsList();
    } else {
        showToast('Failed to create group', 'error');
    }
}

// Setup group chat event listeners
function setupGroupChat() {
    // Create group modal
    document.getElementById('closeCreateGroupModal')?.addEventListener('click', closeCreateGroupModal);
    document.getElementById('confirmCreateGroup')?.addEventListener('click', createGroupFromRoute);
    document.getElementById('createGroupModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'createGroupModal') closeCreateGroupModal();
    });

    // Load suggestions
    loadGroupSuggestions();
}

// Open profile modal
function openProfileModal(user) {
    if (!user) {
        console.warn('No user data for profile modal');
        return;
    }

    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;

    MessagingState.profileModalUser = user;

    // Fill profile data
    document.getElementById('profileModalImg').src = user.profilePic || 'https://via.placeholder.com/120';
    document.getElementById('profileModalName').textContent = user.fullName || 'Unknown';
    document.getElementById('profileModalEmail').textContent = user.email || '';
    document.getElementById('profileModalCollege').textContent = user.collegeName || 'N/A';
    document.getElementById('profileModalGender').textContent = capitalizeFirst(user.gender) || 'N/A';
    document.getElementById('profileModalStarting').textContent = user.startingCollege?.name || 'N/A';
    document.getElementById('profileModalDestination').textContent = user.destinationName || 'N/A';
    document.getElementById('profileModalTravelMode').textContent = capitalizeFirst(user.travelMode) || 'N/A';
    document.getElementById('profileModalDays').textContent = user.travelDays?.map(d => capitalizeFirst(d.slice(0, 3))).join(', ') || 'N/A';
    document.getElementById('profileModalExpectations').textContent = user.expectations || 'Not specified';

    // Setup start chat button
    const startChatBtn = document.getElementById('startChatFromProfile');
    if (startChatBtn) {
        startChatBtn.onclick = () => {
            profileModal.classList.remove('active');
            startChatWithUser(user.email);
        };
    }

    // Setup close button
    const closeBtn = document.getElementById('closeProfileModal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            profileModal.classList.remove('active');
            MessagingState.profileModalUser = null;
        };
    }

    // Close on backdrop click
    profileModal.onclick = (e) => {
        if (e.target === profileModal) {
            profileModal.classList.remove('active');
            MessagingState.profileModalUser = null;
        }
    };

    profileModal.classList.add('active');
}

// Close profile modal
function closeProfileModalFn() {
    const profileModal = document.getElementById('profileModal');
    profileModal.classList.remove('active');
    MessagingState.profileModalUser = null;
}

// Update init function to include messaging setup
const originalInit = init;
function initWithMessaging() {
    originalInit();

    // ── Logout confirmation modal ──
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutModal = document.getElementById('logoutModal');
    const cancelLogout = document.getElementById('cancelLogoutBtn');
    const confirmLogout = document.getElementById('confirmLogoutBtn');

    function openLogoutModal() {
        if (logoutModal) logoutModal.classList.add('active');
    }

    function closeLogoutModal() {
        if (logoutModal) logoutModal.classList.remove('active');
    }

    if (logoutBtn) {
        // Detach any old inline listener by replacing with a fresh one
        logoutBtn.replaceWith(logoutBtn.cloneNode(true));
        document.getElementById('logoutBtn').addEventListener('click', openLogoutModal);
    }

    if (cancelLogout) {
        cancelLogout.addEventListener('click', closeLogoutModal);
    }

    if (confirmLogout) {
        confirmLogout.addEventListener('click', () => {
            closeLogoutModal();
            // Actual logout logic
            // Set user offline before logout
            if (AppState.useFirebase && window.FirebaseService && AppState.userData) {
                FirebaseService.setUserOffline(AppState.userData.email);
            }
            AppState.userData = null;
            AppState.firebaseUserId = null;
            localStorage.removeItem('travelBuddyUser');
            if (AppState.useFirebase && window.FirebaseService) {
                FirebaseService.signOut?.();
            }
            showAuthPages();
            showToast('Logged out successfully', 'info');
        });
    }

    if (logoutModal) {
        // Close on backdrop click
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) closeLogoutModal();
        });
    }

    // ── Password show/hide toggles ──
    document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.querySelector('i').classList.toggle('fa-eye', !isHidden);
            btn.querySelector('i').classList.toggle('fa-eye-slash', isHidden);
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    // Setup messaging after main init
    setTimeout(() => {
        if (AppState.userData) {
            setupMessaging();
        }
    }, 100);
}

// Override init
document.removeEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', initWithMessaging);

// Also setup messaging when showing main app
const originalShowMainApp = showMainApp;
showMainApp = function () {
    originalShowMainApp();
    setTimeout(() => {
        setupMessaging();
        updateSavedDestinationHint();
        updateSearchBarHint();
        // Check weather at destination and show rain animation if raining
        checkWeatherAndAnimate();
    }, 100);
};

// ==========================================
// WEATHER-BASED RAIN ANIMATION
// ==========================================

const WeatherService = {
    API_KEY: 'd0b3a167f918bb3e4c1e7ab601a10cd4',
    BASE_URL: 'https://api.openweathermap.org/data/2.5/weather',

    async fetchWeather(lat, lng) {
        try {
            const url = `${this.BASE_URL}?lat=${lat}&lon=${lng}&appid=${this.API_KEY}&units=metric`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error('ðŸŒ§ï¸ Weather fetch failed:', err);
            return null;
        }
    },

    isRaining(data) {
        if (!data || !data.weather || !data.weather[0]) return false;
        const main = data.weather[0].main.toLowerCase();
        return ['rain', 'drizzle', 'thunderstorm'].includes(main);
    },

    isCold(data) {
        if (!data) return false;
        const temp = data.main?.temp;
        if (typeof temp === 'number' && temp <= 10) return true;
        if (data.weather && data.weather[0]) {
            const main = data.weather[0].main.toLowerCase();
            if (main === 'snow') return true;
        }
        return false;
    },

    getDescription(data) {
        if (!data || !data.weather || !data.weather[0]) return '';
        return data.weather[0].description;
    }
};

const RainAnimation = {
    canvas: null,
    ctx: null,
    container: null,
    animationId: null,
    drops: [],
    splashes: [],
    width: 0,
    height: 0,
    running: false,

    // Configuration
    MAX_DROPS: 300,
    BASE_SPEED: 15,
    WIND_SPEED: 2.5,
    SPLASH_COUNT: 3,

    init() {
        this.canvas = document.getElementById('rainCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.container = document.getElementById('rain-container');
    },

    resize() {
        if (!this.canvas || !this.container) return;
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    },

    start() {
        if (this.running) return;
        this.init();
        if (!this.canvas || !this.ctx || !this.container) return;

        this.container.style.display = 'block';
        this.resize();
        this.running = true;

        // Initialize drops
        this.drops = [];
        this.splashes = [];
        for (let i = 0; i < this.MAX_DROPS; i++) {
            this.drops.push(this.createDrop(true));
        }

        // Window resize handler
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);

        this.animate();
    },

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.container) {
            this.container.style.display = 'none';
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this.drops = [];
        this.splashes = [];
    },

    createDrop(initial = false) {
        const z = Math.random() * 0.8 + 0.2;
        return {
            x: Math.random() * this.width,
            y: initial ? Math.random() * this.height : -Math.random() * 100,
            z: z,
            length: z * 30 + 10,
            speed: z * this.BASE_SPEED + 5,
            opacity: z * 0.5 + 0.1
        };
    },

    resetDrop(drop) {
        drop.x = Math.random() * this.width;
        drop.y = -Math.random() * 100;
        drop.z = Math.random() * 0.8 + 0.2;
        drop.length = drop.z * 30 + 10;
        drop.speed = drop.z * this.BASE_SPEED + 5;
        drop.opacity = drop.z * 0.5 + 0.1;
    },

    createSplash(x, y, z) {
        if (z > 0.6) {
            for (let i = 0; i < this.SPLASH_COUNT; i++) {
                this.splashes.push({
                    x, y, z,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -(Math.random() * 2 + 1) * z,
                    radius: Math.random() * 1.5 + 0.5,
                    opacity: z * 0.6,
                    life: 1.0
                });
            }
        }
    },

    triggerLightning() {
        if (Math.random() < 0.002) {
            this.container.classList.add('lightning-flash');
            setTimeout(() => {
                this.container.classList.remove('lightning-flash');
                if (Math.random() > 0.7) {
                    setTimeout(() => {
                        this.container.classList.add('lightning-flash');
                        setTimeout(() => {
                            this.container.classList.remove('lightning-flash');
                        }, 50);
                    }, 80);
                }
            }, 50);
        }
    },

    animate() {
        if (!this.running) return;

        this.ctx.clearRect(0, 0, this.width, this.height);

        // Update and draw drops
        for (const drop of this.drops) {
            drop.y += drop.speed;
            drop.x += this.WIND_SPEED * drop.z;

            if (drop.y > this.height - (Math.random() * 20)) {
                this.createSplash(drop.x, drop.y, drop.z);
                this.resetDrop(drop);
            }
            if (drop.x > this.width) drop.x = -10;

            // Draw drop
            this.ctx.beginPath();
            this.ctx.moveTo(drop.x, drop.y);
            this.ctx.lineTo(drop.x - (this.WIND_SPEED * drop.z), drop.y - drop.length);
            this.ctx.strokeStyle = `rgba(174, 194, 224, ${drop.opacity})`;
            this.ctx.lineWidth = drop.z * 1.5;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();
        }

        // Update and draw splashes
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            const s = this.splashes[i];
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.2;
            s.radius += 0.05;
            s.life -= 0.05;

            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(174, 194, 224, ${s.opacity * s.life})`;
            this.ctx.fill();

            if (s.life <= 0) this.splashes.splice(i, 1);
        }

        this.triggerLightning();
        this.animationId = requestAnimationFrame(() => this.animate());
    }
};

// ==========================================
// SNOW / COLD WEATHER ANIMATION
// ==========================================

const SnowAnimation = {
    canvas: null,
    ctx: null,
    container: null,
    animationId: null,
    flakes: [],
    width: 0,
    height: 0,
    running: false,

    MAX_FLAKES: 250,
    BASE_SPEED: 1.2,
    WIND_SPEED: 0.4,
    SWAY_AMOUNT: 0.8,

    init() {
        this.canvas = document.getElementById('snowCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.container = document.getElementById('winter-container');
    },

    resize() {
        if (!this.canvas || !this.container) return;
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    },

    start() {
        if (this.running) return;
        this.init();
        if (!this.canvas || !this.ctx || !this.container) return;

        this.container.style.display = 'block';
        this.resize();
        this.running = true;

        this.flakes = [];
        for (let i = 0; i < this.MAX_FLAKES; i++) {
            this.flakes.push(this.createFlake(true));
        }

        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);

        this.animate();
    },

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.container) {
            this.container.style.display = 'none';
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this.flakes = [];
    },

    createFlake(initial = false) {
        const z = Math.random() * 0.8 + 0.2;
        return {
            x: Math.random() * this.width,
            y: initial ? Math.random() * this.height : -10,
            z: z,
            radius: z * 1.8 + 0.5,
            speed: (z * this.BASE_SPEED) + Math.random() * 0.5,
            opacity: z * 0.6 + 0.2,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.03
        };
    },

    resetFlake(flake) {
        const z = Math.random() * 0.8 + 0.2;
        flake.x = Math.random() * this.width;
        flake.y = -10;
        flake.z = z;
        flake.radius = z * 1.8 + 0.5;
        flake.speed = (z * this.BASE_SPEED) + Math.random() * 0.5;
        flake.opacity = z * 0.6 + 0.2;
        flake.angle = Math.random() * Math.PI * 2;
        flake.spin = (Math.random() - 0.5) * 0.03;
    },

    animate() {
        if (!this.running) return;

        this.ctx.clearRect(0, 0, this.width, this.height);

        for (const f of this.flakes) {
            f.y += f.speed;
            f.angle += f.spin;
            f.x += this.WIND_SPEED + (Math.sin(f.angle) * this.SWAY_AMOUNT * f.z);

            if (f.y > this.height + 10) this.resetFlake(f);
            if (f.x > this.width + 10) f.x = -10;
            if (f.x < -10) f.x = this.width + 10;

            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
            this.ctx.fill();
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }
};

// Check weather and conditionally start rain, snow, or GIF background
// Accepts optional overrideLat, overrideLng, overrideLocationName to use instead of saved destination
async function checkWeatherAndAnimate(overrideLat, overrideLng, overrideLocationName) {
    const user = AppState.userData;
    if (!user) return;

    // Use override coords if provided, otherwise fall back to saved destination
    const lat = (overrideLat != null) ? parseFloat(overrideLat) : parseFloat(user.latitude);
    const lng = (overrideLng != null) ? parseFloat(overrideLng) : parseFloat(user.longitude);
    const locationLabel = overrideLocationName || user.destinationName || 'destination';

    if (isNaN(lat) || isNaN(lng)) {
        console.log('🌧️ No destination coordinates, skipping weather check');
        return;
    }

    console.log(`🌧️ Checking weather at ${locationLabel} (${lat}, ${lng})...`);

    const weatherData = await WeatherService.fetchWeather(lat, lng);

    if (!weatherData) {
        console.log('🌧️ Could not fetch weather data');
        return;
    }

    const desc = WeatherService.getDescription(weatherData);
    const temp = weatherData.main?.temp;
    console.log(`🌧️ Weather at ${locationLabel}: ${desc}, ${temp}°C`);

    // Stop all weather animations first
    RainAnimation.stop();
    SnowAnimation.stop();
    if (typeof CloudAnimation !== 'undefined') CloudAnimation.stop();

    // Hide GIF by default; show only for normal weather
    const bgGif = document.getElementById('bg-normal-gif');
    if (bgGif) bgGif.style.display = 'none';

    // Get weather overlay element
    const weatherOverlay = document.getElementById('weatherOverlay');
    if (weatherOverlay) weatherOverlay.classList.remove('active');

    // Remove any existing weather badge
    const existingBadge = document.querySelector('.weather-badge');
    if (existingBadge) existingBadge.remove();

    const homeHeader = document.querySelector('.home-header');

    if (WeatherService.isRaining(weatherData)) {
        // ── RAIN ──
        console.log('🌧️ Rain detected! Starting rain animation');
        RainAnimation.start();
        if (weatherOverlay) weatherOverlay.classList.add('active');

        if (homeHeader) {
            const badge = document.createElement('div');
            badge.className = 'weather-badge';
            badge.innerHTML = `<i class="fas fa-cloud-rain"></i> ${desc} at ${locationLabel} · ${Math.round(temp)}°C`;
            homeHeader.appendChild(badge);
        }

    } else if (WeatherService.isCold(weatherData)) {
        // ── COLD / SNOW ──
        console.log('❄️ Cold weather detected! Starting snow animation');
        SnowAnimation.start();
        if (weatherOverlay) weatherOverlay.classList.add('active');

        if (homeHeader) {
            const badge = document.createElement('div');
            badge.className = 'weather-badge';
            badge.style.background = 'hsla(200, 80%, 70%, 0.12)';
            badge.style.borderColor = 'hsla(200, 80%, 70%, 0.25)';
            badge.style.color = 'hsl(200, 80%, 80%)';
            badge.innerHTML = `<i class="fas fa-snowflake"></i> ${desc} at ${locationLabel} · ${Math.round(temp)}°C`;
            homeHeader.appendChild(badge);
        }

    } else {
        // ── NORMAL WEATHER ── show the GIF background
        console.log(`☀️ Normal weather (${desc}). Showing GIF background.`);
        if (bgGif) bgGif.style.display = 'block';
        if (weatherOverlay) weatherOverlay.classList.add('active');

        if (homeHeader && weatherData.weather && weatherData.weather[0]) {
            const iconMap = {
                'clear': 'fa-sun',
                'clouds': 'fa-cloud',
                'mist': 'fa-smog',
                'haze': 'fa-smog',
                'fog': 'fa-smog',
                'smoke': 'fa-smog',
                'snow': 'fa-snowflake',
                'dust': 'fa-wind',
                'sand': 'fa-wind',
                'tornado': 'fa-wind'
            };
            const mainLower = weatherData.weather[0].main.toLowerCase();
            const icon = iconMap[mainLower] || 'fa-cloud-sun';
            const badge = document.createElement('div');
            badge.className = 'weather-badge';
            badge.style.background = 'hsla(40, 80%, 50%, 0.12)';
            badge.style.borderColor = 'hsla(40, 80%, 50%, 0.2)';
            badge.style.color = 'hsl(40, 80%, 70%)';
            badge.innerHTML = `<i class="fas ${icon}"></i> ${desc} at ${locationLabel} · ${Math.round(temp)}°C`;
            homeHeader.appendChild(badge);
        }
    }
}

// ==========================================
// CLOUD / NORMAL WEATHER ANIMATION
// ==========================================

const CloudAnimation = {
    canvas: null,
    ctx: null,
    container: null,
    animationId: null,
    clouds: [],
    sprites: [],
    width: 0,
    height: 0,
    running: false,

    CLOUD_COUNT: 7,
    SPRITE_VARIANTS: 4,

    init() {
        this.canvas = document.getElementById('cloudCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.container = document.getElementById('cloud-container');
    },

    resize() {
        if (!this.canvas || !this.container) return;
        this.width = this.canvas.width = this.container.offsetWidth;
        this.height = this.canvas.height = this.container.offsetHeight;
    },

    // Generate a volumetric cloud sprite on an offscreen canvas
    generateCloudSprite(baseW, baseH) {
        const pad = 60;
        const w = baseW + pad * 2;
        const h = baseH + pad * 2;
        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const octx = offscreen.getContext('2d');
        const cx = w / 2;
        const cy = h / 2;

        // Layer 1: Deep body â€” many large soft radial gradient circles
        const bodyCount = Math.floor(Math.random() * 10) + 18;
        for (let i = 0; i < bodyCount; i++) {
            const px = cx + (Math.random() - 0.5) * baseW * 0.6;
            const py = cy + (Math.random() - 0.5) * baseH * 0.5;
            const r = Math.random() * baseW * 0.22 + baseW * 0.08;
            const grad = octx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(220, 230, 240, 0.35)');
            grad.addColorStop(0.4, 'rgba(200, 215, 230, 0.2)');
            grad.addColorStop(0.7, 'rgba(180, 200, 220, 0.08)');
            grad.addColorStop(1, 'rgba(170, 190, 210, 0)');
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(px, py, r, 0, Math.PI * 2);
            octx.fill();
        }

        // Layer 2: Bright core highlights
        const coreCount = Math.floor(Math.random() * 5) + 6;
        for (let i = 0; i < coreCount; i++) {
            const px = cx + (Math.random() - 0.5) * baseW * 0.35;
            const py = cy + (Math.random() - 0.5) * baseH * 0.25;
            const r = Math.random() * baseW * 0.15 + baseW * 0.05;
            const grad = octx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(245, 248, 255, 0.5)');
            grad.addColorStop(0.5, 'rgba(230, 238, 248, 0.2)');
            grad.addColorStop(1, 'rgba(210, 220, 235, 0)');
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(px, py, r, 0, Math.PI * 2);
            octx.fill();
        }

        // Layer 3: Wispy edge tendrils
        const wispCount = Math.floor(Math.random() * 8) + 5;
        for (let i = 0; i < wispCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = baseW * 0.25 + Math.random() * baseW * 0.2;
            const px = cx + Math.cos(angle) * dist;
            const py = cy + Math.sin(angle) * dist * 0.5;
            const r = Math.random() * baseW * 0.12 + baseW * 0.04;
            const grad = octx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(200, 215, 235, 0.15)');
            grad.addColorStop(1, 'rgba(190, 205, 225, 0)');
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(px, py, r, 0, Math.PI * 2);
            octx.fill();
        }

        // Apply heavy blur via a second canvas
        const blurred = document.createElement('canvas');
        blurred.width = w;
        blurred.height = h;
        const bctx = blurred.getContext('2d');
        bctx.filter = 'blur(8px)';
        bctx.drawImage(offscreen, 0, 0);
        bctx.filter = 'blur(3px)';
        // Add sharp highlights on top
        for (let i = 0; i < 4; i++) {
            const px = cx + (Math.random() - 0.5) * baseW * 0.3;
            const py = cy + (Math.random() - 0.5) * baseH * 0.2;
            const r = Math.random() * baseW * 0.1 + baseW * 0.04;
            const grad = bctx.createRadialGradient(px, py, 0, px, py, r);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
            grad.addColorStop(1, 'rgba(240, 245, 255, 0)');
            bctx.fillStyle = grad;
            bctx.beginPath();
            bctx.arc(px, py, r, 0, Math.PI * 2);
            bctx.fill();
        }
        bctx.filter = 'none';
        return blurred;
    },

    start() {
        if (this.running) return;
        this.init();
        if (!this.canvas || !this.ctx || !this.container) return;

        this.container.style.display = 'block';
        this.resize();
        this.running = true;

        // Pre-render unique cloud sprite variants
        this.sprites = [];
        const sizes = [[280, 140], [350, 160], [220, 120], [300, 150]];
        for (let i = 0; i < this.SPRITE_VARIANTS; i++) {
            const [sw, sh] = sizes[i % sizes.length];
            this.sprites.push(this.generateCloudSprite(sw, sh));
        }

        // Create cloud instances
        this.clouds = [];
        for (let i = 0; i < this.CLOUD_COUNT; i++) {
            this.clouds.push(this.createCloud(true));
        }

        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
        this.animate();
    },

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.container) this.container.style.display = 'none';
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        this.clouds = [];
        this.sprites = [];
    },

    createCloud(initial = false) {
        const sprite = this.sprites[Math.floor(Math.random() * this.sprites.length)];
        const scale = Math.random() * 0.7 + 0.5;
        const drawW = sprite.width * scale;
        const y = Math.random() * this.height * 0.75;
        return {
            x: initial ? Math.random() * (this.width + drawW) - drawW / 2 : -drawW,
            y: y,
            baseY: y,
            scale: scale,
            speed: scale * 0.2 + 0.08,
            opacity: Math.random() * 0.3 + 0.35,
            sprite: sprite,
            bobPhase: Math.random() * Math.PI * 2,
            bobSpeed: Math.random() * 0.003 + 0.001,
            bobAmount: Math.random() * 6 + 2
        };
    },

    animate() {
        if (!this.running) return;

        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = 'screen';

        for (const c of this.clouds) {
            c.x += c.speed;
            c.bobPhase += c.bobSpeed;
            c.y = c.baseY + Math.sin(c.bobPhase) * c.bobAmount;

            const dw = c.sprite.width * c.scale;
            const dh = c.sprite.height * c.scale;

            if (c.x > this.width + 50) {
                Object.assign(c, this.createCloud(false));
            }

            this.ctx.globalAlpha = c.opacity;
            this.ctx.drawImage(c.sprite, c.x - dw / 2, c.y - dh / 2, dw, dh);
        }

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = 1;
        this.animationId = requestAnimationFrame(() => this.animate());
    }
};
