// Custom Fabric.js properties that must be included in toJSON()/toObject() calls
const CUSTOM_FABRIC_PROPS = [
    'objectId', 'rectId', 'isRectDimension', 'dimensionType',
    'isStageElement', 'elementType', 'pixelsPerFoot', 'gridLine',
    'fillEnabled', 'fillColor', 'fillOpacity'
];

// Generate a unique client session ID for multi-user collaboration
if (!sessionStorage.getItem('clientId')) {
    sessionStorage.setItem('clientId', 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
}
const CLIENT_ID = sessionStorage.getItem('clientId');

// Global state
const state = {
    budget: [],
    timeline: [],
    mainStageInputs: [],
    cocktailStageInputs: [],
    staff: [],
    stagePlots: [],
    setLists: [],
    setListSearch: '',
    setListStageFilter: 'all',
    budgetSort: { field: null, direction: 'asc' },
    budgetSearch: '',
    currentPage: 'dashboard',
    currentDay: 'Thursday',  // For timeline filtering
    vendorFilter: 'all',  // For vendor page filtering (all/confirmed/pending/issues)
    vendorSearch: '',
    staffSearch: '',
    currentStage: 'main',  // For stage input filtering
    currentStagePlotType: 'main',  // For stage plot tabs
    currentPlotId: null,  // Currently selected plot
    isDraftPlot: false,  // Whether current plot is a local draft (not yet in Firestore)
    canvas: null,  // Fabric.js canvas instance
    autoSaveTimeout: null,  // For debounced auto-save
    isDrawingStage: false,  // Drawing mode flag
    isEditingStage: false,  // Edit/drag mode flag
    currentTool: null,  // 'draw' or 'move' - which tool is active
    stageRectangles: [],  // Array of stage rectangle objects {id, rect, widthLabel, heightLabel}
    currentDrawingRect: null,  // Rectangle being drawn
    drawingStartPoint: null,  // Starting point for rectangle draw
    stageLocked: false,  // Whether stage is locked
    snapDistance: 10,  // Pixels for snap-to-align
    zoom: 1.0,  // Current zoom level (1.0 = 100%)
    isPanning: false,  // Whether user is panning the canvas
    panStart: null,  // Starting point for panning
    undoStack: [],  // History of canvas states for undo
    redoStack: [],  // History of undone states for redo
    isUndoRedoing: false,  // Flag to prevent history recording during undo/redo
    isInteracting: false,  // Flag to prevent canvas resize during user interaction
    dimensionsVisible: true,  // Whether stage dimension labels are shown
    // Real-time collaboration state
    dirtyObjectIds: new Set(),    // Object IDs that need saving
    deletedObjectIds: new Set(),  // Object IDs that were deleted
    isReceivingRemote: false,     // Flag to suppress re-saving during remote updates
    plotObjectsUnsubscribe: null, // Firestore listener unsubscribe function
    timelineUndoStack: [],  // Undo history for timeline actions
    timelineFilter: 'all',  // Current timeline filter: 'all', 'production', 'run-of-show'
    timelineAnimateRows: true,  // Only animate rows on day/filter switch, not data updates
    timelineEditingRowId: null,  // Row ID currently being inline-edited (blocks re-render)
    timelineRenderPending: false,  // True if a Firestore snapshot arrived during editing
    pendingNewRow: {},  // Accumulates phantom row data before commit
    budgetEditingRowId: null,
    budgetRenderPending: false,
    pendingNewBudgetRow: {},
    stageEditingRowId: null,
    stageRenderPending: false,
    pendingNewStageRow: {},
    // Venue map annotation state
    vmCanvas: null,
    vmLayers: [],         // [{id, name, color, visible, objects: [fabricJSON]}]
    vmActiveLayerId: null,
    vmCurrentTool: 'select',
    vmCurrentColor: '#e53e3e',
    vmStrokeWidth: 4,
    vmFillShape: false,
    vmDrawingObj: null,
    vmDrawStart: null,
    vmAutoSaveTimeout: null,
    vmImageLoaded: false,
    vmZoom: 1.0,
    vmBaseWidth: 0,
    vmBaseHeight: 0,
    // Packing list state
    packingList: [],
    packingSearch: '',
    packingCategoryFilter: 'all',
    packingStatusFilter: 'all',
    // Menu state
    menuItems: [],
    menuSearch: '',
    menuCategoryFilter: 'all',
    menuStatusFilter: 'all',
    menuViewMode: 'category'
};

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: '\u2713',
        error: '\u2717',
        info: '\u2139',
        warning: '\u26A0'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Trigger slide-in
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

// Event date
const eventDate = new Date('2026-04-25T18:00:00-04:00');

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupNavigation();
    setupHamburgerMenu();
    setupModals();
    setupCountdown();
    loadAllData();
    setupFormHandlers();
    setupDayTabs();
    setupVendorFilters();
    setupStageTabs();
    setupExportAndPrint();
    setupStagePlotTabs();
    setupStagePlotControls();
    setupZoomControls();
    setupUndoRedo();
    setupKeyboardShortcuts();
    setupPlotNameInput();
    setupPropertiesPanel();
    setupVenueMap();
    setupSetListPage();
}

// Venue Map - setup is at end of file (setupVenueMap)

// Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            switchPage(page);

            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            updateNavGroupIndicators();

            // Close mobile menu when clicking a link
            closeHamburgerMenu();
            // Close any open nav groups
            document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
        });
    });

    // Mobile accordion toggles for nav groups
    document.querySelectorAll('.nav-group-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const group = toggle.closest('.nav-group');
            // Close other groups
            document.querySelectorAll('.nav-group.open').forEach(g => {
                if (g !== group) g.classList.remove('open');
            });
            group.classList.toggle('open');
        });
    });

    // Set initial group indicators
    updateNavGroupIndicators();
}

function updateNavGroupIndicators() {
    document.querySelectorAll('.nav-group').forEach(g => {
        g.classList.toggle('has-active', g.querySelector('.nav-link.active') !== null);
    });
}

// Hamburger Menu
function setupHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (!hamburger || !navMenu) return;

    // Toggle menu on hamburger click
    hamburger.addEventListener('click', () => {
        const isActive = hamburger.classList.contains('active');

        if (isActive) {
            closeHamburgerMenu();
        } else {
            openHamburgerMenu();
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
            closeHamburgerMenu();
        }
    });
}

function openHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    hamburger.classList.add('active');
    navMenu.classList.add('active');
    document.body.classList.add('menu-open');
}

function closeHamburgerMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (hamburger && navMenu) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.classList.remove('menu-open');
        // Close any open accordion groups
        document.querySelectorAll('.nav-group.open').forEach(g => g.classList.remove('open'));
    }
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = pageName;

        // Clear editing state when switching pages
        state.budgetEditingRowId = null;
        state.budgetRenderPending = false;
        state.pendingNewBudgetRow = {};
        state.stageEditingRowId = null;
        state.stageRenderPending = false;
        state.pendingNewStageRow = {};
        state.timelineEditingRowId = null;
        state.timelineRenderPending = false;
        state.pendingNewRow = {};

        // Refresh data for the page
        if (pageName === 'dashboard') updateDashboard();
        if (pageName === 'vendors') {
            state.vendorFilter = 'all';
            state.vendorSearch = '';
            const vendorSearchInput = document.getElementById('vendor-search-input');
            if (vendorSearchInput) vendorSearchInput.value = '';
            const vendorFilterBtns = document.querySelectorAll('.vendor-filter-btn');
            vendorFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
            renderVendors();
        }
        if (pageName === 'staff') {
            state.staffSearch = '';
            const staffSearchInput = document.getElementById('staff-search-input');
            if (staffSearchInput) staffSearchInput.value = '';
            renderStaff();
        }
        if (pageName === 'budget') renderBudget();
        if (pageName === 'timeline') {
            // Reset to first day tab (Thursday)
            state.timelineAnimateRows = true;
            state.currentDay = 'Thursday';
            const dayTabs = document.querySelectorAll('.day-tab[data-day]');
            dayTabs.forEach(t => t.classList.remove('active'));
            if (dayTabs.length > 0) dayTabs[0].classList.add('active');
            renderTimeline();
        }
        if (pageName === 'input-lists') {
            // Reset to first stage tab (Main Stage)
            state.currentStage = 'main';
            const stageTabs = document.querySelectorAll('.day-tab[data-stage]');
            stageTabs.forEach(t => t.classList.remove('active'));
            if (stageTabs.length > 0) stageTabs[0].classList.add('active');
            renderStageInputs();
        }
        if (pageName === 'staff') renderStaff();
        if (pageName === 'set-lists') {
            state.setListSearch = '';
            state.setListStageFilter = 'all';
            const slSearchInput = document.getElementById('setlist-search-input');
            if (slSearchInput) slSearchInput.value = '';
            const slTabs = document.querySelectorAll('#setlist-stage-tabs .day-tab');
            slTabs.forEach(t => t.classList.toggle('active', t.dataset.setlistStage === 'all'));
            renderSetLists();
        }
        if (pageName === 'menu') {
            state.menuSearch = '';
            state.menuCategoryFilter = 'all';
            state.menuStatusFilter = 'all';
            state.menuViewMode = 'category';
            const menuSearchInput = document.getElementById('menu-search-input');
            if (menuSearchInput) menuSearchInput.value = '';
            const menuStatusSelect = document.getElementById('menu-status-filter');
            if (menuStatusSelect) menuStatusSelect.value = 'all';
            document.querySelectorAll('.menu-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'category'));
            document.querySelectorAll('.menu-cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
            renderMenu();
        }
        if (pageName === 'stage-plots') initializeStagePlots();
        if (pageName === 'venue-map') {
            if (state.vmCanvas) {
                // Re-render canvas after it becomes visible
                setTimeout(() => state.vmCanvas.renderAll(), 50);
            } else {
                // First visit — initialize canvas now that the page is visible
                vmInitCanvas();
            }
        }
    }
}

// Countdown Timer
function setupCountdown() {
    updateCountdown();
    setInterval(updateCountdown, 60000); // Update every minute
}

function updateCountdown() {
    const now = new Date();
    const diff = eventDate - now;

    if (diff > 0) {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        document.getElementById('days').textContent = days;
        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
    } else {
        document.getElementById('days').textContent = '0';
        document.getElementById('hours').textContent = '0';
        document.getElementById('minutes').textContent = '0';
    }
}

// Generic utility functions for data loading
function setupCollectionListener(collectionKey, stateKey, renderCallbacks = []) {
    if (!collections[collectionKey]) {
        console.warn(`Collection '${collectionKey}' not configured — skipping listener`);
        return;
    }
    collections[collectionKey].onSnapshot((snapshot) => {
        state[stateKey] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Call all render callbacks
        renderCallbacks.forEach(callback => callback());
    }, (error) => {
        console.error(`Error loading ${collectionKey}:`, error);
    });
}

// Load all data from Firestore
function loadAllData() {
    setupCollectionListener('budget', 'budget', [renderBudget, renderVendors, updateDashboard]);
    setupCollectionListener('timeline', 'timeline', [renderTimeline, updateDashboard]);
    setupCollectionListener('mainStageInputs', 'mainStageInputs', [renderStageInputs]);
    setupCollectionListener('cocktailStageInputs', 'cocktailStageInputs', [renderStageInputs]);
    setupCollectionListener('staff', 'staff', [renderStaff]);
    setupCollectionListener('stagePlots', 'stagePlots', [updatePlotSelector, renderTimeline]);
    setupCollectionListener('setLists', 'setLists', [renderSetLists, updateDashboard, renderTimeline]);
    setupCollectionListener('packingList', 'packingList', [renderPackingList]);
    setupCollectionListener('menuItems', 'menuItems', [renderMenu, updateDashboard]);
}

// Dashboard
function updateDashboard() {
    updateBudgetStats();
    updateVendorStats();
    updateTimelineStats();
    updateSetListDashboard();
    updateMenuDashboard();
}

function updateMenuDashboard() {
    const el = document.getElementById('dashboard-menu-count');
    if (el) el.textContent = state.menuItems.length;
    const label = document.getElementById('dashboard-menu-label');
    if (label) label.textContent = state.menuItems.length === 1 ? 'Menu Item' : 'Menu Items';
}

function updateSetListDashboard() {
    const el = document.getElementById('dashboard-setlist-count');
    if (el) el.textContent = state.setLists.length;
    const label = document.getElementById('dashboard-setlist-label');
    if (label) label.textContent = state.setLists.length === 1 ? 'Performance' : 'Performances';
}

function updateBudgetStats() {
    const totalBudget = state.budget.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
    const totalSpent = state.budget.reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
    const remaining = totalBudget - totalSpent;
    const percentage = totalBudget > 0 ? (totalSpent / totalBudget * 100).toFixed(1) : 0;

    document.getElementById('total-budget').textContent = formatCurrency(totalBudget);
    document.getElementById('total-spent').textContent = formatCurrency(totalSpent);
    document.getElementById('total-remaining').textContent = formatCurrency(remaining);
    document.getElementById('budget-progress').style.width = `${Math.min(percentage, 100)}%`;
    document.getElementById('budget-percentage').textContent = `${percentage}%`;

    // Update budget page stats
    document.getElementById('budget-total').textContent = formatCurrency(totalBudget);
    document.getElementById('budget-spent').textContent = formatCurrency(totalSpent);
    document.getElementById('budget-remaining').textContent = formatCurrency(remaining);
}

function updateVendorStats() {
    const confirmed = state.budget.filter(b => b.confirmed).length;
    const total = state.budget.length;
    const pending = total - confirmed;
    const issueCount = state.budget.filter(b => getVendorIssues(b).length > 0).length;

    document.getElementById('vendors-confirmed').textContent = confirmed;
    document.getElementById('vendor-confirmed-count').textContent = confirmed;
    document.getElementById('vendor-pending-count').textContent = pending;
    document.getElementById('vendor-issue-count').textContent = issueCount;

    // Update filter button count badges
    const el = (id) => document.getElementById(id);
    const setCount = (id, count) => { const e = el(id); if (e) e.textContent = count > 0 ? count : ''; };
    setCount('vendor-filter-all-count', total);
    setCount('vendor-filter-confirmed-count', confirmed);
    setCount('vendor-filter-pending-count', pending);
    setCount('vendor-filter-issue-count', issueCount);

}

// Vendor Issues
function getVendorIssues(item) {
    const issues = [];
    if (!item.vendor) issues.push('vendor/item');
    if (!item.description) issues.push('description');
    if (!item.budgeted) issues.push('budgeted');
    if (!item.phone) issues.push('phone');
    if (!item.email) issues.push('email');
    return issues;
}

function vendorItemMatchesSearch(item, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        item.vendor || '', item.description || '', item.category || '',
        item.contact || '', item.email || '', item.phone || '', item.notes || ''
    ];
    const text = fields.join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
}

function handleVendorSearch(value) {
    clearTimeout(vendorSearchDebounce);
    vendorSearchDebounce = setTimeout(() => {
        state.vendorSearch = value;
        renderVendors();
    }, 150);
}

function clearVendorSearch() {
    const input = document.getElementById('vendor-search-input');
    if (input) input.value = '';
    state.vendorSearch = '';
    renderVendors();
}

window.handleVendorSearch = handleVendorSearch;
window.clearVendorSearch = clearVendorSearch;

function toggleVendorCategorySection(categoryId) {
    const content = document.getElementById(`vendor-content-${categoryId}`);
    const arrow = document.getElementById(`vendor-arrow-${categoryId}`);
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
}
window.toggleVendorCategorySection = toggleVendorCategorySection;

