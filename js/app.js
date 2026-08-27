// Generate a unique client session ID for multi-user collaboration
if (!sessionStorage.getItem('clientId')) {
    sessionStorage.setItem('clientId', 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
}
const CLIENT_ID = sessionStorage.getItem('clientId');

// Global state
const state = {
    // Multi-event hub
    events: [],
    blockDates: [],
    activeEvent: null,
    currentEventId: null,
    seasons: ['2025-2026', '2026-2027'],
    currentSeason: '2025-2026',
    // Per-event data
    budget: [],
    timeline: [],
    mainStageInputs: [],
    cocktailStageInputs: [],
    staff: [],
    staffDirectory: [],
    performerDirectory: [],
    roleCategoryMap: {},      // role (lowercase) → budget category string (derived from jobTemplates)
    jobTemplates: [],         // [{id, name, category}] global reusable role → budget mappings
    setLists: [],
    setListSearch: '',
    setListStageFilter: 'all',
    setListsExpanded: new Set(),
    budgetSort: { field: null, direction: 'asc' },
    budgetSearch: '',
    currentPage: 'events-hub',
    currentDay: 'Thursday',  // For timeline filtering
    timelineDays: null,       // [{id, label}] — null until initialized
    vendorFilter: 'all',  // For vendor page filtering (all/confirmed/pending/issues)
    vendorSearch: '',
    vendorView: 'grid',                     // 'grid' | 'schedule'
    vendorScheduleFilter: 'all',            // 'all' | 'needs-schedule'
    vendorScheduleEditingRowId: null,       // blocks re-render during cell edit
    vendorScheduleRenderPending: false,     // deferred re-render flag
    pendingVendorScheduleEdit: null,        // { id, day, originalValue } — for Esc revert
    vendorGanttDay: 'saturday',             // selected day for Vendor Schedule gantt
    staffSearch: '',
    staffFilter: 'all',  // 'all' or 'unfilled'
    staffView: 'team',
    staffDay: 'saturday',
    currentStage: 'main',  // For stage input filtering
    vmUndoStack: [],  // Undo history for venue map canvas
    vmRedoStack: [],  // Redo history for venue map canvas
    vmIsUndoRedoing: false,  // Flag to prevent history recording during undo/redo
    globalUndoStack: [],   // Undo history for delete actions across all pages
    timelineFilter: 'all',  // Current timeline filter: 'all', 'production', 'run-of-show'
    timelineAnimateRows: true,  // Only animate rows on day/filter switch, not data updates
    timelineEditingRowId: null,  // Row ID currently being inline-edited (blocks re-render)
    timelineRenderPending: false,  // True if a Firestore snapshot arrived during editing
    tlDragId: null,  // ID of the timeline row currently being dragged
    cueSheetEditingRowId: null,
    cueSheetRenderPending: false,
    cueSheetShowHidden: false,
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
    inventory: [],
    packingList: [],
    packingCategoryColors: [],
    packingSearch: '',
    packingCategoryFilter: 'all',
    packingView: 'inventory',
    _pendingPackingImageItemId: null,
    _pendingPackingImageInventoryId: null,
    _inventoryPickerSelected: new Set(),
    // Quote state
    quoteLines: [],
    // Menu state
    menuItems: [],
    menuSearch: '',
    menuCategoryFilter: 'all',
    menuStatusFilter: 'all',
    menuViewMode: 'category',
    // Printed materials state
    printedMaterials: [],
    printSearch: '',
    printStatusFilter: 'all',
    printSort: { field: null, direction: 'asc' },
    printVendorFilter: 'all',
    printColumns: { name: true, quantity: true, size: true, material: true, holder: true, vendor: true, status: true, link: true, notes: true },
    // Digital assets state
    digitalAssets: [],
    daSearch: '',
    daStatusFilter: 'all',
    daSort: { field: null, direction: 'asc' },
    // Seating state
    guests: [],
    seatingTables: [],
    seatingView: 'table',
    seatingSelectedTableId: null,
    seatingSearch: '',
    seatingPanelSearch: '',
    seatingUnassignedOnly: false,
    seatingEditingRowId: null,
    seatingRenderPending: false,
    pendingNewGuestRow: {},
    seatingCanvas: null,
    seatingBgImage: null,
    seatingMarkers: new Map(),
    seatingCanvasInitialized: false,
};

// --- Staff-Budget linking helpers ---
function getLinkedBudget(member) {
    if (!member || !member.linkedBudgetId) return null;
    return state.budget.find(b => b.id === member.linkedBudgetId) || null;
}

function getLinkedStaff(budgetItem) {
    if (!budgetItem || !budgetItem.linkedStaffId) return null;
    return state.staff.find(s => s.id === budgetItem.linkedStaffId) || null;
}

// One-time backfill: copy missing contact info between already-linked staff/budget pairs.
// Only fills empty fields (never overwrites), so future re-saves use the normal "last edit wins" sync.
let _linkedContactBackfillDone = false;
let _linkedContactBackfillRunning = false;
async function backfillLinkedContactInfo() {
    if (_linkedContactBackfillDone || _linkedContactBackfillRunning) return;
    if (!state.staff.length || !state.budget.length) return;
    _linkedContactBackfillRunning = true;

    const writes = [];
    for (const member of state.staff) {
        if (!member.linkedBudgetId) continue;
        const budgetItem = state.budget.find(b => b.id === member.linkedBudgetId);
        if (!budgetItem) continue;

        const staffUpdate = {};
        if (!member.phone && budgetItem.phone) staffUpdate.phone = budgetItem.phone;
        if (!member.email && budgetItem.email) staffUpdate.email = budgetItem.email;

        const budgetUpdate = {};
        if (!budgetItem.phone && member.phone) budgetUpdate.phone = member.phone;
        if (!budgetItem.email && member.email) budgetUpdate.email = member.email;
        if (!budgetItem.contact && member.name) budgetUpdate.contact = member.name;

        if (Object.keys(staffUpdate).length) writes.push(collections.staff.doc(member.id).update(staffUpdate));
        if (Object.keys(budgetUpdate).length) writes.push(collections.budget.doc(budgetItem.id).update(budgetUpdate));
    }

    try {
        if (writes.length) {
            await Promise.all(writes);
            console.log('[backfill] synced contact info for ' + writes.length + ' linked field group(s)');
        }
        _linkedContactBackfillDone = true;
    } catch (e) {
        console.error('[backfill] linked contact sync failed:', e);
    } finally {
        _linkedContactBackfillRunning = false;
    }
}

function findBudgetSuggestions(staffName) {
    if (!staffName) return [];
    const name = staffName.toLowerCase().trim();
    const nameWords = name.split(/\s+/).filter(w => w.length > 2);
    if (nameWords.length === 0) return [];
    return state.budget.filter(b => {
        if (b.linkedStaffId) return false;
        const vendor = (b.vendor || '').toLowerCase();
        const vendorWords = vendor.split(/\s+/).filter(w => w.length > 2);
        return nameWords.some(w => vendor.includes(w)) || vendorWords.some(w => name.includes(w));
    });
}

function findStaffSuggestions(vendorName) {
    if (!vendorName) return [];
    const vendor = vendorName.toLowerCase().trim();
    const vendorWords = vendor.split(/\s+/).filter(w => w.length > 2);
    if (vendorWords.length === 0) return [];
    return state.staff.filter(s => {
        if (s.linkedBudgetId) return false;
        const name = (s.name || '').toLowerCase();
        const nameWords = name.split(/\s+/).filter(w => w.length > 2);
        return vendorWords.some(w => name.includes(w)) || nameWords.some(w => vendor.includes(w));
    });
}

// ── App-level Undo ────────────────────────────────────────────────
const _appUndoStack = [];
const _MAX_UNDO = 30;

function pushUndo(label, undoFn) {
    _appUndoStack.push({ label, undo: undoFn });
    if (_appUndoStack.length > _MAX_UNDO) _appUndoStack.shift();
}

async function performUndo() {
    const action = _appUndoStack.pop();
    if (!action) { showToast('Nothing to undo', 'info'); return; }
    try {
        await action.undo();
        showToast(`Undid: ${action.label}`);
    } catch(e) {
        console.error('Undo failed:', e);
        showToast('Undo failed', 'error');
    }
}

async function undoableDelete(collRef, id, label) {
    const snap = await collRef.doc(id).get();
    if (!snap.exists) return false;
    const data = snap.data();
    await collRef.doc(id).delete();
    pushUndo(`Delete ${label}`, async () => { await collRef.doc(id).set(data); });
    return true;
}

// Cmd+Z is handled by the canvas keydown listener at init time (calls undoGlobalAction → performUndo)
// ─────────────────────────────────────────────────────────────────

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

// --- Multi-event system ---

// Pseudo-season used to archive events that didn't move forward, rather
// than deleting them — keeps the reason on file for future reference.
const FAILED_INQUIRIES_SEASON = 'Failed Inquiries';

const PHASES = [
    { id: 'phase-0', label: 'Phase 0 (Idea)',                                         color: '#9e9e9e', text: '#fff' },
    { id: 'phase-1', label: 'Phase 1 (Talks w/Client)',                               color: '#9c6fe4', text: '#fff' },
    { id: 'phase-2', label: 'Phase 2 (Awaiting Walk Thru)',                           color: '#4db6ac', text: '#fff' },
    { id: 'phase-3', label: 'Phase 3 (Event Details Confirmed / Quote Exchange)',     color: '#64b5f6', text: '#1a1a1a' },
    { id: 'phase-4', label: 'Phase 4 (Invoice Sent) waiting on payment',              color: '#795548', text: '#fff' },
    { id: 'phase-5', label: 'Phase 5 (Docs being made and staffing confirmed)',       color: '#81c784', text: '#1a1a1a' },
    { id: 'phase-6', label: 'Phase 6 (Crew has received info)',                       color: '#90caf9', text: '#1a1a1a' },
    { id: 'phase-7', label: 'Phase 7 (Ready for Showday)',                            color: '#ffb74d', text: '#1a1a1a' },
    { id: 'phase-8', label: 'Phase 8 (Awaiting Final Payment)',                       color: '#ef9a9a', text: '#1a1a1a' },
    { id: 'phase-9', label: 'Phase 9 (Send Thank you email)',                         color: '#7b1fa2', text: '#fff' },
    { id: 'completed', label: 'Completed!!!',                                         color: '#2e7d32', text: '#fff' },
];

const ALL_PAGES = [
    { id: 'intake',              label: 'Intake' },
    { id: 'dashboard',           label: 'Dashboard' },
    { id: 'timeline',            label: 'Timeline' },
    { id: 'technical-cue-sheet', label: 'Technical Cue Sheet' },
    { id: 'input-lists',         label: 'Input Lists' },
    { id: 'set-lists',           label: 'Performers' },
    { id: 'vendors',             label: 'Vendors' },
    { id: 'budget',              label: 'Budget' },
    { id: 'staff',               label: 'Staff' },
    { id: 'packing-list',        label: 'Packing List' },
    { id: 'seating',             label: 'Seating' },
    { id: 'printed-materials',   label: 'Printed Materials' },
    { id: 'digital-assets',      label: 'Digital Assets' },
    { id: 'menu',                label: 'Menu' },
    { id: 'venue-map',           label: 'Venue Map' },
    { id: 'guests',              label: 'Guests' },
    { id: 'quote',               label: 'Quote' },
];

const INTAKE_SECTION_ICONS = {
    'Venue — Day of Contact':      'ti-map-pin',
    'Preliminary Info':            'ti-info-circle',
    'Event Info':                  'ti-calendar-event',
    'Pre-Show':                    'ti-clock',
    'Run of Show':                 'ti-list',
    'Logistics':                   'ti-truck',
    'Production Responsibilities': 'ti-tool',
    'Marketing':                   'ti-speakerphone',
    'Insurance':                   'ti-shield-check',
    'Financial Information':       'ti-currency-dollar',
};

const INTAKE_SCHEMA = [
    { type: 'section', label: 'Venue — Day of Contact' },
    { field: 'venue_contact_name', label: 'Name',         inputType: 'text'  },
    { field: 'venue_phone',        label: 'Phone Number', inputType: 'tel'   },
    { field: 'venue_email',        label: 'Email',        inputType: 'email' },
    { field: 'venue_org',          label: 'Organization', inputType: 'text'  },

    { type: 'section', label: 'Preliminary Info' },
    { field: 'nature_of_performance', label: 'Nature of the Performance',                   inputType: 'textarea' },
    { field: 'num_guests',            label: 'Number of Guests',                            inputType: 'number'   },
    { field: 'other_activations',     label: 'Other Activations / Speeches / Experiences',  inputType: 'textarea' },

    { type: 'section', label: 'Event Info' },
    { field: 'event_name',       label: 'Event Name',             inputType: 'text' },
    { field: 'venue_name',       label: 'Venue Name',             inputType: 'text' },
    { field: 'venue_address',    label: 'Venue Address',          inputType: 'text' },
    { field: 'staff_entrance',   label: 'Staff / Vendor Entrance',inputType: 'text' },
    { field: 'performing_bands', label: 'Performing Bands',       inputType: 'text' },
    { field: 'event_date',       label: 'Event Date',             inputType: 'date' },

    { type: 'dynamic-section', id: 'pre_show_rows',    label: 'Pre-Show'    },
    { type: 'dynamic-section', id: 'run_of_show_rows', label: 'Run of Show' },

    { type: 'section', label: 'Logistics' },
    { field: 'event_access',    label: 'Public or Private Event?',            inputType: 'text'     },
    { field: 'dress_code',      label: 'Dress Code',                          inputType: 'text'     },
    { field: 'parking_info',    label: 'Parking (free? validated? by whom?)', inputType: 'textarea' },
    { field: 'truck_parking',   label: 'Truck Parking (20ft box truck)',      inputType: 'text'     },
    { field: 'food_provider',   label: 'Who Provides Food for Musicians?',    inputType: 'text'     },
    { field: 'walkthrough',     label: 'Walk Through Date / Time',            inputType: 'text'     },
    { field: 'alcohol_served',  label: 'Will Alcohol Be Served?',             inputType: 'yesno'    },
    { field: 'stage_plot_link', label: 'Stage Plot Link',                     inputType: 'url'      },

    { type: 'section', label: 'Production Responsibilities' },
    { field: 'stage_provider',       label: 'Who Provides the Stage?',       inputType: 'text'     },
    { field: 'sound_provider',       label: 'Who Provides the Sound?',       inputType: 'text'     },
    { field: 'lights_provider',      label: 'Who Provides the Lights?',      inputType: 'text'     },
    { field: 'power_situation',      label: 'What is the Power Situation?',  inputType: 'textarea' },
    { field: 'sound_setup',          label: 'Sound Setup Needed',            inputType: 'textarea' },
    { field: 'photographer',         label: 'Who Provides the Photographer?',inputType: 'text'     },
    { field: 'photographer_contact', label: 'Photographer Contact Info',     inputType: 'text'     },
    { field: 'additional_services',  label: 'Additional Services',           inputType: 'textarea' },

    { type: 'section', label: 'Marketing' },
    { field: 'should_promote',     label: 'Should We Promote?',                     inputType: 'yesno'    },
    { field: 'ymu_table',          label: 'May YMU Set Up a Table / Tent?',         inputType: 'yesno'    },
    { field: 'ymu_donations',      label: 'May YMU Solicit Donations?',             inputType: 'yesno'    },
    { field: 'ymu_promotion',      label: 'Is YMU Responsible for Promotion?',      inputType: 'yesno'    },
    { field: 'flyer_status',       label: 'Flyer',                                  inputType: 'select',  options: ['Provided', 'YMU to Make', 'Not Needed'] },

    { type: 'section', label: 'Insurance' },
    { field: 'insured_party1',  label: 'Party #1 — Named Insured', inputType: 'text' },
    { field: 'insured_address', label: 'Address',                  inputType: 'text' },
    { type: 'subsection', label: 'Booking Contact' },
    { field: 'booking_name',  label: 'Name',                    inputType: 'text'  },
    { field: 'booking_email', label: 'Email',                   inputType: 'email' },
    { field: 'booking_phone', label: 'Phone Number',            inputType: 'tel'   },
    { field: 'booking_org',   label: 'Organization / Company',  inputType: 'text'  },
    { type: 'subsection', label: 'Secondary Contact' },
    { field: 'contact2_name',  label: 'Name',                   inputType: 'text'  },
    { field: 'contact2_email', label: 'Email',                  inputType: 'email' },
    { field: 'contact2_phone', label: 'Phone Number',           inputType: 'tel'   },
    { field: 'contact2_org',   label: 'Organization / Company', inputType: 'text'  },

    { type: 'section', label: 'Financial Information' },
    { field: 'invoice_org',     label: 'Organization Being Invoiced', inputType: 'text'  },
    { field: 'billing_address', label: 'Billing Address',             inputType: 'text'  },
    { field: 'staff_name',      label: 'Staff Name',                  inputType: 'text'  },
    { field: 'staff_email',     label: 'Staff Email',                 inputType: 'email' },
    { field: 'amount',          label: 'Amount',                      inputType: 'text'  },
];

const DYNAMIC_DEFAULTS = {
    pre_show_rows: [
        { label: 'Crew Arrival',           time: '' },
        { label: 'Band Arrival',           time: '' },
        { label: 'Sound Check',            time: '' },
        { label: 'Crew Break / Stage Dark',time: '' },
    ],
    run_of_show_rows: [
        { label: 'Event Starts', time: '' },
        { label: '',             time: '' },
        { label: '',             time: '' },
        { label: 'Show Over',    time: '' },
    ],
};

// Tracks active Firestore onSnapshot unsubscribers so we can tear down on event switch
let _activeListeners = [];
// Unsubscriber for the hub-level events listener (separate from per-event listeners)
let _eventsListener = null;

function teardownListeners() {
    _activeListeners.forEach(fn => { try { fn(); } catch (e) {} });
    _activeListeners = [];
}

function setActiveEvent(eventId) {
    const ref = db.collection('events').doc(eventId);
    collections = {
        vendors:               ref.collection('vendors'),
        budget:                ref.collection('budget'),
        timeline:              ref.collection('timeline'),
        mainStageInputs:       ref.collection('mainStageInputs'),
        cocktailStageInputs:   ref.collection('cocktailStageInputs'),
        staff:                 ref.collection('staff'),
        eventInfo:             ref.collection('event-info'),
        venueMapLayers:        ref.collection('venueMapLayers'),
        setLists:              ref.collection('setLists'),
        packingList:           ref.collection('packingList'),
        packingCategoryColors: ref.collection('packingCategoryColors'),
        menuItems:             ref.collection('menuItems'),
        printedMaterials:      ref.collection('printedMaterials'),
        digitalAssets:         ref.collection('digitalAssets'),
        guests:                ref.collection('guests'),
        seatingTables:         ref.collection('seatingTables'),
        invitees:              ref.collection('invitees'),
        intake:                ref.collection('intake'),
        quoteLines:            ref.collection('quoteLines'),
    };
    state.currentEventId = eventId;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    const _setup = (name, fn) => { try { fn(); } catch(e) { console.error('SETUP CRASH in ' + name + ':', e); } };
    _setup('setupNavigation', setupNavigation);
    _setup('setupHamburgerMenu', setupHamburgerMenu);
    _setup('setupModals', setupModals);
    _setup('setupCountdown', setupCountdown);
    _setup('setupFormHandlers', setupFormHandlers);
    _setup('setupDayTabs', setupDayTabs);
    _setup('setupVendorFilters', setupVendorFilters);
    _setup('setupStageTabs', setupStageTabs);
    _setup('setupExportAndPrint', setupExportAndPrint);
    _setup('setupKeyboardShortcuts', setupKeyboardShortcuts);
    _setup('setupVenueMap', setupVenueMap);
    _setup('setupSetListPage', setupSetListPage);

    // Read saved session before anything else runs
    const savedEventId = localStorage.getItem('lastEventId');

    document.querySelector('.nav-menu').classList.add('hub-mode');
    loadSeasons();
    loadEvents();
    migrateGlobalDirectories().then(() => {
        loadStaffDirectory();
        loadPerformerDirectory();
        loadRoleCategoryMap();
    });

    if (savedEventId) {
        // Show overlay immediately so the hub never flashes
        const loader = document.getElementById('session-loader');
        if (loader) loader.style.display = 'flex';
        enterEvent(savedEventId)
            .then(() => { if (loader) loader.style.display = 'none'; })
            .catch(() => {
                localStorage.removeItem('lastEventId');
                localStorage.removeItem('lastPage');
                if (loader) loader.style.display = 'none';
                switchPage('events-hub');
            });
    } else {
        switchPage('events-hub');
    }
    // Run migration in the background; the live events listener will pick up any new docs
    migrateToMultiEvent()
        .catch(e => console.warn('migrateToMultiEvent skipped:', e));

    // Browser back/forward navigation
    window.addEventListener('hashchange', () => {
        const page = location.hash.replace('#', '');
        if (page && document.getElementById(page) && page !== state.currentPage) {
            switchPage(page);
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === page));
            updateNavGroupIndicators();
        }
    });
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
    // Auto-expand all nav groups so all pages are visible
    document.querySelectorAll('.nav-group').forEach(g => g.classList.add('open'));
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
    // Guard: non-hub pages require an active event
    if (pageName !== 'events-hub' && !state.currentEventId) {
        pageName = 'events-hub';
    }

    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = pageName;
        window.location.hash = pageName;
        // Persist so hard-refresh returns to the same spot
        if (pageName !== 'events-hub') localStorage.setItem('lastPage', pageName);

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
        state.guestEditingId = null;
        state.guestRenderPending = false;
        state.guestPendingNew = {};

        // Refresh data for the page
        if (pageName === 'dashboard') updateDashboard();
        if (pageName === 'guests') initGuestPage();
        if (pageName === 'vendors') {
            state.vendorFilter = 'all';
            state.vendorSearch = '';
            state.vendorView = 'grid';
            state.vendorScheduleFilter = 'all';
            state.vendorScheduleEditingRowId = null;
            state.vendorScheduleRenderPending = false;
            state.pendingVendorScheduleEdit = null;
            state.vendorGanttDay = 'saturday';
            const vendorSearchInput = document.getElementById('vendor-search-input');
            if (vendorSearchInput) vendorSearchInput.value = '';
            const vendorFilterBtns = document.querySelectorAll('#vendor-card-view .vendor-filter-btn');
            vendorFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
            const vendorCardBtn = document.getElementById('vendor-card-view-btn');
            const vendorScheduleBtn = document.getElementById('vendor-schedule-view-btn');
            if (vendorCardBtn) vendorCardBtn.classList.add('active');
            if (vendorScheduleBtn) vendorScheduleBtn.classList.remove('active');
            const vendorCardContainer = document.getElementById('vendor-card-view');
            const vendorScheduleContainer = document.getElementById('vendor-schedule-view');
            if (vendorCardContainer) vendorCardContainer.style.display = '';
            if (vendorScheduleContainer) vendorScheduleContainer.style.display = 'none';
            renderVendors();
        }
        if (pageName === 'staff') {
            state.staffSearch = '';
            state.staffFilter = 'all';
            const staffSearchInput = document.getElementById('staff-search-input');
            if (staffSearchInput) staffSearchInput.value = '';
            updateStaffUnfilledCard();
            renderStaff();
        }
        if (pageName === 'budget') renderBudget();
        if (pageName === 'timeline') {
            state.timelineAnimateRows = true;
            state.currentDay = state.timelineDays?.[0]?.id ?? 'Thursday';
            const dayTabs = document.querySelectorAll('.day-tab[data-day]');
            dayTabs.forEach(t => t.classList.remove('active'));
            if (dayTabs.length > 0) dayTabs[0].classList.add('active');
            renderTimeline();
        }
        if (pageName === 'technical-cue-sheet') {
            state.cueSheetEditingRowId = null;
            state.cueSheetRenderPending = false;
            const showHiddenCheckbox = document.getElementById('cue-show-hidden-checkbox');
            if (showHiddenCheckbox) showHiddenCheckbox.checked = state.cueSheetShowHidden;
            renderCueSheet();
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
        if (pageName === 'venue-map') {
            if (state.vmCanvas) {
                // Re-fit canvas to container in case viewport changed, then render
                requestAnimationFrame(() => { vmFitCanvasToContainer(); state.vmCanvas?.renderAll(); });
            } else {
                vmInitCanvas();
            }
        }
        if (pageName === 'printed-materials') {
            state.printSearch = '';
            state.printStatusFilter = 'all';
            state.printVendorFilter = 'all';
            const printSearchInput = document.getElementById('print-search-input');
            if (printSearchInput) printSearchInput.value = '';
            const printStatusSelect = document.getElementById('print-status-filter');
            if (printStatusSelect) printStatusSelect.value = 'all';
            const printVendorSelect = document.getElementById('print-vendor-filter');
            if (printVendorSelect) printVendorSelect.value = 'all';
            renderPrintedMaterials();
        }
        if (pageName === 'seating') {
            state.seatingEditingRowId = null;
            state.seatingRenderPending = false;
            state.pendingNewGuestRow = {};
            state.seatingSearch = '';
            state.seatingUnassignedOnly = false;
            const sInput = document.getElementById('seating-search-input');
            if (sInput) sInput.value = '';
            const uOnly = document.getElementById('seating-unassigned-only');
            if (uOnly) uOnly.checked = false;
            renderSeatingTable();
            updateSeatingStats();
            if (state.seatingView === 'map') {
                setTimeout(() => seatingInitCanvas(), 50);
            }
        }
        if (pageName === 'digital-assets') {
            state.daSearch = '';
            state.daStatusFilter = 'all';
            const daSearchInput = document.getElementById('da-search-input');
            if (daSearchInput) daSearchInput.value = '';
            const daStatusSelect = document.getElementById('da-status-filter');
            if (daStatusSelect) daStatusSelect.value = 'all';
            renderDigitalAssets();
        }
        if (pageName === 'quote') renderQuote();
    }
}

// Keep the dashboard countdown live — re-render once per minute so the
// display stays accurate in events with no Firestore activity.
function setupCountdown() {
    setInterval(() => {
        if (state.currentPage === 'dashboard') renderDashboard();
    }, 60000);
}

// Generic utility functions for data loading
function setupCollectionListener(collectionKey, stateKey, renderCallbacks = []) {
    if (!collections[collectionKey]) {
        console.warn(`Collection '${collectionKey}' not configured — skipping listener`);
        return;
    }
    const unsub = collections[collectionKey].onSnapshot((snapshot) => {
        state[stateKey] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderCallbacks.forEach(callback => callback());
    }, (error) => {
        console.error(`Error loading ${collectionKey}:`, error);
    });
    _activeListeners.push(unsub);
}

// Load all data from Firestore (tears down any existing listeners first)
function loadAllData() {
    teardownListeners();
    setupCollectionListener('budget', 'budget', [renderBudget, renderVendors, updateDashboard, renderStaff, backfillLinkedContactInfo]);
    setupCollectionListener('timeline', 'timeline', [backfillTimelineOrder, renderTimeline, renderCueSheet, updateDashboard]);
    setupCollectionListener('mainStageInputs', 'mainStageInputs', [renderStageInputs]);
    setupCollectionListener('cocktailStageInputs', 'cocktailStageInputs', [renderStageInputs]);
    setupCollectionListener('staff', 'staff', [renderStaff, renderVendors, backfillLinkedContactInfo]);
    setupCollectionListener('setLists', 'setLists', [renderSetLists, updateDashboard, renderTimeline]);
    setupCollectionListener('packingList', 'packingList', [renderPackingList]);
    setupCollectionListener('packingCategoryColors', 'packingCategoryColors', [renderPackingList]);
    setupCollectionListener('menuItems', 'menuItems', [renderMenu, updateDashboard]);
    setupCollectionListener('printedMaterials', 'printedMaterials', [renderPrintedMaterials]);
    setupCollectionListener('digitalAssets', 'digitalAssets', [renderDigitalAssets]);
    setupCollectionListener('guests', 'guests', [renderSeatingTable, renderSeatingMap, renderSeatingPanel, updateSeatingStats]);
    setupCollectionListener('seatingTables', 'seatingTables', [renderSeatingTable, renderSeatingMap, renderSeatingPanel, updateSeatingStats]);
    setupCollectionListener('invitees', 'invitees', [renderGuestList]);
    setupCollectionListener('quoteLines', 'quoteLines', [renderQuote]);
    setupIntakeListener();
}

// ============================================================
// EVENTS HUB
// ============================================================

const LEGACY_COLLECTIONS = [
    'vendors', 'budget', 'timeline', 'mainStageInputs', 'cocktailStageInputs',
    'staff', 'venueMapLayers', 'setLists', 'packingList',
    'packingCategoryColors', 'menuItems', 'printedMaterials', 'digitalAssets',
    'guests', 'seatingTables', 'event-info',
];

async function migrateToMultiEvent() {
    const eventId = 'ymu-gala-2026';
    const eventRef = eventsCollection.doc(eventId);

    // Ensure the event document itself exists (idempotent)
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
        await eventRef.set({
            name: 'YMU Gala 2026',
            date: '2026-04-25',
            lead: '',
            phase: 'phase-7',
            enabledPages: ALL_PAGES.map(p => p.id),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } else if (eventDoc.data().migratedAt) {
        // Migration already completed — migratedAt is set only after a full successful run
        return;
    }

    // Check every legacy collection so no module's data is silently skipped
    const legacyChecks = await Promise.all(
        LEGACY_COLLECTIONS.map(c => db.collection(c).limit(1).get())
    );
    if (legacyChecks.every(s => s.empty)) return;

    showToast('Syncing your existing Gala data…', 'info');

    for (const collName of LEGACY_COLLECTIONS) {
        const snap = await db.collection(collName).get();
        if (snap.empty) continue;
        const dest = eventRef.collection(collName);
        for (let i = 0; i < snap.docs.length; i += 499) {
            const batch = db.batch();
            snap.docs.slice(i, i + 499).forEach(doc => batch.set(dest.doc(doc.id), doc.data()));
            await batch.commit();
        }

    }

    await eventRef.update({ migratedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('Data synced — all your Gala info is ready!', 'success');
}

async function loadSeasons() {
    // Render defaults immediately so the nav is populated right away
    renderSeasonNav();
    try {
        const doc = await db.collection('config').doc('seasons').get({ source: 'server' });
        if (doc.exists && doc.data().list?.length) {
            state.seasons = doc.data().list;
        } else {
            await db.collection('config').doc('seasons').set({ list: state.seasons });
        }
    } catch (e) { /* use defaults */ }
    // The failed-inquiries archive is always available, even on installs
    // that predate the feature.
    if (!state.seasons.includes(FAILED_INQUIRIES_SEASON)) {
        state.seasons.push(FAILED_INQUIRIES_SEASON);
        try { await db.collection('config').doc('seasons').set({ list: state.seasons }); } catch (e) { /* use defaults */ }
    }
    renderSeasonNav();
}

function renderSeasonNav() {
    const list = document.getElementById('hub-seasons-list');
    if (!list) return;
    list.innerHTML = state.seasons.map(s =>
        `<button class="hub-season-link ${s === state.currentSeason ? 'active' : ''}${s === FAILED_INQUIRIES_SEASON ? ' hub-season-failed' : ''}" data-season="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join('');
    list.querySelectorAll('button[data-season]').forEach(btn => {
        btn.addEventListener('click', () => window.switchSeason(btn.dataset.season));
    });
}

window.switchSeason = async function(season) {
    const previousSeason = state.currentSeason;
    state.currentSeason = season;
    // Failed Inquiries is just an archive bin, not a working season — skip
    // the staff/performer directory carry-forward that real seasons get.
    const isArchive = season === FAILED_INQUIRIES_SEASON || previousSeason === FAILED_INQUIRIES_SEASON;
    if (previousSeason && previousSeason !== season && !isArchive) {
        const check = await db.collection('seasons').doc(season).collection('staffDirectory').limit(1).get();
        if (check.empty) await copySeasonData(previousSeason, season);
    }
    loadStaffDirectory();
    loadPerformerDirectory();
    loadRoleCategoryMap();
    renderSeasonNav();
    renderHub();
    closeHamburgerMenu();
};

// One-time migration: move old global flat collections into the current season's subcollections.
// Runs silently on startup; skips if the season subcollection already has data.
async function migrateGlobalDirectories() {
    if (!state.currentSeason) return;
    const legacyMap = {
        staffDirectory:      db.collection('staffDirectory'),
        jobTemplates:        db.collection('jobTemplates'),
        performerDirectory:  db.collection('performerDirectory'),
    };
    for (const [col, legacyRef] of Object.entries(legacyMap)) {
        const destRef  = db.collection('seasons').doc(state.currentSeason).collection(col);
        const destSnap = await destRef.limit(1).get();
        if (!destSnap.empty) continue; // already migrated
        const srcSnap  = await legacyRef.get();
        if (srcSnap.empty) continue;   // nothing to migrate
        const batch = db.batch();
        srcSnap.docs.forEach(doc => batch.set(destRef.doc(doc.id), doc.data()));
        await batch.commit();
    }
}

async function copySeasonData(fromSeason, toSeason) {
    const colNames = ['staffDirectory', 'jobTemplates', 'performerDirectory'];
    for (const col of colNames) {
        const fromRef = db.collection('seasons').doc(fromSeason).collection(col);
        const toRef   = db.collection('seasons').doc(toSeason).collection(col);
        const snap = await fromRef.get();
        if (snap.empty) continue;
        const batch = db.batch();
        snap.docs.forEach(doc => batch.set(toRef.doc(doc.id), doc.data()));
        await batch.commit();
    }
}

window.promptAddSeason = async function() {
    const label = prompt('Enter season label (e.g. 2026-2027):');
    if (!label || !label.trim()) return;
    const trimmed = label.trim();
    if (state.seasons.includes(trimmed)) { showToast('Season already exists', 'error'); return; }
    const previousSeason = state.currentSeason;
    state.seasons.push(trimmed);
    try {
        await db.collection('config').doc('seasons').set({ list: state.seasons });
        if (previousSeason) await copySeasonData(previousSeason, trimmed);
    } catch (e) { showToast('Error saving season', 'error'); return; }
    state.currentSeason = trimmed;
    loadStaffDirectory();
    loadPerformerDirectory();
    loadRoleCategoryMap();
    renderSeasonNav();
    renderHub();
    closeHamburgerMenu();
};

function parseFirestoreValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseFirestoreValue);
    if ('mapValue' in v) {
        const obj = {};
        Object.entries(v.mapValue.fields || {}).forEach(([k, fv]) => { obj[k] = parseFirestoreValue(fv); });
        return obj;
    }
    return null;
}

function loadEvents() {
    if (_eventsListener) { try { _eventsListener(); } catch (e) {} _eventsListener = null; }

    // Visual confirmation that this function ran
    const el = document.getElementById('events-hub-content');
    if (el) el.innerHTML = '<p style="padding:2rem;color:#888">Connecting to database…</p>';

    _eventsListener = eventsCollection.onSnapshot(snap => {
        state.events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        renderSeasonNav();
        renderHub();
    }, e => {
        const el = document.getElementById('events-hub-content');
        if (el) el.innerHTML = '<p style="padding:2rem;color:#c0392b">Could not reach database: ' + e.message + '</p>';
    });

    db.collection('blockDates').onSnapshot(snap => {
        state.blockDates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderHub();
    });

    db.collection('inventory').onSnapshot(snap => {
        state.inventory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const _pcats = getPackingCategories();
                const ai = _pcats.indexOf(a.category || 'Misc');
                const bi = _pcats.indexOf(b.category || 'Misc');
                const catDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                return catDiff !== 0 ? catDiff : (a.name || '').localeCompare(b.name || '');
            });
        renderPackingList();
        if (document.getElementById('inv-picker-modal')?.classList.contains('is-open')) {
            renderInventoryPickerList();
        }
    });
}

function renderHub() {
    const el = document.getElementById('events-hub-content');
    if (!el) return;

    // Update page heading to reflect current season
    const heading = document.querySelector('#events-hub .page-header h1');
    if (heading) heading.textContent = state.currentSeason + ' Events';

    const seasonEvents = (state.events || [])
        .filter(ev => (ev.season || '2025-2026') === state.currentSeason)
        .sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return -1;
            if (!b.date) return 1;
            return a.date.localeCompare(b.date);
        });

    const seasonBlocks = (state.blockDates || [])
        .filter(b => (b.season || '2025-2026') === state.currentSeason);

    if (seasonEvents.length === 0 && seasonBlocks.length === 0) {
        el.innerHTML = `<div class="hub-empty"><p>No events in ${escapeHtml(state.currentSeason)} yet.</p></div>`;
        return;
    }

    const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    // Build event rows tagged with their sort key
    const eventRows = seasonEvents.map(ev => {
        const phase = PHASES.find(p => p.id === ev.phase) || PHASES[0];
        const phaseOptions = PHASES.map(ph =>
            `<option value="${ph.id}" ${ph.id === ev.phase ? 'selected' : ''}>${ph.label}</option>`
        ).join('');
        const rowAccent = ev.rowColor || '';
        const isFailed = ev.season === FAILED_INQUIRIES_SEASON;
        return {
            sortKey: ev.date || '',
            html: `<tr class="hub-event-row" style="${rowAccent ? 'box-shadow:inset 2px 0 0 ' + rowAccent : ''}">
                <td class="hub-cell-date hub-cell-editable" onclick="editHubCell(this,'${ev.id}','date')" data-value="${escapeHtml(ev.date || '')}" title="Click to edit">${fmtDate(ev.date)}</td>
                <td class="hub-cell-name hub-cell-editable" onclick="editHubCell(this,'${ev.id}','name')" data-value="${escapeHtml(ev.name || '')}" title="Click to edit">
                    ${escapeHtml(ev.name || '—')}
                    ${ev.failureReason ? `<div class="hub-fail-reason" title="${escapeHtml(ev.failureReason)}">${escapeHtml(ev.failureReason)}</div>` : ''}
                </td>
                <td class="hub-cell-groups hub-cell-editable" onclick="editHubCell(this,'${ev.id}','performingGroups')" data-value="${escapeHtml(ev.performingGroups || '')}" title="Click to edit">${escapeHtml(ev.performingGroups || '—')}</td>
                <td class="hub-cell-phase">
                    <select class="phase-select" style="background:${phase.color};color:${phase.text}"
                        onchange="updateEventPhase('${ev.id}', this.value, this)">
                        ${phaseOptions}
                    </select>
                </td>
                <td class="hub-cell-actions">
                    <button class="hub-row-color-btn" onclick="openRowColorPicker(event,'event','${ev.id}')" title="Row color">&#9681;</button>
                    <button class="hub-fail-btn" onclick="openFailInquiryPanel(event,'${ev.id}')" title="${isFailed ? 'Edit failure reason, or delete' : "Didn't move forward — archive or delete"}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
                    </button>
                    ${isFailed ? `<button class="hub-reactivate-btn" onclick="reactivateEvent('${ev.id}')" title="Move back to an active season">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    </button>` : ''}
                    <span class="hub-actions-divider"></span>
                    <button class="hub-enter-btn" onclick="enterEvent('${ev.id}')">Enter &rarr;</button>
                </td>
            </tr>`
        };
    });

    // Build block date rows tagged with their sort key
    const blockRows = seasonBlocks.map(b => {
        const dateStr = b.endDate && b.endDate !== b.startDate
            ? fmtDate(b.startDate) + ' – ' + fmtDate(b.endDate)
            : fmtDate(b.startDate);
        const isHold    = b.type === 'hold';
        const badgeBg   = isHold ? 'rgba(180,130,0,0.18)' : 'rgba(60,100,180,0.18)';
        const badgeText = isHold ? '#c9a330' : '#7aaae8';
        const badgeLabel = isHold ? 'Hold' : 'Note';
        const rowAccent = b.rowColor || '';
        return {
            sortKey: b.startDate || '',
            html: `<tr class="hub-block-row" style="${rowAccent ? 'box-shadow:inset 2px 0 0 ' + rowAccent : ''}">
                <td class="hub-cell-date">${dateStr}</td>
                <td class="hub-cell-name hub-block-label">${escapeHtml(b.label || '—')}</td>
                <td class="hub-cell-groups"></td>
                <td class="hub-cell-phase">
                    <span class="phase-badge" style="background:${badgeBg};color:${badgeText}">${badgeLabel}</span>
                </td>
                <td class="hub-cell-actions">
                    <button class="hub-row-color-btn" onclick="openRowColorPicker(event,'block','${b.id}')" title="Row color">&#9681;</button>
                    <button class="hub-block-delete-btn" onclick="deleteBlockDate('${b.id}')" title="Remove">&#x2715;</button>
                </td>
            </tr>`
        };
    });

    // Merge and sort all rows by date
    const allRows = [...eventRows, ...blockRows]
        .sort((a, b) => {
            if (!a.sortKey && !b.sortKey) return 0;
            if (!a.sortKey) return 1;
            if (!b.sortKey) return -1;
            return a.sortKey.localeCompare(b.sortKey);
        })
        .map(r => r.html)
        .join('');

    el.innerHTML = `<table class="hub-table">
        <thead><tr>
            <th>Date</th><th>Event Name</th><th>Performing Groups</th><th>Phase</th><th></th>
        </tr></thead>
        <tbody>${allRows}</tbody>
    </table>`;
}

// ── Block Dates ───────────────────────────────────────────────────
window.deleteBlockDate = async function(id) {
    if (!confirm('Delete this date marker?')) return;
    const b = state.blockDates.find(b => b.id === id);
    if (b) {
        const { id: _id, ...data } = b;
        pushUndo('Delete date marker', async () => { await db.collection('blockDates').doc(id).set(data); });
    }
    try {
        await db.collection('blockDates').doc(id).delete();
        showToast('Date marker deleted — Cmd+Z to undo');
    } catch(e) {
        console.error('Failed to delete block date:', e);
        showToast('Error removing block date', 'error');
    }
};

// ── Row color picker ──────────────────────────────────────────────
const ROW_COLORS = [
    { label: 'None',   value: '' },
    { label: 'Yellow', value: '#c8a330' },
    { label: 'Green',  value: '#5bb567' },
    { label: 'Blue',   value: '#4d8fd6' },
    { label: 'Red',    value: '#d05555' },
    { label: 'Purple', value: '#8b6fd4' },
    { label: 'Orange', value: '#d4863a' },
];

let _colorPickerTarget = null;

window.openRowColorPicker = function(e, type, id) {
    e.stopPropagation();
    const existing = document.getElementById('hub-row-color-picker');
    if (existing) {
        const isSame = existing.dataset.id === id;
        existing.remove();
        if (isSame) return;
    }

    _colorPickerTarget = { type, id };
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const picker = document.createElement('div');
    picker.id = 'hub-row-color-picker';
    picker.dataset.id = id;
    picker.innerHTML = ROW_COLORS.map(c => `
        <button class="hub-color-swatch${c.value === '' ? ' hub-color-clear' : ''}"
            style="${c.value ? 'background:' + c.value + ';border-color:' + c.value.replace('0.13','0.5') : ''}"
            onclick="applyRowColor('${type}','${id}','${c.value}')"
            title="${c.label}">
            ${c.value === '' ? '✕' : ''}
        </button>`).join('');

    picker.style.cssText = `position:fixed;top:${rect.top + rect.height / 2 - 19}px;right:${window.innerWidth - rect.left + 8}px;z-index:9999`;
    document.body.appendChild(picker);

    setTimeout(() => document.addEventListener('click', _closePicker, { once: true }), 0);
};

function _closePicker() {
    document.getElementById('hub-row-color-picker')?.remove();
}

window.applyRowColor = async function(type, id, color) {
    document.getElementById('hub-row-color-picker')?.remove();
    try {
        if (type === 'event') {
            const ev = state.events.find(e => e.id === id);
            const prev = ev?.rowColor || '';
            if (ev) ev.rowColor = color;
            await eventsCollection.doc(id).update({ rowColor: color });
            pushUndo('Row color', async () => { await eventsCollection.doc(id).update({ rowColor: prev }); });
        } else {
            const b = state.blockDates.find(b => b.id === id);
            const prev = b?.rowColor || '';
            if (b) b.rowColor = color;
            await db.collection('blockDates').doc(id).update({ rowColor: color });
            pushUndo('Row color', async () => { await db.collection('blockDates').doc(id).update({ rowColor: prev }); });
        }
        renderHub();
    } catch(e) {
        console.error('Failed to set row color:', e);
    }
};
// ─────────────────────────────────────────────────────────────────

// ── Failed Inquiries ────────────────────────────────────────────
window.openFailInquiryPanel = function(e, eventId) {
    e.stopPropagation();
    const existing = document.getElementById('hub-fail-picker');
    if (existing) {
        const isSame = existing.dataset.id === eventId;
        existing.remove();
        if (isSame) return;
    }

    const ev = state.events.find(ev => ev.id === eventId);
    if (!ev) return;

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const panel = document.createElement('div');
    panel.id = 'hub-fail-picker';
    panel.dataset.id = eventId;
    panel.innerHTML = `
        <div class="hub-fail-picker-heading">This event isn't moving forward?</div>
        <textarea class="hub-fail-picker-textarea" placeholder="Reason (optional)">${escapeHtml(ev.failureReason || '')}</textarea>
        <div class="hub-fail-picker-actions">
            <button type="button" class="hub-fail-picker-confirm">Move to Failed Inquiries</button>
            <button type="button" class="hub-fail-picker-cancel">Cancel</button>
        </div>
        <div class="hub-fail-picker-danger-zone">
            <button type="button" class="hub-fail-picker-delete">Delete permanently</button>
        </div>
    `;
    panel.style.cssText = `position:fixed;top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;z-index:9999`;
    document.body.appendChild(panel);

    const textarea = panel.querySelector('.hub-fail-picker-textarea');
    textarea.focus();

    panel.querySelector('.hub-fail-picker-cancel').addEventListener('click', () => panel.remove());
    panel.querySelector('.hub-fail-picker-confirm').addEventListener('click', () => {
        markEventFailed(eventId, textarea.value.trim());
        panel.remove();
    });
    panel.querySelector('.hub-fail-picker-delete').addEventListener('click', () => {
        panel.remove();
        window.deleteEvent(eventId, ev.name || 'this event');
    });

    setTimeout(() => document.addEventListener('click', _closeFailPicker, { once: true }), 0);
};

function _closeFailPicker(e) {
    const panel = document.getElementById('hub-fail-picker');
    if (panel && !panel.contains(e.target)) panel.remove();
}

async function markEventFailed(eventId, reason) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const prevSeason = ev.season || state.currentSeason;
    const prevReason = ev.failureReason || '';
    if (prevSeason === FAILED_INQUIRIES_SEASON && reason === prevReason) return;

    ev.season = FAILED_INQUIRIES_SEASON;
    ev.previousSeason = prevSeason;
    ev.failureReason = reason;
    renderHub();

    try {
        await eventsCollection.doc(eventId).update({
            season: FAILED_INQUIRIES_SEASON,
            previousSeason: prevSeason,
            failureReason: reason,
            failedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        showToast(`"${ev.name || 'Event'}" moved to Failed Inquiries — Cmd+Z to undo`);
        pushUndo('Mark event failed', async () => {
            const current = state.events.find(e => e.id === eventId);
            if (current) { current.season = prevSeason; current.failureReason = prevReason; }
            renderHub();
            await eventsCollection.doc(eventId).update({
                season: prevSeason,
                failureReason: prevReason,
                failedAt: firebase.firestore.FieldValue.delete(),
            });
        });
    } catch (err) {
        console.error('Error marking event failed:', err);
        ev.season = prevSeason;
        ev.failureReason = prevReason;
        renderHub();
        showToast('Error updating event', 'error');
    }
}

window.reactivateEvent = async function(eventId) {
    const ev = state.events.find(e => e.id === eventId);
    if (!ev) return;

    const targetSeason = ev.previousSeason || state.currentSeason;
    const prevReason = ev.failureReason || '';

    ev.season = targetSeason;
    ev.failureReason = '';
    renderHub();

    try {
        await eventsCollection.doc(eventId).update({
            season: targetSeason,
            failureReason: firebase.firestore.FieldValue.delete(),
        });
        showToast(`"${ev.name || 'Event'}" reactivated — Cmd+Z to undo`);
        pushUndo('Reactivate event', async () => {
            const current = state.events.find(e => e.id === eventId);
            if (current) { current.season = FAILED_INQUIRIES_SEASON; current.failureReason = prevReason; }
            renderHub();
            await eventsCollection.doc(eventId).update({ season: FAILED_INQUIRIES_SEASON, failureReason: prevReason });
        });
    } catch (err) {
        console.error('Error reactivating event:', err);
        ev.season = FAILED_INQUIRIES_SEASON;
        ev.failureReason = prevReason;
        renderHub();
        showToast('Error reactivating event', 'error');
    }
};
// ─────────────────────────────────────────────────────────────────

window.editHubCell = function(cell, eventId, field) {
    const currentValue = cell.dataset.value || '';
    if (cell.querySelector('input')) return; // already editing
    const isDate = field === 'date';
    const input = document.createElement('input');
    input.type = isDate ? 'date' : 'text';
    input.value = currentValue;
    input.className = 'hub-cell-input';
    if (!isDate) input.placeholder = field === 'name' ? 'Event name' : field === 'lead' ? 'Lead name' : field === 'performingGroups' ? 'e.g. The Jazz Quartet, House Band' : '';
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (!isDate) input.select();

    const save = async () => {
        const newVal = input.value.trim();
        const ev = state.events.find(e => e.id === eventId);
        if (ev && newVal !== currentValue) {
            ev[field] = newVal;
            try {
                await eventsCollection.doc(eventId).update({
                    [field]: newVal,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            } catch (e) {
                console.error('Failed to update event:', e);
                showToast('Error saving', 'error');
            }
        }
        renderHub();
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentValue; input.blur(); }
    });
    input.addEventListener('click', e => e.stopPropagation());
};

window.updateEventPhase = async function(eventId, phaseId, selectEl) {
    const ev = state.events.find(e => e.id === eventId);
    const prevPhaseId = ev?.phase || '';
    const phase = PHASES.find(p => p.id === phaseId);
    if (phase && selectEl) {
        selectEl.style.background = phase.color;
        selectEl.style.color = phase.text;
    }
    try {
        await eventsCollection.doc(eventId).update({
            phase: phaseId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (ev) ev.phase = phaseId;
        pushUndo('Phase change', async () => {
            await eventsCollection.doc(eventId).update({ phase: prevPhaseId });
            if (ev) ev.phase = prevPhaseId;
            renderHub();
        });
    } catch (e) {
        console.error('Failed to update phase:', e);
    }
};

const EVENT_SUBCOLLECTIONS = [
    'vendors', 'budget', 'timeline', 'mainStageInputs', 'cocktailStageInputs',
    'staff', 'event-info', 'stagePlots', 'venueMapLayers', 'setLists',
    'packingList', 'packingCategoryColors', 'menuItems', 'printedMaterials',
    'digitalAssets', 'guests', 'seatingTables', 'invitees', 'intake',
];

async function deleteSubcollectionDocs(coll, docs) {
    for (let i = 0; i < docs.length; i += 499) {
        const batch = db.batch();
        docs.slice(i, i + 499).forEach(d => batch.delete(coll.doc(d.id)));
        await batch.commit();
    }
}

// Reads + deletes each subcollection in one pass (no separate snapshot-then-delete
// traversal) and does all subcollections concurrently so deleting a real event with
// lots of data doesn't take minutes.
async function deleteEventCapturingSnapshot(eventId) {
    const eventRef = eventsCollection.doc(eventId);
    const eventSnap = await eventRef.get();
    const eventData = eventSnap.exists ? eventSnap.data() : null;

    const subcollections = {};
    await Promise.all(EVENT_SUBCOLLECTIONS.map(async (collName) => {
        const coll = eventRef.collection(collName);
        const snap = await coll.get();
        const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

        if (collName === 'stagePlots') {
            await Promise.all(docs.map(async (plotDoc) => {
                const objColl = coll.doc(plotDoc.id).collection('objects');
                const objSnap = await objColl.get();
                plotDoc.objects = objSnap.docs.map(od => ({ id: od.id, data: od.data() }));
                await deleteSubcollectionDocs(objColl, plotDoc.objects);
            }));
        }

        await deleteSubcollectionDocs(coll, docs);
        subcollections[collName] = docs;
    }));

    await eventRef.delete();
    return { eventData, subcollections };
}

async function restoreEventFromSnapshot(eventId, snapshot) {
    const eventRef = eventsCollection.doc(eventId);
    if (snapshot.eventData) {
        await eventRef.set(snapshot.eventData);
    }

    await Promise.all(Object.entries(snapshot.subcollections).map(async ([collName, docs]) => {
        const coll = eventRef.collection(collName);
        for (let i = 0; i < docs.length; i += 499) {
            const batch = db.batch();
            docs.slice(i, i + 499).forEach(d => batch.set(coll.doc(d.id), d.data));
            await batch.commit();
        }

        if (collName === 'stagePlots') {
            await Promise.all(docs.map(async (plotDoc) => {
                if (!plotDoc.objects || !plotDoc.objects.length) return;
                const objRef = coll.doc(plotDoc.id).collection('objects');
                for (let i = 0; i < plotDoc.objects.length; i += 499) {
                    const batch = db.batch();
                    plotDoc.objects.slice(i, i + 499).forEach(od => batch.set(objRef.doc(od.id), od.data));
                    await batch.commit();
                }
            }));
        }
    }));
}

window.deleteEvent = async function(eventId, eventName) {
    if (!confirm(`Delete "${eventName}"?\n\nThis will remove the event. You can undo with Cmd+Z right after.`)) return;
    showToast(`Deleting "${eventName}"…`, 'info');
    try {
        const snapshot = await deleteEventCapturingSnapshot(eventId);
        pushUndo(`Delete event "${eventName}"`, async () => {
            await restoreEventFromSnapshot(eventId, snapshot);
        });
        showToast(`"${eventName}" deleted — Cmd+Z to undo`);
    } catch (e) {
        showToast('Error deleting event. Please try again.', 'error');
    }
};

window.deleteCurrentEvent = async function() {
    const event = state.activeEvent;
    if (!event) return;
    if (!confirm(`Delete "${event.name}"?\n\nThis will remove the event. You can undo with Cmd+Z right after.`)) return;
    closeEventSettings();
    showToast(`Deleting "${event.name}"…`, 'info');
    try {
        const snapshot = await deleteEventCapturingSnapshot(event.id);
        pushUndo(`Delete event "${event.name}"`, async () => {
            await restoreEventFromSnapshot(event.id, snapshot);
        });
        showToast(`"${event.name}" deleted — Cmd+Z to undo`);
        backToHub();
    } catch (e) {
        showToast('Error deleting event. Please try again.', 'error');
    }
};

async function enterEvent(eventId) {
    const snap = await eventsCollection.doc(eventId).get();
    if (!snap.exists) return;
    const event = { id: snap.id, ...snap.data() };
    state.activeEvent = event;
    state.globalUndoStack = [];
    // Reset timeline days — will be initialized lazily on first renderTimeline()
    state.timelineDays = null;
    state.currentDay = 'Thursday';

    setActiveEvent(eventId);
    localStorage.setItem('lastEventId', eventId);
    vmResetCanvas();

    // Update nav branding
    const brand = document.querySelector('.nav-brand');
    brand.innerHTML = `
        <div class="sb-eyebrow">YMU Shows</div>
        <div class="sb-brand-title">${escapeHtml(event.name || 'Event')}</div>
        <div class="sb-prog">
            <div class="sb-track"><div class="sb-fill" id="sec-progress-fill" style="width:0%"></div></div>
            <span class="sb-pct" id="sec-progress-pct">0%</span>
        </div>
        <button class="nav-back-btn" onclick="backToHub()">&#8592; All Events</button>`;

    // Hide legacy event card if present
    const eventCard = document.getElementById('sidebar-event-card');
    if (eventCard) eventCard.style.display = 'none';

    document.getElementById('nav-event-settings-btn').style.display = 'flex';
    document.getElementById('sb-event-settings-btn').style.display = 'flex';
    document.querySelector('.nav-menu').classList.remove('hub-mode');

    updateNavForEvent(event);

    // Zero out stale per-event data before new listeners fire so the
    // restored page never briefly shows the previous event's rows.
    [
        'budget', 'timeline', 'mainStageInputs', 'cocktailStageInputs',
        'staff', 'setLists', 'packingList', 'packingCategoryColors',
        'menuItems', 'printedMaterials', 'digitalAssets', 'guests', 'seatingTables',
        'invitees',
    ].forEach(k => { state[k] = []; });

    loadAllData();

    // Update countdown target to this event's date (null if undated)
    window._hubEventDate = event.date ? new Date(event.date + 'T18:00:00') : null;

    const firstPage = (event.enabledPages || []).includes('dashboard')
        ? 'dashboard'
        : ((event.enabledPages || [])[0] || 'dashboard');
    const savedPage = localStorage.getItem('lastPage');
    const enabledPages = event.enabledPages || [];
    const pageToRestore = (savedPage && enabledPages.includes(savedPage)) ? savedPage : firstPage;
    switchPage(pageToRestore);
}

async function backToHub() {
    teardownListeners();
    state.currentEventId = null;
    state.activeEvent = null;
    collections = {};
    localStorage.removeItem('lastEventId');
    localStorage.removeItem('lastPage');

    const brand = document.querySelector('.nav-brand');
    brand.innerHTML = `<div class="sb-eyebrow">YMU Shows</div><div class="sb-brand-title">Events</div>`;
    document.getElementById('nav-event-settings-btn').style.display = 'none';
    document.getElementById('sb-event-settings-btn').style.display = 'none';
    document.querySelector('.nav-menu').classList.add('hub-mode');
    document.querySelectorAll('.nav-link[data-page]').forEach(l => {
        l.classList.remove('nav-hidden', 'nav-link--disabled', 'nav-link--locked');
        l.querySelector('.nav-lock-icon')?.remove();
    });
    document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('nav-hidden'));
    const ec = document.getElementById('sidebar-event-card');
    if (ec) ec.style.display = 'none';

    switchPage('events-hub');
    loadEvents();
}

function updateNavForEvent(event) {
    const enabled = new Set(event.enabledPages || []);

    // Hide disabled pages, show enabled ones
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        const isEnabled = enabled.has(link.dataset.page);
        link.classList.toggle('nav-hidden', !isEnabled);
        link.classList.remove('nav-link--locked', 'nav-link--disabled');
        link.querySelector('.nav-lock-icon')?.remove();
    });

    // Hide nav groups where every page link is hidden
    document.querySelectorAll('.nav-group').forEach(g => {
        const links = g.querySelectorAll('.nav-link[data-page]');
        const allHidden = links.length > 0 && [...links].every(l => l.classList.contains('nav-hidden'));
        g.classList.toggle('nav-hidden', allHidden);
        g.classList.remove('nav-group--all-disabled');
    });

    document.getElementById('nav-menu')?.classList.remove('nav-flat');

    // Remove locked overlay on all pages (no longer used)
    ALL_PAGES.forEach(p => {
        document.getElementById(p.id)?.classList.remove('page--locked');
    });
}

function openNewEventModal() {
    const phaseSelect = document.getElementById('new-event-phase');
    phaseSelect.innerHTML = PHASES.map(ph =>
        `<option value="${ph.id}">${ph.label}</option>`
    ).join('');

    const pagesContainer = document.getElementById('new-event-pages');
    pagesContainer.innerHTML = ALL_PAGES.map(p =>
        `<label class="page-toggle-label">
            <input type="checkbox" value="${p.id}" class="page-toggle-cb"> ${escapeHtml(p.label)}
        </label>`
    ).join('');

    document.getElementById('new-event-name').value = '';
    document.getElementById('new-event-date').value = '';
    document.getElementById('new-event-lead').value = '';
    // Reset date marker mode
    document.getElementById('new-event-is-marker').checked = false;
    document.getElementById('new-event-marker-end').value = '';
    document.getElementById('new-event-marker-type').value = 'blackout';
    document.getElementById('new-event-marker-fields').style.display = 'none';
    document.getElementById('new-event-event-fields').style.display = '';
    document.getElementById('new-event-modal-title').textContent = 'New Event';
    document.getElementById('new-event-submit-btn').textContent = 'Create Event';
    document.getElementById('new-event-name-label').innerHTML = 'Event Name <span class="required">*</span>';
    document.getElementById('new-event-date-label').textContent = 'Date';

    document.getElementById('new-event-modal').classList.add('is-open');
    requestAnimationFrame(() => {
        const body = document.querySelector('#new-event-modal .hub-modal-body');
        if (body) body.scrollTop = 0;
    });
}

window.toggleDateMarkerMode = function() {
    const isMarker = document.getElementById('new-event-is-marker').checked;
    document.getElementById('new-event-marker-fields').style.display = isMarker ? '' : 'none';
    document.getElementById('new-event-event-fields').style.display = isMarker ? 'none' : '';
    document.getElementById('new-event-modal-title').textContent = isMarker ? 'New Date Marker' : 'New Event';
    document.getElementById('new-event-submit-btn').textContent = isMarker ? 'Add Marker' : 'Create Event';
    document.getElementById('new-event-name-label').innerHTML = isMarker
        ? 'Label <span class="required">*</span>'
        : 'Event Name <span class="required">*</span>';
    document.getElementById('new-event-date-label').textContent = isMarker ? 'Start Date *' : 'Date';
    document.getElementById('new-event-name').placeholder = isMarker ? 'e.g. Last Day of School' : 'e.g. YMU Spring Gala 2027';
};

window.closeNewEventModal = function() {
    document.getElementById('new-event-modal').classList.remove('is-open');
};

window.createNewEvent = async function() {
    const isMarker = document.getElementById('new-event-is-marker').checked;
    const name  = document.getElementById('new-event-name').value.trim();
    const date  = document.getElementById('new-event-date').value;

    if (!name) {
        showToast(isMarker ? 'Please enter a label' : 'Please enter an event name', 'error');
        document.getElementById('new-event-name').focus();
        return;
    }

    if (isMarker) {
        if (!date) {
            showToast('Please enter a start date', 'error');
            document.getElementById('new-event-date').focus();
            return;
        }
        const endDate = document.getElementById('new-event-marker-end').value;
        const type    = document.getElementById('new-event-marker-type').value;
        try {
            await db.collection('blockDates').add({
                label: name, startDate: date,
                endDate: endDate || date,
                type, season: state.currentSeason,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            closeNewEventModal();
        } catch(e) {
            console.error('Failed to save date marker:', e);
            showToast('Error saving date marker', 'error');
        }
        return;
    }

    const lead  = document.getElementById('new-event-lead').value.trim();
    const phase = document.getElementById('new-event-phase').value;
    const enabledPages = [...document.querySelectorAll('#new-event-pages .page-toggle-cb:checked')].map(cb => cb.value);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = `${slug}-${Date.now()}`;

    await eventsCollection.doc(id).set({
        name, date, lead, phase, enabledPages,
        season: state.currentSeason,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    closeNewEventModal();
    await loadEvents();
    enterEvent(id);
};

window.duplicateCurrentEvent = function() {
    const event = state.activeEvent;
    if (!event) { showToast('No active event to duplicate', 'error'); return; }

    document.getElementById('dup-event-name').value = (event.name || '') + ' (Copy)';
    document.getElementById('dup-event-date').value = '';

    const seasonSelect = document.getElementById('dup-event-season');
    seasonSelect.innerHTML = (state.seasons || [state.currentSeason]).map(s =>
        `<option value="${escapeHtml(s)}" ${s === state.currentSeason ? 'selected' : ''}>${escapeHtml(s)}</option>`
    ).join('');

    document.getElementById('duplicate-event-modal').classList.add('is-open');
    document.getElementById('dup-event-name').focus();
};

window.closeDuplicateEventModal = function() {
    document.getElementById('duplicate-event-modal').classList.remove('is-open');
};

window.confirmDuplicateEvent = async function() {
    const sourceEvent = state.activeEvent;
    if (!sourceEvent) return;

    const name   = document.getElementById('dup-event-name').value.trim();
    const date   = document.getElementById('dup-event-date').value;
    const season = document.getElementById('dup-event-season').value;

    if (!name) {
        showToast('Please enter a show name', 'error');
        document.getElementById('dup-event-name').focus();
        return;
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const newId = `${slug}-${Date.now()}`;
    const sourceRef = eventsCollection.doc(sourceEvent.id);
    const destRef   = eventsCollection.doc(newId);

    const SUBCOLLECTIONS = [
        'budget', 'timeline', 'mainStageInputs', 'cocktailStageInputs',
        'staff', 'setLists', 'packingList', 'packingCategoryColors',
        'menuItems', 'printedMaterials', 'digitalAssets', 'guests', 'seatingTables',
        'invitees', 'vendors', 'venueMapLayers', 'event-info',
    ];

    closeDuplicateEventModal();
    showToast('Duplicating show…', 'info');

    try {
        await destRef.set({
            name, date, season,
            lead: sourceEvent.lead || '',
            phase: sourceEvent.phase || 'planning',
            enabledPages: sourceEvent.enabledPages || [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        // Copy intake (single doc)
        const intakeSnap = await sourceRef.collection('intake').doc('main').get();
        if (intakeSnap.exists) {
            await destRef.collection('intake').doc('main').set(intakeSnap.data());
        }

        // Copy all flat subcollections in batches
        for (const collName of SUBCOLLECTIONS) {
            const snap = await sourceRef.collection(collName).get();
            if (snap.empty) continue;
            for (let i = 0; i < snap.docs.length; i += 499) {
                const batch = db.batch();
                snap.docs.slice(i, i + 499).forEach(doc =>
                    batch.set(destRef.collection(collName).doc(doc.id), doc.data())
                );
                await batch.commit();
            }
        }

        showToast(`"${name}" ready`, 'success');
        await loadEvents();
        enterEvent(newId);
    } catch (err) {
        console.error('Duplicate event failed:', err);
        showToast('Failed to duplicate show', 'error');
    }
};

function openEventSettings() {
    const event = state.activeEvent;
    if (!event) return;
    const enabled = new Set(event.enabledPages || []);

    document.getElementById('event-settings-title').textContent = event.name || 'Event Settings';
    document.getElementById('event-settings-pages').innerHTML = ALL_PAGES.map(p =>
        `<label class="page-toggle-label">
            <input type="checkbox" value="${p.id}" class="settings-page-cb"
                ${enabled.has(p.id) ? 'checked' : ''}
                onchange="toggleEventPage('${p.id}', this.checked)">
            ${escapeHtml(p.label)}
        </label>`
    ).join('');

    document.getElementById('event-settings-modal').classList.add('is-open');
}

window.closeEventSettings = function() {
    document.getElementById('event-settings-modal').classList.remove('is-open');
};

window.toggleEventPage = async function(pageId, isEnabled) {
    const event = state.activeEvent;
    if (!event) return;
    const pages = new Set(event.enabledPages || []);
    if (isEnabled) pages.add(pageId); else pages.delete(pageId);
    const enabledPages = [...pages];

    await eventsCollection.doc(event.id).update({
        enabledPages,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    state.activeEvent.enabledPages = enabledPages;
    updateNavForEvent(state.activeEvent);
};

window.enterEvent = enterEvent;
window.backToHub = backToHub;
window.openNewEventModal = openNewEventModal;
window.openEventSettings = openEventSettings;

// ============================================================
// INTAKE PAGE
// ============================================================

function setupIntakeListener() {
    if (!state.currentEventId) return;
    const container = document.getElementById('intake-form-body');
    if (container) container.innerHTML = '';
    const ref = db.collection('events').doc(state.currentEventId).collection('intake').doc('main');
    const unsub = ref.onSnapshot(snap => {
        state.intake = snap.exists ? snap.data() : {};
        renderIntake();
    }, err => console.error('Intake listener error:', err));
    _activeListeners.push(unsub);
}

let _dynDragRow = null;

function buildDynamicSectionRows(sectionId, rows) {
    const closeIcon = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
    const dragHandle = `<span class="intake-dyn-handle" title="Drag to reorder"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="2.5" r="1.1"/><circle cx="8" cy="2.5" r="1.1"/><circle cx="4" cy="6" r="1.1"/><circle cx="8" cy="6" r="1.1"/><circle cx="4" cy="9.5" r="1.1"/><circle cx="8" cy="9.5" r="1.1"/></svg></span>`;
    return rows.map((row, i) => `
        <div class="intake-dyn-row" data-idx="${i}" data-section="${sectionId}" draggable="true"
             ondragstart="intakeDynDragStart(event)"
             ondragover="intakeDynDragOver(event)"
             ondragleave="intakeDynDragLeave(event)"
             ondrop="intakeDynDrop(event)"
             ondragend="intakeDynDragEnd(event)">
            ${dragHandle}
            <input type="text" class="intake-input intake-dyn-label" value="${escapeHtml(row.label || '')}" placeholder="Label…" onblur="saveIntakeDynamicRows('${sectionId}')">
            <input type="text" class="intake-input intake-dyn-time" value="${escapeHtml(row.time || '')}" placeholder="e.g. 6:30 – 7:00pm" onblur="saveIntakeDynamicRows('${sectionId}')">
            <button class="intake-remove-row-btn" onclick="removeIntakeRow('${sectionId}', ${i})" type="button" title="Remove row">${closeIcon}</button>
        </div>`).join('');
}

window.intakeDynDragStart = function(e) {
    // Cancel if drag initiated from an input (let the input handle its own selection)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') { e.preventDefault(); return; }
    _dynDragRow = e.currentTarget;
    e.currentTarget.classList.add('intake-dyn-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
};

window.intakeDynDragOver = function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.currentTarget;
    if (row !== _dynDragRow) row.classList.add('intake-dyn-drag-over');
};

window.intakeDynDragLeave = function(e) {
    e.currentTarget.classList.remove('intake-dyn-drag-over');
};

window.intakeDynDrop = function(e) {
    e.preventDefault();
    const tgt = e.currentTarget;
    tgt.classList.remove('intake-dyn-drag-over');
    if (!_dynDragRow || _dynDragRow === tgt) return;
    // Only allow drops within the same section
    if (_dynDragRow.dataset.section !== tgt.dataset.section) return;
    const sectionId = tgt.dataset.section;
    const container = document.getElementById(`intake-dyn-${sectionId}`);
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('.intake-dyn-row'));
    const srcIdx = rows.indexOf(_dynDragRow);
    const tgtIdx = rows.indexOf(tgt);
    if (srcIdx < tgtIdx) { tgt.after(_dynDragRow); } else { tgt.before(_dynDragRow); }
    // Re-index rows and update remove button references
    Array.from(container.querySelectorAll('.intake-dyn-row')).forEach((r, i) => {
        r.dataset.idx = i;
        const btn = r.querySelector('.intake-remove-row-btn');
        if (btn) btn.setAttribute('onclick', `removeIntakeRow('${sectionId}', ${i})`);
    });
    saveIntakeDynamicRows(sectionId);
};

window.intakeDynDragEnd = function(e) {
    e.currentTarget.classList.remove('intake-dyn-dragging');
    document.querySelectorAll('.intake-dyn-drag-over').forEach(el => el.classList.remove('intake-dyn-drag-over'));
    _dynDragRow = null;
};

function buildDynamicSectionHTML(id, label) {
    const defaults = DYNAMIC_DEFAULTS[id] || [];
    const icon = INTAKE_SECTION_ICONS[label] || 'ti-list';
    return `
        <div class="intake-section">
            <div class="intake-sec-head">
                <div class="intake-sec-icon"><i class="ti ${icon}"></i></div>
                <div class="intake-sec-title">${escapeHtml(label)}</div>
            </div>
            <div class="intake-dyn-col-headers">
                <span>Item</span><span>Time</span>
            </div>
            <div id="intake-dyn-${id}" class="intake-dyn-body">
                ${buildDynamicSectionRows(id, defaults)}
            </div>
            <div class="intake-dyn-footer">
                <button class="intake-add-row-btn" onclick="addIntakeRow('${id}')" type="button">+ Add Row</button>
            </div>
        </div>`;
}

function buildIntakeFieldHTML(item) {
    const isTextarea = item.inputType === 'textarea';
    let inputHTML;
    if (isTextarea) {
        inputHTML = `<textarea id="intake-${item.field}" class="intake-field-textarea" placeholder="${escapeHtml(item.label)}…" oninput="updateIntakeProgress()" onblur="saveIntakeField('${item.field}', this.value)" rows="3"></textarea>`;
    } else if (item.inputType === 'yesno') {
        inputHTML = `<select id="intake-${item.field}" class="intake-field-input" onchange="saveIntakeField('${item.field}', this.value); updateIntakeProgress()">
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
        </select>`;
    } else if (item.inputType === 'select') {
        const opts = item.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        inputHTML = `<select id="intake-${item.field}" class="intake-field-input" onchange="saveIntakeField('${item.field}', this.value); updateIntakeProgress()">
            <option value="">—</option>
            ${opts}
        </select>`;
    } else {
        inputHTML = `<input type="${item.inputType}" id="intake-${item.field}" class="intake-field-input" placeholder="${escapeHtml(item.label)}" oninput="updateIntakeProgress()" onblur="saveIntakeField('${item.field}', this.value)">`;
    }
    return `
        <div class="intake-field">
            <div class="intake-field-label">${escapeHtml(item.label)}</div>
            <div class="intake-field-input-wrap${isTextarea ? ' top' : ''}">
                ${inputHTML}
                <i class="ti ti-pencil intake-field-edit" aria-hidden="true"></i>
            </div>
        </div>`;
}

function buildIntakeHTML() {
    // Group INTAKE_SCHEMA into sections, each starting at a 'section' or 'dynamic-section' entry
    const sections = [];
    let current = null;
    INTAKE_SCHEMA.forEach(item => {
        if (item.type === 'section') {
            current = { label: item.label, items: [] };
            sections.push(current);
        } else if (item.type === 'dynamic-section') {
            sections.push({ label: item.label, isDynamic: true, id: item.id });
            current = null;
        } else if (current) {
            current.items.push(item);
        }
    });

    return sections.map(section => {
        if (section.isDynamic) {
            return buildDynamicSectionHTML(section.id, section.label);
        }
        const fieldCount = section.items.filter(i => !i.type).length;
        const icon = INTAKE_SECTION_ICONS[section.label] || 'ti-file';
        const itemsHTML = section.items.map(item => {
            if (item.type === 'subsection') {
                return `<div class="intake-sub-head">${escapeHtml(item.label)}</div>`;
            }
            return buildIntakeFieldHTML(item);
        }).join('');
        return `
        <div class="intake-section">
            <div class="intake-sec-head">
                <div class="intake-sec-icon"><i class="ti ${icon}"></i></div>
                <div class="intake-sec-title">${escapeHtml(section.label)}</div>
            </div>
            ${itemsHTML}
        </div>`;
    }).join('');
}

function renderIntake() {
    const container = document.getElementById('intake-form-body');
    if (!container) return;
    const data = state.intake || {};

    if (!container.children.length) {
        container.innerHTML = buildIntakeHTML();
    }

    // Populate static fields (skip focused element to not interrupt typing)
    const focused = document.activeElement;
    INTAKE_SCHEMA.forEach(item => {
        if (item.type) return;
        const el = document.getElementById(`intake-${item.field}`);
        if (el && el !== focused) el.value = data[item.field] != null ? data[item.field] : '';
    });

    // Dynamic sections sync from Firestore (auto-save on blur)
    ['pre_show_rows', 'run_of_show_rows'].forEach(sectionId => {
        const dynContainer = document.getElementById(`intake-dyn-${sectionId}`);
        if (!dynContainer || dynContainer.contains(focused)) return;
        const rows = data[sectionId] || DYNAMIC_DEFAULTS[sectionId];
        dynContainer.innerHTML = buildDynamicSectionRows(sectionId, rows);
    });

    updateIntakeProgress();
}

function updateIntakeProgress() {
    const fields = INTAKE_SCHEMA.filter(i => !i.type);
    const total = fields.length;
    let filled = 0;
    fields.forEach(item => {
        const el = document.getElementById(`intake-${item.field}`);
        if (el && el.value.trim()) filled++;
    });
    const pct = total ? Math.round((filled / total) * 100) : 0;
    const fill = document.getElementById('intake-progress-fill');
    const pctEl = document.getElementById('intake-progress-pct');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    // Mirror into sidebar event card
    const sbFill = document.getElementById('sec-progress-fill');
    const sbPct  = document.getElementById('sec-progress-pct');
    if (sbFill) sbFill.style.width = pct + '%';
    if (sbPct)  sbPct.textContent  = pct + '%';
}

window.saveIntakeField = function(field, value) {
    if (!state.currentEventId) return;
    const ref = db.collection('events').doc(state.currentEventId).collection('intake').doc('main');
    ref.set({ [field]: value }, { merge: true })
        .catch(e => console.error('Intake save error:', e));
};

window.toggleIntakeNote = function(field) {
    const row = document.getElementById(`note-row-${field}`);
    if (!row) return;
    const wasVisible = row.classList.contains('intake-note-visible');
    row.classList.toggle('intake-note-visible');
    if (!wasVisible) {
        const ta = row.querySelector('textarea');
        if (ta) ta.focus();
    }
};

function _intakeSaveStatus() {
    const status = document.getElementById('intake-save-status');
    if (!status) return;
    status.textContent = 'Saved';
    status.classList.add('intake-saved--visible');
    clearTimeout(status._hideTimer);
    status._hideTimer = setTimeout(() => status.classList.remove('intake-saved--visible'), 1500);
}

window.saveIntakeDynamicRows = function(sectionId) {
    if (!state.currentEventId) return;
    const dynContainer = document.getElementById(`intake-dyn-${sectionId}`);
    if (!dynContainer) return;
    const rows = Array.from(dynContainer.querySelectorAll('.intake-dyn-row')).map(row => ({
        label: row.querySelector('.intake-dyn-label')?.value || '',
        time:  row.querySelector('.intake-dyn-time')?.value  || '',
    }));
    db.collection('events').doc(state.currentEventId).collection('intake').doc('main')
        .set({ [sectionId]: rows }, { merge: true })
        .then(_intakeSaveStatus)
        .catch(e => console.error('Dynamic rows save error:', e));
};

window.addIntakeRow = function(sectionId) {
    const dynContainer = document.getElementById(`intake-dyn-${sectionId}`);
    if (!dynContainer) return;
    const newIdx = dynContainer.querySelectorAll('.intake-dyn-row').length;
    const closeIcon = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
    const div = document.createElement('div');
    div.className = 'intake-dyn-row';
    div.dataset.idx = newIdx;
    div.innerHTML = `
        <input type="text" class="intake-input intake-dyn-label" value="" placeholder="Label…" onblur="saveIntakeDynamicRows('${sectionId}')">
        <input type="text" class="intake-input intake-dyn-time" placeholder="e.g. 6:30 – 7:00pm" onblur="saveIntakeDynamicRows('${sectionId}')">
        <button class="intake-remove-row-btn" onclick="removeIntakeRow('${sectionId}', ${newIdx})" type="button" title="Remove row">${closeIcon}</button>`;
    dynContainer.appendChild(div);
    div.querySelector('.intake-dyn-label').focus();
    saveIntakeDynamicRows(sectionId);
};

window.removeIntakeRow = function(sectionId, rowIdx) {
    const dynContainer = document.getElementById(`intake-dyn-${sectionId}`);
    if (!dynContainer) return;
    const allRows = dynContainer.querySelectorAll('.intake-dyn-row');
    if (allRows.length <= 1) return;
    const target = dynContainer.querySelector(`.intake-dyn-row[data-idx="${rowIdx}"]`);
    if (target) target.remove();
    // Re-index
    dynContainer.querySelectorAll('.intake-dyn-row').forEach((row, i) => {
        row.dataset.idx = i;
        const btn = row.querySelector('.intake-remove-row-btn');
        if (btn) btn.setAttribute('onclick', `removeIntakeRow('${sectionId}', ${i})`);
    });
    saveIntakeDynamicRows(sectionId);
};

// Dashboard
function updateDashboard() {
    updateBudgetStats();
    updateVendorStats();
    updateTimelineStats();
    renderDashboard();
}

// Legacy stubs kept so any stray references don't throw
function updateMenuDashboard() {}
function updateSetListDashboard() {}

function renderDashboard() {
    const dash = document.getElementById('dashboard');
    if (!dash) return;

    const event = state.activeEvent;
    if (!event) return;

    const enabled = new Set(event.enabledPages || []);

    // ── Budget ────────────────────────────────────────────────────
    const totalBudget = state.budget.reduce((s, i) => s + (parseFloat(i.budgeted) || 0), 0);
    const totalSpent  = state.budget.reduce((s, i) => s + (parseFloat(i.actual)   || 0), 0);
    const remaining   = totalBudget - totalSpent;
    const budgetPct   = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100) : 0;
    const overBudget  = budgetPct > 100;

    // ── Timeline ─────────────────────────────────────────────────
    const tlTotal   = state.timeline.length;
    const tlDone    = state.timeline.filter(t => t.completed === true || t.status === 'complete').length;
    const tlPct     = tlTotal > 0 ? Math.round(tlDone / tlTotal * 100) : 0;
    const tlIncomplete = state.timeline.filter(t => {
        if (t.completed === true || t.status === 'complete') return false;
        // Flag items missing time or event description
        return !t.time || !(t.event || '').trim();
    });

    // ── Staff ────────────────────────────────────────────────────
    const staffTotal    = state.staff.length;
    const unfilledStaff = state.staff.filter(s => s.isPlaceholder);
    const filledCount   = staffTotal - unfilledStaff.length;

    // ── Issues list ──────────────────────────────────────────────
    const issues = [];
    unfilledStaff.forEach(s => issues.push({
        type: 'staff', page: 'staff', id: s.id,
        title: (s.name || 'Unnamed role') + ' — unfilled'
    }));
    tlIncomplete.forEach(t => {
        const label = (t.event || '').trim() || (t.item || '').trim() || 'Unnamed item';
        const missing = [];
        if (!t.time) missing.push('time');
        if (!(t.event || '').trim()) missing.push('description');
        issues.push({
            type: 'timeline', page: 'timeline', id: t.id,
            title: label + ' — missing ' + missing.join(' & ')
        });
    });
    // Staff members missing contact info
    state.staff.filter(s => !s.isPlaceholder && !s.phone && !s.email).forEach(s => issues.push({
        type: 'contact', page: 'staff', id: s.id,
        title: (s.name || 'Staff member') + ' — missing contact info'
    }));
    // Budget entries missing contact info
    state.budget.filter(b => !b.noContactNeeded && !b.phone && !b.email).forEach(b => issues.push({
        type: 'contact', page: 'budget', id: b.id,
        title: (b.vendor || 'Budget entry') + ' — missing contact info'
    }));

    // ── Countdown ────────────────────────────────────────────────
    let countdownHtml = '';
    const evDate = window._hubEventDate;
    if (evDate) {
        const diff = evDate - new Date();
        if (diff > 0) {
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            countdownHtml = `
                <div class="db-countdown">
                    <div class="db-cd-block"><span class="db-cd-num">${d}</span><span class="db-cd-lbl">days</span></div>
                    <div class="db-cd-sep">:</div>
                    <div class="db-cd-block"><span class="db-cd-num">${h}</span><span class="db-cd-lbl">hrs</span></div>
                    <div class="db-cd-sep">:</div>
                    <div class="db-cd-block"><span class="db-cd-num">${m}</span><span class="db-cd-lbl">min</span></div>
                </div>`;
        } else {
            countdownHtml = `<div class="db-cd-past">Event has passed</div>`;
        }
    }

    // ── Date string ──────────────────────────────────────────────
    let dateStr = '';
    if (event.date) {
        try {
            dateStr = new Date(event.date + 'T12:00:00').toLocaleDateString('en-US',
                { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } catch(e) { dateStr = event.date; }
    }

    // ── Phase → badge mapping (token-based) ──────────────────────
    const phaseBadge = {
        'phase-0':   { label: 'Planning',      bg: 'var(--gray-bg)',   text: 'var(--gray-text)'   },
        'phase-1':   { label: 'In Talks',      bg: 'var(--purple-bg)', text: 'var(--purple-text)' },
        'phase-2':   { label: 'Walk Thru',     bg: 'var(--blue-bg)',   text: 'var(--blue-text)'   },
        'phase-3':   { label: 'Confirmed',     bg: 'var(--green-bg)',  text: 'var(--green-text)'  },
        'phase-4':   { label: 'Invoiced',      bg: 'var(--amber-bg)',  text: 'var(--amber-text)'  },
        'phase-5':   { label: 'In Production', bg: 'var(--blue-bg)',   text: 'var(--blue-text)'   },
        'phase-6':   { label: 'Crew Ready',    bg: 'var(--blue-bg)',   text: 'var(--blue-text)'   },
        'phase-7':   { label: 'Show Day',      bg: 'var(--amber-bg)',  text: 'var(--amber-text)'  },
        'phase-8':   { label: 'Post Show',     bg: 'var(--amber-bg)',  text: 'var(--amber-text)'  },
        'phase-9':   { label: 'Closing',       bg: 'var(--purple-bg)', text: 'var(--purple-text)' },
        'completed': { label: 'Completed',     bg: 'var(--green-bg)',  text: 'var(--green-text)'  },
    };

    // ── Upcoming shows rows ───────────────────────────────────────
    const today = new Date();
    const allEvents = (state.events || []).slice().sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });

    const showRows = allEvents.map(ev => {
        const phase   = PHASES.find(p => p.id === ev.phase) || PHASES[0];
        const badge   = phaseBadge[ev.phase] || phaseBadge['phase-0'];
        const evDate  = ev.date ? new Date(ev.date + 'T12:00:00') : null;
        const daysOut = evDate ? Math.ceil((evDate - today) / 86400000) : null;
        const evDateStr = evDate
            ? evDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'TBD';
        const evDateSub = daysOut === null ? '' : daysOut > 0
            ? `${daysOut} day${daysOut !== 1 ? 's' : ''} out`
            : daysOut === 0 ? 'Today' : 'Past';
        const meta = [ev.performingGroups, ev.venue].filter(Boolean).join(' · ') || 'No details yet';
        return `
        <div class="show-row" onclick="enterEvent('${escapeHtml(ev.id)}')">
            <div class="show-icon" style="background:${phase.color}"></div>
            <div class="show-body">
                <div class="show-name">${escapeHtml(ev.name || 'Untitled')}</div>
                <div class="show-meta">${escapeHtml(meta)}</div>
            </div>
            <span class="show-badge" style="background:${badge.bg};color:${badge.text}">${badge.label}</span>
            <div class="show-date">
                <div class="show-date-main">${evDateStr}</div>
                ${evDateSub ? `<div class="show-date-sub">${evDateSub}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // ── Open tasks rows ───────────────────────────────────────────
    const taskItems = [...state.timeline].sort((a, b) => {
        const aDone = a.completed === true || a.status === 'complete';
        const bDone = b.completed === true || b.status === 'complete';
        return aDone - bDone;
    }).slice(0, 8);

    const taskRows = taskItems.length > 0
        ? taskItems.map(t => {
            const done  = t.completed === true || t.status === 'complete';
            const label = (t.event || t.item || 'Untitled task').trim();
            return `
            <div class="task-row${done ? ' done' : ''}">
                <div class="task-cb${done ? ' checked' : ''}">
                    ${done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 5 9 10 3"/></svg>` : ''}
                </div>
                <span class="task-label">${escapeHtml(label)}</span>
            </div>`;
          }).join('')
        : `<div class="db2-empty">No timeline items yet</div>`;

    // ── Crew rows ─────────────────────────────────────────────────
    const avatarPalette = [
        { bg: 'var(--green-bg)',  text: 'var(--green-text)'  },
        { bg: 'var(--amber-bg)',  text: 'var(--amber-text)'  },
        { bg: 'var(--blue-bg)',   text: 'var(--blue-text)'   },
        { bg: 'var(--purple-bg)', text: 'var(--purple-text)' },
        { bg: 'var(--pink-bg)',   text: 'var(--pink-text)'   },
        { bg: 'var(--gray-bg)',   text: 'var(--gray-text)'   },
    ];
    const crewRows = state.staff.length > 0
        ? state.staff.slice(0, 7).map((s, i) => {
            const initials = (s.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
            const av = avatarPalette[i % avatarPalette.length];
            const filled = !s.isPlaceholder;
            return `
            <div class="db2-crew-item">
                <div class="db2-avatar" style="background:${av.bg};color:${av.text}">${initials}</div>
                <div class="db2-crew-body">
                    <div class="db2-crew-name">${escapeHtml(s.name || 'Open Role')}</div>
                    <div class="db2-crew-role">${escapeHtml(s.role || s.department || '—')}</div>
                </div>
                <span class="show-badge" style="${filled
                    ? 'background:var(--green-bg);color:var(--green-text)'
                    : 'background:var(--amber-bg);color:var(--amber-text)'}">${filled ? 'Confirmed' : 'Pending'}</span>
            </div>`;
          }).join('')
        : `<div class="db2-empty">No crew added yet</div>`;

    // ── Render ───────────────────────────────────────────────────
    dash.innerHTML = `
        <div class="db2-wrap">

            <!-- Topbar -->
            <div class="db2-topbar">
                <h1 class="db2-topbar-title">Dashboard</h1>
                <div class="db2-topbar-actions">
                    <button class="db2-icon-btn" onclick="openEventSettings()" title="Settings">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
                    </button>
                </div>
            </div>

            <!-- Stats row -->
            <div class="db2-stats">
                ${enabled.has('budget') ? `
                <div class="db2-stat" onclick="switchPage('budget')">
                    <div class="db2-stat-label">Budget Remaining</div>
                    <div class="db2-stat-num ${overBudget ? 'warn' : ''}">${formatCurrency(remaining)}</div>
                    <div class="db2-stat-sub ${overBudget ? 'warn' : ''}">${overBudget ? '⚠ Over budget' : formatCurrency(totalSpent) + ' spent'}</div>
                </div>` : ''}
                ${enabled.has('timeline') ? `
                <div class="db2-stat" onclick="switchPage('timeline')">
                    <div class="db2-stat-label">Tasks Complete</div>
                    <div class="db2-stat-num">${tlDone}<span class="db2-stat-denom"> / ${tlTotal}</span></div>
                    <div class="db2-stat-sub ${tlPct === 100 && tlTotal > 0 ? 'ok' : ''}">${tlTotal === 0 ? 'No items yet' : tlPct + '% complete'}</div>
                </div>` : ''}
                ${enabled.has('staff') ? `
                <div class="db2-stat" onclick="switchPage('staff')">
                    <div class="db2-stat-label">Crew Confirmed</div>
                    <div class="db2-stat-num">${filledCount}</div>
                    <div class="db2-stat-sub ${unfilledStaff.length > 0 ? 'warn' : 'ok'}">${unfilledStaff.length > 0 ? unfilledStaff.length + ' open roles' : 'Fully staffed'}</div>
                </div>` : ''}
            </div>

            <!-- Bottom panels -->
            <div class="db2-bottom">
                ${enabled.has('timeline') ? `
                <div class="db2-panel">
                    <div class="db2-panel-hdr">
                        <span>Open Tasks — ${escapeHtml(event.name || 'Event').toUpperCase()}</span>
                        <button class="db2-see-all-btn" onclick="switchPage('timeline')">See all →</button>
                    </div>
                    <div class="task-list">${taskRows}</div>
                </div>` : ''}
                ${enabled.has('staff') ? `
                <div class="db2-panel">
                    <div class="db2-panel-hdr">
                        <span>Crew — ${escapeHtml(event.name || 'Event').toUpperCase()}</span>
                        <button class="db2-see-all-btn" onclick="switchPage('staff')">See all →</button>
                    </div>
                    ${crewRows}
                </div>` : ''}
            </div>

        </div>`;
}

// ── Dashboard resource helpers ────────────────────────────────────
function toggleDashResourceForm() {
    const form = document.getElementById('db-res-form');
    if (!form) return;
    const open = form.classList.toggle('db-res-form-open');
    if (open) {
        const name = document.getElementById('db-res-name');
        if (name) setTimeout(() => name.focus(), 50);
    }
}
window.toggleDashResourceForm = toggleDashResourceForm;

async function addDashboardResource() {
    const nameEl = document.getElementById('db-res-name');
    const urlEl  = document.getElementById('db-res-url');
    const name = nameEl?.value?.trim();
    let   url  = urlEl?.value?.trim();
    if (!name || !url) return;
    if (url && !url.match(/^https?:\/\//i)) url = 'https://' + url;
    if (!state.currentEventId) return;
    const resources = [...(state.activeEvent.resources || []), { name, url }];
    state.activeEvent.resources = resources;
    renderDashboard();
    try {
        await eventsCollection.doc(state.currentEventId).update({ resources });
    } catch(e) {
        console.error('Failed to save resource:', e);
    }
}
window.addDashboardResource = addDashboardResource;

async function removeDashboardResource(index) {
    if (!state.currentEventId) return;
    const resources = (state.activeEvent.resources || []).filter((_, i) => i !== index);
    state.activeEvent.resources = resources;
    renderDashboard();
    try {
        await eventsCollection.doc(state.currentEventId).update({ resources });
    } catch(e) {
        console.error('Failed to remove resource:', e);
    }
}
window.removeDashboardResource = removeDashboardResource;

function toggleDashIssues() {
    const overflow = document.getElementById('db-issues-overflow');
    const btn = document.getElementById('db-issues-more-btn');
    if (!overflow || !btn) return;
    const expanded = overflow.style.display !== 'none';
    overflow.style.display = expanded ? 'none' : '';
    const extra = overflow.querySelectorAll('.db-issue').length;
    btn.textContent = expanded ? `Show ${extra} more` : 'Show less';
}
window.toggleDashIssues = toggleDashIssues;

function goToIssue(page, itemId, issueType) {
    switchPage(page);
    if (!itemId) return;

    // For staff/contact-on-staff: open the modal directly so the user can fill in info
    if (page === 'staff') {
        setTimeout(() => openStaffModal(itemId), 150);
        return;
    }

    // For budget and timeline: scroll to the row and flash it
    setTimeout(() => {
        const el = document.querySelector(`tr[data-id="${itemId}"], [data-id="${itemId}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('issue-flash');
        setTimeout(() => el.classList.remove('issue-flash'), 1800);
    }, 150);
}
window.goToIssue = goToIssue;
// ─────────────────────────────────────────────────────────────────

function updateBudgetStats() {
    const totalBudgeted = state.budget.reduce((sum, item) => sum + (parseFloat(item.budgeted) || 0), 0);
    const totalSpent    = state.budget.reduce((sum, item) => sum + (parseFloat(item.actual)   || 0), 0);
    const budgetCap     = parseFloat(state.activeEvent?.budgetCap) || 0;
    const remaining     = budgetCap > 0 ? budgetCap - totalSpent : totalBudgeted - totalSpent;

    const _bt  = document.getElementById('budget-total');          if (_bt)  _bt.textContent  = formatCurrency(totalBudgeted);
    const _bs  = document.getElementById('budget-spent');          if (_bs)  _bs.textContent  = formatCurrency(totalSpent);
    const _br  = document.getElementById('budget-remaining');      if (_br)  _br.textContent  = formatCurrency(remaining);
    const _bc  = document.getElementById('budget-cap');            if (_bc)  _bc.textContent  = budgetCap > 0 ? formatCurrency(budgetCap) : '—';
    const _lbl = document.getElementById('budget-remaining-label');if (_lbl) _lbl.textContent = budgetCap > 0 ? 'Remaining (vs cap)' : 'Remaining';
}

window.openSetBudgetModal = function() {
    const cap = parseFloat(state.activeEvent?.budgetCap) || '';
    document.getElementById('budget-cap-input').value = cap;
    document.getElementById('set-budget-modal').classList.add('is-open');
    document.getElementById('budget-cap-input').focus();
};

window.closeSetBudgetModal = function() {
    document.getElementById('set-budget-modal').classList.remove('is-open');
};

window.saveSetBudget = async function() {
    const cap = parseFloat(document.getElementById('budget-cap-input').value) || 0;
    closeSetBudgetModal();
    if (!state.currentEventId) return;
    try {
        await eventsCollection.doc(state.currentEventId).update({
            budgetCap: cap,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (state.activeEvent) state.activeEvent.budgetCap = cap;
        updateBudgetStats();
        showToast(cap > 0 ? `Budget set to ${formatCurrency(cap)}` : 'Budget cap cleared', 'success');
    } catch (e) {
        console.error('saveSetBudget error:', e);
        showToast('Error saving budget', 'error');
    }
};

function updateVendorStats() {
    const confirmed = state.budget.filter(b => b.confirmed).length;
    const total = state.budget.length;
    const pending = total - confirmed;
    const issueCount = state.budget.filter(b => getVendorIssues(b).length > 0).length;

    // (dashboard elements removed — counts rendered dynamically by renderDashboard)

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
    if (!item.inKind && !item.budgeted) issues.push('budgeted');
    if (!item.noContactNeeded && !item.offSite) {
        if (!item.phone) issues.push('phone');
        if (!item.email) issues.push('email');
    }
    return issues;
}

function vendorItemMatchesSearch(item, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        item.vendor || '', item.description || '', item.category || '',
        item.contact || '', item.email || '', item.phone || '', item.owner || '', item.notes || ''
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

function summarizeVendorSchedule(sched) {
    if (!sched) return '';
    const days = [
        ['thursday', 'Thu'], ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']
    ].filter(([k]) => sched[k]).map(([, label]) => label);
    if (days.length === 0) return '';
    return `<div class="vendor-detail"><span class="vendor-detail-icon">📅</span> On-site ${days.join(', ')}</div>`;
}

function renderVendors() {
    if (state.vendorView === 'schedule') {
        renderVendorSchedule();
    } else {
        renderVendorCards();
    }
}

function setVendorView(view) {
    state.vendorView = view;
    const cardBtn = document.getElementById('vendor-card-view-btn');
    const schedBtn = document.getElementById('vendor-schedule-view-btn');
    const cardView = document.getElementById('vendor-card-view');
    const schedView = document.getElementById('vendor-schedule-view');
    if (cardBtn) cardBtn.classList.toggle('active', view === 'grid');
    if (schedBtn) schedBtn.classList.toggle('active', view === 'schedule');
    if (cardView) cardView.style.display = view === 'grid' ? '' : 'none';
    if (schedView) schedView.style.display = view === 'schedule' ? '' : 'none';
    renderVendors();
}
window.setVendorView = setVendorView;

function setVendorScheduleFilter(filter) {
    state.vendorScheduleFilter = filter;
    document.querySelectorAll('#vendor-schedule-view [data-schedule-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scheduleFilter === filter);
    });
    renderVendorSchedule();
}
window.setVendorScheduleFilter = setVendorScheduleFilter;

function renderVendorCards() {
    const container = document.getElementById('vendor-grid');
    if (!container) return;

    // Capture expanded categories and scroll position before re-render
    const expandedCategories = new Set();
    container.querySelectorAll('.vendor-category-content').forEach(el => {
        if (el.style.display !== 'none') {
            expandedCategories.add(el.id);
        }
    });
    const scrollY = window.scrollY;

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

            const linkedStaff = getLinkedStaff(item);

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
                    ${linkedStaff ? `<div class="vendor-linked-staff"><span class="vendor-detail-icon">👥</span> Staff: ${escapeHtml(linkedStaff.name)}${linkedStaff.role ? ' (' + escapeHtml(linkedStaff.role) + ')' : ''}</div>` : ''}
                    <div class="vendor-card-details">
                        ${item.noContactNeeded ? `<div class="vendor-detail"><span class="vendor-detail-icon">🌐</span> Online vendor</div>` : ''}
                        ${item.offSite ? `<div class="vendor-detail"><span class="vendor-detail-icon">🚫</span> Off-site</div>` : ''}
                        ${item.contact ? `<div class="vendor-detail"><span class="vendor-detail-icon">👤</span> ${escapeHtml(item.contact)}</div>` : ''}
                        ${item.phone ? `<div class="vendor-detail"><span class="vendor-detail-icon">📞</span> <a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a></div>` : ''}
                        ${item.email ? `<div class="vendor-detail"><span class="vendor-detail-icon">✉</span> <a href="mailto:${escapeHtml(item.email)}">${escapeHtml(item.email)}</a></div>` : ''}
                        ${summarizeVendorSchedule(linkedStaff ? linkedStaff.schedule : item.schedule)}
                    </div>
                    <div class="vendor-card-budget">
                        ${item.inKind ? '<span class="vendor-in-kind-badge">In-Kind</span>' : ''}
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

    // Restore expanded categories and scroll position after re-render
    expandedCategories.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'block';
            const arrow = document.getElementById(id.replace('vendor-content-', 'vendor-arrow-'));
            if (arrow) arrow.textContent = '▼';
        }
    });
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

// ---------- Vendor Schedule view (inline day-cell edit) ----------

const VENDOR_SCHEDULE_DAYS = [
    ['thursday', 'Thu'],
    ['friday', 'Fri'],
    ['saturday', 'Sat'],
    ['sunday', 'Sun']
];

function vendorHasFullSchedule(sched) {
    if (!sched) return false;
    return VENDOR_SCHEDULE_DAYS.every(([k]) => sched[k] && String(sched[k]).trim());
}

function renderVendorSchedule() {
    const container = document.getElementById('vendor-schedule-container');
    if (!container) return;

    // Skip re-render if a cell is being inline-edited (Firestore listener may fire mid-edit)
    if (state.vendorScheduleEditingRowId) {
        state.vendorScheduleRenderPending = true;
        return;
    }

    // Remember expanded categories (reuses same id prefix as cards view — they're never mounted together)
    const expandedCategories = new Set();
    container.querySelectorAll('.vendor-category-content').forEach(el => {
        if (el.style.display !== 'none') expandedCategories.add(el.id);
    });

    let items = [...state.budget];

    // Apply needs-schedule filter
    if (state.vendorScheduleFilter === 'needs-schedule') {
        items = items.filter(item => {
            if (item.offSite) return false;
            const linked = getLinkedStaff(item);
            const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
            return !vendorHasFullSchedule(sched);
        });
    }

    if (items.length === 0) {
        container.innerHTML = state.vendorScheduleFilter === 'needs-schedule'
            ? '<div class="vendor-sched-empty">All vendors have complete schedules (or are marked off-site).</div>'
            : '<div class="vendor-sched-empty">No vendors yet.</div>';
        return;
    }

    // Group by category (same ordering as card view)
    const categorized = {};
    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(item);
    });
    const sortedCategories = Object.entries(categorized).sort((a, b) => a[0].localeCompare(b[0]));

    const html = sortedCategories.map(([category, catItems]) => {
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const displayName = category.replace(/^6811[a-g] - /, '');

        // Sort rows: unlinked, on-site, needs-schedule first; then linked; then off-site
        catItems.sort((a, b) => {
            const offA = a.offSite ? 1 : 0;
            const offB = b.offSite ? 1 : 0;
            if (offA !== offB) return offA - offB;
            const linkA = a.linkedStaffId ? 1 : 0;
            const linkB = b.linkedStaffId ? 1 : 0;
            if (linkA !== linkB) return linkA - linkB;
            return (a.vendor || '').localeCompare(b.vendor || '');
        });

        const rowsHtml = catItems.map(item => {
            const linked = getLinkedStaff(item);
            const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
            const isOffSite = item.offSite === true;
            const isLinked = !!linked;
            const rowClasses = ['vendor-sched-row'];
            if (isOffSite) rowClasses.push('off-site');
            if (isLinked) rowClasses.push('linked');

            const dayCells = VENDOR_SCHEDULE_DAYS.map(([key]) => {
                const raw = sched[key] || '';
                const display = raw ? escapeHtml(normalizeTimeForPrint(raw) || raw)
                                    : '<span class="phantom-placeholder">—</span>';
                if (isOffSite) {
                    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}"><span class="phantom-placeholder">—</span></td>`;
                }
                if (isLinked) {
                    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" data-original="${escapeHtml(raw)}" title="Also editable on staff tab" onclick="editVendorScheduleCell(this)">${display}</td>`;
                }
                return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" data-original="${escapeHtml(raw)}" onclick="editVendorScheduleCell(this)">${display}</td>`;
            }).join('');

            const vendorLabel = escapeHtml(item.vendor || 'Unnamed');
            const subtitleParts = [];
            if (item.description) subtitleParts.push(escapeHtml(item.description));
            const subtitle = subtitleParts.length ? `<span class="vendor-sched-subtitle">${subtitleParts.join(' · ')}</span>` : '';

            const linkedBadge = isLinked
                ? ` <span class="vendor-sched-linked-badge" onclick="event.stopPropagation(); openStaffModal('${linked.id}')" title="Open staff entry">also on staff tab</span>`
                : '';
            const offSitePill = isOffSite ? ` <span class="vendor-sched-offsite-pill">Off-site</span>` : '';

            const switchDisabled = isLinked ? 'disabled' : '';
            const switchChecked = !isOffSite ? 'checked' : '';
            const switchTitle = isLinked
                ? 'Linked to staff — presence controlled by staff entry'
                : (isOffSite ? 'Off-site (hidden from check-in list)' : 'On-site (shown on check-in list)');

            const contactLine = item.contact ? escapeHtml(item.contact) : '';

            return `
                <tr class="${rowClasses.join(' ')}" data-id="${item.id}">
                    <td>
                        <span class="vendor-sched-vendor" onclick="editBudgetItem('${item.id}')">${vendorLabel}</span>${linkedBadge}${offSitePill}
                        ${subtitle}
                    </td>
                    <td class="vendor-sched-onsite-cell">
                        <input type="checkbox" class="vendor-onsite-switch" ${switchChecked} ${switchDisabled}
                            title="${switchTitle}"
                            onchange="toggleVendorOffSite('${item.id}', this.checked)">
                    </td>
                    ${dayCells}
                    <td class="vendor-sched-contact">${contactLine}</td>
                </tr>`;
        }).join('');

        return `
            <div class="vendor-category-section">
                <div class="vendor-category-header" onclick="toggleVendorCategorySection('${categoryId}')">
                    <span class="category-arrow" id="vendor-arrow-${categoryId}">▼</span>
                    <h3>${escapeHtml(displayName)}</h3>
                    <span class="category-count">${catItems.length} vendors</span>
                </div>
                <div class="vendor-category-content" id="vendor-content-${categoryId}" style="display:block;">
                    <table class="vendor-sched-table">
                        <thead>
                            <tr>
                                <th>Vendor</th>
                                <th class="vendor-sched-onsite-cell">On-site</th>
                                <th>Thu</th>
                                <th>Fri</th>
                                <th>Sat</th>
                                <th>Sun</th>
                                <th>Contact</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Restore collapsed/expanded state from previous render (default: expanded on first render)
    if (expandedCategories.size > 0) {
        container.querySelectorAll('.vendor-category-content').forEach(el => {
            const isExpanded = expandedCategories.has(el.id);
            el.style.display = isExpanded ? 'block' : 'none';
            const arrow = document.getElementById(el.id.replace('vendor-content-', 'vendor-arrow-'));
            if (arrow) arrow.textContent = isExpanded ? '▼' : '▶';
        });
    }

    renderVendorGantt();
}

function editVendorScheduleCell(cell) {
    if (cell.querySelector('.inline-edit-input')) return;
    const row = cell.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    const day = cell.dataset.day;
    const original = cell.dataset.original || '';

    state.vendorScheduleEditingRowId = id;
    state.pendingVendorScheduleEdit = { id, day, originalValue: original };
    row.classList.add('editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = original;
    input.placeholder = 'e.g. 10am-6pm';
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    input.addEventListener('keydown', (e) => handleVendorScheduleKeydown(e, cell, row));
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (cell.querySelector('.inline-edit-input')) saveVendorScheduleCell(cell, row);
        }, 50);
    });
}
window.editVendorScheduleCell = editVendorScheduleCell;

function restoreVendorScheduleCellDisplay(cell) {
    const raw = cell.dataset.original || '';
    const display = raw
        ? escapeHtml(normalizeTimeForPrint(raw) || raw)
        : '<span class="phantom-placeholder">—</span>';
    cell.innerHTML = display;
}

function clearVendorScheduleEditingFlag() {
    state.vendorScheduleEditingRowId = null;
    state.pendingVendorScheduleEdit = null;
    if (state.vendorScheduleRenderPending) {
        state.vendorScheduleRenderPending = false;
        renderVendors();
    }
}

function handleVendorScheduleKeydown(e, cell, row) {
    if (e.key === 'Escape') {
        e.preventDefault();
        row.classList.remove('editing');
        restoreVendorScheduleCellDisplay(cell);
        clearVendorScheduleEditingFlag();
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        const day = cell.dataset.day;
        saveVendorScheduleCell(cell, row, () => {
            const nextRow = row.nextElementSibling;
            if (!nextRow) return;
            const nextCell = nextRow.querySelector(`td[data-day="${day}"][onclick]`);
            if (nextCell) editVendorScheduleCell(nextCell);
        });
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const day = cell.dataset.day;
        const forward = !e.shiftKey;
        saveVendorScheduleCell(cell, row, () => {
            const idx = VENDOR_SCHEDULE_DAYS.findIndex(([k]) => k === day);
            const nextIdx = forward ? idx + 1 : idx - 1;
            if (nextIdx >= 0 && nextIdx < VENDOR_SCHEDULE_DAYS.length) {
                const nextKey = VENDOR_SCHEDULE_DAYS[nextIdx][0];
                const nextCell = row.querySelector(`td[data-day="${nextKey}"][onclick]`);
                if (nextCell) { editVendorScheduleCell(nextCell); return; }
            }
            // Wrap to adjacent row
            const neighborRow = forward ? row.nextElementSibling : row.previousElementSibling;
            if (!neighborRow) return;
            const wrapKey = forward ? VENDOR_SCHEDULE_DAYS[0][0] : VENDOR_SCHEDULE_DAYS[VENDOR_SCHEDULE_DAYS.length - 1][0];
            const wrapCell = neighborRow.querySelector(`td[data-day="${wrapKey}"][onclick]`);
            if (wrapCell) editVendorScheduleCell(wrapCell);
        });
    }
}

async function saveVendorScheduleCell(cell, row, afterSave) {
    const input = cell.querySelector('.inline-edit-input');
    if (!input) return;
    const id = row.dataset.id;
    const day = cell.dataset.day;
    const original = cell.dataset.original || '';
    const newValue = input.value.trim();

    row.classList.remove('editing');

    if (newValue === original) {
        restoreVendorScheduleCellDisplay(cell);
        clearVendorScheduleEditingFlag();
        if (typeof afterSave === 'function') afterSave();
        return;
    }

    const writeValue = newValue === '' ? firebase.firestore.FieldValue.delete() : newValue;

    // Linked pairs: staff is authoritative (see commit 4d48229). Redirect write to the staff doc.
    const budgetItem = state.budget.find(b => b.id === id);
    const linkedStaffId = budgetItem && budgetItem.linkedStaffId;

    try {
        const targetColl = linkedStaffId ? collections.staff : collections.budget;
        const targetId = linkedStaffId || id;
        if (linkedStaffId) {
            await collections.staff.doc(linkedStaffId).update({
                [`schedule.${day}`]: writeValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await collections.budget.doc(id).update({
                [`schedule.${day}`]: writeValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        const eventId = state.currentEventId;
        pushUndo('Edit schedule', async () => {
            if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
            const revertValue = original === '' ? firebase.firestore.FieldValue.delete() : original;
            await targetColl.doc(targetId).update({
                [`schedule.${day}`]: revertValue,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        cell.dataset.original = newValue;
        restoreVendorScheduleCellDisplay(cell);
        showToast('Updated');
    } catch (err) {
        console.error('Error saving vendor schedule cell:', err);
        restoreVendorScheduleCellDisplay(cell);
        showToast('Error saving', 'error');
    } finally {
        clearVendorScheduleEditingFlag();
        if (typeof afterSave === 'function') afterSave();
    }
}
window.saveVendorScheduleCell = saveVendorScheduleCell;

async function toggleVendorOffSite(id, onSite) {
    try {
        await collections.budget.doc(id).update({
            offSite: !onSite,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(onSite ? 'Marked on-site' : 'Marked off-site');
    } catch (err) {
        console.error('Error toggling vendor off-site:', err);
        showToast('Error updating', 'error');
    }
}
window.toggleVendorOffSite = toggleVendorOffSite;

// ---------- Vendor Schedule Gantt ----------

function setVendorGanttDay(day) {
    state.vendorGanttDay = day;
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderVendorGantt();
}
window.setVendorGanttDay = setVendorGanttDay;

function renderVendorGantt() {
    const container = document.getElementById('vendor-gantt-container');
    if (!container) return;

    const day = state.vendorGanttDay;
    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Thu', 'Fri', 'Sat', 'Sun'];

    // Per-day counts for the tab labels
    const dayCounts = { thursday: 0, friday: 0, saturday: 0, sunday: 0 };
    for (const b of state.budget) {
        if (b.offSite === true) continue;
        const linked = getLinkedStaff(b);
        const sched = linked ? (linked.schedule || {}) : (b.schedule || {});
        for (const d of dayKeys) if (sched[d]) dayCounts[d]++;
    }
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        const idx = dayKeys.indexOf(d);
        if (idx !== -1) tab.textContent = dayNames[idx] + ' (' + dayCounts[d] + ')';
    });

    // Resolve entries for the selected day
    const entries = [];
    for (const item of state.budget) {
        if (item.offSite === true) continue;
        const linked = getLinkedStaff(item);
        const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
        const timeStr = sched[day];
        if (!timeStr) continue;
        entries.push({ item, linked, timeStr });
    }

    if (entries.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No vendors scheduled for this day</div>';
        return;
    }

    // Axis — match staff gantt so the two align visually
    const axisStart = 7;
    const axisEnd = 27;
    const axisRange = axisEnd - axisStart;

    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = '<div class="vendor-gantt-time-axis">' +
        axisLabels.map(l => '<span class="vendor-gantt-time-label">' + l + '</span>').join('') +
        '</div>';

    // Group by category
    const catMap = new Map();
    for (const entry of entries) {
        const cat = entry.item.category || 'Uncategorized';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(entry);
    }
    const sortedCats = [...catMap.keys()].sort((a, b) => a.localeCompare(b));

    let html = timeAxisHtml;
    for (const cat of sortedCats) {
        const displayCat = cat.replace(/^6811[a-g] - /, '');
        const color = getTeamColor(cat);
        const catEntries = catMap.get(cat).sort((a, b) => (a.item.vendor || '').localeCompare(b.item.vendor || ''));

        html += '<div class="vendor-gantt-team">';
        html += '<div class="vendor-gantt-team-header">' + escapeHtml(displayCat) + '</div>';

        for (const { item, linked, timeStr } of catEntries) {
            const ranges = parseStaffScheduleRange(timeStr);
            const onClick = linked
                ? `openStaffModal('${linked.id}')`
                : `editBudgetItem('${item.id}')`;
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(timeStr) || '';
                const linkedMark = linked ? ' vendor-gantt-bar-linked' : '';
                const titleText = (item.vendor || 'Unnamed') + ': ' + timeStr + (linked ? ' (staff: ' + linked.name + ')' : '');
                return '<div class="vendor-gantt-bar' + linkedMark + '"' +
                    ' style="left:' + left + '%;width:' + width + '%;background:' + color + '"' +
                    ' onclick="' + onClick + '"' +
                    ' title="' + escapeHtml(titleText) + '">' +
                    (ranges.length === 1 ? escapeHtml(label) : '') +
                '</div>';
            }).join('');

            const displayName = escapeHtml(item.vendor || 'Unnamed');
            const linkedTag = linked ? '<span class="multi-team-tag">staff</span>' : '';

            html += '<div class="vendor-gantt-row">' +
                '<div class="vendor-gantt-name" onclick="' + onClick + '">' +
                    displayName + linkedTag +
                '</div>' +
                '<div class="vendor-gantt-bar-area">' + barsHtml + '</div>' +
            '</div>';
        }

        html += '</div>';
    }

    container.innerHTML = html;
}
window.renderVendorGantt = renderVendorGantt;

function setupVendorFilters() {
    const filterBtns = document.querySelectorAll('#vendor-card-view .vendor-filter-btn');
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
    switchPage('vendors');

    // Override the 'all' default that switchPage just set
    state.vendorFilter = filter;

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
function getBudgetCategories() {
    const setup = state.activeEvent?.budgetSetup;
    if (setup?.categorySet === 'a-b') {
        return [
            { value: '6697a - Personal',      label: 'A — Personal' },
            { value: '6697b - Anything Else', label: 'B — Anything Else' },
        ];
    }
    const code = setup?.code || '6811';
    return [
        { value: `${code}a - Talent/Performers & Hosts`,        label: 'A — Talent / Performers & Hosts' },
        { value: `${code}b - A/V Production`,                   label: 'B — A/V Production' },
        { value: `${code}c - Venue & Permits`,                  label: 'C — Venue & Permits' },
        { value: `${code}d - Food & Beverage`,                  label: 'D — Food & Beverage' },
        { value: `${code}e - Staff & Labor`,                    label: 'E — Staff & Labor' },
        { value: `${code}f - Marketing, Promotion & Branding`,  label: 'F — Marketing, Promotion & Branding' },
        { value: `${code}g - Decor & Miscellaneous Supplies`,   label: 'G — Decor & Miscellaneous Supplies' },
    ];
}

function populateBudgetCategorySelect() {
    const sel = document.getElementById('budget-category');
    if (!sel) return;
    const cats = getBudgetCategories();
    const current = sel.value;
    sel.innerHTML = '<option value="">Select a category</option>' +
        cats.map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`).join('');
    if (current) sel.value = current;
}

function renderBudget() {
    if (state.currentPage !== 'budget') return;
    const skippedThisEvent = state.budgetSetupSkippedEventId === state.currentEventId;
    if (state.activeEvent && !state.activeEvent.budgetSetup && !skippedThisEvent) {
        openBudgetSetupModal();
        return;
    }
    renderBudgetGrouped();
}

window.skipBudgetSetup = function() {
    // Not persisted — nothing is configured, so the setup modal will prompt
    // again on a fresh visit. Just defers it for the rest of this session.
    state.budgetSetupSkippedEventId = state.currentEventId;
    document.getElementById('budget-setup-modal').classList.remove('is-open');
    renderBudgetGrouped();
};

window.resetBudgetSetup = async function() {
    if (!state.currentEventId) return;
    try {
        await eventsCollection.doc(state.currentEventId).update({
            budgetSetup: firebase.firestore.FieldValue.delete()
        });
        state.activeEvent.budgetSetup = null;
        if (state.budgetSetupSkippedEventId === state.currentEventId) state.budgetSetupSkippedEventId = null;
        switchPage('budget');
    } catch(e) {
        console.error('Failed to reset budget setup:', e);
        showToast('Error resetting setup', 'error');
    }
};

// ── Budget Setup Modal ────────────────────────────────────────────
function openBudgetSetupModal() {
    const modal = document.getElementById('budget-setup-modal');
    if (!modal) return;
    document.getElementById('bsm-code-wrap').style.display = 'none';
    document.getElementById('bsm-code').value = '';
    document.getElementById('bsm-budget-cap').value = '';
    document.getElementById('bsm-selected-set').value = '';
    document.querySelectorAll('.bsm-choice').forEach(b => b.classList.remove('active'));
    modal.classList.add('is-open');
}

window.selectBudgetCategorySet = function(set) {
    document.querySelectorAll('.bsm-choice').forEach(b =>
        b.classList.toggle('active', b.dataset.set === set)
    );
    document.getElementById('bsm-code-wrap').style.display = set === 'a-g' ? '' : 'none';
    document.getElementById('bsm-selected-set').value = set;
};

window.saveBudgetSetup = async function() {
    const set  = document.getElementById('bsm-selected-set').value;
    const code = document.getElementById('bsm-code').value.trim();
    if (!set) { showToast('Please choose A – G or A & B', 'error'); return; }
    if (set === 'a-g' && !code) {
        showToast('Please enter the GL code', 'error');
        document.getElementById('bsm-code').focus();
        return;
    }
    const setup = { categorySet: set, code: set === 'a-g' ? code : '6697' };
    const capRaw = document.getElementById('bsm-budget-cap').value;
    const cap = capRaw ? parseFloat(capRaw) : null;
    try {
        const update = { budgetSetup: setup };
        if (cap) update.budgetCap = cap;
        await eventsCollection.doc(state.currentEventId).update(update);
        state.activeEvent.budgetSetup = setup;
        if (cap) state.activeEvent.budgetCap = cap;
        document.getElementById('budget-setup-modal').classList.remove('is-open');
        renderBudgetGrouped();
    } catch(e) {
        console.error('Failed to save budget setup:', e);
        showToast('Error saving setup', 'error');
    }
};
// ─────────────────────────────────────────────────────────────────

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

    if (isSearching && filteredBudget.length === 0) {
        container.innerHTML = `<div class="card"><div class="card-body"><p class="empty-state">No items match "${escapeHtml(searchQuery)}"</p></div></div>`;
        return;
    }

    // Group filtered items by category. Seed every configured letter first
    // (A–G or A/B, per the event's budget setup) so each always shows as its
    // own section with a phantom "+ add" row, even with zero items yet —
    // skip this seeding while searching, since a text search should only
    // surface matching results, not invite adding to unrelated categories.
    const categorized = {};
    if (!isSearching) {
        getBudgetCategories().forEach(c => { categorized[c.value] = []; });
    }
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

        const pct = totals.budgeted > 0 ? Math.min(totals.actual / totals.budgeted * 100, 100) : 0;
        const remaining = totals.budgeted - totals.actual;
        const isOver = remaining < 0;
        const savedState = localStorage.getItem(`category-${categoryId}`);
        const isOpen = isSearching || savedState === 'open';

        return `
            <div class="cat-card ${isOpen ? 'open' : ''}">
                <div class="cat-main" onclick="toggleCategorySection('${categoryId}')">
                    <div class="cat-toggle"><i class="ti ti-chevron-right" id="arrow-${categoryId}"></i></div>
                    <span class="cat-name">${escapeHtml(category)}</span>
                    <span class="cat-items">${totals.count} item${totals.count !== 1 ? 's' : ''}</span>
                    <div class="cat-stats">
                        <div><div class="cs-label">Budgeted</div><div class="cs-val">${formatCurrency(totals.budgeted)}</div></div>
                        <div><div class="cs-label">Spent</div><div class="cs-val">${formatCurrency(totals.actual)}</div></div>
                        <div><div class="cs-label">Remaining</div><div class="cs-val ${isOver ? 'over' : 'good'}">${isOver ? '−' : ''}${formatCurrency(Math.abs(remaining))}</div></div>
                    </div>
                </div>
                <div class="cat-bar-wrap">
                    <div class="cat-bar-track"><div class="cat-bar-fill ${isOver ? 'over' : ''}" style="width:${pct}%"></div></div>
                </div>
                <table class="line-table" id="content-${categoryId}">
                    <colgroup>
                        <col style="width:34px">
                        <col style="width:20%">
                        <col style="width:18%">
                        <col style="width:7%">
                        <col style="width:8%">
                        <col style="width:8%">
                        <col style="width:10%">
                        <col style="width:9%">
                        <col>
                        <col style="width:70px">
                    </colgroup>
                    <thead>
                        <tr>
                            <th class="c sortable-th" onclick="sortBudgetBy('confirmed')">✓</th>
                            <th class="sortable-th" onclick="sortBudgetBy('vendor')">Vendor / item${budgetSortIndicator('vendor')}</th>
                            <th class="sortable-th" onclick="sortBudgetBy('description')">Description / role${budgetSortIndicator('description')}</th>
                            <th class="sortable-th" onclick="sortBudgetBy('owner')">Owner${budgetSortIndicator('owner')}</th>
                            <th class="r sortable-th" onclick="sortBudgetBy('budgeted')">Budgeted${budgetSortIndicator('budgeted')}</th>
                            <th class="r sortable-th" onclick="sortBudgetBy('actual')">Actual${budgetSortIndicator('actual')}</th>
                            <th class="r sortable-th" onclick="sortBudgetBy('difference')">Difference${budgetSortIndicator('difference')}</th>
                            <th class="c sortable-th" onclick="sortBudgetBy('paymentStatus')">Payment${budgetSortIndicator('paymentStatus')}</th>
                            <th class="sortable-th" onclick="sortBudgetBy('notes')">Notes${budgetSortIndicator('notes')}</th>
                            <th class="no-print"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${getSortedBudgetItems(items).map(item => {
                            const budgeted = parseFloat(item.budgeted) || 0;
                            const actual = parseFloat(item.actual) || 0;
                            const difference = budgeted - actual;
                            const diffHtml = difference === 0
                                ? '<span class="diff-zero">—</span>'
                                : difference < 0
                                    ? `<span class="diff-over">−${formatCurrency(Math.abs(difference))}</span>`
                                    : `<span class="diff-under">${formatCurrency(difference)}</span>`;

                            return `
                                <tr data-id="${item.id}">
                                    <td class="c confirmed-cell" onclick="toggleBudgetConfirmed('${item.id}', ${!item.confirmed})">
                                        <div class="cb-box ${item.confirmed ? 'cb-checked' : ''}">
                                            ${item.confirmed ? '<i class="ti ti-check"></i>' : ''}
                                        </div>
                                    </td>
                                    <td data-field="vendor" data-original="${escapeHtml(item.vendor || '')}" onclick="editBudgetCell(this)">
                                        <span class="td-vendor">${escapeHtml(item.vendor || '')}</span>
                                    </td>
                                    <td data-field="description" data-original="${escapeHtml(item.description || '')}" onclick="editBudgetCell(this)">
                                        <span class="td-desc">${escapeHtml(item.description || '')}</span>
                                    </td>
                                    <td data-field="owner" data-original="${escapeHtml(item.owner || '')}" onclick="editBudgetCell(this)">${escapeHtml(item.owner || '')}</td>
                                    <td class="r" data-field="budgeted" data-original="${budgeted}" onclick="editBudgetCell(this)">${formatCurrency(budgeted)}</td>
                                    <td class="r" data-field="actual" data-original="${actual}" onclick="editBudgetCell(this)">${formatCurrency(actual)}</td>
                                    <td class="r" data-computed="difference">${diffHtml}</td>
                                    <td class="c" data-field="paymentStatus" data-original="${item.paymentStatus || 'not-paid'}" onclick="editBudgetCell(this)">
                                        ${paymentBadgeHtml(item.paymentStatus)}
                                    </td>
                                    <td data-field="notes" data-original="${escapeHtml(item.notes || '')}" onclick="editBudgetCell(this)">
                                        ${item.notes ? `<span class="td-notes">${escapeHtml(item.notes)}</span>` : ''}
                                    </td>
                                    <td class="no-print">
                                        <div class="row-actions">
                                            <div class="act" onclick="editBudgetItem('${item.id}')" title="Edit"><i class="ti ti-pencil"></i></div>
                                            <div class="act" onclick="duplicateBudgetItem('${item.id}')" title="Duplicate"><i class="ti ti-copy"></i></div>
                                            <div class="act del" onclick="deleteBudgetItem('${item.id}')" title="Delete"><i class="ti ti-trash"></i></div>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                        <tr class="budget-phantom-row" data-phantom="true" data-category="${escapeHtml(category)}">
                            <td class="c confirmed-cell"></td>
                            <td data-field="vendor" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ vendor</span></td>
                            <td data-field="description" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ description</span></td>
                            <td data-field="owner" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ owner</span></td>
                            <td class="r" data-field="budgeted" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ budgeted</span></td>
                            <td class="r" data-field="actual" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ actual</span></td>
                            <td class="r" data-computed="difference"></td>
                            <td class="c" data-field="paymentStatus" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ status</span></td>
                            <td data-field="notes" onclick="editBudgetCell(this)"><span class="phantom-placeholder">+ notes</span></td>
                            <td class="no-print"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }).join('');

    // open/closed state is now set at render time from localStorage — no restore loop needed

    state.pendingNewBudgetRow = {};
}

// Timeline
// ── Manual ordering ──────────────────────────────────────────────
// Rows display in an explicit `order` (number) rather than being sorted by
// time — this lets rows with the same/no time be arranged manually via drag
// and drop. Ties or missing values fall back to time so behavior stays sane
// until backfillTimelineOrder() has assigned every row a real value.
function timelineOrderComparator(a, b) {
    const aHas = typeof a.order === 'number';
    const bHas = typeof b.order === 'number';
    if (aHas && bHas) return a.order - b.order;
    if (aHas) return -1;
    if (bHas) return 1;
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
}

function timelineSortedDayItems(day) {
    return state.timeline.filter(i => i.day === day).sort(timelineOrderComparator);
}

// Midpoint ordering: new value always sits strictly between its neighbors.
function orderBetween(prevOrder, nextOrder) {
    const hasPrev = typeof prevOrder === 'number';
    const hasNext = typeof nextOrder === 'number';
    if (hasPrev && hasNext) return (prevOrder + nextOrder) / 2;
    if (hasPrev) return prevOrder + 1000;
    if (hasNext) return nextOrder - 1000;
    return 1000;
}

function nextTimelineOrderAfter(afterItem) {
    const dayItems = timelineSortedDayItems(afterItem.day);
    const idx = dayItems.findIndex(i => i.id === afterItem.id);
    const nextItem = idx >= 0 ? dayItems[idx + 1] : null;
    return orderBetween(afterItem.order, nextItem?.order);
}

// One-time-per-row migration: assigns every timeline row missing an `order`
// a value that preserves today's time-sorted position, so introducing manual
// ordering doesn't reshuffle anything on first load.
function backfillTimelineOrder() {
    const items = state.timeline;
    if (!items || items.length === 0) return;
    if (!items.some(i => typeof i.order !== 'number')) return;

    const days = [...new Set(items.map(i => i.day))];
    const batch = firebase.firestore().batch();
    let hasWrites = false;
    days.forEach(day => {
        let next = 1000;
        items.filter(i => i.day === day).sort(timelineOrderComparator).forEach(item => {
            if (typeof item.order !== 'number') {
                item.order = next;
                batch.update(collections.timeline.doc(item.id), { order: next });
                hasWrites = true;
            }
            next = item.order + 1000;
        });
    });
    if (hasWrites) batch.commit().catch(err => console.error('Error backfilling timeline order:', err));
}

// Finds the Run of Show window for a day's items — from the "doors
// open"/"event start"/"show start" row through the "event over" row —
// so the Timeline filter and the Technical Cue Sheet both derive their
// range from whatever time those rows actually have, instead of a fixed
// clock time. Either bound is null (unrestricted) if its marker row
// isn't present or has no time set.
function getRunOfShowBounds(dayItems) {
    const norm = s => (s || '').trim().toLowerCase();
    const startPhrases = ['doors open', 'event start', 'show start'];
    const startTime = dayItems.find(item => {
        const ev = norm(item.event);
        return startPhrases.some(p => ev.includes(p));
    })?.time || null;
    const endTime = dayItems.find(item => norm(item.event) === 'event over')?.time || null;
    return { startTime, endTime };
}

function renderTimeline() {
    // Guard: don't rebuild DOM if user is editing a cell
    if (state.timelineEditingRowId) {
        state.timelineRenderPending = true;
        return;
    }

    // Initialize days on first render, then draw tabs
    if (state.timelineDays === null) {
        initTimelineDays().then(() => renderDayTabs());
    } else {
        renderDayTabs();
    }

    const tbody = document.getElementById('timeline-tbody');

    // Filter by current day
    let filteredTimeline = state.timeline.filter(item => item.day === state.currentDay);

    // Apply tag/time filter
    if (state.timelineFilter === 'production') {
        filteredTimeline = filteredTimeline.filter(item => item.production === true || item.tag === 'production');
    } else if (state.timelineFilter === 'run-of-show') {
        const { startTime, endTime } = getRunOfShowBounds(filteredTimeline);
        filteredTimeline = filteredTimeline.filter(item => {
            if (!item.time) return false;
            if (startTime && item.time < startTime) return false;
            if (endTime && item.time > endTime) return false;
            return true;
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

    const filterLabels = { 'all': '', 'production': ' — Production', 'run-of-show': ' — Run of Show' };
    if (dayTitle) {
        const currentDayObj = (state.timelineDays || []).find(d => d.id === state.currentDay);
        const dayLabel = currentDayObj?.label || 'Untitled';
        dayTitle.textContent = `${dayLabel} Timeline${filterLabels[state.timelineFilter] || ''}`;
    }
    if (dateSubtitle) {
        dateSubtitle.textContent = dateMap[state.currentDay] || '';
    }

    if (filteredTimeline.length === 0) {
        const phantomOnly = `
            <tr class="tl-row tl-phantom-row no-anim" data-phantom="true">
                <td class="drag-col no-print"></td>
                <td class="checkbox-col"></td>
                <td class="time-col" data-field="time" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ time</span></td>
                <td class="duration-col" data-field="duration" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ duration</span></td>
                <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
                <td class="prod-col"></td>
                <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
                <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
                <td class="actions-col no-print"></td>
            </tr>
        `;
        tbody.innerHTML = phantomOnly;
        state.pendingNewRow = {};
        return;
    }

    const sorted = [...filteredTimeline].sort(timelineOrderComparator);

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
                style="--row-accent: ${borderColor}; ${animDelay}"
                ondragover="handleTimelineDragOver(event, this)"
                ondragleave="handleTimelineDragLeave(event, this)"
                ondrop="handleTimelineDrop(event, '${item.id}')">
                <td class="drag-col no-print">
                    <span class="tl-drag-handle" draggable="true"
                          ondragstart="handleTimelineDragStart(event, '${item.id}')"
                          ondragend="handleTimelineDragEnd(event)"
                          title="Drag to reorder">⋮⋮</span>
                </td>
                <td class="checkbox-col">
                    <input type="checkbox" class="tl-checkbox"
                           ${isComplete ? 'checked' : ''}
                           onchange="toggleTaskComplete('${item.id}', this.checked)">
                </td>
                <td class="time-col" data-field="time" data-original="${escapeHtml(item.time || '')}" onclick="editTimelineCell(this)"><span class="tl-time">${formatTime12Hour(item.time)}</span></td>
                <td class="duration-col" data-field="duration" data-original="${escapeHtml(item.duration || '')}" onclick="editTimelineCell(this)">${item.duration ? escapeHtml(item.duration) : '<span class="phantom-placeholder">+ duration</span>'}</td>
                <td class="event-col" data-field="event" data-original="${escapeHtml(item.event || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.event || '')}</td>
                <td class="prod-col"><input type="checkbox" class="tl-checkbox" ${item.production === true || item.tag === 'production' ? 'checked' : ''} onchange="toggleTimelineField('${item.id}', 'production', this.checked)"></td>
                <td class="responsible-col" data-field="responsible" data-original="${escapeHtml(item.responsible || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.responsible || '')}</td>
                <td class="staff-col" data-field="staff" data-original="${escapeHtml(item.staff || '')}" onclick="editTimelineCell(this)">${escapeHtml(item.staff || '')}</td>
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
            <td class="duration-col" data-field="duration" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ duration</span></td>
            <td class="event-col" data-field="event" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ event</span></td>
            <td class="prod-col"></td>
            <td class="responsible-col" data-field="responsible" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ responsible</span></td>
            <td class="staff-col" data-field="staff" onclick="editTimelineCell(this)"><span class="phantom-placeholder">+ staff</span></td>
            <td class="actions-col no-print"></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewRow = {};
    state.timelineAnimateRows = false;

    // Mobile card view
    const mobileContainer = document.getElementById('timeline-mobile-cards');
    if (mobileContainer) {
        if (sorted.length === 0) {
            mobileContainer.innerHTML = '<div class="mobile-card-empty">No tasks for this day</div>';
        } else {
            mobileContainer.innerHTML = sorted.map(item => {
                const isComplete = item.completed === true || item.status === 'complete';
                const rowColor = item.highlightColor || '';
                const hasHighlight = rowColor && rowColor !== '#ffffff';
                const borderStyle = hasHighlight ? `border-left-color: ${rowColor}` : '';
                const badges = [];
                if (item.production === true || item.tag === 'production') badges.push('<span class="mobile-card-badge prod">Prod</span>');

                return `
                    <div class="mobile-card ${isComplete ? 'completed' : ''}" style="${borderStyle}">
                        <div class="mobile-card-row">
                            <input type="checkbox" class="mobile-card-checkbox"
                                   ${isComplete ? 'checked' : ''}
                                   onchange="toggleTaskComplete('${item.id}', this.checked)">
                            ${item.time ? `<span class="mobile-card-time">${formatTime12Hour(item.time)}</span>` : ''}
                            ${item.duration ? `<span class="mobile-card-duration">${escapeHtml(item.duration)}</span>` : ''}
                            <span class="mobile-card-event">${escapeHtml(item.event || 'Untitled')}</span>
                        </div>
                        ${(item.responsible || item.staff || badges.length > 0) ? `
                        <div class="mobile-card-details">
                            ${item.responsible ? `<span class="mobile-card-detail"><strong>Resp:</strong> ${escapeHtml(item.responsible)}</span>` : ''}
                            ${item.staff ? `<span class="mobile-card-detail"><strong>Staff:</strong> ${escapeHtml(item.staff)}</span>` : ''}
                            ${badges.length > 0 ? `<div class="mobile-card-badges">${badges.join('')}</div>` : ''}
                        </div>` : ''}
                    </div>
                `;
            }).join('');
        }
    }
}

// Technical Cue Sheet — same Firestore docs as timeline, filtered to the
// show day's Run of Show window (see getRunOfShowBounds).
// Tech-only fields (audio/liveVideo/lighting/centerScreen/sideScreens/nameOfFile)
// live on the same timeline document and are ignored by the timeline view.
const CUE_SHEET_FIELD_ORDER = ['time', 'duration', 'event', 'audio', 'liveVideo', 'stageLighting', 'houseLighting', 'centerScreen', 'sideScreens', 'screenCue'];
const CUE_SHEET_MULTILINE_FIELDS = new Set(['audio', 'liveVideo', 'stageLighting']);

// Returns the day ID that the Technical Cue Sheet should filter on.
// Legacy events use 'Saturday' as both id and label; dynamic events
// use the last day in timelineDays as the show day.
function getCueSheetDayId() {
    const days = state.timelineDays;
    if (!days || days.length === 0) return 'Saturday';
    return days.find(d => d.id === 'Saturday') ? 'Saturday' : days[days.length - 1].id;
}

function renderCueSheet() {
    const tbody = document.getElementById('cue-sheet-tbody');
    if (!tbody) return;

    if (state.cueSheetEditingRowId) {
        state.cueSheetRenderPending = true;
        return;
    }

    const dayId = getCueSheetDayId();
    const dayLabel = state.timelineDays?.find(d => d.id === dayId)?.label || 'Untitled';

    const dayItems = state.timeline.filter(item => item.day === dayId);
    const { startTime, endTime } = getRunOfShowBounds(dayItems);
    const all = dayItems.filter(item => {
        if (typeof item.time !== 'string' || !item.time) return false;
        if (startTime && item.time < startTime) return false;
        if (endTime && item.time > endTime) return false;
        return true;
    });

    const hiddenCount = all.filter(item => item.hiddenFromCueSheet === true).length;
    const countEl = document.getElementById('cue-hidden-count');
    if (countEl) countEl.textContent = hiddenCount;

    const visible = state.cueSheetShowHidden
        ? all
        : all.filter(item => item.hiddenFromCueSheet !== true);

    const sorted = [...visible].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No ${escapeHtml(dayLabel)} timeline rows in the Run of Show window yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map(item => renderCueSheetRow(item)).join('');
}

function renderCueSheetRow(item) {
    const isHidden = item.hiddenFromCueSheet === true;
    const rowClass = isHidden ? 'cs-row cs-hidden-row' : 'cs-row';

    const cell = (field, colClass) => {
        const raw = item[field];
        const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);
        const multilineClass = isMultiline ? ' cs-cell-multiline' : '';
        let display;
        if (field === 'time') {
            display = `<span class="tl-time">${formatTime12Hour(raw)}</span>`;
        } else if (raw === undefined || raw === null || raw === '') {
            display = '<span class="cs-cell-empty">—</span>';
        } else {
            display = escapeHtml(String(raw));
        }
        return `<td class="${colClass}${multilineClass}" data-field="${field}" data-original="${escapeHtml(raw == null ? '' : String(raw))}" onclick="editCueCell(this)">${display}</td>`;
    };

    const actionBtn = isHidden
        ? `<button class="cs-action-btn" onclick="unhideCueRow('${item.id}')" title="Unhide">Unhide</button>`
        : `<button class="cs-action-btn" onclick="hideCueRow('${item.id}')" title="Hide from cue sheet">Hide</button>`;

    return `
        <tr class="${rowClass}" data-id="${item.id}">
            ${cell('time', 'cs-time-col')}
            ${cell('duration', 'cs-duration-col')}
            ${cell('event', 'cs-activity-col')}
            ${cell('audio', 'cs-audio-col')}
            ${cell('liveVideo', 'cs-live-video-col')}
            ${cell('stageLighting', 'cs-stage-lighting-col')}
            ${cell('houseLighting', 'cs-house-lighting-col')}
            ${cell('centerScreen', 'cs-center-screen-col')}
            ${cell('sideScreens', 'cs-side-screens-col')}
            ${cell('screenCue', 'cs-cue-col')}
            <td class="cs-actions-col no-print">${actionBtn}</td>
        </tr>
    `;
}

window.hideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error hiding cue row:', error);
        showToast('Error hiding row', 'error');
    }
};

window.unhideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error unhiding cue row:', error);
        showToast('Error unhiding row', 'error');
    }
};

window.toggleCueSheetShowHidden = (checked) => {
    state.cueSheetShowHidden = !!checked;
    renderCueSheet();
};

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
            const card = phantomRow.closest('.cat-card');
            if (card && !card.classList.contains('open')) {
                const table = card.querySelector('.line-table');
                if (table) {
                    const categoryId = table.id.replace('content-', '');
                    toggleCategorySection(categoryId);
                }
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
    document.getElementById('add-print-item-btn').addEventListener('click', () => openPrintModal());
    document.getElementById('add-da-item-btn').addEventListener('click', () => openDAModal());
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
    populateBudgetCategorySelect();
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
            'budget-owner': 'owner',
            'budget-no-contact-needed': 'noContactNeeded',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-in-kind': 'inKind',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        defaultValues: {
            'budget-payment-status': 'not-paid'
        }
    });
    // Sync contact fields visibility with checkbox state
    const noContact = document.getElementById('budget-no-contact-needed').checked;
    document.getElementById('budget-contact-fields').style.display = noContact ? 'none' : '';

    // Populate on-site schedule (nested, not in fieldMap)
    const editItem = itemId ? state.budget.find(b => b.id === itemId) : null;
    const sched = (editItem && editItem.schedule) || {};
    document.getElementById('budget-sched-thursday').value = sched.thursday || '';
    document.getElementById('budget-sched-friday').value = sched.friday || '';
    document.getElementById('budget-sched-saturday').value = sched.saturday || '';
    document.getElementById('budget-sched-sunday').value = sched.sunday || '';

    // Populate staff link dropdown
    const item = itemId ? state.budget.find(b => b.id === itemId) : null;
    const staffSelect = document.getElementById('budget-linked-staff');
    const unlinkedStaff = state.staff.filter(s => !s.linkedBudgetId || (item && s.id === item.linkedStaffId));
    staffSelect.innerHTML = '<option value="">— None —</option>' +
        unlinkedStaff.map(s =>
            '<option value="' + s.id + '"' + (item && item.linkedStaffId === s.id ? ' selected' : '') + '>' +
            escapeHtml(s.name) + (s.role ? ' (' + escapeHtml(s.role) + ')' : '') +
            '</option>'
        ).join('');

    // Show auto-suggestion if unlinked
    const suggestionDiv = document.getElementById('budget-staff-suggestion');
    const infoPanel = document.getElementById('budget-linked-staff-info');
    if (item && !item.linkedStaffId) {
        const suggestions = findStaffSuggestions(item.vendor);
        if (suggestions.length > 0) {
            suggestionDiv.innerHTML = '<strong>Suggested match:</strong> ' +
                suggestions.map(s =>
                    '<button type="button" class="btn-link-suggest" onclick="document.getElementById(\'budget-linked-staff\').value=\'' + s.id + '\'; this.parentElement.style.display=\'none\';">' +
                    escapeHtml(s.name) + (s.role ? ' (' + escapeHtml(s.role) + ')' : '') + '</button>'
                ).join(' ');
            suggestionDiv.style.display = '';
        } else {
            suggestionDiv.style.display = 'none';
        }
    } else {
        suggestionDiv.style.display = 'none';
    }

    // Show linked staff info panel, hide schedule grid when linked (staff side is authoritative)
    const scheduleSection = document.getElementById('budget-schedule-section');
    if (item && item.linkedStaffId) {
        const ls = getLinkedStaff(item);
        if (ls) {
            const teams = (ls.teams || []).join(', ');
            const schedLine = summarizeLinkedSchedule(ls.schedule);
            infoPanel.innerHTML = '<div class="linked-info-summary">' +
                '<strong>' + escapeHtml(ls.name) + '</strong>' +
                (ls.role ? ' — ' + escapeHtml(ls.role) : '') +
                (teams ? '<br>Teams: ' + escapeHtml(teams) : '') +
                '<br>Schedule: ' + schedLine +
                '<br><button type="button" class="btn btn-sm" onclick="closeAllModals(); setTimeout(function(){ openStaffModal(\'' + ls.id + '\'); }, 200);">View Staff Entry</button>' +
                '</div>';
            infoPanel.style.display = '';
            if (scheduleSection) scheduleSection.style.display = 'none';
        } else {
            infoPanel.style.display = 'none';
            if (scheduleSection) scheduleSection.style.display = '';
        }
    } else {
        infoPanel.style.display = 'none';
        if (scheduleSection) scheduleSection.style.display = '';
    }
}

function summarizeLinkedSchedule(schedule) {
    if (!schedule) return '<span style="color:#9ca3af;">— (open staff entry to schedule)</span>';
    const days = [['thursday','Thu'],['friday','Fri'],['saturday','Sat'],['sunday','Sun']];
    const parts = [];
    for (const [key, label] of days) {
        const val = schedule[key];
        if (val && String(val).trim()) {
            parts.push(label + ' ' + normalizeTimeForPrint(val));
        }
    }
    if (parts.length === 0) return '<span style="color:#9ca3af;">— (open staff entry to schedule)</span>';
    return escapeHtml(parts.join(' · '));
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
            'timeline-duration': 'duration',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-production': 'production',
            'timeline-notes': 'notes'
        },
        defaultValues: {
            'timeline-day': state.currentDay
        }
    });
    // Show the current day in the read-only display field
    document.getElementById('timeline-day-display').value =
        document.getElementById('timeline-day').value || state.currentDay;
}

// Form Handlers
function setupFormHandlers() {
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('budget-no-contact-needed').addEventListener('change', function() {
        document.getElementById('budget-contact-fields').style.display = this.checked ? 'none' : '';
    });
    document.getElementById('timeline-form').addEventListener('submit', handleTimelineSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
    setupStaffTeamInput();
    document.getElementById('setlist-form').addEventListener('submit', handleSetListSubmit);
    document.getElementById('packing-form').addEventListener('submit', handlePackingSubmit);
    document.getElementById('menu-form').addEventListener('submit', handleMenuSubmit);
    document.getElementById('print-form').addEventListener('submit', handlePrintSubmit);
    document.getElementById('da-form').addEventListener('submit', handleDASubmit);
    const guestForm = document.getElementById('guest-form');
    if (guestForm) guestForm.addEventListener('submit', handleGuestSubmit);
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
            const before = state[config.stateKey]?.find(item => item.id === id);
            const snapshot = before ? { ...before } : null;
            await collections[config.collection].doc(id).update(data);
            if (snapshot) {
                const { id: _id, ...restSnapshot } = snapshot;
                pushUndo(`Edit ${config.itemName}`, async () => {
                    await collections[config.collection].doc(id).update(restSnapshot);
                });
            }
            showToast(`${config.itemName.charAt(0).toUpperCase() + config.itemName.slice(1)} updated`);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await collections[config.collection].add(data);
            result = { isNew: true, docId: docRef.id };
            pushUndo(`Add ${config.itemName}`, async () => {
                await collections[config.collection].doc(docRef.id).delete();
            });
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
    const newVendorName = document.getElementById('budget-vendor').value;
    const newLinkedStaffId = document.getElementById('budget-linked-staff').value || null;
    const budgetId = document.getElementById('budget-id').value;
    const oldItem = budgetId ? state.budget.find(b => b.id === budgetId) : null;
    const oldStaffId = oldItem ? oldItem.linkedStaffId : null;

    const result = await handleFormSubmit(e, {
        collection: 'budget',
        idFieldId: 'budget-id',
        itemName: 'budget item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-description': 'description',
            'budget-category': 'category',
            'budget-owner': 'owner',
            'budget-no-contact-needed': 'noContactNeeded',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-in-kind': 'inKind',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes',
            'budget-confirmed': 'confirmed'
        },
        numericFields: ['budgeted', 'actual']
    });

    if (result) {
        const resolvedBudgetId = result.docId;

        // Save linkedStaffId on the budget doc (not in fieldMap to keep generic handler clean)
        try {
            await collections.budget.doc(resolvedBudgetId).update({ linkedStaffId: newLinkedStaffId });
        } catch (err) {
            console.error('Error saving budget link:', err);
        }

        // Save on-site schedule only for unlinked vendors — staff entry is authoritative when linked
        if (!newLinkedStaffId) {
            try {
                const schedule = {
                    thursday: document.getElementById('budget-sched-thursday').value.trim() || null,
                    friday:   document.getElementById('budget-sched-friday').value.trim() || null,
                    saturday: document.getElementById('budget-sched-saturday').value.trim() || null,
                    sunday:   document.getElementById('budget-sched-sunday').value.trim() || null
                };
                await collections.budget.doc(resolvedBudgetId).update({ schedule });
            } catch (err) {
                console.error('Error saving vendor schedule:', err);
            }
        }

        // Clear old staff link if it changed
        if (oldStaffId && oldStaffId !== newLinkedStaffId) {
            try { await collections.staff.doc(oldStaffId).update({ linkedBudgetId: null }); } catch (e) { /* staff may be deleted */ }
        }
        // Set new staff link + sync name and contact info (budget edit wins)
        if (newLinkedStaffId) {
            const staffUpdate = { linkedBudgetId: resolvedBudgetId };
            if (newVendorName) staffUpdate.name = newVendorName;
            const newPhone = document.getElementById('budget-phone').value.trim() || null;
            const newEmail = document.getElementById('budget-email').value.trim() || null;
            staffUpdate.phone = newPhone;
            staffUpdate.email = newEmail;
            try { await collections.staff.doc(newLinkedStaffId).update(staffUpdate); } catch (e) { console.error('Error syncing to staff:', e); }
        }
    }
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

    // Normalize duration text to "Xh Ym" format before save
    const durationInput = document.getElementById('timeline-duration');
    if (durationInput && durationInput.value) {
        durationInput.value = formatDuration(durationInput.value);
    }

    const result = await handleFormSubmit(e, {
        collection: 'timeline',
        idFieldId: 'timeline-id',
        itemName: 'task',
        fieldMap: {
            'timeline-time': 'time',
            'timeline-duration': 'duration',
            'timeline-day': 'day',
            'timeline-event': 'event',
            'timeline-responsible': 'responsible',
            'timeline-staff': 'staff',
            'timeline-production': 'production',
            'timeline-notes': 'notes'
        },
        numericFields: []
    });

}


// CRUD Operations
window.editBudgetItem = (id) => openBudgetModal(id);
window.editTimelineItem = (id) => openTimelineModal(id);

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
            const item = state[collectionKey]?.find(i => i.id === id);
            const eventId = state.currentEventId;
            if (item) {
                const { id: _id, ...data } = item;
                pushUndo(`Delete ${itemName}`, async () => {
                    if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
                    await collections[collectionKey].doc(id).set(data);
                });
            }
            try {
                await collections[collectionKey].doc(id).delete();
                showToast(`${itemName.charAt(0).toUpperCase() + itemName.slice(1)} deleted — Cmd+Z to undo`);
            } catch (error) {
                console.error(`Error deleting ${itemName}:`, error);
                showToast(`Error deleting ${itemName}. Please try again.`, 'error');
            }
        }
    };
}

async function undoGlobalAction() {
    await performUndo();
}

const _baseDeleteBudgetItem = createDeleteHandler('budget', 'budget item');
window.deleteBudgetItem = async function(id) {
    const item = state.budget.find(b => b.id === id);
    if (item && item.linkedStaffId) {
        try { await collections.staff.doc(item.linkedStaffId).update({ linkedBudgetId: null }); } catch (e) { /* staff may be deleted */ }
    }
    return _baseDeleteBudgetItem(id);
};
window.toggleBudgetConfirmed = toggleBudgetConfirmed;
window.deleteTimelineItem = async (id) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const item = state.timeline.find(i => i.id === id);
    const eventId = state.currentEventId;
    if (item) {
        const { id: _id, ...data } = item;
        pushUndo('Delete task', async () => {
            if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
            await collections.timeline.doc(id).set(data);
        });
    }
    try {
        await collections.timeline.doc(id).delete();
        showToast('Task deleted — Cmd+Z to undo');
    } catch (error) {
        console.error('Error deleting task:', error);
        showToast('Error deleting task', 'error');
    }
};

window.toggleTaskComplete = async (id, completed) => {
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
    data.order = nextTimelineOrderAfter(item);
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await collections.timeline.add(data);
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

// Accepts "1h 30m", "1:30", "90" (minutes), "1.5h", "2 hours 15 min" etc.
// Returns normalized "Xh Ym" string. If input can't be parsed, returns it unchanged.
function formatDuration(raw) {
    if (raw === null || raw === undefined) return '';
    const s = String(raw).trim().toLowerCase();
    if (!s) return '';

    let totalMinutes = null;

    const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
    const mMatch = s.match(/(\d+)\s*m(?:in)?/);

    if (hMatch || mMatch) {
        totalMinutes = 0;
        if (hMatch) totalMinutes += Math.round(parseFloat(hMatch[1]) * 60);
        if (mMatch) totalMinutes += parseInt(mMatch[1], 10);
    } else if (s.includes(':')) {
        const parts = s.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) || !isNaN(m)) {
            totalMinutes = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
        }
    } else if (/^\d+(?:\.\d+)?$/.test(s)) {
        totalMinutes = Math.round(parseFloat(s));
    }

    if (totalMinutes === null || totalMinutes <= 0) return raw;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours && mins) return `${hours}h ${mins}m`;
    if (hours) return `${hours}h`;
    return `${mins}m`;
}

function normalizeScreenCue(raw) {
    if (raw === null || raw === undefined) return '';
    return String(raw)
        .split(',')
        .map(t => t.replace(/\D/g, '').slice(0, 3))
        .filter(Boolean)
        .join(', ');
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

function paymentBadgeHtml(status) {
    const map = {
        'paid':     '<span class="badge-paid">Paid</span>',
        'partial':  '<span class="badge-pending">Partial</span>',
        'not-paid': '<span class="badge-notpaid">Not Paid</span>',
    };
    return map[status] || map['not-paid'];
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

// ── Dynamic Day Tabs ─────────────────────────────────────────────

async function initTimelineDays() {
    if (state.timelineDays !== null) return;
    const event = state.activeEvent;
    if (!event) return;

    if (event.timelineDays && event.timelineDays.length > 0) {
        // Already stored on the event doc
        state.timelineDays = event.timelineDays;
        state.currentDay = event.timelineDays[0].id;
        return;
    }

    // No timelineDays set yet — check for any existing timeline data
    const hasLegacyData = (state.timeline || []).some(t => t.day);
    let days;
    if (hasLegacyData) {
        // Preserve all 4 legacy days so nothing is lost
        days = ['Thursday','Friday','Saturday','Sunday'].map(d => ({id: d, label: d}));
    } else {
        days = [{ id: 'day-1', label: '' }];
    }

    state.timelineDays = days;
    state.currentDay = days[0].id;

    // Persist so next load is instant
    await eventsCollection.doc(event.id).update({ timelineDays: days });
    state.activeEvent.timelineDays = days;
}

function renderDayTabs() {
    const container = document.getElementById('timeline-day-tabs');
    if (!container || !state.timelineDays) return;
    const days = state.timelineDays;
    const canRemove = days.length > 1;

    container.innerHTML = days.map(d => `
        <button class="day-tab ${d.id === state.currentDay ? 'active' : ''}" data-day="${d.id}">
            <span class="day-tab-name" ondblclick="startRenameDay(event,'${d.id}')">${escapeHtml(d.label || 'Untitled')}</span>
            ${canRemove ? `<span class="day-tab-remove" onclick="removeTimelineDay(event,'${d.id}')">×</span>` : ''}
        </button>
    `).join('') + `<button class="day-tab-add" onclick="addTimelineDay()" title="Add day">+</button>`;

    // Use addEventListener so e.detail lets us skip the 2nd click of a dblclick,
    // keeping the DOM stable so ondblclick on the span can fire correctly.
    container.querySelectorAll('.day-tab[data-day]').forEach(btn => {
        btn.addEventListener('click', e => {
            if (e.target.closest('.day-tab-remove')) return;
            if (e.detail >= 2) return;
            switchTimelineDay(btn.dataset.day);
        });
    });
}

window.switchTimelineDay = function(dayId) {
    if (state.currentDay === dayId) return;
    state.currentDay = dayId;
    state.timelineAnimateRows = true;
    renderDayTabs();
    renderTimeline();
};

window.addTimelineDay = async function() {
    const id = 'day-' + Date.now();
    const days = [...(state.timelineDays || []), { id, label: '' }];
    state.timelineDays = days;
    state.activeEvent.timelineDays = days;
    state.currentDay = id;
    await eventsCollection.doc(state.activeEvent.id).update({ timelineDays: days });
    renderDayTabs();
    renderTimeline();
    // Auto-open rename on the new tab
    setTimeout(() => {
        const newTab = document.querySelector(`.day-tab[data-day="${id}"] .day-tab-name`);
        if (newTab) newTab.dispatchEvent(new MouseEvent('dblclick'));
    }, 50);
};

window.removeTimelineDay = async function(e, dayId) {
    e.stopPropagation();
    const day = state.timelineDays.find(d => d.id === dayId);
    const label = day?.label || 'Untitled';
    if (!confirm(`Remove "${label}" from the timeline? Tasks assigned to this day won't be deleted — they just won't appear until reassigned.`)) return;
    const days = state.timelineDays.filter(d => d.id !== dayId);
    if (days.length === 0) return;
    state.timelineDays = days;
    state.activeEvent.timelineDays = days;
    if (state.currentDay === dayId) state.currentDay = days[0].id;
    await eventsCollection.doc(state.activeEvent.id).update({ timelineDays: days });
    renderDayTabs();
    renderTimeline();
};

window.startRenameDay = function(e, dayId) {
    e.stopPropagation();
    const span = e.target;
    if (span.tagName === 'INPUT') return;
    const current = state.timelineDays.find(d => d.id === dayId)?.label || '';
    const input = document.createElement('input');
    input.className = 'day-tab-rename-input';
    input.value = current;
    input.placeholder = 'Name this day…';
    span.replaceWith(input);
    input.focus();
    input.select();
    const save = async () => {
        const newLabel = input.value.trim();
        const days = state.timelineDays.map(d => d.id === dayId ? { ...d, label: newLabel } : d);
        state.timelineDays = days;
        state.activeEvent.timelineDays = days;
        await eventsCollection.doc(state.activeEvent.id).update({ timelineDays: days });
        renderDayTabs();
        if (dayId === state.currentDay) {
            const titleEl = document.getElementById('timeline-day-title');
            if (titleEl) titleEl.textContent = `${newLabel || 'Untitled'} Timeline`;
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
    });
};

function setupDayTabs() { /* tabs are now dynamic — renderDayTabs() handles setup */ }

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

function printCueSheet() {
    let pageStyle = document.getElementById('cue-sheet-page-rule');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'cue-sheet-page-rule';
        pageStyle.textContent = '@page { size: landscape; }';
        document.head.appendChild(pageStyle);
    }
    document.body.classList.add('printing-cue-sheet');
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove('printing-cue-sheet');
        const el = document.getElementById('cue-sheet-page-rule');
        if (el) el.remove();
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    requestAnimationFrame(() => {
        window.print();
        setTimeout(cleanup, 2000);
    });
}
window.printCueSheet = printCueSheet;

// Scoped print helper — tags body with a class so @media print CSS can
// customize layout per-page without leaking into other prints.
function printWithScope(scopeClass) {
    document.body.classList.add(scopeClass);
    // `afterprint` fires reliably right when the print dialog closes, in any
    // browser/timing — a flat setTimeout could fire mid-dialog (if the user
    // takes a while) or, if window.print() ever throws, never fire at all,
    // leaving the print-only styling (and anything else keyed off this class)
    // stuck on the live page. The timeout is just a fallback safety net.
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove(scopeClass);
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Some browsers (Safari) don't flush layout before window.print; rAF helps.
    requestAnimationFrame(() => {
        window.print();
        setTimeout(cleanup, 2000);
    });
}
window.printWithScope = printWithScope;

// Export and Print Functionality
function setupExportAndPrint() {
    // Print Buttons
    const printTimelineBtn = document.getElementById('print-timeline-btn');
    const printStaffBtn = document.getElementById('print-staff-btn');
    const printStageBtn = document.getElementById('print-stage-btn');

    if (printTimelineBtn) {
        printTimelineBtn.addEventListener('click', () => printWithScope('printing-timeline'));
    }

    const printCueSheetBtn = document.getElementById('print-cue-sheet-btn');
    if (printCueSheetBtn) {
        printCueSheetBtn.addEventListener('click', printCueSheet);
    }

    const timelineUndoBtn = document.getElementById('timeline-undo-btn');
    if (timelineUndoBtn) {
        timelineUndoBtn.disabled = false;
        timelineUndoBtn.addEventListener('click', () => undoGlobalAction());
    }
    if (printStaffBtn) {
        printStaffBtn.addEventListener('click', openPrintStaffTeamsModal);
    }
    const printCheckinBtn = document.getElementById('print-checkin-btn');
    if (printCheckinBtn) {
        printCheckinBtn.addEventListener('click', openPrintCheckInModal);
    }
    if (printStageBtn) {
        printStageBtn.addEventListener('click', () => printWithScope('printing-stage-inputs'));
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
        printSetListBtn.addEventListener('click', printSetLists);
    }
    const printPerformerContactBtn = document.getElementById('print-performer-contact-btn');
    if (printPerformerContactBtn) {
        printPerformerContactBtn.addEventListener('click', printPerformerContactSheets);
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

        const sorted = [...filteredTimeline].sort(timelineOrderComparator);

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
        'Owner': item.owner || '',
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
        { wch: 20 },  // Owner
        { wch: 12 },  // Budgeted
        { wch: 12 },  // Actual
        { wch: 12 },  // Difference
        { wch: 15 },  // Payment Status
        { wch: 40 }   // Notes
    ];

    // Add number formatting for currency columns
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        ['D', 'E', 'F'].forEach(col => {
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
const TIMELINE_FIELD_ORDER = ['time', 'duration', 'event', 'responsible', 'staff'];
const BUDGET_FIELD_ORDER = ['vendor', 'description', 'owner', 'budgeted', 'actual', 'paymentStatus', 'notes'];
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
    // Unlike timelineEditingRowId, this isn't cleared when editing stops —
    // it's "where you last were," used by Cmd/Ctrl+Enter to insert a new
    // row right after it instead of always at the bottom.
    if (!isPhantom) state.timelineLastActiveRowId = rowId;

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
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        // Handled globally by setupKeyboardShortcuts (insert a new row right
        // after this one) — just save what's currently being typed first.
        e.preventDefault();
        if (!isPhantom) saveSingleCell(cell, row, true);
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
    if (field === 'duration' && newValue) {
        newValue = formatDuration(newValue);
    }


    // Restore cell to display mode immediately (remove input so blur handler won't double-fire)
    cell.dataset.original = newValue;
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(newValue)}</span>`;
    } else if (field === 'duration') {
        cell.innerHTML = newValue ? escapeHtml(newValue) : '<span class="phantom-placeholder">+ duration</span>';
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

    const eventId = state.currentEventId;
    pushUndo(`Edit ${field}`, async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = state.timeline.find(i => i.id === id);
        if (current) current[field] = oldValue;
        await collections.timeline.doc(id).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

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
        let val = state.pendingNewRow[field] || '';
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
        } else if (field === 'duration') {
            cell.innerHTML = original ? escapeHtml(original) : '<span class="phantom-placeholder">+ duration</span>';
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

// Cue Sheet inline cell editing — parallel to editTimelineCell but supports
// textarea for multiline tech fields (audio/liveVideo/lighting) and uses the
// cue-sheet's own field order for Tab navigation. Writes to the same timeline
// Firestore doc so edits sync to the timeline page.
function clearCueSheetEditingFlag() {
    state.cueSheetEditingRowId = null;
    if (state.cueSheetRenderPending) {
        state.cueSheetRenderPending = false;
        renderCueSheet();
    }
}

function editCueCell(cell) {
    if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field || !row || !row.dataset.id) return;

    state.cueSheetEditingRowId = row.dataset.id;
    row.classList.add('editing');

    const original = cell.dataset.original || '';
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    if (!isMultiline) input.type = 'text';
    input.value = original;
    input.className = isMultiline ? 'inline-edit-textarea' : 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (!isMultiline) input.select();

    input.addEventListener('keydown', (e) => handleCueCellKeydown(e, cell, row));

    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && (activeEl.classList.contains('inline-edit-input') || activeEl.classList.contains('inline-edit-textarea'))) return;
            if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) {
                saveCueSheetCell(cell, row);
            }
        }, 50);
    });
}
window.editCueCell = editCueCell;

function handleCueCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    if (e.key === 'Enter' && isMultiline && !e.metaKey && !e.ctrlKey) {
        // Allow newlines in textarea; only commit on Cmd/Ctrl+Enter
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        saveCueSheetCell(cell, row, true);
        navigateCueAdjacent(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        saveCueSheetCell(cell, row, true);
        navigateCueNextRow(row, field);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreCueCellDisplay(cell);
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }
}

function saveCueSheetCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = input.value;
    if (!CUE_SHEET_MULTILINE_FIELDS.has(field)) newValue = newValue.trim();

    const item = state.timeline.find(i => i.id === id);
    const oldValue = item ? (item[field] == null ? '' : String(item[field])) : '';

    if (field === 'time' && newValue) newValue = convertTo24Hour(newValue);
    if (field === 'duration' && newValue) newValue = formatDuration(newValue);
    if (field === 'screenCue') newValue = normalizeScreenCue(newValue);

    cell.dataset.original = newValue;
    restoreCueCellDisplay(cell);

    if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-textarea')) {
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }

    if (!item) return;
    if (newValue === oldValue) return;

    item[field] = newValue;

    const eventId = state.currentEventId;
    pushUndo(`Edit ${field}`, async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = state.timeline.find(i => i.id === id);
        if (current) current[field] = oldValue;
        await collections.timeline.doc(id).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.timeline.doc(id).update(updates).catch(err => {
        console.error('Error saving cue cell:', err);
        if (item) item[field] = oldValue;
        cell.dataset.original = oldValue;
        restoreCueCellDisplay(cell);
        showToast('Error saving', 'error');
    });
}

function restoreCueCellDisplay(cell) {
    const field = cell.dataset.field;
    const value = cell.dataset.original || '';
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(value)}</span>`;
    } else if (value === '') {
        cell.innerHTML = '<span class="cs-cell-empty">—</span>';
    } else {
        cell.textContent = value;
    }
}

function navigateCueAdjacent(row, currentField, direction) {
    const idx = CUE_SHEET_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < CUE_SHEET_FIELD_ORDER.length) {
        const nextField = CUE_SHEET_FIELD_ORDER[nextIdx];
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editCueCell(nextCell);
    } else if (direction > 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextRow = liveRow.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = CUE_SHEET_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editCueCell(nextCell);
        }
    } else if (direction < 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const prevRow = liveRow.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = CUE_SHEET_FIELD_ORDER[CUE_SHEET_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editCueCell(prevCell);
        }
    }
}

function navigateCueNextRow(row, field) {
    const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
    const nextRow = liveRow.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editCueCell(nextCell);
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
    if (data.duration) data.duration = formatDuration(data.duration);
    data.day = state.currentDay;
    data.completed = false;
    data.status = 'not-started';
    data.tag = '';
    data.notes = '';
    data.highlightColor = '';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    state.pendingNewRow = {};

    try {
        await collections.timeline.add(data);
        showToast('Task added');
    } catch (error) {
        console.error('Error adding task:', error);
        showToast('Error adding task', 'error');
    }

    clearTimelineEditingFlag();
}

// Cmd/Ctrl+Enter — insert a new row right after wherever you last were,
// instead of always appending at the bottom phantom row. Rows display in
// manual `order`, so "right after" means an order value between the
// reference row and whatever currently follows it.
async function insertTimelineRowAfterCurrent() {
    if (!state.currentEventId) return;

    // "Where you are": the row containing focus right now, falling back to
    // the last row you edited/clicked, even if focus has since moved away.
    const focusedRow = document.activeElement?.closest?.('tr.tl-row:not(.tl-phantom-row)');
    const afterId = focusedRow?.dataset.id || state.timelineLastActiveRowId;
    const afterItem = afterId ? state.timeline.find(t => t.id === afterId && t.day === state.currentDay) : null;

    // If a cell was mid-edit (its value was just saved via keepEditing=true,
    // which deliberately leaves the render guard up so this function can run
    // first), release the guard now so both that save and the new row below
    // actually render instead of silently queuing behind timelineEditingRowId.
    document.querySelectorAll('tr.tl-row.editing').forEach(r => r.classList.remove('editing'));
    clearTimelineEditingFlag();

    // No reference row yet this session — fall back to the old behavior.
    if (!afterItem) {
        const phantom = document.querySelector('.tl-phantom-row');
        if (phantom) {
            const firstCell = phantom.querySelector(`td[data-field="${TIMELINE_FIELD_ORDER[0]}"]`);
            if (firstCell) editTimelineCell(firstCell);
        }
        return;
    }

    const data = {
        day: state.currentDay,
        time: afterItem.time || '',
        order: nextTimelineOrderAfter(afterItem),
        duration: '',
        event: '',
        responsible: '',
        staff: '',
        production: false,
        tag: '',
        notes: '',
        completed: false,
        status: 'not-started',
        highlightColor: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
        const ref = await collections.timeline.add(data);
        state.timelineLastActiveRowId = ref.id;
        // Render right off our own write instead of waiting on the listener's
        // round-trip — setupCollectionListener replaces state.timeline wholesale
        // on its next fire anyway, so this optimistic entry is just temporary.
        state.timeline.push({ id: ref.id, ...data });
        state.timelineAnimateRows = false;
        renderTimeline();
        const cell = document.querySelector(`tr[data-id="${ref.id}"] td[data-field="event"]`);
        if (cell) editTimelineCell(cell);
    } catch (error) {
        console.error('Error inserting row:', error);
        showToast('Error adding task', 'error');
    }
}

// ── Timeline drag-and-drop reordering ────────────────────────────
function handleTimelineDragStart(e, id) {
    state.tlDragId = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    const row = e.target.closest('tr');
    if (row) row.classList.add('tl-dragging');
}
window.handleTimelineDragStart = handleTimelineDragStart;

function handleTimelineDragOver(e, row) {
    if (!state.tlDragId || row.dataset.id === state.tlDragId) return;
    e.preventDefault();
    const rect = row.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > rect.height / 2;
    row.classList.toggle('tl-drag-over-bottom', isAfter);
    row.classList.toggle('tl-drag-over-top', !isAfter);
}
window.handleTimelineDragOver = handleTimelineDragOver;

function handleTimelineDragLeave(e, row) {
    row.classList.remove('tl-drag-over-top', 'tl-drag-over-bottom');
}
window.handleTimelineDragLeave = handleTimelineDragLeave;

async function handleTimelineDrop(e, targetId) {
    e.preventDefault();
    const row = e.currentTarget;
    const dropAfter = row.classList.contains('tl-drag-over-bottom');
    row.classList.remove('tl-drag-over-top', 'tl-drag-over-bottom');

    const dragId = state.tlDragId;
    state.tlDragId = null;
    if (!dragId || dragId === targetId) return;

    const dragItem = state.timeline.find(i => i.id === dragId);
    const targetItem = state.timeline.find(i => i.id === targetId);
    if (!dragItem || !targetItem || dragItem.day !== targetItem.day) return;

    const dayItems = timelineSortedDayItems(targetItem.day).filter(i => i.id !== dragId);
    const targetIdx = dayItems.findIndex(i => i.id === targetId);
    const prevItem = dropAfter ? dayItems[targetIdx] : dayItems[targetIdx - 1];
    const nextItem = dropAfter ? dayItems[targetIdx + 1] : dayItems[targetIdx];

    const oldOrder = dragItem.order;
    const newOrder = orderBetween(prevItem?.order, nextItem?.order);
    if (newOrder === oldOrder) return;

    dragItem.order = newOrder;
    renderTimeline();

    const eventId = state.currentEventId;
    pushUndo('Reorder task', async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = state.timeline.find(i => i.id === dragId);
        if (current) current.order = oldOrder;
        renderTimeline();
        await collections.timeline.doc(dragId).update({ order: oldOrder });
    });

    try {
        await collections.timeline.doc(dragId).update({ order: newOrder, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (err) {
        console.error('Error reordering task:', err);
        dragItem.order = oldOrder;
        renderTimeline();
        showToast('Error reordering', 'error');
    }
}
window.handleTimelineDrop = handleTimelineDrop;

function handleTimelineDragEnd(e) {
    state.tlDragId = null;
    document.querySelectorAll('.tl-row.tl-dragging').forEach(r => r.classList.remove('tl-dragging'));
    document.querySelectorAll('.tl-row.tl-drag-over-top, .tl-row.tl-drag-over-bottom').forEach(r => r.classList.remove('tl-drag-over-top', 'tl-drag-over-bottom'));
}
window.handleTimelineDragEnd = handleTimelineDragEnd;

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
    const table = document.getElementById(`content-${categoryId}`);
    const card = table?.closest('.cat-card');
    const isOpen = card?.classList.contains('open') ?? false;
    card?.classList.toggle('open', !isOpen);
    localStorage.setItem(`category-${categoryId}`, isOpen ? 'closed' : 'open');
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
                        // Focus left the phantom row entirely — commit if any field has data
                        const hasData = BUDGET_FIELD_ORDER.some(f => state.pendingNewBudgetRow[f] && String(state.pendingNewBudgetRow[f]).trim());
                        if (hasData) {
                            commitNewBudgetRow(row);
                        } else {
                            clearBudgetEditingFlag();
                        }
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
            diffCell.className = 'r';
            diffCell.innerHTML = difference === 0
                ? '<span class="diff-zero">—</span>'
                : difference < 0
                    ? `<span class="diff-over">−${formatCurrency(Math.abs(difference))}</span>`
                    : `<span class="diff-under">${formatCurrency(difference)}</span>`;
        }
    }

    // If no other cells are being edited in this row, clear editing state
    if (!row.querySelector('.inline-edit-input')) {
        row.classList.remove('editing');
        clearBudgetEditingFlag();
    }

    // Only save if value changed
    if (String(newValue) === String(oldValue)) return;

    const eventId = state.currentEventId;
    pushUndo(`Edit ${field}`, async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = state.budget.find(i => i.id === id);
        if (current) current[field] = oldValue;
        await collections.budget.doc(id).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

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
                cell.innerHTML = paymentBadgeHtml(val);
            } else if (field === 'vendor') {
                cell.innerHTML = `<span class="td-vendor">${escapeHtml(val)}</span>`;
            } else if (field === 'description') {
                cell.innerHTML = `<span class="td-desc">${escapeHtml(val)}</span>`;
            } else if (field === 'notes') {
                cell.innerHTML = `<span class="td-notes">${escapeHtml(val)}</span>`;
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
            cell.innerHTML = paymentBadgeHtml(original);
        } else if (field === 'vendor') {
            cell.innerHTML = `<span class="td-vendor">${escapeHtml(original)}</span>`;
        } else if (field === 'description') {
            cell.innerHTML = `<span class="td-desc">${escapeHtml(original)}</span>`;
        } else if (field === 'notes') {
            cell.innerHTML = original ? `<span class="td-notes">${escapeHtml(original)}</span>` : '';
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

    // Need at least one field populated
    const hasAnyData = BUDGET_FIELD_ORDER.some(f => data[f] && String(data[f]).trim());
    if (!hasAnyData) {
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

    // Mobile card view
    const mobileContainer = document.getElementById('stage-mobile-cards');
    if (mobileContainer) {
        if (sorted.length === 0) {
            mobileContainer.innerHTML = '<div class="mobile-card-empty">No inputs</div>';
        } else {
            mobileContainer.innerHTML = sorted.map(item => {
                return `
                    <div class="mobile-card">
                        <div class="mobile-card-row">
                            <span class="mobile-card-channel">${escapeHtml(item.channel || '?')}</span>
                            <span class="mobile-card-title">${escapeHtml(item.instrument || 'No instrument')}</span>
                            ${item.symbol ? `<span class="mobile-card-subtitle">${escapeHtml(item.symbol)}</span>` : ''}
                        </div>
                        <div class="mobile-card-details">
                            ${item.subsnake ? `<span class="mobile-card-detail"><strong>Snake:</strong> ${escapeHtml(item.subsnake)}</span>` : ''}
                            ${item.mics ? `<span class="mobile-card-detail"><strong>Mic:</strong> ${escapeHtml(item.mics)}</span>` : ''}
                            ${item.stands ? `<span class="mobile-card-detail"><strong>Stand:</strong> ${escapeHtml(item.stands)}</span>` : ''}
                            ${item.notes ? `<span class="mobile-card-detail"><strong>Notes:</strong> ${escapeHtml(item.notes)}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
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

    const eventId = state.currentEventId;
    pushUndo(`Edit ${field}`, async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = stageData.find(i => i.id === id);
        if (current) current[field] = oldValue;
        await collections[collectionName].doc(id).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

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

// ==========================================
// STAFF PAGE
// ==========================================

const STAFF_TEAM_COLORS = {
    'Check In': '#4a90a4',
    'FOH Team': '#7b6cb0',
    'Silent Auction': '#c9a961',
    'Bathroom/FOH': '#8a8778',
    'Marketing': '#d4795c',
    'Mainstage Production Team': '#c9a961',
    'Talent': '#e06b8a',
    'Power 20 team': '#4aaa7a',
    'Greenroom Team': '#6a9a6a'
};

function getTeamColor(teamName) {
    if (STAFF_TEAM_COLORS[teamName]) return STAFF_TEAM_COLORS[teamName];
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#4a90a4', '#7b6cb0', '#d4795c', '#e06b8a', '#4aaa7a', '#6a9a6a', '#8a6a4a', '#5a7a9a'];
    return colors[Math.abs(hash) % colors.length];
}

function staffItemMatchesSearch(member, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        member.name || '',
        member.role || '',
        ...(member.teams || [])
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

function setStaffView(view) {
    state.staffView = view;
    document.getElementById('staff-team-view-btn').classList.toggle('active', view === 'team');
    document.getElementById('staff-schedule-view-btn').classList.toggle('active', view === 'schedule');
    document.getElementById('staff-team-view').style.display = view === 'team' ? '' : 'none';
    document.getElementById('staff-schedule-view').style.display = view === 'schedule' ? '' : 'none';
    renderStaff();
}

function setStaffDay(day) {
    state.staffDay = day;
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderStaffGantt();
}

window.setStaffView = setStaffView;
window.setStaffDay = setStaffDay;

function toggleStaffUnfilledFilter() {
    state.staffFilter = state.staffFilter === 'unfilled' ? 'all' : 'unfilled';
    updateStaffUnfilledCard();
    renderStaff();
}

function updateStaffUnfilledCard() {
    const card = document.getElementById('staff-stat-unfilled-card');
    if (card) card.classList.toggle('active', state.staffFilter === 'unfilled');
}

window.toggleStaffUnfilledFilter = toggleStaffUnfilledFilter;

function formatScheduleShort(timeStr) {
    if (!timeStr) return null;
    return timeStr
        .replace(/:00/g, '')
        .replace(/\s*-\s*/g, '-')
        .replace(/12:30:00 PM/gi, '12:30p')
        .replace(/(\d{1,2})(:\d{2})?(am)/gi, '$1$2a')
        .replace(/(\d{1,2})(:\d{2})?(pm)/gi, '$1$2p')
        .replace(/ /g, '');
}

function parseStaffTime(timeStr) {
    if (!timeStr) return null;
    // Strip whitespace AND periods so "9:30 a.m." normalizes to "9:30am"
    let s = timeStr.trim().toLowerCase().replace(/[\s.]/g, '');
    s = s.replace(/(\d{1,2}:\d{2}):\d{2}(am|pm)/i, '$1$2');
    // Colon between hours and minutes is optional so "930am" also parses
    const match = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = (match[3] || '').toLowerCase();
    if (ampm === 'pm' || ampm === 'p') {
        if (hours !== 12) hours += 12;
    } else if (ampm === 'am' || ampm === 'a') {
        if (hours === 12) hours = 0;
    }
    return hours + minutes / 60;
}

function parseStaffScheduleRange(schedStr) {
    if (!schedStr) return [];
    const parts = schedStr.split('/').map(p => p.trim());
    const ranges = [];
    for (const part of parts) {
        const halves = part.split(/\s*-\s*/);
        if (halves.length !== 2) continue;
        let start = parseStaffTime(halves[0]);
        let end = parseStaffTime(halves[1]);
        if (start === null || end === null) continue;
        if (end <= start) end += 24;
        ranges.push({ start, end });
    }
    return ranges;
}

function renderStaff() {
    const total = state.staff.length;
    const allTeams = new Set();
    state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));
    const unfilled = state.staff.filter(m => m.isPlaceholder).length;

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('staff-stat-total', total);
    setStat('staff-stat-teams', allTeams.size);
    setStat('staff-stat-unfilled', unfilled);
    updateStaffUnfilledCard();

    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    const countEl = document.getElementById('staff-search-count');
    const clearBtn = document.getElementById('staff-search-clear');

    if (state.staffView === 'team') {
        renderStaffTeamView(isSearching, searchQuery);
    } else {
        renderStaffGantt();
    }

    const filteredCount = state.staff.filter(m => staffItemMatchesSearch(m, searchQuery)).length;
    if (countEl) {
        countEl.textContent = isSearching ? `${filteredCount} of ${total} staff` : `${total} staff`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';
}

function renderStaffTeamView(isSearching, searchQuery) {
    const container = document.getElementById('staff-team-grid');
    if (!container) return;

    const total = state.staff.length;
    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff members added yet. Click "+ Add Staff" to get started.</div>';
        return;
    }

    const teamMap = new Map();
    let members = isSearching
        ? state.staff.filter(m => staffItemMatchesSearch(m, searchQuery))
        : state.staff;

    if (state.staffFilter === 'unfilled') {
        members = members.filter(m => m.isPlaceholder);
    }

    if (members.length === 0) {
        if (state.staffFilter === 'unfilled') {
            container.innerHTML = '<div class="staff-empty-state">No unfilled positions — all roles are assigned!</div>';
        } else {
            container.innerHTML = '<div class="staff-empty-state">No staff match "' + escapeHtml(searchQuery) + '"</div>';
        }
        return;
    }

    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        for (const team of teams) {
            if (!teamMap.has(team)) teamMap.set(team, []);
            teamMap.get(team).push(member);
        }
    }

    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let cardIndex = 0;
    const days = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Thu', 'Fri', 'Sat', 'Sun'];

    container.innerHTML = sortedTeams.map(teamName => {
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const color = getTeamColor(teamName);

        const cardsHtml = teamMembers.map(member => {
            const idx = cardIndex++;
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const badgesHtml = otherTeams.map(t =>
                '<span class="staff-team-badge">+' + escapeHtml(t) + '</span>'
            ).join('');
            const linkedBudget = getLinkedBudget(member);
            const budgetHtml = linkedBudget ? '<span class="staff-budget-badge">$</span>' : '';

            const schedHtml = days.map((day, i) => {
                const val = member.schedule && member.schedule[day];
                const short = formatScheduleShort(val);
                let timeHtml;
                if (!short) {
                    timeHtml = '\u2014';
                } else if (short.includes('-')) {
                    const parts = short.split('-');
                    timeHtml = escapeHtml(parts[0]) + '<br>' + escapeHtml(parts.slice(1).join('-'));
                } else {
                    timeHtml = escapeHtml(short);
                }
                return '<div class="staff-sched-day' + (val ? '' : ' off') + '">' +
                    '<span class="staff-sched-day-label">' + dayLabels[i] + '</span>' +
                    '<span class="staff-sched-day-time">' + timeHtml + '</span>' +
                '</div>';
            }).join('');

            return '<div class="staff-card' + (member.isPlaceholder ? ' placeholder' : '') + '"' +
                ' data-id="' + member.id + '"' +
                ' style="--team-color: ' + color + '; animation-delay: ' + (idx * 30) + 'ms"' +
                ' onclick="openStaffModal(\'' + member.id + '\')">' +
                (budgetHtml ? '<span class="staff-budget-badge staff-budget-corner">' + '$' + '</span>' : '') +
                '<div class="staff-card-name">' + escapeHtml(member.name || '') + '</div>' +
                '<div class="staff-card-role">' + escapeHtml(member.role || '') + '</div>' +
                (badgesHtml ? '<div class="staff-card-badges">' + badgesHtml + '</div>' : '') +
                '<div class="staff-card-schedule">' + schedHtml + '</div>' +
            '</div>';
        }).join('');

        return '<div class="staff-team-section" id="staff-team-' + teamName.replace(/\s+/g, '-').toLowerCase() + '">' +
            '<div class="staff-team-header" onclick="toggleStaffTeam(this)">' +
                '<div>' +
                    '<span class="staff-team-title">' + escapeHtml(teamName) + '</span>' +
                    '<span class="staff-team-count">' + teamMembers.length + '</span>' +
                '</div>' +
                '<span class="staff-team-chevron">\u25BC</span>' +
            '</div>' +
            '<div class="staff-team-cards">' + cardsHtml + '</div>' +
        '</div>';
    }).join('');
}

function toggleStaffTeam(headerEl) {
    headerEl.closest('.staff-team-section').classList.toggle('collapsed');
}
window.toggleStaffTeam = toggleStaffTeam;

function renderStaffGantt() {
    const container = document.getElementById('staff-gantt-container');
    if (!container) return;

    const day = state.staffDay;
    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    let members = state.staff.filter(m => m.schedule && m.schedule[day]);
    if (isSearching) {
        members = members.filter(m => staffItemMatchesSearch(m, searchQuery));
    }

    const dayCountEl = document.getElementById('staff-day-count');
    if (dayCountEl) {
        dayCountEl.textContent = members.length + ' staff';
    }

    const dayCounts = {};
    for (const d of ['thursday', 'friday', 'saturday', 'sunday']) {
        dayCounts[d] = state.staff.filter(m => m.schedule && m.schedule[d]).length;
    }
    const dayNames = ['Thu', 'Fri', 'Sat', 'Sun'];
    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        const idx = dayKeys.indexOf(d);
        if (idx !== -1) tab.textContent = dayNames[idx] + ' (' + dayCounts[d] + ')';
    });

    if (members.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff scheduled for this day</div>';
        return;
    }

    const teamMap = new Map();
    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        const team = teams[0];
        if (!teamMap.has(team)) teamMap.set(team, []);
        teamMap.get(team).push(member);
    }

    const axisStart = 7;
    const axisEnd = 27;
    const axisRange = axisEnd - axisStart;

    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = '<div class="staff-gantt-time-axis">' +
        axisLabels.map(l => '<span class="staff-gantt-time-label">' + l + '</span>').join('') +
        '</div>';

    function collapseTeamMembers(teamMembers) {
        const result = [];
        const placeholderGroups = new Map();
        for (const m of teamMembers) {
            if (m.isPlaceholder) {
                const key = m.schedule[day] || '';
                if (placeholderGroups.has(key)) {
                    placeholderGroups.get(key).count++;
                } else {
                    placeholderGroups.set(key, { member: m, count: 1 });
                }
            } else {
                result.push({ member: m, count: 1 });
            }
        }
        for (const { member, count } of placeholderGroups.values()) {
            result.push({ member, count });
        }
        return result;
    }

    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let html = timeAxisHtml;

    for (const teamName of sortedTeams) {
        const color = getTeamColor(teamName);
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const collapsed = collapseTeamMembers(teamMembers);

        html += '<div class="staff-gantt-team">';
        html += '<div class="staff-gantt-team-header">' + escapeHtml(teamName) + '</div>';

        for (const { member, count } of collapsed) {
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const multiTag = otherTeams.length > 0
                ? '<span class="multi-team-tag">+' + escapeHtml(otherTeams[0]) + '</span>' : '';
            const budgetTag = getLinkedBudget(member) ? '<span class="budget-tag">$</span>' : '';
            const nameDisplay = member.isPlaceholder && count > 1
                ? '<span class="placeholder-name">' + escapeHtml(member.name) + ' \u00d7' + count + '</span>'
                : member.isPlaceholder
                ? '<span class="placeholder-name">' + escapeHtml(member.name) + '</span>'
                : escapeHtml(member.name);

            const ranges = parseStaffScheduleRange(member.schedule[day]);
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(member.schedule[day]) || '';
                return '<div class="staff-gantt-bar' + (member.isPlaceholder ? ' placeholder-bar' : '') + '"' +
                    ' style="left:' + left + '%;width:' + width + '%;background:' + color + '"' +
                    ' onclick="openStaffModal(\'' + member.id + '\')"' +
                    ' title="' + escapeHtml(member.name) + ': ' + escapeHtml(member.schedule[day]) + '">' +
                    (ranges.length === 1 ? escapeHtml(label) : '') +
                '</div>';
            }).join('');

            html += '<div class="staff-gantt-row">' +
                '<div class="staff-gantt-name" onclick="openStaffModal(\'' + member.id + '\')">' +
                    nameDisplay + multiTag + budgetTag +
                '</div>' +
                '<div class="staff-gantt-bar-area">' + barsHtml + '</div>' +
            '</div>';
        }

        html += '</div>';
    }

    container.innerHTML = html;
}

let staffModalTeams = [];

function openStaffModal(memberId = null) {
    const modal = document.getElementById('staff-modal');
    const form = document.getElementById('staff-form');
    const title = document.getElementById('staff-modal-title');
    const deleteBtn = document.getElementById('staff-delete-btn');

    form.reset();
    staffModalTeams = [];

    // Always reset directory suggestions on open
    const dirSug = document.getElementById('staff-dir-suggestions');
    if (dirSug) dirSug.style.display = 'none';

    if (memberId) {
        const member = state.staff.find(s => s.id === memberId);
        if (member) {
            title.textContent = 'Edit Staff Member';
            document.getElementById('staff-id').value = member.id;
            document.getElementById('staff-name').value = member.name || '';
            document.getElementById('staff-role').value = member.role || '';
            document.getElementById('staff-phone').value = member.phone || '';
            document.getElementById('staff-email').value = member.email || '';
            document.getElementById('staff-placeholder').checked = member.isPlaceholder || false;
            staffModalTeams = [...(member.teams || [])];

            const sched = member.schedule || {};
            document.getElementById('staff-sched-thursday').value = sched.thursday || '';
            document.getElementById('staff-sched-friday').value = sched.friday || '';
            document.getElementById('staff-sched-saturday').value = sched.saturday || '';
            document.getElementById('staff-sched-sunday').value = sched.sunday || '';

            deleteBtn.style.display = '';
        }
    } else {
        title.textContent = 'Add Staff Member';
        document.getElementById('staff-id').value = '';
        document.getElementById('staff-phone').value = '';
        document.getElementById('staff-email').value = '';
        document.getElementById('staff-sched-thursday').value = '';
        document.getElementById('staff-sched-friday').value = '';
        document.getElementById('staff-sched-saturday').value = '';
        document.getElementById('staff-sched-sunday').value = '';
        deleteBtn.style.display = 'none';
    }

    renderStaffTeamTags();

    // Populate budget link dropdown
    const member = memberId ? state.staff.find(s => s.id === memberId) : null;
    const budgetSelect = document.getElementById('staff-linked-budget');
    const unlinkedBudgets = state.budget.filter(b => !b.linkedStaffId || (member && b.id === member.linkedBudgetId));
    budgetSelect.innerHTML = '<option value="">— None —</option>' +
        unlinkedBudgets.map(b =>
            '<option value="' + b.id + '"' + (member && member.linkedBudgetId === b.id ? ' selected' : '') + '>' +
            escapeHtml(b.vendor || 'Unnamed') + ' (' + formatCurrency(b.budgeted) + ')' +
            '</option>'
        ).join('');

    // Show auto-suggestion if unlinked
    const suggestionDiv = document.getElementById('staff-budget-suggestion');
    const infoPanel = document.getElementById('staff-linked-budget-info');
    if (member && !member.linkedBudgetId) {
        const suggestions = findBudgetSuggestions(member.name);
        if (suggestions.length > 0) {
            suggestionDiv.innerHTML = '<strong>Suggested match:</strong> ' +
                suggestions.map(s =>
                    '<button type="button" class="btn-link-suggest" onclick="document.getElementById(\'staff-linked-budget\').value=\'' + s.id + '\'; this.parentElement.style.display=\'none\';">' +
                    escapeHtml(s.vendor) + ' (' + formatCurrency(s.budgeted) + ')</button>'
                ).join(' ');
            suggestionDiv.style.display = '';
        } else {
            suggestionDiv.style.display = 'none';
        }
    } else {
        suggestionDiv.style.display = 'none';
    }

    // Show linked budget info panel
    if (member && member.linkedBudgetId) {
        const lb = getLinkedBudget(member);
        if (lb) {
            const cat = (lb.category || '').replace(/^6811[a-g] - /, '');
            infoPanel.innerHTML = '<div class="linked-info-summary">' +
                '<strong>' + escapeHtml(lb.vendor) + '</strong> — ' + escapeHtml(cat) +
                (lb.contact ? '<br>Contact: ' + escapeHtml(lb.contact) : '') +
                (lb.phone ? ' | ' + escapeHtml(lb.phone) : '') +
                (lb.email ? ' | ' + escapeHtml(lb.email) : '') +
                '<br><button type="button" class="btn btn-sm" onclick="closeAllModals(); setTimeout(function(){ editBudgetItem(\'' + lb.id + '\'); }, 200);">View Budget Entry</button>' +
                '</div>';
            infoPanel.style.display = '';
        } else {
            infoPanel.style.display = 'none';
        }
    } else {
        infoPanel.style.display = 'none';
    }

    modal.classList.add('active');
}

function renderStaffTeamTags() {
    const container = document.getElementById('staff-teams-tags');
    container.innerHTML = staffModalTeams.map(t =>
        '<span class="staff-team-tag">' + escapeHtml(t) +
        '<span class="staff-team-tag-remove" onclick="removeStaffTeam(\'' + escapeHtml(t).replace(/'/g, "\\'") + '\')">\u00d7</span></span>'
    ).join('');
}

function removeStaffTeam(teamName) {
    staffModalTeams = staffModalTeams.filter(t => t !== teamName);
    renderStaffTeamTags();
}
window.removeStaffTeam = removeStaffTeam;

function setupStaffTeamInput() {
    const input = document.getElementById('staff-team-input');
    const sugBox = document.getElementById('staff-team-suggestions');
    if (!input || !sugBox) return;

    function showTeamSuggestions() {
        const val = input.value.trim().toLowerCase();

        const allTeams = new Set();
        state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));

        const matches = [...allTeams].sort()
            .filter(t => (!val || t.toLowerCase().includes(val)) && !staffModalTeams.includes(t));

        let html = '';
        if (matches.length > 0) {
            html = matches.map(t =>
                '<div class="staff-team-suggestion" onclick="addStaffTeam(\'' + escapeHtml(t).replace(/'/g, "\\'") + '\')">' + escapeHtml(t) + '</div>'
            ).join('');
        }
        if (val.length > 1 && !matches.some(t => t.toLowerCase() === val)) {
            html += '<div class="staff-team-suggestion staff-team-suggestion-create" onclick="addStaffTeam(\'' + escapeHtml(input.value.trim()).replace(/'/g, "\\'") + '\')">' +
                '+ Create "' + escapeHtml(input.value.trim()) + '"</div>';
        }
        if (html) {
            sugBox.innerHTML = html;
            sugBox.style.display = 'block';
        } else {
            sugBox.style.display = 'none';
        }
    }

    input.addEventListener('input', showTeamSuggestions);
    input.addEventListener('focus', showTeamSuggestions);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val && !staffModalTeams.includes(val)) {
                addStaffTeam(val);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.staff-teams-input') && !e.target.closest('.staff-team-suggestions')) {
            sugBox.style.display = 'none';
        }
    });
}

function addStaffTeam(teamName) {
    if (!staffModalTeams.includes(teamName)) {
        staffModalTeams.push(teamName);
        renderStaffTeamTags();
    }
    const input = document.getElementById('staff-team-input');
    input.value = '';
    document.getElementById('staff-team-suggestions').style.display = 'none';
}
window.addStaffTeam = addStaffTeam;

async function handleStaffSubmit(e) {
    e.preventDefault();

    // Auto-add any typed-but-uncommitted team name
    const teamInput = document.getElementById('staff-team-input');
    const pendingTeam = teamInput.value.trim();
    if (pendingTeam && !staffModalTeams.includes(pendingTeam)) {
        staffModalTeams.push(pendingTeam);
    }

    const newName = document.getElementById('staff-name').value;
    const newLinkedBudgetId = document.getElementById('staff-linked-budget').value || null;

    const staffData = {
        name: newName,
        role: document.getElementById('staff-role').value,
        phone: document.getElementById('staff-phone').value.trim() || null,
        email: document.getElementById('staff-email').value.trim() || null,
        teams: [...staffModalTeams],
        schedule: {
            thursday: document.getElementById('staff-sched-thursday').value.trim() || null,
            friday: document.getElementById('staff-sched-friday').value.trim() || null,
            saturday: document.getElementById('staff-sched-saturday').value.trim() || null,
            sunday: document.getElementById('staff-sched-sunday').value.trim() || null
        },
        isPlaceholder: document.getElementById('staff-placeholder').checked,
        linkedBudgetId: newLinkedBudgetId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const staffId = document.getElementById('staff-id').value;

    try {
        let resolvedStaffId = staffId;
        if (staffId) {
            await collections.staff.doc(staffId).update(staffData);
            showToast('Staff member updated');
        } else {
            staffData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            staffData.sortOrder = state.staff.length;
            const docRef = await collections.staff.add(staffData);
            resolvedStaffId = docRef.id;
            showToast('Staff member added');
        }

        // Maintain bidirectional link
        const oldMember = state.staff.find(s => s.id === staffId);
        const oldBudgetId = oldMember ? oldMember.linkedBudgetId : null;

        // Clear old budget link if it changed
        if (oldBudgetId && oldBudgetId !== newLinkedBudgetId) {
            await collections.budget.doc(oldBudgetId).update({ linkedStaffId: null });
        }
        // Set new budget link
        if (newLinkedBudgetId) {
            const budgetUpdate = { linkedStaffId: resolvedStaffId };
            // Sync name to budget vendor + contact fields
            if (newName) {
                budgetUpdate.vendor = newName;
                budgetUpdate.contact = newName;
            }
            // Sync contact info to budget (staff edit wins)
            budgetUpdate.phone = staffData.phone;
            budgetUpdate.email = staffData.email;
            await collections.budget.doc(newLinkedBudgetId).update(budgetUpdate);
        }

        // Save to staff directory (global, cross-event)
        if (!staffData.isPlaceholder) {
            upsertStaffContact(staffData.name, staffData.phone, staffData.email, staffData.role);
        }

        closeAllModals();
    } catch (error) {
        console.error('Error saving staff member:', error);
        showToast('Error saving staff member. Please try again.', 'error');
    }
}

const _baseDeleteStaff = createDeleteHandler('staff', 'staff member');
window.deleteStaff = async function(id) {
    const member = state.staff.find(s => s.id === id);
    if (member && member.linkedBudgetId) {
        try { await collections.budget.doc(member.linkedBudgetId).update({ linkedStaffId: null }); } catch (e) { /* budget may be deleted */ }
    }
    return _baseDeleteStaff(id);
};
window.openStaffModal = openStaffModal;

function deleteStaffFromModal() {
    const staffId = document.getElementById('staff-id').value;
    if (staffId) {
        closeAllModals();
        deleteStaff(staffId);
    }
}
window.deleteStaffFromModal = deleteStaffFromModal;

// ==========================================
// STAFF DIRECTORY
// ==========================================

// Season-scoped collection helpers
function staffDirectoryCol()    { return db.collection('seasons').doc(state.currentSeason).collection('staffDirectory'); }
function jobTemplatesCol()      { return db.collection('seasons').doc(state.currentSeason).collection('jobTemplates'); }
function performerDirectoryCol(){ return db.collection('seasons').doc(state.currentSeason).collection('performerDirectory'); }

let _unsubStaff = null, _unsubJobTemplates = null, _unsubPerformers = null;

function loadRoleCategoryMap() {
    if (_unsubJobTemplates) { _unsubJobTemplates(); _unsubJobTemplates = null; }
    _unsubJobTemplates = jobTemplatesCol().onSnapshot(snap => {
        state.roleCategoryMap = {};
        state.jobTemplates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.jobTemplates.forEach(t => {
            if (t.name) state.roleCategoryMap[t.name.trim().toLowerCase()] = t.category || '';
        });
    }, err => console.warn('jobTemplates listener error:', err));
}

async function addJobTemplate(name, category) {
    name = (name || '').trim();
    category = (category || '').trim();
    if (!name || !category) { showToast('Name and category are required', 'error'); return; }
    const exists = state.jobTemplates.some(t => t.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) { showToast('A template for "' + name + '" already exists', 'error'); return; }
    try {
        await jobTemplatesCol().add({ name, category, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        showToast('Job template saved');
    } catch (e) {
        console.error('addJobTemplate error:', e);
        showToast('Error saving template', 'error');
    }
}
window.addJobTemplate = addJobTemplate;

async function deleteJobTemplate(id) {
    // Optimistic update
    state.jobTemplates = state.jobTemplates.filter(t => t.id !== id);
    renderJobTemplates();
    try {
        await jobTemplatesCol().doc(id).delete();
    } catch (e) {
        console.error('deleteJobTemplate error:', e);
        showToast('Error deleting template', 'error');
    }
}
window.deleteJobTemplate = deleteJobTemplate;

function getCategoryForRole(role) {
    if (!role) return '';
    const key = role.trim().toLowerCase();
    // Exact match first
    if (state.roleCategoryMap[key]) return state.roleCategoryMap[key];
    // Partial match: template name appears in role or vice versa
    const match = state.jobTemplates.find(t =>
        key.includes(t.name.trim().toLowerCase()) || t.name.trim().toLowerCase().includes(key)
    );
    return match ? match.category : '';
}

function loadStaffDirectory() {
    if (_unsubStaff) { _unsubStaff(); _unsubStaff = null; }
    _unsubStaff = staffDirectoryCol().onSnapshot(snap => {
        state.staffDirectory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Refresh the table if the modal is open — renderStaffIndex preserves any active edit rows
        const modal = document.getElementById('staff-index-modal');
        if (modal && modal.classList.contains('active')) renderStaffIndex();
    }, err => console.warn('staffDirectory listener error:', err));
}

function normalizeRole(role) {
    return (role || '').trim().toLowerCase();
}

function onStaffRoleInput(value) {
    const role = normalizeRole(value);
    const suggestionsDiv = document.getElementById('staff-dir-suggestions');
    const listDiv = document.getElementById('staff-dir-list');
    if (!suggestionsDiv || !listDiv) return;

    if (!role) { suggestionsDiv.style.display = 'none'; return; }

    // Match job templates first (generic roles)
    const templateMatches = state.jobTemplates.filter(t =>
        normalizeRole(t.name).includes(role) || role.includes(normalizeRole(t.name))
    );

    // Match directory contacts whose roles match
    const contactMatches = state.staffDirectory.filter(contact =>
        (contact.roles || []).some(r => normalizeRole(r).includes(role) || role.includes(normalizeRole(r)))
    );

    if (!templateMatches.length && !contactMatches.length) {
        suggestionsDiv.style.display = 'none';
        return;
    }

    const label = document.querySelector('.dir-suggestions-label');
    if (label) label.textContent = contactMatches.length ? 'People used in this role before:' : 'Matching job templates:';

    listDiv.innerHTML =
        // Show matching templates as "use this role" chips
        templateMatches.map(t =>
            '<div class="dir-suggestion-item dir-suggestion-template" onclick="applyJobTemplate(\'' + escapeHtml(t.name).replace(/'/g,"\\'") + '\')">' +
            '<span class="dir-suggestion-name">' + escapeHtml(t.name) + '</span>' +
            '<span class="dir-suggestion-meta dir-template-badge">template</span>' +
            '</div>'
        ).join('') +
        // Then show people from directory
        contactMatches.map(c =>
            '<div class="dir-suggestion-item" onclick="selectFromDirectory(\'' + c.id + '\')">' +
            '<span class="dir-suggestion-name">' + escapeHtml(c.name || '') + '</span>' +
            (c.phone ? '<span class="dir-suggestion-meta">' + escapeHtml(c.phone) + '</span>' : '') +
            (c.email ? '<span class="dir-suggestion-meta">' + escapeHtml(c.email) + '</span>' : '') +
            '</div>'
        ).join('');

    suggestionsDiv.style.display = '';
}

function applyJobTemplate(templateName) {
    const el = document.getElementById('staff-role');
    if (el) el.value = templateName;
    document.getElementById('staff-dir-suggestions').style.display = 'none';
}
window.applyJobTemplate = applyJobTemplate;
window.onStaffRoleInput = onStaffRoleInput;

function selectFromDirectory(contactId) {
    const contact = state.staffDirectory.find(c => c.id === contactId);
    if (!contact) return;
    const nameEl = document.getElementById('staff-name');
    const phoneEl = document.getElementById('staff-phone');
    const emailEl = document.getElementById('staff-email');
    if (nameEl && !nameEl.value) nameEl.value = contact.name || '';
    if (phoneEl) phoneEl.value = contact.phone || '';
    if (emailEl) emailEl.value = contact.email || '';
    document.getElementById('staff-dir-suggestions').style.display = 'none';
}
window.selectFromDirectory = selectFromDirectory;

async function upsertStaffContact(name, phone, email, role) {
    if (!name || !role) return;
    const normalRole = normalizeRole(role);
    const existing = state.staffDirectory.find(c =>
        (c.name || '').trim().toLowerCase() === name.trim().toLowerCase()
    );
    try {
        if (existing) {
            const roles = existing.roles || [];
            if (!roles.map(normalizeRole).includes(normalRole)) {
                roles.push(role.trim());
            }
            await staffDirectoryCol().doc(existing.id).update({
                phone: phone || existing.phone || null,
                email: email || existing.email || null,
                roles
            });
        } else {
            await staffDirectoryCol().add({
                name: name.trim(),
                phone: phone || null,
                email: email || null,
                roles: [role.trim()],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {
        console.warn('upsertStaffContact error:', e);
    }
}

function openStaffIndex() {
    const modal = document.getElementById('staff-index-modal');
    if (!modal) return;
    const addForm = document.getElementById('staff-dir-add-form');
    if (addForm) addForm.style.display = 'none';
    const rolePanel = document.getElementById('role-mappings-panel');
    if (rolePanel) rolePanel.style.display = 'none';
    renderStaffIndex();
    modal.classList.add('active');
    // Close hamburger if open
    document.getElementById('nav-menu')?.classList.remove('open');
}

function openJobTemplates() {
    // Reuse the staff index modal but flip to the role mappings panel
    openStaffIndex();
    setTimeout(() => {
        const rolePanel = document.getElementById('role-mappings-panel');
        if (rolePanel) { rolePanel.style.display = ''; renderJobTemplates(); }
    }, 50);
}
window.openJobTemplates = openJobTemplates;
window.openStaffIndex = openStaffIndex;

window.toggleSbUserMenu = function(e) {
    e.stopPropagation();
    const menu = document.getElementById('sb-user-menu');
    const isOpen = menu.style.display !== 'none';
    if (isOpen) { closeSbUserMenu(); } else { openSbUserMenu(); }
};

function openSbUserMenu() {
    const menu = document.getElementById('sb-user-menu');
    const inEvent = !!state.activeEvent;
    const managePages = document.getElementById('sb-menu-manage-pages');
    if (managePages) managePages.style.display = inEvent ? '' : 'none';
    const divider = menu.querySelector('.sb-user-menu-divider');
    if (divider) divider.style.display = inEvent ? '' : 'none';
    menu.style.display = 'block';
    document.getElementById('sb-user-chevron').style.transform = 'rotate(180deg)';
    setTimeout(() => document.addEventListener('click', sbUserMenuOutsideClick), 0);
}

function closeSbUserMenu() {
    const menu = document.getElementById('sb-user-menu');
    menu.style.display = 'none';
    const chevron = document.getElementById('sb-user-chevron');
    if (chevron) chevron.style.transform = '';
    document.removeEventListener('click', sbUserMenuOutsideClick);
}

function sbUserMenuOutsideClick(e) {
    const menu = document.getElementById('sb-user-menu');
    if (!menu.contains(e.target)) closeSbUserMenu();
}

window.closeSbUserMenu = closeSbUserMenu;

function closeStaffIndex() {
    const modal = document.getElementById('staff-index-modal');
    if (modal) modal.classList.remove('active');
}
window.closeStaffIndex = closeStaffIndex;

async function syncStaffToDirectory(silent = false) {
    const staffToSync = (state.staff || []).filter(m => !m.isPlaceholder && m.name && m.role);
    if (!staffToSync.length) {
        if (!silent) showToast('No staff to sync', 'error');
        return;
    }
    let count = 0;
    for (const m of staffToSync) {
        await upsertStaffContact(m.name, m.phone, m.email, m.role);
        count++;
    }
    if (!silent) showToast(count + ' staff member' + (count !== 1 ? 's' : '') + ' synced to directory');
}
window.syncStaffToDirectory = syncStaffToDirectory;

function toggleAddDirectoryContact() {
    const form = document.getElementById('staff-dir-add-form');
    if (!form) return;
    const showing = form.style.display !== 'none';
    form.style.display = showing ? 'none' : '';
    if (!showing) {
        // Clear fields on open
        ['dir-add-name','dir-add-role','dir-add-phone','dir-add-email'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('dir-add-name')?.focus();
    }
}
window.toggleAddDirectoryContact = toggleAddDirectoryContact;

async function saveDirectoryContact() {
    const name = (document.getElementById('dir-add-name')?.value || '').trim();
    const role = (document.getElementById('dir-add-role')?.value || '').trim();
    const phone = (document.getElementById('dir-add-phone')?.value || '').trim();
    const email = (document.getElementById('dir-add-email')?.value || '').trim();
    if (!name || !role) { showToast('Name and Role are required', 'error'); return; }
    await upsertStaffContact(name, phone, email, role);
    showToast('Contact saved');
    toggleAddDirectoryContact();
}
window.saveDirectoryContact = saveDirectoryContact;

function renderStaffIndex() {
    const container = document.getElementById('staff-index-content');
    if (!container) return;

    // Preserve any edit rows that are currently open so a re-render doesn't lose the user's work
    const activeEdits = {};
    container.querySelectorAll('.sm-edit-row').forEach(row => {
        if (row.style.display !== 'none') {
            const id = row.id.replace('dir-edit-', '');
            activeEdits[id] = {
                name:  document.getElementById('de-name-'  + id)?.value ?? null,
                roles: document.getElementById('de-roles-' + id)?.value ?? null,
                phone: document.getElementById('de-phone-' + id)?.value ?? null,
                email: document.getElementById('de-email-' + id)?.value ?? null,
            };
        }
    });

    const dir = [...state.staffDirectory].sort((a, b) => {
        const roleA = ((a.roles || [])[0] || '').toLowerCase();
        const roleB = ((b.roles || [])[0] || '').toLowerCase();
        if (roleA !== roleB) return roleA.localeCompare(roleB);
        return (a.name || '').localeCompare(b.name || '');
    });
    const searchVal = (document.getElementById('staff-index-search')?.value || '').trim().toLowerCase();

    const filtered = searchVal
        ? dir.filter(c =>
            (c.name || '').toLowerCase().includes(searchVal) ||
            (c.roles || []).some(r => r.toLowerCase().includes(searchVal))
        )
        : dir;

    if (!filtered.length) {
        container.innerHTML = '<p class="sm-empty">' +
            (searchVal ? 'No contacts match your search.' : 'No contacts yet. Staff members are added automatically when you save them.') +
            '</p>';
        return;
    }

    const inEvent = !!state.currentEventId;
    const AV_COLORS = ['av-blue','av-purple','av-pink','av-amber','av-teal','av-red','av-green','av-rose','av-violet','av-emerald','av-yellow'];
    function avatarColor(name) {
        let h = 0;
        for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
        return AV_COLORS[h % AV_COLORS.length];
    }
    function initials(name) {
        const parts = (name || '?').trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
    }

    // All unique primary roles — used for the reassign dropdown
    const allRoles = [...new Set(
        state.staffDirectory.map(c => (c.roles || [])[0] || 'No Role').filter(Boolean)
    )].sort();

    let lastRole = null;
    const rows = filtered.map(c => {
        const hasContact = c.phone || c.email;
        const primaryRole = (c.roles || [])[0] || 'No Role';
        const otherRoles = (c.roles || []).slice(1).join(', ');
        let groupHeader = '';
        if (primaryRole !== lastRole) {
            lastRole = primaryRole;
            if (inEvent) {
                groupHeader = '<div class="sm-role-label">' +
                    '<span class="sm-role-label-text">' + escapeHtml(primaryRole) + '</span>' +
                    '<div class="sm-role-line"></div>' +
                '</div>';
            } else {
                groupHeader = '<div class="sm-role-label" onclick="editRoleGroupLabel(this, \'' + escapeHtml(primaryRole).replace(/'/g, "\\'") + '\')" title="Click to rename this role group">' +
                    '<span class="sm-role-label-text">' + escapeHtml(primaryRole) + '</span>' +
                    '<div class="sm-role-line"></div>' +
                    '<i class="ti ti-pencil sm-role-edit-icon"></i>' +
                '</div>';
            }
        }

        const editRow = '<div class="sm-edit-row" id="dir-edit-' + c.id + '" style="display:none">' +
            '<div class="dir-edit-fields">' +
                '<div class="sm-add-field"><label>Name</label><input id="de-name-' + c.id + '" type="text" value="' + escapeHtml(c.name || '') + '"></div>' +
                '<div class="sm-add-field"><label>Roles <span style="opacity:.5">(comma-separated)</span></label><input id="de-roles-' + c.id + '" type="text" value="' + escapeHtml((c.roles || []).join(', ')) + '"></div>' +
                '<div class="sm-add-field"><label>Phone</label><input id="de-phone-' + c.id + '" type="tel" value="' + escapeHtml(c.phone || '') + '"></div>' +
                '<div class="sm-add-field"><label>Email</label><input id="de-email-' + c.id + '" type="email" value="' + escapeHtml(c.email || '') + '"></div>' +
            '</div>' +
            '<div class="sm-add-actions">' +
                '<button class="btn-add-contact" onclick="saveDirContactEdit(\'' + c.id + '\')">Save</button>' +
                '<button class="btn-ctrl" onclick="toggleDirEditRow(\'' + c.id + '\')">Cancel</button>' +
            '</div>' +
        '</div>';

        const row = '<div class="sm-row" ' + (!inEvent ? 'draggable="true" data-contact-id="' + c.id + '"' : '') + '>' +
            (!inEvent ? '<i class="ti ti-grip-vertical sm-drag-handle"></i>' : '') +
            '<div class="sm-avatar ' + avatarColor(c.name) + '">' + escapeHtml(initials(c.name)) + '</div>' +
            '<div class="sm-info">' +
                '<div class="sm-name">' + escapeHtml(c.name || '') + '</div>' +
                (otherRoles ? '<div class="sm-meta">' + escapeHtml(otherRoles) + '</div>' : '') +
            '</div>' +
            '<div class="sm-actions">' +
                '<button class="act-icon' + (hasContact ? '' : ' muted') + '" title="' + (hasContact ? 'Contact info' : 'No contact info') + '" onclick="' + (hasContact ? 'toggleDirContactPopover(event,\'' + c.id + '\')' : 'showDirMissingContact(event)') + '"><i class="ti ti-user"></i></button>' +
                '<button class="act-icon" title="Edit" onclick="toggleDirEditRow(\'' + c.id + '\')"><i class="ti ti-pencil"></i></button>' +
                (inEvent ? '<button class="pill-staff" onclick="addDirectoryContactToStaff(\'' + c.id + '\')"><i class="ti ti-plus"></i> Staff</button>' : '') +
                (inEvent ? '<button class="pill-budget" onclick="addDirectoryContactToBudget(\'' + c.id + '\')"><i class="ti ti-plus"></i> Budget</button>' : '') +
                '<button class="act-icon danger" title="Delete" onclick="deleteDirectoryContact(\'' + c.id + '\')"><i class="ti ti-trash"></i></button>' +
            '</div>' +
        '</div>';

        return groupHeader + row + editRow;
    }).join('');

    container.innerHTML = rows;

    // Wire drag-and-drop (hub only — inEvent rows are not draggable)
    if (!inEvent) {
        let draggedId = null;

        container.querySelectorAll('.sm-row[draggable]').forEach(row => {
            row.addEventListener('dragstart', e => {
                draggedId = row.dataset.contactId;
                row.classList.add('sm-row--dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => {
                draggedId = null;
                row.classList.remove('sm-row--dragging');
                container.querySelectorAll('.sm-role-label--drop-over').forEach(el => el.classList.remove('sm-role-label--drop-over'));
            });
        });

        container.querySelectorAll('.sm-role-label').forEach(label => {
            label.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                label.classList.add('sm-role-label--drop-over');
            });
            label.addEventListener('dragleave', () => label.classList.remove('sm-role-label--drop-over'));
            label.addEventListener('drop', e => {
                e.preventDefault();
                label.classList.remove('sm-role-label--drop-over');
                const targetRole = label.querySelector('.sm-role-label-text')?.textContent?.trim();
                if (draggedId && targetRole) reassignContactRole(draggedId, targetRole);
            });
        });
    }

    // Restore any edit rows that were open before the re-render
    Object.keys(activeEdits).forEach(id => {
        const editRow = document.getElementById('dir-edit-' + id);
        if (!editRow) return;
        const data = activeEdits[id];
        editRow.style.display = '';
        const restore = (field, val) => { if (val !== null) { const el = document.getElementById(field + id); if (el) el.value = val; } };
        restore('de-name-',  data.name);
        restore('de-roles-', data.roles);
        restore('de-phone-', data.phone);
        restore('de-email-', data.email);
    });
}
window.renderStaffIndex = renderStaffIndex;

function toggleDirEditRow(contactId) {
    const row = document.getElementById('dir-edit-' + contactId);
    if (!row) return;
    const showing = row.style.display !== 'none';
    row.style.display = showing ? 'none' : '';
    if (!showing) document.getElementById('de-name-' + contactId)?.focus();
}
window.toggleDirEditRow = toggleDirEditRow;

async function saveDirContactEdit(contactId) {
    const name  = (document.getElementById('de-name-'  + contactId)?.value || '').trim();
    const roles = (document.getElementById('de-roles-' + contactId)?.value || '')
        .split(',').map(r => r.trim()).filter(Boolean);
    const phone = (document.getElementById('de-phone-' + contactId)?.value || '').trim();
    const email = (document.getElementById('de-email-' + contactId)?.value || '').trim();

    if (!name) { showToast('Name is required', 'error'); return; }

    // Hide the edit row first so renderStaffIndex doesn't treat it as still-active
    const editRow = document.getElementById('dir-edit-' + contactId);
    if (editRow) editRow.style.display = 'none';

    // Optimistic local update
    const idx = state.staffDirectory.findIndex(c => c.id === contactId);
    if (idx !== -1) state.staffDirectory[idx] = { ...state.staffDirectory[idx], name, roles, phone: phone || null, email: email || null };
    renderStaffIndex();

    try {
        await staffDirectoryCol().doc(contactId).update({ name, roles, phone: phone || null, email: email || null });
        showToast('Contact updated');
    } catch (e) {
        console.error('saveDirContactEdit error:', e);
        showToast('Error saving contact', 'error');
    }
}
window.saveDirContactEdit = saveDirContactEdit;

// Inline-edit a role group header — renames that role across all contacts in the group
window.editRoleGroupLabel = function(el, oldRole) {
    if (el.querySelector('input')) return;
    const textSpan = el.querySelector('.sm-role-label-text');
    const input = document.createElement('input');
    input.className = 'sm-role-label-input';
    input.value = oldRole;
    textSpan.replaceWith(input);
    el.querySelector('.sm-role-edit-icon')?.remove();
    input.focus();
    input.select();

    const save = async () => {
        const newRole = input.value.trim();
        if (!newRole || newRole === oldRole) { renderStaffIndex(); return; }
        const toUpdate = state.staffDirectory.filter(c => (c.roles || [])[0] === oldRole);
        toUpdate.forEach(c => { c.roles = [newRole, ...(c.roles || []).slice(1)]; });
        renderStaffIndex();
        try {
            await Promise.all(toUpdate.map(c =>
                staffDirectoryCol().doc(c.id).update({ roles: c.roles })
            ));
            showToast(`Renamed "${oldRole}" → "${newRole}"`, 'success');
        } catch (e) {
            console.error('editRoleGroupLabel error:', e);
            showToast('Error renaming role', 'error');
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = oldRole; input.blur(); }
    });
};

// Quick role reassignment from the dropdown on each person row
window.reassignContactRole = async function(contactId, roleOrSelect) {
    let newRole = typeof roleOrSelect === 'string' ? roleOrSelect : roleOrSelect.value;
    if (newRole === '__new__') {
        newRole = (prompt('Enter new role name:') || '').trim();
        if (!newRole) { renderStaffIndex(); return; }
    }
    const contact = state.staffDirectory.find(c => c.id === contactId);
    if (!contact) return;
    const otherRoles = (contact.roles || []).filter((r, i) => i > 0 && r !== newRole);
    contact.roles = [newRole, ...otherRoles];
    renderStaffIndex();
    try {
        await staffDirectoryCol().doc(contactId).update({ roles: contact.roles });
    } catch (e) {
        console.error('reassignContactRole error:', e);
        showToast('Error updating role', 'error');
    }
};

async function deleteDirectoryContact(id) {
    const contact = state.staffDirectory.find(c => c.id === id);
    if (!contact) return;
    if (!confirm('Remove ' + (contact.name || 'this contact') + ' from the directory?')) return;
    state.staffDirectory = state.staffDirectory.filter(c => c.id !== id);
    renderStaffIndex();
    try {
        await staffDirectoryCol().doc(id).delete();
        showToast('Contact removed from directory');
    } catch (e) {
        console.error('deleteDirectoryContact error:', e);
        showToast('Error removing contact', 'error');
    }
}
window.deleteDirectoryContact = deleteDirectoryContact;

function addDirectoryContactToStaff(contactId) {
    if (!state.currentEventId) { showToast('Enter an event first', 'error'); return; }
    const contact = state.staffDirectory.find(c => c.id === contactId);
    if (!contact) return;
    const primaryRole = (contact.roles || [])[0] || '';
    const category = getCategoryForRole(primaryRole);
    closeStaffIndex();
    openStaffModal();
    setTimeout(() => {
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('staff-name', contact.name);
        set('staff-phone', contact.phone);
        set('staff-email', contact.email);
        set('staff-role', primaryRole);
    }, 50);
}
window.addDirectoryContactToStaff = addDirectoryContactToStaff;

function addDirectoryContactToBudget(contactId) {
    if (!state.currentEventId) { showToast('Enter an event first', 'error'); return; }
    const contact = state.staffDirectory.find(c => c.id === contactId);
    if (!contact) return;

    // Find a category mapping for any of this contact's roles
    const matchedRole = (contact.roles || []).find(r => getCategoryForRole(r));
    const category = matchedRole ? getCategoryForRole(matchedRole) : '';

    closeStaffIndex();
    openBudgetModal();
    setTimeout(() => {
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('budget-vendor', contact.name);
        set('budget-contact', contact.name);
        set('budget-phone', contact.phone);
        set('budget-email', contact.email);
        set('budget-category', category);
    }, 50);
}
window.addDirectoryContactToBudget = addDirectoryContactToBudget;

function expandDirectoryRow(e, contactId) {}
window.expandDirectoryRow = expandDirectoryRow;

const BUDGET_CATEGORIES = [
    { value: '6811a - Talent/Performers & Hosts',         label: 'A — Talent / Performers & Hosts' },
    { value: '6811b - A/V Production',                    label: 'B — A/V Production' },
    { value: '6811c - Venue & Permits',                   label: 'C — Venue & Permits' },
    { value: '6811d - Food & Beverage',                   label: 'D — Food & Beverage' },
    { value: '6811e - Staff & Labor',                     label: 'E — Staff & Labor' },
    { value: '6811f - Marketing, Promotion & Branding',   label: 'F — Marketing, Promotion & Branding' },
    { value: '6811g - Decor & Miscellaneous Supplies',    label: 'G — Decor & Miscellaneous Supplies' },
];

function toggleRoleMappings() {
    const panel = document.getElementById('role-mappings-panel');
    if (!panel) return;
    const showing = panel.style.display !== 'none';
    panel.style.display = showing ? 'none' : '';
    if (!showing) renderJobTemplates();
}
window.toggleRoleMappings = toggleRoleMappings;

function renderJobTemplates() {
    const container = document.getElementById('role-mappings-content');
    if (!container) return;

    const catOpts = getBudgetCategories().map(c =>
        '<option value="' + escapeHtml(c.value) + '">' + escapeHtml(c.label) + '</option>'
    ).join('');

    const addRow = '<tr class="role-map-add-row">' +
        '<td><input type="text" id="jt-add-name" class="role-map-input" placeholder="Job title (e.g. Audio Engineer)"></td>' +
        '<td><select id="jt-add-cat" class="role-map-select"><option value="">— Pick category —</option>' + catOpts + '</select></td>' +
        '<td><button class="btn btn-primary-gold btn-sm" onclick="addJobTemplateFromForm()">Add</button></td>' +
        '</tr>';

    const rows = state.jobTemplates.length
        ? state.jobTemplates
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(t => {
                const catLabel = getBudgetCategories().find(c => c.value === t.category);
                return '<tr>' +
                    '<td class="role-map-role">' + escapeHtml(t.name || '') + '</td>' +
                    '<td class="role-map-cat-label">' + escapeHtml(catLabel ? catLabel.label : t.category || '') + '</td>' +
                    '<td><button class="btn btn-icon btn-sm" onclick="deleteJobTemplate(\'' + t.id + '\')" title="Remove">' +
                        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
                    '</button></td>' +
                    '</tr>';
            }).join('')
        : '<tr><td colspan="3" class="role-map-empty">No job templates yet. Add one above.</td></tr>';

    container.innerHTML = '<table class="role-map-table"><tbody>' + addRow + rows + '</tbody></table>';
}
window.renderJobTemplates = renderJobTemplates;

function addJobTemplateFromForm() {
    const name = (document.getElementById('jt-add-name')?.value || '').trim();
    const category = document.getElementById('jt-add-cat')?.value || '';
    addJobTemplate(name, category).then(() => renderJobTemplates());
}
window.addJobTemplateFromForm = addJobTemplateFromForm;

function toggleDirContactPopover(e, contactId) {
    e.stopPropagation();
    const contact = state.staffDirectory.find(c => c.id === contactId);
    if (!contact) return;

    let popover = document.getElementById('dir-contact-popover');
    // If already open for this contact, close it
    if (popover && popover.dataset.contactId === contactId && popover.style.display !== 'none') {
        popover.style.display = 'none';
        return;
    }
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'dir-contact-popover';
        document.body.appendChild(popover);
    }
    popover.dataset.contactId = contactId;
    popover.innerHTML =
        (contact.phone ? '<div class="dir-popover-row"><span class="dir-popover-label">Phone</span><a href="tel:' + escapeHtml(contact.phone) + '">' + escapeHtml(contact.phone) + '</a></div>' : '') +
        (contact.email ? '<div class="dir-popover-row"><span class="dir-popover-label">Email</span><a href="mailto:' + escapeHtml(contact.email) + '">' + escapeHtml(contact.email) + '</a></div>' : '');

    // Position below the button
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    popover.style.display = 'block';
    popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    // Align right edge with button right edge, but keep on screen
    const popW = 220;
    let left = rect.right + window.scrollX - popW;
    if (left < 8) left = 8;
    popover.style.left = left + 'px';
}
window.toggleDirContactPopover = toggleDirContactPopover;

function showDirMissingContact(e) {
    e.stopPropagation();
    let popover = document.getElementById('dir-contact-popover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'dir-contact-popover';
        document.body.appendChild(popover);
    }
    popover.dataset.contactId = '';
    popover.innerHTML = '<div class="dir-popover-missing">No contact info saved for this person.</div>';
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    popover.style.display = 'block';
    popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    const popW = 220;
    let left = rect.right + window.scrollX - popW;
    if (left < 8) left = 8;
    popover.style.left = left + 'px';
}
window.showDirMissingContact = showDirMissingContact;

// Dismiss popover on any outside click
document.addEventListener('click', () => {
    const p = document.getElementById('dir-contact-popover');
    if (p) p.style.display = 'none';
});

// ==========================================
// PERFORMER DIRECTORY
// ==========================================

function loadPerformerDirectory() {
    if (_unsubPerformers) { _unsubPerformers(); _unsubPerformers = null; }
    _unsubPerformers = performerDirectoryCol().onSnapshot(snap => {
        state.performerDirectory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const modal = document.getElementById('performer-index-modal');
        if (modal && modal.classList.contains('active')) renderPerformerIndex();
    }, err => console.warn('performerDirectory listener error:', err));
}

function openPerformerIndex() {
    const modal = document.getElementById('performer-index-modal');
    if (!modal) return;
    const addForm = document.getElementById('performer-add-form');
    if (addForm) addForm.style.display = 'none';
    renderPerformerIndex();
    modal.classList.add('active');
    document.getElementById('nav-menu')?.classList.remove('open');
}
window.openPerformerIndex = openPerformerIndex;

function closePerformerIndex() {
    const modal = document.getElementById('performer-index-modal');
    if (modal) modal.classList.remove('active');
}
window.closePerformerIndex = closePerformerIndex;

function toggleAddPerformer() {
    const form = document.getElementById('performer-add-form');
    if (!form) return;
    const showing = form.style.display !== 'none';
    form.style.display = showing ? 'none' : '';
    if (!showing) {
        ['pa-name','pa-act','pa-phone','pa-email'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('pa-parents-list').innerHTML = '';
        document.getElementById('pa-name')?.focus();
    }
}
window.toggleAddPerformer = toggleAddPerformer;

// Render a parent row in an add or edit form
function parentRowHtml(listId, idx, parent) {
    parent = parent || {};
    return '<div class="perf-parent-row" data-idx="' + idx + '">' +
        '<input type="text"  class="perf-par-name"  placeholder="Parent name"  value="' + escapeHtml(parent.name  || '') + '">' +
        '<input type="tel"   class="perf-par-phone" placeholder="Phone"        value="' + escapeHtml(parent.phone || '') + '">' +
        '<input type="email" class="perf-par-email"  placeholder="Email"        value="' + escapeHtml(parent.email || '') + '">' +
        '<button class="btn btn-icon btn-sm perf-par-remove" onclick="removeParentRow(this)" title="Remove parent">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
    '</div>';
}

function addParentRow(listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    const idx = list.querySelectorAll('.perf-parent-row').length;
    const div = document.createElement('div');
    div.innerHTML = parentRowHtml(listId, idx, {});
    list.appendChild(div.firstChild);
}
window.addParentRow = addParentRow;

function addParentRowEdit(performerId) {
    addParentRow('pe-parents-' + performerId);
}
window.addParentRowEdit = addParentRowEdit;

function removeParentRow(btn) {
    btn.closest('.perf-parent-row')?.remove();
}
window.removeParentRow = removeParentRow;

function collectParents(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    return Array.from(list.querySelectorAll('.perf-parent-row')).map(row => ({
        name:  (row.querySelector('.perf-par-name')?.value  || '').trim(),
        phone: (row.querySelector('.perf-par-phone')?.value || '').trim(),
        email: (row.querySelector('.perf-par-email')?.value || '').trim(),
    })).filter(p => p.name || p.phone || p.email);
}

async function saveNewPerformer() {
    const name  = (document.getElementById('pa-name')?.value  || '').trim();
    const act   = (document.getElementById('pa-act')?.value   || '').trim();
    const phone = (document.getElementById('pa-phone')?.value || '').trim();
    const email = (document.getElementById('pa-email')?.value || '').trim();
    if (!name || !act) { showToast('Name and Act are required', 'error'); return; }
    const parents = collectParents('pa-parents-list');
    try {
        await performerDirectoryCol().add({
            name, act, phone: phone || null, email: email || null, parents,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Performer added');
        toggleAddPerformer();
    } catch (e) {
        console.error('saveNewPerformer error:', e);
        showToast('Error saving performer', 'error');
    }
}
window.saveNewPerformer = saveNewPerformer;

function togglePerformerEditRow(performerId) {
    const row = document.getElementById('pe-edit-' + performerId);
    if (!row) return;
    const showing = row.style.display !== 'none';
    row.style.display = showing ? 'none' : '';
    if (!showing) document.getElementById('pe-name-' + performerId)?.focus();
}
window.togglePerformerEditRow = togglePerformerEditRow;

async function savePerformerEdit(performerId) {
    const name  = (document.getElementById('pe-name-'  + performerId)?.value || '').trim();
    const act   = (document.getElementById('pe-act-'   + performerId)?.value || '').trim();
    const phone = (document.getElementById('pe-phone-' + performerId)?.value || '').trim();
    const email = (document.getElementById('pe-email-' + performerId)?.value || '').trim();
    if (!name || !act) { showToast('Name and Act are required', 'error'); return; }
    const parents = collectParents('pe-parents-' + performerId);

    const editRow = document.getElementById('pe-edit-' + performerId);
    if (editRow) editRow.style.display = 'none';

    const idx = state.performerDirectory.findIndex(p => p.id === performerId);
    if (idx !== -1) state.performerDirectory[idx] = { ...state.performerDirectory[idx], name, act, phone: phone || null, email: email || null, parents };
    renderPerformerIndex();

    try {
        await performerDirectoryCol().doc(performerId).update({ name, act, phone: phone || null, email: email || null, parents });
        showToast('Performer updated');
    } catch (e) {
        console.error('savePerformerEdit error:', e);
        showToast('Error saving performer', 'error');
    }
}
window.savePerformerEdit = savePerformerEdit;

async function deletePerformer(id) {
    const p = state.performerDirectory.find(p => p.id === id);
    if (!p) return;
    if (!confirm('Remove ' + (p.name || 'this performer') + ' from the directory?')) return;
    state.performerDirectory = state.performerDirectory.filter(p => p.id !== id);
    renderPerformerIndex();
    try {
        await performerDirectoryCol().doc(id).delete();
        showToast('Performer removed');
    } catch (e) {
        console.error('deletePerformer error:', e);
        showToast('Error removing performer', 'error');
    }
}
window.deletePerformer = deletePerformer;

function renderPerformerIndex() {
    const container = document.getElementById('performer-index-content');
    if (!container) return;

    // Preserve open edit rows
    const activeEdits = {};
    container.querySelectorAll('.pe-edit-row').forEach(row => {
        if (row.style.display !== 'none') {
            const id = row.id.replace('pe-edit-', '');
            activeEdits[id] = {
                name:    document.getElementById('pe-name-'  + id)?.value ?? null,
                act:     document.getElementById('pe-act-'   + id)?.value ?? null,
                phone:   document.getElementById('pe-phone-' + id)?.value ?? null,
                email:   document.getElementById('pe-email-' + id)?.value ?? null,
                parents: collectParents('pe-parents-' + id),
            };
        }
    });

    const dir = [...state.performerDirectory].sort((a, b) => {
        const actCmp = (a.act || '').localeCompare(b.act || '');
        if (actCmp !== 0) return actCmp;
        return (a.name || '').localeCompare(b.name || '');
    });

    const searchVal = (document.getElementById('performer-index-search')?.value || '').trim().toLowerCase();
    const filtered = searchVal
        ? dir.filter(p =>
            (p.name || '').toLowerCase().includes(searchVal) ||
            (p.act  || '').toLowerCase().includes(searchVal) ||
            (p.parents || []).some(par => (par.name || '').toLowerCase().includes(searchVal))
          )
        : dir;

    if (!filtered.length) {
        container.innerHTML = '<p class="staff-index-empty">' +
            (searchVal ? 'No performers match your search.' : 'No performers yet. Click + Add Performer to get started.') +
            '</p>';
        return;
    }

    const editIconSvg  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trashIconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
    const personIconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    let lastAct = null;
    const rows = filtered.map(p => {
        const hasContact = p.phone || p.email;
        const parents = p.parents || [];

        let groupHeader = '';
        if (p.act !== lastAct) {
            lastAct = p.act;
            groupHeader = '<tr class="dir-group-header"><td colspan="3">' + escapeHtml(p.act || 'No Act') + '</td></tr>';
        }

        // Edit row
        const parentEditHtml = parents.map((par, i) => parentRowHtml('pe-parents-' + p.id, i, par)).join('');
        const editRow = '<tr class="pe-edit-row dir-edit-row" id="pe-edit-' + p.id + '" style="display:none">' +
            '<td colspan="3"><div class="dir-edit-form">' +
                '<div class="dir-edit-fields">' +
                    '<div class="form-group"><label>Name</label><input id="pe-name-' + p.id + '" type="text" value="' + escapeHtml(p.name || '') + '"></div>' +
                    '<div class="form-group"><label>Act / Band</label><input id="pe-act-' + p.id + '" type="text" value="' + escapeHtml(p.act || '') + '"></div>' +
                    '<div class="form-group"><label>Phone</label><input id="pe-phone-' + p.id + '" type="tel" value="' + escapeHtml(p.phone || '') + '"></div>' +
                    '<div class="form-group"><label>Email</label><input id="pe-email-' + p.id + '" type="email" value="' + escapeHtml(p.email || '') + '"></div>' +
                '</div>' +
                '<div class="perf-parents-section">' +
                    '<div class="perf-parents-label">Parents / Guardians</div>' +
                    '<div id="pe-parents-' + p.id + '">' + parentEditHtml + '</div>' +
                    '<button class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="addParentRowEdit(\'' + p.id + '\')">+ Add Parent</button>' +
                '</div>' +
                '<div class="dir-edit-actions">' +
                    '<button class="btn btn-primary-gold btn-sm" onclick="savePerformerEdit(\'' + p.id + '\')">Save</button>' +
                    '<button class="btn btn-secondary btn-sm" onclick="togglePerformerEditRow(\'' + p.id + '\')">Cancel</button>' +
                '</div>' +
            '</div></td></tr>';

        // Parent summary pill(s)
        const parentPills = parents.length
            ? '<span class="perf-parent-pills">' +
                parents.map(par => '<span class="dir-role-pill perf-parent-pill" title="' + escapeHtml((par.phone || '') + (par.email ? '  ' + par.email : '')) + '">' + personIconSvg + ' ' + escapeHtml(par.name || 'Parent') + '</span>').join('') +
              '</span>'
            : '<span style="opacity:0.35;font-size:0.78rem">No parents listed</span>';

        const contactBtn = '<button class="btn btn-icon btn-sm dir-contact-btn' + (hasContact ? '' : ' dir-contact-btn--missing') + '" title="' + (hasContact ? 'Contact info' : 'No contact info') + '" onclick="' + (hasContact ? 'togglePerfContactPopover(event,\'' + p.id + '\')' : 'showDirMissingContact(event)') + '">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
            (hasContact ? '' : '<span class="dir-contact-missing-dot">!</span>') +
        '</button>';

        const mainRow = '<tr class="staff-index-row">' +
            '<td><strong>' + escapeHtml(p.name || '') + '</strong></td>' +
            '<td>' + parentPills + '</td>' +
            '<td class="dir-row-actions">' +
                contactBtn +
                '<button class="btn btn-icon btn-sm" title="Edit" onclick="togglePerformerEditRow(\'' + p.id + '\')">' + editIconSvg + '</button>' +
                '<button class="btn btn-icon btn-sm" title="Delete" onclick="deletePerformer(\'' + p.id + '\')">' + trashIconSvg + '</button>' +
            '</td>' +
        '</tr>';

        return groupHeader + mainRow + editRow;
    }).join('');

    container.innerHTML = '<table class="staff-index-table"><thead><tr>' +
        '<th>Name</th><th>Parents</th><th></th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';

    // Restore any open edit rows
    Object.keys(activeEdits).forEach(id => {
        const editRow = document.getElementById('pe-edit-' + id);
        if (!editRow) return;
        const d = activeEdits[id];
        editRow.style.display = '';
        const set = (field, val) => { if (val !== null) { const el = document.getElementById(field + id); if (el) el.value = val; } };
        set('pe-name-', d.name); set('pe-act-', d.act); set('pe-phone-', d.phone); set('pe-email-', d.email);
        // Restore parent rows
        if (d.parents && d.parents.length) {
            const pList = document.getElementById('pe-parents-' + id);
            if (pList) {
                pList.innerHTML = d.parents.map((par, i) => parentRowHtml('pe-parents-' + id, i, par)).join('');
            }
        }
    });
}
window.renderPerformerIndex = renderPerformerIndex;

function togglePerfContactPopover(e, performerId) {
    e.stopPropagation();
    const p = state.performerDirectory.find(p => p.id === performerId);
    if (!p) return;
    let popover = document.getElementById('dir-contact-popover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'dir-contact-popover';
        document.body.appendChild(popover);
    }
    if (popover.dataset.contactId === performerId && popover.style.display !== 'none') {
        popover.style.display = 'none'; popover.dataset.contactId = ''; return;
    }
    popover.dataset.contactId = performerId;
    let html = '';
    if (p.phone) html += '<div class="dir-popover-row"><span class="dir-popover-label">Phone</span>' + escapeHtml(p.phone) + '</div>';
    if (p.email) html += '<div class="dir-popover-row"><span class="dir-popover-label">Email</span>' + escapeHtml(p.email) + '</div>';
    (p.parents || []).forEach(par => {
        if (!par.name && !par.phone && !par.email) return;
        html += '<div class="dir-popover-row" style="border-top:1px solid rgba(255,255,255,0.07);margin-top:4px;padding-top:4px"><span class="dir-popover-label" style="color:#c9a961">Parent</span>' + escapeHtml(par.name || '') + '</div>';
        if (par.phone) html += '<div class="dir-popover-row"><span class="dir-popover-label">Phone</span>' + escapeHtml(par.phone) + '</div>';
        if (par.email) html += '<div class="dir-popover-row"><span class="dir-popover-label">Email</span>' + escapeHtml(par.email) + '</div>';
    });
    popover.innerHTML = html || '<div class="dir-popover-missing">No contact info.</div>';
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    popover.style.display = 'block';
    popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    const popW = 240;
    let left = rect.right + window.scrollX - popW;
    if (left < 8) left = 8;
    popover.style.left = left + 'px';
}
window.togglePerfContactPopover = togglePerfContactPopover;

// ==========================================
// PERFORMER CALENDAR INVITES
// ==========================================

let _gTokenClient = null;
let _gAccessToken  = null;
let _gAccessTokenExpiresAt = 0; // ms epoch — access tokens are short-lived (~1hr); don't reuse past this

function buildCalendarDescription() {
    const d  = state.intake || {};
    const ev = state.activeEvent || {};

    const eventName     = d.event_name     || ev.name        || '';
    const venueName     = d.venue_name     || ev.venue       || '';
    const venueAddress  = d.venue_address  || '';
    const bands         = d.performing_bands || ev.performingGroups || '';
    const dressCode     = d.dress_code     || '';
    const parking       = d.parking_info   || '';
    const preRows       = d.pre_show_rows  || [];
    const rosRows       = d.run_of_show_rows || [];

    // Format date
    let dateStr = '';
    const rawDate = d.event_date || ev.date || '';
    if (rawDate) {
        try { dateStr = new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        catch(e) { dateStr = rawDate; }
    }

    const fmt = (rows) => rows
        .filter(r => r.label || r.time)
        .map(r => [r.time, r.label].filter(Boolean).join(' — '))
        .join('\n');

    let desc = '';

    // Header
    if (eventName) desc += (eventName.toUpperCase()) + '\n\n';

    // Excitement line
    if (eventName) desc += `We are so excited for ${eventName}!\n`;
    desc += 'Please review the full event details below for venue information, arrival times, soundchecks, run of show, and logistics.\n';

    // Venue block
    desc += '\n';
    if (venueName)    desc += `📍 Venue: ${venueName}\n`;
    if (venueAddress) desc += `Address: ${venueAddress}\n`;
    if (dateStr)      desc += `📅 Date: ${dateStr}\n`;
    if (bands)        desc += `🎤 Performing Bands: ${bands}\n`;

    // Pre-show
    if (preRows.length) {
        desc += '\nPRE-SHOW / SOUNDCHECKS 🎛️\n\n';
        desc += fmt(preRows) + '\n';
    }

    // Run of show
    if (rosRows.length) {
        desc += '\nRUN OF SHOW 🎶\n\n';
        desc += fmt(rosRows) + '\n';
    }

    // Logistics
    if (dressCode || parking) {
        desc += '\nLOGISTICS 🚗\n\n';
        if (dressCode) desc += `Dress Code: ${dressCode}\n`;
        if (parking)   desc += `Parking: ${parking}\n`;
    }

    desc += '\nPlease arrive on time and be ready for your scheduled soundcheck/performance window. Schedule is subject to small adjustments as we get closer to the event.';

    return desc.trim();
}

function buildCrewCalendarDescription() {
    const d  = state.intake || {};
    const ev = state.activeEvent || {};

    const fmt = (rows) => rows
        .filter(r => r.label || r.time)
        .map(r => [r.time, r.label].filter(Boolean).join(' — '))
        .join('\n');

    const fmtDate = (raw) => {
        if (!raw) return '';
        try { return new Date(raw + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
        catch(e) { return raw; }
    };

    const line = (label, val) => val ? `${label}: ${val}\n` : '';

    let desc = '';

    // Header
    const eventName = d.event_name || ev.name || '';
    if (eventName) desc += eventName.toUpperCase() + '\n\n';
    desc += 'CREW CALL\n\n';

    // ── Event Info ────────────────────────────────────────────────
    desc += '📍 EVENT INFO\n\n';
    if (d.venue_name)       desc += line('Venue', d.venue_name);
    if (d.venue_address)    desc += line('Address', d.venue_address);
    if (d.staff_entrance)   desc += line('Staff / Vendor Entrance', d.staff_entrance);
    if (d.event_date)       desc += line('Date', fmtDate(d.event_date));
    if (d.performing_bands) desc += line('Performing Bands', d.performing_bands);

    // ── Pre-Show (crew-relevant rows only) ────────────────────────
    const preRows = (d.pre_show_rows || []).filter(r =>
        /crew|arrival|sound.?check|break|dark|load.?in/i.test(r.label || '')
    );
    if (preRows.length) {
        desc += '\n⏰ PRE-SHOW\n\n';
        desc += fmt(preRows) + '\n';
    }

    // ── Run of Show (full) ────────────────────────────────────────
    const rosRows = d.run_of_show_rows || [];
    if (rosRows.length) {
        desc += '\n🎶 RUN OF SHOW\n\n';
        desc += fmt(rosRows) + '\n';
    }

    // ── Logistics (public/private → truck parking) ────────────────
    const hasLogistics = d.event_access || d.dress_code || d.parking_info || d.truck_parking;
    if (hasLogistics) {
        desc += '\n🚗 LOGISTICS\n\n';
        if (d.event_access)  desc += line('Event Type', d.event_access);
        if (d.dress_code)    desc += line('Dress Code', d.dress_code);
        if (d.parking_info)  desc += line('Parking', d.parking_info);
        if (d.truck_parking) desc += line('Truck Parking (20ft box)', d.truck_parking);
    }

    // ── Production (stage → power) ────────────────────────────────
    const hasProd = d.stage_provider || d.sound_provider || d.lights_provider || d.power_situation;
    if (hasProd) {
        desc += '\n🔧 PRODUCTION\n\n';
        if (d.stage_provider)  desc += line('Stage', d.stage_provider);
        if (d.sound_provider)  desc += line('Sound', d.sound_provider);
        if (d.lights_provider) desc += line('Lights', d.lights_provider);
        if (d.power_situation) desc += line('Power', d.power_situation);
    }

    desc += '\nPlease arrive on time. Schedule is subject to small adjustments as we get closer to the event.';

    return desc.trim();
}

function initGoogleTokenClient(callback) {
    if (!window.google || !window.google.accounts) {
        showToast('Google Sign-In library not loaded yet — try again in a moment', 'error');
        return;
    }
    if (!GOOGLE_CALENDAR_CLIENT_ID || GOOGLE_CALENDAR_CLIENT_ID.startsWith('YOUR_')) {
        showToast('Google OAuth Client ID not configured — see js/config.js', 'error');
        return;
    }
    _gTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CALENDAR_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: (resp) => {
            if (resp.error) {
                console.error('Google OAuth error:', resp);
                showToast('Google authorization failed: ' + resp.error, 'error');
                return;
            }
            _gAccessToken = resp.access_token;
            // 60s safety buffer so a request doesn't start right as it expires
            _gAccessTokenExpiresAt = Date.now() + ((resp.expires_in || 0) * 1000) - 60000;
            callback(resp.access_token);
        },
    });
    // Reuse the cached token only if it's still actually valid — an expired
    // one gets silently rejected by Google with a cryptic "invalid
    // authentication credentials" error deep in the fetch call instead.
    if (_gAccessToken && Date.now() < _gAccessTokenExpiresAt) { callback(_gAccessToken); return; }
    _gAccessToken = null;
    _gTokenClient.requestAccessToken({ prompt: '' });
}

// All Send Invites flows create events on this shared calendar (falls back
// to the signed-in account's own primary calendar if unset) rather than
// whichever staff member happens to be sending — see js/config.js.
function calendarEventsUrl() {
    const calendarId = (typeof SHARED_CALENDAR_ID !== 'undefined' && SHARED_CALENDAR_ID) ? SHARED_CALENDAR_ID : 'primary';
    return 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events';
}

function openIntakeCalendarPanel() {
    const modal = document.getElementById('intake-cal-modal');
    if (!modal) return;
    populateIntakeCalendarPanel();
    modal.classList.add('active');
}
window.openIntakeCalendarPanel = openIntakeCalendarPanel;

function closeIntakeCalendarPanel() {
    const modal = document.getElementById('intake-cal-modal');
    if (modal) modal.classList.remove('active');
}
window.closeIntakeCalendarPanel = closeIntakeCalendarPanel;

function parseTimeToHHMM(str) {
    if (!str) return null;
    // Strip range suffix (e.g. "6:30 – 7:00pm" or "6:30-7pm" → "6:30")
    str = str.split(/\s*[–—\-]\s*\d/)[0].trim();
    // Match H:MM AM/PM or H AM/PM (no minutes)
    const ampm = str.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (ampm) {
        let h = parseInt(ampm[1], 10);
        const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
        if (ampm[3].toUpperCase() === 'AM') { if (h === 12) h = 0; }
        else { if (h !== 12) h += 12; }
        return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    // 24h H:MM
    const plain = str.match(/^(\d{1,2}):(\d{2})$/);
    if (plain) {
        const h = parseInt(plain[1], 10), m = parseInt(plain[2], 10);
        if (h >= 0 && h < 24 && m >= 0 && m < 60)
            return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    return null;
}

function addHoursToHHMM(hhmmStr, hours) {
    if (!hhmmStr) return '';
    const [h, m] = hhmmStr.split(':').map(Number);
    const total = h * 60 + m + hours * 60;
    return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function crewArrivalTime(d) {
    const rows = (d && d.pre_show_rows) || [];
    // Look for a row that mentions both "crew" and "arrival"
    const crewRow = rows.find(r => /crew/i.test(r.label || '') && /arrival/i.test(r.label || ''));
    if (crewRow) {
        const t = parseTimeToHHMM(crewRow.time);
        if (t) return t;
    }
    // Fall back to any row mentioning "crew"
    const anyCrewRow = rows.find(r => /crew/i.test(r.label || ''));
    if (anyCrewRow) {
        const t = parseTimeToHHMM(anyCrewRow.time);
        if (t) return t;
    }
    return '';
}

function earliestPreShowTime(d) {
    const rows = (d && d.pre_show_rows) || [];
    // Prefer the first row whose label mentions "arrival"
    const arrivalRow = rows.find(r => /arrival/i.test(r.label || ''));
    if (arrivalRow) {
        const t = parseTimeToHHMM(arrivalRow.time);
        if (t) return t;
    }
    // Fall back to the first row with any parseable time
    for (const r of rows) {
        const t = parseTimeToHHMM(r.time);
        if (t) return t;
    }
    return '';
}

function showEndTime(d) {
    const rows = (d && d.run_of_show_rows) || [];
    // Look for a row whose label mentions "end"
    const endRow = rows.find(r => /\bend\b/i.test(r.label || ''));
    if (endRow) {
        const t = parseTimeToHHMM(endRow.time);
        if (t) return t;
    }
    // Fall back to the last row with any parseable time
    for (let i = rows.length - 1; i >= 0; i--) {
        const t = parseTimeToHHMM(rows[i].time);
        if (t) return t;
    }
    return '';
}

function populateIntakeCalendarPanel() {
    const ev = state.activeEvent;
    const d  = state.intake || {};
    if (ev) {
        const t = document.getElementById('ical-title');
        if (t) t.value = 'Show: ' + (d.event_name || ev.name || '');
        const l = document.getElementById('ical-location');
        if (l) l.value = d.venue_address || '';
        const dt = document.getElementById('ical-date');
        if (dt && !dt.value) dt.value = d.event_date || ev.date || '';
        const startEl = document.getElementById('ical-start');
        if (startEl) startEl.value = earliestPreShowTime(d);
        const endEl = document.getElementById('ical-end');
        if (endEl) endEl.value = showEndTime(d);
        const notesEl = document.getElementById('ical-notes');
        if (notesEl && !notesEl.value) notesEl.value = buildCalendarDescription();
    }
    const listEl = document.getElementById('ical-performer-list');
    if (!listEl) return;

    const dir = [...state.performerDirectory].sort((a, b) =>
        (a.act || '').localeCompare(b.act || '') || (a.name || '').localeCompare(b.name || '')
    );
    if (!dir.length) { listEl.innerHTML = '<div class="si-empty">No performers in directory yet.</div>'; return; }

    // Group by act/band
    const bands = {};
    dir.forEach(p => {
        const act = p.act || 'No Act';
        if (!bands[act]) bands[act] = [];
        bands[act].push(p);
    });

    listEl.innerHTML = Object.entries(bands).map(([act, members], idx) => {
        const key = 'ical-band-' + idx;
        const membersHTML = members.map(p => {
            const hasEmail = p.email || (p.parents || []).some(par => par.email);
            return '<label class="si-performer-row' + (hasEmail ? '' : ' si-no-email') + '">' +
                '<input type="checkbox" class="ical-check" data-id="' + p.id + '" ' + (hasEmail ? 'checked' : 'disabled') + '>' +
                '<span class="si-performer-name">' + escapeHtml(p.name || '') + '</span>' +
                (hasEmail ? '' : '<span class="si-no-email-tag">no email</span>') +
            '</label>';
        }).join('');
        return `
        <div class="ical-band-group" id="${key}">
            <div class="ical-band-header">
                <input type="checkbox" class="ical-band-check" checked onchange="icalBandCheckChange('${key}', this)">
                <div class="ical-band-toggle" onclick="icalToggleBand('${key}')">
                    <svg class="ical-band-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4.5 6 7.5 9 4.5"/></svg>
                    <span class="ical-band-name">${escapeHtml(act)}</span>
                </div>
            </div>
            <div class="ical-band-members" id="${key}-members" style="display:none">${membersHTML}</div>
        </div>`;
    }).join('');
}

window.icalBandCheckChange = function(key, cb) {
    const group   = document.getElementById(key);
    const members = document.getElementById(key + '-members');
    if (!group) return;
    if (cb.checked) {
        group.classList.remove('ical-band-disabled');
    } else {
        group.classList.add('ical-band-disabled');
        if (members) { members.style.display = 'none'; }
        group.classList.remove('ical-band-open');
        group.querySelectorAll('.ical-check').forEach(c => { c.checked = false; });
    }
};

window.icalToggleBand = function(key) {
    const group   = document.getElementById(key);
    const members = document.getElementById(key + '-members');
    if (!group || !members || group.classList.contains('ical-band-disabled')) return;
    const isOpen = members.style.display !== 'none';
    members.style.display = isOpen ? 'none' : '';
    group.classList.toggle('ical-band-open', !isOpen);
};

function icalSelectAll() {
    document.querySelectorAll('.ical-band-group').forEach(g => {
        const cb = g.querySelector('.ical-band-check');
        if (cb) cb.checked = true;
        g.classList.remove('ical-band-disabled');
        const m = document.getElementById(g.id + '-members');
        if (m) { m.style.display = ''; g.classList.add('ical-band-open'); }
    });
    document.querySelectorAll('.ical-check:not(:disabled)').forEach(cb => cb.checked = true);
}
window.icalSelectAll = icalSelectAll;

function icalSelectNone() {
    document.querySelectorAll('.ical-band-group').forEach(g => {
        const cb = g.querySelector('.ical-band-check');
        if (cb) cb.checked = false;
        g.classList.add('ical-band-disabled');
        const m = document.getElementById(g.id + '-members');
        if (m) m.style.display = 'none';
        g.classList.remove('ical-band-open');
    });
    document.querySelectorAll('.ical-check').forEach(cb => cb.checked = false);
}
window.icalSelectNone = icalSelectNone;

window.icalAddExtraEmail = function() {
    const list = document.getElementById('ical-extra-email-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ical-extra-email-row';
    row.innerHTML = `<input type="email" class="ical-extra-email-input" placeholder="email@example.com">
        <button class="ical-extra-email-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>`;
    list.appendChild(row);
    row.querySelector('input').focus();
};

async function sendIntakeCalendarInvites() {
    const title    = (document.getElementById('ical-title')?.value    || '').trim();
    const location = (document.getElementById('ical-location')?.value || '').trim();
    const date     = (document.getElementById('ical-date')?.value     || '').trim();
    const start    = (document.getElementById('ical-start')?.value    || '').trim();
    const end      = (document.getElementById('ical-end')?.value      || '').trim();
    const notes    = (document.getElementById('ical-notes')?.value    || '').trim();
    const inclParents = document.getElementById('ical-include-parents')?.checked;

    if (!title || !date || !start || !end) { showToast('Title, date, start and end time are required', 'error'); return; }

    const selectedIds = Array.from(document.querySelectorAll('.ical-check:checked')).map(cb => cb.dataset.id);
    const extraEmails = Array.from(document.querySelectorAll('.ical-extra-email-input'))
        .map(i => i.value.trim()).filter(Boolean);
    if (!selectedIds.length && !extraEmails.length) { showToast('Select at least one performer or add an email', 'error'); return; }

    const emails = new Set(extraEmails);
    selectedIds.forEach(id => {
        const p = state.performerDirectory.find(p => p.id === id);
        if (!p) return;
        if (p.email) emails.add(p.email);
        if (inclParents) (p.parents || []).forEach(par => { if (par.email) emails.add(par.email); });
    });
    if (!emails.size) { showToast('No email addresses found for selected performers', 'error'); return; }

    const statusEl = document.getElementById('ical-auth-status');
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Authorizing with Google…'; statusEl.className = 'si-auth-status si-auth-pending'; }

    initGoogleTokenClient(async (accessToken) => {
        try {
            if (statusEl) statusEl.textContent = 'Creating calendar event…';
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const event = {
                summary: title,
                location: location || undefined,
                description: notes || undefined,
                start: { dateTime: date + 'T' + start + ':00', timeZone: tz },
                end:   { dateTime: date + 'T' + end   + ':00', timeZone: tz },
                attendees: Array.from(emails).map(email => ({ email })),
                guestsCanSeeOtherGuests: true,
                sendUpdates: 'all',
            };
            const resp = await fetch(
                calendarEventsUrl() + '?sendUpdates=all',
                { method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
            );
            if (!resp.ok) { const err = await resp.json(); throw new Error(err.error?.message || resp.statusText); }
            if (statusEl) { statusEl.textContent = '✓ Invitations sent to ' + emails.size + ' address' + (emails.size !== 1 ? 'es' : '') + '!'; statusEl.className = 'si-auth-status si-auth-ok'; }
            showToast('Calendar invites sent to ' + emails.size + ' recipient' + (emails.size !== 1 ? 's' : ''));
        } catch (e) {
            console.error('sendIntakeCalendarInvites error:', e);
            if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.className = 'si-auth-status si-auth-error'; }
            showToast('Error: ' + e.message, 'error');
            _gAccessToken = null;
        }
    });
}
window.sendIntakeCalendarInvites = sendIntakeCalendarInvites;

// ─── Send Crew Invites ────────────────────────────────────────────────────────

function openCrewCalendarPanel() {
    const modal = document.getElementById('crew-cal-modal');
    if (modal) { modal.style.display = 'flex'; modal.classList.add('active'); }
    populateCrewCalendarPanel();
}
window.openCrewCalendarPanel = openCrewCalendarPanel;

function closeCrewCalendarPanel() {
    const modal = document.getElementById('crew-cal-modal');
    if (modal) { modal.style.display = ''; modal.classList.remove('active'); }
}
window.closeCrewCalendarPanel = closeCrewCalendarPanel;

function populateCrewCalendarPanel() {
    const ev = state.activeEvent;
    const d  = state.intake || {};
    if (ev) {
        const t = document.getElementById('crew-title');
        if (t) t.value = 'Show: ' + (d.event_name || ev.name || '');
        const l = document.getElementById('crew-location');
        if (l) l.value = d.venue_address || '';
        const dt = document.getElementById('crew-date');
        if (dt && !dt.value) dt.value = d.event_date || ev.date || '';
        const startEl = document.getElementById('crew-start');
        if (startEl) startEl.value = crewArrivalTime(d);
        const endEl = document.getElementById('crew-end');
        if (endEl) endEl.value = addHoursToHHMM(showEndTime(d), 2);
        const notesEl = document.getElementById('crew-notes');
        if (notesEl && !notesEl.value) notesEl.value = buildCrewCalendarDescription();
    }

    const listEl = document.getElementById('crew-list');
    if (!listEl) return;

    const crew = state.staff.filter(s => !s.isPlaceholder && s.name);
    if (!crew.length) { listEl.innerHTML = '<div class="si-empty">No crew assigned to this show yet.</div>'; return; }

    // Group by role
    const groups = {};
    crew.forEach(s => {
        const role = s.role || s.department || 'No Role';
        if (!groups[role]) groups[role] = [];
        groups[role].push(s);
    });

    listEl.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([role, members], idx) => {
        const key = 'crew-grp-' + idx;
        const membersHTML = members.map(s => {
            const hasEmail = !!s.email;
            return '<label class="si-performer-row' + (hasEmail ? '' : ' si-no-email') + '">' +
                '<input type="checkbox" class="crew-check" data-id="' + s.id + '" ' + (hasEmail ? 'checked' : 'disabled') + '>' +
                '<span class="si-performer-name">' + escapeHtml(s.name || '') + '</span>' +
                (hasEmail ? '' : '<span class="si-no-email-tag">no email</span>') +
            '</label>';
        }).join('');
        return `
        <div class="ical-band-group" id="${key}">
            <div class="ical-band-header">
                <input type="checkbox" class="ical-band-check" checked onchange="crewGroupCheckChange('${key}', this)">
                <div class="ical-band-toggle" onclick="crewToggleGroup('${key}')">
                    <svg class="ical-band-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4.5 6 7.5 9 4.5"/></svg>
                    <span class="ical-band-name">${escapeHtml(role)}</span>
                </div>
            </div>
            <div class="ical-band-members" id="${key}-members" style="display:none">${membersHTML}</div>
        </div>`;
    }).join('');
}

window.crewGroupCheckChange = function(key, cb) {
    const group = document.getElementById(key);
    const members = document.getElementById(key + '-members');
    if (!group) return;
    if (cb.checked) {
        group.classList.remove('ical-band-disabled');
    } else {
        group.classList.add('ical-band-disabled');
        if (members) members.style.display = 'none';
        group.classList.remove('ical-band-open');
        group.querySelectorAll('.crew-check').forEach(c => { c.checked = false; });
    }
};

window.crewToggleGroup = function(key) {
    const group = document.getElementById(key);
    const members = document.getElementById(key + '-members');
    if (!group || !members || group.classList.contains('ical-band-disabled')) return;
    const isOpen = members.style.display !== 'none';
    members.style.display = isOpen ? 'none' : '';
    group.classList.toggle('ical-band-open', !isOpen);
};

function crewSelectAll() {
    document.querySelectorAll('#crew-list .ical-band-group').forEach(g => {
        const cb = g.querySelector('.ical-band-check');
        if (cb) cb.checked = true;
        g.classList.remove('ical-band-disabled');
        const m = document.getElementById(g.id + '-members');
        if (m) { m.style.display = ''; g.classList.add('ical-band-open'); }
    });
    document.querySelectorAll('#crew-list .crew-check:not(:disabled)').forEach(cb => cb.checked = true);
}
window.crewSelectAll = crewSelectAll;

function crewSelectNone() {
    document.querySelectorAll('#crew-list .ical-band-group').forEach(g => {
        const cb = g.querySelector('.ical-band-check');
        if (cb) cb.checked = false;
        g.classList.add('ical-band-disabled');
        const m = document.getElementById(g.id + '-members');
        if (m) m.style.display = 'none';
        g.classList.remove('ical-band-open');
    });
    document.querySelectorAll('#crew-list .crew-check').forEach(cb => cb.checked = false);
}
window.crewSelectNone = crewSelectNone;

window.crewAddExtraEmail = function() {
    const list = document.getElementById('crew-extra-email-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ical-extra-email-row';
    row.innerHTML = `<input type="email" class="ical-extra-email-input" placeholder="email@example.com">
        <button class="ical-extra-email-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>`;
    list.appendChild(row);
    row.querySelector('input').focus();
};

async function sendCrewCalendarInvites() {
    const title    = (document.getElementById('crew-title')?.value    || '').trim();
    const location = (document.getElementById('crew-location')?.value || '').trim();
    const date     = (document.getElementById('crew-date')?.value     || '').trim();
    const start    = (document.getElementById('crew-start')?.value    || '').trim();
    const end      = (document.getElementById('crew-end')?.value      || '').trim();
    const notes    = (document.getElementById('crew-notes')?.value    || '').trim();

    if (!title || !date || !start || !end) { showToast('Title, date, start and end time are required', 'error'); return; }

    const selectedIds = Array.from(document.querySelectorAll('#crew-list .crew-check:checked')).map(cb => cb.dataset.id);
    const extraEmails = Array.from(document.querySelectorAll('#crew-extra-email-list .ical-extra-email-input'))
        .map(i => i.value.trim()).filter(Boolean);
    if (!selectedIds.length && !extraEmails.length) { showToast('Select at least one crew member or add an email', 'error'); return; }

    const emails = new Set(extraEmails);
    selectedIds.forEach(id => {
        const s = state.staff.find(s => s.id === id);
        if (s && s.email) emails.add(s.email);
    });
    if (!emails.size) { showToast('No email addresses found for selected crew', 'error'); return; }

    const statusEl = document.getElementById('crew-auth-status');
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Authorizing with Google…'; statusEl.className = 'si-auth-status si-auth-pending'; }

    initGoogleTokenClient(async (accessToken) => {
        try {
            if (statusEl) statusEl.textContent = 'Creating calendar event…';
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const event = {
                summary: title,
                location,
                description: notes,
                start: { dateTime: date + 'T' + start + ':00', timeZone: tz },
                end:   { dateTime: date + 'T' + end   + ':00', timeZone: tz },
                attendees: Array.from(emails).map(email => ({ email })),
                guestsCanSeeOtherGuests: true,
            };
            const res = await fetch(calendarEventsUrl() + '?sendUpdates=all', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
            });
            if (!res.ok) throw new Error((await res.json()).error?.message || 'Unknown error');
            if (statusEl) { statusEl.textContent = '✓ Invitations sent to ' + emails.size + ' crew member' + (emails.size !== 1 ? 's' : '') + '!'; statusEl.className = 'si-auth-status si-auth-ok'; }
            setTimeout(() => closeCrewCalendarPanel(), 2500);
        } catch (err) {
            console.error('Crew invite error:', err);
            if (statusEl) { statusEl.textContent = 'Error: ' + err.message; statusEl.className = 'si-auth-status si-auth-error'; }
            _gAccessToken = null; // reset token so next attempt re-authorizes
        }
    });
}
window.sendCrewCalendarInvites = sendCrewCalendarInvites;

function toggleSendInvitesPanel() {
    const panel = document.getElementById('send-invites-panel');
    const addForm = document.getElementById('performer-add-form');
    if (!panel) return;
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? '' : 'none';
    if (addForm) addForm.style.display = 'none';
    if (opening) populateSendInvitesPanel();
}
window.toggleSendInvitesPanel = toggleSendInvitesPanel;

function populateSendInvitesPanel() {
    const ev = state.activeEvent;
    const d  = state.intake || {};
    if (ev) {
        const titleEl = document.getElementById('si-title');
        if (titleEl) titleEl.value = 'Show: ' + (d.event_name || ev.name || '');
        const locEl = document.getElementById('si-location');
        if (locEl) locEl.value = d.venue_address || '';
        const dateEl = document.getElementById('si-date');
        if (dateEl && !dateEl.value) dateEl.value = d.event_date || ev.date || '';
        const siStartEl = document.getElementById('si-start');
        if (siStartEl) siStartEl.value = earliestPreShowTime(d);
        const siEndEl = document.getElementById('si-end');
        if (siEndEl) siEndEl.value = showEndTime(d);
        const notesEl = document.getElementById('si-notes');
        if (notesEl && !notesEl.value) notesEl.value = buildCalendarDescription();
    }

    // Render performer checklist grouped by act
    const listEl = document.getElementById('si-performer-list');
    if (!listEl) return;

    const dir = [...state.performerDirectory].sort((a, b) =>
        (a.act || '').localeCompare(b.act || '') || (a.name || '').localeCompare(b.name || '')
    );

    if (!dir.length) {
        listEl.innerHTML = '<div class="si-empty">No performers in directory yet.</div>';
        return;
    }

    let lastAct = null;
    listEl.innerHTML = dir.map(p => {
        let header = '';
        if (p.act !== lastAct) {
            lastAct = p.act;
            header = '<div class="si-act-header">' + escapeHtml(p.act || 'No Act') + '</div>';
        }
        const hasEmail = p.email || (p.parents || []).some(par => par.email);
        return header + '<label class="si-performer-row' + (hasEmail ? '' : ' si-no-email') + '">' +
            '<input type="checkbox" class="si-check" data-id="' + p.id + '" ' + (hasEmail ? 'checked' : 'disabled') + '>' +
            '<span class="si-performer-name">' + escapeHtml(p.name || '') + '</span>' +
            (hasEmail ? '' : '<span class="si-no-email-tag">no email</span>') +
        '</label>';
    }).join('');
}

function siSelectAll() {
    document.querySelectorAll('.si-check:not(:disabled)').forEach(cb => cb.checked = true);
}
window.siSelectAll = siSelectAll;

function siSelectNone() {
    document.querySelectorAll('.si-check').forEach(cb => cb.checked = false);
}
window.siSelectNone = siSelectNone;

async function sendCalendarInvites() {
    const title     = (document.getElementById('si-title')?.value    || '').trim();
    const location  = (document.getElementById('si-location')?.value || '').trim();
    const date      = (document.getElementById('si-date')?.value     || '').trim();
    const startTime = (document.getElementById('si-start')?.value    || '').trim();
    const endTime   = (document.getElementById('si-end')?.value      || '').trim();
    const notes     = (document.getElementById('si-notes')?.value    || '').trim();
    const includeParents = document.getElementById('si-include-parents')?.checked;

    if (!title || !date || !startTime || !endTime) {
        showToast('Title, date, start, and end time are required', 'error'); return;
    }

    const selectedIds = Array.from(document.querySelectorAll('.si-check:checked')).map(cb => cb.dataset.id);
    if (!selectedIds.length) { showToast('Select at least one performer', 'error'); return; }

    // Collect attendee emails
    const emails = new Set();
    selectedIds.forEach(id => {
        const p = state.performerDirectory.find(p => p.id === id);
        if (!p) return;
        if (p.email) emails.add(p.email);
        if (includeParents) {
            (p.parents || []).forEach(par => { if (par.email) emails.add(par.email); });
        }
    });

    if (!emails.size) { showToast('No valid email addresses found for selected performers', 'error'); return; }

    const statusEl = document.getElementById('si-auth-status');
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Authorizing with Google…'; statusEl.className = 'si-auth-status si-auth-pending'; }

    initGoogleTokenClient(async (accessToken) => {
        try {
            if (statusEl) { statusEl.textContent = 'Creating calendar event…'; }

            const startISO = date + 'T' + startTime + ':00';
            const endISO   = date + 'T' + endTime   + ':00';

            const event = {
                summary: title,
                location: location || undefined,
                description: notes || undefined,
                start: { dateTime: startISO, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                end:   { dateTime: endISO,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                attendees: Array.from(emails).map(email => ({ email })),
                guestsCanSeeOtherGuests: true,
                sendUpdates: 'all',
            };

            const resp = await fetch(
                calendarEventsUrl() + '?sendUpdates=all&conferenceDataVersion=0',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + accessToken,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(event),
                }
            );

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.error?.message || resp.statusText);
            }

            const created = await resp.json();
            if (statusEl) { statusEl.textContent = '✓ Invitations sent to ' + emails.size + ' address' + (emails.size !== 1 ? 'es' : '') + '!'; statusEl.className = 'si-auth-status si-auth-ok'; }
            showToast('Calendar invites sent to ' + emails.size + ' recipient' + (emails.size !== 1 ? 's' : ''));
            console.log('Created calendar event:', created.htmlLink);

        } catch (e) {
            console.error('sendCalendarInvites error:', e);
            if (statusEl) { statusEl.textContent = 'Error: ' + e.message; statusEl.className = 'si-auth-status si-auth-error'; }
            showToast('Error sending invites: ' + e.message, 'error');
            _gAccessToken = null; // reset token so next attempt re-authorizes
        }
    });
}
window.sendCalendarInvites = sendCalendarInvites;

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

const PACKING_CATEGORIES_DEFAULT = ['Audio', 'Lighting', 'Decor', 'Signage', 'Catering', 'Printed Materials', 'Misc'];

function getPackingCategories() {
    return (state.activeEvent && state.activeEvent.packingCategories && state.activeEvent.packingCategories.length)
        ? state.activeEvent.packingCategories
        : PACKING_CATEGORIES_DEFAULT;
}

// --- Category management ---
window.openPackingCategoriesModal = function() {
    renderPackingCategoriesModal();
    document.getElementById('packing-categories-modal').classList.add('is-open');
};

window.closePackingCategoriesModal = function() {
    document.getElementById('packing-categories-modal').classList.remove('is-open');
};

function renderPackingCategoriesModal() {
    const cats = getPackingCategories();
    const list = document.getElementById('packing-cat-list');
    if (!list) return;
    list.innerHTML = cats.map((c, i) => `
        <div class="pcat-item">
            <span class="pcat-name">${escapeHtml(c)}</span>
            <button class="btn-icon-sm delete" onclick="removePackingCategory(${i})" title="Remove">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`).join('');
}

window.addPackingCategory = async function() {
    const input = document.getElementById('new-packing-cat-input');
    const name = (input?.value || '').trim();
    if (!name) return;
    const cats = getPackingCategories();
    if (cats.includes(name)) { showToast('Category already exists', 'error'); return; }
    const updated = [...cats, name];
    try {
        await eventsCollection.doc(state.activeEvent.id).update({ packingCategories: updated });
        state.activeEvent.packingCategories = updated;
        input.value = '';
        renderPackingCategoriesModal();
        populatePackingCategorySelects();
    } catch (err) { showToast('Error saving category', 'error'); }
};

window.removePackingCategory = async function(index) {
    const cats = getPackingCategories();
    const name = cats[index];
    const inUse = state.packingList.some(i => i.category === name) || state.inventory.some(i => i.category === name);
    if (inUse && !confirm(`"${name}" is used by existing items. Remove it anyway?`)) return;
    const updated = cats.filter((_, i) => i !== index);
    try {
        await eventsCollection.doc(state.activeEvent.id).update({ packingCategories: updated });
        state.activeEvent.packingCategories = updated;
        renderPackingCategoriesModal();
        populatePackingCategorySelects();
        renderPackingList();
    } catch (err) { showToast('Error removing category', 'error'); }
};

function populatePackingCategorySelects() {
    const cats = getPackingCategories();
    const catOptions = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    // Category filter dropdown
    const filterEl = document.getElementById('packing-category-filter');
    if (filterEl) {
        const cur = filterEl.value;
        filterEl.innerHTML = `<option value="all">All Categories</option>${catOptions}`;
        if (cats.includes(cur)) filterEl.value = cur;
    }

    // Packing item modal select
    const packingCatEl = document.getElementById('packing-category');
    if (packingCatEl) {
        const cur2 = packingCatEl.value;
        packingCatEl.innerHTML = `<option value="">Select category...</option>${catOptions}`;
        if (cats.includes(cur2)) packingCatEl.value = cur2;
    }

    // Inventory modal select
    const invCatEl = document.getElementById('inv-category');
    if (invCatEl) {
        const cur3 = invCatEl.value;
        invCatEl.innerHTML = catOptions;
        if (cats.includes(cur3)) invCatEl.value = cur3;
    }
}

const PACKING_COLOR_PALETTE = [
    { hex: null,      title: 'None' },
    { hex: '#fff3cd', title: 'Yellow' },
    { hex: '#d4edda', title: 'Green' },
    { hex: '#cce5ff', title: 'Blue' },
    { hex: '#f8d7da', title: 'Red' },
    { hex: '#e2d6f3', title: 'Purple' },
    { hex: '#fde0c8', title: 'Orange' },
    { hex: '#fce4ec', title: 'Pink' },
    { hex: '#d6d6d6', title: 'Gray' }
];

function getPackingCategoryColor(category) {
    const rec = (state.packingCategoryColors || []).find(c => c.id === category);
    return rec && rec.color ? rec.color : null;
}

function renderPackingColorSwatches(onclickFn, extra) {
    return PACKING_COLOR_PALETTE.map(p => {
        const bg = p.hex || '#ffffff';
        const border = p.hex ? '' : 'border:1px dashed #ccc;';
        // Pass empty string for null so onclick gets a plain arg
        const arg = p.hex ? p.hex : '';
        return `<button type="button" class="color-swatch" style="background:${bg};${border}" onclick="event.stopPropagation(); ${onclickFn}('${extra}','${arg}')" title="${p.title}"></button>`;
    }).join('');
}

const PACKING_STATUSES = [
    { value: 'to-pack', label: 'To Pack', next: 'packed' },
    { value: 'packed', label: 'Packed', next: 'loaded' },
    { value: 'loaded', label: 'Loaded', next: 'at-venue' },
    { value: 'at-venue', label: 'At Venue', next: null }
];

function getStatusInfo(statusValue) {
    return PACKING_STATUSES.find(s => s.value === statusValue) || PACKING_STATUSES[0];
}

function getInventoryItem(id) {
    return (state.inventory || []).find(i => i.id === id) || null;
}

function renderPackingList() {
    const container = document.getElementById('packing-list-container');
    if (!container) return;

    populatePackingCategorySelects();

    // Build a lookup: inventoryId → packingList doc id (for checked state)
    const selectedMap = {}; // inventoryId → packingList doc id
    const adHocItems = [];
    state.packingList.forEach(p => {
        if (p.inventoryId) selectedMap[p.inventoryId] = p.id;
        else adHocItems.push(p);
    });

    // For ad-hoc items, checked = not deselected
    adHocItems.forEach(p => { p._checked = !p.deselected; });

    const totalInventory = state.inventory.length;
    const selectedCount  = Object.keys(selectedMap).length + adHocItems.filter(p => !p.deselected).length;
    const brokenCount    = state.inventory.filter(i => i.condition === 'broken').length;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('packing-stat-total',     totalInventory);
    el('packing-stat-selected',  selectedCount);
    el('packing-stat-broken',    brokenCount);

    // Decide which items to show based on view
    const isPacking = state.packingView === 'packing';

    // Update toggle button states
    document.getElementById('pl-view-inventory')?.classList.toggle('active', !isPacking);
    document.getElementById('pl-view-packing')?.classList.toggle('active', isPacking);

    // Build display rows: inventory items (filtered by view) + ad-hoc items
    let invItems = state.inventory;
    if (isPacking) invItems = invItems.filter(i => selectedMap[i.id] !== undefined);

    // Apply search & category filter to inventory items
    const q = (state.packingSearch || '').toLowerCase();
    if (q) invItems = invItems.filter(i => (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q));
    if (state.packingCategoryFilter !== 'all') invItems = invItems.filter(i => i.category === state.packingCategoryFilter);

    // Filter ad-hoc items — in packing view only show checked ones
    let shownAdHoc = isPacking ? adHocItems.filter(p => !p.deselected) : adHocItems;
    if (q) shownAdHoc = shownAdHoc.filter(i => (i.name || '').toLowerCase().includes(q));
    if (state.packingCategoryFilter !== 'all') shownAdHoc = shownAdHoc.filter(i => i.category === state.packingCategoryFilter);

    const sc = document.getElementById('packing-search-count');
    if (sc) {
        const total = invItems.length + shownAdHoc.length;
        const anyFilter = q || state.packingCategoryFilter !== 'all';
        sc.textContent = anyFilter ? `${total} result${total !== 1 ? 's' : ''}` : '';
    }

    // Group inventory items by category
    const grouped = {};
    invItems.forEach(i => {
        const cat = i.category || 'Misc';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ ...i, _isInv: true });
    });
    // Ad-hoc items go in their own category groups too
    shownAdHoc.forEach(i => {
        const cat = i.category || 'Misc';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({ ...i, _isAdHoc: true });
    });

    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const _pc = getPackingCategories(); const ai = _pc.indexOf(a), bi = _pc.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    if (sortedCats.length === 0) {
        container.innerHTML = isPacking
            ? '<p class="empty-state">No items selected for this event yet. Switch to Full Inventory and check the items you need.</p>'
            : '<p class="empty-state">Your inventory is empty. Add items via Manage Inventory.</p>';
        return;
    }

    const THUMB_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

    let rows = '';
    sortedCats.forEach(cat => {
        const catItems = grouped[cat];
        const catSelected = catItems.filter(i => i._isAdHoc || selectedMap[i.id] !== undefined).length;
        const hasBroken   = catItems.some(i => i.condition === 'broken');
        rows += `<tr class="pl-category-row">
            <td colspan="6">
                <span class="pl-cat-name">${escapeHtml(cat)}</span>
                <span class="pl-cat-count">${catSelected}/${catItems.length} selected</span>
                ${hasBroken ? '<span class="pl-cat-broken-flag">⚠ broken</span>' : ''}
            </td>
        </tr>`;

        catItems.forEach(item => {
            const isAdHoc   = !!item._isAdHoc;
            const invId     = isAdHoc ? null : item.id;
            const packDocId = isAdHoc ? item.id : (selectedMap[item.id] || null);
            const checked   = isAdHoc ? !item.deselected : packDocId !== null;
            // Notes come from the packing list doc (not the inventory item)
            const packDoc   = packDocId ? state.packingList.find(p => p.id === packDocId) : null;
            const rowNotes  = packDoc ? (packDoc.notes || '') : (isAdHoc ? (item.notes || '') : '');
            const condition = item.condition || 'working';
            const condLabel = { working: 'Working', damaged: 'Damaged', broken: 'Broken' }[condition] || 'Working';
            const qty = item.quantity || 1;
            const thumb = item.imageUrl
                ? `<img class="pl-thumb-img" src="${escapeHtml(item.imageUrl)}" alt="">`
                : `<div class="pl-thumb-placeholder">${THUMB_SVG}</div>`;

            rows += `<tr class="pl-item-row${condition !== 'working' ? ' has-issue' : ''}${checked ? ' is-selected' : ''}">
                <td class="pl-check-cell">
                    <input type="checkbox" class="pl-checkbox" ${checked ? 'checked' : ''}
                        onchange="${isAdHoc
                            ? `toggleAdHocItem('${item.id}', this.checked)`
                            : `toggleItemForEvent('${invId}', '${packDocId || ''}')`
                        }"
                        onclick="event.stopPropagation()">
                </td>
                <td class="pl-thumb-cell">
                    <button class="pl-thumb" onclick="uploadPackingItemImage('${isAdHoc ? item.id : ''}', '${invId || ''}')" title="Upload image">
                        ${thumb}
                    </button>
                </td>
                <td class="pl-name-cell">
                    <span class="pl-item-name">${escapeHtml(item.name || 'Unnamed')}</span>
                    ${isAdHoc ? '<span class="pl-adhoc-tag">one-off</span>' : ''}
                </td>
                <td class="pl-qty-cell">${qty > 1 ? `<span class="pl-qty">×${qty}</span>` : '<span class="pl-muted">—</span>'}</td>
                <td class="pl-condition-cell">
                    <button class="pl-condition-badge cond-${condition}" onclick="cyclePackingCondition('', '${invId || item.id}')" title="Click to update condition">
                        ${condLabel}
                    </button>
                </td>
                <td class="pl-notes-cell">
                    ${packDocId
                        ? `<input type="text" class="pl-notes-input" value="${escapeHtml(rowNotes)}" placeholder="Add a note…" onblur="savePackingNote('${packDocId}', this.value)" onkeydown="if(event.key==='Enter')this.blur()">`
                        : `<input type="text" class="pl-notes-input pl-notes-disabled" placeholder="Check to add notes" disabled>`
                    }
                </td>
                ${isAdHoc ? `
                <td class="pl-actions-cell">
                    <div class="pl-actions">
                        <button class="btn-icon-sm" onclick="openPackingModal('${item.id}')" title="Edit one-off item">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-icon-sm delete" onclick="deletePackingItem('${item.id}')" title="Remove">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                    </div>
                </td>` : '<td></td>'}

            </tr>`;
        });
    });

    container.innerHTML = `
    <table class="pl-table">
        <thead>
            <tr>
                <th class="pl-th-check"></th>
                <th class="pl-th-img"></th>
                <th class="pl-name-cell">Item</th>
                <th class="pl-qty-cell">Qty</th>
                <th class="pl-condition-cell">Condition</th>
                <th class="pl-th-notes">Notes</th>
                <th class="pl-actions-cell"></th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

window.savePackingNote = async function(packDocId, value) {
    if (!packDocId) return;
    try {
        await collections.packingList.doc(packDocId).update({
            notes: value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) { showToast('Error saving note', 'error'); }
};

window.clearAllPackingSelections = async function() {
    if (!confirm('Uncheck all items for this event? Notes will be kept but nothing will be selected.')) return;
    try {
        const batch = db.batch();
        // Remove all inventory-linked packing list docs
        state.packingList.filter(p => p.inventoryId).forEach(p => batch.delete(collections.packingList.doc(p.id)));
        // Mark all ad-hoc items as deselected
        state.packingList.filter(p => !p.inventoryId).forEach(p => batch.update(collections.packingList.doc(p.id), { deselected: true }));
        await batch.commit();
        showToast('Cleared all selections');
    } catch (err) { showToast('Error clearing selections', 'error'); }
};

window.toggleAdHocItem = async function(packDocId, checked) {
    try {
        await collections.packingList.doc(packDocId).update({
            deselected: !checked,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) { showToast('Error updating item', 'error'); }
};

window.toggleItemForEvent = async function(inventoryId, existingPackDocId) {
    if (!state.activeEvent) return;
    if (existingPackDocId) {
        // Uncheck — remove from packing list
        try {
            await collections.packingList.doc(existingPackDocId).delete();
        } catch (err) { showToast('Error removing item', 'error'); }
    } else {
        // Check — add to packing list
        const inv = getInventoryItem(inventoryId);
        if (!inv) return;
        try {
            await collections.packingList.add({
                inventoryId,
                name: inv.name,
                category: inv.category || 'Misc',
                quantity: inv.quantity || 1,
                isAdHoc: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (err) { showToast('Error selecting item', 'error'); }
    }
};

window.switchPackingView = function(view) {
    state.packingView = view;
    renderPackingList();
};

const PACKING_FIELD_MAP = {
    'packing-name': 'name',
    'packing-category': 'category',
    'packing-quantity': 'quantity',
    'packing-assignee': 'assignee',
    'packing-notes': 'notes',
};

function openPackingModal(itemId = null) {
    openModal({
        modalId: 'packing-modal',
        formId: 'packing-form',
        title: itemId ? 'Edit Item' : 'Add One-Off Item',
        stateKey: 'packingList',
        itemId: itemId,
        idFieldId: 'packing-id',
        fieldMap: PACKING_FIELD_MAP,
        defaultValues: {
            'packing-quantity': '1',
        }
    });
}

async function handlePackingSubmit(e) {
    e.preventDefault();
    const data = {};
    Object.entries(PACKING_FIELD_MAP).forEach(([fieldId, dataKey]) => {
        const el = document.getElementById(fieldId);
        if (el) data[dataKey] = el.type === 'checkbox' ? el.checked : el.value;
    });
    data.quantity = parseInt(data.quantity) || 1;
    data.isAdHoc = true;
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    const id = document.getElementById('packing-id').value;
    try {
        if (id) {
            await collections.packingList.doc(id).update(data);
            showToast('Item updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.packingList.add(data);
            showToast('Item added');
        }
        closeAllModals();
    } catch (err) {
        console.error('Error saving packing item:', err);
        showToast('Error saving item', 'error');
    }
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

function closeAllPackingColorPickers(exceptId) {
    document.querySelectorAll('.packing-category-section .color-swatch-dropdown.open').forEach(el => {
        if (el.id !== exceptId) el.classList.remove('open');
    });
}

function togglePackingCategoryColorPicker(category) {
    const id = 'pcat-picker-' + category.replace(/\s+/g, '-');
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    closeAllPackingColorPickers(willOpen ? id : null);
    el.classList.toggle('open', willOpen);
}

function togglePackingItemColorPicker(itemId) {
    const id = 'pitem-picker-' + itemId;
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    closeAllPackingColorPickers(willOpen ? id : null);
    el.classList.toggle('open', willOpen);
}

async function setPackingCategoryColor(category, hex) {
    const color = hex && hex.length ? hex : null;
    try {
        // Upsert the category color record
        await collections.packingCategoryColors.doc(category).set({
            color,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Bulk-overwrite every item in the category
        const items = state.packingList.filter(i => i.category === category);
        if (items.length > 0) {
            const batch = db.batch();
            items.forEach(i => {
                batch.update(collections.packingList.doc(i.id), {
                    color,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }
        closeAllPackingColorPickers(null);
        showToast(color ? `Colored ${items.length} ${category} item${items.length === 1 ? '' : 's'}` : `Cleared color on ${category}`);
    } catch (error) {
        console.error('Error setting category color:', error);
        showToast('Error setting color', 'error');
    }
}

async function setPackingItemColor(itemId, hex) {
    const color = hex && hex.length ? hex : null;
    try {
        await collections.packingList.doc(itemId).update({
            color,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeAllPackingColorPickers(null);
    } catch (error) {
        console.error('Error setting item color:', error);
        showToast('Error setting color', 'error');
    }
}

// Close packing color pickers when clicking outside any of them
document.addEventListener('click', (e) => {
    if (!e.target.closest('.packing-category-section .color-swatch-wrapper')) {
        closeAllPackingColorPickers(null);
    }
});

window.deletePackingItem = createDeleteHandler('packingList', 'packing item');
window.openPackingModal = openPackingModal;
window.handlePackingSearch = handlePackingSearch;
window.clearPackingSearch = clearPackingSearch;
window.handlePackingCategoryFilter = handlePackingCategoryFilter;
window.handlePackingStatusFilter = handlePackingStatusFilter;
window.togglePackingCategory = togglePackingCategory;
window.togglePackingCategoryColorPicker = togglePackingCategoryColorPicker;
window.togglePackingItemColorPicker = togglePackingItemColorPicker;
window.setPackingCategoryColor = setPackingCategoryColor;
window.setPackingItemColor = setPackingItemColor;

// =============================================
// INVENTORY + PACKING LIST (REIMAGINED)
// =============================================

// --- Image upload ---
window.uploadPackingItemImage = async function(packingItemId, inventoryId) {
    state._pendingPackingImageItemId = packingItemId;
    state._pendingPackingImageInventoryId = inventoryId || null;
    document.getElementById('packing-image-upload').click();
};

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('packing-image-upload');
    if (fileInput) fileInput.addEventListener('change', handlePackingImageChange);

    const invFileInput = document.getElementById('inv-image-upload');
    if (invFileInput) invFileInput.addEventListener('change', handleInventoryImageChange);
});

async function handlePackingImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const invId = state._pendingPackingImageInventoryId;
    const itemId = state._pendingPackingImageItemId;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    try {
        showToast('Uploading…', 'info');
        const targetId = invId || itemId;
        const path = invId ? `inventory/${targetId}` : `packingImages/${state.activeEvent?.id}/${targetId}`;
        const ref = storage.ref(path);
        await ref.put(file, { contentType: file.type });
        const url = await ref.getDownloadURL();
        if (invId) {
            await db.collection('inventory').doc(invId).update({ imageUrl: url });
        } else {
            await collections.packingList.doc(itemId).update({ imageUrl: url, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        showToast('Image uploaded');
    } catch (err) {
        console.error('Image upload failed:', err);
        showToast('Upload failed', 'error');
    }
}

// --- Condition cycling (event packing item or inventory item) ---
window.cyclePackingCondition = async function(packingItemId, inventoryId) {
    const order = ['working', 'damaged', 'broken'];
    if (inventoryId) {
        const inv = getInventoryItem(inventoryId);
        if (!inv) return;
        const next = order[(order.indexOf(inv.condition || 'working') + 1) % order.length];
        try {
            await db.collection('inventory').doc(inventoryId).update({ condition: next });
        } catch (err) { showToast('Error updating condition', 'error'); }
    } else {
        const item = state.packingList.find(i => i.id === packingItemId);
        if (!item) return;
        const next = order[(order.indexOf(item.condition || 'working') + 1) % order.length];
        try {
            await collections.packingList.doc(packingItemId).update({ condition: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (err) { showToast('Error updating condition', 'error'); }
    }
};

// --- Condition filter ---
window.handlePackingConditionFilter = function(value) {
    state.packingConditionFilter = value;
    renderPackingList();
};

// --- Print ---
window.printPackingList = function() {
    printWithScope('printing-packing-list');
};

// --- Inventory Picker Modal ---
window.openInventoryPickerModal = function() {
    state._inventoryPickerSelected = new Set();
    document.getElementById('inv-picker-modal').classList.add('is-open');
    document.getElementById('inv-picker-search').value = '';
    state._invPickerSearch = '';
    renderInventoryPickerList();
};

window.closeInventoryPickerModal = function() {
    document.getElementById('inv-picker-modal').classList.remove('is-open');
};

window.invPickerSearch = function(value) {
    state._invPickerSearch = value;
    renderInventoryPickerList();
};

window.toggleInventoryPickerItem = function(id) {
    if (state._inventoryPickerSelected.has(id)) {
        state._inventoryPickerSelected.delete(id);
    } else {
        state._inventoryPickerSelected.add(id);
    }
    // toggle checkbox UI without full re-render
    const cb = document.querySelector(`.inv-picker-row[data-id="${id}"] .inv-picker-cb`);
    if (cb) cb.checked = state._inventoryPickerSelected.has(id);
    document.getElementById('inv-picker-add-btn').disabled = state._inventoryPickerSelected.size === 0;
};

function renderInventoryPickerList() {
    const container = document.getElementById('inv-picker-list');
    if (!container) return;
    const alreadyAdded = new Set(state.packingList.filter(i => i.inventoryId).map(i => i.inventoryId));
    const q = (state._invPickerSearch || '').toLowerCase();
    let items = state.inventory;
    if (q) items = items.filter(i => (i.name || '').toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q));

    if (items.length === 0) {
        container.innerHTML = `<p class="inv-picker-empty">${state.inventory.length === 0 ? 'No inventory items yet. Add items to your inventory first.' : 'No matches.'}</p>`;
        return;
    }

    const grouped = {};
    items.forEach(i => { const c = i.category || 'Misc'; if (!grouped[c]) grouped[c] = []; grouped[c].push(i); });
    const sortedCats = Object.keys(grouped).sort((a, b) => {
        const _pc = getPackingCategories(); const ai = _pc.indexOf(a), bi = _pc.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    let html = '';
    sortedCats.forEach(cat => {
        html += `<div class="inv-picker-cat-header">${escapeHtml(cat)}</div>`;
        grouped[cat].forEach(inv => {
            const already = alreadyAdded.has(inv.id);
            const checked = state._inventoryPickerSelected.has(inv.id);
            const cond = inv.condition || 'working';
            html += `<label class="inv-picker-row${already ? ' already-added' : ''}" data-id="${inv.id}" onclick="toggleInventoryPickerItem('${inv.id}')">
                <input type="checkbox" class="inv-picker-cb" ${checked ? 'checked' : ''} ${already ? 'disabled' : ''} onclick="event.stopPropagation()">
                ${inv.imageUrl ? `<img class="inv-picker-thumb" src="${escapeHtml(inv.imageUrl)}" alt="">` : '<div class="inv-picker-thumb inv-picker-thumb-empty"></div>'}
                <span class="inv-picker-name">${escapeHtml(inv.name || 'Unnamed')}</span>
                ${inv.quantity > 1 ? `<span class="inv-picker-qty">×${inv.quantity}</span>` : ''}
                <span class="pl-condition-badge cond-${cond} inv-picker-cond">${{ working: 'OK', damaged: 'Damaged', broken: 'Broken' }[cond] || 'OK'}</span>
                ${already ? '<span class="inv-picker-added-label">added</span>' : ''}
            </label>`;
        });
    });
    container.innerHTML = html;
    document.getElementById('inv-picker-add-btn').disabled = state._inventoryPickerSelected.size === 0;
}

window.confirmAddFromInventory = async function() {
    const ids = [...state._inventoryPickerSelected];
    if (ids.length === 0) return;
    try {
        const batch = db.batch();
        ids.forEach(invId => {
            const inv = getInventoryItem(invId);
            if (!inv) return;
            const ref = collections.packingList.doc();
            batch.set(ref, {
                inventoryId: invId,
                name: inv.name,
                category: inv.category || 'Misc',
                quantity: inv.quantity || 1,
                status: 'to-pack',
                assignee: '',
                notes: '',
                isAdHoc: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        });
        await batch.commit();
        showToast(`Added ${ids.length} item${ids.length > 1 ? 's' : ''} to packing list`);
        closeInventoryPickerModal();
    } catch (err) {
        console.error('Error adding from inventory:', err);
        showToast('Error adding items', 'error');
    }
};

// --- Inventory Management Modal ---
const INVENTORY_FIELD_MAP = {
    'inv-name': 'name',
    'inv-category': 'category',
    'inv-quantity': 'quantity',
    'inv-serialNumber': 'serialNumber',
    'inv-notes': 'notes',
};

window.openInventoryModal = function(itemId = null) {
    populatePackingCategorySelects();
    const modal = document.getElementById('inventory-modal');
    const form  = document.getElementById('inventory-form');
    form.reset();
    document.getElementById('inv-id').value = '';
    document.getElementById('inv-condition-input').value = 'working';
    document.getElementById('inv-modal-title').textContent = itemId ? 'Edit Inventory Item' : 'Add to Inventory';
    document.getElementById('inv-image-preview').style.display = 'none';
    document.getElementById('inv-image-preview').src = '';

    if (itemId) {
        const item = getInventoryItem(itemId);
        if (item) {
            document.getElementById('inv-id').value = itemId;
            Object.entries(INVENTORY_FIELD_MAP).forEach(([elId, field]) => {
                const el = document.getElementById(elId);
                if (el && item[field] !== undefined) el.value = item[field];
            });
            document.getElementById('inv-condition-input').value = item.condition || 'working';
            updateInvConditionBtn(item.condition || 'working');
            if (item.imageUrl) {
                const preview = document.getElementById('inv-image-preview');
                preview.src = item.imageUrl;
                preview.style.display = 'block';
            }
        }
    }

    modal.classList.add('is-open');
    document.getElementById('inv-name').focus();
};

window.closeInventoryModal = function() {
    document.getElementById('inventory-modal').classList.remove('is-open');
};

function updateInvConditionBtn(condition) {
    const btn = document.getElementById('inv-condition-btn');
    if (!btn) return;
    const labels = { working: 'Working', damaged: 'Damaged', broken: 'Broken' };
    btn.textContent = labels[condition] || 'Working';
    btn.className = `pl-condition-badge cond-${condition}`;
}

window.cycleInvCondition = function() {
    const input = document.getElementById('inv-condition-input');
    const order = ['working', 'damaged', 'broken'];
    const next = order[(order.indexOf(input.value) + 1) % order.length];
    input.value = next;
    updateInvConditionBtn(next);
};

window.triggerInvImageUpload = function() {
    document.getElementById('inv-image-upload').click();
};

async function handleInventoryImageChange(e) {
    const file = e.target.files[0];
    const invId = document.getElementById('inv-id').value;
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }

    // If editing existing inventory item, upload now
    if (invId) {
        try {
            showToast('Uploading…', 'info');
            const ref = storage.ref(`inventory/${invId}`);
            await ref.put(file, { contentType: file.type });
            const url = await ref.getDownloadURL();
            await db.collection('inventory').doc(invId).update({ imageUrl: url });
            const preview = document.getElementById('inv-image-preview');
            preview.src = url; preview.style.display = 'block';
            showToast('Image uploaded');
        } catch (err) { showToast('Upload failed', 'error'); }
    } else {
        // New item: store file in state for upload after save
        state._pendingInvImageFile = file;
        const reader = new FileReader();
        reader.onload = ev => {
            const preview = document.getElementById('inv-image-preview');
            preview.src = ev.target.result; preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

window.handleInventorySubmit = async function(e) {
    e.preventDefault();
    const itemId = document.getElementById('inv-id').value;
    const data = {};
    Object.entries(INVENTORY_FIELD_MAP).forEach(([elId, field]) => {
        const el = document.getElementById(elId);
        if (el) data[field] = el.value.trim();
    });
    data.quantity  = parseInt(data.quantity) || 1;
    data.condition = document.getElementById('inv-condition-input').value || 'working';
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    try {
        let newId = itemId;
        if (itemId) {
            await db.collection('inventory').doc(itemId).update(data);
            showToast('Inventory item updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            const ref = await db.collection('inventory').add(data);
            newId = ref.id;
            showToast('Item added to inventory');
        }
        // Upload pending image for new items
        if (!itemId && state._pendingInvImageFile) {
            try {
                const imgRef = storage.ref(`inventory/${newId}`);
                await imgRef.put(state._pendingInvImageFile, { contentType: state._pendingInvImageFile.type });
                const url = await imgRef.getDownloadURL();
                await db.collection('inventory').doc(newId).update({ imageUrl: url });
            } catch (err) { console.error('Inventory image upload failed:', err); }
            state._pendingInvImageFile = null;
        }
        closeInventoryModal();
    } catch (err) {
        console.error('Inventory save error:', err);
        showToast('Error saving item', 'error');
    }
};

window.deleteInventoryItem = async function(itemId) {
    if (!confirm('Remove this item from your inventory?')) return;
    try {
        await db.collection('inventory').doc(itemId).delete();
        showToast('Removed from inventory');
    } catch (err) { showToast('Error removing item', 'error'); }
};

// Open Manage Inventory page (modal listing all inventory)
window.openManageInventory = function() {
    try {
        const modal = document.getElementById('manage-inventory-modal');
        if (!modal) { showToast('Modal element not found', 'error'); return; }
        modal.classList.add('is-open');
        renderManageInventory();
    } catch(err) {
        showToast('openManageInventory error: ' + err.message, 'error');
        console.error('openManageInventory:', err);
    }
};

window.closeManageInventory = function() {
    document.getElementById('manage-inventory-modal').classList.remove('is-open');
};

function renderManageInventory() {
    const container = document.getElementById('manage-inventory-list');
    if (!container) return;
    const items = state.inventory;
    const cats = getPackingCategories();
    const catOptions = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    const condLabels = { working: 'Working', damaged: 'Damaged', broken: 'Broken' };

    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:24px">No inventory items yet. Click <strong>+ Add Item</strong> to get started.</p>';
        return;
    }

    let rows = items.map(inv => {
        const cond = inv.condition || 'working';
        const invCat = inv.category || 'Misc';
        const catOpts = cats.includes(invCat)
            ? catOptions.replace(`value="${escapeHtml(invCat)}"`, `value="${escapeHtml(invCat)}" selected`)
            : catOptions + `<option value="${escapeHtml(invCat)}" selected>${escapeHtml(invCat)}</option>`;
        return `<tr class="inv-mgr-table-row">
            <td class="inv-mgr-thumb-cell">
                <button class="inv-mgr-thumb-btn" onclick="clickManageInvThumb('${inv.id}')" title="Upload photo">
                    ${inv.imageUrl
                        ? `<img class="inv-mgr-thumb-img" src="${escapeHtml(inv.imageUrl)}" alt="">`
                        : `<span class="inv-mgr-thumb-placeholder"><i class="ti ti-camera"></i></span>`}
                </button>
            </td>
            <td><input class="inv-mgr-input" type="text" value="${escapeHtml(inv.name || '')}" placeholder="Item name" onblur="saveInvField('${inv.id}','name',this.value)"></td>
            <td>
                <select class="inv-mgr-select" onchange="saveInvField('${inv.id}','category',this.value)">
                    ${catOpts}
                </select>
            </td>
            <td><input class="inv-mgr-input inv-mgr-input-num" type="number" min="1" value="${inv.quantity || 1}" onblur="saveInvField('${inv.id}','quantity',Math.max(1,parseInt(this.value)||1))"></td>
            <td><input class="inv-mgr-input" type="text" value="${escapeHtml(inv.serialNumber || '')}" placeholder="—" onblur="saveInvField('${inv.id}','serialNumber',this.value)"></td>
            <td><button class="pl-condition-badge cond-${cond}" onclick="cycleInvConditionInTable('${inv.id}',this)">${condLabels[cond] || 'Working'}</button></td>
            <td class="inv-mgr-del-cell">
                <button class="btn-icon-sm delete" onclick="deleteInventoryItem('${inv.id}')" title="Delete">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="inv-mgr-table">
        <thead><tr>
            <th style="width:52px"></th>
            <th>Name</th>
            <th style="width:150px">Category</th>
            <th style="width:60px">Qty</th>
            <th style="width:130px">Serial #</th>
            <th style="width:105px">Condition</th>
            <th style="width:36px"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

window.saveInvField = async function(invId, field, value) {
    try {
        await db.collection('inventory').doc(invId).update({ [field]: value });
    } catch (err) { showToast('Error saving', 'error'); }
};

window.cycleInvConditionInTable = async function(invId, btn) {
    const inv = getInventoryItem(invId);
    if (!inv) return;
    const order = ['working', 'damaged', 'broken'];
    const labels = { working: 'Working', damaged: 'Damaged', broken: 'Broken' };
    const next = order[(order.indexOf(inv.condition || 'working') + 1) % order.length];
    try {
        await db.collection('inventory').doc(invId).update({ condition: next });
        btn.textContent = labels[next];
        btn.className = `pl-condition-badge cond-${next}`;
    } catch (err) { showToast('Error updating condition', 'error'); }
};

window.cycleInventoryItemCondition = window.cycleInvConditionInTable;

window.clickManageInvThumb = function(invId) {
    state._pendingPackingImageInventoryId = invId;
    state._pendingPackingImageItemId = null;
    document.getElementById('packing-image-upload').click();
};

window.handleInventoryImport = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { showToast('No data found in file', 'error'); return; }
        const batch = db.batch();
        let count = 0;
        rows.forEach(row => {
            const name = row['Name'] || row['name'] || row['Item'] || row['item'] || '';
            if (!String(name).trim()) return;
            const ref = db.collection('inventory').doc();
            batch.set(ref, {
                name: String(name).trim(),
                category: String(row['Category'] || row['category'] || 'Misc').trim(),
                quantity: parseInt(row['Quantity'] || row['quantity'] || row['Qty'] || row['qty'] || 1) || 1,
                serialNumber: String(row['Serial Number'] || row['serialNumber'] || row['Serial'] || row['serial'] || '').trim(),
                condition: String(row['Condition'] || row['condition'] || 'working').toLowerCase().trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            count++;
        });
        await batch.commit();
        showToast(`Imported ${count} item${count !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
        console.error('Import failed:', err);
        showToast('Import failed — check file format', 'error');
    }
};

// =============================================
// PRINTED MATERIALS FUNCTIONS
// =============================================

const PRINT_FIELD_MAP = {
    'print-name': 'name',
    'print-quantity': 'quantity',
    'print-fileLink': 'fileLink',
    'print-size': 'size',
    'print-material': 'material',
    'print-holder': 'holder',
    'print-vendor': 'vendor',
    'print-notes': 'notes',
    'print-status': 'status'
};

function formatSizeWithUnits(size) {
    if (!size || size === 'TBD') return size || '';
    // Already has units (inches symbol or ft/feet/in)
    if (/["″]/.test(size) || /\b(ft|feet|in)\b/i.test(size)) return size;
    // Replace bare numbers in dimension patterns like "24 x 36" or "8.5x11"
    return size.replace(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/g, '$1" x $2"');
}

function renderPrintedMaterials() {
    const tbody = document.getElementById('print-materials-tbody');
    if (!tbody) return;

    const items = state.printedMaterials;
    const total = items.length;
    const awaiting = items.filter(i => i.status === 'awaiting-approval').length;
    const ordered = items.filter(i => i.status === 'ordered').length;
    const done = items.filter(i => i.status === 'received' || i.status === 'done').length;

    // Update stat cards
    const statTotal = document.getElementById('print-stat-total');
    const statAwaiting = document.getElementById('print-stat-awaiting');
    const statOrdered = document.getElementById('print-stat-ordered');
    const statDone = document.getElementById('print-stat-done');
    if (statTotal) statTotal.textContent = total;
    if (statAwaiting) statAwaiting.textContent = awaiting;
    if (statOrdered) statOrdered.textContent = ordered;
    if (statDone) statDone.textContent = done;

    // Populate vendor filter dropdown
    const vendorSelect = document.getElementById('print-vendor-filter');
    if (vendorSelect) {
        const vendors = [...new Set(items.map(i => i.vendor).filter(Boolean))].sort();
        const currentVal = state.printVendorFilter;
        vendorSelect.innerHTML = '<option value="all">All Vendors</option>' +
            vendors.map(v => `<option value="${escapeHtml(v)}"${currentVal === v ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('');
    }

    // Apply filters
    let filtered = [...items];
    if (state.printSearch) {
        const q = state.printSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.material || '').toLowerCase().includes(q) ||
            (i.vendor || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.printStatusFilter !== 'all') {
        filtered = filtered.filter(i => {
            const s = i.status || 'not-started';
            return s === state.printStatusFilter || (state.printStatusFilter === 'not-started' && s === 'pending');
        });
    }
    if (state.printVendorFilter !== 'all') {
        filtered = filtered.filter(i => (i.vendor || '') === state.printVendorFilter);
    }

    // Apply column visibility classes to table
    const table = document.getElementById('print-materials-table');
    if (table) {
        const cols = state.printColumns;
        ['name','quantity','size','material','holder','vendor','status','link','notes'].forEach(col => {
            table.classList.toggle('hide-pm-' + col, !cols[col]);
        });
    }

    // Update search count
    const searchCount = document.getElementById('print-search-count');
    if (searchCount) {
        const isFiltered = state.printSearch || state.printStatusFilter !== 'all' || state.printVendorFilter !== 'all';
        if (isFiltered) {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    // Sort
    if (state.printSort.field) {
        const { field, direction } = state.printSort;
        filtered.sort((a, b) => {
            let aVal = (a[field] || '').toString().toLowerCase();
            let bVal = (b[field] || '').toString().toLowerCase();
            // Normalize legacy 'pending' to 'not-started' for sorting
            if (field === 'status') {
                if (aVal === 'pending' || !aVal) aVal = 'not-started';
                if (bVal === 'pending' || !bVal) bVal = 'not-started';
            }
            const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
            return direction === 'asc' ? cmp : -cmp;
        });
    } else {
        // Default sort by sortOrder then name
        filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));
    }

    // Update sort indicators
    document.querySelectorAll('.print-materials-table .sort-indicator').forEach(el => el.textContent = '');
    if (state.printSort.field) {
        const indicator = document.getElementById(`print-sort-${state.printSort.field}`);
        if (indicator) indicator.textContent = state.printSort.direction === 'asc' ? ' \u25B2' : ' \u25BC';
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${total === 0 ? 'No printed materials added' : 'No items match your filters'}</td></tr>`;
        return;
    }

    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const statusClasses = { 'not-started': 'print-status-not-started', 'in-progress': 'print-status-in-progress', 'awaiting-approval': 'print-status-awaiting', approved: 'print-status-approved', ordered: 'print-status-ordered', received: 'print-status-received', pending: 'print-status-not-started' };

    tbody.innerHTML = filtered.map(item => {
        const status = item.status === 'pending' ? 'not-started' : (item.status || 'not-started');
        const linkBtn = item.fileLink
            ? `<a href="${escapeHtml(item.fileLink)}" target="_blank" rel="noopener" class="print-link-btn" title="Open file" onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               </a>`
            : '<span class="print-no-link">--</span>';
        const notesText = item.notes || '';
        return `<tr onclick="openPrintModal('${item.id}')">
            <td class="print-name-cell pm-col-name">${escapeHtml(item.name || '')}</td>
            <td class="pm-col-quantity">${escapeHtml(item.quantity || '')}</td>
            <td class="pm-col-size">${escapeHtml(formatSizeWithUnits(item.size))}</td>
            <td class="pm-col-material">${escapeHtml(item.material || '')}</td>
            <td class="pm-col-holder">${escapeHtml(item.holder || '')}</td>
            <td class="pm-col-vendor">${escapeHtml(item.vendor || '')}</td>
            <td class="pm-col-status"><span class="print-status-badge ${statusClasses[status]}">${statusLabels[status]}</span></td>
            <td class="print-link-cell pm-col-link">${linkBtn}</td>
            <td class="print-notes-cell pm-col-notes" title="${escapeHtml(notesText)}">${escapeHtml(notesText)}</td>
        </tr>`;
    }).join('');
}

function sortPrintedMaterials(field) {
    if (state.printSort.field === field) {
        state.printSort.direction = state.printSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.printSort.field = field;
        state.printSort.direction = 'asc';
    }
    renderPrintedMaterials();
}

function openPrintModal(itemId = null) {
    openModal({
        modalId: 'print-modal',
        formId: 'print-form',
        title: 'Printed Material',
        stateKey: 'printedMaterials',
        itemId: itemId,
        idFieldId: 'print-id',
        fieldMap: PRINT_FIELD_MAP,
        defaultValues: {
            'print-status': 'not-started',
            'print-quantity': ''
        }
    });

    // Show/hide delete and duplicate buttons
    const deleteBtn = document.getElementById('print-delete-btn');
    if (deleteBtn) {
        deleteBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            deleteBtn.onclick = () => deletePrintedMaterial(itemId);
        }
    }
    const dupBtn = document.getElementById('print-duplicate-btn');
    if (dupBtn) {
        dupBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            dupBtn.onclick = () => duplicatePrintedMaterial(itemId);
        }
    }
}

async function handlePrintSubmit(e) {
    const result = await handleFormSubmit(e, {
        collection: 'printedMaterials',
        fieldMap: PRINT_FIELD_MAP,
        idFieldId: 'print-id',
        itemName: 'printed material'
    });
    // For new items, set a sortOrder based on current count
    if (result && result.isNew && result.docId) {
        try {
            await collections.printedMaterials.doc(result.docId).update({
                sortOrder: state.printedMaterials.length
            });
        } catch (e) {
            // Not critical
        }
    }
}

async function deletePrintedMaterial(itemId) {
    const id = itemId || document.getElementById('print-id').value;
    if (!id) return;
    if (confirm('Are you sure you want to delete this printed material?')) {
        try {
            await collections.printedMaterials.doc(id).delete();
            showToast('Printed material deleted');
            closeAllModals();
        } catch (error) {
            console.error('Error deleting printed material:', error);
            showToast('Error deleting printed material', 'error');
        }
    }
}

function handlePrintSearch(value) {
    state.printSearch = value;
    const clearBtn = document.getElementById('print-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderPrintedMaterials();
}

function clearPrintSearch() {
    state.printSearch = '';
    const input = document.getElementById('print-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('print-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderPrintedMaterials();
}

function handlePrintStatusFilter(value) {
    state.printStatusFilter = value;
    renderPrintedMaterials();
}

function handlePrintVendorFilter(value) {
    state.printVendorFilter = value;
    renderPrintedMaterials();
}

function togglePrintColumn(col, visible) {
    state.printColumns[col] = visible;
    renderPrintedMaterials();
}

function togglePrintColumnsDropdown() {
    const dropdown = document.getElementById('print-columns-dropdown');
    if (dropdown) dropdown.classList.toggle('open');
}

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('print-columns-dropdown');
    const btn = document.getElementById('print-columns-toggle-btn');
    if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});

function exportPrintedMaterialsToExcel() {
    // Apply same filters as current view
    let items = [...state.printedMaterials];
    if (state.printSearch) {
        const q = state.printSearch.toLowerCase();
        items = items.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.material || '').toLowerCase().includes(q) ||
            (i.vendor || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.printStatusFilter !== 'all') {
        items = items.filter(i => {
            const s = i.status || 'not-started';
            return s === state.printStatusFilter || (state.printStatusFilter === 'not-started' && s === 'pending');
        });
    }
    if (state.printVendorFilter !== 'all') {
        items = items.filter(i => (i.vendor || '') === state.printVendorFilter);
    }

    // Build rows with only visible columns
    const cols = state.printColumns;
    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const data = items.map(item => {
        const row = {};
        if (cols.name) row['Name'] = item.name || '';
        if (cols.quantity) row['Quantity'] = item.quantity || '';
        if (cols.size) row['Size'] = formatSizeWithUnits(item.size);
        if (cols.material) row['Material'] = item.material || '';
        if (cols.holder) row['Holder'] = item.holder || '';
        if (cols.vendor) row['Vendor'] = item.vendor || '';
        if (cols.status) row['Status'] = statusLabels[item.status] || statusLabels['not-started'];
        if (cols.link) row['File Link'] = item.fileLink || '';
        if (cols.notes) row['Notes'] = item.notes || '';
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const widths = [];
    if (cols.name) widths.push({ wch: 30 });
    if (cols.quantity) widths.push({ wch: 8 });
    if (cols.size) widths.push({ wch: 14 });
    if (cols.material) widths.push({ wch: 15 });
    if (cols.holder) widths.push({ wch: 18 });
    if (cols.vendor) widths.push({ wch: 15 });
    if (cols.status) widths.push({ wch: 14 });
    if (cols.link) widths.push({ wch: 35 });
    if (cols.notes) widths.push({ wch: 25 });
    ws['!cols'] = widths;

    const wb = XLSX.utils.book_new();
    const vendorSuffix = state.printVendorFilter !== 'all' ? ' - ' + state.printVendorFilter : '';
    XLSX.utils.book_append_sheet(wb, ws, 'Printed Materials');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Printed_Materials' + vendorSuffix.replace(/[^a-zA-Z0-9 _-]/g, '') + '_' + today + '.xlsx');
}

async function duplicatePrintedMaterial(itemId) {
    const item = state.printedMaterials.find(i => i.id === itemId);
    if (!item) return;
    const { id, createdAt, updatedAt, sortOrder, ...data } = item;
    data.name = (data.name || '') + ' (Copy)';
    data.status = 'not-started';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.sortOrder = state.printedMaterials.length;
    try {
        const docRef = await collections.printedMaterials.add(data);
        closeAllModals();
        showToast('Item duplicated');
        // Open the new copy for editing
        setTimeout(() => openPrintModal(docRef.id), 300);
    } catch (error) {
        console.error('Error duplicating printed material:', error);
        showToast('Error duplicating item', 'error');
    }
}

window.openPrintModal = openPrintModal;
window.deletePrintedMaterial = deletePrintedMaterial;
window.duplicatePrintedMaterial = duplicatePrintedMaterial;
window.handlePrintSearch = handlePrintSearch;
window.clearPrintSearch = clearPrintSearch;
window.handlePrintStatusFilter = handlePrintStatusFilter;
window.sortPrintedMaterials = sortPrintedMaterials;
window.exportPrintedMaterialsToExcel = exportPrintedMaterialsToExcel;
window.handlePrintVendorFilter = handlePrintVendorFilter;
window.togglePrintColumn = togglePrintColumn;
window.togglePrintColumnsDropdown = togglePrintColumnsDropdown;

// =============================================
// DIGITAL ASSETS FUNCTIONS
// =============================================

const DA_FIELD_MAP = {
    'da-name': 'name',
    'da-format': 'format',
    'da-resolution': 'resolution',
    'da-destination': 'destination',
    'da-creator': 'creator',
    'da-duration': 'duration',
    'da-fileLink': 'fileLink',
    'da-notes': 'notes',
    'da-status': 'status'
};

function renderDigitalAssets() {
    const tbody = document.getElementById('da-materials-tbody');
    if (!tbody) return;

    const items = state.digitalAssets;
    const total = items.length;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'not-started' || !i.status).length;
    const ordered = items.filter(i => i.status === 'ordered').length;
    const received = items.filter(i => i.status === 'received').length;
    const done = items.filter(i => i.status === 'done').length;

    const statTotal = document.getElementById('da-stat-total');
    const statPending = document.getElementById('da-stat-pending');
    const statOrdered = document.getElementById('da-stat-ordered');
    const statReceived = document.getElementById('da-stat-received');
    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statOrdered) statOrdered.textContent = ordered;
    if (statReceived) statReceived.textContent = received + done;

    let filtered = [...items];
    if (state.daSearch) {
        const q = state.daSearch.toLowerCase();
        filtered = filtered.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.format || '').toLowerCase().includes(q) ||
            (i.destination || '').toLowerCase().includes(q) ||
            (i.creator || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q)
        );
    }
    if (state.daStatusFilter !== 'all') {
        filtered = filtered.filter(i => {
            const s = i.status || 'not-started';
            return s === state.daStatusFilter || (state.daStatusFilter === 'not-started' && s === 'pending');
        });
    }

    const searchCount = document.getElementById('da-search-count');
    if (searchCount) {
        if (state.daSearch || state.daStatusFilter !== 'all') {
            searchCount.textContent = `${filtered.length} of ${total} items`;
        } else {
            searchCount.textContent = '';
        }
    }

    if (state.daSort.field) {
        const { field, direction } = state.daSort;
        filtered.sort((a, b) => {
            const aVal = (a[field] || '').toString().toLowerCase();
            const bVal = (b[field] || '').toString().toLowerCase();
            const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
            return direction === 'asc' ? cmp : -cmp;
        });
    } else {
        filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));
    }

    document.querySelectorAll('#da-materials-table .sort-indicator').forEach(el => el.textContent = '');
    if (state.daSort.field) {
        const indicator = document.getElementById(`da-sort-${state.daSort.field}`);
        if (indicator) indicator.textContent = state.daSort.direction === 'asc' ? ' \u25B2' : ' \u25BC';
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${total === 0 ? 'No digital assets added' : 'No items match your filters'}</td></tr>`;
        return;
    }

    const statusLabels = { 'not-started': 'Not Started', 'in-progress': 'In Progress', 'awaiting-approval': 'Awaiting Approval', approved: 'Approved', ordered: 'Ordered', received: 'Received', pending: 'Not Started' };
    const statusClasses = { 'not-started': 'print-status-not-started', 'in-progress': 'print-status-in-progress', 'awaiting-approval': 'print-status-awaiting', approved: 'print-status-approved', ordered: 'print-status-ordered', received: 'print-status-received', pending: 'print-status-not-started' };

    tbody.innerHTML = filtered.map(item => {
        const status = item.status === 'pending' ? 'not-started' : (item.status || 'not-started');
        const linkBtn = item.fileLink
            ? `<a href="${escapeHtml(item.fileLink)}" target="_blank" rel="noopener" class="print-link-btn" title="Open file" onclick="event.stopPropagation()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               </a>`
            : '<span class="print-no-link">--</span>';
        const notesText = item.notes || '';
        return `<tr onclick="openDAModal('${item.id}')">
            <td class="print-name-cell">${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.format || '')}</td>
            <td>${escapeHtml(item.resolution || '')}</td>
            <td>${escapeHtml(item.destination || '')}</td>
            <td>${escapeHtml(item.creator || '')}</td>
            <td>${escapeHtml(item.duration || '')}</td>
            <td><span class="print-status-badge ${statusClasses[status]}">${statusLabels[status]}</span></td>
            <td class="print-link-cell">${linkBtn}</td>
            <td class="print-notes-cell" title="${escapeHtml(notesText)}">${escapeHtml(notesText)}</td>
        </tr>`;
    }).join('');
}

function sortDigitalAssets(field) {
    if (state.daSort.field === field) {
        state.daSort.direction = state.daSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.daSort.field = field;
        state.daSort.direction = 'asc';
    }
    renderDigitalAssets();
}

function openDAModal(itemId = null) {
    openModal({
        modalId: 'da-modal',
        formId: 'da-form',
        title: 'Digital Asset',
        stateKey: 'digitalAssets',
        itemId: itemId,
        idFieldId: 'da-id',
        fieldMap: DA_FIELD_MAP,
        defaultValues: {
            'da-status': 'not-started'
        }
    });

    const deleteBtn = document.getElementById('da-delete-btn');
    if (deleteBtn) {
        deleteBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            deleteBtn.onclick = () => deleteDigitalAsset(itemId);
        }
    }
    const dupBtn = document.getElementById('da-duplicate-btn');
    if (dupBtn) {
        dupBtn.style.display = itemId ? 'inline-flex' : 'none';
        if (itemId) {
            dupBtn.onclick = () => duplicateDigitalAsset(itemId);
        }
    }
}

async function handleDASubmit(e) {
    const result = await handleFormSubmit(e, {
        collection: 'digitalAssets',
        fieldMap: DA_FIELD_MAP,
        idFieldId: 'da-id',
        itemName: 'digital asset'
    });
    if (result && result.isNew && result.docId) {
        try {
            await collections.digitalAssets.doc(result.docId).update({
                sortOrder: state.digitalAssets.length
            });
        } catch (e) {
            // Not critical
        }
    }
}

async function deleteDigitalAsset(itemId) {
    const id = itemId || document.getElementById('da-id').value;
    if (!id) return;
    if (confirm('Are you sure you want to delete this digital asset?')) {
        try {
            await collections.digitalAssets.doc(id).delete();
            showToast('Digital asset deleted');
            closeAllModals();
        } catch (error) {
            console.error('Error deleting digital asset:', error);
            showToast('Error deleting digital asset', 'error');
        }
    }
}

function handleDASearch(value) {
    state.daSearch = value;
    const clearBtn = document.getElementById('da-search-clear');
    if (clearBtn) clearBtn.style.display = value ? 'block' : 'none';
    renderDigitalAssets();
}

function clearDASearch() {
    state.daSearch = '';
    const input = document.getElementById('da-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('da-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    renderDigitalAssets();
}

function handleDAStatusFilter(value) {
    state.daStatusFilter = value;
    renderDigitalAssets();
}

function exportDigitalAssetsToExcel() {
    const data = state.digitalAssets.map(item => ({
        'Name': item.name || '',
        'Format': item.format || '',
        'Resolution': item.resolution || '',
        'Display/Destination': item.destination || '',
        'Creator': item.creator || '',
        'Duration': item.duration || '',
        'Status': (item.status || 'not-started').charAt(0).toUpperCase() + (item.status || 'not-started').slice(1),
        'File Link': item.fileLink || '',
        'Notes': item.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
        { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 35 }, { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Digital Assets');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Digital_Assets_' + today + '.xlsx');
}

async function duplicateDigitalAsset(itemId) {
    const item = state.digitalAssets.find(i => i.id === itemId);
    if (!item) return;
    const { id, createdAt, updatedAt, sortOrder, ...data } = item;
    data.name = (data.name || '') + ' (Copy)';
    data.status = 'not-started';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    data.sortOrder = state.digitalAssets.length;
    try {
        const docRef = await collections.digitalAssets.add(data);
        closeAllModals();
        showToast('Item duplicated');
        setTimeout(() => openDAModal(docRef.id), 300);
    } catch (error) {
        console.error('Error duplicating digital asset:', error);
        showToast('Error duplicating item', 'error');
    }
}

window.openDAModal = openDAModal;
window.deleteDigitalAsset = deleteDigitalAsset;
window.duplicateDigitalAsset = duplicateDigitalAsset;
window.handleDASearch = handleDASearch;
window.clearDASearch = clearDASearch;
window.handleDAStatusFilter = handleDAStatusFilter;
window.sortDigitalAssets = sortDigitalAssets;
window.exportDigitalAssetsToExcel = exportDigitalAssetsToExcel;

// Export Staff to Excel
function exportStaffToExcel() {
    const data = state.staff.map(member => ({
        'Name': member.name || '',
        'Role': member.role || '',
        'Teams': (member.teams || []).join(', '),
        'Thursday': (member.schedule && member.schedule.thursday) || '',
        'Friday': (member.schedule && member.schedule.friday) || '',
        'Saturday': (member.schedule && member.schedule.saturday) || '',
        'Sunday': (member.schedule && member.schedule.sunday) || '',
        'Placeholder': member.isPlaceholder ? 'Yes' : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 22 },
        { wch: 28 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, 'Staff_List_' + today + '.xlsx');
}

// Setup Keyboard Shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Focus budget search with '/' key
        if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && state.currentPage === 'budget') {
            e.preventDefault();
            const searchInput = document.getElementById('budget-search-input');
            if (searchInput) searchInput.focus();
        }

        // Timeline: Cmd/Ctrl+Enter inserts a new row right after wherever you
        // last were, instead of always jumping to the bottom phantom row.
        // (Plain "N" used to do this, but Cmd/Ctrl+Enter works from inside an
        // active cell edit too, which is when "where you are" matters most.)
        if (state.currentPage === 'timeline' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            insertTimelineRowAfterCurrent();
            return;
        }

        // Undo: Ctrl+Z or Cmd+Z (global, regardless of focus)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                e.target.blur();
            }
            undoGlobalAction();
        }
    });
}

// ========================================
// Venue Map Annotation Tool
// ========================================

function setupVenueMap() {
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper) return;

    // Background image is loaded per-event from Firestore in vmInitCanvas().
    // No static venue-map.png pre-load here.

    // Resize canvas to fit container whenever the window resizes
    let vmResizeTimer;
    window.addEventListener('resize', () => {
        if (state.currentPage !== 'venue-map') return;
        clearTimeout(vmResizeTimer);
        vmResizeTimer = setTimeout(vmFitCanvasToContainer, 150);
    });

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
            // Apply color to selected object(s)
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                vmSaveCanvasState();
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                objs.forEach(obj => {
                    if (obj.type === 'textbox') {
                        obj.set('fill', state.vmCurrentColor);
                    } else {
                        obj.set('stroke', state.vmCurrentColor);
                        if (obj.fill && obj.fill !== 'transparent') {
                            obj.set('fill', state.vmCurrentColor);
                        }
                    }
                    obj.dirty = true;
                });
                if (active.type === 'activeSelection') active.dirty = true;
                state.vmCanvas.renderAll();
                vmTriggerSave();
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
            // Apply stroke width to selected object(s) (not text)
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                vmSaveCanvasState();
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                objs.forEach(obj => {
                    if (obj.type !== 'textbox') {
                        obj.set('strokeWidth', state.vmStrokeWidth);
                        obj.dirty = true;
                    }
                });
                if (active.type === 'activeSelection') active.dirty = true;
                state.vmCanvas.renderAll();
                vmTriggerSave();
            }
        });
    }

    // Fill toggle
    const fillToggle = document.getElementById('vm-fill-toggle');
    if (fillToggle) {
        fillToggle.addEventListener('change', (e) => {
            state.vmFillShape = e.target.checked;
            const active = state.vmCanvas?.getActiveObject();
            if (active) {
                const objs = active.type === 'activeSelection' ? active.getObjects() : [active];
                const fillable = objs.filter(o => o.type === 'rect' || o.type === 'ellipse');
                if (fillable.length) {
                    vmSaveCanvasState();
                    fillable.forEach(obj => {
                        obj.set('fill', state.vmFillShape ? obj.stroke : 'transparent');
                        obj.dirty = true;
                    });
                    if (active.type === 'activeSelection') active.dirty = true;
                    state.vmCanvas.renderAll();
                    vmTriggerSave();
                }
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

    // Undo/Redo buttons
    const undoBtn = document.getElementById('vm-undo-btn');
    const redoBtn = document.getElementById('vm-redo-btn');
    if (undoBtn) undoBtn.addEventListener('click', vmUndo);
    if (redoBtn) redoBtn.addEventListener('click', vmRedo);

    // Keyboard shortcuts for venue map
    document.addEventListener('keydown', (e) => {
        if (state.currentPage !== 'venue-map' || !state.vmCanvas) return;
        const inField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

        if (!inField && (e.key === 'Delete' || e.key === 'Backspace')) {
            if (state.vmCanvas.getActiveObject()?.isEditing) return;
            vmDeleteSelected();
            e.preventDefault();
        }

        // Undo: Ctrl+Z / Cmd+Z (works regardless of focus)
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
            e.preventDefault();
            if (inField) e.target.blur();
            vmUndo();
        }
        // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
            e.preventDefault();
            if (inField) e.target.blur();
            vmRedo();
        }
    });

    // Upload map image file handler
    const uploadInput = document.getElementById('vm-bg-upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            e.target.value = '';
            vmProcessMapFile(file);
        });
    }

    // Document-level drag & drop — always intercept so browser never navigates to file
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        if (state.currentPage !== 'venue-map') return;
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
        if (!ok) return;
        document.getElementById('vm-upload-drop-zone')?.classList.remove('drag-over');
        vmProcessMapFile(file);
    });
    document.addEventListener('dragenter', () => {
        if (state.currentPage === 'venue-map') {
            document.getElementById('vm-upload-drop-zone')?.classList.add('drag-over');
        }
    });
    document.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
            document.getElementById('vm-upload-drop-zone')?.classList.remove('drag-over');
        }
    });
}

async function vmProcessMapFile(file) {
    showToast('Processing map…', 'info');
    try {
        let dataUrl;
        if (file.type === 'application/pdf') {
            dataUrl = await vmRenderPDFtoDataURL(file);
            if (!dataUrl) { showToast('Could not render PDF. Try a different file.', 'error'); return; }
        } else {
            dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        // Compress to max 1400px wide
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
        const maxW = 1400;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = tmp.toDataURL('image/jpeg', 0.85);

        await collections.venueMapLayers.doc('default').set({ bgImageData: compressed }, { merge: true });
        const prompt = document.getElementById('vm-upload-prompt');
        if (prompt) prompt.style.display = 'none';
        vmResetCanvas();
        await vmInitCanvas();
        showToast('Map uploaded!');
    } catch (err) {
        console.error('vmProcessMapFile error:', err);
        showToast('Error saving map. Please try again.', 'error');
    }
}

async function vmRenderPDFtoDataURL(file) {
    if (!window.pdfjsLib) { showToast('PDF renderer not available. Refresh and try again.', 'error'); return null; }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 }); // high-res render
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.9);
}

window.vmUploadBackground = function() {
    document.getElementById('vm-bg-upload').click();
};

function vmResetCanvas() {
    if (state.vmCanvas) {
        state.vmCanvas.dispose();
        state.vmCanvas = null;
    }
    state.vmBgImage = null;
    state.vmBgCORS = true;
    state.vmLayers = [];
    state.vmActiveLayerId = null;
    state.vmUndoStack = [];
    state.vmRedoStack = [];
    state.vmImageLoaded = false;
    state.vmZoom = 1.0;
    state.vmBaseWidth = 0;
    state.vmBaseHeight = 0;
    state.vmDrawingObj = null;
    state.vmDrawStart = null;
    if (state.vmAutoSaveTimeout) {
        clearTimeout(state.vmAutoSaveTimeout);
        state.vmAutoSaveTimeout = null;
    }
    if (state.vmResizeObserver) {
        state.vmResizeObserver.disconnect();
        state.vmResizeObserver = null;
    }
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (wrapper) wrapper.innerHTML = '<canvas id="vm-canvas"></canvas>';
}

async function vmInitCanvas() {
    if (state.vmCanvas) return;

    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper) return;

    // Load per-event background image from Firestore
    if (collections.venueMapLayers) {
        try {
            const doc = await collections.venueMapLayers.doc('default').get();
            if (doc.exists && doc.data().bgImageData) {
                await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => { state.vmBgImage = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = doc.data().bgImageData;
                });
            }
        } catch (e) { /* proceed with blank canvas */ }
    }

    // Wait for layout to settle before reading dimensions
    await new Promise(resolve => requestAnimationFrame(resolve));

    const img = state.vmBgImage;
    const canvasArea = wrapper.closest('.vm-canvas-area') || wrapper.parentElement;
    // getBoundingClientRect() forces a synchronous reflow, guaranteeing the
    // true rendered width even when clientWidth returns a stale/pre-layout value.
    const wrapperWidth = Math.round(canvasArea?.getBoundingClientRect().width || 0)
        || Math.round(wrapper.getBoundingClientRect().width || 0)
        || 1000;
    let canvasWidth, canvasHeight;

    if (img) {
        const scale = wrapperWidth / img.naturalWidth;
        canvasWidth = Math.floor(img.naturalWidth * scale);
        canvasHeight = Math.floor(img.naturalHeight * scale);
        state.vmBgScale = scale;
    } else {
        canvasWidth = wrapperWidth;
        canvasHeight = Math.floor(wrapperWidth * 0.65);
        state.vmBgScale = 1;
    }

    state.vmCanvas = new fabric.Canvas('vm-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        selection: true,
        preserveObjectStacking: true
    });

    if (img) {
        state.vmCanvas.setBackgroundImage(
            new fabric.Image(img, {
                scaleX: state.vmBgScale,
                scaleY: state.vmBgScale,
                originX: 'left',
                originY: 'top'
            }),
            state.vmCanvas.renderAll.bind(state.vmCanvas)
        );
    } else {
        state.vmCanvas.setBackgroundColor('#111111', state.vmCanvas.renderAll.bind(state.vmCanvas));
    }

    state.vmImageLoaded = true;
    state.vmBaseWidth = canvasWidth;
    state.vmBaseHeight = canvasHeight;
    state.vmZoom = 1.0;

    const wrapperEl = document.getElementById('vm-canvas-wrapper');
    wrapperEl.addEventListener('contextmenu', vmShowContextMenu);
    document.addEventListener('click', vmHideContextMenu);

    state.vmCanvas.calcOffset();

    vmSetupDrawingEvents();
    vmLoadLayers().then(() => {
        setTimeout(vmSaveCanvasState, 200);
    });

    // ResizeObserver fires (asynchronously) whenever the container resizes,
    // including right after observe() is called on a visible element.
    const canvasAreaEl = wrapper.closest('.vm-canvas-area') || wrapper.parentElement;
    if (canvasAreaEl && window.ResizeObserver) {
        state.vmResizeObserver = new ResizeObserver(entries => {
            const w = Math.floor(entries[0]?.contentRect?.width || 0);
            if (w > 10) vmFitCanvasToContainer();
        });
        state.vmResizeObserver.observe(canvasAreaEl);
    }
    // Also correct immediately (synchronous), in case the ResizeObserver callback
    // arrives too late or returns the same stale width as the initial read.
    // Temporarily zero out vmBaseWidth so the < 2 guard doesn't block a correction.
    const initialWidth = state.vmBaseWidth;
    state.vmBaseWidth = 0;
    vmFitCanvasToContainer();
    if (state.vmBaseWidth === 0) state.vmBaseWidth = initialWidth; // restore if no resize happened

    // Show upload prompt if no background image exists for this event
    if (!state.vmBgImage) {
        const prompt = document.getElementById('vm-upload-prompt');
        if (prompt) prompt.style.display = 'flex';
    }
}

function vmFitCanvasToContainer() {
    const c = state.vmCanvas;
    if (!c) return;
    const wrapper = document.getElementById('vm-canvas-wrapper');
    if (!wrapper) return;
    const canvasArea = wrapper.closest('.vm-canvas-area') || wrapper.parentElement;
    // getBoundingClientRect forces a synchronous reflow for an accurate measurement
    const newWidth = Math.round(canvasArea?.getBoundingClientRect().width || canvasArea?.clientWidth || wrapper.clientWidth || 0);
    if (!newWidth || Math.abs(newWidth - state.vmBaseWidth) < 2) return;

    const img = state.vmBgImage;
    let newHeight;
    if (img) {
        const newScale = newWidth / img.naturalWidth;
        newHeight = Math.floor(img.naturalHeight * newScale);
        state.vmBgScale = newScale;
        c.setBackgroundImage(
            new fabric.Image(img, { scaleX: newScale, scaleY: newScale, originX: 'left', originY: 'top' }),
            c.renderAll.bind(c)
        );
    } else {
        newHeight = Math.floor(newWidth * 0.65);
    }
    c.setWidth(newWidth);
    c.setHeight(newHeight);
    state.vmBaseWidth = newWidth;
    state.vmBaseHeight = newHeight;
    c.renderAll();
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
            let x2 = pointer.x, y2 = pointer.y;
            if (opt.e.shiftKey) {
                const dx = pointer.x - state.vmDrawStart.x;
                const dy = pointer.y - state.vmDrawStart.y;
                const angle = Math.atan2(dy, dx);
                const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                const dist = Math.sqrt(dx * dx + dy * dy);
                x2 = state.vmDrawStart.x + dist * Math.cos(snapped);
                y2 = state.vmDrawStart.y + dist * Math.sin(snapped);
            }
            state.vmDrawingObj.set({ x2, y2 });
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

    // Option/Alt + drag to duplicate
    c.on('mouse:down', (opt) => {
        if (!opt.e.altKey) return;
        if (state.vmCurrentTool !== 'select') return;
        const active = c.getActiveObject();
        if (!active || active._vmBackground) return;

        active.clone((cloned) => {
            cloned.set({
                left: active.left,
                top: active.top,
                _vmLayerId: active._vmLayerId
            });
            c.add(cloned);
            c.renderAll();
            vmTriggerSave();
        });
    });

    // Auto-save on object modifications and capture undo state
    c.on('object:added', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); });
    c.on('object:modified', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); vmTriggerSave(); });
    c.on('object:removed', () => { if (!state.vmIsUndoRedoing) vmSaveCanvasState(); vmTriggerSave(); });
    c.on('text:changed', () => vmTriggerSave());
}

// --- Venue Map Undo/Redo ---

function vmSaveCanvasState() {
    const c = state.vmCanvas;
    if (!c || state.vmIsUndoRedoing) return;
    const json = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmUndoStack.push(json);
    if (state.vmUndoStack.length > 30) state.vmUndoStack.shift();
    state.vmRedoStack = [];
    vmUpdateUndoRedoButtons();
}

function vmUndo() {
    const c = state.vmCanvas;
    if (!c || state.vmUndoStack.length === 0) return;

    // Save current state to redo stack
    const current = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmRedoStack.push(current);

    const prev = state.vmUndoStack.pop();
    state.vmIsUndoRedoing = true;
    c.renderOnAddRemove = false;

    // Suppress ALL renders during async loadFromJSON reconstruction
    const origRenderAll = c.renderAll.bind(c);
    const origRequestRenderAll = c.requestRenderAll.bind(c);
    c.renderAll = function() {};
    c.requestRenderAll = function() {};

    c.loadFromJSON(prev, () => {
        // Restore render methods
        c.renderAll = origRenderAll;
        c.requestRenderAll = origRequestRenderAll;

        // Re-apply background image since loadFromJSON replaces it
        if (state.vmBgImage) {
            c.setBackgroundImage(
                new fabric.Image(state.vmBgImage, {
                    scaleX: state.vmBgScale,
                    scaleY: state.vmBgScale,
                    originX: 'left',
                    originY: 'top'
                }),
                () => {}
            );
        }
        c.renderOnAddRemove = true;
        c.renderAll();
        state.vmIsUndoRedoing = false;
        vmUpdateUndoRedoButtons();
        vmTriggerSave();
    });
}

function vmRedo() {
    const c = state.vmCanvas;
    if (!c || state.vmRedoStack.length === 0) return;

    // Save current state to undo stack
    const current = JSON.stringify(c.toJSON(['_vmLayerId', '_vmBackground']));
    state.vmUndoStack.push(current);

    const next = state.vmRedoStack.pop();
    state.vmIsUndoRedoing = true;
    c.renderOnAddRemove = false;

    // Suppress ALL renders during async loadFromJSON reconstruction
    const origRenderAll = c.renderAll.bind(c);
    const origRequestRenderAll = c.requestRenderAll.bind(c);
    c.renderAll = function() {};
    c.requestRenderAll = function() {};

    c.loadFromJSON(next, () => {
        // Restore render methods
        c.renderAll = origRenderAll;
        c.requestRenderAll = origRequestRenderAll;

        if (state.vmBgImage) {
            c.setBackgroundImage(
                new fabric.Image(state.vmBgImage, {
                    scaleX: state.vmBgScale,
                    scaleY: state.vmBgScale,
                    originX: 'left',
                    originY: 'top'
                }),
                () => {}
            );
        }
        c.renderOnAddRemove = true;
        c.renderAll();
        state.vmIsUndoRedoing = false;
        vmUpdateUndoRedoButtons();
        vmTriggerSave();
    });
}

function vmUpdateUndoRedoButtons() {
    const undoBtn = document.getElementById('vm-undo-btn');
    const redoBtn = document.getElementById('vm-redo-btn');
    if (undoBtn) undoBtn.disabled = state.vmUndoStack.length === 0;
    if (redoBtn) redoBtn.disabled = state.vmRedoStack.length === 0;
}

// --- Right-click context menu for z-order ---

function vmShowContextMenu(e) {
    const activeObj = state.vmCanvas && state.vmCanvas.getActiveObject();
    if (!activeObj) return;

    e.preventDefault();
    const menu = document.getElementById('vm-context-menu');
    menu.style.display = 'block';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function vmHideContextMenu() {
    const menu = document.getElementById('vm-context-menu');
    if (menu) menu.style.display = 'none';
}

function vmContextAction(action) {
    const obj = state.vmCanvas && state.vmCanvas.getActiveObject();
    if (!obj) return;

    vmSaveCanvasState();
    state.vmCanvas[action](obj);
    state.vmCanvas.renderAll();
    vmHideContextMenu();
    vmTriggerSave();
}

window.vmContextAction = vmContextAction;

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
             data-layer-id="${layer.id}" onclick="vmSelectLayer('${layer.id}')"
             draggable="true"
             ondragstart="vmLayerDragStart(event, '${layer.id}')"
             ondragover="vmLayerDragOver(event)"
             ondrop="vmLayerDrop(event, '${layer.id}')"
             ondragend="vmLayerDragEnd(event)">
            <div class="vm-layer-color" style="background:${layer.color}"></div>
            <span class="vm-layer-name" ondblclick="vmRenameLayer(event, '${layer.id}')">${layer.name}</span>
            <button class="vm-layer-visibility" onclick="vmToggleLayerVisibility(event, '${layer.id}')" title="${layer.visible ? 'Hide' : 'Show'}">
                ${layer.visible ? '&#128065;' : '&#128064;'}
            </button>
            <button class="vm-layer-delete" onclick="vmDeleteLayer(event, '${layer.id}')" title="Delete layer">&times;</button>
        </div>
    `).join('');
}

let vmDraggedLayerId = null;

function vmLayerDragStart(e, layerId) {
    vmDraggedLayerId = layerId;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('vm-layer-dragging');
}

function vmLayerDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget;
    const rect = item.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    item.classList.toggle('vm-layer-drop-above', e.clientY < midY);
    item.classList.toggle('vm-layer-drop-below', e.clientY >= midY);
}

function vmLayerDrop(e, targetLayerId) {
    e.preventDefault();
    if (!vmDraggedLayerId || vmDraggedLayerId === targetLayerId) return;

    const fromIdx = state.vmLayers.findIndex(l => l.id === vmDraggedLayerId);
    const toIdx = state.vmLayers.findIndex(l => l.id === targetLayerId);
    if (fromIdx === -1 || toIdx === -1) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dropAfter = e.clientY >= rect.top + rect.height / 2;

    const [moved] = state.vmLayers.splice(fromIdx, 1);
    const newIdx = state.vmLayers.findIndex(l => l.id === targetLayerId);
    state.vmLayers.splice(dropAfter ? newIdx + 1 : newIdx, 0, moved);

    vmRenderLayers();
    vmSaveLayers();
}

function vmLayerDragEnd(e) {
    vmDraggedLayerId = null;
    document.querySelectorAll('.vm-layer-item').forEach(el => {
        el.classList.remove('vm-layer-dragging', 'vm-layer-drop-above', 'vm-layer-drop-below');
    });
}

window.vmLayerDragStart = vmLayerDragStart;
window.vmLayerDragOver = vmLayerDragOver;
window.vmLayerDrop = vmLayerDrop;
window.vmLayerDragEnd = vmLayerDragEnd;

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

    // Export at original image resolution for full quality
    const origW = state.vmBgImage ? state.vmBgImage.naturalWidth : w;
    const origH = state.vmBgImage ? state.vmBgImage.naturalHeight : h;
    const exportScale = origW / w;

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

    // Direct export works only if the background was loaded with CORS
    if (state.vmBgCORS) {
        try {
            const dataURL = c.toDataURL({ format: 'png', multiplier: exportScale });
            restoreZoom();
            callback(dataURL);
            return;
        } catch (e) {
            // Unexpected — fall through to composite
        }
    }

    // Composite approach: export annotations separately, then layer onto a CORS background
    const hasAnnotations = c.getObjects().length > 0;
    let annotationDataURL = null;

    if (hasAnnotations) {
        const bg = c.backgroundImage;
        c.backgroundImage = null;
        c.renderAll();
        try {
            annotationDataURL = c.toDataURL({ format: 'png', multiplier: exportScale });
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
        offscreen.width = origW;
        offscreen.height = origH;
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(corsImg, 0, 0, origW, origH);

        if (annotationDataURL) {
            const annotImg = new Image();
            annotImg.onload = () => {
                ctx.drawImage(annotImg, 0, 0, origW, origH);
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
        body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .header { text-align: center; padding: 12px 0 14px; border-bottom: 2px solid #c9a961; margin-bottom: 10px; }
        .header h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 700; color: #0f2621; letter-spacing: 0.3px; }
        .header p { font-size: 12px; color: #888; margin-top: 2px; }
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
        <div style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:4px;font-size:12px;color:#2d2d2d;">${legendHTML}</div>
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
    c.calcOffset();
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
    const totalMembers = state.setLists.reduce((sum, sl) => sum + (sl.members || []).length, 0);

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('setlist-stat-total', total);
    setStat('setlist-stat-songs', totalSongs);
    setStat('setlist-stat-members', totalMembers);

    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }

    const isSearching = state.setListSearch && state.setListSearch.trim().length > 0;
    if (isSearching) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q)) ||
            (sl.members || []).some(m => (m.name || '').toLowerCase().includes(q) || (m.phone || '').toLowerCase().includes(q))
        );
    }

    // Update search count
    const countEl = document.getElementById('setlist-search-count');
    if (countEl) {
        countEl.textContent = isSearching ? `${items.length} of ${total} performers` : `${total} performers`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    const clearBtn = document.getElementById('setlist-search-clear');
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';

    items.sort((a, b) => (a.performer || '').localeCompare(b.performer || ''));

    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No performers added yet. Click "+ Add Performer" to get started.</div>';
        return;
    }

    if (items.length === 0) {
        container.innerHTML = `<div class="staff-empty-state">No performers match "${escapeHtml(state.setListSearch)}"</div>`;
        return;
    }

    const PERFORMER_DAY_LABEL = { thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

    container.innerHTML = '<div class="setlist-accordion">' + items.map((sl, idx) => {
        const songs = sl.songs || [];
        const members = sl.members || [];
        const arrivals = sl.arrivals || {};
        const overrides = sl.performanceOverrides || {};
        const derived = getDerivedPerformanceTimes(sl.performer);
        const stageLabel = sl.stage === 'main' ? 'Main Stage'
            : sl.stage === 'cocktail' ? 'Cocktail Stage'
            : '';
        const isExpanded = state.setListsExpanded.has(sl.id);
        const songListHtml = songs.map((s, i) =>
            `<div class="setlist-song-row" draggable="true" data-song-index="${i}">
                <span class="song-drag-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
                <span class="song-number">${i + 1}.</span>
                <span class="song-title">${escapeHtml(s.title)}</span>
                ${s.duration ? `<span class="song-duration">${escapeHtml(s.duration)}</span>` : ''}
                ${s.notes ? `<span class="song-notes">${escapeHtml(s.notes)}</span>` : ''}
            </div>`
        ).join('');

        const soundchecks = getDerivedSoundcheckTimes(sl.performer);
        const dayRowsHtml = PERFORMER_DAY_KEYS.map(day => {
            const arrival = arrivals[day] || '';
            const override = overrides[day] || '';
            const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const overrideFormatted = formatPerfOverride(override);
            const perfDisplay = overrideFormatted
                ? `${escapeHtml(overrideFormatted)} <span class="perf-manual-tag">(manual)</span>`
                : (derivedTimes.length ? derivedTimes.map(escapeHtml).join(', ') : '');
            const soundcheckDisplay = soundcheckTimes.length
                ? soundcheckTimes.map(escapeHtml).join(', ')
                : '';
            if (!arrival && !soundcheckDisplay && !perfDisplay) return '';
            return `
                <div class="performer-day-row">
                    <span class="performer-day-label">${PERFORMER_DAY_LABEL[day]}</span>
                    <span class="performer-day-field">${arrival ? `<span class="performer-field-label">Arrival</span> ${escapeHtml(arrival)}` : ''}</span>
                    <span class="performer-day-field">${soundcheckDisplay ? `<span class="performer-field-label">Soundcheck</span> ${soundcheckDisplay}` : ''}</span>
                    <span class="performer-day-field">${perfDisplay ? `<span class="performer-field-label">Perf</span> ${perfDisplay}` : ''}</span>
                </div>`;
        }).filter(Boolean).join('');

        const scheduleHtml = dayRowsHtml ? `<div class="performer-schedule">${dayRowsHtml}</div>` : '';

        const membersHtml = members.length > 0
            ? `<div class="performer-members">
                    <div class="performer-section-title">Members (${members.length})</div>
                    <div class="performer-members-list">
                        ${members.map(m => `
                            <div class="performer-member-row">
                                <span class="member-name">${escapeHtml(m.name || '')}</span>
                                ${m.phone ? `<a class="member-phone" href="tel:${escapeHtml((m.phone || '').replace(/\s|-/g, ''))}">${escapeHtml(m.phone)}</a>` : ''}
                            </div>`).join('')}
                    </div>
                </div>`
            : '';

        const hasSongs = songs.length > 0;
        const songSection = (hasSongs || sl.generalNotes || sl.stagePlotUrl)
            ? `<div class="performer-setlist-section">
                    ${hasSongs ? `<div class="performer-section-title">Set List (${songs.length} song${songs.length !== 1 ? 's' : ''}${sl.estimatedDuration ? ' \u00b7 ' + escapeHtml(sl.estimatedDuration) : ''})</div>
                        <div class="setlist-songs-list" data-setlist-id="${sl.id}">${songListHtml}</div>` : ''}
                    ${sl.generalNotes ? `<div class="setlist-notes">${escapeHtml(sl.generalNotes)}</div>` : ''}
                    ${sl.stagePlotUrl ? `<div class="setlist-stage-plot-link"><a href="${escapeHtml(sl.stagePlotUrl)}" target="_blank" class="btn btn-sm btn-secondary">View Stage Plot</a></div>` : ''}
               </div>`
            : '';

        const headerMeta = [
            members.length ? `${members.length} member${members.length !== 1 ? 's' : ''}` : '',
            songs.length ? `${songs.length} song${songs.length !== 1 ? 's' : ''}` : ''
        ].filter(Boolean).join(' \u00b7 ');

        return `
        <div class="setlist-accordion-item ${isExpanded ? 'expanded' : ''}" data-setlist-id="${sl.id}" style="animation-delay: ${idx * 40}ms">
            <div class="setlist-accordion-header" onclick="toggleSetListSongs('${sl.id}')">
                <span class="setlist-toggle-icon" id="setlist-toggle-icon-${sl.id}">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                <span class="setlist-performer">${escapeHtml(sl.performer || '')}</span>
                ${stageLabel ? `<span class="setlist-stage-badge stage-${sl.stage}">${stageLabel}</span>` : ''}
                <span class="setlist-song-count">${headerMeta}</span>
                <span class="setlist-header-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-edit btn-sm" onclick="openSetListModal('${sl.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSetList('${sl.id}')">Delete</button>
                </span>
            </div>
            <div class="setlist-accordion-body" id="setlist-songs-${sl.id}" style="display:${isExpanded ? '' : 'none'}">
                ${scheduleHtml}
                ${membersHtml}
                ${songSection}
            </div>
        </div>`;
    }).join('') + '</div>';

    attachSetListSongDragHandlers(container);
}

// Drag-to-reorder for songs within a set list (one-time delegation on container).
function attachSetListSongDragHandlers(container) {
    if (container.dataset.dragWired === '1') return;
    container.dataset.dragWired = '1';

    let dragFromIndex = null;
    let dragList = null;

    container.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.setlist-song-row');
        if (!row) return;
        dragList = row.parentElement;
        dragFromIndex = parseInt(row.dataset.songIndex, 10);
        row.classList.add('song-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragFromIndex)); } catch (_) { /* some browsers require this */ }
    });

    container.addEventListener('dragover', (e) => {
        if (!dragList) return;
        const row = e.target.closest('.setlist-song-row');
        if (!row || row.parentElement !== dragList) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragList.querySelectorAll('.song-drop-above, .song-drop-below').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below');
        });
        const rect = row.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        row.classList.add(above ? 'song-drop-above' : 'song-drop-below');
    });

    container.addEventListener('dragleave', (e) => {
        const row = e.target.closest('.setlist-song-row');
        if (row) row.classList.remove('song-drop-above', 'song-drop-below');
    });

    container.addEventListener('drop', async (e) => {
        if (!dragList || dragFromIndex === null) return;
        const targetRow = e.target.closest('.setlist-song-row');
        if (!targetRow || targetRow.parentElement !== dragList) return;
        e.preventDefault();
        const rect = targetRow.getBoundingClientRect();
        const above = (e.clientY - rect.top) < rect.height / 2;
        let toIndex = parseInt(targetRow.dataset.songIndex, 10);
        if (!above) toIndex += 1;
        // Adjust for removing the dragged item first
        if (toIndex > dragFromIndex) toIndex -= 1;

        const setlistId = dragList.dataset.setlistId;
        const from = dragFromIndex;
        dragFromIndex = null;
        dragList.querySelectorAll('.song-drop-above, .song-drop-below, .song-dragging').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below', 'song-dragging');
        });
        dragList = null;

        if (toIndex === from) return;
        await reorderSetListSong(setlistId, from, toIndex);
    });

    container.addEventListener('dragend', () => {
        container.querySelectorAll('.song-drop-above, .song-drop-below, .song-dragging').forEach(el => {
            el.classList.remove('song-drop-above', 'song-drop-below', 'song-dragging');
        });
        dragFromIndex = null;
        dragList = null;
    });
}

async function reorderSetListSong(setlistId, fromIndex, toIndex) {
    const sl = state.setLists.find(s => s.id === setlistId);
    if (!sl) return;
    const songs = [...(sl.songs || [])];
    if (fromIndex < 0 || fromIndex >= songs.length) return;
    if (toIndex < 0 || toIndex > songs.length) return;
    const [moved] = songs.splice(fromIndex, 1);
    songs.splice(toIndex, 0, moved);

    // Optimistic local update so the re-render shows the new order immediately.
    sl.songs = songs;
    state.setListsExpanded.add(setlistId);
    renderSetLists();

    try {
        await collections.setLists.doc(setlistId).update({
            songs,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error reordering songs:', err);
        showToast('Error saving song order', 'error');
    }
}

// Stash for the pending print job between modal open and confirm
let _pendingPrintSetLists = null;

function printSetLists() {
    // Use the same filter the user has applied on the page
    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }
    if (state.setListSearch && state.setListSearch.trim().length > 0) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q))
        );
    }

    if (items.length === 0) {
        showToast('No set lists to print', 'error');
        return;
    }

    // Sort: Main Stage first, then Cocktail, alphabetical by performer within each
    items.sort((a, b) => {
        if (a.stage !== b.stage) return a.stage === 'main' ? -1 : 1;
        return (a.performer || '').localeCompare(b.performer || '');
    });

    openPrintCopiesModal(items);
}

function openPrintCopiesModal(items) {
    _pendingPrintSetLists = items;
    const listEl = document.getElementById('print-copies-list');
    if (!listEl) return;
    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;');
    listEl.innerHTML = items.map(sl => {
        const name = sl.performer || 'UNNAMED';
        const stageLabel = sl.stage === 'main' ? 'Main' : 'Cocktail';
        return `
            <div class="copies-row">
                <div class="copies-row-label">
                    <span class="copies-row-stage">${escAttr(stageLabel)}</span>
                    <span class="copies-row-name">${escAttr(name)}</span>
                </div>
                <input type="number" min="0" max="50" value="1" data-id="${escAttr(sl.id)}" class="copies-input" aria-label="Copies for ${escAttr(name)}">
            </div>`;
    }).join('');
    const modal = document.getElementById('print-copies-modal');
    if (modal) modal.classList.add('active');
}

function closePrintCopiesModal() {
    const modal = document.getElementById('print-copies-modal');
    if (modal) modal.classList.remove('active');
    _pendingPrintSetLists = null;
}

function setAllPrintCopies(n) {
    document.querySelectorAll('#print-copies-list .copies-input').forEach(i => {
        i.value = String(n);
    });
}

function confirmPrintCopies() {
    const items = _pendingPrintSetLists;
    if (!items) return;
    const copiesById = {};
    document.querySelectorAll('#print-copies-list .copies-input').forEach(i => {
        const n = parseInt(i.value, 10);
        copiesById[i.dataset.id] = Number.isFinite(n) && n >= 0 ? n : 1;
    });
    closePrintCopiesModal();
    generateSetListPrintWindow(items, copiesById);
}

function generateSetListPrintWindow(items, copiesById) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // Wrap parenthetical groups in nowrap spans so "(SET 1)" etc. don't break
    const formatPerformer = (name) => {
        return esc(name || 'UNNAMED').toUpperCase()
            .replace(/\(([^)]+)\)/g, '<span style="white-space:nowrap">($1)</span>');
    };

    // Filter out bands with 0 copies so nothing prints for them
    const toPrint = items.filter(sl => (copiesById[sl.id] ?? 1) > 0);
    if (toPrint.length === 0) {
        showToast('No copies requested', 'error');
        return;
    }

    const pagesHtml = toPrint.flatMap(sl => {
        const songs = sl.songs || [];
        const stageLabel = sl.stage === 'main' ? 'Main Stage' : 'Cocktail Stage';
        const count = songs.length;

        const songsHtml = songs.length > 0
            ? songs.map(s => `
                    <tr class="song-row">
                        <td class="song-title">${esc(s.title)}</td>
                    </tr>`).join('')
            : '<tr><td class="no-songs">NO SONGS LISTED</td></tr>';

        const sectionHtml = `
            <section class="setlist-page">
                <header class="setlist-header">
                    <div class="stage-badge">${esc(stageLabel).toUpperCase()}</div>
                    <h1 class="performer-name">${formatPerformer(sl.performer)}</h1>
                    <div class="meta">
                        <span>${count} SONG${count !== 1 ? 'S' : ''}</span>
                        ${sl.estimatedDuration ? `<span class="dot">•</span><span>${esc(sl.estimatedDuration).toUpperCase()}</span>` : ''}
                    </div>
                </header>
                <div class="song-list-wrap">
                    <table class="song-list"><tbody>${songsHtml}</tbody></table>
                </div>
                ${sl.generalNotes ? `<footer class="setlist-notes">${esc(sl.generalNotes).toUpperCase()}</footer>` : ''}
            </section>`;
        const copies = copiesById[sl.id] ?? 1;
        return Array(copies).fill(sectionHtml);
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Set Lists — YMU Gala 2026</title>
<style>
    @page {
        size: letter portrait;
        margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #000;
        font-family: 'Impact', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        /* Force layout to always use exact 816px (8.5in @ 96dpi) width so the
           fit calculations match the print paper size regardless of browser viewport */
        width: 816px;
        min-width: 816px;
    }
    .setlist-page {
        /* Exact portrait letter dimensions. Identical for screen and print. */
        width: 816px;
        height: 1056px;
        /* Generous top/bottom padding leaves room for any browser-added
           print headers/footers so content never gets clipped. */
        padding: 72px 58px; /* 0.75in x 0.6in at 96dpi */
        page-break-after: always;
        break-after: page;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        overflow: hidden;
    }
    .setlist-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .setlist-header {
        width: 100%;
        border-bottom: 6px solid #000;
        padding-bottom: 0.15in;
        margin-bottom: 0.15in;
        flex-shrink: 0;
    }
    .stage-badge {
        display: inline-block;
        font-size: 16pt;
        letter-spacing: 0.25em;
        font-weight: 900;
        padding: 3px 14px;
        border: 3px solid #000;
        margin-bottom: 6px;
    }
    .performer-name {
        font-size: 46pt;
        line-height: 0.95;
        margin: 2px 0 4px;
        font-weight: 900;
        letter-spacing: 0.01em;
        text-transform: uppercase;
    }
    .meta {
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.15em;
    }
    .meta .dot { margin: 0 8px; }
    .song-list-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        overflow: hidden;
    }
    .song-list {
        /* Table layout gives us vertically-aligned number and title columns.
           The whole table is auto-centered as a single block. */
        margin: 0 auto;
        border-collapse: collapse;
        max-width: 100%;
    }
    .song-row { }
    .song-title {
        vertical-align: baseline;
        font-weight: 900;
        line-height: 1.05;
        padding: 0.08em 0;
        text-transform: uppercase;
        text-align: center;
        white-space: nowrap;
    }
    .no-songs {
        font-size: 48pt;
        font-weight: 900;
        color: #999;
        text-align: center;
        padding: 1in 0;
    }
    .setlist-notes {
        margin-top: 0.15in;
        padding-top: 0.12in;
        border-top: 3px solid #000;
        font-size: 12pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        width: 100%;
        flex-shrink: 0;
    }
    @media screen {
        body { background: #333; padding: 20px 0; }
        .setlist-page {
            background: #fff;
            box-shadow: 0 8px 40px rgba(0,0,0,0.4);
            margin: 0 auto 20px;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        // Math-based fit: measure at reference size, compute scale, snap to target.
        function setRowFontSize(row, px) {
            row.style.fontSize = px + 'px';
        }
        function fitPages() {
            document.querySelectorAll('.setlist-page').forEach(page => {
                const header = page.querySelector('.setlist-header');
                const wrap = page.querySelector('.song-list-wrap');
                const list = page.querySelector('.song-list');
                const perf = page.querySelector('.performer-name');
                if (!list || !wrap) return;
                const rows = [...list.querySelectorAll('.song-row')];
                if (rows.length === 0) return;

                // 1) Shrink performer name if header too tall (long band names wrap)
                let perfSize = parseFloat(getComputedStyle(perf).fontSize);
                let guard = 60;
                const maxHeaderH = 280; // ~2.9in budget for header
                while (header.offsetHeight > maxHeaderH && perfSize > 20 && guard-- > 0) {
                    perfSize -= 2;
                    perf.style.fontSize = perfSize + 'px';
                }

                // 2) Measure song list at a reference font size
                const REF = 40;
                rows.forEach(r => setRowFontSize(r, REF));
                // Force reflow
                void list.offsetHeight;
                const refH = list.offsetHeight;
                const refW = list.offsetWidth;
                if (refH === 0 || refW === 0) return;

                // 3) Compute ideal scale to fit both dimensions
                const availH = wrap.clientHeight - 10;
                const availW = wrap.clientWidth - 20;
                const scale = Math.min(availH / refH, availW / refW);
                // Apply a 0.96 safety factor and cap maximum so single-song
                // pages don't get absurdly huge.
                let songSize = Math.floor(REF * scale * 0.96);
                songSize = Math.max(12, Math.min(songSize, 260));
                rows.forEach(r => setRowFontSize(r, songSize));

                // 4) Fine-tune: small corrections if slightly off after scale
                guard = 40;
                while ((list.offsetHeight > availH || list.offsetWidth > availW) && songSize > 12 && guard-- > 0) {
                    songSize -= 2;
                    rows.forEach(r => setRowFontSize(r, songSize));
                }
            });
        }
        function runFitAndPrint() {
            fitPages();
            // Run twice — first pass may change layout; second pass re-fits if needed
            fitPages();
            setTimeout(() => { window.print(); }, 250);
        }
        if (document.readyState === 'complete') {
            runFitAndPrint();
        } else {
            window.addEventListener('load', runFitAndPrint);
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print set lists', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.printSetLists = printSetLists;
window.openPrintCopiesModal = openPrintCopiesModal;
window.closePrintCopiesModal = closePrintCopiesModal;
window.setAllPrintCopies = setAllPrintCopies;
window.confirmPrintCopies = confirmPrintCopies;

// =============================================
// PERFORMER CONTACT SHEET PRINT (new-window)
// =============================================

function printPerformerContactSheets() {
    let items = [...state.setLists];
    if (state.setListStageFilter !== 'all') {
        items = items.filter(sl => sl.stage === state.setListStageFilter);
    }
    if (state.setListSearch && state.setListSearch.trim().length > 0) {
        const q = state.setListSearch.toLowerCase();
        items = items.filter(sl =>
            (sl.performer || '').toLowerCase().includes(q) ||
            (sl.songs || []).some(s => (s.title || '').toLowerCase().includes(q)) ||
            (sl.members || []).some(m => (m.name || '').toLowerCase().includes(q) || (m.phone || '').toLowerCase().includes(q))
        );
    }
    if (items.length === 0) {
        showToast('No performers to print', 'error');
        return;
    }
    items.sort((a, b) => (a.performer || '').localeCompare(b.performer || ''));
    generatePerformerContactWindow(items);
}

function generatePerformerContactWindow(items) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const dayOrder = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = { thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
    const today = new Date().toISOString().split('T')[0];
    const total = items.length;

    const pagesHtml = items.map((sl, idx) => {
        const members = sl.members || [];
        const arrivals = sl.arrivals || {};
        const overrides = sl.performanceOverrides || {};
        const derived = getDerivedPerformanceTimes(sl.performer);
        const stageLabel = sl.stage === 'main' ? 'Main Stage'
            : sl.stage === 'cocktail' ? 'Cocktail Stage'
            : '';

        const soundchecks = getDerivedSoundcheckTimes(sl.performer);
        const scheduleRows = dayOrder.map(day => {
            const arrival = arrivals[day] || '';
            const override = overrides[day] || '';
            const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
            const perf = formatPerfOverride(override) || derivedTimes.join(', ');
            const soundcheck = soundcheckTimes.join(', ');
            if (!arrival && !perf && !soundcheck) return '';
            return `
                <tr>
                    <td class="day">${dayLabels[day]}</td>
                    <td>${esc(arrival)}</td>
                    <td>${esc(soundcheck)}</td>
                    <td>${esc(perf)}</td>
                </tr>`;
        }).filter(Boolean).join('');

        const scheduleSection = scheduleRows
            ? `<table class="schedule-table">
                   <thead><tr><th>Day</th><th>Arrival</th><th>Soundcheck</th><th>Performance</th></tr></thead>
                   <tbody>${scheduleRows}</tbody>
               </table>`
            : '<p class="empty-note">No schedule recorded.</p>';

        const membersSection = members.length > 0
            ? `<table class="members-table">
                   <thead><tr><th>Name</th><th>Phone</th></tr></thead>
                   <tbody>
                       ${members.map(m => `
                           <tr>
                               <td>${esc(m.name || '')}</td>
                               <td class="phone">${esc(m.phone || '')}</td>
                           </tr>`).join('')}
                   </tbody>
               </table>`
            : '<p class="empty-note">No members listed.</p>';

        return `
            <section class="contact-page">
                <header class="contact-header">
                    <h1 class="contact-name">${esc(sl.performer || 'Unnamed')}</h1>
                    ${stageLabel ? `<span class="contact-stage">${esc(stageLabel)}</span>` : ''}
                </header>
                <div class="contact-section">
                    <h2>Schedule</h2>
                    ${scheduleSection}
                </div>
                <div class="contact-section">
                    <h2>Members</h2>
                    ${membersSection}
                </div>
                <footer class="contact-footer">Page ${idx + 1} of ${total} · Printed ${today}</footer>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Performer Contact Sheets — YMU Gala 2026</title>
<style>
    @page { size: letter portrait; margin: 0.45in; }
    * { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #2d2d2d;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .contact-page {
        page-break-after: always;
        break-after: page;
        padding: 0;
    }
    .contact-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .contact-header {
        border-bottom: 2px solid #c9a961;
        padding-bottom: 14px;
        margin-bottom: 22px;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
    }
    .contact-name {
        margin: 0;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 32pt;
        font-weight: 700;
        letter-spacing: 0.01em;
        line-height: 1.05;
        color: #0f2621;
    }
    .contact-stage {
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #0f2621;
        border: 2px solid #0f2621;
        padding: 4px 10px;
        border-radius: 4px;
    }
    .contact-section {
        margin-bottom: 28px;
    }
    .contact-section h2 {
        font-size: 10pt;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #888;
        margin: 0 0 10px;
        border-bottom: 1px solid #e5e1d6;
        padding-bottom: 4px;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11pt;
    }
    th, td {
        padding: 6px 10px;
        border-bottom: 1px solid #e5e1d6;
        text-align: left;
        vertical-align: top;
    }
    thead th {
        background: #fff;
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #0f2621;
        border-bottom: 2px solid #0f2621;
    }
    tbody tr:nth-child(even) td {
        background: #faf8f3;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .schedule-table .day {
        width: 60px;
        font-weight: 700;
        text-transform: uppercase;
    }
    .members-table td.phone {
        font-variant-numeric: tabular-nums;
        width: 180px;
        white-space: nowrap;
    }
    .empty-note {
        color: #888;
        font-style: italic;
        margin: 0;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .contact-footer {
        position: absolute;
        bottom: 0.2in;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 8pt;
        color: #888;
        letter-spacing: 0.05em;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .contact-page {
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 40px;
            margin: 0 auto 20px;
            max-width: 7.5in;
            min-height: 10in;
            position: relative;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print contact sheets', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.printPerformerContactSheets = printPerformerContactSheets;

// =============================================
// STAFF PRINT (team-scoped, new-window)
// =============================================

function openPrintStaffTeamsModal() {
    const listEl = document.getElementById('print-staff-teams-list');
    if (!listEl) return;

    // Collect unique teams from state.staff (use 'Unassigned' for empty teams array)
    const teamCounts = new Map();
    for (const m of state.staff) {
        const teams = (m.teams && m.teams.length > 0) ? m.teams : ['Unassigned'];
        for (const t of teams) {
            teamCounts.set(t, (teamCounts.get(t) || 0) + 1);
        }
    }

    if (teamCounts.size === 0) {
        showToast('No staff to print', 'error');
        return;
    }

    const sortedTeams = [...teamCounts.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    const escAttr = (s) => String(s || '').replace(/"/g, '&quot;');
    listEl.innerHTML = sortedTeams.map(team => {
        const color = getTeamColor(team);
        const count = teamCounts.get(team);
        return `
            <label class="copies-row staff-team-row">
                <div class="copies-row-label">
                    <input type="checkbox" class="staff-team-check" data-team="${escAttr(team)}" checked>
                    <span class="staff-team-swatch" style="background:${color}"></span>
                    <span class="copies-row-name">${escapeHtml(team)}</span>
                    <span class="staff-team-count">(${count})</span>
                </div>
            </label>`;
    }).join('');

    const modal = document.getElementById('print-staff-teams-modal');
    if (modal) modal.classList.add('active');
}

function closePrintStaffTeamsModal() {
    const modal = document.getElementById('print-staff-teams-modal');
    if (modal) modal.classList.remove('active');
}

function setAllPrintStaffTeams(checked) {
    document.querySelectorAll('#print-staff-teams-list .staff-team-check').forEach(cb => {
        cb.checked = !!checked;
    });
}

function confirmPrintStaffTeams() {
    const selected = [];
    document.querySelectorAll('#print-staff-teams-list .staff-team-check:checked').forEach(cb => {
        selected.push(cb.dataset.team);
    });
    if (selected.length === 0) {
        showToast('Select at least one team to print', 'error');
        return;
    }
    closePrintStaffTeamsModal();
    generateStaffPrintWindow(selected);
}

function generateStaffPrintWindow(selectedTeams) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const selectedSet = new Set(selectedTeams);

    // Expand staff into {team, member} rows, filter to selected, then group
    const byTeam = new Map();
    for (const m of state.staff) {
        const teams = (m.teams && m.teams.length > 0) ? m.teams : ['Unassigned'];
        for (const t of teams) {
            if (!selectedSet.has(t)) continue;
            if (!byTeam.has(t)) byTeam.set(t, []);
            byTeam.get(t).push(m);
        }
    }

    // Drop empty teams (no staff after filtering — shouldn't happen here but guard anyway)
    const teamOrder = [...byTeam.keys()]
        .filter(t => byTeam.get(t).length > 0)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (teamOrder.length === 0) {
        showToast('No staff to print in selected teams', 'error');
        return;
    }

    const totalPages = teamOrder.length;
    const printedDate = new Date().toISOString().split('T')[0];

    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Thursday', 'Friday', 'Saturday', 'Sunday'];

    const pagesHtml = teamOrder.map((team, idx) => {
        const color = getTeamColor(team);
        const members = byTeam.get(team).slice().sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );

        const rowsHtml = members.map(m => {
            const otherTeams = (m.teams || []).filter(t => t !== team).join(', ');
            const sched = m.schedule || {};
            const dayCells = dayKeys.map(d => {
                const val = sched[d];
                return val
                    ? `<td class="sched">${esc(val)}</td>`
                    : `<td class="sched empty">—</td>`;
            }).join('');
            return `
                <tr>
                    <td class="name">${esc(m.name || '')}</td>
                    <td class="role">${esc(m.role || '')}</td>
                    <td class="other-teams">${esc(otherTeams)}</td>
                    ${dayCells}
                </tr>`;
        }).join('');

        return `
            <section class="team-page">
                <header class="team-banner" style="border-left-color:${color}">
                    <h1 class="team-name" style="color:${color}">${esc(team)}</h1>
                    <div class="team-meta">${members.length} STAFF · YMU GALA 2026</div>
                </header>
                <table class="staff-table">
                    <thead>
                        <tr>
                            <th class="name">Name</th>
                            <th class="role">Role</th>
                            <th class="other-teams">Other Teams</th>
                            ${dayLabels.map(d => `<th class="sched">${d}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <footer class="page-footer">Page ${idx + 1} of ${totalPages} · Printed ${printedDate}</footer>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Staff List — YMU Gala 2026</title>
<style>
    @page {
        size: letter landscape;
        margin: 0.4in;
    }
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #2d2d2d;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .team-page {
        page-break-after: always;
        break-after: page;
        padding: 0;
    }
    .team-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }
    .team-banner {
        background: #fff;
        border-left: 6px solid #0f2621;
        border-bottom: 2px solid #e5e1d6;
        padding: 10px 0 14px 16px;
        margin-bottom: 14px;
    }
    .team-name {
        margin: 0;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 26pt;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-transform: uppercase;
        line-height: 1.05;
    }
    .team-meta {
        margin-top: 4px;
        font-size: 9pt;
        font-weight: 600;
        letter-spacing: 0.15em;
        color: #888;
    }
    .staff-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9.5pt;
    }
    .staff-table thead th {
        text-align: left;
        padding: 6px 8px;
        background: #fff;
        border-bottom: 2px solid #0f2621;
        font-size: 8pt;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 700;
        color: #0f2621;
    }
    .staff-table tbody td {
        padding: 5px 8px;
        border-bottom: 1px solid #e5e1d6;
        vertical-align: top;
    }
    .staff-table tbody tr:nth-child(even) td {
        background: #faf8f3;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .staff-table th.name, .staff-table td.name {
        width: 1.5in;
        font-weight: 600;
    }
    .staff-table th.role, .staff-table td.role {
        width: 1.8in;
    }
    .staff-table th.other-teams, .staff-table td.other-teams {
        width: 1.5in;
        color: #888;
        font-size: 8.5pt;
    }
    .staff-table th.sched, .staff-table td.sched {
        width: 1.3in;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
    .staff-table td.sched.empty {
        color: transparent;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .page-footer {
        margin-top: 12px;
        text-align: center;
        font-size: 8pt;
        color: #888;
        letter-spacing: 0.05em;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .team-page {
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 32px;
            margin: 0 auto 20px;
            max-width: 10in;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print staff list', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.openPrintStaffTeamsModal = openPrintStaffTeamsModal;
window.closePrintStaffTeamsModal = closePrintStaffTeamsModal;
window.setAllPrintStaffTeams = setAllPrintStaffTeams;
window.confirmPrintStaffTeams = confirmPrintStaffTeams;

// --- Check-In List (staff + on-site vendors) ---
const CHECKIN_DAY_KEYS = ['thursday', 'friday', 'saturday', 'sunday'];
const CHECKIN_DAY_LABELS = { thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const CHECKIN_DAY_COLORS = { thursday: '#4a90a4', friday: '#7b6cb0', saturday: '#d4795c', sunday: '#4aaa7a' };

function hasAnySchedule(sched) {
    if (!sched) return false;
    return CHECKIN_DAY_KEYS.some(d => sched[d]);
}

function buildCheckInPeople() {
    const people = [];

    for (const m of state.staff) {
        const linked = getLinkedBudget(m);
        const team = (m.teams && m.teams.length > 0) ? m.teams[0] : 'Staff';
        const displayName = m.name || m.role || 'TBD';
        people.push({
            id: 's_' + m.id,
            name: displayName,
            role: m.role || '',
            team,
            schedule: m.schedule || {},
            phone: m.phone || (linked && linked.phone) || '',
            email: m.email || (linked && linked.email) || '',
            source: 'staff',
            isPlaceholder: !!m.isPlaceholder
        });
    }

    for (const b of state.budget) {
        if (b.linkedStaffId) continue; // represented by the linked staff entry
        if (b.offSite === true) continue; // hidden from check-in list
        if (!hasAnySchedule(b.schedule)) continue;
        const hasContact = !!(b.contact && b.contact.trim());
        people.push({
            id: 'b_' + b.id,
            name: hasContact ? b.contact : (b.vendor || 'Unnamed vendor'),
            role: hasContact ? (b.vendor || '') : (b.description || ''),
            team: 'Vendor',
            schedule: b.schedule || {},
            phone: b.phone || '',
            email: b.email || '',
            source: 'vendor',
            isPlaceholder: false
        });
    }

    return people.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}

function openPrintCheckInModal() {
    const listEl = document.getElementById('print-checkin-days-list');
    if (!listEl) return;

    const people = buildCheckInPeople();
    const counts = {};
    for (const d of CHECKIN_DAY_KEYS) {
        counts[d] = people.filter(p => p.schedule[d]).length;
    }

    listEl.innerHTML = CHECKIN_DAY_KEYS.map(d => `
        <label class="copies-row staff-team-row">
            <div class="copies-row-label">
                <input type="checkbox" class="checkin-day-check" data-day="${d}" checked>
                <span class="staff-team-swatch" style="background:${CHECKIN_DAY_COLORS[d]}"></span>
                <span class="copies-row-name">${CHECKIN_DAY_LABELS[d]}</span>
                <span class="staff-team-count">(${counts[d]})</span>
            </div>
        </label>`).join('');

    // Surface people with no schedule at all — they won't appear on any printed day.
    const unscheduled = people.filter(p => !CHECKIN_DAY_KEYS.some(d => p.schedule[d]));
    let hintEl = document.getElementById('print-checkin-unscheduled-hint');
    if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.id = 'print-checkin-unscheduled-hint';
        hintEl.className = 'form-helper';
        hintEl.style.marginTop = '12px';
        listEl.parentNode.insertBefore(hintEl, listEl.nextSibling);
    }
    if (unscheduled.length > 0) {
        const staffCount = unscheduled.filter(p => p.source === 'staff').length;
        const vendorCount = unscheduled.length - staffCount;
        const parts = [];
        if (staffCount) parts.push(staffCount + ' staff');
        if (vendorCount) parts.push(vendorCount + ' vendor' + (vendorCount === 1 ? '' : 's'));
        hintEl.innerHTML = '⚠ ' + parts.join(' and ') + ' have no schedule on any day and won\'t appear on the printout. Open them to set Thu/Fri/Sat/Sun times.';
        hintEl.style.display = '';
    } else {
        hintEl.style.display = 'none';
    }

    const modal = document.getElementById('print-checkin-modal');
    if (modal) modal.classList.add('active');
}

function closePrintCheckInModal() {
    const modal = document.getElementById('print-checkin-modal');
    if (modal) modal.classList.remove('active');
}

function confirmPrintCheckInList() {
    const selected = [];
    document.querySelectorAll('#print-checkin-days-list .checkin-day-check:checked').forEach(cb => {
        selected.push(cb.dataset.day);
    });
    if (selected.length === 0) {
        showToast('Select at least one day', 'error');
        return;
    }
    closePrintCheckInModal();
    generateCheckInPrintWindow(selected);
}

function abbreviateTeam(team) {
    if (!team) return '';
    let t = String(team).trim().replace(/\s+team\s*$/i, '');
    if (/^mainstage production$/i.test(t)) t = 'Mainstage';
    return t;
}

function formatCheckInHours(h) {
    // h = decimal hours, may exceed 24 for past-midnight ranges. Collapse to 12-hour label.
    let hh = ((Math.floor(h) % 24) + 24) % 24;
    let mm = Math.round((h - Math.floor(h)) * 60);
    if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
    const ampm = hh >= 12 ? 'pm' : 'am';
    const display = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
    return display + (mm === 0 ? '' : ':' + String(mm).padStart(2, '0')) + ampm;
}

function normalizeTimeForPrint(raw) {
    if (!raw) return '';
    // Accept semicolon-for-colon typos and double-seconds forms like "10:30:00 PM"
    let cleaned = String(raw)
        .replace(/;/g, ':')
        .replace(/(\d{1,2}:\d{2}):\d{2}\b/g, '$1'); // strip trailing :SS

    // Split on "/" for multi-range schedules (e.g. "1-5pm / 10:30pm - 2:30am")
    const parts = cleaned.split('/').map(p => p.trim()).filter(Boolean);
    const formatted = [];
    // Detect am/pm anywhere — just look for 'a' or 'p' adjacent to digits or at word boundary
    const hasAmPm = s => /[ap]m?\b/i.test(s);

    for (const part of parts) {
        const halves = part.split(/\s*[-–—]\s*/);
        if (halves.length !== 2) { formatted.push(part); continue; }
        let [startStr, endStr] = halves.map(h => h.trim());
        // If start lacks am/pm but end has it, inherit — "1-5pm" → "1pm-5pm"
        if (!hasAmPm(startStr) && hasAmPm(endStr)) {
            const suffix = /p/i.test(endStr) ? 'pm' : 'am';
            startStr = startStr + suffix;
        }
        const start = parseStaffTime(startStr);
        let end = parseStaffTime(endStr);
        if (start === null || end === null) { formatted.push(part); continue; }
        if (end <= start) end += 24;
        formatted.push(formatCheckInHours(start) + '–' + formatCheckInHours(end));
    }
    return formatted.join(' / ');
}

function normalizePhoneForPrint(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) {
        return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
    }
    if (digits.length === 11 && digits[0] === '1') {
        return '(' + digits.slice(1,4) + ') ' + digits.slice(4,7) + '-' + digits.slice(7);
    }
    // Not a recognizable phone — suppress obvious junk (e.g. names in the phone field)
    if (digits.length < 7) return '';
    return String(raw).trim();
}

function generateCheckInPrintWindow(days) {
    const esc = (s) => String(s || '').replace(/[&<>"']/g,
        c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const dash = '<span class="empty">—</span>';
    const printedDate = new Date().toISOString().split('T')[0];

    const people = buildCheckInPeople();

    const pagesHtml = days.map(day => {
        const color = CHECKIN_DAY_COLORS[day];
        const label = CHECKIN_DAY_LABELS[day];
        const dayPeople = people
            .filter(p => p.schedule[day])
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

        if (dayPeople.length === 0) {
            return `
                <section class="team-page">
                    <header class="team-banner" style="border-left-color:${color}">
                        <h1 class="team-name" style="color:${color}">${esc(label)} Check-In</h1>
                        <div class="team-meta">0 PEOPLE · YMU GALA 2026 · PRINTED ${printedDate}</div>
                    </header>
                    <div class="empty-day">No one scheduled for ${esc(label)}.</div>
                </section>`;
        }

        const rows = dayPeople.map(p => {
            const phone = normalizePhoneForPrint(p.phone);
            const email = (p.email || '').trim();
            const time = normalizeTimeForPrint(p.schedule[day]);
            const nameCell = p.isPlaceholder
                ? `<span class="tbd-tag">TBD</span> ${esc(p.name)}`
                : esc(p.name);
            return `
                <tr class="${p.isPlaceholder ? 'placeholder-row' : ''}">
                    <td class="check"><span class="checkbox-cell"></span></td>
                    <td class="name">${nameCell}</td>
                    <td class="role">${esc(p.role)}</td>
                    <td class="team">${esc(abbreviateTeam(p.team))}</td>
                    <td class="sched">${esc(time)}</td>
                    <td class="phone">${phone ? esc(phone) : dash}</td>
                    <td class="email">${email ? esc(email) : dash}</td>
                </tr>`;
        }).join('');

        return `
            <section class="team-page">
                <table class="staff-table">
                    <thead>
                        <tr class="running-header">
                            <th colspan="7" class="running-banner" style="border-left-color:${color}">
                                <span class="rb-title" style="color:${color}">${esc(label)} Check-In</span>
                                <span class="rb-meta">${dayPeople.length} people · YMU Gala 2026 · Printed ${printedDate}</span>
                            </th>
                        </tr>
                        <tr class="col-headers">
                            <th class="check"></th>
                            <th class="name">Name</th>
                            <th class="role">Role / Company</th>
                            <th class="team">Team</th>
                            <th class="sched">Time</th>
                            <th class="phone">Phone</th>
                            <th class="email">Email</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Check-In List — YMU Gala 2026</title>
<style>
    /* margin:0 on @page suppresses browser-injected header/footer (date, URL, "about:blank", page numbers). Our own padding lives on the section. */
    @page { size: letter landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0; background: #fff; color: #2d2d2d;
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .team-page {
        page-break-after: always; break-after: page;
        padding: 0.4in 0.4in 0.3in;
    }
    .team-page:last-child { page-break-after: auto; break-after: auto; }

    /* Empty-day section still uses the old big banner (no table means nothing to repeat) */
    .team-banner {
        background: #fff; border-left: 6px solid #0f2621; border-bottom: 2px solid #e5e1d6;
        padding: 10px 0 14px 16px; margin-bottom: 14px;
    }
    .team-name { margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24pt; font-weight: 700; letter-spacing: 0.01em; text-transform: uppercase; line-height: 1.05; }
    .team-meta { margin-top: 4px; font-size: 9pt; font-weight: 600; letter-spacing: 0.15em; color: #888; }

    .staff-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }

    /* Running header: lives inside <thead>, repeats on every physical page automatically */
    .running-banner {
        background: #fff; text-align: left; padding: 8px 14px 9px 14px;
        border-left: 6px solid #0f2621; border-bottom: 2px solid #e5e1d6;
    }
    .running-banner .rb-title {
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 14pt; font-weight: 700; letter-spacing: 0.01em;
        text-transform: uppercase; margin-right: 12px;
    }
    .running-banner .rb-meta {
        font-size: 8.5pt; font-weight: 500; letter-spacing: 0.08em;
        color: #888; text-transform: uppercase;
    }

    .col-headers th {
        text-align: left; padding: 6px 8px; background: #fff;
        border-bottom: 2px solid #0f2621; font-size: 8pt; text-transform: uppercase;
        letter-spacing: 0.06em; font-weight: 700; color: #0f2621;
    }
    .staff-table tbody td { padding: 5px 8px; border-bottom: 1px solid #e5e1d6; vertical-align: top; }
    .staff-table tbody tr:nth-child(even) td {
        background: #faf8f3;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .staff-table th.check, .staff-table td.check { width: 0.35in; text-align: center; }
    .checkbox-cell { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #0f2621; border-radius: 2px; }
    .staff-table th.name, .staff-table td.name { width: 1.85in; font-weight: 600; }
    .staff-table th.role, .staff-table td.role { width: 1.9in; color: #2d2d2d; }
    .staff-table th.team, .staff-table td.team { width: 0.85in; color: #888; font-size: 8.5pt; }
    .staff-table th.sched, .staff-table td.sched { width: 1.3in; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .staff-table th.phone, .staff-table td.phone { width: 1.15in; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .staff-table th.email, .staff-table td.email { font-size: 8.5pt; overflow-wrap: break-word; word-break: normal; }
    .empty { color: transparent; }
    .placeholder-row td.name { color: #888; }
    .placeholder-row td { background: #faf8f3 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tbd-tag {
        display: inline-block; font-size: 7.5pt; font-weight: 700;
        letter-spacing: 0.04em; padding: 1px 5px; margin-right: 4px;
        background: #fff; color: #0f2621; border: 1px solid #0f2621; border-radius: 2px; vertical-align: 1px;
    }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
    .empty-day {
        padding: 40px 20px; text-align: center; color: #888;
        font-size: 11pt; font-style: italic; border: 1px dashed #e5e1d6; border-radius: 4px;
    }
    @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .team-page {
            background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            padding: 32px; margin: 0 auto 20px; max-width: 10in;
        }
    }
</style>
</head>
<body>
    ${pagesHtml}
    <script>
        if (document.readyState === 'complete') {
            setTimeout(() => window.print(), 150);
        } else {
            window.addEventListener('load', () => setTimeout(() => window.print(), 150));
        }
    <\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
        showToast('Please allow popups to print check-in list', 'error');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}

window.openPrintCheckInModal = openPrintCheckInModal;
window.closePrintCheckInModal = closePrintCheckInModal;
window.confirmPrintCheckInList = confirmPrintCheckInList;

const PERFORMER_DAY_KEYS = ['thursday', 'friday', 'saturday', 'sunday'];

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

    title.textContent = data ? 'Edit Performer' : 'Add Performer';

    if (data) {
        document.getElementById('setlist-id').value = itemId;
        document.getElementById('setlist-performer').value = data.performer || '';
        document.getElementById('setlist-stage').value = data.stage || '';
        document.getElementById('setlist-duration').value = data.estimatedDuration || '';
        document.getElementById('setlist-notes').value = data.generalNotes || '';
        renderSongRows(data.songs || []);
        renderMemberRows(data.members || []);
        populatePerformerDayFields(data);
        updateStagePlotUI(data.stagePlotUrl || null);
    } else {
        renderSongRows([{ title: '', duration: '', notes: '' }]);
        renderMemberRows([]);
        populatePerformerDayFields(null);
        updateStagePlotUI(null);
    }

    modal.classList.add('active');
}

function populatePerformerDayFields(data) {
    const arrivals = (data && data.arrivals) || {};
    const overrides = (data && data.performanceOverrides) || {};
    const derived = getDerivedPerformanceTimes(data ? data.performer : '');

    PERFORMER_DAY_KEYS.forEach(day => {
        const arrivalInput = document.getElementById('setlist-arrival-' + day);
        const perfInput = document.getElementById('setlist-perf-' + day);
        const hintSpan = document.getElementById('derived-hint-' + day);
        if (arrivalInput) arrivalInput.value = arrivals[day] || '';
        if (perfInput) perfInput.value = overrides[day] || '';
        if (hintSpan) {
            const times = (derived[day] || []).filter(Boolean);
            hintSpan.textContent = times.length
                ? 'Timeline: ' + times.map(t => formatTime12Hour(t)).join(', ')
                : '';
        }
    });
}

function renderMemberRows(members) {
    const container = document.getElementById('setlist-members-container');
    if (!container) return;
    container.innerHTML = (members || []).map((m, i) => `
        <div class="member-edit-row" data-member-index="${i}">
            <input type="text" class="member-name-input" value="${escapeHtml(m.name || '')}" placeholder="Name">
            <input type="tel" class="member-phone-input" value="${escapeHtml(m.phone || '')}" placeholder="Phone">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeMemberRow(this)">×</button>
        </div>
    `).join('');
}

function addMemberRow() {
    const container = document.getElementById('setlist-members-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'member-edit-row';
    row.innerHTML = `
        <input type="text" class="member-name-input" placeholder="Name">
        <input type="tel" class="member-phone-input" placeholder="Phone">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeMemberRow(this)">×</button>
    `;
    container.appendChild(row);
    row.querySelector('.member-name-input').focus();
}

function removeMemberRow(btn) {
    const row = btn.closest('.member-edit-row');
    if (row) row.remove();
}

window.addMemberRow = addMemberRow;
window.removeMemberRow = removeMemberRow;

function getDerivedPerformanceTimes(performerName) {
    // Strict match on timeline row's performer field only. Event-text
    // matching was too noisy (On Stage / Performance / Backstage rows all
    // referenced the same band) so we now rely on the modal's manual
    // override field to be the authoritative display value.
    const result = { thursday: [], friday: [], saturday: [], sunday: [] };
    const norm = (performerName || '').trim().toLowerCase();
    if (!norm) return result;
    (state.timeline || []).forEach(t => {
        if ((t.performer || '').trim().toLowerCase() !== norm) return;
        const ev = (t.event || '').toLowerCase();
        if (/\bsound\s*check\b/.test(ev)) return;
        const dayKey = (t.day || '').toLowerCase();
        if (!result[dayKey]) return;
        if (t.time) result[dayKey].push(t.time);
    });
    return result;
}

// Format a manual performanceOverrides value: if it looks like 24h HH:MM,
// convert to 12h AM/PM; otherwise preserve whatever the user typed.
function formatPerfOverride(raw) {
    const s = (raw || '').trim();
    if (!s) return '';
    return /^\d{1,2}:\d{2}$/.test(s) ? formatTime12Hour(s) : s;
}

function getDerivedSoundcheckTimes(performerName) {
    const result = { thursday: [], friday: [], saturday: [], sunday: [] };
    const norm = (performerName || '').trim().toLowerCase();
    if (!norm) return result;
    (state.timeline || []).forEach(t => {
        const ev = (t.event || '').toLowerCase();
        const m = ev.match(/^\s*sound\s*check\s*:\s*(.+?)\s*$/i);
        if (!m) return;
        const subject = m[1].trim();
        if (!subject) return;
        // Bidirectional substring: matches both exact-name bands and shorter
        // aliases (e.g., "Rock Ensemble" → "Miami Beach Rock Ensemble (Set 1)").
        if (!(norm.includes(subject) || subject.includes(norm))) return;
        const dayKey = (t.day || '').toLowerCase();
        if (!result[dayKey]) return;
        if (t.time) result[dayKey].push(t.time);
    });
    return result;
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

    const memberRows = document.querySelectorAll('#setlist-members-container .member-edit-row');
    const members = Array.from(memberRows)
        .map(row => ({
            name: row.querySelector('.member-name-input').value.trim(),
            phone: row.querySelector('.member-phone-input').value.trim()
        }))
        .filter(m => m.name || m.phone);

    const arrivals = {};
    const performanceOverrides = {};
    PERFORMER_DAY_KEYS.forEach(day => {
        const aEl = document.getElementById('setlist-arrival-' + day);
        const pEl = document.getElementById('setlist-perf-' + day);
        arrivals[day] = aEl ? aEl.value.trim() : '';
        performanceOverrides[day] = pEl ? pEl.value.trim() : '';
    });

    const data = {
        performer: document.getElementById('setlist-performer').value,
        stage: document.getElementById('setlist-stage').value,
        songs: songs,
        members: members,
        arrivals: arrivals,
        performanceOverrides: performanceOverrides,
        estimatedDuration: document.getElementById('setlist-duration').value,
        generalNotes: document.getElementById('setlist-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const id = document.getElementById('setlist-id').value;

    // Pick up stage plot URL if uploaded during new setlist creation
    if (!id) {
        const fileInput = document.getElementById('stage-plot-file');
        if (fileInput && fileInput.dataset.uploadedUrl) {
            data.stagePlotUrl = fileInput.dataset.uploadedUrl;
            data.stagePlotPath = fileInput.dataset.uploadedPath;
        }
    }

    try {
        if (id) {
            await collections.setLists.doc(id).update(data);
            showToast('Performer updated');
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.setLists.add(data);
            showToast('Performer added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving performer:', error);
        showToast('Error saving performer', 'error');
    }
}

function toggleSetListSongs(id) {
    const el = document.getElementById('setlist-songs-' + id);
    const icon = document.getElementById('setlist-toggle-icon-' + id);
    if (!el || !icon) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? '' : 'none';
    icon.innerHTML = isHidden ? '&#9660;' : '&#9654;';
    if (isHidden) {
        el.closest('.setlist-accordion-item').classList.add('expanded');
        state.setListsExpanded.add(id);
    } else {
        el.closest('.setlist-accordion-item').classList.remove('expanded');
        state.setListsExpanded.delete(id);
    }
}

function expandAllSetLists() {
    state.setLists.forEach(sl => state.setListsExpanded.add(sl.id));
    document.querySelectorAll('.setlist-accordion-body').forEach(body => {
        body.style.display = '';
        body.closest('.setlist-accordion-item').classList.add('expanded');
    });
    document.querySelectorAll('.setlist-toggle-icon').forEach(icon => {
        icon.innerHTML = '&#9660;';
    });
}

function collapseAllSetLists() {
    state.setListsExpanded.clear();
    document.querySelectorAll('.setlist-accordion-body').forEach(body => {
        body.style.display = 'none';
        body.closest('.setlist-accordion-item').classList.remove('expanded');
    });
    document.querySelectorAll('.setlist-toggle-icon').forEach(icon => {
        icon.innerHTML = '&#9654;';
    });
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

    // Arrivals & Performance sheet
    const scheduleRows = [];
    const dayOrder = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = { thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
    state.setLists
        .slice()
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            const arrivals = sl.arrivals || {};
            const overrides = sl.performanceOverrides || {};
            const derived = getDerivedPerformanceTimes(sl.performer);
            const soundchecks = getDerivedSoundcheckTimes(sl.performer);
            dayOrder.forEach(day => {
                const arrival = arrivals[day] || '';
                const override = overrides[day] || '';
                const derivedTimes = (derived[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
                const soundcheckTimes = (soundchecks[day] || []).filter(Boolean).map(t => formatTime12Hour(t));
                if (!arrival && !override && derivedTimes.length === 0 && soundcheckTimes.length === 0) return;
                scheduleRows.push({
                    'Performer': sl.performer || '',
                    'Day': dayNames[day],
                    'Arrival': arrival,
                    'Soundcheck': soundcheckTimes.join(', '),
                    'Performance (derived)': derivedTimes.join(', '),
                    'Performance (override)': formatPerfOverride(override)
                });
            });
        });
    if (scheduleRows.length) {
        const sched = XLSX.utils.json_to_sheet(scheduleRows);
        sched['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, sched, 'Arrivals & Performance');
    }

    // Members sheet
    const memberRows = [];
    state.setLists
        .slice()
        .sort((a, b) => (a.performer || '').localeCompare(b.performer || ''))
        .forEach(sl => {
            (sl.members || []).forEach(m => {
                memberRows.push({
                    'Performer': sl.performer || '',
                    'Name': m.name || '',
                    'Phone': m.phone || ''
                });
            });
        });
    if (memberRows.length) {
        const mem = XLSX.utils.json_to_sheet(memberRows);
        mem['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, mem, 'Members');
    }

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Performers_${today}.xlsx`);
}

// Stage Plot PDF Upload
function updateStagePlotUI(url) {
    const currentDiv = document.getElementById('stage-plot-current');
    const link = document.getElementById('stage-plot-link');
    const fileInput = document.getElementById('stage-plot-file');
    const status = document.getElementById('stage-plot-upload-status');

    if (fileInput) fileInput.value = '';
    if (status) status.textContent = '';

    if (url) {
        currentDiv.style.display = 'flex';
        link.href = url;
    } else {
        currentDiv.style.display = 'none';
    }
}

function showUploadError(status, message, detail) {
    console.error('Stage plot upload:', message, detail || '');
    status.textContent = message;
    status.className = 'upload-status upload-error';
}

async function handleStagePlotFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('stage-plot-upload-status');
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];

    if (!allowed.includes(file.type)) {
        showUploadError(status, 'Only PDF, PNG, or JPG files allowed.');
        input.value = '';
        return;
    }
    if (file.size > maxSize) {
        showUploadError(status, 'File too large (max 10MB).');
        input.value = '';
        return;
    }

    // Check Firebase Storage is available before attempting upload
    if (typeof storage === 'undefined' || !storage) {
        showUploadError(status, 'Firebase Storage not configured. Check console.');
        input.value = '';
        return;
    }

    const setlistId = document.getElementById('setlist-id').value;
    const performer = document.getElementById('setlist-performer').value || 'unknown';
    const ext = file.name.split('.').pop();
    const path = `stagePlots/${performer.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;

    status.textContent = 'Uploading...';
    status.className = 'upload-status';
    input.disabled = true;

    let uploadTimedOut = false;
    let idleTimeout = null;

    // Stall detection: re-armed on every progress tick (not just the first),
    // so a transfer that stalls partway through — not just one that never
    // starts — still gets caught instead of freezing at whatever % it was
    // last on (commonly 0%, since that's the first snapshot's usual value).
    function armIdleTimeout() {
        clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => {
            uploadTimedOut = true;
            try { task.cancel(); } catch (e) { /* ignore */ }
            showUploadError(status,
                'Upload stalled — check your connection and try again.',
                'If this keeps happening, Firebase Storage may not be enabled: Firebase Console → Storage → Get Started.'
            );
            showToast('Upload failed: stalled with no progress for 15s.', 'error');
            input.disabled = false;
            input.value = '';
        }, 15000);
    }

    let task;
    try {
        const ref = storage.ref(path);
        task = ref.put(file);
    } catch (error) {
        showUploadError(status, 'Upload failed: ' + (error.message || 'Unknown error'));
        input.disabled = false;
        input.value = '';
        return;
    }

    armIdleTimeout();

    task.on('state_changed',
        (snapshot) => {
            if (uploadTimedOut) return;
            armIdleTimeout();
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            status.textContent = `Uploading... ${pct}%`;
        },
        (error) => {
            if (uploadTimedOut) return;
            clearTimeout(idleTimeout);
            input.disabled = false;
            input.value = '';

            if (error.code === 'storage/canceled') return;

            let userMsg = 'Upload failed.';
            if (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated') {
                userMsg = 'Upload denied — check Firebase Storage rules.';
            } else if (error.code === 'storage/bucket-not-found') {
                userMsg = 'Storage bucket not found — enable Storage in Firebase Console.';
            } else if (error.code === 'storage/retry-limit-exceeded') {
                userMsg = 'Upload failed — check your internet connection.';
            }
            showUploadError(status, userMsg, error.code + ': ' + error.message);
            showToast(userMsg, 'error');
        },
        async () => {
            if (uploadTimedOut) return;
            clearTimeout(idleTimeout);
            input.disabled = false;

            try {
                const url = await task.snapshot.ref.getDownloadURL();
                status.textContent = 'Uploaded!';
                status.className = 'upload-status upload-success';

                if (setlistId) {
                    await collections.setLists.doc(setlistId).update({
                        stagePlotUrl: url,
                        stagePlotPath: path,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    document.getElementById('stage-plot-file').dataset.uploadedUrl = url;
                    document.getElementById('stage-plot-file').dataset.uploadedPath = path;
                }
                updateStagePlotUI(url);
                showToast('Stage plot uploaded');
            } catch (error) {
                showUploadError(status, 'Upload succeeded but failed to save URL.', error.message);
                showToast('Error saving stage plot link', 'error');
            }
        }
    );
}

async function removeStagePlotFile() {
    const setlistId = document.getElementById('setlist-id').value;
    if (!setlistId) return;

    const sl = state.setLists.find(s => s.id === setlistId);
    if (!sl) return;

    try {
        if (sl.stagePlotPath) {
            try {
                await storage.ref(sl.stagePlotPath).delete();
            } catch (storageErr) {
                // File may already be deleted from Storage — still clear Firestore reference
                console.warn('Could not delete storage file (may already be removed):', storageErr.code);
            }
        }
        await collections.setLists.doc(setlistId).update({
            stagePlotUrl: firebase.firestore.FieldValue.delete(),
            stagePlotPath: firebase.firestore.FieldValue.delete(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        updateStagePlotUI(null);
        showToast('Stage plot removed');
    } catch (error) {
        console.error('Error removing stage plot:', error);
        showToast('Error removing stage plot', 'error');
    }
}

window.openSetListModal = openSetListModal;
window.deleteSetList = createDeleteHandler('setLists', 'set list');
window.addSongRow = addSongRow;
window.removeSongRow = removeSongRow;
window.toggleSetListSongs = toggleSetListSongs;
window.expandAllSetLists = expandAllSetLists;
window.collapseAllSetLists = collapseAllSetLists;
window.handleSetListSearch = handleSetListSearch;
window.clearSetListSearch = clearSetListSearch;
window.handleStagePlotFileSelect = handleStagePlotFileSelect;
window.removeStagePlotFile = removeStagePlotFile;

// Make functions globally accessible
window.toggleCategorySection = toggleCategorySection;
window.editBudgetCell = editBudgetCell;
window.makeRowEditable = makeRowEditable;
window.saveRowChanges = saveRowChanges;
window.cancelRowEdit = cancelRowEdit;
window.editTimelineCell = editTimelineCell;
window.commitNewRow = commitNewRow;
window.editStageCell = editStageCell;

// ============================
// Seating
// ============================

const SEATING_GUEST_FIELDS = ['firstName', 'lastName', 'party', 'tableId', 'email', 'phone', 'dietary', 'notes'];
const SEATING_FIELD_LABELS = {
    firstName: 'first', lastName: 'last', party: 'party', tableId: 'table',
    email: 'email', phone: 'phone', dietary: 'dietary', notes: 'notes'
};
const SEATING_MARKER_COLORS = {
    empty: '#e5e7eb',
    partial: '#fde68a',
    full: '#a7f3d0',
    over: '#fecaca'
};

function getTableAssignedCount(tableId) {
    if (!tableId) return 0;
    return state.guests.filter(g => g.tableId === tableId).length;
}

function getTableFillColor(table) {
    const count = getTableAssignedCount(table.id);
    const cap = table.capacity || 0;
    if (count === 0) return SEATING_MARKER_COLORS.empty;
    if (count > cap) return SEATING_MARKER_COLORS.over;
    if (count === cap) return SEATING_MARKER_COLORS.full;
    return SEATING_MARKER_COLORS.partial;
}

function getTableLabel(tableId) {
    const t = state.seatingTables.find(st => st.id === tableId);
    return t ? t.label : '';
}

function sortSeatingTables(tables) {
    return [...tables].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'lounge' ? -1 : 1;
        return (a.number || 0) - (b.number || 0);
    });
}

function updateSeatingStats() {
    const total = state.guests.length;
    const seated = state.guests.filter(g => g.tableId).length;
    const unassigned = total - seated;
    const capacity = state.seatingTables.reduce((sum, t) => sum + (t.capacity || 0), 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('seating-stat-total', total);
    set('seating-stat-seated', seated);
    set('seating-stat-unassigned', unassigned);
    set('seating-stat-capacity', capacity);
}

function renderSeatingTable() {
    const tbody = document.getElementById('seating-guest-tbody');
    if (!tbody) return;
    if (state.seatingEditingRowId) {
        state.seatingRenderPending = true;
        return;
    }

    const search = (state.seatingSearch || '').toLowerCase().trim();
    let filtered = state.guests.filter(g => {
        if (state.seatingUnassignedOnly && g.tableId) return false;
        if (!search) return true;
        const tableLabel = getTableLabel(g.tableId).toLowerCase();
        return [g.firstName, g.lastName, g.party, g.email, tableLabel]
            .some(v => (v || '').toLowerCase().includes(search));
    });

    filtered.sort((a, b) => {
        const aL = (a.lastName || '').toLowerCase();
        const bL = (b.lastName || '').toLowerCase();
        if (aL !== bL) return aL.localeCompare(bL);
        return (a.firstName || '').toLowerCase().localeCompare((b.firstName || '').toLowerCase());
    });

    const phantomRow = `
        <tr class="tl-row seating-phantom-row no-anim" data-phantom="true">
            <td data-field="firstName" onclick="editSeatingCell(this)"><span class="phantom-placeholder">+ first</span></td>
            <td data-field="lastName" onclick="editSeatingCell(this)"><span class="phantom-placeholder">last</span></td>
            <td data-field="party" onclick="editSeatingCell(this)"><span class="phantom-placeholder">party</span></td>
            <td data-field="tableId" onclick="editSeatingCell(this)"><span class="phantom-placeholder">table</span></td>
            <td data-field="email" onclick="editSeatingCell(this)"><span class="phantom-placeholder">email</span></td>
            <td data-field="phone" onclick="editSeatingCell(this)"><span class="phantom-placeholder">phone</span></td>
            <td data-field="dietary" onclick="editSeatingCell(this)"><span class="phantom-placeholder">dietary</span></td>
            <td data-field="notes" onclick="editSeatingCell(this)"><span class="phantom-placeholder">notes</span></td>
            <td class="actions-col no-print"></td>
        </tr>
    `;

    if (filtered.length === 0) {
        tbody.innerHTML = phantomRow;
        state.pendingNewGuestRow = {};
        return;
    }

    const rowsHtml = filtered.map(g => {
        const tableLabel = g.tableId ? getTableLabel(g.tableId) : '';
        const tableCellInner = g.tableId
            ? `<span class="table-pill">${escapeHtml(tableLabel)}</span>`
            : `<span class="table-unassigned">unassigned</span>`;
        return `
            <tr class="tl-row" data-id="${g.id}">
                <td data-field="firstName" data-original="${escapeHtml(g.firstName || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.firstName || '')}</td>
                <td data-field="lastName" data-original="${escapeHtml(g.lastName || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.lastName || '')}</td>
                <td data-field="party" data-original="${escapeHtml(g.party || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.party || '')}</td>
                <td data-field="tableId" data-original="${escapeHtml(g.tableId || '')}" onclick="editSeatingCell(this)">${tableCellInner}</td>
                <td data-field="email" data-original="${escapeHtml(g.email || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.email || '')}</td>
                <td data-field="phone" data-original="${escapeHtml(g.phone || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.phone || '')}</td>
                <td data-field="dietary" data-original="${escapeHtml(g.dietary || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.dietary || '')}</td>
                <td data-field="notes" data-original="${escapeHtml(g.notes || '')}" onclick="editSeatingCell(this)">${escapeHtml(g.notes || '')}</td>
                <td class="actions-col no-print">
                    <div class="actions-row">
                        <button class="action-icon" onclick="openGuestModal('${g.id}')" title="Edit">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="action-icon" onclick="duplicateGuest('${g.id}')" title="Duplicate">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="action-icon action-icon-danger" onclick="deleteGuest('${g.id}')" title="Delete">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml + phantomRow;
    state.pendingNewGuestRow = {};
}

function editSeatingCell(cell) {
    if (cell.querySelector('.inline-edit-input, .inline-edit-select')) return;
    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field) return;

    const isPhantom = row.dataset.phantom === 'true';
    state.seatingEditingRowId = isPhantom ? 'phantom' : row.dataset.id;
    row.classList.add('editing');

    const original = isPhantom
        ? (state.pendingNewGuestRow[field] || '')
        : (cell.dataset.original || '');

    let input;
    if (field === 'tableId') {
        input = document.createElement('select');
        input.className = 'inline-edit-select';
        input.style.minWidth = '120px';
        const opts = ['<option value="">— Unassigned —</option>'];
        sortSeatingTables(state.seatingTables).forEach(t => {
            const count = getTableAssignedCount(t.id);
            const cap = t.capacity || 0;
            const isFull = count >= cap;
            const isCurrent = t.id === original;
            const disabled = isFull && !isCurrent ? 'disabled' : '';
            opts.push(`<option value="${t.id}" ${isCurrent ? 'selected' : ''} ${disabled}>${escapeHtml(t.label)} (${count}/${cap})</option>`);
        });
        input.innerHTML = opts.join('');
    } else {
        input = document.createElement('input');
        input.type = field === 'email' ? 'email' : 'text';
        input.value = original;
        input.className = 'inline-edit-input';
    }
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (input.select) try { input.select(); } catch (e) {}

    input.addEventListener('keydown', (e) => handleSeatingCellKeydown(e, cell, row));
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && (activeEl.classList.contains('inline-edit-input') || activeEl.classList.contains('inline-edit-select'))) return;
            if (cell.querySelector('.inline-edit-input, .inline-edit-select')) {
                if (isPhantom) {
                    const val = input.value;
                    const trimmed = typeof val === 'string' ? val.trim() : val;
                    if (trimmed) state.pendingNewGuestRow[field] = trimmed;
                    restoreSeatingCell(cell, true);
                    if (!row.querySelector('.inline-edit-input, .inline-edit-select')) {
                        row.classList.remove('editing');
                        commitNewGuestRow();
                    }
                } else {
                    saveSingleSeatingCell(cell, row);
                }
            }
        }, 50);
    });
    if (field === 'tableId') {
        input.addEventListener('change', () => {
            if (isPhantom) {
                state.pendingNewGuestRow[field] = input.value;
                restoreSeatingCell(cell, true);
                if (!row.querySelector('.inline-edit-input, .inline-edit-select')) {
                    row.classList.remove('editing');
                    commitNewGuestRow();
                }
            } else {
                saveSingleSeatingCell(cell, row);
            }
        });
    }
}

function handleSeatingCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const isPhantom = row.dataset.phantom === 'true';
    const input = cell.querySelector('.inline-edit-input, .inline-edit-select');
    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        if (isPhantom) {
            const val = input ? input.value : '';
            const trimmed = typeof val === 'string' ? val.trim() : val;
            if (trimmed) state.pendingNewGuestRow[field] = trimmed;
            restoreSeatingCell(cell, true);
        } else {
            saveSingleSeatingCell(cell, row, true);
        }
        navigateSeatingCell(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isPhantom) {
            const val = input ? input.value : '';
            const trimmed = typeof val === 'string' ? val.trim() : val;
            if (trimmed) state.pendingNewGuestRow[field] = trimmed;
            restoreSeatingCell(cell, true);
            commitNewGuestRow();
        } else {
            saveSingleSeatingCell(cell, row, true);
            navigateSeatingNextRow(row, field);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreSeatingCell(cell, isPhantom);
        row.classList.remove('editing');
        clearSeatingEditingFlag();
    }
}

function navigateSeatingCell(row, currentField, direction) {
    const idx = SEATING_GUEST_FIELDS.indexOf(currentField);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < SEATING_GUEST_FIELDS.length) {
        const liveRow = getLiveSeatingRow(row);
        const nextField = SEATING_GUEST_FIELDS[nextIdx];
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editSeatingCell(nextCell);
    } else if (direction > 0) {
        if (row.dataset.phantom === 'true') { commitNewGuestRow(); return; }
        const liveRow = getLiveSeatingRow(row);
        const nextRow = liveRow.nextElementSibling;
        if (nextRow) {
            const nextCell = nextRow.querySelector(`td[data-field="${SEATING_GUEST_FIELDS[0]}"]`);
            if (nextCell) editSeatingCell(nextCell);
        }
    }
}

function navigateSeatingNextRow(row, field) {
    const liveRow = getLiveSeatingRow(row);
    const nextRow = liveRow.nextElementSibling;
    if (nextRow) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editSeatingCell(nextCell);
    }
}

function getLiveSeatingRow(row) {
    if (row.dataset.phantom === 'true') return document.querySelector('#seating-guest-tbody tr[data-phantom="true"]') || row;
    if (row.dataset.id) return document.querySelector(`#seating-guest-tbody tr[data-id="${row.dataset.id}"]`) || row;
    return row;
}

function restoreSeatingCell(cell, isPhantom) {
    const field = cell.dataset.field;
    if (isPhantom) {
        const val = state.pendingNewGuestRow[field] || '';
        if (val) {
            if (field === 'tableId') {
                const label = getTableLabel(val);
                cell.innerHTML = label ? `<span class="table-pill">${escapeHtml(label)}</span>` : `<span class="table-unassigned">unassigned</span>`;
            } else {
                cell.textContent = val;
            }
        } else {
            const placeholder = SEATING_FIELD_LABELS[field] || field;
            cell.innerHTML = `<span class="phantom-placeholder">${field === 'firstName' ? '+ ' : ''}${placeholder}</span>`;
        }
    } else {
        const original = cell.dataset.original || '';
        if (field === 'tableId') {
            const label = getTableLabel(original);
            cell.innerHTML = original
                ? `<span class="table-pill">${escapeHtml(label)}</span>`
                : `<span class="table-unassigned">unassigned</span>`;
        } else {
            cell.textContent = original;
        }
    }
}

function clearSeatingEditingFlag() {
    state.seatingEditingRowId = null;
    if (state.seatingRenderPending) {
        state.seatingRenderPending = false;
        renderSeatingTable();
    }
}

function saveSingleSeatingCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input, .inline-edit-select');
    if (!input) return;
    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = typeof input.value === 'string' ? input.value.trim() : input.value;
    const item = state.guests.find(g => g.id === id);
    const oldValue = item ? (item[field] || '') : '';

    // Capacity check
    if (field === 'tableId' && newValue && newValue !== oldValue) {
        const target = state.seatingTables.find(t => t.id === newValue);
        if (target) {
            const count = getTableAssignedCount(newValue);
            if (count >= (target.capacity || 0)) {
                showToast(`${target.label} is full (${count}/${target.capacity})`, 'error');
                restoreSeatingCell(cell, false);
                if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-select')) {
                    row.classList.remove('editing');
                    clearSeatingEditingFlag();
                }
                return;
            }
        }
    }

    cell.dataset.original = newValue;
    if (field === 'tableId') {
        const label = getTableLabel(newValue);
        cell.innerHTML = newValue
            ? `<span class="table-pill">${escapeHtml(label)}</span>`
            : `<span class="table-unassigned">unassigned</span>`;
    } else {
        cell.textContent = newValue;
    }

    if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-select')) {
        row.classList.remove('editing');
        clearSeatingEditingFlag();
    }

    if (!item) return;
    if (newValue === oldValue) return;

    item[field] = newValue;

    const eventId = state.currentEventId;
    pushUndo(`Edit ${field}`, async () => {
        if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
        const current = state.guests.find(g => g.id === id);
        if (current) current[field] = oldValue;
        await collections.guests.doc(id).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });

    collections.guests.doc(id).update({
        [field]: newValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
        console.error('Error saving guest cell:', err);
        if (item) item[field] = oldValue;
        cell.dataset.original = oldValue;
        showToast('Error saving', 'error');
    });
}

async function commitNewGuestRow() {
    const data = { ...state.pendingNewGuestRow };
    if (!data.firstName && !data.lastName) {
        state.pendingNewGuestRow = {};
        clearSeatingEditingFlag();
        renderSeatingTable();
        return;
    }
    // Capacity check on phantom commit
    if (data.tableId) {
        const target = state.seatingTables.find(t => t.id === data.tableId);
        if (target) {
            const count = getTableAssignedCount(data.tableId);
            if (count >= (target.capacity || 0)) {
                showToast(`${target.label} is full — guest added unassigned`, 'warning');
                data.tableId = '';
            }
        }
    }
    const newGuest = {
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        party: data.party || '',
        tableId: data.tableId || '',
        email: data.email || '',
        phone: data.phone || '',
        dietary: data.dietary || '',
        notes: data.notes || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    state.pendingNewGuestRow = {};
    try {
        await collections.guests.add(newGuest);
        clearSeatingEditingFlag();
    } catch (err) {
        console.error('Error adding guest:', err);
        showToast('Error adding guest', 'error');
        clearSeatingEditingFlag();
    }
}

function openGuestModal(id = null) {
    // Populate the table dropdown first
    const sel = document.getElementById('guest-table');
    if (sel) {
        const opts = ['<option value="">— Unassigned —</option>'];
        sortSeatingTables(state.seatingTables).forEach(t => {
            const count = getTableAssignedCount(t.id);
            const cap = t.capacity || 0;
            opts.push(`<option value="${t.id}">${escapeHtml(t.label)} (${count}/${cap})</option>`);
        });
        sel.innerHTML = opts.join('');
    }
    openModal({
        modalId: 'guest-modal',
        formId: 'guest-form',
        idFieldId: 'guest-id',
        itemId: id,
        stateKey: 'guests',
        title: 'Guest',
        fieldMap: {
            'guest-first-name': 'firstName',
            'guest-last-name': 'lastName',
            'guest-party': 'party',
            'guest-table': 'tableId',
            'guest-email': 'email',
            'guest-phone': 'phone',
            'guest-dietary': 'dietary',
            'guest-notes': 'notes'
        }
    });
}

async function handleGuestSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'guests',
        idFieldId: 'guest-id',
        itemName: 'guest',
        fieldMap: {
            'guest-first-name': 'firstName',
            'guest-last-name': 'lastName',
            'guest-party': 'party',
            'guest-table': 'tableId',
            'guest-email': 'email',
            'guest-phone': 'phone',
            'guest-dietary': 'dietary',
            'guest-notes': 'notes'
        }
    });
}

const _baseDeleteGuest = createDeleteHandler('guests', 'guest');
async function deleteGuest(id) { return _baseDeleteGuest(id); }

async function duplicateGuest(id) {
    const g = state.guests.find(x => x.id === id);
    if (!g) return;
    const { id: _id, createdAt, updatedAt, ...data } = g;
    data.firstName = (data.firstName || '') + ' (copy)';
    data.tableId = '';
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    try {
        await collections.guests.add(data);
        showToast('Guest duplicated');
    } catch (err) {
        console.error('Error duplicating guest:', err);
        showToast('Error duplicating guest', 'error');
    }
}

function setSeatingView(view) {
    state.seatingView = view;
    document.getElementById('seating-table-view-btn').classList.toggle('active', view === 'table');
    document.getElementById('seating-map-view-btn').classList.toggle('active', view === 'map');
    document.getElementById('seating-table-view').style.display = view === 'table' ? '' : 'none';
    document.getElementById('seating-map-view').style.display = view === 'map' ? '' : 'none';
    if (view === 'map') {
        setTimeout(() => {
            seatingInitCanvas();
            renderSeatingMap();
        }, 50);
    }
}

function handleSeatingSearch(value) {
    state.seatingSearch = value;
    renderSeatingTable();
}

function toggleSeatingUnassignedOnly(checked) {
    state.seatingUnassignedOnly = checked;
    renderSeatingTable();
}

// ---------- Map view ----------

// Aspect ratio (portrait) used to size the canvas — matches the original floor plan.
const SEATING_CANVAS_ASPECT = 1764 / 2628;

function seatingInitCanvas() {
    if (state.seatingCanvasInitialized) {
        if (state.seatingCanvas) state.seatingCanvas.renderAll();
        return;
    }
    const wrapper = document.getElementById('seating-canvas-wrapper');
    if (!wrapper) return;

    const padding = 24;
    const availableWidth = (wrapper.parentElement ? wrapper.parentElement.clientWidth - 340 - 16 : wrapper.clientWidth) - padding;
    const maxHeight = Math.max(window.innerHeight - 200, 700);
    let canvasHeight = maxHeight;
    let canvasWidth = canvasHeight * SEATING_CANVAS_ASPECT;
    if (canvasWidth > availableWidth) {
        canvasWidth = availableWidth;
        canvasHeight = canvasWidth / SEATING_CANVAS_ASPECT;
    }
    canvasWidth = Math.floor(canvasWidth);
    canvasHeight = Math.floor(canvasHeight);
    wrapper.style.width = (canvasWidth + padding) + 'px';
    wrapper.style.minHeight = (canvasHeight + padding) + 'px';

    state.seatingCanvas = new fabric.Canvas('seating-canvas', {
        width: canvasWidth,
        height: canvasHeight,
        selection: false,
        preserveObjectStacking: true,
        backgroundColor: '#fafafa'
    });

    state.seatingCanvas.on('mouse:down', (opt) => {
        const target = opt.target;
        if (target && target._tableId) {
            state.seatingSelectedTableId = target._tableId;
            state.seatingPanelSearch = '';
            renderSeatingPanel();
        } else if (!target) {
            state.seatingSelectedTableId = null;
            renderSeatingPanel();
        }
    });

    state.seatingCanvas.on('object:modified', (e) => {
        const obj = e.target;
        if (!obj || !obj._tableId) return;
        const cw = state.seatingCanvas.getWidth();
        const ch = state.seatingCanvas.getHeight();
        const x = obj.left / cw;
        const y = obj.top / ch;
        collections.seatingTables.doc(obj._tableId).update({
            x, y,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => {
            console.error('Error saving table position:', err);
            showToast('Error saving table position', 'error');
        });
    });

    state.seatingCanvasInitialized = true;
    renderSeatingMap();
}

function renderSeatingMap() {
    const c = state.seatingCanvas;
    if (!c || !state.seatingCanvasInitialized) return;
    const cw = c.getWidth();
    const ch = c.getHeight();

    const seenIds = new Set();
    state.seatingTables.forEach(t => {
        seenIds.add(t.id);
        const left = (t.x || 0.5) * cw;
        const top = (t.y || 0.5) * ch;
        const fill = getTableFillColor(t);
        const isLounge = t.kind === 'lounge';

        let group = state.seatingMarkers.get(t.id);
        if (!group) {
            const shape = isLounge
                ? new fabric.Rect({
                    width: 64,
                    height: 36,
                    rx: 6,
                    ry: 6,
                    fill,
                    stroke: '#1a3a35',
                    strokeWidth: 1.5,
                    originX: 'center',
                    originY: 'center'
                })
                : new fabric.Circle({
                    radius: 18,
                    fill,
                    stroke: '#1a3a35',
                    strokeWidth: 1.5,
                    originX: 'center',
                    originY: 'center'
                });
            const text = new fabric.Text(String(t.number || ''), {
                fontSize: isLounge ? 14 : 13,
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: '700',
                fill: '#1a3a35',
                originX: 'center',
                originY: 'center'
            });
            group = new fabric.Group([shape, text], {
                left,
                top,
                originX: 'center',
                originY: 'center',
                hasControls: false,
                hasBorders: true,
                lockScalingX: true,
                lockScalingY: true,
                lockRotation: true,
                hoverCursor: 'pointer'
            });
            group._tableId = t.id;
            group._tableShape = shape;
            state.seatingMarkers.set(t.id, group);
            c.add(group);
        } else {
            group.set({ left, top });
            if (group._tableShape) group._tableShape.set({ fill });
            group.setCoords();
        }
    });

    // Remove markers for tables that no longer exist
    for (const [tid, group] of state.seatingMarkers.entries()) {
        if (!seenIds.has(tid)) {
            c.remove(group);
            state.seatingMarkers.delete(tid);
        }
    }

    c.renderAll();
}

function renderSeatingPanel() {
    const empty = document.getElementById('seating-panel-empty');
    const panel = document.getElementById('seating-panel-table');
    if (!empty || !panel) return;

    const tableId = state.seatingSelectedTableId;
    const table = tableId ? state.seatingTables.find(t => t.id === tableId) : null;
    if (!table) {
        empty.style.display = '';
        panel.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    panel.style.display = '';

    const seated = state.guests
        .filter(g => g.tableId === table.id)
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    const count = seated.length;
    const cap = table.capacity || 0;
    const counterClass = count > cap ? 'over' : (count === cap ? 'full' : '');

    const isLounge = table.kind === 'lounge';
    const search = (state.seatingPanelSearch || '').toLowerCase().trim();
    const unassigned = state.guests
        .filter(g => !g.tableId)
        .filter(g => {
            if (!search) return true;
            return [g.firstName, g.lastName, g.party, g.email]
                .some(v => (v || '').toLowerCase().includes(search));
        })
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
        .slice(0, 50);

    panel.innerHTML = `
        <div class="seating-panel-header">
            <h3>${escapeHtml(table.label)}</h3>
            <span class="seating-panel-counter ${counterClass}">${count}/${cap}</span>
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Capacity</div>
            <div class="seating-capacity-buttons">
                <button class="${cap === 10 ? 'active' : ''}" ${isLounge ? 'disabled' : ''} onclick="setTableCapacity('${table.id}', 10)">10</button>
                <button class="${cap === 12 ? 'active' : ''}" onclick="setTableCapacity('${table.id}', 12)">12</button>
            </div>
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Seated (${count})</div>
            ${seated.length === 0 ? '<div class="seating-search-empty">No guests seated yet</div>' : seated.map(g => `
                <div class="guest-chip">
                    <span><span class="chip-name">${escapeHtml((g.firstName || '') + ' ' + (g.lastName || ''))}</span>${g.party ? `<span class="chip-party">· ${escapeHtml(g.party)}</span>` : ''}</span>
                    <button class="remove-btn" onclick="unseatGuest('${g.id}')" title="Remove from table">×</button>
                </div>
            `).join('')}
        </div>
        <div class="seating-panel-section">
            <div class="seating-panel-section-label">Add Guest</div>
            <input type="text" class="search-input" id="seating-panel-search" placeholder="Search unassigned guests…" value="${escapeHtml(state.seatingPanelSearch || '')}" oninput="handleSeatingPanelSearch(this.value)" style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.85rem;">
            <div class="seating-search-results">
                ${unassigned.length === 0 ? '<div class="seating-search-empty">No matching unassigned guests</div>' : unassigned.map(g => `
                    <div class="seating-search-result" onclick="seatGuest('${g.id}', '${table.id}')">
                        <span>${escapeHtml((g.firstName || '') + ' ' + (g.lastName || ''))}</span>
                        ${g.party ? `<span class="result-party"> · ${escapeHtml(g.party)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    // Restore focus on search input if it was being typed in
    const searchInput = document.getElementById('seating-panel-search');
    if (searchInput && state.seatingPanelSearch) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
}

function handleSeatingPanelSearch(value) {
    state.seatingPanelSearch = value;
    renderSeatingPanel();
}

async function seatGuest(guestId, tableId) {
    const table = state.seatingTables.find(t => t.id === tableId);
    if (!table) return;
    const count = getTableAssignedCount(tableId);
    if (count >= (table.capacity || 0)) {
        showToast(`${table.label} is full (${count}/${table.capacity})`, 'error');
        return;
    }
    try {
        await collections.guests.doc(guestId).update({
            tableId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error seating guest:', err);
        showToast('Error seating guest', 'error');
    }
}

async function unseatGuest(guestId) {
    try {
        await collections.guests.doc(guestId).update({
            tableId: '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error('Error unseating guest:', err);
        showToast('Error unseating guest', 'error');
    }
}

async function setTableCapacity(tableId, capacity) {
    const table = state.seatingTables.find(t => t.id === tableId);
    if (!table || table.kind === 'lounge') return;
    const count = getTableAssignedCount(tableId);
    if (count > capacity) {
        showToast(`Table has ${count} seated — unseat first`, 'error');
        return;
    }
    try {
        await collections.seatingTables.doc(tableId).update({
            capacity,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Capacity set to ${capacity}`);
    } catch (err) {
        console.error('Error updating capacity:', err);
        showToast('Error updating capacity', 'error');
    }
}

// ---------- Import / Export ----------

async function importGuestsFromXlsx(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        showToast('XLSX library not loaded', 'error');
        return;
    }
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length === 0) {
            showToast('No rows found in file', 'warning');
            return;
        }

        const norm = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '');
        const fieldAliases = {
            firstname: 'firstName', first: 'firstName',
            lastname: 'lastName', last: 'lastName', surname: 'lastName',
            party: 'party', group: 'party',
            email: 'email', 'e-mail': 'email',
            phone: 'phone', mobile: 'phone',
            dietary: 'dietary', diet: 'dietary',
            notes: 'notes', note: 'notes'
        };

        showToast(`Importing ${rows.length} guests…`, 'info');
        const batchSize = 400;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = firebase.firestore().batch();
            const slice = rows.slice(i, i + batchSize);
            slice.forEach(row => {
                const guest = { firstName: '', lastName: '', party: '', tableId: '', email: '', phone: '', dietary: '', notes: '' };
                Object.keys(row).forEach(key => {
                    const target = fieldAliases[norm(key)];
                    if (target) guest[target] = String(row[key] || '').trim();
                });
                if (!guest.firstName && !guest.lastName) return;
                guest.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                guest.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
                const ref = collections.guests.doc();
                batch.set(ref, guest);
            });
            await batch.commit();
        }
        showToast(`Imported ${rows.length} guests`, 'success');
        document.getElementById('seating-import-input').value = '';
    } catch (err) {
        console.error('Error importing guests:', err);
        showToast('Error importing guests', 'error');
    }
}

function exportSeatingToXlsx() {
    if (typeof XLSX === 'undefined') {
        showToast('XLSX library not loaded', 'error');
        return;
    }
    const guestsRows = state.guests.map(g => ({
        id: g.id,
        'First Name': g.firstName || '',
        'Last Name': g.lastName || '',
        Party: g.party || '',
        Table: getTableLabel(g.tableId) || '',
        Email: g.email || '',
        Phone: g.phone || '',
        Dietary: g.dietary || '',
        Notes: g.notes || ''
    }));
    const tablesRows = sortSeatingTables(state.seatingTables).map(t => ({
        id: t.id,
        Label: t.label,
        Kind: t.kind,
        Number: t.number,
        Capacity: t.capacity,
        Assigned: getTableAssignedCount(t.id)
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(guestsRows), 'Guests');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tablesRows), 'Tables');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `gala-seating-${date}.xlsx`);
}

// ══════════════════════════════════════════════════════════════
// GUESTS PAGE  (Invite List)
// ══════════════════════════════════════════════════════════════

const GUEST_FIELD_ORDER = ['name','title','organization','status','seats','tableNumber','invitedBy','interviewPriority','phone','email','notes'];
const GUEST_STATUS_ORDER = { pending:0, invited:1, confirmed:2, declined:3 };
const GUEST_PRIORITY_ORDER = { high:0, low:1, na:2, '':3 };
const GUEST_HEADER_LABELS = {
    name:'Name', title:'Title', organization:'Organization',
    status:'Status', seats:'Seats', tableNumber:'Table #', invitedBy:'Invited By',
    interviewPriority:'Interview?', phone:'Phone', email:'Email', notes:'Notes'
};

// Extend main state with guest-page state
Object.assign(state, {
    invitees:           [],
    guestSearch:        '',
    guestSortField:     'status',
    guestSortDir:       'asc',
    guestHiddenCols:    new Set(['phone','email','tableNumber']),
    guestEditingId:     null,
    guestRenderPending: false,
    guestPendingNew:    {},
    guestLastAddedId:   null,
});

function initGuestPage() {
    state.guestEditingId    = null;
    state.guestRenderPending = false;
    state.guestPendingNew   = {};
    state.guestSearch       = '';
    const el = document.getElementById('gi-search-input');
    if (el) el.value = '';
    renderGuestColumnsMenu();
    renderGuestList();
}

function renderGuestList() {
    if (state.currentPage !== 'guests') return;
    if (state.guestEditingId) {
        state.guestRenderPending = true;
    } else {
        renderGuestTable();
    }
    renderGuestStats();
}

function renderGuestStats() {
    const bar = document.getElementById('gi-stats-bar');
    if (!bar) return;
    const invitees = state.invitees || [];
    const counts = { pending:0, invited:0, confirmed:0, declined:0 };
    const seats  = { pending:0, invited:0, confirmed:0, declined:0 };
    invitees.forEach(inv => {
        const s = inv.status || 'pending';
        if (s in counts) {
            counts[s]++;
            const n = parseInt(inv.seats, 10);
            seats[s] += isNaN(n) ? 0 : n;
        }
    });
    const total = invitees.length;
    const pct = n => total > 0 ? ((n / total) * 100).toFixed(1) : 0;
    const totalSeats = seats.invited + seats.confirmed;
    bar.innerHTML = `
        <div class="gi-stat-total">${total} Guest${total !== 1 ? 's' : ''}</div>
        <div class="gi-chip gi-chip-pending"><span>${counts.pending}</span> Pending</div>
        <div class="gi-chip gi-chip-declined"><span>${counts.declined}</span> Declined</div>
        <div class="gi-chip gi-chip-invited"><span>${counts.invited}</span> Invited</div>
        <div class="gi-chip gi-chip-confirmed"><span>${counts.confirmed}</span> Confirmed</div>
        <div class="gi-status-bar">
            <div class="gi-sb-seg gi-sb-pending"   style="width:${pct(counts.pending)}%"></div>
            <div class="gi-sb-seg gi-sb-declined"  style="width:${pct(counts.declined)}%"></div>
            <div class="gi-sb-seg gi-sb-invited"   style="width:${pct(counts.invited)}%"></div>
            <div class="gi-sb-seg gi-sb-confirmed" style="width:${pct(counts.confirmed)}%"></div>
        </div>
        <div class="gi-seats-note">
            ${totalSeats} seat${totalSeats !== 1 ? 's' : ''}
            <span class="gi-seats-detail">(${seats.invited} invited · ${seats.confirmed} confirmed)</span>
        </div>`;
}

function guestGetVisible() {
    return GUEST_FIELD_ORDER.filter(f => !state.guestHiddenCols.has(f));
}

function renderGuestTable() {
    const wrapper = document.getElementById('gi-table-wrapper');
    if (!wrapper) return;

    let filtered = [...(state.invitees || [])];
    if (state.guestSearch) {
        const q = state.guestSearch.toLowerCase();
        const sf = ['name','title','organization','invitedBy','notes','email','phone'];
        filtered = filtered.filter(inv => sf.some(f => (inv[f]||'').toLowerCase().includes(q)));
    }

    const sf = state.guestSortField;
    filtered.sort((a, b) => {
        let cmp = 0;
        if (sf === 'status') {
            cmp = (GUEST_STATUS_ORDER[a.status] ?? 99) - (GUEST_STATUS_ORDER[b.status] ?? 99);
        } else if (sf === 'interviewPriority') {
            cmp = (GUEST_PRIORITY_ORDER[a.interviewPriority||''] ?? 99) - (GUEST_PRIORITY_ORDER[b.interviewPriority||''] ?? 99);
        } else {
            cmp = (a[sf]||'').localeCompare(b[sf]||'');
        }
        return state.guestSortDir === 'asc' ? cmp : -cmp;
    });

    const visible = guestGetVisible();
    const colW = { name:14, title:11, organization:13, status:8, seats:4, tableNumber:5, invitedBy:11, interviewPriority:9, phone:9, email:12, notes:16 };
    const actW = 4;
    const totalW = visible.reduce((s, f) => s + colW[f], 0) + actW;
    const scale = 96 / totalW;

    const rows = filtered.map(inv => renderGuestRow(inv, visible)).join('');
    const phantom = renderGuestPhantom(visible);

    wrapper.innerHTML = `
        <table class="gi-table">
            <colgroup>
                ${visible.map(f => `<col style="width:${(colW[f]*scale).toFixed(1)}%">`).join('')}
                <col style="width:${actW}%">
            </colgroup>
            <thead><tr>
                ${visible.map(field => {
                    const active = state.guestSortField === field;
                    const arrow = active ? (state.guestSortDir === 'asc' ? ' ▲' : ' ▼') : '';
                    return `<th class="${active ? 'gi-th-active' : ''}" onclick="guestSort('${field}')">${GUEST_HEADER_LABELS[field]}${arrow}</th>`;
                }).join('')}
                <th></th>
            </tr></thead>
            <tbody>${rows}${phantom}</tbody>
        </table>`;

    if (filtered.length === 0 && state.guestSearch) {
        wrapper.innerHTML = '<div class="gi-empty">No guests match your search.</div>';
    }

    if (state.guestLastAddedId) {
        const row = wrapper.querySelector(`tr[data-id="${state.guestLastAddedId}"]`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('gi-row-new');
            setTimeout(() => row.classList.remove('gi-row-new'), 1500);
        }
        state.guestLastAddedId = null;
    }
}

function renderGuestRow(inv, visible) {
    const hasPhoto = inv.headshotUrl && inv.headshotUrl.trim();
    const avatar   = hasPhoto ? `<img class="gi-avatar" src="${escapeHtml(inv.headshotUrl)}" alt="">` : '';
    const cells = visible.map(field => {
        if (field === 'name') {
            return `<td data-field="name" data-id="${inv.id}" onclick="editGuestCell(this)"><span class="gi-name-cell">${avatar}${escapeHtml(inv.name||'')}</span></td>`;
        }
        if (field === 'status') {
            const s = inv.status || 'pending';
            return `<td data-field="status" data-id="${inv.id}" onclick="editGuestCell(this)"><span class="gi-status gi-status-${s}">${guestFmtStatus(s)}</span></td>`;
        }
        if (field === 'interviewPriority') {
            return `<td data-field="interviewPriority" data-id="${inv.id}" onclick="editGuestCell(this)">${guestPriorityBadge(inv.interviewPriority)}</td>`;
        }
        const val = inv[field] || '';
        const cls = field === 'notes' ? ' class="gi-notes-cell"' : '';
        return `<td data-field="${field}" data-id="${inv.id}"${cls} onclick="editGuestCell(this)">${escapeHtml(val)}</td>`;
    }).join('');

    return `<tr data-id="${inv.id}" data-status="${inv.status||'pending'}">
        ${cells}
        <td><div class="gi-row-actions">
            <button class="gi-del-btn" onclick="showDeleteGuestModal('${inv.id}','${escapeHtml(inv.name||'').replace(/'/g,"\\'")}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
        </div></td>
    </tr>`;
}

function renderGuestPhantom(visible) {
    const cells = visible.map(field => {
        const val = state.guestPendingNew[field] || '';
        let display;
        if (val) {
            if (field === 'status') display = `<span class="gi-status gi-status-${val}">${guestFmtStatus(val)}</span>`;
            else if (field === 'interviewPriority') display = guestPriorityBadge(val);
            else display = escapeHtml(val);
        } else if (field === 'name') {
            display = `<span class="gi-phantom-hint">+ Add guest…</span>`;
        } else {
            display = '';
        }
        return `<td data-field="${field}" onclick="editGuestCell(this)">${display}</td>`;
    }).join('');
    return `<tr class="gi-phantom" data-phantom="true">${cells}<td></td></tr>`;
}

function guestFmtStatus(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Pending';
}

function guestPriorityBadge(p) {
    if (!p || p === 'na') return '';
    return `<span class="gi-priority gi-priority-${p}">${p === 'high' ? 'High' : 'Low'}</span>`;
}

function guestSort(field) {
    if (state.guestSortField === field) {
        state.guestSortDir = state.guestSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.guestSortField = field;
        state.guestSortDir = 'asc';
    }
    renderGuestTable();
}
window.guestSort = guestSort;

function guestHandleSearch(val) {
    state.guestSearch = val;
    renderGuestTable();
}
window.guestHandleSearch = guestHandleSearch;

function renderGuestColumnsMenu() {
    const menu = document.getElementById('gi-col-menu');
    if (!menu) return;
    menu.innerHTML = GUEST_FIELD_ORDER.map(field => `
        <label class="gi-col-item">
            <input type="checkbox" ${state.guestHiddenCols.has(field) ? '' : 'checked'}
                   onchange="toggleGuestColumn('${field}')">
            ${GUEST_HEADER_LABELS[field]}
        </label>`).join('');
}

function toggleGuestColumnsMenu() {
    const menu = document.getElementById('gi-col-menu');
    if (menu) menu.classList.toggle('gi-col-menu-open');
    // Close on outside click
    if (menu?.classList.contains('gi-col-menu-open')) {
        setTimeout(() => {
            const close = (e) => {
                if (!e.target.closest('.gi-col-wrap')) {
                    menu.classList.remove('gi-col-menu-open');
                    document.removeEventListener('click', close);
                }
            };
            document.addEventListener('click', close);
        }, 50);
    }
}
window.toggleGuestColumnsMenu = toggleGuestColumnsMenu;

function toggleGuestColumn(field) {
    if (state.guestHiddenCols.has(field)) state.guestHiddenCols.delete(field);
    else state.guestHiddenCols.add(field);
    renderGuestTable();
}
window.toggleGuestColumn = toggleGuestColumn;

// ── Inline Cell Editing ──────────────────────────────────────
function editGuestCell(cell) {
    if (cell.querySelector('input,textarea,.gi-status-picker,.gi-priority-picker')) return;
    const row   = cell.closest('tr');
    const field = cell.dataset.field;
    const invId = cell.dataset.id;
    if (!field) return;
    const isPhantom = row?.dataset.phantom === 'true';
    state.guestEditingId = isPhantom ? 'phantom' : (invId || null);
    row?.classList.add('gi-editing');

    const original = isPhantom ? (state.guestPendingNew[field] || '') : (cell.textContent.trim());
    if (!isPhantom) cell.dataset.original = original;

    if (field === 'status')            { openGuestStatusPicker(cell, row, original, isPhantom, invId);   return; }
    if (field === 'interviewPriority') { openGuestPriorityPicker(cell, row, original, isPhantom, invId); return; }

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = original;
    input.className = 'gi-inline-input';
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    const saveVal = async (val) => {
        const v = val.trim();
        if (isPhantom) {
            if (v) state.guestPendingNew[field] = v;
            else   delete state.guestPendingNew[field];
        } else if (invId && v !== original) {
            await saveGuestField(invId, field, v);
        }
    };

    input.addEventListener('keydown', e => guestCellKeydown(e, input, cell, row, isPhantom, invId, saveVal));
    input.addEventListener('blur', async () => {
        await saveVal(input.value);
        state.guestEditingId = null;
        row?.classList.remove('gi-editing');
        if (isPhantom) {
            restoreGuestPhantomCell(cell, field);
        } else {
            cell.textContent = input.value.trim();
        }
        if (state.guestRenderPending) {
            state.guestRenderPending = false;
            renderGuestTable();
            renderGuestStats();
        }
    });
}
window.editGuestCell = editGuestCell;

function guestCellKeydown(e, input, cell, row, isPhantom, invId, saveVal) {
    if (e.key === 'Escape') {
        e.preventDefault();
        input.value = isPhantom ? (state.guestPendingNew[cell.dataset.field] || '') : (cell.dataset.original || '');
        input.blur();
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value.trim();
        if (isPhantom && v) state.guestPendingNew[cell.dataset.field] = v;
        input.blur();
        if (isPhantom && state.guestPendingNew.name) {
            saveNewGuest();
        } else {
            // move to next row same column
            const tbody = row.closest('tbody');
            const rows  = [...tbody.querySelectorAll('tr')];
            const next  = rows[rows.indexOf(row) + 1];
            if (next) setTimeout(() => next.querySelector(`[data-field="${cell.dataset.field}"]`)?.click(), 30);
        }
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const v = input.value.trim();
        if (isPhantom && v) state.guestPendingNew[cell.dataset.field] = v;
        input.blur();
        const visible = guestGetVisible();
        const fi = visible.indexOf(cell.dataset.field);
        setTimeout(() => {
            let targetRow = row, tfi = fi + 1;
            if (tfi >= visible.length) {
                const tbody = row.closest('tbody');
                const rows  = [...tbody.querySelectorAll('tr')];
                targetRow = rows[rows.indexOf(row) + 1] || row;
                tfi = 0;
            }
            targetRow?.querySelector(`[data-field="${visible[tfi]}"]`)?.click();
        }, 30);
    }
}

function restoreGuestPhantomCell(cell, field) {
    const val = state.guestPendingNew[field] || '';
    if (val) {
        cell.textContent = val;
    } else if (field === 'name') {
        cell.innerHTML = '<span class="gi-phantom-hint">+ Add guest…</span>';
    } else {
        cell.textContent = '';
    }
}

async function saveGuestField(invId, field, value) {
    if (!state.currentEventId || !collections.invitees) return;
    const item = (state.invitees || []).find(i => i.id === invId);
    const oldValue = item ? (item[field] ?? '') : '';
    try {
        await collections.invitees.doc(invId).update({
            [field]: value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (oldValue !== value) {
            const eventId = state.currentEventId;
            pushUndo(`Edit ${field}`, async () => {
                if (eventId !== state.currentEventId) { showToast('Nothing to undo', 'info'); return; }
                const current = (state.invitees || []).find(i => i.id === invId);
                if (current) current[field] = oldValue;
                await collections.invitees.doc(invId).update({ [field]: oldValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            });
        }
    } catch(e) { console.error('saveGuestField:', e); }
}

// ── Status Picker ────────────────────────────────────────────
function openGuestStatusPicker(cell, row, current, isPhantom, invId) {
    const statuses = ['pending','invited','confirmed','declined'];
    const picker = document.createElement('div');
    picker.className = 'gi-status-picker';
    picker.innerHTML = statuses.map(s =>
        `<button class="gi-sp-opt gi-sp-${s}${s===current?' gi-sp-active':''}" data-val="${s}"
                 onclick="selectGuestStatus(this,'${invId||''}',${isPhantom})">${guestFmtStatus(s)}</button>`
    ).join('');
    cell.innerHTML = '';
    cell.appendChild(picker);
    picker.querySelector('button')?.focus();
    picker.addEventListener('keydown', e => {
        if (e.key === 'Escape') { state.guestEditingId = null; row?.classList.remove('gi-editing'); renderGuestTable(); }
    });
}

async function selectGuestStatus(btn, invId, isPhantom) {
    const val = btn.dataset.val;
    if (isPhantom) {
        state.guestPendingNew.status = val;
    } else if (invId) {
        await saveGuestField(invId, 'status', val);
    }
    state.guestEditingId = null;
    btn.closest('tr')?.classList.remove('gi-editing');
    renderGuestTable();
    renderGuestStats();
}
window.selectGuestStatus = selectGuestStatus;

// ── Priority Picker ──────────────────────────────────────────
function openGuestPriorityPicker(cell, row, current, isPhantom, invId) {
    const opts = [{val:'high',label:'High'},{val:'low',label:'Low'},{val:'na',label:'N/A'},{val:'',label:'None'}];
    const picker = document.createElement('div');
    picker.className = 'gi-priority-picker';
    picker.innerHTML = opts.map(o =>
        `<button class="gi-pp-opt${o.val===current?' gi-pp-active':''}" data-val="${o.val}"
                 onclick="selectGuestPriority(this,'${invId||''}',${isPhantom})">${o.label}</button>`
    ).join('');
    cell.innerHTML = '';
    cell.appendChild(picker);
    picker.querySelector('button')?.focus();
}

async function selectGuestPriority(btn, invId, isPhantom) {
    const val = btn.dataset.val;
    if (isPhantom) state.guestPendingNew.interviewPriority = val;
    else if (invId) await saveGuestField(invId, 'interviewPriority', val);
    state.guestEditingId = null;
    btn.closest('tr')?.classList.remove('gi-editing');
    renderGuestTable();
}
window.selectGuestPriority = selectGuestPriority;

// ── Add / Delete ─────────────────────────────────────────────
async function saveNewGuest() {
    const r = state.guestPendingNew;
    if (!r.name?.trim() || !state.currentEventId || !collections.invitees) return;
    const data = {
        name: r.name||'', title: r.title||'', organization: r.organization||'',
        status: r.status||'pending', seats: r.seats||'', tableNumber: r.tableNumber||'',
        invitedBy: r.invitedBy||'', interviewPriority: r.interviewPriority||'',
        phone: r.phone||'', email: r.email||'', notes: r.notes||'',
        headshotUrl: '', bio: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    state.guestPendingNew = {};
    try {
        const doc = await collections.invitees.add(data);
        state.guestLastAddedId = doc.id;
    } catch(e) { console.error('saveNewGuest:', e); }
}

function showDeleteGuestModal(invId, name) {
    const modal  = document.getElementById('delete-guest-modal');
    const nameEl = document.getElementById('delete-guest-name');
    if (nameEl) nameEl.textContent = name;
    if (modal)  {
        modal.classList.add('active');
        document.getElementById('confirm-delete-guest-btn').onclick = () => confirmDeleteGuest(invId);
    }
}
window.showDeleteGuestModal = showDeleteGuestModal;

function closeDeleteGuestModal() {
    document.getElementById('delete-guest-modal')?.classList.remove('active');
}
window.closeDeleteGuestModal = closeDeleteGuestModal;

async function confirmDeleteGuest(invId) {
    closeDeleteGuestModal();
    if (!state.currentEventId || !collections.invitees) return;
    try { await collections.invitees.doc(invId).delete(); }
    catch(e) { console.error('confirmDeleteGuest:', e); }
}

// ── Guest Directory (Facebook) ───────────────────────────────

// ---- Wikipedia fetch ----------------------------------------
async function fetchWikiInfo(name, org) {
    // Try direct name first, then name+org search as fallback
    const tryTitle = async (title) => {
        try {
            const r = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
                { headers: { 'Accept': 'application/json' } }
            );
            if (!r.ok) return null;
            const d = await r.json();
            if (d.type === 'disambiguation' || !d.extract) return null;
            return { bio: d.extract, headshotUrl: d.thumbnail?.source || null };
        } catch(e) { return null; }
    };

    // 1. Direct name lookup
    let result = await tryTitle(name);
    if (result) return result;

    // 2. Search API with name + org
    try {
        const q = [name, org].filter(Boolean).join(' ');
        const r = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&format=json&origin=*`
        );
        const d = await r.json();
        const hit = d.query?.search?.[0];
        if (hit) {
            result = await tryTitle(hit.title);
            if (result) return result;
        }
    } catch(e) { /* no search result */ }

    return null;
}

// ---- Modal open/close ---------------------------------------
function openFacebookExport() {
    const invitees = state.invitees || [];
    if (!invitees.length) { showToast('No guests to export', 'error'); return; }
    document.getElementById('fb-export-modal')?.classList.add('active');
    renderFbDirectoryList();
}
window.openFacebookExport = openFacebookExport;

function closeFacebookExport() {
    document.getElementById('fb-export-modal')?.classList.remove('active');
}
window.closeFacebookExport = closeFacebookExport;

// ---- Directory list render ----------------------------------
function renderFbDirectoryList() {
    const list = document.getElementById('fb-dir-list');
    if (!list) return;
    const invitees = (state.invitees || [])
        .filter(inv => (inv.status || 'pending') !== 'declined')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!invitees.length) {
        list.innerHTML = '<div style="padding:1rem;text-align:center;color:rgba(255,255,255,0.3);font-size:0.82rem">No guests</div>';
        return;
    }

    const ph = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    list.innerHTML = invitees.map(inv => {
        const excl    = !!inv.excludeFromFacebook;
        const hasPhoto = inv.headshotUrl?.trim();
        const hasBio   = inv.bio?.trim();
        const sub      = [inv.title, inv.organization].filter(Boolean).map(s => s.replace(/</g,'&lt;')).join(', ');
        const thumb    = hasPhoto
            ? `<img class="fb-dir-thumb" src="${escapeHtml(inv.headshotUrl)}" alt="" onerror="this.style.display='none'">`
            : `<div class="fb-dir-thumb-ph">${ph}</div>`;
        const photoBadge = `<span class="fb-dir-badge ${hasPhoto ? 'fb-dir-badge-ok' : 'fb-dir-badge-miss'}">📷 ${hasPhoto ? '✓' : '✗'}</span>`;
        const bioBadge   = `<span class="fb-dir-badge ${hasBio   ? 'fb-dir-badge-ok' : 'fb-dir-badge-miss'}">bio ${hasBio ? '✓' : '✗'}</span>`;
        const fetchBtn   = (!hasPhoto || !hasBio)
            ? `<button class="fb-dir-fetch-one" id="fb-fetch-${inv.id}" onclick="fetchOneFbGuest('${inv.id}')">Fetch</button>`
            : '';
        const exclBtn = `<button class="fb-dir-fetch-one" onclick="toggleFbExclude('${inv.id}')" title="${excl ? 'Include' : 'Exclude'}" style="color:${excl?'rgba(252,129,129,0.6)':'rgba(255,255,255,0.25)'}">${excl ? 'Excluded' : '—'}</button>`;

        return `<div class="fb-dir-row" id="fb-row-${inv.id}" style="${excl?'opacity:0.4':''}">
            ${thumb}
            <div class="fb-dir-info">
                <div class="fb-dir-name">${(inv.name||'').replace(/</g,'&lt;')}</div>
                ${sub ? `<div class="fb-dir-sub">${sub}</div>` : ''}
            </div>
            <div class="fb-dir-badges">${photoBadge}${bioBadge}</div>
            ${fetchBtn}
            ${exclBtn}
        </div>`;
    }).join('');
}

// ---- Per-guest fetch ----------------------------------------
async function fetchOneFbGuest(invId) {
    const inv = (state.invitees || []).find(i => i.id === invId);
    if (!inv) return;

    const btn = document.getElementById(`fb-fetch-${invId}`);
    if (btn) { btn.textContent = '…'; btn.disabled = true; }

    const result = await fetchWikiInfo(inv.name, inv.organization);
    const updates = {};
    if (result) {
        if (!inv.bio?.trim()         && result.bio)         { inv.bio         = result.bio;         updates.bio         = result.bio; }
        if (!inv.headshotUrl?.trim() && result.headshotUrl) { inv.headshotUrl = result.headshotUrl; updates.headshotUrl = result.headshotUrl; }
    }
    if (Object.keys(updates).length && collections.invitees) {
        try { await collections.invitees.doc(invId).update(updates); }
        catch(e) { console.error('fetchOneFbGuest save:', e); }
    }
    renderFbDirectoryList();
    if (!result || (!result.bio && !result.headshotUrl)) {
        showToast(`No Wikipedia entry found for "${inv.name}"`, 'error');
    }
}
window.fetchOneFbGuest = fetchOneFbGuest;

// ---- Batch fetch --------------------------------------------
async function fetchAllMissingFbInfo() {
    const btn = document.getElementById('fb-fetch-all-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

    const missing = (state.invitees || []).filter(inv =>
        (inv.status || 'pending') !== 'declined' &&
        !inv.excludeFromFacebook &&
        (!inv.bio?.trim() || !inv.headshotUrl?.trim())
    );

    let found = 0;
    for (const inv of missing) {
        const result = await fetchWikiInfo(inv.name, inv.organization);
        if (result) {
            const updates = {};
            if (!inv.bio?.trim()         && result.bio)         { inv.bio         = result.bio;         updates.bio         = result.bio; }
            if (!inv.headshotUrl?.trim() && result.headshotUrl) { inv.headshotUrl = result.headshotUrl; updates.headshotUrl = result.headshotUrl; }
            if (Object.keys(updates).length) {
                found++;
                if (collections.invitees) {
                    try { await collections.invitees.doc(inv.id).update(updates); }
                    catch(e) { console.error('fetchAllMissingFbInfo save:', e); }
                }
            }
        }
    }
    renderFbDirectoryList();
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Fetch Missing Info`; }
    showToast(found > 0 ? `Found info for ${found} guest${found!==1?'s':''}` : 'No new info found — guests may not be on Wikipedia', found > 0 ? 'success' : 'error');
}
window.fetchAllMissingFbInfo = fetchAllMissingFbInfo;

// ---- Exclude toggle -----------------------------------------
async function toggleFbExclude(invId) {
    const inv = (state.invitees || []).find(i => i.id === invId);
    if (!inv) return;
    inv.excludeFromFacebook = !inv.excludeFromFacebook;
    renderFbDirectoryList();
    if (collections.invitees) {
        try { await collections.invitees.doc(invId).update({ excludeFromFacebook: inv.excludeFromFacebook }); }
        catch(e) { console.error('toggleFbExclude:', e); }
    }
}
window.toggleFbExclude = toggleFbExclude;

// ---- Generate PDF -------------------------------------------
function generateGuestDirectoryPdf() {
    const event    = state.activeEvent || {};
    const invitees = (state.invitees || [])
        .filter(inv => !inv.excludeFromFacebook && (inv.status || 'pending') !== 'declined')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!invitees.length) { showToast('No guests to include', 'error'); return; }

    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const guestEntryHtml = (inv) => {
        const photoHtml = inv.headshotUrl?.trim()
            ? `<img class="g-photo" src="${esc(inv.headshotUrl)}" alt="" onerror="this.style.display='none'">`
            : `<div class="g-photo-ph"><svg viewBox="0 0 24 24" fill="none" stroke="#c0b4a8" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" width="48" height="48"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
        const bio = inv.bio?.trim()
            ? esc(inv.bio.length > 400 ? inv.bio.slice(0,400).trimEnd() + '…' : inv.bio)
            : '';
        const invitedBy = inv.invitedBy?.trim()
            ? `<div class="g-invited">Invited by ${esc(inv.invitedBy)}</div>` : '';
        return `<div class="g-entry">
            ${photoHtml}
            <div class="g-info">
                <div class="g-name">${esc(inv.name||'')}</div>
                ${inv.title    ? `<div class="g-title">${esc(inv.title)}</div>` : ''}
                ${inv.organization ? `<div class="g-org">${esc(inv.organization)}</div>` : ''}
                ${bio ? `<div class="g-bio">${bio}</div>` : ''}
                ${invitedBy}
            </div>
        </div>`;
    };

    // Pair up guests into spreads (2 per page)
    const pairs = [];
    for (let i = 0; i < invitees.length; i += 2) {
        pairs.push([invitees[i], invitees[i+1] || null]);
    }

    const spreadsHtml = pairs.map((pair, idx) => {
        const isLast = idx === pairs.length - 1;
        return `<div class="spread${isLast ? '' : ' pb'}">
            ${guestEntryHtml(pair[0])}
            ${pair[1] ? `<div class="divider"></div>${guestEntryHtml(pair[1])}` : ''}
        </div>`;
    }).join('\n');

    let eventDate = '';
    if (event.date) {
        try { eventDate = new Date(event.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}); }
        catch(e) { eventDate = event.date; }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(event.name||'Guest Directory')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#f4efe9;font-family:'Inter',sans-serif;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Cover */
.cover{width:100%;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 10% 0;position:relative}
.c-rule{width:50px;height:2px;background:#b05c38;margin-bottom:22px}
.c-title{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5vw,58px);font-weight:600;line-height:1.1;max-width:80%;color:#1a1a1a}
.c-sub{margin-top:18px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#999}
.c-count{margin-top:8px;font-size:13px;color:#bbb}
.c-date{margin-top:6px;font-size:13px;color:#bbb}
.c-bar{position:absolute;bottom:0;left:0;right:0;height:7px;background:#b05c38}
/* Spreads */
.spread{min-height:100vh;display:flex;flex-direction:column}
.pb{page-break-after:always;break-after:page}
.g-entry{flex:1;display:flex;align-items:flex-start;gap:32px;padding:44px 64px;max-height:50vh;overflow:hidden}
.g-photo{width:175px;min-width:175px;height:215px;object-fit:cover;object-position:center top;flex-shrink:0;border-radius:2px}
.g-photo-ph{width:175px;min-width:175px;height:215px;background:#ebe4dc;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:2px}
.g-info{flex:1;padding-top:6px}
.g-name{font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;line-height:1.1;margin-bottom:6px}
.g-title{font-size:13px;font-weight:600;color:#b05c38;margin-bottom:2px}
.g-org{font-size:12.5px;color:#888;margin-bottom:13px}
.g-bio{font-size:13px;line-height:1.68;color:#2a2a2a;max-height:115px;overflow:hidden}
.g-invited{margin-top:14px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#bbb}
.divider{height:1px;background:#ddd5cb;margin:0 64px}
@media print{
  body{background:#f4efe9!important}
  .pb{page-break-after:always;break-after:page}
  .cover{page-break-after:always;break-after:page}
  @page{size:letter portrait;margin:0}
}
</style>
</head>
<body>
<div class="cover">
  <div class="c-rule"></div>
  <div class="c-title">${esc(event.name||'Guest Directory')}</div>
  <div class="c-sub">Guest Directory</div>
  <div class="c-count">${invitees.length} Guest${invitees.length!==1?'s':''}</div>
  ${eventDate ? `<div class="c-date">${eventDate}</div>` : ''}
  <div class="c-bar"></div>
</div>
${spreadsHtml}
<script>window.onload=()=>{window.print()}<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { showToast('Allow pop-ups to generate the PDF', 'error'); return; }
    win.document.write(html);
    win.document.close();
}
window.generateGuestDirectoryPdf = generateGuestDirectoryPdf;

// ── CSV Export ───────────────────────────────────────────────
function exportGuestCSV() {
    const invitees = state.invitees || [];
    if (!invitees.length) { showToast('No guests to export', 'error'); return; }
    const headers = GUEST_FIELD_ORDER.map(f => GUEST_HEADER_LABELS[f]);
    const rows = invitees.map(inv =>
        GUEST_FIELD_ORDER.map(f => `"${(inv[f]||'').toString().replace(/"/g,'""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    const a   = Object.assign(document.createElement('a'), { href: url, download: `guest-list.csv` });
    a.click();
    URL.revokeObjectURL(url);
}
window.exportGuestCSV = exportGuestCSV;

// Window exports
window.editSeatingCell = editSeatingCell;
window.deleteGuest = deleteGuest;
window.duplicateGuest = duplicateGuest;
window.openGuestModal = openGuestModal;
window.setSeatingView = setSeatingView;
window.handleSeatingSearch = handleSeatingSearch;
window.toggleSeatingUnassignedOnly = toggleSeatingUnassignedOnly;
window.handleSeatingPanelSearch = handleSeatingPanelSearch;
window.seatGuest = seatGuest;
window.unseatGuest = unseatGuest;
window.setTableCapacity = setTableCapacity;
window.importGuestsFromXlsx = importGuestsFromXlsx;
window.exportSeatingToXlsx = exportSeatingToXlsx;

// =============================================
// QUOTE PAGE
// =============================================

const QUOTE_SECTIONS = [
    { key: 'talent',    label: 'Talent' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'labor',     label: 'Labor' },
];

function quoteLineSection(line) {
    const key = line.section || 'talent';
    return QUOTE_SECTIONS.some(s => s.key === key) ? key : 'talent';
}

function quoteLineSubtotal(line) {
    return (parseFloat(line.qty) || 0) * (parseFloat(line.unitCost) || 0);
}

function renderQuoteLineRow(line) {
    const sub = quoteLineSubtotal(line);
    // A line that's just been added and never filled in (blank description,
    // no rate, no notes) shouldn't show up as a "Description… / Notes…"
    // ghost row in the exported PDF — same idea as the discount row.
    const isEmpty = !line.description && !(parseFloat(line.unitCost) > 0) && !line.notes;
    return `<tr class="quote-line-row${isEmpty ? ' is-empty' : ''}">
        <td class="quote-td-desc">
            <input class="quote-cell-input" value="${escapeHtml(line.description || '')}" placeholder="Description…" onblur="saveQuoteField('${line.id}','description',this.value)">
        </td>
        <td class="quote-td-qty">
            <input class="quote-cell-input quote-cell-num" type="number" min="0" value="${line.qty || ''}" placeholder="1" onblur="saveQuoteField('${line.id}','qty',parseFloat(this.value)||0)">
        </td>
        <td class="quote-td-cost">
            <input class="quote-cell-input quote-cell-num" type="number" min="0" step="0.01" value="${line.unitCost || ''}" placeholder="0.00" onblur="saveQuoteField('${line.id}','unitCost',parseFloat(this.value)||0)">
        </td>
        <td class="quote-td-sub">${sub > 0 ? '$' + sub.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
        <td class="quote-td-notes">
            <input class="quote-cell-input" value="${escapeHtml(line.notes || '')}" placeholder="Notes…" onblur="saveQuoteField('${line.id}','notes',this.value)">
        </td>
        <td class="quote-td-del no-print">
            <button class="btn-icon-sm delete" onclick="deleteQuoteLine('${line.id}')" title="Remove">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
        </td>
    </tr>`;
}

function renderQuote() {
    if (state.currentPage !== 'quote') return;
    const ev = state.activeEvent || {};

    // Title defaults to the event's name so each event's quote is distinguishable
    // out of the box, but stays freely editable/overridable per event.
    const titleEl = document.getElementById('quote-title-input');
    if (titleEl && document.activeElement !== titleEl) titleEl.value = ev.quoteTitle || ev.name || 'Quote';

    // Populate event detail fields (only if not focused to avoid clobbering typing)
    const fields = [
        ['quote-location',   ev.quoteLocation  || ''],
        ['quote-date',       ev.quoteDate       || (ev.date ? formatDate(ev.date) : '')],
        ['quote-load-in',    ev.quoteLoadIn     || ''],
        ['quote-event-time', ev.quoteEventTime  || ''],
        ['quote-load-out',   ev.quoteLoadOut    || ''],
        ['quote-client',     ev.quoteClient     || ''],
    ];
    fields.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = val;
    });

    // Render line items, grouped into Talent / Equipment / Labor sections
    const lines = [...state.quoteLines].sort((a, b) => (a.order || 0) - (b.order || 0));
    const tbody = document.getElementById('quote-lines-body');
    if (!tbody) return;

    tbody.innerHTML = QUOTE_SECTIONS.map(sec => {
        const secLines = lines.filter(l => quoteLineSection(l) === sec.key);
        const secTotal = secLines.reduce((sum, l) => sum + quoteLineSubtotal(l), 0);
        const rowsHtml = secLines.length
            ? secLines.map(renderQuoteLineRow).join('')
            : `<tr class="quote-empty-row"><td colspan="6">No ${escapeHtml(sec.label.toLowerCase())} items yet.</td></tr>`;
        return `
            <tr class="quote-section-header"><td colspan="6">${escapeHtml(sec.label)}</td></tr>
            ${rowsHtml}
            <tr class="quote-add-row no-print">
                <td colspan="6"><button class="quote-add-line-btn" onclick="addQuoteLine('${sec.key}')" type="button">+ Add ${escapeHtml(sec.label)}</button></td>
            </tr>
            <tr class="quote-subtotal-row">
                <td class="quote-subtotal-label" colspan="3">${escapeHtml(sec.label)} Subtotal</td>
                <td class="quote-subtotal-amount">$${secTotal.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td colspan="2"></td>
            </tr>`;
    }).join('');

    // Optional discount (%) — the whole row only shows on export/print when
    // it's actually filled out; the Grand Total below always shows.
    const discountPct = parseFloat(ev.quoteDiscountPct) || 0;
    const discountEl = document.getElementById('quote-discount-input');
    if (discountEl && document.activeElement !== discountEl) discountEl.value = ev.quoteDiscountPct || '';
    const discountRow = document.getElementById('quote-discount-row');
    if (discountRow) discountRow.classList.toggle('is-empty', discountPct <= 0);

    // Grand total across all sections, minus the discount
    const subtotal = lines.reduce((sum, l) => sum + quoteLineSubtotal(l), 0);
    const total = subtotal - (subtotal * (discountPct / 100));
    const totalStr = (total < 0 ? '-$' : '$') + Math.abs(total).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});

    const discountTotalEl = document.getElementById('quote-discount-total');
    if (discountTotalEl) discountTotalEl.textContent = totalStr;

    const totalEl = document.getElementById('quote-grand-total');
    if (totalEl) totalEl.textContent = totalStr;
}

window.saveQuoteMeta = async function(field, value) {
    if (!state.currentEventId) return;
    try {
        await db.collection('events').doc(state.currentEventId).update({ [field]: value });
        if (state.activeEvent) state.activeEvent[field] = value;
        // state.activeEvent has no live listener (it's fetched once on enterEvent),
        // so a re-render has to be triggered explicitly — needed for the discount
        // %, which recomputes the total from this field.
        renderQuote();
    } catch(err) { showToast('Error saving', 'error'); }
};

window.saveQuoteField = async function(lineId, field, value) {
    if (!state.currentEventId) return;
    try {
        await db.collection('events').doc(state.currentEventId).collection('quoteLines').doc(lineId).update({ [field]: value });
    } catch(err) { showToast('Error saving', 'error'); }
};

window.addQuoteLine = async function(section = 'talent') {
    showToast('Adding…', 'info');
    if (!state.currentEventId) { showToast('No event selected', 'error'); return; }
    try {
        const ref = db.collection('events').doc(state.currentEventId).collection('quoteLines');
        await ref.add({
            section,
            description: '',
            qty: 1,
            unitCost: 0,
            notes: '',
            order: Date.now(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch(err) { showToast('Error adding line: ' + err.message, 'error'); console.error(err); }
};

window.deleteQuoteLine = async function(lineId) {
    if (!state.currentEventId) return;
    try {
        await db.collection('events').doc(state.currentEventId).collection('quoteLines').doc(lineId).delete();
    } catch(err) { showToast('Error deleting line', 'error'); }
};

window.printQuote = function() {
    // CSS alone (input::placeholder { color: transparent } in the print
    // media block) only hides the ink — the placeholder text ("0.00",
    // "Notes…") is still painted and ends up in the exported PDF's text
    // layer (selectable, and read aloud by screen readers) even though it's
    // invisible on the page. Strip the attribute from empty fields entirely
    // before printing, then restore it for normal on-screen editing.
    const stripped = [];
    document.querySelectorAll('#quote input[placeholder]').forEach(el => {
        if (!el.value) {
            el.dataset.printPlaceholder = el.placeholder;
            el.removeAttribute('placeholder');
            stripped.push(el);
        }
    });
    document.body.classList.add('printing-quote');
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove('printing-quote');
        window.removeEventListener('afterprint', cleanup);
        stripped.forEach(el => {
            el.setAttribute('placeholder', el.dataset.printPlaceholder);
            delete el.dataset.printPlaceholder;
        });
    };
    window.addEventListener('afterprint', cleanup);
    requestAnimationFrame(() => {
        window.print();
        setTimeout(cleanup, 2000);
    });
};

window.renderQuote = renderQuote;