function renderVendors() {
    const container = document.getElementById('vendor-grid');
    if (!container) return;

    let items = [...state.budget];

    // Apply status filter
    if (state.vendorFilter === 'confirmed') {
        items = items.filter(b => b.confirmed);
    } else if (state.vendorFilter === 'pending') {
        items = items.filter(b => !b.confirmed);
    } else if (state.vendorFilter === 'issues') {
        items = items.filter(b => getVendorIssues(b).length > 0);
    }

    // Apply search
    const searchQuery = state.vendorSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;
    if (isSearching) {
        items = items.filter(item => vendorItemMatchesSearch(item, searchQuery));
    }

    // Update search count
    const countEl = document.getElementById('vendor-search-count');
    if (countEl) {
        const totalFiltered = state.budget.length;
        countEl.textContent = isSearching
            ? `${items.length} of ${totalFiltered} vendors`
            : `${totalFiltered} vendors`;
        countEl.style.display = totalFiltered > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('vendor-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    if (items.length === 0) {
        if (state.vendorFilter === 'issues') {
            container.innerHTML = '<div class="staff-empty-state">All clear — no missing vendor information!</div>';
        } else if (isSearching) {
            container.innerHTML = `<div class="staff-empty-state">No vendors match "${escapeHtml(searchQuery)}"</div>`;
        } else {
            container.innerHTML = '<div class="staff-empty-state">No vendors found</div>';
        }
        return;
    }

    // Group by category
    const categorized = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(item);
    });

    const sortedCategories = Object.entries(categorized).sort((a, b) => a[0].localeCompare(b[0]));

    let cardIdx = 0;
    container.innerHTML = sortedCategories.map(([category, catItems]) => {
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = category.replace(/^6811[a-g] - /, '');
        const budgetTotal = catItems.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);

        const cardsHtml = catItems.map(item => {
            const issues = getVendorIssues(item);
            const hasIssues = issues.length > 0;
            const isConfirmed = item.confirmed;
            const itemCategory = (item.category || '').replace(/^6811[a-g] - /, '');

            let statusClass = isConfirmed ? 'vendor-confirmed' : 'vendor-pending';
            if (hasIssues) statusClass = 'vendor-has-issues';

            const issuePills = hasIssues ? `
                <div class="vendor-issues">
                    <span class="vendor-issues-label">Missing:</span>
                    ${issues.map(i => `<span class="vendor-issue-pill">${escapeHtml(i)}</span>`).join('')}
                </div>
            ` : '';

            const delay = cardIdx * 40;
            cardIdx++;

            return `
                <div class="vendor-card ${statusClass}" style="animation-delay: ${delay}ms">
                    <div class="vendor-card-header">
                        <div class="vendor-card-title">${escapeHtml(item.vendor || 'Unnamed')}</div>
                        <span class="status-badge ${isConfirmed ? 'confirmed' : 'pending'}">${isConfirmed ? 'Confirmed' : 'Pending'}</span>
                    </div>
                    ${item.description ? `<div class="vendor-card-description">${escapeHtml(item.description)}</div>` : ''}
                    <div class="vendor-card-category">${escapeHtml(itemCategory)}</div>
                    <div class="vendor-card-details">
                        ${item.contact ? `<div class="vendor-detail"><span class="vendor-detail-icon">👤</span> ${escapeHtml(item.contact)}</div>` : ''}
                        ${item.phone ? `<div class="vendor-detail"><span class="vendor-detail-icon">📞</span> <a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></div>` : ''}
                        ${item.email ? `<div class="vendor-detail"><span class="vendor-detail-icon">✉</span> <a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></div>` : ''}
                    </div>
                    <div class="vendor-card-budget">
                        <span>Budgeted: <strong>${formatCurrency(item.budgeted)}</strong></span>
                        ${item.actual ? `<span>Actual: <strong>${formatCurrency(item.actual)}</strong></span>` : ''}
                    </div>
                    ${issuePills}
                    <div class="vendor-card-actions">
                        ${hasIssues
                            ? `<button class="btn btn-fix-issues" onclick="editBudgetItem('${item.id}')">Fix Issues</button>`
                            : `<button class="btn btn-edit" onclick="editBudgetItem('${item.id}')">Edit</button>`}
                        <div class="vendor-action-icons">
                            <button class="action-icon" onclick="editBudgetItem('${item.id}')" title="Edit">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="action-icon action-icon-danger" onclick="deleteBudgetItem('${item.id}')" title="Delete">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="vendor-category-section">
                <div class="vendor-category-header" onclick="toggleVendorCategorySection('${categoryId}')">
                    <span class="category-arrow" id="vendor-arrow-${categoryId}">${isSearching ? '▼' : '▶'}</span>
                    <h3>${escapeHtml(displayName)}</h3>
                    <span class="category-count">${catItems.length} vendors</span>
                    <span style="font-size: 0.9rem; color: #8a8778; margin-left: auto;"><strong>Budget:</strong> ${formatCurrency(budgetTotal)}</span>
                </div>
                <div class="vendor-category-content" id="vendor-content-${categoryId}" style="display: ${isSearching ? 'block' : 'none'};">
                    <div class="vendor-grid">
                        ${cardsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupVendorFilters() {
    const filterBtns = document.querySelectorAll('.vendor-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.vendorFilter = btn.dataset.filter;
            renderVendors();
        });
    });

    // Dashboard vendor status card clicks
    ['confirmed', 'pending', 'issues'].forEach(filter => {
        const link = document.getElementById(`dashboard-${filter}-link`);
        if (link) {
            link.addEventListener('click', () => navigateToVendorFilter(filter));
        }
    });
}

function navigateToVendorFilter(filter) {
    state.vendorFilter = filter;
    switchPage('vendors');

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === 'vendors');
    });
    updateNavGroupIndicators();

    // Update filter button active state
    document.querySelectorAll('.vendor-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderVendors();
}
window.navigateToVendorFilter = navigateToVendorFilter;

function updateTimelineStats() {
    const total = state.timeline.length;
    const completed = state.timeline.filter(t => t.status === 'complete').length;
    const inProgress = state.timeline.filter(t => t.status === 'in-progress').length;
    const overdue = state.timeline.filter(t => {
        if (!t.dueDate || t.status === 'complete') return false;
        return new Date(t.dueDate) < new Date();
    }).length;

    const el = (id) => document.getElementById(id);
    if (el('timeline-total')) el('timeline-total').textContent = total;
    if (el('timeline-completed')) el('timeline-completed').textContent = completed;
    if (el('timeline-in-progress')) el('timeline-in-progress').textContent = inProgress;
    if (el('timeline-overdue')) el('timeline-overdue').textContent = overdue;
}

// Toggle confirmed status for budget items
async function toggleBudgetConfirmed(id, confirmed) {
    try {
        await collections.budget.doc(id).update({
            confirmed: confirmed,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(confirmed ? 'Item confirmed' : 'Item unconfirmed');
    } catch (error) {
        console.error('Error toggling confirmed:', error);
        showToast('Error updating confirmed status', 'error');
    }
}

// Budget
function renderBudget() {
    renderBudgetGrouped();
}

// Sort budget items by a column
function sortBudgetBy(field) {
    if (state.budgetSort.field === field) {
        state.budgetSort.direction = state.budgetSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.budgetSort.field = field;
        state.budgetSort.direction = 'asc';
    }
    renderBudgetGrouped();
}
window.sortBudgetBy = sortBudgetBy;

function getSortedBudgetItems(items) {
    const { field, direction } = state.budgetSort;
    if (!field) return items;

    const sorted = [...items].sort((a, b) => {
        let valA, valB;

        if (field === 'confirmed') {
            valA = a.confirmed ? 1 : 0;
            valB = b.confirmed ? 1 : 0;
        } else if (field === 'budgeted' || field === 'actual') {
            valA = parseFloat(a[field]) || 0;
            valB = parseFloat(b[field]) || 0;
        } else if (field === 'difference') {
            valA = (parseFloat(a.budgeted) || 0) - (parseFloat(a.actual) || 0);
            valB = (parseFloat(b.budgeted) || 0) - (parseFloat(b.actual) || 0);
        } else {
            valA = (a[field] || '').toString().toLowerCase();
            valB = (b[field] || '').toString().toLowerCase();
        }

        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
    });

    return direction === 'desc' ? sorted.reverse() : sorted;
}

function budgetSortIndicator(field) {
    if (state.budgetSort.field !== field) return '';
    return state.budgetSort.direction === 'asc' ? ' ▲' : ' ▼';
}

// Fuzzy search: returns true if all characters in pattern appear in str in order
// with a max gap of 3 characters between consecutive matches
function fuzzyMatch(pattern, str) {
    if (!pattern) return true;
    if (!str) return false;
    const p = pattern.toLowerCase();
    const s = str.toLowerCase();
    // Fast path: substring match
    if (s.includes(p)) return true;
    // Subsequence match with max gap of 3 between consecutive matched characters
    const maxGap = 3;
    let pi = 0;
    let lastMatchIndex = -1;
    for (let si = 0; si < s.length && pi < p.length; si++) {
        if (s[si] === p[pi]) {
            if (lastMatchIndex !== -1 && (si - lastMatchIndex - 1) > maxGap) {
                return false;
            }
            lastMatchIndex = si;
            pi++;
        }
    }
    return pi === p.length;
}

// Check if a budget item matches the search query (token-based, all tokens must match)
function budgetItemMatchesSearch(item, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    // Build searchable text fields
    const fields = [
        item.vendor || '',
        item.description || '',
        item.category || '',
        item.contact || '',
        item.notes || '',
        formatPaymentStatus(item.paymentStatus),
        item.email || '',
        item.phone || '',
        String(parseFloat(item.budgeted) || 0),
        String(parseFloat(item.actual) || 0),
        formatCurrency(parseFloat(item.budgeted) || 0),
        formatCurrency(parseFloat(item.actual) || 0)
    ];

    // Every token must fuzzy-match at least one field
    return tokens.every(token =>
        fields.some(field => fuzzyMatch(token, field))
    );
}

// Budget search handler
let budgetSearchDebounce = null;
let vendorSearchDebounce = null;
let staffSearchDebounce = null;
function handleBudgetSearch(value) {
    clearTimeout(budgetSearchDebounce);
    budgetSearchDebounce = setTimeout(() => {
        state.budgetSearch = value;
        renderBudgetGrouped();
    }, 150);
}

function clearBudgetSearch() {
    const input = document.getElementById('budget-search-input');
    if (input) input.value = '';
    state.budgetSearch = '';
    renderBudgetGrouped();
}

// Render Budget Grouped by Category (Collapsible Sections)
function renderBudgetGrouped() {
    const container = document.getElementById('budget-grouped-container');

    // Skip re-render if a row is being inline-edited
    if (state.budgetEditingRowId) {
        state.budgetRenderPending = true;
        return;
    }

    // Remember which sections are open
    const openSections = {};
    container.querySelectorAll('.category-section-content').forEach(el => {
        if (el.style.display !== 'none') {
            openSections[el.id] = true;
        }
    });

    // Update search result count
    const searchQuery = state.budgetSearch;
    const isSearching = searchQuery.trim().length > 0;
    const filteredBudget = isSearching
        ? state.budget.filter(item => budgetItemMatchesSearch(item, searchQuery))
        : state.budget;

    const countEl = document.getElementById('budget-search-count');
    if (countEl) {
        countEl.textContent = isSearching
            ? `${filteredBudget.length} of ${state.budget.length} items`
            : `${state.budget.length} items`;
        countEl.style.display = state.budget.length > 0 ? '' : 'none';
    }

    // Toggle clear button visibility
    const clearBtn = document.getElementById('budget-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    if (state.budget.length === 0) {
        container.innerHTML = '<div class="card"><div class="card-body"><p class="empty-state">No budget items</p></div></div>';
        return;
    }

    if (isSearching && filteredBudget.length === 0) {
        container.innerHTML = `<div class="card"><div class="card-body"><p class="empty-state">No items match "${escapeHtml(searchQuery)}"</p></div></div>`;
        return;
    }

    // Group filtered items by category
    const categorized = {};
    filteredBudget.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) {
            categorized[cat] = [];
        }
        categorized[cat].push(item);
    });

    // Calculate totals for each category (based on filtered items)
    const categoryTotals = {};
    Object.keys(categorized).forEach(cat => {
        const budgeted = categorized[cat].reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
        const actual = categorized[cat].reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
        categoryTotals[cat] = { budgeted, actual, count: categorized[cat].length };
    });

    // Sort categories alphabetically by code (6811a, 6811b, etc.)
    const sortedCategories = Object.entries(categorized).sort((a, b) => {
        return a[0].localeCompare(b[0]);
    });

    // Render each category as a collapsible card (default: collapsed, or open when searching)
    container.innerHTML = sortedCategories.map(([category, items]) => {
        const totals = categoryTotals[category];
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');

        const percentage = totals.budgeted > 0 ? (totals.actual / totals.budgeted * 100) : 0;

        return `
            <div class="card budget-category-section">
                <div class="card-header category-section-header" onclick="toggleCategorySection('${categoryId}')">
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                        <span class="category-arrow" id="arrow-${categoryId}">${isSearching ? '▼' : '▶'}</span>
                        <h3 style="margin: 0;">${escapeHtml(category)}</h3>
                        <span class="category-count">${totals.count} items</span>
                    </div>
                    <div style="display: flex; gap: 1.5rem; font-size: 0.95rem;">
                        <span><strong>Budgeted:</strong> ${formatCurrency(totals.budgeted)}</span>
                        <span><strong>Spent:</strong> ${formatCurrency(totals.actual)}</span>
                        <span><strong>Remaining:</strong> ${formatCurrency(totals.budgeted - totals.actual)}</span>
                    </div>
                    <div class="budget-category-progress" style="margin-top: 8px;">
                        <div class="budget-category-progress-fill" style="width: ${Math.min(percentage, 100)}%"></div>
                    </div>
                </div>
                <div class="category-section-content" id="content-${categoryId}" style="display: ${isSearching ? 'block' : 'none'};">
                    <div class="table-container">
                        <table class="data-table budget-table">
                            <thead>
                                <tr>
                                    <th class="sortable-th" onclick="sortBudgetBy('confirmed')">Confirmed${budgetSortIndicator('confirmed')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('vendor')">Vendor/Item${budgetSortIndicator('vendor')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('description')">Description/Role${budgetSortIndicator('description')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('budgeted')">Budgeted${budgetSortIndicator('budgeted')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('actual')">Actual${budgetSortIndicator('actual')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('difference')">Difference${budgetSortIndicator('difference')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('paymentStatus')">Payment Status${budgetSortIndicator('paymentStatus')}</th>
                                    <th class="sortable-th" onclick="sortBudgetBy('notes')">Notes${budgetSortIndicator('notes')}</th>
                                    <th class="no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${getSortedBudgetItems(items).map(item => {
                                    const budgeted = parseFloat(item.budgeted) || 0;
                                    const actual = parseFloat(item.actual) || 0;
                                    const difference = budgeted - actual;
                                    const diffClass = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';

                                    return `
                                        <tr data-id="${item.id}">
                                            <td class="confirmed-cell">
                                                <input type="checkbox" class="confirmed-checkbox" ${item.confirmed ? 'checked' : ''} onchange="toggleBudgetConfirmed('${item.id}', this.checked)">
                                            </td>
                                            <td data-field="vendor" data-original="${escapeHtml(item.vendor || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.vendor || '')}</td>
                                            <td data-field="description" data-original="${escapeHtml(item.description || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.description || '')}</td>
                                            <td data-field="budgeted" data-original="${budgeted}" onclick="editBudgetCell(this)">${formatCurrency(budgeted)}</td>
                                            <td data-field="actual" data-original="${actual}" onclick="editBudgetCell(this)">${formatCurrency(actual)}</td>
                                            <td data-computed="difference" class="${diffClass}">${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}</td>
                                            <td data-field="paymentStatus" data-original="${item.paymentStatus || 'not-paid'}" onclick="editBudgetCell(this)">
                                                <span class="status-badge ${item.paymentStatus}">${formatPaymentStatus(item.paymentStatus)}</span>
                                            </td>
                                            <td data-field="notes" data-original="${escapeHtml(item.notes || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.notes || '')}</td>
                                            <td class="actions budget-actions-cell no-print">
                                                <div class="actions-row">
                                                    <button class="action-icon" onclick="editBudgetItem('${item.id}')" title="Edit">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                    </button>
                                                    <button class="action-icon" onclick="duplicateBudgetItem('${item.id}')" title="Duplicate">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                    </button>
                                                    <button class="action-icon action-icon-danger" onclick="deleteBudgetItem('${item.id}')" title="Delete">
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                                <tr class="budget-phantom-row" data-phantom="true" data-category="${escapeHtml(category)}">
                                    <td class="confirmed-cell"></td>
                                    <td data-field="vendor" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ vendor</span></td>
                                    <td data-field="description" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ description</span></td>
                                    <td data-field="budgeted" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ budgeted</span></td>
                                    <td data-field="actual" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ actual</span></td>
                                    <td data-computed="difference"></td>
                                    <td data-field="paymentStatus" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ status</span></td>
                                    <td data-field="notes" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ notes</span></td>
                                    <td class="actions budget-actions-cell no-print"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Restore open sections (only when not searching — search auto-expands all)
    if (!isSearching) {
        Object.keys(openSections).forEach(id => {
            const content = document.getElementById(id);
            const arrowId = id.replace('content-', 'arrow-');
            const arrow = document.getElementById(arrowId);
            if (content) content.style.display = 'block';
            if (arrow) arrow.textContent = '▼';
        });
    }

    state.pendingNewBudgetRow = {};
}

// Timeline
function renderTimeline() {
    // Guard: don't rebuild DOM if user is editing a cell
    if (state.timelineEditingRowId) {
        state.timelineRenderPending = true;
        return;
    }

    const tbody = document.getElementById('timeline-tbody');

    // Filter by current day
    let filteredTimeline = state.timeline.filter(item => item.day === state.currentDay);

    // Apply tag/time filter
    if (state.timelineFilter === 'production') {
        filteredTimeline = filteredTimeline.filter(item => item.production === true || item.tag === 'production');
    } else if (state.timelineFilter === 'andi') {
        filteredTimeline = filteredTimeline.filter(item => item.andi === true);
    } else if (state.timelineFilter === 'run-of-show') {
        filteredTimeline = filteredTimeline.filter(item => {
            if (!item.time) return false;
            return item.time >= '18:20' && item.time <= '23:00';
        });
    }

    // Update day title and subtitle
    const dayTitle = document.getElementById('timeline-day-title');
    const dateSubtitle = document.getElementById('timeline-date-subtitle');
    const dateMap = {
        'Thursday': 'April 23, 2026',
        'Friday': 'April 24, 2026',
        'Saturday': 'April 25, 2026',
        'Sunday': 'April 26, 2026'
    };

    const filterLabels = { 'all': '', 'production': ' — Production', 'run-of-show': ' — Run of Show', 'andi': ' — Andi' };
    if (dayTitle) {
        dayTitle.textContent = `${state.currentDay} Timeline${filterLabels[state.timelineFilter] || ''}`;
    }
    if (dateSubtitle) {
        dateSubtitle.textContent = dateMap[state.currentDay] || '';
    }

    if (filteredTimeline.length === 0) {
        const phantomOnly = `
            <tr class="tl-row tl-phantom-row no-anim" data-phantom="true">
                <td class="checkbox-col"></td>
                <td class="time-col" data-field="time" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ time</span></td>
                <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
                <td class="prod-col"></td>
                <td class="andi-col"></td>
                <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
                <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
                <td class="setlist-col"></td>
                <td class="stageplot-col"></td>
                <td class="actions-col no-print"></td>
            </tr>
        `;
        tbody.innerHTML = phantomOnly;
        state.pendingNewRow = {};
        return;
    }

    // Sort by time
    const sorted = [...filteredTimeline].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    const rowsHtml = sorted.map((item, idx) => {
        const isComplete = item.completed === true || item.status === 'complete';

        const rowColor = item.highlightColor || '';
        const hasHighlight = rowColor && rowColor !== '#ffffff';
        const borderColor = hasHighlight ? rowColor : 'transparent';
        const skipAnim = !state.timelineAnimateRows;
        const animDelay = skipAnim ? '' : `animation-delay: ${idx * 30}ms;`;

        return `
            <tr class="tl-row ${isComplete ? 'task-completed' : ''} ${hasHighlight ? 'tl-highlighted' : ''} ${skipAnim ? 'no-anim' : ''}"
                data-id="${item.id}"
                style="--row-accent: ${borderColor}; ${animDelay}">
                <td class="checkbox-col">
                    <input type="checkbox" class="tl-checkbox"
                           ${isComplete ? 'checked' : ''}
                           onchange="toggleTaskComplete('${item.id}', this.checked)">
                </td>
                <td class="time-col" data-field="time" data-original="${escapeHtml(item.time || '')}" onclick="editTimelineCell(this)"><span class="tl-time">${formatTime12Hour(item.time)}</span></td>
                <td class="event-col" data-field="event" data-original="${escapeHtml(item.event || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.event || '')}</td>
                <td class="prod-col"><input type="checkbox" class="tl-checkbox" ${item.production === true || item.tag === 'production' ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'production', this.checked)"></td>
                <td class="andi-col"><input type="checkbox" class="tl-checkbox" ${item.andi === true ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'andi', this.checked)"></td>
                <td class="responsible-col" data-field="responsible" data-original="${escapeHtml(item.responsible || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.responsible || '')}</td>
                <td class="staff-col" data-field="staff" data-original="${escapeHtml(item.staff || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.staff || '')}</td>
                <td class="setlist-col">
                    ${item.performer && state.setLists.some(sl => sl.performer && sl.performer.toLowerCase() === item.performer.toLowerCase()) ? `
                    <button class="action-icon action-icon-link" onclick="goToLinkedSetList('${escapeHtml(item.performer).replace(/'/g, "\\'")}')" title="Go to set list: ${escapeHtml(item.performer)}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                        <span class="link-label">${escapeHtml(item.performer)}</span>
                    </button>` : `
                    <button class="action-icon action-icon-assign" onclick="assignTimelineLink('${item.id}', 'performer')" title="Assign set list">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>`}
                </td>
                <td class="stageplot-col">
                    ${item.stagePlotId && state.stagePlots.some(sp => sp.id === item.stagePlotId) ? `
                    <button class="action-icon action-icon-link" onclick="goToLinkedStagePlot('${item.stagePlotId}')" title="Go to stage plot: ${escapeHtml((state.stagePlots.find(sp => sp.id === item.stagePlotId) || {}).name || '')}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        <span class="link-label">${escapeHtml((state.stagePlots.find(sp => sp.id === item.stagePlotId) || {}).name || '')}</span>
                    </button>` : `
                    <button class="action-icon action-icon-assign" onclick="assignTimelineLink('${item.id}', 'stagePlotId')" title="Assign stage plot">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </button>`}
                </td>
                <td class="actions-col no-print">
                    <div class="actions-row">
                        <div class="color-swatch-wrapper">
                            <button class="color-swatch-btn" style="background-color: ${rowColor || '#ffffff'}; ${rowColor && rowColor !== '#ffffff' ? '' : 'border: 2px dashed #ccc;'}" onclick="toggleColorPicker('${item.id}')" title="Highlight color"></button>
                            <div class="color-swatch-dropdown" id="color-picker-${item.id}">
                                <button class="color-swatch" style="background:#ffffff; border: 1px dashed #ccc;" onclick="setTimelineColor('${item.id}','#ffffff')" title="None"></button>
                                <button class="color-swatch" style="background:#fff3cd;" onclick="setTimelineColor('${item.id}','#fff3cd')" title="Yellow"></button>
                                <button class="color-swatch" style="background:#d4edda;" onclick="setTimelineColor('${item.id}','#d4edda')" title="Green"></button>
                                <button class="color-swatch" style="background:#cce5ff;" onclick="setTimelineColor('${item.id}','#cce5ff')" title="Blue"></button>
                                <button class="color-swatch" style="background:#f8d7da;" onclick="setTimelineColor('${item.id}','#f8d7da')" title="Red"></button>
                                <button class="color-swatch" style="background:#e2d6f3;" onclick="setTimelineColor('${item.id}','#e2d6f3')" title="Purple"></button>
                                <button class="color-swatch" style="background:#fde0c8;" onclick="setTimelineColor('${item.id}','#fde0c8')" title="Orange"></button>
                                <button class="color-swatch" style="background:#d6d6d6;" onclick="setTimelineColor('${item.id}','#d6d6d6')" title="Gray"></button>
                            </div>
                        </div>
                        <button class="action-icon" onclick="editTimelineItem('${item.id}')" title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="action-icon" onclick="duplicateTimelineItem('${item.id}')" title="Duplicate">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="action-icon action-icon-danger" onclick="deleteTimelineItem('${item.id}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Phantom row for inline adding
    const phantomRow = `
        <tr class="tl-row tl-phantom-row no-anim" data-phantom="true">
            <td class="checkbox-col"></td>
            <td class="time-col" data-field="time" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ time</span></td>
            <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
            <td class="prod-col"></td>
            <td class="andi-col"></td>
            <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
            <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
            <td class="setlist-col"></td>
            <td class="stageplot-col"></td>
            <td class="actions-col no-print"></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewRow = {};
    state.timelineAnimateRows = false;
}

// Modal Management
function setupModals() {
    // Close buttons
    document.querySelectorAll('.close-btn, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Click outside modal to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });

    // Add button handlers
    document.getElementById('add-budget-item-btn').addEventListener('click', () => {
        // Scroll to first visible phantom row and focus its first cell
        const phantomRow = document.querySelector('.budget-phantom-row');
        if (phantomRow) {
            // Expand collapsed section if needed
            const sectionContent = phantomRow.closest('.category-section-content');
            if (sectionContent && sectionContent.style.display === 'none') {
                const categoryId = sectionContent.id.replace('content-', '');
                toggleCategorySection(categoryId);
            }
            phantomRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                const firstCell = phantomRow.querySelector(`td[data-field="${BUDGET_FIELD_ORDER[0]}"]`);
                if (firstCell) editBudgetCell(firstCell);
            }, 300);
        } else {
            // No categories exist yet — fall back to modal
            openBudgetModal();
        }
    });
    document.getElementById('add-timeline-item-btn').addEventListener('click', () => openTimelineModal());
    document.getElementById('add-staff-btn').addEventListener('click', () => openStaffModal());
    document.getElementById('add-packing-item-btn').addEventListener('click', () => openPackingModal());
    document.getElementById('add-menu-item-btn').addEventListener('click', () => openMenuModal());
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Generic modal opening function
function openModal(config) {
    const modal = document.getElementById(config.modalId);
    const form = document.getElementById(config.formId);
    const title = modal.querySelector('h2');

    form.reset();

    // Find data object if editing
    let data = null;
    if (config.itemId && config.stateKey) {
        data = state[config.stateKey].find(item => item.id === config.itemId);
    }

    // Set title
    title.textContent = data ? `Edit ${config.title}` : `Add ${config.title}`;

    // Populate form fields
    if (data) {
        Object.entries(config.fieldMap).forEach(([fieldId, dataKey]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = !!data[dataKey];
                } else {
                    element.value = data[dataKey] || '';
                }
            }
        });

        // Set ID field for editing
        const idField = document.getElementById(config.idFieldId);
        if (idField) {
            idField.value = data.id;
        }
    } else {
        // Clear ID field for new items
        const idField = document.getElementById(config.idFieldId);
        if (idField) {
            idField.value = '';
        }

        // Set default values for new items
        if (config.defaultValues) {
            Object.entries(config.defaultValues).forEach(([fieldId, value]) => {
                const element = document.getElementById(fieldId);
                if (element) {
                    element.value = value;
                }
            });
        }
    }

    modal.classList.add('active');
}

function openBudgetModal(itemId = null) {
    openModal({
        modalId: 'budget-modal',
        formId: 'budget-form',
        idFieldId: 'budget-id',
        itemId: itemId,
        stateKey: 'budget',
        title: 'Budget Item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-description': 'description',
            'budget-category': 'category',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        defaultValues: {
            'budget-payment-status': 'not-paid'
        }
    });
}

function openTimelineModal(itemId = null) {
    openModal({
        modalId: 'timeline-modal',
        formId: 'timeline-form',
        idFieldId: 'timeline-id',
        itemId: itemId,
        stateKey: 'timeline',
        title: 'Task',
        fieldMap: {
            'timeline-time': 'time',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-production': 'production',
            'timeline-andi': 'andi',
            'timeline-notes': 'notes',
            'timeline-performer': 'performer',
            'timeline-stage-plot': 'stagePlotId'
        },
        defaultValues: {
            'timeline-day': state.currentDay
        }
    });
    // Show the current day in the read-only display field
    document.getElementById('timeline-day-display').value =
        document.getElementById('timeline-day').value || state.currentDay;
    populateTimelineLinkedDropdowns();
}

function populateTimelineLinkedDropdowns() {
    // Populate performer dropdown from set lists
    const performerSelect = document.getElementById('timeline-performer');
    if (performerSelect) {
        const currentVal = performerSelect.value;
        const performers = [...new Set(state.setLists.map(sl => sl.performer).filter(Boolean))].sort();
        performerSelect.innerHTML = '<option value="">— None —</option>' +
            performers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
        performerSelect.value = currentVal;
    }

    // Populate stage plot dropdown grouped by stage type
    const plotSelect = document.getElementById('timeline-stage-plot');
    if (plotSelect) {
        const currentVal = plotSelect.value;
        const mainPlots = state.stagePlots.filter(p => p.stageType === 'main').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const cocktailPlots = state.stagePlots.filter(p => p.stageType === 'cocktail').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        let html = '<option value="">— None —</option>';
        if (mainPlots.length) {
            html += '<optgroup label="Main Stage">' +
                mainPlots.map(p => `<option value="${p.id}">${escapeHtml(p.name || 'Untitled')}</option>`).join('') +
                '</optgroup>';
        }
        if (cocktailPlots.length) {
            html += '<optgroup label="Cocktail Stage">' +
                cocktailPlots.map(p => `<option value="${p.id}">${escapeHtml(p.name || 'Untitled')}</option>`).join('') +
                '</optgroup>';
        }
        plotSelect.innerHTML = html;
        plotSelect.value = currentVal;
    }
}

// Form Handlers
function setupFormHandlers() {
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('timeline-form').addEventListener('submit', handleTimelineSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
    document.getElementById('setlist-form').addEventListener('submit', handleSetListSubmit);
    document.getElementById('packing-form').addEventListener('submit', handlePackingSubmit);
    document.getElementById('menu-form').addEventListener('submit', handleMenuSubmit);
}

// Generic form submission handler
async function handleFormSubmit(e, config) {
    e.preventDefault();

    const data = {};
    Object.entries(config.fieldMap).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        let value;

        if (element.type === 'checkbox') {
            value = element.checked;
        } else {
            value = element.value;
            // Handle number fields
            if (config.numericFields && config.numericFields.includes(dataKey)) {
                value = parseFloat(value) || 0;
            }
        }

        data[dataKey] = value;
    });

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const id = document.getElementById(config.idFieldId).value;

    try {
        let result = { isNew: false, docId: id };
        if (id) {
            await collections[config.collection].doc(id).update(data);
            showToast(`${config.itemName.charAt(0).toUpperCase() + config.itemName.slice(1)} updated`);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await collections[config.collection].add(data);
            result = { isNew: true, docId: docRef.id };
            showToast(`${config.itemName.charAt(0).toUpperCase() + config.itemName.slice(1)} added`);
        }
        closeAllModals();
        return result;
    } catch (error) {
        console.error(`Error saving ${config.collection}:`, error);
        showToast(`Error saving ${config.itemName}. Please try again.`, 'error');
    }
}

async function handleBudgetSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'budget',
        idFieldId: 'budget-id',
        itemName: 'budget item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-description': 'description',
            'budget-category': 'category',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        numericFields: ['budgeted', 'actual']
    });
}

async function handleTimelineSubmit(e) {
    const editId = document.getElementById('timeline-id').value;
    // Capture previous data for undo on edits
    let previousData = null;
    if (editId) {
        const item = state.timeline.find(i => i.id === editId);
        if (item) {
            const { id: _id, ...rest } = item;
            previousData = rest;
        }
    }

    const result = await handleFormSubmit(e, {
        collection: 'timeline',
        idFieldId: 'timeline-id',
        itemName: 'task',
        fieldMap: {
            'timeline-time': 'time',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-production': 'production',
            'timeline-andi': 'andi',
            'timeline-notes': 'notes',
            'timeline-performer': 'performer',
            'timeline-stage-plot': 'stagePlotId'
        },
        numericFields: []
    });

    if (result) {
        if (result.isNew) {
            pushTimelineUndo({ type: 'add', id: result.docId });
        } else if (previousData) {
            pushTimelineUndo({ type: 'update', id: result.docId, previousData });
        }
    }
}

// CRUD Operations
window.editBudgetItem = (id) => openBudgetModal(id);
window.editTimelineItem = (id) => openTimelineModal(id);

function updateNavActiveState(pageName) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === pageName));
    updateNavGroupIndicators();
}

window.goToLinkedSetList = function(performer) {
    switchPage('set-lists');
    updateNavActiveState('set-lists');
    // Find and highlight the matching card after switchPage renders
    setTimeout(() => {
        const cards = document.querySelectorAll('.setlist-card');
        for (const card of cards) {
            const perfEl = card.querySelector('.setlist-performer');
            if (perfEl && perfEl.textContent.toLowerCase() === performer.toLowerCase()) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('setlist-card-highlight');
                setTimeout(() => card.classList.remove('setlist-card-highlight'), 2000);
                break;
            }
        }
    }, 100);
};

window.goToLinkedStagePlot = function(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;
    // Pre-set state so initializeStagePlots (called by switchPage) picks up the right tab and plot
    state.currentStagePlotType = plot.stageType || 'main';
    state.currentPlotId = plotId;
    switchPage('stage-plots');
    updateNavActiveState('stage-plots');
    // Set the correct stage type tab visually
    const tabs = document.querySelectorAll('.stage-plot-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.stageType === state.currentStagePlotType));
    updatePlotSelector();
    // Load the specific plot
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) plotSelect.value = plotId;
    loadPlot(plotId);
};

window.assignTimelineLink = function(itemId, fieldType) {
    // Open the timeline modal for this item so the user can pick from the dropdowns
    openTimelineModal(itemId);
    // Auto-focus the relevant dropdown
    setTimeout(() => {
        const selectId = fieldType === 'performer' ? 'timeline-performer' : 'timeline-stage-plot';
        const el = document.getElementById(selectId);
        if (el) el.focus();
    }, 100);
};

window.duplicateBudgetItem = async (id) => {
    const item = state.budget.find(i => i.id === id);
    if (!item) return;

    const { id: _id, createdAt, updatedAt, ...data } = item;
    data.vendor = (data.vendor || '') + ' (copy)';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await collections.budget.add(data);
        showToast('Item duplicated');
    } catch (error) {
        console.error('Error duplicating budget item:', error);
        showToast('Error duplicating item', 'error');
    }
};

// Generic delete handler factory
function createDeleteHandler(collectionKey, itemName) {
    return async (id) => {
        if (confirm(`Are you sure you want to delete this ${itemName}?`)) {
            try {
                await collections[collectionKey].doc(id).delete();
                showToast(`${itemName.charAt(0).toUpperCase() + itemName.slice(1)} deleted`);
            } catch (error) {
                console.error(`Error deleting ${itemName}:`, error);
                showToast(`Error deleting ${itemName}. Please try again.`, 'error');
            }
        }
    };
}

window.deleteBudgetItem = createDeleteHandler('budget', 'budget item');
window.toggleBudgetConfirmed = toggleBudgetConfirmed;
window.deleteTimelineItem = async (id) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) {
        const { id: _id, ...data } = item;
        pushTimelineUndo({ type: 'delete', id, previousData: data });
    }
    try {
        await collections.timeline.doc(id).delete();
        showToast('Task deleted');
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('Error deleting task', 'error');
    }
};

window.toggleTaskComplete = async (id, completed) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { completed: item.completed || false, status: item.status || 'not-started' } });

    try {
        await collections.timeline.doc(id).update({
            completed: completed,
            status: completed ? 'complete' : 'in-progress',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(completed ? 'Checked off' : 'Unchecked');
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('Error updating task. Please try again.', 'error');
    }
};

// Timeline undo system
function pushTimelineUndo(action) {
    state.timelineUndoStack.push(action);
    if (state.timelineUndoStack.length > 30) state.timelineUndoStack.shift();
    updateTimelineUndoButton();
}

function updateTimelineUndoButton() {
    const btn = document.getElementById('timeline-undo-btn');
    if (btn) btn.disabled = state.timelineUndoStack.length === 0;
}

window.undoTimelineAction = async () => {
    const action = state.timelineUndoStack.pop();
    updateTimelineUndoButton();
    if (!action) return;

    try {
        if (action.type === 'update') {
            await collections.timeline.doc(action.id).update(action.previousData);
        } else if (action.type === 'add') {
            await collections.timeline.doc(action.id).delete();
        } else if (action.type === 'delete') {
            await collections.timeline.doc(action.id).set(action.previousData);
        }
        showToast('Undone');
    } catch (error) {
        console.error('Error undoing:', error);
        showToast('Error undoing action', 'error');
    }
};

window.toggleTimelineCol = (col, visible) => {
    const table = document.getElementById('timeline-table');
    if (!table) return;
    table.classList.toggle(`hide-${col}`, !visible);
};

window.toggleColumnsDropdown = () => {
    const dropdown = document.getElementById('columns-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
};

// Close columns dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('columns-dropdown');
    const btn = document.getElementById('columns-toggle-btn');
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

window.toggleTimelineField = async (id, field, checked) => {
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { [field]: item[field] || false } });

    try {
        await collections.timeline.doc(id).update({
            [field]: checked,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error(`Error setting ${field}:`, error);
        showToast(`Error updating ${field}`, 'error');
    }
};

window.setTimelineFilter = (filter) => {
    state.timelineFilter = filter;
    state.timelineAnimateRows = true;
    document.querySelectorAll('.timeline-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTimeline();
};

window.toggleColorPicker = (id) => {
    // Close any other open pickers
    document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => {
        if (el.id !== `color-picker-${id}`) el.classList.remove('open');
    });
    const picker = document.getElementById(`color-picker-${id}`);
    if (picker) picker.classList.toggle('open');
};

// Close color pickers when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.color-swatch-wrapper')) {
        document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => el.classList.remove('open'));
    }
});

window.setTimelineColor = async (id, color) => {
    // Close the picker
    document.querySelectorAll('.color-swatch-dropdown.open').forEach(el => el.classList.remove('open'));
    const item = state.timeline.find(i => i.id === id);
    if (item) pushTimelineUndo({ type: 'update', id, previousData: { highlightColor: item.highlightColor || '' } });

    try {
        const highlightColor = (color === '#ffffff') ? '' : color;
        await collections.timeline.doc(id).update({
            highlightColor: highlightColor,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error setting color:', error);
        showToast('Error setting color', 'error');
    }
};

window.duplicateTimelineItem = async (id) => {
    const item = state.timeline.find(i => i.id === id);
    if (!item) return;

    const { id: _id, createdAt, updatedAt, ...data } = item;
    data.event = (data.event || '') + ' (copy)';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        const docRef = await collections.timeline.add(data);
        pushTimelineUndo({ type: 'add', id: docRef.id });
        showToast('Task duplicated');
    } catch (error) {
        console.error('Error duplicating task:', error);
        showToast('Error duplicating task', 'error');
    }
};

// Utility Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount || 0);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTime12Hour(time24) {
    if (!time24) return '';

    // Handle various time formats
    const timeParts = time24.toString().split(':');
    if (timeParts.length < 2) return time24;

    let hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];

    // Determine AM/PM
    const period = hours >= 12 ? 'PM' : 'AM';

    // Convert to 12-hour format
    if (hours === 0) {
        hours = 12; // Midnight
    } else if (hours > 12) {
        hours = hours - 12;
    }

    return `${hours}:${minutes} ${period}`;
}

function formatPaymentStatus(status) {
    const map = {
        'paid': 'Paid',
        'partial': 'Partial',
        'not-paid': 'Not Paid'
    };
    return map[status] || 'Not Paid';
}

function formatStatus(status) {
    const map = {
        'complete': 'Complete',
        'in-progress': 'In Progress',
        'not-started': 'Not Started'
    };
    return map[status] || 'Not Started';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Day Tabs for Timeline
function setupDayTabs() {
    const dayTabs = document.querySelectorAll('.day-tab');

    dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const day = tab.dataset.day;

            // Update active state
            dayTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update state and re-render
            state.currentDay = day;
            state.timelineAnimateRows = true;
            renderTimeline();
        });
    });
}

function setupStageTabs() {
    const stageTabs = document.querySelectorAll('.day-tab[data-stage]');

    stageTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const stage = tab.dataset.stage;

            // Update active state
            stageTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Clear editing state and re-render
            state.stageEditingRowId = null;
            state.stageRenderPending = false;
            state.pendingNewStageRow = {};
            state.currentStage = stage;
            renderStageInputs();
        });
    });

    // Add Input button - scroll to phantom row and focus first cell
    const addInputBtn = document.getElementById('add-stage-input-btn');
    if (addInputBtn) {
        addInputBtn.addEventListener('click', () => {
            const collectionName = state.currentStage === 'main' ? 'mainStageInputs' : 'cocktailStageInputs';
            const phantomRow = document.querySelector('.stage-phantom-row');
            if (phantomRow) {
                phantomRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    const firstCell = phantomRow.querySelector(`td[data-field="${STAGE_FIELD_ORDER[0]}"]`);
                    if (firstCell) editStageCell(firstCell, collectionName);
                }, 300);
            }
        });
    }
}

// Export and Print Functionality
function setupExportAndPrint() {
    // Print Buttons
    const printTimelineBtn = document.getElementById('print-timeline-btn');
    const printStaffBtn = document.getElementById('print-staff-btn');

    if (printTimelineBtn) {
        printTimelineBtn.addEventListener('click', () => window.print());
    }

    const timelineUndoBtn = document.getElementById('timeline-undo-btn');
    if (timelineUndoBtn) {
        timelineUndoBtn.addEventListener('click', () => window.undoTimelineAction());
    }
    if (printStaffBtn) {
        printStaffBtn.addEventListener('click', () => window.print());
    }

    // Export Buttons
    const exportTimelineBtn = document.getElementById('export-timeline-btn');
    const exportBudgetBtn = document.getElementById('export-budget-btn');
    const exportStageBtn = document.getElementById('export-stage-btn');
    const exportStaffBtn = document.getElementById('export-staff-btn');

    if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener('click', exportTimelineToExcel);
    }
    if (exportBudgetBtn) {
        exportBudgetBtn.addEventListener('click', exportBudgetToExcel);
    }
    if (exportStageBtn) {
        exportStageBtn.addEventListener('click', exportStageInputsToExcel);
    }
    if (exportStaffBtn) {
        exportStaffBtn.addEventListener('click', exportStaffToExcel);
    }

    const exportVendorsBtn = document.getElementById('export-vendors-btn');
    if (exportVendorsBtn) {
        exportVendorsBtn.addEventListener('click', exportBudgetToExcel);
    }

    const printSetListBtn = document.getElementById('print-setlist-btn');
    if (printSetListBtn) {
        printSetListBtn.addEventListener('click', () => window.print());
    }
    const exportSetListBtn = document.getElementById('export-setlist-btn');
    if (exportSetListBtn) {
        exportSetListBtn.addEventListener('click', exportSetListToExcel);
    }
}

// Export Timeline to Excel
function exportTimelineToExcel() {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Export ALL three days in separate sheets
    const days = ['Thursday', 'Friday', 'Saturday'];

    days.forEach(day => {
        // Filter by day
        const filteredTimeline = state.timeline.filter(item => item.day === day);

        // Sort by time
        const sorted = [...filteredTimeline].sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        // Prepare data for Excel
        const data = sorted.map(item => ({
            'Time': item.time || '',
            'Event': item.event || '',
            'Responsible': item.responsible || '',
            'Staff': item.staff || '',
            'Completed': item.completed ? 'Yes' : 'No'
        }));

        // Create worksheet for this day
        const ws = XLSX.utils.json_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 10 },  // Time
            { wch: 50 },  // Event
            { wch: 20 },  // Responsible
            { wch: 20 },  // Staff
            { wch: 10 }   // Completed
        ];

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, day);
    });

    // Generate filename with today's date
    const today = new Date().toISOString().split('T')[0];
    const filename = `YMU_Gala_Complete_Timeline_${today}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
}

// Export Budget to Excel
function exportBudgetToExcel() {
    // Prepare data for Excel
    const data = state.budget.map(item => ({
        'Vendor/Item': item.vendor || '',
        'Category': item.category || '',
        'Budgeted': parseFloat(item.budgeted) || 0,
        'Actual': parseFloat(item.actual) || 0,
        'Difference': (parseFloat(item.budgeted) || 0) - (parseFloat(item.actual) || 0),
        'Payment Status': formatPaymentStatus(item.paymentStatus),
        'Notes': item.notes || ''
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 30 },  // Vendor/Item
        { wch: 35 },  // Category
        { wch: 12 },  // Budgeted
        { wch: 12 },  // Actual
        { wch: 12 },  // Difference
        { wch: 15 },  // Payment Status
        { wch: 40 }   // Notes
    ];

    // Add number formatting for currency columns
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        ['C', 'D', 'E'].forEach(col => {
            const cellRef = col + (R + 1);
            if (ws[cellRef]) {
                ws[cellRef].z = '$#,##0.00';
            }
        });
    }

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Budget');

    // Add summary sheet
    const totalBudget = state.budget.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
    const totalSpent = state.budget.reduce((sum, item) => sum + (parseFloat(item.actual) || 0), 0);
    const remaining = totalBudget - totalSpent;

    const summaryData = [
        { 'Metric': 'Total Budgeted', 'Amount': totalBudget },
        { 'Metric': 'Total Spent', 'Amount': totalSpent },
        { 'Metric': 'Remaining', 'Amount': remaining }
    ];

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Download
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `YMU_Gala_Budget_${today}.xlsx`);
}

// Inline Editing for Timeline
// Editable cell field order for Tab navigation (skip tag — it has its own <select>)
const TIMELINE_FIELD_ORDER = ['time', 'event', 'responsible', 'staff'];
const BUDGET_FIELD_ORDER = ['vendor', 'description', 'budgeted', 'actual', 'paymentStatus', 'notes'];
const STAGE_FIELD_ORDER = ['channel', 'subsnake', 'instrument', 'mics', 'stands', 'notes', 'symbol'];

// Single-click cell editing
function editTimelineCell(cell) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard (use 'phantom' for phantom row)
    state.timelineEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    // Keyboard navigation
    input.addEventListener('keydown', (e) => handleCellKeydown(e, cell, row));

    // Blur handler: auto-save if focus leaves the row entirely
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            // If focus moved to another cell input in the same row, do nothing
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            // Otherwise, save this cell
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = input.value.trim();
                    if (val) state.pendingNewRow[field] = val;
                    restoreCellDisplay(cell, isPhantom);
                    // If no other inputs active, commit the new row
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        commitNewRow();
                    }
                } else {
                    saveSingleCell(cell, row);
                }
            }
        }, 50);
    });
}

function handleCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';
    const input = cell.querySelector('.inline-edit-input');

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
            commitNewRow();
        } else {
            saveSingleCell(cell, row, true);
            navigateToNextRowSameColumn(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearTimelineEditingFlag();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        if (e.key === 'ArrowUp') {
            navigateToPrevRowSameColumn(row, field);
        } else {
            navigateToNextRowSameColumn(row, field);
        }
    } else if (e.key === 'ArrowLeft' && input && input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        if (isPhantom) {
            const val = input.value.trim();
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, -1);
    } else if (e.key === 'ArrowRight' && input && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
        e.preventDefault();
        if (isPhantom) {
            const val = input.value.trim();
            if (val) state.pendingNewRow[field] = val;
            restoreCellDisplay(cell, true);
        } else {
            saveSingleCell(cell, row, true);
        }
        navigateToAdjacentCell(row, field, 1);
    }
}

function saveSingleCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return; // Already saved by keydown (blur fired after)

    // Grab values before removing input
    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = input.value.trim();
    const item = state.timeline.find(i => i.id === id);
    const oldValue = item ? (item[field] || '') : '';

    // Convert time if needed
    if (field === 'time' && newValue) {
        newValue = convertTo24Hour(newValue);
    }

    // Restore cell to display mode immediately (remove input so blur handler won't double-fire)
    cell.dataset.original = newValue;
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(newValue)}</span>`;
    } else {
        cell.textContent = newValue;
    }

    // Only clear editing guard if not navigating to another cell
    if (!keepEditing && !row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearTimelineEditingFlag();
    }

    // Guard: item may have been deleted by another user
    if (!item) return;

    // Only save if value changed
    if (newValue === oldValue) return;

    // Optimistic local update so deferred renders show correct value
    item[field] = newValue;

    // Undo batching: merge if same row within 2 seconds
    const now = Date.now();
    const lastUndo = state.timelineUndoStack[state.timelineUndoStack.length - 1];
    if (lastUndo && lastUndo.type === 'update' && lastUndo.id === id && (now - (lastUndo._ts || 0)) < 2000) {
        if (!(field in lastUndo.previousData)) {
            lastUndo.previousData[field] = oldValue;
        }
        lastUndo._ts = now;
    } else {
        const undoEntry = { type: 'update', id, previousData: { [field]: oldValue }, _ts: now };
        pushTimelineUndo(undoEntry);
    }

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.timeline.doc(id).update(updates)
        .catch(err => {
            console.error('Error saving cell:', err);
            // Revert optimistic update
            if (item) item[field] = oldValue;
            cell.dataset.original = oldValue;
            showToast('Error saving', 'error');
        });
}

function restoreCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewRow[field] || '';
        if (val) {
            if (field === 'time') {
                cell.innerHTML = `<span class="tl-time">${formatTime12Hour(val)}</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            cell.innerHTML = `<span class="phantom-placeholder">+ ${field}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'time') {
            cell.innerHTML = `<span class="tl-time">${formatTime12Hour(original)}</span>`;
        } else {
            cell.textContent = original;
        }
    }
}

function clearTimelineEditingFlag() {
    state.timelineEditingRowId = null;
    if (state.timelineRenderPending) {
        state.timelineRenderPending = false;
        renderTimeline();
    }
}

// Re-query row from live DOM in case a render happened
function getLiveRow(row) {
    if (row.dataset.phantom === 'true') return document.querySelector('#timeline-tbody tr[data-phantom="true"]') || row;
    if (row.dataset.id) return document.querySelector(`#timeline-tbody tr[data-id="${row.dataset.id}"]`) || row;
    return row;
}

function navigateToAdjacentCell(row, currentField, direction) {
    const idx = TIMELINE_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;

    if (nextIdx >= 0 && nextIdx < TIMELINE_FIELD_ORDER.length) {
        // Same row, next/prev cell
        const liveRow = getLiveRow(row);
        const nextField = TIMELINE_FIELD_ORDER[nextIdx];
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editTimelineCell(nextCell);
    } else if (direction > 0) {
        // Tab past last field: wrap to next row's first field
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewRow();
            return;
        }
        const liveRow = getLiveRow(row);
        const nextRow = liveRow.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = TIMELINE_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editTimelineCell(nextCell);
        }
    } else if (direction < 0) {
        // Shift+Tab past first field: wrap to prev row's last field
        const liveRow = getLiveRow(row);
        const prevRow = liveRow.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = TIMELINE_FIELD_ORDER[TIMELINE_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editTimelineCell(prevCell);
        }
    }
}

function navigateToNextRowSameColumn(row, field) {
    const liveRow = getLiveRow(row);
    const nextRow = liveRow.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editTimelineCell(nextCell);
    }
}

function navigateToPrevRowSameColumn(row, field) {
    const liveRow = getLiveRow(row);
    const prevRow = liveRow.previousElementSibling;
    if (prevRow && prevRow.querySelector('td[data-field]')) {
        const prevCell = prevRow.querySelector(`td[data-field="${field}"]`);
        if (prevCell) editTimelineCell(prevCell);
    }
}

// Commit the phantom row to Firestore
async function commitNewRow() {
    const data = { ...state.pendingNewRow };

    // Need at least time or event
    if (!data.time && !data.event) {
        state.pendingNewRow = {};
        clearTimelineEditingFlag();
        renderTimeline();
        return;
    }

    // Convert time to 24hr
    if (data.time) data.time = convertTo24Hour(data.time);

    data.day = state.currentDay;
    data.completed = false;
    data.status = 'not-started';
    data.tag = '';
    data.notes = '';
    data.highlightColor = '';
    data.performer = '';
    data.stagePlotId = '';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    state.pendingNewRow = {};

    try {
        const docRef = await collections.timeline.add(data);
        pushTimelineUndo({ type: 'add', id: docRef.id });
        showToast('Task added');
    } catch (error) {
        console.error('Error adding task:', error);
        showToast('Error adding task', 'error');
    }

    clearTimelineEditingFlag();
}

// Backward compat: makeRowEditable now just clicks the first cell
function makeRowEditable(row) {
    if (row.classList.contains('editing')) return;
    const firstCell = row.querySelector(`td[data-field="${TIMELINE_FIELD_ORDER[0]}"]`);
    if (firstCell) editTimelineCell(firstCell);
}

function saveRowChanges(row) {
    // Save all active inputs in the row
    const inputs = row.querySelectorAll('.inline-edit-input');
    inputs.forEach(input => {
        const cell = input.closest('td');
        if (cell) saveSingleCell(cell, row);
    });
}

function cancelRowEdit(row) {
    const cells = row.querySelectorAll('td[data-field]');
    const isPhantom = row.dataset.phantom === 'true';
    cells.forEach(cell => restoreCellDisplay(cell, isPhantom));
    row.classList.remove('editing');
    clearTimelineEditingFlag();
}

// Flexible time parser: accepts nearly any format and returns 24hr "HH:MM"
// Examples: "5pm" → "17:00", "530p" → "17:30", "5:30 PM" → "17:30",
//   "17:00" → "17:00", "530" → "05:30", "5" → "05:00", "12a" → "00:00",
//   "noon" → "12:00", "midnight" → "00:00", "9:5p" → "21:05"
function convertTo24Hour(raw) {
    if (!raw) return '';
    let s = raw.trim().toLowerCase();

    // Special words
    if (s === 'noon' || s === '12n') return '12:00';
    if (s === 'midnight' || s === '12mn') return '00:00';

    // Extract AM/PM indicator
    let period = null;
    if (/a\.?m?\.?$/i.test(s)) {
        period = 'am';
        s = s.replace(/\s*a\.?m?\.?$/i, '');
    } else if (/p\.?m?\.?$/i.test(s)) {
        period = 'pm';
        s = s.replace(/\s*p\.?m?\.?$/i, '');
    }

    s = s.trim();

    let hours, minutes;

    if (s.includes(':')) {
        // Has colon: "5:30", "17:00", "5:5"
        const parts = s.split(':');
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10) || 0;
    } else {
        // No colon: "5", "530", "1730", "17"
        const digits = s.replace(/\D/g, '');
        if (digits.length === 0) return raw; // can't parse, return as-is

        if (digits.length <= 2) {
            // "5" → 5:00, "17" → 17:00
            hours = parseInt(digits, 10);
            minutes = 0;
        } else if (digits.length === 3) {
            // "530" → 5:30
            hours = parseInt(digits.charAt(0), 10);
            minutes = parseInt(digits.substring(1), 10);
        } else {
            // "0530", "1730" → 17:30
            hours = parseInt(digits.substring(0, digits.length - 2), 10);
            minutes = parseInt(digits.substring(digits.length - 2), 10);
        }
    }

    // Validate
    if (isNaN(hours) || isNaN(minutes)) return raw;
    if (minutes < 0 || minutes > 59) return raw;

    // Apply AM/PM
    if (period === 'am') {
        if (hours === 12) hours = 0;
    } else if (period === 'pm') {
        if (hours !== 12) hours += 12;
    } else {
        // No AM/PM specified — if hours <= 12, guess based on context
        // (leave as-is for 24hr values like 17, 23, etc.)
        if (hours > 24) return raw;
    }

    if (hours < 0 || hours > 23) return raw;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Budget Category Accordion Toggle
// Toggle Category Section
function toggleCategorySection(categoryId) {
    const content = document.getElementById(`content-${categoryId}`);
    const arrow = document.getElementById(`arrow-${categoryId}`);

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
        localStorage.setItem(`category-${categoryId}`, 'open');
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
        localStorage.setItem(`category-${categoryId}`, 'closed');
    }
}

// Inline Editing for Budget Items
// Single-click cell editing for Budget
function editBudgetCell(cell) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard
    state.budgetEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewBudgetRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create appropriate input based on field type
    let inputEl;
    if (field === 'paymentStatus') {
        inputEl = document.createElement('select');
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
        inputEl.innerHTML = `
            <option value="paid" ${original === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="partial" ${original === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="not-paid" ${original === 'not-paid' ? 'selected' : ''}>Not Paid</option>
        `;
    } else if (field === 'budgeted' || field === 'actual') {
        inputEl = document.createElement('input');
        inputEl.type = 'number';
        inputEl.step = '0.01';
        inputEl.value = original;
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
    } else {
        inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.value = original;
        inputEl.className = 'inline-edit-input';
        inputEl.dataset.field = field;
    }

    cell.textContent = '';
    cell.appendChild(inputEl);
    inputEl.focus();
    if (inputEl.select) inputEl.select();

    // Keyboard navigation
    inputEl.addEventListener('keydown', (e) => handleBudgetCellKeydown(e, cell, row));

    // Blur handler: auto-save if focus leaves the row entirely
    inputEl.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = inputEl.value.trim();
                    if (val) state.pendingNewBudgetRow[field] = val;
                    restoreBudgetCellDisplay(cell, isPhantom);
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        clearBudgetEditingFlag();
                    }
                } else {
                    saveSingleBudgetCell(cell, row);
                }
            }
        }, 50);
    });
}

function handleBudgetCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewBudgetRow[field] = val;
            restoreBudgetCellDisplay(cell, true);
        } else {
            saveSingleBudgetCell(cell, row);
        }
        navigateBudgetCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewBudgetRow[field] = val;
            restoreBudgetCellDisplay(cell, true);
            commitNewBudgetRow(row);
        } else {
            saveSingleBudgetCell(cell, row);
            navigateBudgetNextRowSameColumn(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreBudgetCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearBudgetEditingFlag();
    }
}

function saveSingleBudgetCell(cell, row) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    const item = state.budget.find(i => i.id === id);
    if (!item) { restoreBudgetCellDisplay(cell, false); return; }

    let newValue = input.value.trim();
    const oldValue = (field === 'budgeted' || field === 'actual')
        ? (parseFloat(item[field]) || 0)
        : (item[field] || '');

    // Convert number fields
    if (field === 'budgeted' || field === 'actual') {
        newValue = parseFloat(newValue) || 0;
    }

    // Restore cell to display mode
    cell.dataset.original = String(newValue);
    restoreBudgetCellDisplay(cell, false);

    // Live-update difference column
    if (field === 'budgeted' || field === 'actual') {
        const budgetedCell = row.querySelector('td[data-field="budgeted"]');
        const actualCell = row.querySelector('td[data-field="actual"]');
        const budgetedVal = parseFloat(budgetedCell.dataset.original) || 0;
        const actualVal = parseFloat(actualCell.dataset.original) || 0;
        const difference = budgetedVal - actualVal;
        const diffCell = row.querySelector('td[data-computed="difference"]');
        if (diffCell) {
            diffCell.className = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';
            diffCell.textContent = `${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}`;
        }
    }

    // If no other cells are being edited in this row, clear editing state
    if (!row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearBudgetEditingFlag();
    }

    // Only save if value changed
    if (String(newValue) === String(oldValue)) return;

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.budget.doc(id).update(updates)
        .then(() => showToast('Updated'))
        .catch(err => {
            console.error('Error saving cell:', err);
            showToast('Error saving', 'error');
        });
}

function restoreBudgetCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewBudgetRow[field] || '';
        if (val) {
            if (field === 'budgeted' || field === 'actual') {
                cell.textContent = formatCurrency(parseFloat(val) || 0);
            } else if (field === 'paymentStatus') {
                cell.innerHTML = `<span class="status-badge ${val}">${formatPaymentStatus(val)}</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            const placeholder = field === 'paymentStatus' ? '+ status' : `+ ${field}`;
            cell.innerHTML = `<span class="phantom-placeholder">${placeholder}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'budgeted' || field === 'actual') {
            cell.textContent = formatCurrency(parseFloat(original) || 0);
        } else if (field === 'paymentStatus') {
            cell.innerHTML = `<span class="status-badge ${original}">${formatPaymentStatus(original)}</span>`;
        } else {
            cell.textContent = original;
        }
    }
}

function clearBudgetEditingFlag() {
    state.budgetEditingRowId = null;
    if (state.budgetRenderPending) {
        state.budgetRenderPending = false;
        renderBudget();
    }
}

function navigateBudgetCell(row, currentField, direction) {
    const idx = BUDGET_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;
    const tbody = row.closest('tbody');

    if (nextIdx >= 0 && nextIdx < BUDGET_FIELD_ORDER.length) {
        const nextField = BUDGET_FIELD_ORDER[nextIdx];
        const nextCell = row.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editBudgetCell(nextCell);
    } else if (direction > 0) {
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewBudgetRow(row);
            return;
        }
        // Wrap to next row within the same tbody (category)
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = BUDGET_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editBudgetCell(nextCell);
        }
    } else if (direction < 0) {
        const prevRow = row.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = BUDGET_FIELD_ORDER[BUDGET_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editBudgetCell(prevCell);
        }
    }
}

function navigateBudgetNextRowSameColumn(row, field) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editBudgetCell(nextCell);
    }
}

async function commitNewBudgetRow(phantomRow) {
    const data = { ...state.pendingNewBudgetRow };

    // Need at least vendor or description
    if (!data.vendor && !data.description) {
        state.pendingNewBudgetRow = {};
        clearBudgetEditingFlag();
        renderBudget();
        return;
    }

    // Get category from phantom row
    const category = phantomRow.dataset.category || 'Uncategorized';
    data.category = category;

    // Convert number fields
    if (data.budgeted) data.budgeted = parseFloat(data.budgeted) || 0;
    if (data.actual) data.actual = parseFloat(data.actual) || 0;

    // Fill missing fields
    BUDGET_FIELD_ORDER.forEach(f => {
        if (data[f] === undefined) data[f] = (f === 'budgeted' || f === 'actual') ? 0 : '';
    });

    data.confirmed = false;
    data.paymentStatus = data.paymentStatus || 'not-paid';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    state.pendingNewBudgetRow = {};
    clearBudgetEditingFlag();

    try {
        await collections.budget.add(data);
        showToast('Budget item added');
    } catch (error) {
        console.error('Error adding budget item:', error);
        showToast('Error adding item', 'error');
    }
}

// Initialize accordion state on page load
document.addEventListener('DOMContentLoaded', () => {
    // Restore budget category accordion state
    const accordionState = localStorage.getItem('budgetCategoryAccordionOpen');
    if (accordionState === 'true') {
        const content = document.getElementById('budget-category-accordion');
        const arrow = document.getElementById('budget-category-arrow');
        if (content && arrow) {
            content.style.display = 'block';
            arrow.textContent = '▼';
        }
    }
});

// Stage Inputs Loading

// Render Stage Inputs
function renderStageInputs() {
    // Render guard: don't rebuild DOM if user is editing a cell
    if (state.stageEditingRowId) {
        state.stageRenderPending = true;
        return;
    }

    const tbody = document.getElementById('stage-tbody');
    const title = document.getElementById('stage-title');

    // Determine which stage to show
    const isMainStage = state.currentStage === 'main';
    const stageData = isMainStage ? state.mainStageInputs : state.cocktailStageInputs;
    const collectionName = isMainStage ? 'mainStageInputs' : 'cocktailStageInputs';
    const stageName = isMainStage ? 'Main Stage' : 'Cocktail Stage';

    // Update title
    title.textContent = `${stageName} - Audio & Technical Inputs`;

    // Calculate next channel for phantom row
    const nextChannel = stageData.length > 0
        ? Math.max(...stageData.map(i => parseInt(i.channel) || 0)) + 1
        : 1;

    if (stageData.length === 0) {
        // Show phantom row even when empty
        const phantomRow = `
            <tr class="stage-phantom-row" data-phantom="true" data-collection="${collectionName}">
                <td class="drag-handle" style="cursor: default; color: transparent;">⠿</td>
                <td data-field="channel" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ ${nextChannel}</span></td>
                <td data-field="subsnake" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ subsnake</span></td>
                <td data-field="instrument" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ instrument</span></td>
                <td data-field="mics" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ mics</span></td>
                <td data-field="stands" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ stands</span></td>
                <td data-field="notes" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ notes</span></td>
                <td data-field="symbol" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ symbol</span></td>
                <td class="stage-actions-cell no-print"></td>
            </tr>
        `;
        tbody.innerHTML = phantomRow;
        state.pendingNewStageRow = {};
        return;
    }

    // Sort by order field, fall back to channel number
    const sorted = [...stageData].sort((a, b) => {
        if (a.order != null && b.order != null) return a.order - b.order;
        if (a.order != null) return -1;
        if (b.order != null) return 1;
        return (parseInt(a.channel) || 0) - (parseInt(b.channel) || 0);
    });

    const rowsHtml = sorted.map(item => {
        return `
            <tr data-id="${item.id}" draggable="true"
                ondragstart="onStageDragStart(event)"
                ondragover="onStageDragOver(event)"
                ondragend="onStageDragEnd(event)"
                ondrop="onStageDrop(event, '${collectionName}')">
                <td class="drag-handle" title="Drag to reorder">⠿</td>
                <td data-field="channel" data-original="${escapeHtml(item.channel || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.channel || '')}</td>
                <td data-field="subsnake" data-original="${escapeHtml(item.subsnake || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.subsnake || '')}</td>
                <td data-field="instrument" data-original="${escapeHtml(item.instrument || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.instrument || '')}</td>
                <td data-field="mics" data-original="${escapeHtml(item.mics || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.mics || '')}</td>
                <td data-field="stands" data-original="${escapeHtml(item.stands || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.stands || '')}</td>
                <td data-field="notes" data-original="${escapeHtml(item.notes || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.notes || '')}</td>
                <td data-field="symbol" data-original="${escapeHtml(item.symbol || '')}" onclick="editStageCell(this, '${collectionName}')">${escapeHtml(item.symbol || '')}</td>
                <td class="stage-actions-cell no-print">
                    <div class="actions-row">
                        <button class="action-icon action-icon-danger" onclick="deleteStageInput('${item.id}', '${collectionName}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Phantom row for inline adding
    const phantomRow = `
        <tr class="stage-phantom-row" data-phantom="true" data-collection="${collectionName}">
            <td class="drag-handle" style="cursor: default; color: transparent;">⠿</td>
            <td data-field="channel" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ ${nextChannel}</span></td>
            <td data-field="subsnake" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ subsnake</span></td>
            <td data-field="instrument" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ instrument</span></td>
            <td data-field="mics" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ mics</span></td>
            <td data-field="stands" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ stands</span></td>
            <td data-field="notes" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ notes</span></td>
            <td data-field="symbol" onclick="editStageCell(this, '${collectionName}')"><span class="phantom-placeholder">+ symbol</span></td>
            <td class="stage-actions-cell no-print"></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewStageRow = {};
}

// Single-click cell editing for Stage Inputs
function editStageCell(cell, collectionName) {
    // Already has an input? Just focus it
    if (cell.querySelector('.inline-edit-input')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    const rowId = row.dataset.id;

    // Set editing guard
    state.stageEditingRowId = isPhantom ? 'phantom' : rowId;

    row.classList.add('editing');

    // Determine the original value
    let original = '';
    if (isPhantom) {
        original = state.pendingNewStageRow[field] || '';
    } else {
        original = cell.dataset.original || '';
    }

    // Create input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    // Keyboard navigation
    input.addEventListener('keydown', (e) => handleStageCellKeydown(e, cell, row, collectionName));

    // Blur handler: auto-save if focus leaves the row entirely
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && activeEl.classList.contains('inline-edit-input')) return;
            if (cell.querySelector('.inline-edit-input')) {
                if (isPhantom) {
                    const val = input.value.trim();
                    if (val) state.pendingNewStageRow[field] = val;
                    restoreStageCellDisplay(cell, isPhantom);
                    if (!row.querySelector('.inline-edit-input')) {
                        row.classList.remove('editing');
                        clearStageEditingFlag();
                    }
                } else {
                    saveSingleStageCell(cell, row, collectionName);
                }
            }
        }, 50);
    });
}

function handleStageCellKeydown(e, cell, row, collectionName) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';

    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewStageRow[field] = val;
            restoreStageCellDisplay(cell, true);
        } else {
            saveSingleStageCell(cell, row, collectionName);
        }
        navigateStageCell(row, field, direction, collectionName);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const input = cell.querySelector('.inline-edit-input');
            const val = input ? input.value.trim() : '';
            if (val) state.pendingNewStageRow[field] = val;
            restoreStageCellDisplay(cell, true);
            commitNewStageRow(collectionName);
        } else {
            saveSingleStageCell(cell, row, collectionName);
            navigateStageNextRowSameColumn(row, field, collectionName);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreStageCellDisplay(cell, isPhantom);
        row.classList.remove('editing');
        clearStageEditingFlag();
    }
}

function saveSingleStageCell(cell, row, collectionName) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    const newValue = input.value.trim();

    // Restore cell to display mode
    cell.dataset.original = newValue;
    cell.textContent = newValue;

    // If no other cells are being edited in this row, clear editing state
    if (!row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearStageEditingFlag();
    }

    // Only save if value changed
    const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
    const item = stageData.find(i => i.id === id);
    const oldValue = item ? (item[field] || '') : '';
    if (newValue === oldValue) return;

    // Save to Firestore
    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections[collectionName].doc(id).update(updates)
        .then(() => showToast('Updated'))
        .catch(err => {
            console.error('Error saving cell:', err);
            showToast('Error saving', 'error');
        });
}

function restoreStageCellDisplay(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewStageRow[field] || '';
        if (val) {
            cell.textContent = val;
        } else {
            cell.innerHTML = `<span class="phantom-placeholder">+ ${field}</span>`;
        }
    } else {
        cell.textContent = cell.dataset.original || '';
    }
}

function clearStageEditingFlag() {
    state.stageEditingRowId = null;
    if (state.stageRenderPending) {
        state.stageRenderPending = false;
        renderStageInputs();
    }
}

function navigateStageCell(row, currentField, direction, collectionName) {
    const idx = STAGE_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;

    if (nextIdx >= 0 && nextIdx < STAGE_FIELD_ORDER.length) {
        const nextField = STAGE_FIELD_ORDER[nextIdx];
        const nextCell = row.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editStageCell(nextCell, collectionName);
    } else if (direction > 0) {
        const isPhantom = row.dataset.phantom === 'true';
        if (isPhantom) {
            commitNewStageRow(collectionName);
            return;
        }
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = STAGE_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editStageCell(nextCell, collectionName);
        }
    } else if (direction < 0) {
        const prevRow = row.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = STAGE_FIELD_ORDER[STAGE_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editStageCell(prevCell, collectionName);
        }
    }
}

function navigateStageNextRowSameColumn(row, field, collectionName) {
    const nextRow = row.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editStageCell(nextCell, collectionName);
    }
}

async function commitNewStageRow(collectionName) {
    const data = { ...state.pendingNewStageRow };

    // Need at least channel or instrument
    if (!data.channel && !data.instrument) {
        state.pendingNewStageRow = {};
        clearStageEditingFlag();
        renderStageInputs();
        return;
    }

    // Auto-assign channel if not provided
    if (!data.channel) {
        const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
        const nextChannel = stageData.length > 0
            ? Math.max(...stageData.map(i => parseInt(i.channel) || 0)) + 1
            : 1;
        data.channel = String(nextChannel);
    }

    // Fill missing fields with empty strings
    STAGE_FIELD_ORDER.forEach(f => { if (!data[f]) data[f] = ''; });

    const stageData = collectionName === 'mainStageInputs' ? state.mainStageInputs : state.cocktailStageInputs;
    data.order = stageData.length;

    state.pendingNewStageRow = {};
    clearStageEditingFlag();

    try {
        await collections[collectionName].add(data);
        showToast('Input added');
    } catch (error) {
        console.error('Error adding stage input:', error);
        showToast('Error adding input', 'error');
    }
}

// Delete a stage input row
async function deleteStageInput(id, collectionName) {
    if (!confirm('Delete this input?')) return;
    try {
        await collections[collectionName].doc(id).delete();
        showToast('Input deleted');
    } catch (error) {
        console.error('Error deleting stage input:', error);
        showToast('Error deleting input', 'error');
    }
}
window.deleteStageInput = deleteStageInput;

// Drag and Drop for Stage Input rows
let draggedRow = null;

function onStageDragStart(e) {
    draggedRow = e.target.closest('tr');
    draggedRow.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onStageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('tr');
    if (!row || row === draggedRow || !row.parentElement) return;

    const tbody = row.parentElement;
    const rows = [...tbody.querySelectorAll('tr')];
    const dragIdx = rows.indexOf(draggedRow);
    const hoverIdx = rows.indexOf(row);

    if (dragIdx < hoverIdx) {
        row.after(draggedRow);
    } else {
        row.before(draggedRow);
    }
}

function onStageDragEnd(e) {
    if (draggedRow) {
        draggedRow.classList.remove('dragging');
        draggedRow = null;
    }
}

function onStageDrop(e, collectionName) {
    e.preventDefault();
    if (!draggedRow) return;

    const tbody = draggedRow.parentElement;
    const rows = [...tbody.querySelectorAll('tr')];

    // Batch update order field for all rows
    const batch = db.batch();
    rows.forEach((row, index) => {
        const id = row.dataset.id;
        if (id) {
            batch.update(collections[collectionName].doc(id), { order: index });
        }
    });

    batch.commit()
        .then(() => showToast('Order updated'))
        .catch(err => {
            console.error('Error saving order:', err);
            showToast('Error saving order', 'error');
        });
}

window.onStageDragStart = onStageDragStart;
window.onStageDragOver = onStageDragOver;
window.onStageDragEnd = onStageDragEnd;
window.onStageDrop = onStageDrop;

// Export Stage Inputs to Excel
function exportStageInputsToExcel() {
    const wb = XLSX.utils.book_new();

    // Export Main Stage
    const mainSorted = [...state.mainStageInputs].sort((a, b) => {
        const aNum = parseInt(a.channel) || 0;
        const bNum = parseInt(b.channel) || 0;
        return aNum - bNum;
    });

    const mainData = mainSorted.map(item => ({
        '#': item.channel || '',
        'Subsnake': item.subsnake || '',
        'Instrument': item.instrument || '',
        'Mics (Preferred)': item.mics || '',
        'Stands': item.stands || '',
        'Notes': item.notes || '',
        'Symbol': item.symbol || ''
    }));

    const wsMain = XLSX.utils.json_to_sheet(mainData);
    wsMain['!cols'] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 25 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, wsMain, 'Main Stage');

    // Export Cocktail Stage
    const cocktailSorted = [...state.cocktailStageInputs].sort((a, b) => {
        const aNum = parseInt(a.channel) || 0;
        const bNum = parseInt(b.channel) || 0;
        return aNum - bNum;
    });

    const cocktailData = cocktailSorted.map(item => ({
        '#': item.channel || '',
        'Subsnake': item.subsnake || '',
        'Instrument': item.instrument || '',
        'Mics (Preferred)': item.mics || '',
        'Stands': item.stands || '',
        'Notes': item.notes || '',
        'Symbol': item.symbol || ''
    }));

    const wsCocktail = XLSX.utils.json_to_sheet(cocktailData);
    wsCocktail['!cols'] = [
        { wch: 5 },
        { wch: 12 },
        { wch: 25 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 8 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCocktail, 'Cocktail Stage');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Stage_Input_Lists_${today}.xlsx`);
}

// =============================================
// STAFF FUNCTIONS
// =============================================


function staffItemMatchesSearch(member, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        member.name || '', member.role || '', member.responsibilities || '',
        member.email || '', member.phone || ''
    ];
    const text = fields.join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
}

function handleStaffSearch(value) {
    clearTimeout(staffSearchDebounce);
    staffSearchDebounce = setTimeout(() => {
        state.staffSearch = value;
        renderStaff();
    }, 150);
}

function clearStaffSearch() {
    const input = document.getElementById('staff-search-input');
    if (input) input.value = '';
    state.staffSearch = '';
    renderStaff();
}

window.handleStaffSearch = handleStaffSearch;
window.clearStaffSearch = clearStaffSearch;

function renderStaff() {
    const container = document.getElementById('staff-grid');

    // Update stat cards
    const total = state.staff.length;
    const uniqueRoles = new Set(state.staff.map(m => m.role || 'Unassigned')).size;
    const withContact = state.staff.filter(m => m.phone || m.email).length;
    const missingContact = total - withContact;

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('staff-stat-total', total);
    setStat('staff-stat-roles', uniqueRoles);
    setStat('staff-stat-contact', withContact);
    setStat('staff-stat-missing', missingContact);

    // Apply search
    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;
    let members = [...state.staff];
    if (isSearching) {
        members = members.filter(m => staffItemMatchesSearch(m, searchQuery));
    }

    // Update search count
    const countEl = document.getElementById('staff-search-count');
    if (countEl) {
        countEl.textContent = isSearching
            ? `${members.length} of ${total} staff`
            : `${total} staff`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('staff-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff members added yet. Click "+ Add Staff Member" to get started.</div>';
        return;
    }

    if (members.length === 0) {
        container.innerHTML = `<div class="staff-empty-state">No staff match "${escapeHtml(searchQuery)}"</div>`;
        return;
    }

    container.innerHTML = '<div class="staff-grid">' + members.map((member, idx) => `
        <div class="staff-card" style="animation-delay: ${idx * 40}ms">
            <div class="staff-card-header">
                <div class="staff-name">${escapeHtml(member.name || '')}</div>
                <div class="staff-role">${escapeHtml(member.role || '')}</div>
            </div>
            ${member.responsibilities ? `
                <div class="staff-responsibilities">${escapeHtml(member.responsibilities)}</div>
            ` : ''}
            <div class="staff-contact">
                ${member.phone ? `
                    <div class="staff-contact-item">
                        <span class="staff-contact-icon">📞</span>
                        <a href="tel:${escapeHtml(member.phone)}">${escapeHtml(member.phone)}</a>
                    </div>
                ` : ''}
                ${member.email ? `
                    <div class="staff-contact-item">
                        <span class="staff-contact-icon">✉️</span>
                        <a href="mailto:${escapeHtml(member.email)}">${escapeHtml(member.email)}</a>
                    </div>
                ` : ''}
            </div>
            <div class="staff-actions">
                <button class="btn btn-edit" onclick="openStaffModal('${member.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteStaff('${member.id}')">Delete</button>
            </div>
        </div>
    `).join('') + '</div>';
}

function openStaffModal(memberId = null) {
    const modal = document.getElementById('staff-modal');
    const form = document.getElementById('staff-form');
    const title = document.getElementById('staff-modal-title');

    form.reset();

    if (memberId) {
        const member = state.staff.find(s => s.id === memberId);
        if (member) {
            title.textContent = 'Edit Staff Member';
            document.getElementById('staff-id').value = member.id;
            document.getElementById('staff-name').value = member.name || '';
            document.getElementById('staff-role').value = member.role || '';
            document.getElementById('staff-responsibilities').value = member.responsibilities || '';
            document.getElementById('staff-phone').value = member.phone || '';
            document.getElementById('staff-email').value = member.email || '';
        }
    } else {
        title.textContent = 'Add Staff Member';
        document.getElementById('staff-id').value = '';
    }

    modal.classList.add('active');
}

async function handleStaffSubmit(e) {
    e.preventDefault();

    const staffData = {
        name: document.getElementById('staff-name').value,
        role: document.getElementById('staff-role').value,
        responsibilities: document.getElementById('staff-responsibilities').value,
        phone: document.getElementById('staff-phone').value,
        email: document.getElementById('staff-email').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const staffId = document.getElementById('staff-id').value;

    try {
        if (staffId) {
            await collections.staff.doc(staffId).update(staffData);
            showToast('Staff member updated');
        } else {
            staffData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.staff.add(staffData);
            showToast('Staff member added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving staff member:', error);
        showToast('Error saving staff member. Please try again.', 'error');
    }
}

window.deleteStaff = createDeleteHandler('staff', 'staff member');
window.openStaffModal = openStaffModal;

// ==========================================
// PACKING LIST
// ==========================================

// ==================== MENU PAGE ====================

const MENU_CATEGORIES = {
    "Passed Hors d'Oeuvres": [],
    "Seated Dinner": ["Salad", "Main Course", "Dessert"],
    "Late Night Bites": [],
    "Coffee & Tea Station": [],
    "Bar": ["Signature Cocktails", "Alternative Cocktails", "Sponsor Feature", "Wine", "Beer", "Non-Alcoholic"]
};

const MENU_CATEGORY_ORDER = [
    "Passed Hors d'Oeuvres",
    "Seated Dinner",
    "Late Night Bites",
    "Coffee & Tea Station",
    "Bar"
];

const DIETARY_TAGS = [
    { key: 'V', label: 'Vegetarian', color: '#22c55e' },
    { key: 'VG', label: 'Vegan', color: '#15803d' },
    { key: 'GF', label: 'Gluten-Free', color: '#f59e0b' },
    { key: 'DF', label: 'Dairy-Free', color: '#3b82f6' },
    { key: 'NF', label: 'Nut-Free', color: '#ef4444' }
];

const MENU_CATEGORY_COLORS = {
    "Passed Hors d'Oeuvres": '#c9a961',
    "Seated Dinner": '#2d8b75',
    "Late Night Bites": '#f07060',
    "Coffee & Tea Station": '#8b6914',
    "Bar": '#8b2252'
};

const MENU_FIELD_MAP = {
    'menu-name': 'name',
    'menu-description': 'description',
    'menu-category': 'category',
    'menu-subcategory': 'subcategory',
    'menu-serving-style': 'servingStyle',
    'menu-status': 'status',
    'menu-quantity': 'quantity',
    'menu-notes': 'notes'
};

function updateMenuSubcategories() {
    const catSelect = document.getElementById('menu-category');
    const subGroup = document.getElementById('menu-subcategory-group');
    const subSelect = document.getElementById('menu-subcategory');
    if (!catSelect || !subSelect || !subGroup) return;

    const category = catSelect.value;
    const subs = MENU_CATEGORIES[category] || [];

    if (subs.length === 0) {
        subGroup.style.display = 'none';
        subSelect.value = '';
    } else {
        subGroup.style.display = '';
        subSelect.innerHTML = '<option value="">None</option>' +
            subs.map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

function openMenuModal(itemId = null) {
    openModal({
        modalId: 'menu-modal',
        formId: 'menu-form',
        title: 'Menu Item',
        stateKey: 'menuItems',
        itemId: itemId,
        idFieldId: 'menu-id',
        fieldMap: MENU_FIELD_MAP,
        defaultValues: {
            'menu-status': 'pending'
        }
    });

    // Handle dietary tag checkboxes separately
    const checkboxes = document.querySelectorAll('.menu-diet-cb');
    checkboxes.forEach(cb => cb.checked = false);

    if (itemId) {
        const item = state.menuItems.find(i => i.id === itemId);
        if (item && item.dietaryTags) {
            checkboxes.forEach(cb => {
                cb.checked = item.dietaryTags.includes(cb.value);
            });
        }
    }

    updateMenuSubcategories();

    // If editing, restore subcategory after populating options
    if (itemId) {
        const item = state.menuItems.find(i => i.id === itemId);
        if (item && item.subcategory) {
            const subSelect = document.getElementById('menu-subcategory');
            if (subSelect) subSelect.value = item.subcategory;
        }
    }
}

async function handleMenuSubmit(e) {
    e.preventDefault();

    const data = {};
    Object.entries(MENU_FIELD_MAP).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        if (element) {
            data[dataKey] = element.value;
        }
    });

    // Parse quantity as number
    data.quantity = parseInt(data.quantity) || 0;

    // Collect dietary tags from checkboxes
    const dietaryTags = [];
    document.querySelectorAll('.menu-diet-cb:checked').forEach(cb => {
        dietaryTags.push(cb.value);
    });
    data.dietaryTags = dietaryTags;

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const id = document.getElementById('menu-id').value;

    try {
        if (id) {
            await collections.menuItems.doc(id).update(data);
            showToast('Menu item updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            // Set sortOrder for new items
            const catItems = state.menuItems.filter(i => i.category === data.category);
            data.sortOrder = catItems.length;
            await collections.menuItems.add(data);
            showToast('Menu item added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving menu item:', error);
        showToast('Error saving menu item', 'error');
    }
}

const deleteMenuItem = createDeleteHandler('menuItems', 'menu item');

function renderMenu() {
    const container = document.getElementById('menu-container');
    if (!container) return;

    const items = state.menuItems;
    const total = items.length;
    const confirmed = items.filter(i => i.status === 'confirmed').length;
    const pending = items.filter(i => i.status === 'pending' || !i.status).length;

    // Count unique dietary tags present
    const allTags = new Set();
    items.forEach(i => (i.dietaryTags || []).forEach(t => allTags.add(t)));

    // Update stat cards
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('menu-stat-total', total);
    setEl('menu-stat-confirmed', confirmed);
    setEl('menu-stat-pending', pending);
    setEl('menu-stat-dietary', allTags.size);

    // Update dietary summary bar
    const summaryBar = document.getElementById('menu-dietary-summary');
    if (summaryBar) {
        const tagCounts = {};
        items.forEach(i => (i.dietaryTags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
        if (Object.keys(tagCounts).length > 0) {
            summaryBar.innerHTML = DIETARY_TAGS
                .filter(dt => tagCounts[dt.key])
                .map(dt => `<span class="dietary-summary-pill pill-${dt.key.toLowerCase()}">${dt.key}: ${tagCounts[dt.key]}</span>`)
                .join('');
        } else {
            summaryBar.innerHTML = '';
        }
    }

    // Apply search
    let filtered = [...items];
    if (state.menuSearch) {
        const q = state.menuSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.description || '').toLowerCase().includes(q) ||
            (i.category || '').toLowerCase().includes(q) ||
            (i.subcategory || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q) ||
            (i.dietaryTags || []).some(t => t.toLowerCase().includes(q))
        );
    }

    // Apply category filter
    if (state.menuCategoryFilter !== 'all') {
        filtered = filtered.filter(i => i.category === state.menuCategoryFilter);
    }

    // Apply status filter
    if (state.menuStatusFilter !== 'all') {
        filtered = filtered.filter(i => (i.status || 'pending') === state.menuStatusFilter);
    }

    // Update search count
    const searchCount = document.getElementById('menu-search-count');
    if (searchCount) {
        if (state.menuSearch || state.menuCategoryFilter !== 'all' || state.menuStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${total === 0 ? 'No menu items added' : 'No items match your filters'}</p>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    // Sort categories
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = MENU_CATEGORY_ORDER.indexOf(a);
        const bi = MENU_CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const isFullView = state.menuViewMode === 'full';

    let html = '';
    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        const catConfirmed = catItems.filter(i => i.status === 'confirmed').length;
        const catColor = MENU_CATEGORY_COLORS[cat] || '#888';

        // Group by subcategory within category
        const subcatGrouped = {};
        const noSubcat = [];
        catItems.forEach(item => {
            if (item.subcategory) {
                if (!subcatGrouped[item.subcategory]) subcatGrouped[item.subcategory] = [];
                subcatGrouped[item.subcategory].push(item);
            } else {
                noSubcat.push(item);
            }
        });

        // Sort subcategories by defined order
        const catSubs = MENU_CATEGORIES[cat] || [];
        const sortedSubcats = Object.keys(subcatGrouped).sort((a, b) => {
            const ai = catSubs.indexOf(a);
            const bi = catSubs.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        const escapedCat = cat.replace(/'/g, "\\'");

        if (isFullView) {
            html += `<div class="menu-category-section menu-full-view" style="border-left-color: ${catColor}">
                <div class="menu-category-heading" style="color: ${catColor}">
                    <span class="menu-category-name">${cat}</span>
                    <span class="menu-category-count">${catConfirmed}/${catItems.length} confirmed</span>
                </div>`;
        } else {
            html += `<div class="menu-category-section" style="border-left-color: ${catColor}">
                <div class="menu-category-header" onclick="toggleMenuCategory('${escapedCat}')">
                    <div class="menu-category-header-left">
                        <svg class="packing-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>
                        <span class="menu-category-name">${cat}</span>
                        <span class="packing-category-count">${catConfirmed}/${catItems.length} confirmed</span>
                    </div>
                </div>
                <div class="menu-category-body open">`;
        }

        // Render items without subcategory first
        noSubcat.forEach(item => { html += renderMenuItemCard(item, catColor); });

        // Render subcategory groups
        sortedSubcats.forEach(sub => {
            html += `<div class="menu-subcategory-heading">${sub}</div>`;
            subcatGrouped[sub].forEach(item => { html += renderMenuItemCard(item, catColor); });
        });

        if (isFullView) {
            html += `</div>`;
        } else {
            html += `</div></div>`;
        }
    });

    container.innerHTML = html;
}

function renderMenuItemCard(item, catColor) {
    const statusClass = item.status === 'confirmed' ? 'menu-status-confirmed' : 'menu-status-pending';
    const statusLabel = item.status === 'confirmed' ? 'Confirmed' : 'Pending';
    const dietaryPills = (item.dietaryTags || []).map(t =>
        `<span class="dietary-pill pill-${t.toLowerCase()}">${t}</span>`
    ).join('');
    const servingBadge = item.servingStyle ? `<span class="menu-serving-badge">${item.servingStyle}</span>` : '';
    const escapedName = (item.name || 'Unnamed').replace(/"/g, '&quot;');

    return `<div class="menu-item-card">
        <div class="menu-item-main">
            <div class="menu-item-header">
                <span class="menu-item-name">${item.name || 'Unnamed'}</span>
                ${dietaryPills ? `<span class="menu-item-pills">${dietaryPills}</span>` : ''}
            </div>
            ${item.description ? `<div class="menu-item-desc">${item.description}</div>` : ''}
            <div class="menu-item-meta">
                ${servingBadge}
                <span class="menu-status-badge ${statusClass}">${statusLabel}</span>
                ${item.quantity ? `<span class="menu-qty-badge">${item.quantity} servings</span>` : ''}
            </div>
        </div>
        <div class="menu-item-actions">
            <button class="btn-icon-sm" onclick="openMenuModal('${item.id}')" title="Edit">✎</button>
            <button class="btn-icon-sm delete" onclick="deleteMenuItem('${item.id}')" title="Delete">✕</button>
        </div>
    </div>`;
}

function handleMenuSearch(value) {
    state.menuSearch = value;
    const clearBtn = document.getElementById('menu-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderMenu();
}

function clearMenuSearch() {
    state.menuSearch = '';
    const input = document.getElementById('menu-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('menu-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderMenu();
}

function handleMenuStatusFilter(value) {
    state.menuStatusFilter = value;
    renderMenu();
}

function filterMenuCategory(category) {
    state.menuCategoryFilter = category;
    document.querySelectorAll('.menu-cat-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.cat === category)
    );
    renderMenu();
}

function setMenuView(mode) {
    state.menuViewMode = mode;
    document.querySelectorAll('.menu-view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === mode)
    );
    renderMenu();
}

function toggleMenuCategory(category) {
    const sections = document.querySelectorAll('.menu-category-section');
    sections.forEach(section => {
        const name = section.querySelector('.menu-category-name');
        if (name && name.textContent === category) {
            const body = section.querySelector('.menu-category-body');
            const chevron = section.querySelector('.packing-chevron');
            if (body) body.classList.toggle('open');
            if (chevron) chevron.classList.toggle('collapsed');
        }
    });
}

function toggleMenuPrintMode() {
    const page = document.getElementById('menu');
    const printView = document.getElementById('menu-print-view');
    if (!page || !printView) return;

    page.querySelectorAll('.page-header, .page-search-bar, .menu-view-bar, .stats-grid, .menu-dietary-summary, #menu-container').forEach(el => el.style.display = 'none');
    printView.style.display = 'block';
    renderMenuPrintView();
}

function exitMenuPrintMode() {
    const page = document.getElementById('menu');
    const printView = document.getElementById('menu-print-view');
    if (!page || !printView) return;

    page.querySelectorAll('.page-header, .page-search-bar, .menu-view-bar, .stats-grid, .menu-dietary-summary, #menu-container').forEach(el => el.style.display = '');
    printView.style.display = 'none';
}

function renderMenuPrintView() {
    const printView = document.getElementById('menu-print-view');
    if (!printView) return;

    const items = state.menuItems.filter(i => i.status === 'confirmed');

    // Group by category
    const grouped = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = MENU_CATEGORY_ORDER.indexOf(a);
        const bi = MENU_CATEGORY_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = `
        <div class="menu-print-content">
            <button class="menu-print-close" onclick="exitMenuPrintMode()">&times;</button>
            <div class="menu-print-header">
                <h1>YMU 13th Fundraising Gala</h1>
                <div class="menu-print-date">April 25, 2026</div>
                <div class="menu-print-divider"></div>
                <h2>Dinner Menu</h2>
            </div>`;

    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        html += `<div class="menu-print-category">
            <h3 class="menu-print-cat-title">${cat}</h3>
            <div class="menu-print-rule"></div>`;

        // Group by subcategory
        const subcatGrouped = {};
        const noSubcat = [];
        catItems.forEach(item => {
            if (item.subcategory) {
                if (!subcatGrouped[item.subcategory]) subcatGrouped[item.subcategory] = [];
                subcatGrouped[item.subcategory].push(item);
            } else {
                noSubcat.push(item);
            }
        });

        const catSubs = MENU_CATEGORIES[cat] || [];
        const sortedSubcats = Object.keys(subcatGrouped).sort((a, b) => {
            const ai = catSubs.indexOf(a);
            const bi = catSubs.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        noSubcat.forEach(item => {
            const pills = (item.dietaryTags || []).map(t => `<span class="dietary-pill-sm pill-${t.toLowerCase()}">${t}</span>`).join('');
            html += `<div class="menu-print-item">
                <div class="menu-print-item-name">${item.name}${pills ? ' ' + pills : ''}</div>
                ${item.description ? `<div class="menu-print-item-desc">${item.description}</div>` : ''}
            </div>`;
        });

        sortedSubcats.forEach(sub => {
            html += `<div class="menu-print-subcat">${sub}</div>`;
            subcatGrouped[sub].forEach(item => {
                const pills = (item.dietaryTags || []).map(t => `<span class="dietary-pill-sm pill-${t.toLowerCase()}">${t}</span>`).join('');
                html += `<div class="menu-print-item">
                    <div class="menu-print-item-name">${item.name}${pills ? ' ' + pills : ''}</div>
                    ${item.description ? `<div class="menu-print-item-desc">${item.description}</div>` : ''}
                </div>`;
            });
        });

        html += `</div>`;
    });

    html += `</div>`;
    printView.innerHTML = html;
}

// Menu window exports
window.openMenuModal = openMenuModal;
window.deleteMenuItem = deleteMenuItem;
window.handleMenuSearch = handleMenuSearch;
window.clearMenuSearch = clearMenuSearch;
window.handleMenuStatusFilter = handleMenuStatusFilter;
window.filterMenuCategory = filterMenuCategory;
window.setMenuView = setMenuView;
window.updateMenuSubcategories = updateMenuSubcategories;
window.toggleMenuPrintMode = toggleMenuPrintMode;
window.exitMenuPrintMode = exitMenuPrintMode;
window.toggleMenuCategory = toggleMenuCategory;

// ==================== PACKING LIST ====================

const PACKING_CATEGORIES = ['Audio', 'Lighting', 'Decor', 'Signage', 'Catering', 'Printed Materials', 'Misc'];

const PACKING_STATUSES = [
    { value: 'to-pack', label: 'To Pack', next: 'packed' },
    { value: 'packed', label: 'Packed', next: 'loaded' },
    { value: 'loaded', label: 'Loaded', next: 'at-venue' },
    { value: 'at-venue', label: 'At Venue', next: null }
];

function getStatusInfo(statusValue) {
    return PACKING_STATUSES.find(s => s.value === statusValue) || PACKING_STATUSES[0];
}

function renderPackingList() {
    const container = document.getElementById('packing-list-container');
    if (!container) return;

    const items = state.packingList;
    const total = items.length;
    const toPack = items.filter(i => i.status === 'to-pack').length;
    const packed = items.filter(i => i.status === 'packed').length;
    const loaded = items.filter(i => i.status === 'loaded').length;
    const atVenue = items.filter(i => i.status === 'at-venue').length;

    // Update stat cards
    const statTotal = document.getElementById('packing-stat-total');
    const statToPack = document.getElementById('packing-stat-topack');
    const statInProgress = document.getElementById('packing-stat-inprogress');
    const statAtVenue = document.getElementById('packing-stat-atvenue');
    if (statTotal) statTotal.textContent = total;
    if (statToPack) statToPack.textContent = toPack;
    if (statInProgress) statInProgress.textContent = packed + loaded;
    if (statAtVenue) statAtVenue.textContent = atVenue;

    // Update progress bar
    if (total > 0) {
        document.getElementById('progress-to-pack').style.width = ((toPack / total) * 100) + '%';
        document.getElementById('progress-packed').style.width = ((packed / total) * 100) + '%';
        document.getElementById('progress-loaded').style.width = ((loaded / total) * 100) + '%';
        document.getElementById('progress-at-venue').style.width = ((atVenue / total) * 100) + '%';
    } else {
        document.getElementById('progress-to-pack').style.width = '0%';
        document.getElementById('progress-packed').style.width = '0%';
        document.getElementById('progress-loaded').style.width = '0%';
        document.getElementById('progress-at-venue').style.width = '0%';
    }

    // Apply filters
    let filtered = [...items];
    if (state.packingSearch) {
        const q = state.packingSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.assignee || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.packingCategoryFilter !== 'all') {
        filtered = filtered.filter(i => i.category === state.packingCategoryFilter);
    }
    if (state.packingStatusFilter !== 'all') {
        filtered = filtered.filter(i => i.status === state.packingStatusFilter);
    }

    // Update search count
    const searchCount = document.getElementById('packing-search-count');
    if (searchCount) {
        if (state.packingSearch || state.packingCategoryFilter !== 'all' || state.packingStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">${total === 0 ? 'No packing items added' : 'No items match your filters'}</p>`;
        return;
    }

    // Group by category
    const grouped = {};
    filtered.forEach(item => {
        const cat = item.category || 'Misc';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    // Sort categories by PACKING_CATEGORIES order
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const ai = PACKING_CATEGORIES.indexOf(a);
        const bi = PACKING_CATEGORIES.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = '';
    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        const catAtVenue = catItems.filter(i => i.status === 'at-venue').length;
        const catTotal = catItems.length;
        const catPct = catTotal > 0 ? Math.round((catAtVenue / catTotal) * 100) : 0;
        const allDone = catAtVenue === catTotal;
        const hasAdvanceable = catItems.some(i => getStatusInfo(i.status).next !== null);

        html += `
        <div class="packing-category-section" data-category="${cat}">
            <div class="packing-category-header" onclick="togglePackingCategory('${cat}')">
                <div class="packing-category-header-left">
                    <svg class="packing-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>
                    <span class="packing-category-name">${cat}</span>
                    <span class="packing-category-count">${catAtVenue}/${catTotal}</span>
                </div>
                <div class="packing-category-header-right">
                    <div class="packing-mini-progress">
                        <div class="packing-mini-progress-fill${allDone ? ' complete' : ''}" style="width: ${catPct}%"></div>
                    </div>
                    ${hasAdvanceable ? `<button class="btn btn-sm btn-advance-all" onclick="event.stopPropagation(); bulkAdvanceCategory('${cat}')" title="Advance all items in ${cat}">Advance All</button>` : ''}
                </div>
            </div>
            <div class="packing-category-body open">
                ${catItems.map(item => {
                    const si = getStatusInfo(item.status);
                    const isLast = si.next === null;
                    return `
                    <div class="packing-item-row${isLast ? ' done' : ''}">
                        <button class="packing-status-badge status-${item.status}${isLast ? '' : ' advanceable'}" onclick="cyclePackingStatus('${item.id}')" title="${isLast ? 'At Venue' : 'Click to advance to ' + getStatusInfo(item.status).next}">
                            ${si.label}${isLast ? '' : ' ›'}
                        </button>
                        <div class="packing-item-info">
                            <span class="packing-item-name">${item.name || 'Unnamed'}</span>
                            ${item.quantity > 1 ? `<span class="packing-item-qty">×${item.quantity}</span>` : ''}
                        </div>
                        ${item.assignee ? `<span class="packing-item-assignee">${item.assignee}</span>` : ''}
                        ${item.notes ? `<span class="packing-item-notes" title="${item.notes.replace(/"/g, '&quot;')}">📋</span>` : ''}
                        <div class="packing-item-actions">
                            <button class="btn-icon-sm" onclick="openPackingModal('${item.id}')" title="Edit">✎</button>
                            <button class="btn-icon-sm delete" onclick="deletePackingItem('${item.id}')" title="Delete">✕</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

async function cyclePackingStatus(itemId) {
    const item = state.packingList.find(i => i.id === itemId);
    if (!item) return;

    const si = getStatusInfo(item.status);
    if (!si.next) {
        showToast('Already at venue', 'info');
        return;
    }

    try {
        await collections.packingList.doc(itemId).update({
            status: si.next,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        const nextLabel = getStatusInfo(si.next).label;
        showToast(`${item.name} → ${nextLabel}`);
    } catch (error) {
        console.error('Error updating packing status:', error);
        showToast('Error updating status', 'error');
    }
}

async function bulkAdvanceCategory(category) {
    const items = state.packingList.filter(i => i.category === category);
    const advanceable = items.filter(i => getStatusInfo(i.status).next !== null);

    if (advanceable.length === 0) {
        showToast('All items already at venue', 'info');
        return;
    }

    if (!confirm(`Advance ${advanceable.length} item(s) in ${category} to next status?`)) return;

    try {
        const batch = db.batch();
        advanceable.forEach(item => {
            const si = getStatusInfo(item.status);
            batch.update(collections.packingList.doc(item.id), {
                status: si.next,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        showToast(`Advanced ${advanceable.length} items in ${category}`);
    } catch (error) {
        console.error('Error bulk advancing:', error);
        showToast('Error advancing items', 'error');
    }
}

const PACKING_FIELD_MAP = {
    'packing-name': 'name',
    'packing-category': 'category',
    'packing-quantity': 'quantity',
    'packing-status': 'status',
    'packing-assignee': 'assignee',
    'packing-notes': 'notes'
};

function openPackingModal(itemId = null) {
    openModal({
        modalId: 'packing-modal',
        formId: 'packing-form',
        title: 'Packing Item',
        stateKey: 'packingList',
        itemId: itemId,
        idFieldId: 'packing-id',
        fieldMap: PACKING_FIELD_MAP,
        defaultValues: {
            'packing-status': 'to-pack',
            'packing-quantity': '1'
        }
    });
}

async function handlePackingSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'packingList',
        fieldMap: PACKING_FIELD_MAP,
        idFieldId: 'packing-id',
        itemName: 'packing item',
        numericFields: ['quantity']
    });
}

function handlePackingSearch(value) {
    state.packingSearch = value;
    const clearBtn = document.getElementById('packing-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderPackingList();
}

function clearPackingSearch() {
    state.packingSearch = '';
    const input = document.getElementById('packing-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('packing-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderPackingList();
}

function handlePackingCategoryFilter(value) {
    state.packingCategoryFilter = value;
    renderPackingList();
}

function handlePackingStatusFilter(value) {
    state.packingStatusFilter = value;
    renderPackingList();
}

function togglePackingCategory(category) {
    const section = document.querySelector(`.packing-category-section[data-category="${category}"]`);
    if (!section) return;
    const body = section.querySelector('.packing-category-body');
    const chevron = section.querySelector('.packing-chevron');
    if (body) body.classList.toggle('open');
    if (chevron) chevron.classList.toggle('collapsed');
}

window.deletePackingItem = createDeleteHandler('packingList', 'packing item');
window.openPackingModal = openPackingModal;
window.cyclePackingStatus = cyclePackingStatus;
window.bulkAdvanceCategory = bulkAdvanceCategory;
window.handlePackingSearch = handlePackingSearch;
window.clearPackingSearch = clearPackingSearch;
window.handlePackingCategoryFilter = handlePackingCategoryFilter;
window.handlePackingStatusFilter = handlePackingStatusFilter;
window.togglePackingCategory = togglePackingCategory;

// Export Staff to Excel
function exportStaffToExcel() {
    const data = state.staff.map(member => ({
        'Name': member.name || '',
        'Role': member.role || '',
        'Responsibilities': member.responsibilities || '',
        'Phone': member.phone || '',
        'Email': member.email || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 20 },  // Name
        { wch: 25 },  // Role
        { wch: 50 },  // Responsibilities
        { wch: 15 },  // Phone
        { wch: 30 }   // Email
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Staff_Contact_List_${today}.xlsx`);
}

// =============================================
// STAGE PLOTS FUNCTIONS
// =============================================

// Load Stage Plots from Firestore

// Initialize Stage Plots page
function initializeStagePlots() {
    console.log('initializeStagePlots called. Canvas exists:', !!state.canvas);
    if (!state.canvas) {
        setupCanvas();
    }
    updatePlotSelector();

    // Show a local draft canvas if no plot is selected (no Firestore write)
    setTimeout(() => {
        if (!state.currentPlotId) {
            console.log('No plot selected - creating local draft');
            createDraftPlot();
        }
    }, 200);
}

// Setup Fabric.js Canvas
function setupCanvas() {
    console.log('setupCanvas called');
    const canvasElement = document.getElementById('stage-canvas');
    if (!canvasElement) {
        console.log('ERROR: Canvas element not found!');
        return;
    }

    console.log('Canvas element found, initializing Fabric.js canvas');
    console.log('fabric object exists:', typeof fabric !== 'undefined');

    // Calculate responsive canvas size based on available space
    const canvasWrapper = document.querySelector('.canvas-wrapper');
    const maxWidth = canvasWrapper ? canvasWrapper.clientWidth - 80 : 1000; // Subtract padding
    const maxHeight = canvasWrapper ? canvasWrapper.clientHeight - 80 : 700; // Subtract padding

    // Use responsive size, but with reasonable limits
    const canvasWidth = Math.min(maxWidth, 1200);
    const canvasHeight = Math.min(maxHeight, 900);

    console.log('Calculated canvas size:', canvasWidth, 'x', canvasHeight);

    // Initialize Fabric.js canvas with responsive size
    state.canvas = new fabric.Canvas('stage-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: '#ffffff',
        selection: true
    });

    console.log('Fabric.js canvas created:', !!state.canvas);

    // Draw grid background
    drawGrid();

    // Initialize zoom display
    updateZoomDisplay();

    // Add event listeners for dirty tracking and auto-save
    state.canvas.on('object:modified', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine) {
            trackDirtyObject(obj);
            triggerAutoSave();
        }
    });

    state.canvas.on('object:added', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine) {
            assignObjectId(obj);
            trackDirtyObject(obj);
            triggerAutoSave();
        }
    });

    state.canvas.on('object:removed', (e) => {
        if (state.isReceivingRemote) return;
        const obj = e.target;
        if (obj && !obj.gridLine && obj.objectId) {
            state.deletedObjectIds.add(obj.objectId);
            state.dirtyObjectIds.delete(obj.objectId);
            triggerAutoSave();
        }
    });

    // Add double-click handler for editing element labels and dimension labels
    state.canvas.on('mouse:dblclick', (e) => {
        if (e.target && e.target.isStageElement) {
            editElementLabel(e.target);
        } else if (e.target && e.target.isRectDimension) {
            editRectangleDimension(e.target);
        }
    });

    // Setup undo/redo canvas event listeners
    state.canvas.on('object:added', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });
    state.canvas.on('object:modified', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });
    state.canvas.on('object:removed', (e) => {
        if (!state.isUndoRedoing && !state.isReceivingRemote) saveCanvasState();
    });

    // Properties panel: show/hide on selection
    state.canvas.on('selection:created', (e) => { showPropertiesPanel(e.selected); });
    state.canvas.on('selection:updated', (e) => { showPropertiesPanel(e.selected); });
    state.canvas.on('selection:cleared', () => { hidePropertiesPanel(); });

    // Track user interaction to prevent canvas resize during mouse operations
    state.canvas.on('mouse:down', () => {
        state.isInteracting = true;
    });
    state.canvas.on('mouse:up', () => {
        state.isInteracting = false;
    });

    // Add window resize handler for responsive canvas
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCanvas();
        }, 250); // Debounce resize events
    });

    // Initialize with draw tool active
    setTool('draw');
}

// Resize Canvas to Fit Viewport
function resizeCanvas() {
    if (!state.canvas) return;

    // Don't resize while user is actively interacting with canvas
    if (state.isInteracting) {
        console.log('Skipping canvas resize - user is interacting');
        return;
    }

    const canvasWrapper = document.querySelector('.canvas-wrapper');
    if (!canvasWrapper) return;

    const maxWidth = canvasWrapper.clientWidth - 80;
    const maxHeight = canvasWrapper.clientHeight - 80;

    const newWidth = Math.min(maxWidth, 1200);
    const newHeight = Math.min(maxHeight, 900);

    // Only resize if dimensions actually changed significantly
    if (Math.abs(state.canvas.width - newWidth) > 50 ||
        Math.abs(state.canvas.height - newHeight) > 50) {

        console.log('Resizing canvas to:', newWidth, 'x', newHeight);

        state.canvas.setDimensions({
            width: newWidth,
            height: newHeight
        });

        // Redraw grid with new size
        drawGrid();
        state.canvas.renderAll();
    }
}

// Draw grid on canvas
function drawGrid() {
    if (!state.canvas) return;

    // Use fixed dimensions for grid scale calculation
    const width = 40;  // Default width in feet
    const height = 30; // Default height in feet

    // Calculate pixels per foot (scale to fit canvas)
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    const pixelsPerFoot = Math.min(
        canvasWidth / width,
        canvasHeight / height
    );

    // Clear existing grid lines
    const objects = state.canvas.getObjects();
    objects.forEach(obj => {
        if (obj.gridLine) {
            state.canvas.remove(obj);
        }
    });

    // Account for zoom level - draw more grid lines when zoomed out
    const zoom = state.zoom || 1.0;
    const viewportWidth = canvasWidth / zoom;
    const viewportHeight = canvasHeight / zoom;

    // Calculate how many grid lines we need to cover the visible viewport
    const numVerticalLines = Math.ceil(viewportWidth / pixelsPerFoot) + 2;
    const numHorizontalLines = Math.ceil(viewportHeight / pixelsPerFoot) + 2;

    // Get viewport transform to know where we're viewing
    const vpt = state.canvas.viewportTransform;
    const viewportLeft = -vpt[4] / zoom;
    const viewportTop = -vpt[5] / zoom;

    // Calculate starting grid position (aligned to grid)
    const startX = Math.floor(viewportLeft / pixelsPerFoot) * pixelsPerFoot;
    const startY = Math.floor(viewportTop / pixelsPerFoot) * pixelsPerFoot;

    // Draw vertical grid lines
    for (let i = 0; i <= numVerticalLines; i++) {
        const x = startX + (i * pixelsPerFoot);
        const line = new fabric.Line([
            x, startY,
            x, startY + (numHorizontalLines * pixelsPerFoot)
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1 / zoom, // Adjust stroke width for zoom
            selectable: false,
            evented: false,
            gridLine: true
        });
        state.canvas.add(line);
        state.canvas.sendToBack(line);
    }

    // Draw horizontal grid lines
    for (let i = 0; i <= numHorizontalLines; i++) {
        const y = startY + (i * pixelsPerFoot);
        const line = new fabric.Line([
            startX, y,
            startX + (numVerticalLines * pixelsPerFoot), y
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1 / zoom, // Adjust stroke width for zoom
            selectable: false,
            evented: false,
            gridLine: true
        });
        state.canvas.add(line);
        state.canvas.sendToBack(line);
    }

    state.canvas.renderAll();
}

// Setup Stage Plot Tab Switching
function setupStagePlotTabs() {
    const stagePlotTabs = document.querySelectorAll('.day-tab[data-stage-type]');

    stagePlotTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const stageType = tab.dataset.stageType;

            // Update active state
            stagePlotTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update state
            state.currentStagePlotType = stageType;

            // Detach previous listener
            if (state.plotObjectsUnsubscribe) {
                state.plotObjectsUnsubscribe();
                state.plotObjectsUnsubscribe = null;
            }

            // Reset plot selection and update selector
            state.currentPlotId = null;
            state.dirtyObjectIds.clear();
            state.deletedObjectIds.clear();
            updatePlotSelector();

            // Clear canvas
            if (state.canvas) {
                state.canvas.clear();
                state.canvas.backgroundColor = '#ffffff';
                drawGrid();
            }
        });
    });
}

// Setup Stage Plot Controls
function setupStagePlotControls() {
    // Plot selector dropdown
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) {
        plotSelect.addEventListener('change', (e) => {
            const plotId = e.target.value;
            if (plotId) {
                // Discard draft silently when switching to an existing plot
                state.isDraftPlot = false;
                loadPlot(plotId);
            } else {
                // Detach listener
                if (state.plotObjectsUnsubscribe) {
                    state.plotObjectsUnsubscribe();
                    state.plotObjectsUnsubscribe = null;
                }

                // Clear canvas if no plot selected
                if (state.canvas) {
                    deleteStage();  // Clean up stage first
                    state.canvas.clear();
                    state.canvas.backgroundColor = '#ffffff';
                    drawGrid();
                }
                state.currentPlotId = null;
                state.dirtyObjectIds.clear();
                state.deletedObjectIds.clear();

                // Clear and disable plot name input
                const plotNameInput = document.getElementById('plot-name-input');
                if (plotNameInput) {
                    plotNameInput.value = '';
                    plotNameInput.disabled = true;
                }
            }
        });
    }

    // New plot button
    const newPlotBtn = document.getElementById('new-plot-btn');
    if (newPlotBtn) {
        newPlotBtn.addEventListener('click', createDraftPlot);
    }

    // Delete plot button
    const deletePlotBtn = document.getElementById('delete-plot-btn');
    if (deletePlotBtn) {
        deletePlotBtn.addEventListener('click', deletePlot);
    }

    // Duplicate plot button
    const duplicatePlotBtn = document.getElementById('duplicate-plot-btn');
    if (duplicatePlotBtn) {
        duplicatePlotBtn.addEventListener('click', duplicatePlot);
    }

    // Print button
    const printPlotBtn = document.getElementById('print-plot-btn');
    if (printPlotBtn) {
        printPlotBtn.addEventListener('click', printPlot);
    }

    // Element library buttons
    const elementButtons = document.querySelectorAll('.element-btn');
    elementButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const elementType = btn.dataset.element;
            addElementToCanvas(elementType);
        });
    });

    // Tool mode buttons
    const drawToolBtn = document.getElementById('draw-rect-tool-btn');
    const moveToolBtn = document.getElementById('move-tool-btn');

    if (drawToolBtn) {
        console.log('Draw tool button found, adding listener');
        drawToolBtn.addEventListener('click', () => {
            console.log('Draw tool button clicked');
            setTool('draw');
        });
    } else {
        console.log('WARNING: Draw tool button NOT found!');
    }

    if (moveToolBtn) {
        console.log('Move tool button found, adding listener');
        moveToolBtn.addEventListener('click', () => {
            console.log('Move tool button clicked');
            setTool('move');
        });
    } else {
        console.log('WARNING: Move tool button NOT found!');
    }

    // Toggle dimensions button
    const toggleDimsBtn = document.getElementById('toggle-dimensions-btn');
    if (toggleDimsBtn) {
        toggleDimsBtn.addEventListener('click', () => {
            state.dimensionsVisible = !state.dimensionsVisible;
            toggleDimsBtn.classList.toggle('active', state.dimensionsVisible);
            state.stageRectangles.forEach(rectData => {
                rectData.widthLabel.set({ visible: state.dimensionsVisible });
                rectData.heightLabel.set({ visible: state.dimensionsVisible });
            });
            if (state.canvas) state.canvas.renderAll();
        });
    }
}

// Update Plot Selector Dropdown
function updatePlotSelector() {
    const plotSelect = document.getElementById('plot-select');
    if (!plotSelect) return;

    // Filter plots by current stage type
    const filteredPlots = state.stagePlots.filter(
        plot => plot.stageType === state.currentStagePlotType
    );

    // Sort alphabetically by name
    filteredPlots.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Update dropdown
    plotSelect.innerHTML = '<option value="">Select a plot...</option>' +
        filteredPlots.map(plot =>
            `<option value="${plot.id}">${escapeHtml(plot.name)}</option>`
        ).join('');

    // Select current plot if any
    if (state.currentPlotId) {
        plotSelect.value = state.currentPlotId;
    }
}

// Create a local-only draft plot (no Firestore write until first meaningful action)
function createDraftPlot() {
    // Detach any existing plot listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    state.currentPlotId = null;
    state.isDraftPlot = true;
    state.undoStack = [];
    state.redoStack = [];
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();
    updateUndoRedoButtons();

    // Clear canvas and draw grid
    if (state.canvas) {
        state.canvas.clear();
        state.canvas.backgroundColor = '#ffffff';
        drawGrid();
    }

    // Set up plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = 'Untitled Plot';
        plotNameInput.disabled = false;
        setTimeout(() => {
            plotNameInput.focus();
            plotNameInput.select();
        }, 100);
    }

    // Reset plot selector to "Select a plot..."
    const plotSelect = document.getElementById('plot-select');
    if (plotSelect) {
        plotSelect.value = '';
    }

    updateSaveStatus('Draft (not saved)');
    console.log('Draft plot created locally');
}

// Promote a draft plot to a real Firestore document
async function promoteDraftPlot() {
    if (!state.isDraftPlot) return;

    const plotNameInput = document.getElementById('plot-name-input');
    const plotName = (plotNameInput && plotNameInput.value.trim()) || 'Untitled Plot';

    const plotData = {
        name: plotName,
        stageType: state.currentStagePlotType,
        width: 40,
        height: 30,
        schemaVersion: 2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await collections.stagePlots.add(plotData);
        state.currentPlotId = docRef.id;
        state.isDraftPlot = false;

        // Reload data to update dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Setup real-time listener
        setupPlotObjectsListener(docRef.id);

        console.log('Draft promoted to Firestore plot:', docRef.id);
        showToast('Plot saved');
    } catch (error) {
        console.error('Error promoting draft plot:', error);
        showToast('Error saving plot. Please try again.', 'error');
    }
}

// Create New Plot
async function createNewPlot() {
    // Create plot with default "Untitled Plot" name
    const plotName = 'Untitled Plot';

    // Use fixed dimensions
    const width = 40;
    const height = 30;

    const plotData = {
        name: plotName,
        stageType: state.currentStagePlotType,
        width: width,
        height: height,
        schemaVersion: 2,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await collections.stagePlots.add(plotData);
        state.currentPlotId = docRef.id;

        // Reload all data to update the dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Update plot name input and focus it for easy renaming
        const plotNameInput = document.getElementById('plot-name-input');
        if (plotNameInput) {
            plotNameInput.value = plotName;
            plotNameInput.disabled = false;
            // Focus and select all text so user can immediately type new name
            setTimeout(() => {
                plotNameInput.focus();
                plotNameInput.select();
            }, 100);
        }

        // Clear canvas and redraw grid
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.backgroundColor = '#ffffff';
            drawGrid();
        }

        // Clear undo/redo stacks for new plot
        state.undoStack = [];
        state.redoStack = [];
        state.dirtyObjectIds.clear();
        state.deletedObjectIds.clear();
        updateUndoRedoButtons();

        // Setup real-time listener for new plot
        setupPlotObjectsListener(docRef.id);

        // Save initial state
        setTimeout(() => {
            saveCanvasState();
        }, 100);

        updateSaveStatus('New plot created');
        showToast('New plot created');
    } catch (error) {
        console.error('Error creating plot:', error);
        showToast('Error creating plot. Please try again.', 'error');
    }
}

// Delete Plot
async function deletePlot() {
    if (!state.currentPlotId) {
        alert('Please select a plot to delete.');
        return;
    }

    const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
    if (!plot) return;

    if (!confirm(`Are you sure you want to delete "${plot.name}"?`)) {
        return;
    }

    try {
        // Detach listener
        if (state.plotObjectsUnsubscribe) {
            state.plotObjectsUnsubscribe();
            state.plotObjectsUnsubscribe = null;
        }

        // Delete subcollection objects
        const objectsSnap = await collections.stagePlots.doc(state.currentPlotId).collection('objects').get();
        const batch = firebase.firestore().batch();
        objectsSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        await collections.stagePlots.doc(state.currentPlotId).delete();

        // Clear current plot
        state.currentPlotId = null;

        // Clear canvas
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.backgroundColor = '#ffffff';
            drawGrid();
        }

        updateSaveStatus('Deleted');
        showToast('Plot deleted');
    } catch (error) {
        console.error('Error deleting plot:', error);
        showToast('Error deleting plot. Please try again.', 'error');
    }
}

// Duplicate Plot
async function duplicatePlot() {
    if (!state.currentPlotId) {
        alert('Please select a plot to duplicate.');
        return;
    }

    const originalPlot = state.stagePlots.find(p => p.id === state.currentPlotId);
    if (!originalPlot) return;

    const newName = prompt('Enter a name for the duplicated plot:', `${originalPlot.name} (Copy)`);
    if (!newName) return;

    try {
        // Create new plot with same data
        const duplicatedPlotData = {
            name: newName,
            stageType: originalPlot.stageType,
            width: originalPlot.width || 40,
            height: originalPlot.height || 30,
            schemaVersion: 2,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await collections.stagePlots.add(duplicatedPlotData);

        // Copy subcollection objects from original to new plot
        const objectsSnap = await collections.stagePlots.doc(originalPlot.id).collection('objects').get();
        if (objectsSnap.docs.length > 0) {
            const batch = firebase.firestore().batch();
            objectsSnap.docs.forEach(doc => {
                const newObjRef = collections.stagePlots.doc(docRef.id).collection('objects').doc();
                const data = doc.data();
                data.objectId = newObjRef.id;
                batch.set(newObjRef, data);
            });
            await batch.commit();
        } else if (originalPlot.canvasData) {
            // Old format: copy canvasData for migration on load
            await collections.stagePlots.doc(docRef.id).update({
                canvasData: originalPlot.canvasData,
                schemaVersion: null
            });
        }

        // Load the new duplicated plot
        state.currentPlotId = docRef.id;

        // Reload all plots to update dropdown
        await loadAllData();

        // Select the new plot in dropdown
        const plotSelect = document.getElementById('plot-select');
        if (plotSelect) {
            plotSelect.value = docRef.id;
        }

        // Load the plot
        loadPlot(docRef.id);

        updateSaveStatus('Duplicated');
        showToast('Plot duplicated');
    } catch (error) {
        console.error('Error duplicating plot:', error);
        showToast('Error duplicating plot. Please try again.', 'error');
    }
}

// Load Plot from Firestore
async function loadPlot(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;

    // Detach previous listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    state.currentPlotId = plotId;

    // Clear undo/redo stacks when loading a different plot
    state.undoStack = [];
    state.redoStack = [];
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();
    updateUndoRedoButtons();

    // Update plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = plot.name || '';
        plotNameInput.disabled = false;
    }

    // Clear canvas and delete existing stage
    if (state.canvas) {
        deleteStage();
        state.canvas.clear();
        state.canvas.backgroundColor = '#ffffff';
        drawGrid();

        if (plot.schemaVersion === 2) {
            // New format: load from subcollection
            await loadPlotFromSubcollection(plotId);
        } else if (plot.canvasData) {
            // Old format: migrate to subcollection
            await migrateOldPlotFormat(plotId, plot.canvasData);
        } else {
            // Empty plot
            setTool('draw');
            setTimeout(() => saveCanvasState(), 100);
        }

        // Setup real-time listener
        setupPlotObjectsListener(plotId);
    }

    updateSaveStatus('Loaded');
}

// Load plot objects from Firestore subcollection
async function loadPlotFromSubcollection(plotId) {
    const objectsSnap = await collections.stagePlots.doc(plotId).collection('objects').get();

    if (objectsSnap.empty) {
        setTool('draw');
        setTimeout(() => saveCanvasState(), 100);
        return;
    }

    const fabricObjects = [];
    objectsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.fabricData) {
            // Merge custom props back onto the fabric data
            const objData = { ...data.fabricData };
            objData.objectId = data.objectId;
            objData._zIndex = data.zIndex ?? 0;
            if (data.rectId) objData.rectId = data.rectId;
            fabricObjects.push(objData);
        }
    });

    // Sort by zIndex to preserve layer ordering across clients
    fabricObjects.sort((a, b) => a._zIndex - b._zIndex);

    if (fabricObjects.length === 0) {
        setTool('draw');
        setTimeout(() => saveCanvasState(), 100);
        return;
    }

    // Use enlivenObjects to deserialize
    state.isReceivingRemote = true;
    fabric.util.enlivenObjects(fabricObjects, (objects) => {
        objects.forEach(obj => {
            state.canvas.add(obj);
        });
        state.canvas.renderAll();
        drawGrid();
        rebuildStageRectangles();
        sendStageRectsToBack();
        setTool('draw');
        state.isReceivingRemote = false;
        setTimeout(() => saveCanvasState(), 100);
    });
}

// Migrate old canvasData blob to per-object subcollection
async function migrateOldPlotFormat(plotId, canvasData) {
    return new Promise((resolve) => {
        state.isReceivingRemote = true;
        state.canvas.loadFromJSON(canvasData, async () => {
            state.canvas.renderAll();
            drawGrid();
            rebuildStageRectangles();
            sendStageRectsToBack();

            // Assign objectIds and batch-write to subcollection
            const objects = state.canvas.getObjects().filter(o => !o.gridLine);
            const batch = firebase.firestore().batch();

            objects.forEach((obj, index) => {
                assignObjectId(obj);
                const objData = obj.toObject(CUSTOM_FABRIC_PROPS);
                const docRef = collections.stagePlots.doc(plotId).collection('objects').doc(obj.objectId);
                batch.set(docRef, {
                    objectId: obj.objectId,
                    fabricType: obj.type,
                    fabricData: objData,
                    rectId: obj.rectId || null,
                    zIndex: index,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: CLIENT_ID
                });
            });

            // Update plot document to mark as migrated
            const plotRef = collections.stagePlots.doc(plotId);
            batch.update(plotRef, {
                schemaVersion: 2,
                canvasData: firebase.firestore.FieldValue.delete()
            });

            await batch.commit();
            console.log(`Migrated plot ${plotId} to schema v2 with ${objects.length} objects`);

            setTool('draw');
            state.isReceivingRemote = false;
            setTimeout(() => saveCanvasState(), 100);
            resolve();
        });
    });
}

// Trigger Auto-Save (debounced)
function triggerAutoSave() {
    // Clear existing timeout
    if (state.autoSaveTimeout) {
        clearTimeout(state.autoSaveTimeout);
    }

    // If this is a draft plot, promote it first then save
    if (state.isDraftPlot) {
        updateSaveStatus('Saving...');
        state.autoSaveTimeout = setTimeout(async () => {
            await promoteDraftPlot();
            savePlot();
        }, 500);
        return;
    }

    // Set new timeout for 500ms
    state.autoSaveTimeout = setTimeout(() => {
        savePlot();
    }, 500);

    updateSaveStatus('Saving...');
}

// Save Plot to Firestore (per-object batch write)
async function savePlot() {
    if (state.isDraftPlot || !state.currentPlotId || !state.canvas) return;

    const dirtyIds = new Set(state.dirtyObjectIds);
    const deletedIds = new Set(state.deletedObjectIds);
    state.dirtyObjectIds.clear();
    state.deletedObjectIds.clear();

    if (dirtyIds.size === 0 && deletedIds.size === 0) {
        updateSaveStatus('Saved');
        return;
    }

    try {
        const batch = firebase.firestore().batch();
        const plotRef = collections.stagePlots.doc(state.currentPlotId);

        // Save dirty objects
        const allObjects = state.canvas.getObjects();
        const nonGridObjects = allObjects.filter(o => !o.gridLine);
        dirtyIds.forEach(objectId => {
            const obj = allObjects.find(o => o.objectId === objectId);
            if (obj && !obj.gridLine) {
                const objData = obj.toObject(CUSTOM_FABRIC_PROPS);
                const zIndex = nonGridObjects.indexOf(obj);
                const docRef = plotRef.collection('objects').doc(objectId);
                batch.set(docRef, {
                    objectId: objectId,
                    fabricType: obj.type,
                    fabricData: objData,
                    rectId: obj.rectId || null,
                    zIndex: zIndex,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: CLIENT_ID
                });
            }
        });

        // Delete removed objects
        deletedIds.forEach(objectId => {
            const docRef = plotRef.collection('objects').doc(objectId);
            batch.delete(docRef);
        });

        // Update plot timestamp
        batch.update(plotRef, {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        updateSaveStatus('Saved');
    } catch (error) {
        console.error('Error saving plot:', error);
        // Re-add failed items for retry
        dirtyIds.forEach(id => state.dirtyObjectIds.add(id));
        deletedIds.forEach(id => state.deletedObjectIds.add(id));
        updateSaveStatus('Error saving');
    }
}

// Update Save Status Indicator
function updateSaveStatus(status) {
    const saveStatus = document.getElementById('save-status');
    if (saveStatus) {
        saveStatus.textContent = status;

        // Auto-clear most messages after 2 seconds (except Saving... which gets replaced)
        if (status && status !== 'Saving...') {
            setTimeout(() => {
                // Only clear if the status hasn't changed to something else
                if (saveStatus.textContent === status) {
                    saveStatus.textContent = '';
                }
            }, 2000);
        }
    }
}

// Update Canvas Info - removed (dimension display no longer shown)

// Add Element to Canvas
function addElementToCanvas(elementType) {
    if (!state.canvas) return;

    const element = createStageElement(elementType);
    if (element) {
        // Position in center of canvas
        element.set({
            left: state.canvas.width / 2,
            top: state.canvas.height / 2,
            originX: 'center',
            originY: 'center'
        });

        // If in draw mode, add locked; otherwise add selectable
        if (state.currentTool === 'draw') {
            element.set({ selectable: false, evented: false });
            state.canvas.add(element);
        } else {
            state.canvas.add(element);
            state.canvas.setActiveObject(element);
        }
        sendStageRectsToBack();
    }
}

// Create Stage Element (Factory Function) - Using Emojis
function createStageElement(type) {
    const elementDefinitions = {
        // Audio
        'drum-kit': { emoji: '🥁', label: 'Drums' },
        'mic-stand': { emoji: '🎤', label: 'Mic' },
        'floor-monitor': { emoji: '🔊', label: 'Monitor' },
        'di-box': { emoji: '📦', label: 'DI' },
        'speaker-cab': { emoji: '🔈', label: 'Speaker' },

        // Instruments
        'keyboard-88': { emoji: '🎹', label: 'Piano' },
        'keyboard-61': { emoji: '🎹', label: 'Keyboard' },
        'pedalboard': { emoji: '🎛️', label: 'Pedalboard' },
        'guitar': { emoji: '🎸', label: 'Guitar' },
        'bass': { emoji: '🎸', label: 'Bass' },
        'guitar-amp': { emoji: '🔊', label: 'Guitar Amp' },
        'bass-amp': { emoji: '🔊', label: 'Bass Amp' },
        'music-stand': { emoji: '🎵', label: 'Stand' },

        // Furniture
        'table-round': { emoji: '⭕', label: 'Table' },
        'table-rect': { emoji: '🟫', label: 'Table' },
        'table': { emoji: '🟫', label: 'Table' },
        'chair': { emoji: '💺', label: 'Chair' },
        'stool': { emoji: '💺', label: 'Stool' },
        'podium': { emoji: '🗣️', label: 'Podium' },

        // Stage
        'riser': { emoji: '🔲', label: 'Riser' },
        'stage-riser': { emoji: '🔲', label: 'Riser' },
        'stairs': { emoji: '🪜', label: 'Stairs' },
        'backdrop': { emoji: '🎬', label: 'Backdrop' },

        // Technical
        'pa-speaker': { emoji: '📢', label: 'PA' },
        'spotlight': { emoji: '💡', label: 'Light' },
        'camera': { emoji: '📹', label: 'Camera' },
        'projection-screen': { emoji: '🖥️', label: 'Screen' },
        'mixer': { emoji: '🎚️', label: 'Mixer' },
        'mixer-console': { emoji: '🎚️', label: 'Mixer' },

        // Markers
        'performer': { emoji: '🧍', label: 'Person' },
        'text-label': { emoji: '📝', label: 'Label' },
        'rectangle': { emoji: '▭', label: 'Rectangle' },
        'arrow-marker': { emoji: '➡️', label: 'Arrow' },
        'x-marker': { emoji: '❌', label: 'X' },
        'star-marker': { emoji: '⭐', label: 'Star' }
    };

    const def = elementDefinitions[type];
    if (!def) return null;

    // Create emoji text with larger size and comprehensive font fallbacks
    const emojiText = new fabric.Text(def.emoji, {
        fontSize: 50,
        fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", Arial, sans-serif',
        fill: '#000000',
        textAlign: 'center',
        originX: 'center',
        originY: 'center'
    });

    // Create label text with background for better readability
    const labelText = new fabric.Text(def.label, {
        fontSize: 13,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: '#2c3e50',
        textAlign: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 4,
        top: 45,  // Increased spacing to prevent overlap
        originX: 'center',
        originY: 'center'
    });

    // Group emoji and label together
    const group = new fabric.Group([emojiText, labelText], {
        left: 0,
        top: 0,
        lockScalingFlip: true,
        hasRotatingPoint: true,
        cornerStyle: 'circle',
        transparentCorners: false,
        cornerColor: '#c9a961',
        cornerStrokeColor: '#000',
        borderColor: '#c9a961',
        isStageElement: true,  // Mark as editable element
        elementType: type  // Store element type
    });

    return group;
}

// Setup Zoom Controls
function setupZoomControls() {
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const fitScreenBtn = document.getElementById('fit-screen-btn');

    if (!zoomInBtn || !zoomOutBtn || !fitScreenBtn) return;

    // Zoom In
    zoomInBtn.addEventListener('click', () => {
        zoomCanvas(1.2); // Zoom in by 20%
    });

    // Zoom Out
    zoomOutBtn.addEventListener('click', () => {
        zoomCanvas(0.8); // Zoom out by 20%
    });

    // Fit to Screen
    fitScreenBtn.addEventListener('click', () => {
        fitCanvasToScreen();
    });

    // Mouse wheel zoom (hold Ctrl/Cmd to zoom)
    if (state.canvas) {
        state.canvas.on('mouse:wheel', (opt) => {
            const e = opt.e;

            // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();

                const delta = e.deltaY;
                let zoom = state.canvas.getZoom();

                // Zoom in or out based on scroll direction
                zoom *= 0.999 ** delta;

                // Limit zoom range
                if (zoom > 5) zoom = 5;
                if (zoom < 0.1) zoom = 0.1;

                // Zoom towards mouse pointer
                const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
                state.canvas.zoomToPoint(point, zoom);

                state.zoom = zoom;
                updateZoomDisplay();
                drawGrid(); // Redraw grid for new zoom level
            }
        });

        // Pan/drag canvas when zoomed in (using Space + drag or middle mouse button)
        state.canvas.on('mouse:down', (opt) => {
            const e = opt.e;

            // Enable panning with Space key or middle mouse button
            if (e.button === 1 || e.code === 'Space' || state.zoom > 1) {
                state.isPanning = true;
                state.panStart = { x: e.clientX, y: e.clientY };
                state.canvas.selection = false; // Disable selection while panning
            }
        });

        state.canvas.on('mouse:move', (opt) => {
            if (state.isPanning && state.panStart) {
                const e = opt.e;
                const vpt = state.canvas.viewportTransform;

                vpt[4] += e.clientX - state.panStart.x;
                vpt[5] += e.clientY - state.panStart.y;

                state.canvas.requestRenderAll();
                state.panStart = { x: e.clientX, y: e.clientY };
            }
        });

        state.canvas.on('mouse:up', () => {
            if (state.isPanning) {
                drawGrid(); // Redraw grid after panning
            }
            state.isPanning = false;
            state.panStart = null;
            state.canvas.selection = true; // Re-enable selection
        });
    }
}

// Zoom Canvas
function zoomCanvas(factor) {
    if (!state.canvas) return;

    let zoom = state.canvas.getZoom();
    zoom *= factor;

    // Limit zoom range
    if (zoom > 5) zoom = 5;
    if (zoom < 0.1) zoom = 0.1;

    // Zoom to center of canvas
    const center = state.canvas.getCenter();
    state.canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);

    state.zoom = zoom;
    updateZoomDisplay();
    drawGrid(); // Redraw grid for new zoom level
}

// Fit Canvas to Screen
function fitCanvasToScreen() {
    if (!state.canvas) return;

    // Reset zoom to 1.0 and center viewport
    state.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    state.zoom = 1.0;
    updateZoomDisplay();
    drawGrid(); // Redraw grid for reset zoom
    state.canvas.renderAll();
}

// Update Zoom Level Display
function updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) {
        const percentage = Math.round(state.zoom * 100);
        zoomDisplay.textContent = `${percentage}%`;
    }
}

// Undo/Redo Functionality
function saveCanvasState() {
    if (state.isUndoRedoing || state.isReceivingRemote || !state.canvas || !state.currentPlotId) return;

    const canvasState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.undoStack.push(JSON.stringify(canvasState));

    // Limit history to 30 states
    if (state.undoStack.length > 30) {
        state.undoStack.shift();
    }

    // Clear redo stack when new action is performed
    state.redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (state.undoStack.length === 0 || !state.canvas) return;

    // Save current state to redo stack
    const currentState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.redoStack.push(JSON.stringify(currentState));

    // Restore previous state
    const previousState = state.undoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(previousState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        rebuildStageRectangles();
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        syncAfterUndoRedo();
    });
}

function redo() {
    if (state.redoStack.length === 0 || !state.canvas) return;

    // Save current state to undo stack
    const currentState = state.canvas.toJSON(CUSTOM_FABRIC_PROPS);
    state.undoStack.push(JSON.stringify(currentState));

    // Restore next state
    const nextState = state.redoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(nextState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        rebuildStageRectangles();
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        syncAfterUndoRedo();
    });
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
        undoBtn.disabled = state.undoStack.length === 0;
    }
    if (redoBtn) {
        redoBtn.disabled = state.redoStack.length === 0;
    }
}

function setupUndoRedo() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) {
        undoBtn.addEventListener('click', undo);
    }
    if (redoBtn) {
        redoBtn.addEventListener('click', redo);
    }

    // Canvas event listeners are set up in canvas initialization
    // so they're attached when canvas is actually created
}

// Setup Keyboard Shortcuts (Delete key)
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Focus budget search with '/' key
        if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && state.currentPage === 'budget') {
            e.preventDefault();
            const searchInput = document.getElementById('budget-search-input');
            if (searchInput) searchInput.focus();
        }

        // Timeline: N to focus phantom row, Ctrl/Cmd+Z for undo
        if (state.currentPage === 'timeline' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                const phantom = document.querySelector('.tl-phantom-row');
                if (phantom) {
                    const firstCell = phantom.querySelector(`td[data-field="${TIMELINE_FIELD_ORDER[0]}"]`);
                    if (firstCell) editTimelineCell(firstCell);
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undoTimelineAction();
                return;
            }
        }

        // Undo: Ctrl+Z or Cmd+Z (stage plots)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                undo();
            }
        }

        // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                redo();
            }
        }

        // Delete or Backspace key
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.canvas) {
            // Prevent default backspace behavior (going back in browser)
            if (e.key === 'Backspace' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }

            // Only delete if we're not in an input field
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                const activeObjects = state.canvas.getActiveObjects();
                if (activeObjects.length > 0) {
                    activeObjects.forEach(obj => {
                        // If this is a stage rectangle, also remove its dimension labels
                        if (obj.rectId) {
                            const rectDataIndex = state.stageRectangles.findIndex(r => r.id === obj.rectId);
                            if (rectDataIndex !== -1) {
                                const rectData = state.stageRectangles[rectDataIndex];
                                state.canvas.remove(rectData.widthLabel);
                                state.canvas.remove(rectData.heightLabel);
                                state.canvas.remove(rectData.rect);
                                state.stageRectangles.splice(rectDataIndex, 1);
                            }
                        }
                        state.canvas.remove(obj);
                    });
                    state.canvas.discardActiveObject();
                    state.canvas.renderAll();
                    triggerAutoSave();
                }
            }
        }

        // Escape key - cancel drawing mode
        if (e.key === 'Escape' && state.isDrawingStage) {
            cancelDrawingMode();
        }

        // Enter key - finish drawing
        if (e.key === 'Enter' && state.isDrawingStage) {
            finishDrawingStage();
        }
    });
}

// =============================================
// RECTANGLE-BASED STAGE DRAWING SYSTEM
// =============================================

// Toggle Drawing Mode (Rectangle-based)
function toggleDrawingMode() {
    console.log('toggleDrawingMode called, canvas exists:', !!state.canvas);
    if (!state.canvas) return;

    state.isDrawingStage = !state.isDrawingStage;
    console.log('isDrawingStage set to:', state.isDrawingStage);

    const drawBtn = document.getElementById('draw-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (state.isDrawingStage) {
        // Enter rectangle drawing mode
        drawBtn.style.display = 'none';
        finishBtn.style.display = 'inline-block';

        // Show tool mode toggle
        const toolModeContainer = document.getElementById('tool-mode-container');
        if (toolModeContainer) {
            toolModeContainer.style.display = 'flex';
        }

        // Disable selection of existing elements
        state.canvas.selection = false;
        state.canvas.forEachObject(obj => {
            if (!obj.gridLine && !obj.isRectDimension) {
                obj.selectable = false;
            }
        });

        // Set initial tool to draw
        console.log('About to call setTool(draw)');
        setTool('draw');
    } else {
        cancelDrawingMode();
    }
}

// Set Tool Mode (Draw or Move)
function setTool(tool) {
    console.log('setTool called with:', tool);
    state.currentTool = tool;

    // Update button active states
    const drawBtn = document.getElementById('draw-rect-tool-btn');
    const moveBtn = document.getElementById('move-tool-btn');

    if (drawBtn && moveBtn) {
        drawBtn.classList.remove('active');
        moveBtn.classList.remove('active');

        if (tool === 'draw') {
            drawBtn.classList.add('active');
        } else {
            moveBtn.classList.add('active');
        }
    }

    // Remove all existing tool handlers
    state.canvas.off('mouse:down', startDrawingRectangle);
    state.canvas.off('mouse:move', continueDrawingRectangle);
    state.canvas.off('mouse:up', finishDrawingRectangle);

    // Make all stage rectangles non-selectable first
    state.stageRectangles.forEach(rectData => {
        rectData.rect.set({ selectable: false, evented: false });
        rectData.widthLabel.set({ selectable: false, evented: false });
        rectData.heightLabel.set({ selectable: false, evented: false });
    });

    if (tool === 'draw') {
        // Drawing mode: click and drag creates rectangles, nothing is movable
        state.canvas.on('mouse:down', startDrawingRectangle);
        state.canvas.on('mouse:move', continueDrawingRectangle);
        state.canvas.on('mouse:up', finishDrawingRectangle);

        // Lock all non-grid, non-stage objects so they can't be moved
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine && !obj.rectId) {
                obj.set({ selectable: false, evented: false });
            }
        });
        state.canvas.selection = false;
        state.canvas.discardActiveObject();
    } else if (tool === 'move') {
        // Move mode: everything is movable, no drawing
        state.stageRectangles.forEach((rectData, index) => {
            rectData.rect.set({
                selectable: true,
                evented: true,
                hasControls: false,
                hasBorders: true,
                borderColor: '#c9a961',
                lockRotation: true
            });

            // CRITICAL: Update the object's bounding box for hit detection
            rectData.rect.setCoords();

            // Add moving event handler for snap-to-align
            rectData.rect.on('moving', function(e) {
                snapRectangleToAlign(rectData);
                updateRectangleDimensions(rectData);
            });

            // Make dimension labels selectable for editing
            rectData.widthLabel.set({ selectable: true, evented: true });
            rectData.heightLabel.set({ selectable: true, evented: true });
        });

        // Unlock all non-grid objects so they can be moved
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine) {
                obj.set({ selectable: true, evented: true });
                obj.setCoords();
            }
        });
        state.canvas.selection = true;
    }

    state.canvas.renderAll();
}

// Rebuild stageRectangles array from current canvas objects (after loadFromJSON)
function rebuildStageRectangles() {
    if (!state.canvas) return;
    const rectMap = new Map();

    state.canvas.getObjects().forEach(obj => {
        if (obj.rectId) {
            if (!rectMap.has(obj.rectId)) {
                rectMap.set(obj.rectId, { id: obj.rectId });
            }
            const rectData = rectMap.get(obj.rectId);
            if (obj.type === 'rect' && !obj.isRectDimension) {
                rectData.rect = obj;
            } else if (obj.isRectDimension) {
                if (obj.dimensionType === 'width') rectData.widthLabel = obj;
                else if (obj.dimensionType === 'height') rectData.heightLabel = obj;
            }
        }
    });

    state.stageRectangles = Array.from(rectMap.values()).filter(
        r => r.rect && r.widthLabel && r.heightLabel
    );

    state.stageRectangles.forEach(rectData => {
        rectData.widthLabel.set({ evented: true, hoverCursor: 'pointer', visible: state.dimensionsVisible });
        rectData.heightLabel.set({ evented: true, hoverCursor: 'pointer', visible: state.dimensionsVisible });
    });
}

// Ensure stage rectangles and their labels stay behind all other elements (but above grid)
function sendStageRectsToBack() {
    if (!state.canvas) return;
    state.stageRectangles.forEach(rectData => {
        state.canvas.sendToBack(rectData.heightLabel);
        state.canvas.sendToBack(rectData.widthLabel);
        state.canvas.sendToBack(rectData.rect);
    });
    // Grid lines should be at the very back
    state.canvas.getObjects().forEach(obj => {
        if (obj.gridLine) state.canvas.sendToBack(obj);
    });
    state.canvas.renderAll();
    // Mark all non-grid objects dirty so updated zIndex gets saved
    if (!state.isReceivingRemote) {
        state.canvas.getObjects().forEach(obj => {
            if (!obj.gridLine && obj.objectId) {
                state.dirtyObjectIds.add(obj.objectId);
            }
        });
    }
}

// Start Drawing a Rectangle
function startDrawingRectangle(e) {
    if (state.currentTool !== 'draw' || state.currentDrawingRect) {
        return;
    }

    const pointer = state.canvas.getPointer(e.e);
    state.drawingStartPoint = { x: pointer.x, y: pointer.y };

    // Get pixels per foot for live dimension display
    const width = 40;
    const height = 30;
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    const pixelsPerFoot = Math.min(canvasWidth / width, canvasHeight / height);

    // Create temporary rectangle with fill properties
    const defaultStroke = state.defaultRectStroke || '#c9a961';
    const defaultFillColor = state.defaultFillColor || '#c9a961';
    const defaultFillOpacity = state.defaultFillOpacity || 0.2;
    const rgb = hexToRgb(defaultFillColor);

    state.currentDrawingRect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${defaultFillOpacity})`,
        stroke: defaultStroke,
        strokeWidth: 3,
        selectable: false,
        evented: false,
        pixelsPerFoot: pixelsPerFoot,
        fillEnabled: true,
        fillColor: defaultFillColor,
        fillOpacity: defaultFillOpacity
    });

    state.canvas.add(state.currentDrawingRect);
}

// Continue Drawing Rectangle (mouse move)
function continueDrawingRectangle(e) {
    if (!state.currentDrawingRect || !state.drawingStartPoint) return;

    const pointer = state.canvas.getPointer(e.e);
    const startX = state.drawingStartPoint.x;
    const startY = state.drawingStartPoint.y;

    // Calculate rectangle dimensions
    const width = pointer.x - startX;
    const height = pointer.y - startY;

    // Update rectangle (handle negative dimensions for reverse dragging)
    if (width > 0) {
        state.currentDrawingRect.set({ left: startX, width: width });
    } else {
        state.currentDrawingRect.set({ left: pointer.x, width: Math.abs(width) });
    }

    if (height > 0) {
        state.currentDrawingRect.set({ top: startY, height: height });
    } else {
        state.currentDrawingRect.set({ top: pointer.y, height: Math.abs(height) });
    }

    state.canvas.renderAll();
}

// Finish Drawing Rectangle (mouse up)
function finishDrawingRectangle(e) {
    if (!state.currentDrawingRect) return;

    const rect = state.currentDrawingRect;

    // Only create if rectangle has meaningful size (> 10 pixels)
    if (rect.width < 10 || rect.height < 10) {
        state.canvas.remove(rect);
        state.currentDrawingRect = null;
        state.drawingStartPoint = null;
        return;
    }

    // Get pixels per foot
    const pixelsPerFoot = rect.pixelsPerFoot;

    // Calculate dimensions in feet
    const widthFeet = rect.width / pixelsPerFoot;
    const heightFeet = rect.height / pixelsPerFoot;

    // Create dimension labels using rect's stroke color
    const labelColor = rect.stroke || '#c9a961';

    const widthLabel = new fabric.Text(feetToFeetInches(widthFeet), {
        left: rect.left + rect.width / 2,
        top: rect.top - 15,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: labelColor,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        isRectDimension: true,
        dimensionType: 'width'
    });

    const heightLabel = new fabric.Text(feetToFeetInches(heightFeet), {
        left: rect.left - 15,
        top: rect.top + rect.height / 2,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: labelColor,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        angle: -90,
        selectable: false,
        evented: true,
        hoverCursor: 'pointer',
        isRectDimension: true,
        dimensionType: 'height'
    });

    widthLabel.set({ visible: state.dimensionsVisible });
    heightLabel.set({ visible: state.dimensionsVisible });
    state.canvas.add(widthLabel);
    state.canvas.add(heightLabel);

    // Store rectangle with its labels
    const rectId = 'rect_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    rect.set({ rectId: rectId });
    widthLabel.set({ rectId: rectId });
    heightLabel.set({ rectId: rectId });

    state.stageRectangles.push({
        id: rectId,
        rect: rect,
        widthLabel: widthLabel,
        heightLabel: heightLabel
    });

    // Reset for next rectangle
    state.currentDrawingRect = null;
    state.drawingStartPoint = null;

    sendStageRectsToBack();
}

// Convert decimal feet to feet and inches format
function feetToFeetInches(decimalFeet) {
    const feet = Math.floor(decimalFeet);
    const inches = Math.round((decimalFeet - feet) * 12);

    // Handle case where inches rounds to 12
    if (inches === 12) {
        return `${feet + 1}'0"`;
    } else if (inches === 0) {
        return `${feet}'0"`;
    } else {
        return `${feet}'${inches}"`;
    }
}

// Convert feet-inches format to decimal feet
function feetInchesToFeet(feetInchesStr) {
    // Parse formats like "20'6\"" or "20' 6\"" or just "20"
    const match = feetInchesStr.match(/(\d+)(?:'|ft)?\s*(\d+)?(?:"|in)?/);
    if (!match) return null;

    const feet = parseInt(match[1]) || 0;
    const inches = parseInt(match[2]) || 0;

    return feet + (inches / 12);
}

// Parse feet-inches format or decimal feet to decimal
function parseFeetInches(input) {
    // Remove extra spaces
    input = input.trim();

    // Try to match feet-inches format: 20'6" or 20' 6" or 20ft 6in
    const feetInchesPattern = /(\d+)['ft]?\s*(\d+)?["in]?/i;
    const match = input.match(feetInchesPattern);

    if (match) {
        const feet = parseInt(match[1]) || 0;
        const inches = parseInt(match[2]) || 0;
        return feet + (inches / 12);
    }

    // Otherwise, try to parse as decimal
    const decimal = parseFloat(input);
    if (!isNaN(decimal)) {
        return decimal;
    }

    return null;
}


// Finish Drawing Stage
// Finish Drawing/Editing and Switch to Move Mode
function finishDrawingStage() {
    // Handle both drawing mode and editing mode
    if (!state.isDrawingStage && !state.isEditingStage) return;

    if (state.stageRectangles.length === 0) {
        alert('Please draw at least one rectangle for the stage.');
        return;
    }

    console.log('Finishing drawing stage, switching to move mode');

    // Hide the Finish button (keep tool toggle visible)
    const finishBtn = document.getElementById('finish-drawing-btn');
    if (finishBtn) finishBtn.style.display = 'none';

    // Switch to move mode so user can immediately move rectangles
    setTool('move');

    state.canvas.renderAll();
    triggerAutoSave();
}


// Edit Element Label (Double-click handler)
function editElementLabel(elementGroup) {
    if (!elementGroup || !elementGroup.isStageElement) return;

    // Get the label object from the group (it's the second item, index 1)
    const objects = elementGroup.getObjects();
    const labelObj = objects[1];  // Index 0 is emoji, index 1 is label

    if (!labelObj) return;

    const currentLabel = labelObj.text;

    // Prompt for new label
    const newLabel = prompt('Enter new label for this element:', currentLabel);
    if (!newLabel || newLabel === currentLabel) return;  // User cancelled or no change

    // Update the label text
    labelObj.set('text', newLabel);

    // Mark as dirty and re-render
    elementGroup.dirty = true;
    elementGroup.setCoords();
    state.canvas.renderAll();
    triggerAutoSave();
    updateSaveStatus('Label updated');
}

// Edit Rectangle Dimension (Double-click on dimension label)
function editRectangleDimension(dimensionLabel) {
    if (!dimensionLabel || !dimensionLabel.isRectDimension) return;

    const rectId = dimensionLabel.rectId;
    const dimensionType = dimensionLabel.dimensionType; // 'width' or 'height'

    // Find the rectangle data
    const rectData = state.stageRectangles.find(r => r.id === rectId);
    if (!rectData) return;

    const rect = rectData.rect;
    const pixelsPerFoot = rect.pixelsPerFoot || 20; // fallback

    // Get current dimension in feet
    const currentFeet = dimensionType === 'width'
        ? rect.width / pixelsPerFoot
        : rect.height / pixelsPerFoot;
    const currentDimensionStr = feetToFeetInches(currentFeet);

    // Prompt for new dimension
    const newDimensionStr = prompt(
        `Enter new ${dimensionType} (e.g., "20'6\"" or "20' 6\"" or "20"):`,
        currentDimensionStr
    );

    if (!newDimensionStr || newDimensionStr === currentDimensionStr) return;

    // Parse new dimension
    const newFeet = feetInchesToFeet(newDimensionStr);
    if (newFeet === null || newFeet <= 0) {
        alert('Invalid dimension format. Please use format like "20\'6\"" or "20"');
        return;
    }

    const newPixels = newFeet * pixelsPerFoot;

    // Resize the rectangle
    if (dimensionType === 'width') {
        rect.set({ width: newPixels });
    } else {
        rect.set({ height: newPixels });
    }

    // Update coordinates
    rect.setCoords();

    // Update dimension labels
    updateRectangleDimensionLabels(rectData);

    state.canvas.renderAll();
    triggerAutoSave();
    updateSaveStatus('Updated');
}

// Update Rectangle Dimension Label Positions and Text
function updateRectangleDimensionLabels(rectData) {
    const rect = rectData.rect;
    const pixelsPerFoot = rect.pixelsPerFoot || 20;

    // Calculate dimensions in feet
    const widthFeet = rect.width / pixelsPerFoot;
    const heightFeet = rect.height / pixelsPerFoot;

    // Update width label
    rectData.widthLabel.set({
        text: feetToFeetInches(widthFeet),
        left: rect.left + rect.width / 2,
        top: rect.top - 15
    });

    // Update height label
    rectData.heightLabel.set({
        text: feetToFeetInches(heightFeet),
        left: rect.left - 15,
        top: rect.top + rect.height / 2
    });
}

// Unlock Stage for Editing
// Unlock Stage - Enter Drag/Edit Mode
function unlockStage() {
    if (state.stageRectangles.length === 0) return;

    state.stageLocked = false;
    state.isDrawingStage = true;  // Reuse drawing mode flag for tool system

    // Show tool mode toggle
    const toolModeContainer = document.getElementById('tool-mode-container');
    if (toolModeContainer) {
        toolModeContainer.style.display = 'flex';
    }

    // Hide Edit button, show Finish button
    const editBtn = document.getElementById('edit-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (editBtn) editBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'inline-block';

    // Set initial tool to move mode
    setTool('move');
}

// Snap Rectangle to Align with Other Rectangles
function snapRectangleToAlign(movingRectData) {
    const movingRect = movingRectData.rect;
    const snapDist = state.snapDistance;

    // Get edges of moving rectangle
    const movingLeft = movingRect.left;
    const movingRight = movingRect.left + movingRect.width;
    const movingTop = movingRect.top;
    const movingBottom = movingRect.top + movingRect.height;

    // Check against all other rectangles
    state.stageRectangles.forEach(otherRectData => {
        if (otherRectData.id === movingRectData.id) return;

        const otherRect = otherRectData.rect;
        const otherLeft = otherRect.left;
        const otherRight = otherRect.left + otherRect.width;
        const otherTop = otherRect.top;
        const otherBottom = otherRect.top + otherRect.height;

        // Snap left edge to other's right edge
        if (Math.abs(movingLeft - otherRight) < snapDist) {
            movingRect.set({ left: otherRight });
        }
        // Snap right edge to other's left edge
        if (Math.abs(movingRight - otherLeft) < snapDist) {
            movingRect.set({ left: otherLeft - movingRect.width });
        }
        // Snap left edges together
        if (Math.abs(movingLeft - otherLeft) < snapDist) {
            movingRect.set({ left: otherLeft });
        }
        // Snap right edges together
        if (Math.abs(movingRight - otherRight) < snapDist) {
            movingRect.set({ left: otherRight - movingRect.width });
        }

        // Snap top edge to other's bottom edge
        if (Math.abs(movingTop - otherBottom) < snapDist) {
            movingRect.set({ top: otherBottom });
        }
        // Snap bottom edge to other's top edge
        if (Math.abs(movingBottom - otherTop) < snapDist) {
            movingRect.set({ top: otherTop - movingRect.height });
        }
        // Snap top edges together
        if (Math.abs(movingTop - otherTop) < snapDist) {
            movingRect.set({ top: otherTop });
        }
        // Snap bottom edges together
        if (Math.abs(movingBottom - otherBottom) < snapDist) {
            movingRect.set({ top: otherBottom - movingRect.height });
        }
    });
}

// Update Rectangle Dimension Labels After Move
function updateRectangleDimensions(rectData) {
    const rect = rectData.rect;

    // Update width label position
    rectData.widthLabel.set({
        left: rect.left + rect.width / 2,
        top: rect.top - 15
    });

    // Update height label position
    rectData.heightLabel.set({
        left: rect.left - 15,
        top: rect.top + rect.height / 2
    });
}

// Delete All Stage Rectangles (called when clearing canvas or loading new plot)
function deleteStage() {
    state.stageRectangles.forEach(rectData => {
        state.canvas.remove(rectData.rect);
        state.canvas.remove(rectData.widthLabel);
        state.canvas.remove(rectData.heightLabel);
    });

    state.stageRectangles = [];
    state.stageLocked = false;
    state.isEditingStage = false;

    // Reset buttons
    const drawBtn = document.getElementById('draw-stage-btn');
    const editBtn = document.getElementById('edit-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (drawBtn) drawBtn.style.display = 'inline-block';
    if (editBtn) editBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'none';
}

// Cancel Drawing/Editing Mode
function cancelDrawingMode() {
    state.isDrawingStage = false;
    state.isEditingStage = false;
    state.currentTool = null;

    // Remove any in-progress rectangle
    if (state.currentDrawingRect) {
        state.canvas.remove(state.currentDrawingRect);
        state.currentDrawingRect = null;
    }
    state.drawingStartPoint = null;

    // Remove mouse handlers
    state.canvas.off('mouse:down', startDrawingRectangle);
    state.canvas.off('mouse:move', continueDrawingRectangle);
    state.canvas.off('mouse:up', finishDrawingRectangle);

    // Hide tool mode toggle
    const toolModeContainer = document.getElementById('tool-mode-container');
    if (toolModeContainer) {
        toolModeContainer.style.display = 'none';
    }

    // Re-enable selection for elements (but NOT grid lines!)
    state.canvas.selection = true;
    state.canvas.forEachObject(obj => {
        if (!obj.isRectDimension && !obj.locked && !obj.gridLine) {
            obj.selectable = true;
        }
        // Make absolutely sure grid lines stay locked
        if (obj.gridLine) {
            obj.selectable = false;
            obj.evented = false;
        }
    });

    const drawBtn = document.getElementById('draw-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (drawBtn && finishBtn) {
        drawBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
    }

    updateSaveStatus('');
}

// Setup Plot Name Input
function setupPlotNameInput() {
    const plotNameInput = document.getElementById('plot-name-input');
    if (!plotNameInput) return;

    // Update plot name on blur
    plotNameInput.addEventListener('blur', async () => {
        const newName = plotNameInput.value.trim();
        if (!newName) {
            alert('Plot name cannot be empty');
            if (state.isDraftPlot) {
                plotNameInput.value = 'Untitled Plot';
            } else {
                const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
                if (plot) {
                    plotNameInput.value = plot.name;
                }
            }
            return;
        }

        // Promote draft if user typed a non-default name
        if (state.isDraftPlot && newName !== 'Untitled Plot') {
            await promoteDraftPlot();
            return;
        }

        if (!state.currentPlotId) return;

        try {
            await collections.stagePlots.doc(state.currentPlotId).update({
                name: newName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update the plot in local state
            const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
            if (plot) {
                plot.name = newName;
            }

            // Update the dropdown to show the new name
            updatePlotSelector();

            updateSaveStatus('Renamed');
            showToast('Plot renamed');
        } catch (error) {
            console.error('Error updating plot name:', error);
            showToast('Error updating plot name. Please try again.', 'error');
        }
    });

    // Update on Enter key
    plotNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            plotNameInput.blur();
        }
    });
}

// Print Plot
function printPlot() {
    if (!state.canvas) return;

    // Export canvas as data URL
    const dataURL = state.canvas.toDataURL({
        format: 'png',
        quality: 1.0,
        multiplier: 2  // Higher resolution for printing
    });

    // Create a new window for printing
    const printWindow = window.open('', '_blank');

    // Use fixed dimensions
    const width = 40;
    const height = 30;
    const plotName = state.currentPlotId ?
        state.stagePlots.find(p => p.id === state.currentPlotId)?.name || 'Untitled Plot' :
        'Untitled Plot';
    const stageTypeName = state.currentStagePlotType === 'main' ? 'Main Stage' : 'Cocktail Stage';
    const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${plotName} - ${stageTypeName}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', 'Arial', sans-serif;
                    padding: 40px;
                    background: white;
                }
                .header {
                    border-bottom: 3px solid #c9a961;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .event-title {
                    color: #2c3e50;
                    font-size: 24px;
                    font-weight: 300;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                h1 {
                    color: #c9a961;
                    font-size: 32px;
                    margin-bottom: 8px;
                    font-weight: 600;
                }
                .subtitle {
                    color: #7f8c8d;
                    font-size: 16px;
                    margin-bottom: 5px;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .info-item {
                    text-align: center;
                }
                .info-label {
                    font-size: 12px;
                    color: #7f8c8d;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 5px;
                }
                .info-value {
                    font-size: 18px;
                    color: #2c3e50;
                    font-weight: 600;
                }
                .plot-container {
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    padding: 20px;
                    background: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                img {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 4px;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    color: #95a5a6;
                }
                .footer-left {
                    font-style: italic;
                }
                .footer-right {
                    text-align: right;
                }
                @media print {
                    body {
                        padding: 20px;
                    }
                    .plot-container {
                        box-shadow: none;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="event-title">YMU Gala 2026</div>
                <h1>${plotName}</h1>
                <div class="subtitle">${stageTypeName} Plot</div>
            </div>

            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Event Date</div>
                    <div class="info-value">April 25, 2026</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Stage Dimensions</div>
                    <div class="info-value">${width}' × ${height}'</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Scale</div>
                    <div class="info-value">1 ft = 1 grid</div>
                </div>
            </div>

            <div class="plot-container">
                <img src="${dataURL}" alt="Stage Plot">
            </div>

            <div class="footer">
                <div class="footer-left">
                    Young Musicians Unite • 2026 Gala Event
                </div>
                <div class="footer-right">
                    Printed: ${today}
                </div>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();

    // Wait for image to load then print
    printWindow.onload = () => {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

// =============================================
// REAL-TIME COLLABORATION HELPERS
// =============================================

// Assign a unique objectId to a Fabric object if it doesn't have one
function assignObjectId(obj) {
    if (!obj.objectId && !obj.gridLine) {
        obj.objectId = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Mark an object (and related rect labels) as dirty
function trackDirtyObject(obj) {
    if (!obj || obj.gridLine) return;
    assignObjectId(obj);
    state.dirtyObjectIds.add(obj.objectId);

    // If it's a rect, also mark its dimension labels
    if (obj.rectId) {
        const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
        if (rectData) {
            if (rectData.widthLabel && rectData.widthLabel !== obj) {
                assignObjectId(rectData.widthLabel);
                state.dirtyObjectIds.add(rectData.widthLabel.objectId);
            }
            if (rectData.heightLabel && rectData.heightLabel !== obj) {
                assignObjectId(rectData.heightLabel);
                state.dirtyObjectIds.add(rectData.heightLabel.objectId);
            }
            if (rectData.rect && rectData.rect !== obj) {
                assignObjectId(rectData.rect);
                state.dirtyObjectIds.add(rectData.rect.objectId);
            }
        }
    }
}

// Setup real-time listener for plot objects subcollection
function setupPlotObjectsListener(plotId) {
    // Detach previous listener
    if (state.plotObjectsUnsubscribe) {
        state.plotObjectsUnsubscribe();
        state.plotObjectsUnsubscribe = null;
    }

    const unsubscribe = collections.stagePlots.doc(plotId).collection('objects')
        .onSnapshot((snapshot) => {
            if (!state.canvas || state.currentPlotId !== plotId) return;

            const remoteChanges = snapshot.docChanges().filter(c => c.doc.data().updatedBy !== CLIENT_ID);
            if (remoteChanges.length > 0) {
                state.isReceivingRemote = true;

                remoteChanges.forEach(change => {
                    const data = change.doc.data();
                    if (change.type === 'added' || change.type === 'modified') {
                        applyRemoteObject(data);
                    } else if (change.type === 'removed') {
                        removeRemoteObject(data.objectId);
                    }
                });

                state.canvas.renderAll();
                state.isReceivingRemote = false;
            }
        }, (error) => {
            console.error('Error listening to plot objects:', error);
        });

    state.plotObjectsUnsubscribe = unsubscribe;
}

// Apply a remote object change to the canvas
function applyRemoteObject(data) {
    if (!data.fabricData || !data.objectId) return;

    // Find existing object on canvas
    const existing = state.canvas.getObjects().find(o => o.objectId === data.objectId);

    if (existing) {
        // Update existing object properties
        const fabricData = data.fabricData;
        existing.set(fabricData);
        existing.setCoords();
    } else {
        // Create new object from fabric data
        const objData = { ...data.fabricData, objectId: data.objectId };
        if (data.rectId) objData.rectId = data.rectId;

        fabric.util.enlivenObjects([objData], (objects) => {
            objects.forEach(obj => {
                // Insert at correct z-position based on stored zIndex
                const targetZIndex = data.zIndex;
                if (targetZIndex != null) {
                    const nonGridObjects = state.canvas.getObjects().filter(o => !o.gridLine);
                    const gridCount = state.canvas.getObjects().filter(o => o.gridLine).length;
                    // Clamp insertion index: gridCount offset + position among non-grid objects
                    const insertAt = Math.min(gridCount + targetZIndex, state.canvas.getObjects().length);
                    state.canvas.insertAt(obj, insertAt);
                } else {
                    state.canvas.add(obj);
                }
            });
            // Rebuild stage rectangles if rect-related
            if (data.rectId) {
                rebuildStageRectangles();
                sendStageRectsToBack();
            }
        });
    }
}

// Remove a remote object from the canvas
function removeRemoteObject(objectId) {
    if (!objectId) return;
    const obj = state.canvas.getObjects().find(o => o.objectId === objectId);
    if (obj) {
        // If it's a rect, also remove related labels
        if (obj.rectId) {
            const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
            if (rectData) {
                if (rectData.widthLabel) state.canvas.remove(rectData.widthLabel);
                if (rectData.heightLabel) state.canvas.remove(rectData.heightLabel);
                if (rectData.rect) state.canvas.remove(rectData.rect);
                state.stageRectangles = state.stageRectangles.filter(r => r.id !== obj.rectId);
                return;
            }
        }
        state.canvas.remove(obj);
    }
}

// After undo/redo, sync entire canvas state to Firestore
async function syncAfterUndoRedo() {
    if (!state.currentPlotId || !state.canvas) return;

    state.isReceivingRemote = true;

    // Get all current canvas objects (non-grid)
    const canvasObjects = state.canvas.getObjects().filter(o => !o.gridLine);
    const canvasObjectIds = new Set();

    // Assign IDs and mark all as dirty
    canvasObjects.forEach(obj => {
        assignObjectId(obj);
        canvasObjectIds.add(obj.objectId);
        state.dirtyObjectIds.add(obj.objectId);
    });

    // Find objects in Firestore that are no longer on canvas
    try {
        const objectsSnap = await collections.stagePlots.doc(state.currentPlotId).collection('objects').get();
        objectsSnap.docs.forEach(doc => {
            const objectId = doc.data().objectId;
            if (!canvasObjectIds.has(objectId)) {
                state.deletedObjectIds.add(objectId);
            }
        });
    } catch (error) {
        console.error('Error fetching objects for undo/redo sync:', error);
    }

    state.isReceivingRemote = false;
    triggerAutoSave();
}

// =============================================
// PROPERTIES PANEL (COLOR PICKER + FILL)
// =============================================

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function rgbaToHex(rgba) {
    if (!rgba || rgba === 'transparent') return '#000000';
    if (rgba.startsWith('#')) return rgba;
    const match = rgba.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#000000';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

function showPropertiesPanel(selectedObjects) {
    const panel = document.getElementById('properties-panel');
    if (!panel || !selectedObjects || selectedObjects.length === 0) return;

    const obj = selectedObjects[0];

    // Skip grid lines and dimension labels
    if (obj.gridLine || obj.isRectDimension) return;

    const strokeInput = document.getElementById('prop-stroke-color');
    const fillEnabledInput = document.getElementById('prop-fill-enabled');
    const fillColorInput = document.getElementById('prop-fill-color');
    const fillOpacitySelect = document.getElementById('prop-fill-opacity');
    const fillControls = document.getElementById('prop-fill-controls');

    // Determine if this is a rect-type object (show fill controls)
    const isRect = obj.type === 'rect' && obj.rectId;

    // Set stroke color
    if (strokeInput) {
        const strokeColor = obj.stroke || (isRect ? '#c9a961' : '#000000');
        strokeInput.value = rgbaToHex(strokeColor);
    }

    // Show/hide fill controls
    if (fillControls) {
        fillControls.style.display = isRect ? 'contents' : 'none';
    }

    if (isRect) {
        const fillEnabled = obj.fillEnabled !== undefined ? obj.fillEnabled : true;
        const fillColor = obj.fillColor || rgbaToHex(obj.fill) || '#c9a961';
        const fillOpacity = obj.fillOpacity !== undefined ? obj.fillOpacity : 0.2;

        if (fillEnabledInput) fillEnabledInput.checked = fillEnabled;
        if (fillColorInput) fillColorInput.value = fillColor;
        if (fillOpacitySelect) {
            // Find closest opacity option
            const options = ['0.2', '0.4', '0.6', '1.0'];
            const closest = options.reduce((prev, curr) =>
                Math.abs(parseFloat(curr) - fillOpacity) < Math.abs(parseFloat(prev) - fillOpacity) ? curr : prev
            );
            fillOpacitySelect.value = closest;
        }
    }

    panel.style.display = 'flex';
}

function hidePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    if (panel) panel.style.display = 'none';
}

function setupPropertiesPanel() {
    const strokeInput = document.getElementById('prop-stroke-color');
    const fillEnabledInput = document.getElementById('prop-fill-enabled');
    const fillColorInput = document.getElementById('prop-fill-color');
    const fillOpacitySelect = document.getElementById('prop-fill-opacity');

    if (strokeInput) {
        strokeInput.addEventListener('input', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj) return;

            const newColor = strokeInput.value;
            obj.set('stroke', newColor);

            // If rect, update dimension label colors to match
            if (obj.rectId) {
                const rectData = state.stageRectangles.find(r => r.id === obj.rectId);
                if (rectData) {
                    rectData.widthLabel.set('fill', newColor);
                    rectData.heightLabel.set('fill', newColor);
                    trackDirtyObject(rectData.widthLabel);
                    trackDirtyObject(rectData.heightLabel);
                }
            }

            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillEnabledInput) {
        fillEnabledInput.addEventListener('change', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillEnabled = fillEnabledInput.checked;
            applyFillToRect(obj);
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillColorInput) {
        fillColorInput.addEventListener('input', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillColor = fillColorInput.value;
            if (obj.fillEnabled) {
                applyFillToRect(obj);
            }
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }

    if (fillOpacitySelect) {
        fillOpacitySelect.addEventListener('change', () => {
            const obj = state.canvas?.getActiveObject();
            if (!obj || !obj.rectId) return;

            obj.fillOpacity = parseFloat(fillOpacitySelect.value);
            if (obj.fillEnabled) {
                applyFillToRect(obj);
            }
            trackDirtyObject(obj);
            state.canvas.renderAll();
            triggerAutoSave();
        });
    }
}

function applyFillToRect(rect) {
    if (rect.fillEnabled) {
        const color = rect.fillColor || '#c9a961';
        const opacity = rect.fillOpacity !== undefined ? rect.fillOpacity : 0.2;
        const rgb = hexToRgb(color);
        rect.set('fill', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
    } else {
        rect.set('fill', 'transparent');
    }
}

// ========================================
// Venue Map Annotation Tool
// ========================================

function setupVenueMap() {
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper) return;

    // Pre-load the image but defer canvas creation until the page is visible
    state.vmBgImage = new Image();
    state.vmBgImage.src = 'venue-map.png';

    // Tool buttons
    document.querySelectorAll('.vm-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.vmCurrentTool = btn.dataset.tool;
            vmUpdateCanvasMode();
        });
    });

    // Color swatches
    document.querySelectorAll('.vm-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.vm-color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.vmCurrentColor = swatch.dataset.color;
            // Update the active brush if currently in pen mode
            if (state.vmCanvas && state.vmCanvas.isDrawingMode) {
                state.vmCanvas.freeDrawingBrush.color = state.vmCurrentColor;
            }
        });
    });

    // Stroke width
    const strokeSelect = document.getElementById('vm-stroke-width');
    if (strokeSelect) {
        strokeSelect.addEventListener('change', () => {
            state.vmStrokeWidth = parseInt(strokeSelect.value);
            // Update the active brush if currently in pen mode
            if (state.vmCanvas && state.vmCanvas.isDrawingMode) {
                state.vmCanvas.freeDrawingBrush.width = state.vmStrokeWidth;
            }
        });
    }

    // Fill toggle
    const fillToggle = document.getElementById('vm-fill-toggle');
    if (fillToggle) {
        fillToggle.addEventListener('change', (e) => {
            state.vmFillShape = e.target.checked;
            const active = state.vmCanvas?.getActiveObject();
            if (active && (active.type === 'rect' || active.type === 'ellipse')) {
                active.set('fill', state.vmFillShape ? active.stroke : 'transparent');
                state.vmCanvas.renderAll();
                vmTriggerSave();
            }
        });
    }

    // Zoom buttons
    const zoomInBtn = document.getElementById('vm-zoom-in-btn');
    const zoomOutBtn = document.getElementById('vm-zoom-out-btn');
    const zoomFitBtn = document.getElementById('vm-zoom-fit-btn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => vmSetZoom(state.vmZoom + 0.15));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => vmSetZoom(state.vmZoom - 0.15));
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', vmZoomFit);

    // Delete button
    const deleteBtn = document.getElementById('vm-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', vmDeleteSelected);
    }

    // Add layer button
    const addLayerBtn = document.getElementById('vm-add-layer-btn');
    if (addLayerBtn) {
        addLayerBtn.addEventListener('click', () => vmAddLayer());
    }

    // Print & Export buttons
    const printBtn = document.getElementById('vm-print-btn');
    const exportBtn = document.getElementById('vm-export-btn');
    if (printBtn) printBtn.addEventListener('click', vmPrintMap);
    if (exportBtn) exportBtn.addEventListener('click', vmExportPNG);

    // Keyboard shortcuts for venue map
    document.addEventListener('keydown', (e) => {
        if (state.currentPage !== 'venue-map' || !state.vmCanvas) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.vmCanvas.getActiveObject()?.isEditing) return;
            vmDeleteSelected();
            e.preventDefault();
        }
    });
}

function vmInitCanvas() {
    if (state.vmCanvas) return; // Already initialized

    const wrapper = document.getElementById('vm-canvas-wrapper');
    const img = state.vmBgImage;
    if (!wrapper || !img) return;

    // If image hasn't loaded yet, wait for it
    if (!img.naturalWidth) {
        img.onload = () => vmInitCanvas();
        return;
    }

    const wrapperWidth = wrapper.clientWidth || 1000;
    const scale = wrapperWidth / img.naturalWidth;
    const canvasWidth = Math.floor(img.naturalWidth * scale);
    const canvasHeight = Math.floor(img.naturalHeight * scale);

    state.vmCanvas = new fabric.Canvas('vm-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        selection: true,
        preserveObjectStacking: true
    });

    state.vmCanvas.setBackgroundImage(
        new fabric.Image(img, {
            scaleX: scale,
            scaleY: scale,
            originX: 'left',
            originY: 'top'
        }),
        state.vmCanvas.renderAll.bind(state.vmCanvas)
    );
    state.vmBgScale = scale;

    state.vmImageLoaded = true;
    state.vmBaseWidth = canvasWidth;
    state.vmBaseHeight = canvasHeight;
    state.vmZoom = 1.0;

    vmSetupDrawingEvents();
    vmLoadLayers();
}

function vmUpdateCanvasMode() {
    const c = state.vmCanvas;
    if (!c) return;

    if (state.vmCurrentTool === 'select') {
        c.isDrawingMode = false;
        c.selection = true;
        c.forEachObject(o => { if (!o._vmBackground) o.selectable = true; });
    } else if (state.vmCurrentTool === 'pen') {
        c.isDrawingMode = true;
        c.freeDrawingBrush.color = state.vmCurrentColor;
        c.freeDrawingBrush.width = state.vmStrokeWidth;
        c.selection = false;
    } else {
        // Line, rect, circle, text — handled via mouse events
        c.isDrawingMode = false;
        c.selection = false;
        c.forEachObject(o => { if (!o._vmBackground) o.selectable = false; });
    }
}

function vmSetupDrawingEvents() {
    const c = state.vmCanvas;

    // When freehand path is created, tag it with the active layer
    c.on('path:created', (e) => {
        const path = e.path;
        if (!state.vmActiveLayerId) {
            c.remove(path);
            showToast('Create a layer first', 'warning');
            return;
        }
        path._vmLayerId = state.vmActiveLayerId;
        vmTriggerSave();
    });

    c.on('mouse:down', (opt) => {
        if (state.vmCurrentTool === 'select') return;
        if (!state.vmActiveLayerId) {
            if (state.vmCurrentTool === 'pen') {
                c.isDrawingMode = false;
            }
            showToast('Create a layer first', 'warning');
            return;
        }
        if (state.vmCurrentTool === 'pen') return;

        const pointer = c.getPointer(opt.e);
        state.vmDrawStart = { x: pointer.x, y: pointer.y };

        if (state.vmCurrentTool === 'text') {
            const textObj = new fabric.Textbox('Text', {
                left: pointer.x,
                top: pointer.y,
                width: 200,
                fontSize: state.vmStrokeWidth * 5 + 10,
                fill: state.vmCurrentColor,
                fontFamily: 'DM Sans, sans-serif',
                _vmLayerId: state.vmActiveLayerId
            });
            c.add(textObj);
            c.setActiveObject(textObj);
            textObj.enterEditing();
            textObj.selectAll();
            vmTriggerSave();
            // Switch back to select
            state.vmCurrentTool = 'select';
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
            vmUpdateCanvasMode();
            return;
        }

        if (state.vmCurrentTool === 'line') {
            state.vmDrawingObj = new fabric.Line(
                [pointer.x, pointer.y, pointer.x, pointer.y],
                { stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth, selectable: false, _vmLayerId: state.vmActiveLayerId }
            );
            c.add(state.vmDrawingObj);
        } else if (state.vmCurrentTool === 'rect') {
            state.vmDrawingObj = new fabric.Rect({
                left: pointer.x, top: pointer.y, width: 0, height: 0,
                stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth,
                fill: state.vmFillShape ? state.vmCurrentColor : 'transparent', selectable: false, _vmLayerId: state.vmActiveLayerId
            });
            c.add(state.vmDrawingObj);
        } else if (state.vmCurrentTool === 'circle') {
            state.vmDrawingObj = new fabric.Ellipse({
                left: pointer.x, top: pointer.y, rx: 0, ry: 0,
                stroke: state.vmCurrentColor, strokeWidth: state.vmStrokeWidth,
                fill: state.vmFillShape ? state.vmCurrentColor : 'transparent', selectable: false, _vmLayerId: state.vmActiveLayerId
            });
            c.add(state.vmDrawingObj);
        }
    });

    c.on('mouse:move', (opt) => {
        if (!state.vmDrawingObj || !state.vmDrawStart) return;
        const pointer = c.getPointer(opt.e);

        if (state.vmCurrentTool === 'line') {
            state.vmDrawingObj.set({ x2: pointer.x, y2: pointer.y });
        } else if (state.vmCurrentTool === 'rect') {
            const left = Math.min(state.vmDrawStart.x, pointer.x);
            const top = Math.min(state.vmDrawStart.y, pointer.y);
            state.vmDrawingObj.set({
                left, top,
                width: Math.abs(pointer.x - state.vmDrawStart.x),
                height: Math.abs(pointer.y - state.vmDrawStart.y)
            });
        } else if (state.vmCurrentTool === 'circle') {
            const rx = Math.abs(pointer.x - state.vmDrawStart.x) / 2;
            const ry = Math.abs(pointer.y - state.vmDrawStart.y) / 2;
            state.vmDrawingObj.set({
                left: Math.min(state.vmDrawStart.x, pointer.x),
                top: Math.min(state.vmDrawStart.y, pointer.y),
                rx, ry
            });
        }
        c.renderAll();
    });

    c.on('mouse:up', () => {
        if (state.vmDrawingObj) {
            const drawnObj = state.vmDrawingObj;
            drawnObj.setCoords();
            state.vmDrawingObj = null;
            state.vmDrawStart = null;
            vmTriggerSave();
            // Switch back to select and auto-select the drawn shape
            state.vmCurrentTool = 'select';
            document.querySelectorAll('.vm-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
            vmUpdateCanvasMode();
            c.setActiveObject(drawnObj);
            c.renderAll();
        }
    });

    // Sync fill checkbox on selection
    function vmUpdateFillCheckbox() {
        const obj = state.vmCanvas.getActiveObject();
        const toggle = document.getElementById('vm-fill-toggle');
        if (obj && (obj.type === 'rect' || obj.type === 'ellipse')) {
            toggle.checked = obj.fill !== 'transparent' && obj.fill !== '';
            state.vmFillShape = toggle.checked;
        }
    }
    c.on('selection:created', vmUpdateFillCheckbox);
    c.on('selection:updated', vmUpdateFillCheckbox);

    // Auto-save on object modifications
    c.on('object:modified', () => vmTriggerSave());
    c.on('object:removed', () => vmTriggerSave());
    c.on('text:changed', () => vmTriggerSave());
}

// --- Layer Management ---

function vmAddLayer(name) {
    const layerName = name || `Layer ${state.vmLayers.length + 1}`;
    const colors = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#e53e9e'];
    const color = colors[state.vmLayers.length % colors.length];

    const layer = {
        id: 'layer_' + Date.now(),
        name: layerName,
        color: color,
        visible: true
    };

    state.vmLayers.push(layer);
    state.vmActiveLayerId = layer.id;
    vmRenderLayers();
    vmSaveLayers();
    return layer;
}

function vmRenderLayers() {
    const list = document.getElementById('vm-layers-list');
    if (!list) return;

    if (state.vmLayers.length === 0) {
        list.innerHTML = '<p style="padding: 1rem; color: #a0aec0; font-size: 0.85rem; text-align: center;">No layers yet. Click "+ Layer" to start annotating.</p>';
        return;
    }

    list.innerHTML = state.vmLayers.map(layer => `
        <div class="vm-layer-item ${layer.id === state.vmActiveLayerId ? 'active' : ''}"
             data-layer-id="${layer.id}" onclick="vmSelectLayer('${layer.id}')">
            <div class="vm-layer-color" style="background:${layer.color}"></div>
            <span class="vm-layer-name" ondblclick="vmRenameLayer(event, '${layer.id}')">${layer.name}</span>
            <button class="vm-layer-visibility" onclick="vmToggleLayerVisibility(event, '${layer.id}')" title="${layer.visible ? 'Hide' : 'Show'}">
                ${layer.visible ? '&#128065;' : '&#128064;'}
            </button>
            <button class="vm-layer-delete" onclick="vmDeleteLayer(event, '${layer.id}')" title="Delete layer">&times;</button>
        </div>
    `).join('');
}

function vmSelectLayer(layerId) {
    // Don't re-render if we're in the middle of renaming a layer
    if (state.vmRenamingLayer) return;
    state.vmActiveLayerId = layerId;
    vmRenderLayers();
    if (state.vmCurrentTool === 'pen' && state.vmCanvas) {
        state.vmCanvas.isDrawingMode = true;
    }
}
window.vmSelectLayer = vmSelectLayer;

function vmToggleLayerVisibility(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;
    layer.visible = !layer.visible;

    // Show/hide objects on canvas
    if (state.vmCanvas) {
        state.vmCanvas.getObjects().forEach(obj => {
            if (obj._vmLayerId === layerId) {
                obj.visible = layer.visible;
            }
        });
        state.vmCanvas.renderAll();
    }

    vmRenderLayers();
    vmSaveLayers();
}
window.vmToggleLayerVisibility = vmToggleLayerVisibility;

function vmRenameLayer(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;

    state.vmRenamingLayer = true;
    const nameSpan = e.currentTarget;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = layer.name;
    input.className = 'vm-layer-name-input';

    const finish = () => {
        const newName = input.value.trim() || layer.name;
        layer.name = newName;
        state.vmRenamingLayer = false;
        vmRenderLayers();
        vmSaveLayers();
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
        if (ev.key === 'Escape') { input.value = layer.name; input.blur(); }
    });

    nameSpan.replaceWith(input);
    input.focus();
    input.select();
}
window.vmRenameLayer = vmRenameLayer;

function vmDeleteLayer(e, layerId) {
    e.stopPropagation();
    const layer = state.vmLayers.find(l => l.id === layerId);
    if (!layer) return;
    if (!confirm(`Delete layer "${layer.name}" and all its annotations?`)) return;

    // Remove objects from canvas
    if (state.vmCanvas) {
        const toRemove = state.vmCanvas.getObjects().filter(o => o._vmLayerId === layerId);
        toRemove.forEach(o => state.vmCanvas.remove(o));
    }

    state.vmLayers = state.vmLayers.filter(l => l.id !== layerId);
    if (state.vmActiveLayerId === layerId) {
        state.vmActiveLayerId = state.vmLayers.length > 0 ? state.vmLayers[0].id : null;
    }
    vmRenderLayers();
    vmSaveLayers();
}
window.vmDeleteLayer = vmDeleteLayer;

// --- Print & Export ---

// Build a data URL export of the venue map. Tries direct canvas export first
// (works on same-origin HTTP). Falls back to CORS composite for tainted canvases.
// Used by vmExportPNG (download). vmPrintMap uses its own layered approach.
function vmBuildExport(callback) {
    const c = state.vmCanvas;
    if (!c) {
        showToast('Canvas not ready — navigate to Venue Map first', 'error');
        return;
    }

    const w = state.vmBaseWidth;
    const h = state.vmBaseHeight;
    const prevZoom = state.vmZoom;

    // Reset to base dimensions for export
    c.setZoom(1);
    c.setWidth(w);
    c.setHeight(h);
    c.renderAll();

    function restoreZoom() {
        c.setZoom(prevZoom);
        c.setWidth(Math.round(w * prevZoom));
        c.setHeight(Math.round(h * prevZoom));
        c.renderAll();
    }

    // Try direct export (works if background was loaded with crossOrigin)
    try {
        const dataURL = c.toDataURL({ format: 'png' });
        restoreZoom();
        callback(dataURL);
        return;
    } catch (e) {
        // Canvas is tainted by the background image — use composite approach
    }

    // Composite approach: export annotations separately, then layer onto a CORS background
    const hasAnnotations = c.getObjects().length > 0;
    let annotationDataURL = null;

    if (hasAnnotations) {
        const bg = c.backgroundImage;
        c.backgroundImage = null;
        c.renderAll();
        try {
            annotationDataURL = c.toDataURL({ format: 'png' });
        } catch (err) {
            console.error('Annotation export failed:', err);
        }
        c.backgroundImage = bg;
        c.renderAll();
    }

    restoreZoom();

    // Load a fresh CORS copy of the background for the export canvas
    const corsImg = new Image();
    corsImg.crossOrigin = 'anonymous';
    corsImg.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(corsImg, 0, 0, w, h);

        if (annotationDataURL) {
            const annotImg = new Image();
            annotImg.onload = () => {
                ctx.drawImage(annotImg, 0, 0);
                callback(offscreen.toDataURL('image/png'));
            };
            annotImg.src = annotationDataURL;
        } else {
            // No annotations — just export the background
            callback(offscreen.toDataURL('image/png'));
        }
    };
    corsImg.onerror = () => {
        if (annotationDataURL) {
            console.warn('CORS image load failed, exporting annotations only');
            showToast('Exported annotations only (background unavailable in local mode)', 'warning');
            callback(annotationDataURL);
        } else {
            showToast('Cannot export venue map in local mode — deploy to GitHub Pages', 'error');
        }
    };
    corsImg.src = 'venue-map.png?export=' + Date.now();
}

function vmExportPNG() {
    vmBuildExport((dataURL) => {
        const visibleNames = state.vmLayers.filter(l => l.visible).map(l => l.name);
        const suffix = visibleNames.length > 0 ? ' (' + visibleNames.join(', ') + ')' : '';

        const link = document.createElement('a');
        link.download = 'Venue Map' + suffix + '.png';
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Map exported');
    });
}

function vmPrintMap() {
    const c = state.vmCanvas;
    if (!c) {
        showToast('Canvas not ready — navigate to Venue Map first', 'error');
        return;
    }

    const w = state.vmBaseWidth;
    const h = state.vmBaseHeight;
    const prevZoom = state.vmZoom;

    // Reset zoom to base dimensions for annotation export
    c.setZoom(1);
    c.setWidth(w);
    c.setHeight(h);
    c.renderAll();

    // Try direct full-canvas export (works on same-origin HTTP)
    let fullDataURL = null;
    try {
        fullDataURL = c.toDataURL({ format: 'png' });
    } catch (e) {
        // Canvas tainted — will use layered approach
    }

    // If direct export failed, get annotations-only as a transparent overlay
    let annotationDataURL = null;
    if (!fullDataURL && c.getObjects().length > 0) {
        const bg = c.backgroundImage;
        c.backgroundImage = null;
        c.renderAll();
        try {
            annotationDataURL = c.toDataURL({ format: 'png' });
        } catch (e) { /* shouldn't happen — annotations don't taint */ }
        c.backgroundImage = bg;
        c.renderAll();
    }

    // Restore zoom
    c.setZoom(prevZoom);
    c.setWidth(Math.round(w * prevZoom));
    c.setHeight(Math.round(h * prevZoom));
    c.renderAll();

    const visibleLayers = state.vmLayers.filter(l => l.visible);
    const legendHTML = visibleLayers.length > 0
        ? visibleLayers.map(l => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;"><span style="display:inline-block;width:12px;height:12px;background:${l.color};border-radius:2px;"></span>${l.name}</span>`).join('')
        : 'No annotation layers';

    // Build the map image HTML — either a single composited image or layered images
    let mapHTML;
    if (fullDataURL) {
        mapHTML = `<img src="${fullDataURL}" style="max-width:100%; height:auto;" />`;
    } else {
        // Layered: use venue-map.png directly (always displayable) + annotation overlay
        mapHTML = `<div style="position:relative; display:inline-block; max-width:100%;">
            <img src="venue-map.png" style="width:100%; height:auto; display:block;" />
            ${annotationDataURL ? `<img src="${annotationDataURL}" style="position:absolute; top:0; left:0; width:100%; height:100%;" />` : ''}
        </div>`;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Popup blocked — please allow popups for this site', 'error');
        return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Venue Map - YMU Gala 2026</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; }
        .header { text-align: center; padding: 12px 0 8px; }
        .header h1 { font-size: 18px; color: #1a3a35; }
        .header p { font-size: 12px; color: #718096; margin-top: 2px; }
        .map { text-align: center; padding: 0 10px; }
        @media print {
            @page { size: landscape; margin: 0.4in; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>YMU Gala 2026 - Venue Map</h1>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:4px;font-size:12px;color:#4a5568;">${legendHTML}</div>
    </div>
    <div class="map">
        ${mapHTML}
    </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 250);
    };
}

// --- Zoom ---

function vmSetZoom(newZoom) {
    const c = state.vmCanvas;
    if (!c) return;
    newZoom = Math.max(0.25, Math.min(3, newZoom));
    state.vmZoom = newZoom;

    const newWidth = Math.round(state.vmBaseWidth * newZoom);
    const newHeight = Math.round(state.vmBaseHeight * newZoom);

    c.setZoom(newZoom);
    c.setWidth(newWidth);
    c.setHeight(newHeight);
    c.renderAll();

    const label = document.getElementById('vm-zoom-level');
    if (label) label.textContent = Math.round(newZoom * 100) + '%';
}

function vmZoomFit() {
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper || !state.vmBaseWidth) return;
    const fitZoom = wrapper.clientWidth / state.vmBaseWidth;
    vmSetZoom(fitZoom);
}

function vmDeleteSelected() {
    const c = state.vmCanvas;
    if (!c) return;
    const active = c.getActiveObjects();
    if (active.length === 0) return;
    active.forEach(obj => c.remove(obj));
    c.discardActiveObject();
    c.renderAll();
    vmTriggerSave();
}

// --- Persistence (Firestore) ---

function vmTriggerSave() {
    if (state.vmAutoSaveTimeout) clearTimeout(state.vmAutoSaveTimeout);
    vmUpdateSaveStatus('Saving...');
    state.vmAutoSaveTimeout = setTimeout(() => vmSaveLayers(), 600);
}

function vmUpdateSaveStatus(text) {
    const el = document.getElementById('vm-save-status');
    if (el) el.textContent = text;
}

async function vmSaveLayers() {
    if (!state.vmCanvas || !state.vmImageLoaded) return;

    // Serialize each layer: metadata + its canvas objects
    const layersData = state.vmLayers.map(layer => {
        const objects = state.vmCanvas.getObjects().filter(o => o._vmLayerId === layer.id);
        const serialized = objects.map(o => {
            const json = o.toJSON(['_vmLayerId']);
            return json;
        });
        return {
            id: layer.id,
            name: layer.name,
            color: layer.color,
            visible: layer.visible,
            objects: serialized
        };
    });

    try {
        await collections.venueMapLayers.doc('default').set({
            layers: JSON.stringify(layersData),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        vmUpdateSaveStatus('Saved');
        setTimeout(() => vmUpdateSaveStatus(''), 2000);
    } catch (error) {
        console.error('Error saving venue map layers:', error);
        vmUpdateSaveStatus('Error saving');
    }
}

async function vmLoadLayers() {
    try {
        const doc = await collections.venueMapLayers.doc('default').get();
        if (!doc.exists) {
            vmRenderLayers();
            return;
        }

        const data = doc.data();
        const layersData = JSON.parse(data.layers || '[]');

        state.vmLayers = layersData.map(ld => ({
            id: ld.id,
            name: ld.name,
            color: ld.color,
            visible: ld.visible
        }));

        if (state.vmLayers.length > 0) {
            state.vmActiveLayerId = state.vmLayers[0].id;
        }

        // Restore objects to canvas
        const c = state.vmCanvas;
        layersData.forEach(ld => {
            ld.objects.forEach(objJson => {
                fabric.util.enlivenObjects([objJson], (enlivened) => {
                    enlivened.forEach(obj => {
                        obj._vmLayerId = ld.id;
                        obj.visible = ld.visible;
                        c.add(obj);
                    });
                    c.renderAll();
                });
            });
        });

        vmRenderLayers();
    } catch (error) {
        console.error('Error loading venue map layers:', error);
        vmRenderLayers();
    }
}

// =============================================
// SET LISTS
// =============================================

function setupSetListPage() {
    document.getElementById('add-setlist-btn')?.addEventListener('click', () => openSetListModal());

    document.querySelectorAll('#setlist-stage-tabs .day-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#setlist-stage-tabs .day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.setListStageFilter = tab.dataset.setlistStage;
            renderSetLists();
        });
    });
}

function renderSetLists() {
    const container = document.getElementById('setlist-grid');
    if (!container) return;

    const total = state.setLists.length;
    const totalSongs = state.setLists.reduce((sum, sl) => sum + (sl.songs || []).length, 0);

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('setlist-stat-total', total);
    setStat('setlist-stat-songs', totalSongs);

    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }

    const isSearching = state.setListSearch && state.setListSearch.trim().length > 0;
    if (isSearching) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q))
        );
    }

    // Update search count
    const countEl = document.getElementById('setlist-search-count');
    if (countEl) {
        countEl.textContent = isSearching ? `${items.length} of ${total} set lists` : `${total} set lists`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('setlist-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    items.sort((a, b) => (a.performer || '').localeCompare(b.performer || ''));

    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No set lists added yet. Click "+ Add Set List" to get started.</div>';
        return;
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="staff-empty-state">No set lists match "${escapeHtml(state.setListSearch)}"</div>`;
        return;
    }

    container.innerHTML = '<div class="setlist-grid">' + items.map((sl, idx) => {
        const songs = sl.songs || [];
        const stageLabel = sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage';
        const songListHtml = songs.map((s, i) =>
            `<div class="setlist-song-row">
                <span class="song-number">${i + 1}.</span>
                <span class="song-title">${escapeHtml(s.title)}</span>
                ${s.duration ? `<span class="song-duration">${escapeHtml(s.duration)}</span>` : ''}
                ${s.notes ? `<span class="song-notes">${escapeHtml(s.notes)}</span>` : ''}
            </div>`
        ).join('');

        return `
        <div class="setlist-card" style="animation-delay: ${idx * 40}ms">
            <div class="setlist-card-header">
                <div class="setlist-performer">${escapeHtml(sl.performer || '')}</div>
                <span class="setlist-stage-badge stage-${sl.stage}">${stageLabel}</span>
            </div>
            <div class="setlist-summary">
                <span>${songs.length} song${songs.length !== 1 ? 's' : ''}</span>
                ${sl.estimatedDuration ? `<span> &middot; ${escapeHtml(sl.estimatedDuration)}</span>` : ''}
            </div>
            ${songs.length > 0 ? `
                <div class="setlist-songs-toggle" onclick="toggleSetListSongs('${sl.id}')">
                    <span id="setlist-toggle-icon-${sl.id}">&#9654;</span> View Songs
                </div>
                <div class="setlist-songs-list" id="setlist-songs-${sl.id}" style="display:none">
                    ${songListHtml}
                </div>
            ` : ''}
            ${sl.generalNotes ? `
                <div class="setlist-notes">${escapeHtml(sl.generalNotes)}</div>
            ` : ''}
            <div class="staff-actions">
                <button class="btn btn-edit" onclick="openSetListModal('${sl.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteSetList('${sl.id}')">Delete</button>
            </div>
        </div>`;
    }).join('') + '</div>';
}

function openSetListModal(itemId = null) {
    const modal = document.getElementById('setlist-modal');
    const form = document.getElementById('setlist-form');
    const title = document.getElementById('setlist-modal-title');

    form.reset();
    document.getElementById('setlist-id').value = '';

    let data = null;
    if (itemId) {
        data = state.setLists.find(s => s.id === itemId);
    }

    title.textContent = data ? 'Edit Set List' : 'Add Set List';

    if (data) {
        document.getElementById('setlist-id').value = itemId;
        document.getElementById('setlist-performer').value = data.performer || '';
        document.getElementById('setlist-stage').value = data.stage || 'main';
        document.getElementById('setlist-duration').value = data.estimatedDuration || '';
        document.getElementById('setlist-notes').value = data.generalNotes || '';
        renderSongRows(data.songs || []);
    } else {
        renderSongRows([{ title: '', duration: '', notes: '' }]);
    }

    modal.classList.add('active');
}

function renderSongRows(songs) {
    const container = document.getElementById('setlist-songs-container');
    container.innerHTML = songs.map((song, i) => `
        <div class="song-edit-row" data-song-index="${i}">
            <input type="text" class="song-title-input" value="${escapeHtml(song.title || '')}" placeholder="Song title">
            <input type="text" class="song-duration-input" value="${escapeHtml(song.duration || '')}" placeholder="mm:ss" style="width:70px">
            <input type="text" class="song-notes-input" value="${escapeHtml(song.notes || '')}" placeholder="Notes">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeSongRow(this)">×</button>
        </div>
    `).join('');
}

function addSongRow() {
    const container = document.getElementById('setlist-songs-container');
    const row = document.createElement('div');
    row.className = 'song-edit-row';
    row.innerHTML = `
        <input type="text" class="song-title-input" placeholder="Song title">
        <input type="text" class="song-duration-input" placeholder="mm:ss" style="width:70px">
        <input type="text" class="song-notes-input" placeholder="Notes">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeSongRow(this)">×</button>
    `;
    container.appendChild(row);
    row.querySelector('.song-title-input').focus();
}

function removeSongRow(btn) {
    const container = document.getElementById('setlist-songs-container');
    if (container.querySelectorAll('.song-edit-row').length <= 1) return;
    btn.closest('.song-edit-row').remove();
}

async function handleSetListSubmit(e) {
    e.preventDefault();

    const songRows = document.querySelectorAll('#setlist-songs-container .song-edit-row');
    const songs = Array.from(songRows)
        .map(row => ({
            title: row.querySelector('.song-title-input').value.trim(),
            duration: row.querySelector('.song-duration-input').value.trim(),
            notes: row.querySelector('.song-notes-input').value.trim()
        }))
        .filter(s => s.title);

    const data = {
        performer: document.getElementById('setlist-performer').value,
        stage: document.getElementById('setlist-stage').value,
        songs: songs,
        estimatedDuration: document.getElementById('setlist-duration').value,
        generalNotes: document.getElementById('setlist-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const id = document.getElementById('setlist-id').value;

    try {
        if (id) {
            await collections.setLists.doc(id).update(data);
            showToast('Set list updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.setLists.add(data);
            showToast('Set list added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving set list:', error);
        showToast('Error saving set list', 'error');
    }
}

function toggleSetListSongs(id) {
    const el = document.getElementById('setlist-songs-' + id);
    const icon = document.getElementById('setlist-toggle-icon-' + id);
    if (el.style.display === 'none') {
        el.style.display = '';
        icon.innerHTML = '&#9660;';
    } else {
        el.style.display = 'none';
        icon.innerHTML = '&#9654;';
    }
}

function handleSetListSearch(value) {
    state.setListSearch = value;
    renderSetLists();
}

function clearSetListSearch() {
    state.setListSearch = '';
    document.getElementById('setlist-search-input').value = '';
    renderSetLists();
}

function exportSetListToExcel() {
    const rows = [];
    state.setLists
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            const songs = sl.songs || [];
            if (songs.length === 0) {
                rows.push({
                    'Performer': sl.performer || '',
                    'Stage': sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage',
                    '#': '',
                    'Song': '',
                    'Duration': sl.estimatedDuration || '',
                    'Song Notes': '',
                    'Crew Notes': sl.generalNotes || ''
                });
            } else {
                songs.forEach((song, i) => {
                    rows.push({
                        'Performer': i === 0 ? (sl.performer || '') : '',
                        'Stage': i === 0 ? (sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage') : '',
                        '#': i + 1,
                        'Song': song.title || '',
                        'Duration': song.duration || '',
                        'Song Notes': song.notes || '',
                        'Crew Notes': i === 0 ? (sl.generalNotes || '') : ''
                    });
                });
            }
        });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 25 },  // Performer
        { wch: 15 },  // Stage
        { wch: 4 },   // #
        { wch: 30 },  // Song
        { wch: 8 },   // Duration
        { wch: 30 },  // Song Notes
        { wch: 35 }   // Crew Notes
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Set Lists');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Set_Lists_${today}.xlsx`);
}

window.openSetListModal = openSetListModal;
window.deleteSetList = createDeleteHandler('setLists', 'set list');
window.addSongRow = addSongRow;
window.removeSongRow = removeSongRow;
window.toggleSetListSongs = toggleSetListSongs;
window.handleSetListSearch = handleSetListSearch;
window.clearSetListSearch = clearSetListSearch;

// Make functions globally accessible
window.toggleCategorySection = toggleCategorySection;
window.editBudgetCell = editBudgetCell;
window.makeRowEditable = makeRowEditable;
window.saveRowChanges = saveRowChanges;
window.cancelRowEdit = cancelRowEdit;
window.editTimelineCell = editTimelineCell;
window.commitNewRow = commitNewRow;
window.editStageCell = editStageCell;

