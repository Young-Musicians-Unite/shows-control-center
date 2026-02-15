// Global state
const state = {
    vendors: [],
    budget: [],
    timeline: [],
    mainStageInputs: [],
    cocktailStageInputs: [],
    staff: [],
    stagePlots: [],
    currentPage: 'dashboard',
    currentDay: 'Thursday',  // For timeline filtering
    currentStage: 'main',  // For stage input filtering
    currentStagePlotType: 'main',  // For stage plot tabs
    currentPlotId: null,  // Currently selected plot
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
    isInteracting: false  // Flag to prevent canvas resize during user interaction
};

// Event date
const eventDate = new Date('April 25, 2026 18:00:00');

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
    setupSearchAndFilter();
    setupDayTabs();
    setupStageTabs();
    setupExportAndPrint();
    setupStagePlotTabs();
    setupStagePlotControls();
    setupZoomControls();
    setupUndoRedo();
    setupKeyboardShortcuts();
    setupPlotNameInput();
}

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

            // Close mobile menu when clicking a link
            closeHamburgerMenu();
        });
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
    }
}

function switchPage(pageName) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(pageName);
    if (targetPage) {
        targetPage.classList.add('active');
        state.currentPage = pageName;

        // Refresh data for the page
        if (pageName === 'dashboard') updateDashboard();
        if (pageName === 'vendors') renderVendors();
        if (pageName === 'budget') renderBudget();
        if (pageName === 'timeline') renderTimeline();
        if (pageName === 'input-lists') renderStageInputs();
        if (pageName === 'staff') renderStaff();
        if (pageName === 'stage-plots') initializeStagePlots();
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
    setupCollectionListener('vendors', 'vendors', [renderVendors, updateDashboard]);
    setupCollectionListener('budget', 'budget', [renderBudget, updateDashboard]);
    setupCollectionListener('timeline', 'timeline', [renderTimeline, updateDashboard]);
    setupCollectionListener('mainStageInputs', 'mainStageInputs', [renderStageInputs]);
    setupCollectionListener('cocktailStageInputs', 'cocktailStageInputs', [renderStageInputs]);
    setupCollectionListener('staff', 'staff', [renderStaff]);
    setupCollectionListener('stagePlots', 'stagePlots', [updatePlotSelector]);
}

// Dashboard
function updateDashboard() {
    updateBudgetStats();
    updateVendorStats();
    updateTimelineStats();
    updateUpcomingDeadlines();
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
    const confirmed = state.vendors.filter(v => v.status === 'confirmed').length;
    const pending = state.vendors.filter(v => v.status === 'pending').length;
    const issues = state.vendors.filter(v => v.status === 'issue').length;

    document.getElementById('vendors-confirmed').textContent = confirmed;
    document.getElementById('vendor-confirmed-count').textContent = confirmed;
    document.getElementById('vendor-pending-count').textContent = pending;
    document.getElementById('vendor-issue-count').textContent = issues;
}

function updateTimelineStats() {
    const total = state.timeline.length;
    const completed = state.timeline.filter(t => t.status === 'complete').length;
    const inProgress = state.timeline.filter(t => t.status === 'in-progress').length;
    const overdue = state.timeline.filter(t => {
        if (!t.dueDate || t.status === 'complete') return false;
        return new Date(t.dueDate) < new Date();
    }).length;

    document.getElementById('timeline-total').textContent = total;
    document.getElementById('timeline-completed').textContent = completed;
    document.getElementById('timeline-in-progress').textContent = inProgress;
    document.getElementById('timeline-overdue').textContent = overdue;
}

function updateUpcomingDeadlines() {
    const now = new Date();
    const upcoming = state.timeline
        .filter(t => t.dueDate && t.status !== 'complete')
        .map(t => ({
            ...t,
            dueDateObj: new Date(t.dueDate)
        }))
        .sort((a, b) => a.dueDateObj - b.dueDateObj)
        .slice(0, 5);

    const container = document.getElementById('upcoming-deadlines');

    if (upcoming.length === 0) {
        container.innerHTML = '<p class="empty-state">No upcoming deadlines</p>';
        return;
    }

    container.innerHTML = upcoming.map(item => {
        const isOverdue = item.dueDateObj < now;
        const daysUntil = Math.ceil((item.dueDateObj - now) / (1000 * 60 * 60 * 24));

        return `
            <div class="deadline-item ${isOverdue ? 'overdue' : ''}">
                <div class="deadline-info">
                    <div class="deadline-task">${escapeHtml(item.task)}</div>
                    <div class="deadline-date">
                        ${formatDate(item.dueDate)}
                        ${item.responsible ? ` • ${escapeHtml(item.responsible)}` : ''}
                    </div>
                </div>
                <span class="deadline-badge ${isOverdue ? 'overdue' : 'upcoming'}">
                    ${isOverdue ? `${Math.abs(daysUntil)} days overdue` : `${daysUntil} days`}
                </span>
            </div>
        `;
    }).join('');
}

// Vendors
function renderVendors() {
    const tbody = document.getElementById('vendors-tbody');
    const filtered = getFilteredVendors();

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No vendors found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(vendor => `
        <tr>
            <td>${escapeHtml(vendor.vendor || '')}</td>
            <td>${escapeHtml(vendor.category || '')}</td>
            <td>
                ${vendor.contact ? escapeHtml(vendor.contact) + '<br>' : ''}
                ${vendor.phone ? `<small>${escapeHtml(vendor.phone)}</small><br>` : ''}
                ${vendor.email ? `<small>${escapeHtml(vendor.email)}</small>` : ''}
            </td>
            <td>${vendor.budgeted ? formatCurrency(vendor.budgeted) : '-'}</td>
            <td>${vendor.actual ? formatCurrency(vendor.actual) : '-'}</td>
            <td><span class="status-badge ${vendor.paymentStatus}">${formatPaymentStatus(vendor.paymentStatus)}</span></td>
            <td>
                <button class="btn btn-edit" onclick="editBudgetItem('${vendor.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteBudgetItem('${vendor.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function getFilteredVendors() {
    // Read from budget collection instead of vendors
    let filtered = [...state.budget];

    const searchTerm = document.getElementById('vendor-search')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('vendor-category-filter')?.value || '';
    const statusFilter = document.getElementById('vendor-status-filter')?.value || '';

    if (searchTerm) {
        filtered = filtered.filter(v =>
            (v.vendor || '').toLowerCase().includes(searchTerm) ||
            (v.contact || '').toLowerCase().includes(searchTerm) ||
            (v.email || '').toLowerCase().includes(searchTerm)
        );
    }

    if (categoryFilter) {
        filtered = filtered.filter(v => v.category === categoryFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(v => v.paymentStatus === statusFilter);
    }

    return filtered;
}

// Budget
function renderBudget() {
    renderBudgetCategories();
    renderBudgetGrouped();
}

function renderBudgetCategories() {
    const container = document.getElementById('budget-categories');

    if (state.budget.length === 0) {
        container.innerHTML = '<p class="empty-state">No budget items</p>';
        return;
    }

    // Group by category
    const categories = {};
    state.budget.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categories[cat]) {
            categories[cat] = { budgeted: 0, actual: 0 };
        }
        categories[cat].budgeted += parseFloat(item.budgeted) || 0;
        categories[cat].actual += parseFloat(item.actual) || 0;
    });

    container.innerHTML = Object.entries(categories).map(([name, data]) => {
        const percentage = data.budgeted > 0 ? (data.actual / data.budgeted * 100) : 0;
        const remaining = data.budgeted - data.actual;

        return `
            <div class="budget-category">
                <div class="budget-category-header">
                    <div class="budget-category-name">${escapeHtml(name)}</div>
                    <div class="budget-category-amounts">
                        <div class="budget-amount">
                            <span class="budget-amount-label">Budgeted</span>
                            <span class="budget-amount-value">${formatCurrency(data.budgeted)}</span>
                        </div>
                        <div class="budget-amount">
                            <span class="budget-amount-label">Spent</span>
                            <span class="budget-amount-value">${formatCurrency(data.actual)}</span>
                        </div>
                        <div class="budget-amount">
                            <span class="budget-amount-label">Remaining</span>
                            <span class="budget-amount-value">${formatCurrency(remaining)}</span>
                        </div>
                    </div>
                </div>
                <div class="budget-category-progress">
                    <div class="budget-category-progress-fill" style="width: ${Math.min(percentage, 100)}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Render Budget Grouped by Category (Collapsible Sections)
function renderBudgetGrouped() {
    const container = document.getElementById('budget-grouped-container');

    if (state.budget.length === 0) {
        container.innerHTML = '<div class="card"><div class="card-body"><p class="empty-state">No budget items</p></div></div>';
        return;
    }

    // Group items by category
    const categorized = {};
    state.budget.forEach(item => {
        const cat = item.category || 'Uncategorized';
        if (!categorized[cat]) {
            categorized[cat] = [];
        }
        categorized[cat].push(item);
    });

    // Calculate totals for each category
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

    // Render each category as a collapsible card (default: collapsed)
    container.innerHTML = sortedCategories.map(([category, items]) => {
        const totals = categoryTotals[category];
        const categoryId = category.replace(/[^a-zA-Z0-9]/g, '_');

        return `
            <div class="card budget-category-section">
                <div class="card-header category-section-header" onclick="toggleCategorySection('${categoryId}')">
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                        <span class="category-arrow" id="arrow-${categoryId}">▶</span>
                        <h3 style="margin: 0;">${escapeHtml(category)}</h3>
                        <span class="category-count">${totals.count} items</span>
                    </div>
                    <div style="display: flex; gap: 1.5rem; font-size: 0.95rem;">
                        <span><strong>Budgeted:</strong> ${formatCurrency(totals.budgeted)}</span>
                        <span><strong>Spent:</strong> ${formatCurrency(totals.actual)}</span>
                        <span><strong>Remaining:</strong> ${formatCurrency(totals.budgeted - totals.actual)}</span>
                    </div>
                </div>
                <div class="category-section-content" id="content-${categoryId}" style="display: none;">
                    <div class="table-container">
                        <table class="data-table budget-table">
                            <thead>
                                <tr>
                                    <th>Vendor/Item</th>
                                    <th>Budgeted</th>
                                    <th>Actual</th>
                                    <th>Difference</th>
                                    <th>Payment Status</th>
                                    <th>Notes</th>
                                    <th class="no-print">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => {
                                    const budgeted = parseFloat(item.budgeted) || 0;
                                    const actual = parseFloat(item.actual) || 0;
                                    const difference = budgeted - actual;
                                    const diffClass = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';

                                    return `
                                        <tr data-id="${item.id}" ondblclick="makeBudgetRowEditable(this)">
                                            <td data-field="vendor" data-original="${escapeHtml(item.vendor || '')}">${escapeHtml(item.vendor || '')}</td>
                                            <td data-field="budgeted" data-original="${budgeted}">${formatCurrency(budgeted)}</td>
                                            <td data-field="actual" data-original="${actual}">${formatCurrency(actual)}</td>
                                            <td class="${diffClass}">${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}</td>
                                            <td data-field="paymentStatus" data-original="${item.paymentStatus || 'not-paid'}">
                                                <span class="status-badge ${item.paymentStatus}">${formatPaymentStatus(item.paymentStatus)}</span>
                                            </td>
                                            <td data-field="notes" data-original="${escapeHtml(item.notes || '')}">${escapeHtml(item.notes || '')}</td>
                                            <td class="actions no-print">
                                                <button class="btn btn-danger" onclick="deleteBudgetItem('${item.id}')">Delete</button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Timeline
function renderTimeline() {
    const tbody = document.getElementById('timeline-tbody');

    // Filter by current day
    const filteredTimeline = state.timeline.filter(item => item.day === state.currentDay);

    // Update day title and subtitle
    const dayTitle = document.getElementById('timeline-day-title');
    const dateSubtitle = document.getElementById('timeline-date-subtitle');
    const dateMap = {
        'Thursday': 'April 23, 2026',
        'Friday': 'April 24, 2026',
        'Saturday': 'April 25, 2026'
    };

    if (dayTitle) {
        dayTitle.textContent = `${state.currentDay} Timeline`;
    }
    if (dateSubtitle) {
        dateSubtitle.textContent = dateMap[state.currentDay] || '';
    }

    if (filteredTimeline.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No tasks for this day</td></tr>';
        return;
    }

    // Sort by time
    const sorted = [...filteredTimeline].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    tbody.innerHTML = sorted.map(item => {
        const isComplete = item.completed === true;

        return `
            <tr class="${isComplete ? 'task-completed' : ''}"
                data-id="${item.id}"
                ondblclick="makeRowEditable(this)">
                <td class="checkbox-col">
                    <input type="checkbox"
                           ${isComplete ? 'checked' : ''}
                           onchange="toggleTaskComplete('${item.id}', this.checked)">
                </td>
                <td class="time-col" data-field="time" data-original="${escapeHtml(item.time || '')}">${formatTime12Hour(item.time)}</td>
                <td class="event-col ${isComplete ? 'task-completed' : ''}" data-field="event" data-original="${escapeHtml(item.event || '')}">${escapeHtml(item.event || '')}</td>
                <td class="responsible-col" data-field="responsible" data-original="${escapeHtml(item.responsible || '')}">${escapeHtml(item.responsible || '')}</td>
                <td class="staff-col" data-field="staff" data-original="${escapeHtml(item.staff || '')}">${escapeHtml(item.staff || '')}</td>
                <td class="actions-col no-print">
                    <button class="btn btn-danger" onclick="deleteTimelineItem('${item.id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
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
    document.getElementById('add-vendor-btn').addEventListener('click', () => openVendorModal());
    document.getElementById('add-budget-item-btn').addEventListener('click', () => openBudgetModal());
    document.getElementById('add-timeline-item-btn').addEventListener('click', () => openTimelineModal());
    document.getElementById('add-staff-btn').addEventListener('click', () => openStaffModal());
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
                element.value = data[dataKey] || '';
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

function openVendorModal(vendorId = null) {
    openModal({
        modalId: 'vendor-modal',
        formId: 'vendor-form',
        idFieldId: 'vendor-id',
        itemId: vendorId,
        stateKey: 'vendors',
        title: 'Vendor',
        fieldMap: {
            'vendor-name': 'name',
            'vendor-category': 'category',
            'vendor-contact': 'contactPerson',
            'vendor-email': 'email',
            'vendor-phone': 'phone',
            'vendor-amount': 'amount',
            'vendor-status': 'status',
            'vendor-payment-status': 'paymentStatus',
            'vendor-notes': 'notes'
        },
        defaultValues: {
            'vendor-status': 'pending',
            'vendor-payment-status': 'not-paid'
        }
    });
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
            'budget-category': 'category',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes'
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
            'timeline-task': 'task',
            'timeline-due-date': 'dueDate',
            'timeline-status': 'status',
            'timeline-responsible': 'responsible',
            'timeline-notes': 'notes'
        },
        defaultValues: {
            'timeline-status': 'not-started'
        }
    });
}

// Form Handlers
function setupFormHandlers() {
    document.getElementById('vendor-form').addEventListener('submit', handleVendorSubmit);
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('timeline-form').addEventListener('submit', handleTimelineSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
}

// Generic form submission handler
async function handleFormSubmit(e, config) {
    e.preventDefault();

    const data = {};
    Object.entries(config.fieldMap).forEach(([fieldId, dataKey]) => {
        const element = document.getElementById(fieldId);
        let value = element.value;

        // Handle number fields
        if (config.numericFields && config.numericFields.includes(dataKey)) {
            value = parseFloat(value) || 0;
        }

        data[dataKey] = value;
    });

    data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const id = document.getElementById(config.idFieldId).value;

    try {
        if (id) {
            await collections[config.collection].doc(id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections[config.collection].add(data);
        }
        closeAllModals();
    } catch (error) {
        console.error(`Error saving ${config.collection}:`, error);
        alert(`Error saving ${config.itemName}. Please try again.`);
    }
}

async function handleVendorSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'vendors',
        idFieldId: 'vendor-id',
        itemName: 'vendor',
        fieldMap: {
            'vendor-name': 'name',
            'vendor-category': 'category',
            'vendor-contact': 'contactPerson',
            'vendor-email': 'email',
            'vendor-phone': 'phone',
            'vendor-amount': 'amount',
            'vendor-status': 'status',
            'vendor-payment-status': 'paymentStatus',
            'vendor-notes': 'notes'
        },
        numericFields: ['amount']
    });
}

async function handleBudgetSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'budget',
        idFieldId: 'budget-id',
        itemName: 'budget item',
        fieldMap: {
            'budget-vendor': 'vendor',
            'budget-category': 'category',
            'budget-contact': 'contact',
            'budget-phone': 'phone',
            'budget-email': 'email',
            'budget-budgeted': 'budgeted',
            'budget-actual': 'actual',
            'budget-payment-status': 'paymentStatus',
            'budget-notes': 'notes'
        },
        numericFields: ['budgeted', 'actual']
    });
}

async function handleTimelineSubmit(e) {
    await handleFormSubmit(e, {
        collection: 'timeline',
        idFieldId: 'timeline-id',
        itemName: 'task',
        fieldMap: {
            'timeline-task': 'task',
            'timeline-due-date': 'dueDate',
            'timeline-status': 'status',
            'timeline-responsible': 'responsible',
            'timeline-notes': 'notes'
        },
        numericFields: []
    });
}

// Search and Filter
function setupSearchAndFilter() {
    const vendorSearch = document.getElementById('vendor-search');
    const vendorCategoryFilter = document.getElementById('vendor-category-filter');
    const vendorStatusFilter = document.getElementById('vendor-status-filter');

    if (vendorSearch) {
        vendorSearch.addEventListener('input', renderVendors);
    }

    if (vendorCategoryFilter) {
        vendorCategoryFilter.addEventListener('change', renderVendors);
    }

    if (vendorStatusFilter) {
        vendorStatusFilter.addEventListener('change', renderVendors);
    }

    // Populate category filter
    updateCategoryFilter();
}

function updateCategoryFilter() {
    const categories = [...new Set(state.vendors.map(v => v.category).filter(Boolean))];
    const select = document.getElementById('vendor-category-filter');

    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">All Categories</option>' +
            categories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
        select.value = currentValue;
    }
}

// CRUD Operations
window.editVendor = (id) => openVendorModal(id);
window.editBudgetItem = (id) => openBudgetModal(id);
window.editTimelineItem = (id) => openTimelineModal(id);

// Generic delete handler factory
function createDeleteHandler(collectionKey, itemName) {
    return async (id) => {
        if (confirm(`Are you sure you want to delete this ${itemName}?`)) {
            try {
                await collections[collectionKey].doc(id).delete();
            } catch (error) {
                console.error(`Error deleting ${itemName}:`, error);
                alert(`Error deleting ${itemName}. Please try again.`);
            }
        }
    };
}

window.deleteVendor = createDeleteHandler('vendors', 'vendor');
window.deleteBudgetItem = createDeleteHandler('budget', 'budget item');
window.deleteTimelineItem = createDeleteHandler('timeline', 'task');

window.toggleTaskComplete = async (id, completed) => {
    try {
        await collections.timeline.doc(id).update({
            status: completed ? 'complete' : 'in-progress',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating task:', error);
        alert('Error updating task. Please try again.');
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

            // Update state and re-render
            state.currentStage = stage;
            renderStageInputs();
        });
    });
}

// Export and Print Functionality
function setupExportAndPrint() {
    // Print Buttons
    const printTimelineBtn = document.getElementById('print-timeline-btn');
    const printStaffBtn = document.getElementById('print-staff-btn');

    if (printTimelineBtn) {
        printTimelineBtn.addEventListener('click', () => window.print());
    }
    if (printStaffBtn) {
        printStaffBtn.addEventListener('click', () => window.print());
    }

    // Export Buttons
    const exportTimelineBtn = document.getElementById('export-timeline-btn');
    const exportBudgetBtn = document.getElementById('export-budget-btn');
    const exportVendorsBtn = document.getElementById('export-vendors-btn');
    const exportStageBtn = document.getElementById('export-stage-btn');
    const exportStaffBtn = document.getElementById('export-staff-btn');

    if (exportTimelineBtn) {
        exportTimelineBtn.addEventListener('click', exportTimelineToExcel);
    }
    if (exportBudgetBtn) {
        exportBudgetBtn.addEventListener('click', exportBudgetToExcel);
    }
    if (exportVendorsBtn) {
        exportVendorsBtn.addEventListener('click', exportVendorsToExcel);
    }
    if (exportStageBtn) {
        exportStageBtn.addEventListener('click', exportStageInputsToExcel);
    }
    if (exportStaffBtn) {
        exportStaffBtn.addEventListener('click', exportStaffToExcel);
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

// Export Vendors to Excel
function exportVendorsToExcel() {
    // Prepare data for Excel
    const data = state.vendors.map(item => ({
        'Vendor Name': item.name || '',
        'Category': item.category || '',
        'Contact Person': item.contact || '',
        'Phone': item.phone || '',
        'Email': item.email || '',
        'Amount': parseFloat(item.amount) || 0,
        'Status': formatStatus(item.status),
        'Payment Status': formatPaymentStatus(item.paymentStatus),
        'Notes': item.notes || ''
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 25 },  // Vendor Name
        { wch: 30 },  // Category
        { wch: 20 },  // Contact Person
        { wch: 15 },  // Phone
        { wch: 25 },  // Email
        { wch: 12 },  // Amount
        { wch: 12 },  // Status
        { wch: 15 },  // Payment Status
        { wch: 40 }   // Notes
    ];

    // Add number formatting for amount column
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellRef = 'F' + (R + 1);
        if (ws[cellRef]) {
            ws[cellRef].z = '$#,##0.00';
        }
    }

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendors');

    // Download
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `YMU_Gala_Vendors_${today}.xlsx`);
}

// Inline Editing for Timeline
function makeRowEditable(row) {
    // Skip if already in edit mode
    if (row.classList.contains('editing')) return;

    row.classList.add('editing');

    // Get all editable cells (skip checkbox and actions)
    const cells = row.querySelectorAll('td[data-field]');

    cells.forEach(cell => {
        const field = cell.dataset.field;
        const original = cell.dataset.original;

        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'inline-edit-input';
        input.dataset.field = field;

        // Replace cell content with input
        cell.textContent = '';
        cell.appendChild(input);

        // Auto-focus first input
        if (field === 'time') {
            input.focus();
            input.select();
        }

        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRowChanges(row);
            } else if (e.key === 'Escape') {
                cancelRowEdit(row);
            }
        });
    });

    // Add save/cancel buttons to actions column
    const actionsCell = row.querySelector('.actions-col');
    actionsCell.innerHTML = `
        <button class="btn btn-primary" onclick="saveRowChanges(this.closest('tr'))">Save</button>
        <button class="btn btn-secondary" onclick="cancelRowEdit(this.closest('tr'))">Cancel</button>
    `;
}

function saveRowChanges(row) {
    const id = row.dataset.id;
    const inputs = row.querySelectorAll('.inline-edit-input');

    const updates = {};
    inputs.forEach(input => {
        const field = input.dataset.field;
        updates[field] = input.value;
    });

    // Convert 12hr time back to 24hr for storage
    if (updates.time) {
        updates.time = convertTo24Hour(updates.time);
    }

    // Update Firebase
    collections.timeline.doc(id).update(updates)
        .then(() => {
            // The real-time listener will update the UI automatically
        })
        .catch((error) => {
            console.error('Error updating timeline item:', error);
            alert('Error saving changes. Please try again.');
            cancelRowEdit(row);
        });
}

function cancelRowEdit(row) {
    // Simply re-render the timeline to restore original state
    renderTimeline();
}

function convertTo24Hour(time12) {
    // If already in 24hr format, return as is
    if (!time12.includes('AM') && !time12.includes('PM')) {
        return time12;
    }

    const [time, period] = time12.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours);

    if (period === 'PM' && hours !== 12) {
        hours += 12;
    } else if (period === 'AM' && hours === 12) {
        hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Budget Category Accordion Toggle
function toggleBudgetCategoryAccordion() {
    const content = document.getElementById('budget-category-accordion');
    const arrow = document.getElementById('budget-category-arrow');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.textContent = '▼';
        localStorage.setItem('budgetCategoryAccordionOpen', 'true');
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
        localStorage.setItem('budgetCategoryAccordionOpen', 'false');
    }
}

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
function makeBudgetRowEditable(row) {
    // Skip if already in edit mode
    if (row.classList.contains('editing')) return;

    row.classList.add('editing');

    // Get all editable cells
    const cells = row.querySelectorAll('td[data-field]');

    cells.forEach(cell => {
        const field = cell.dataset.field;
        const original = cell.dataset.original;

        // For payment status, create dropdown
        if (field === 'paymentStatus') {
            const select = document.createElement('select');
            select.className = 'inline-edit-input';
            select.dataset.field = field;
            select.innerHTML = `
                <option value="paid" ${original === 'paid' ? 'selected' : ''}>Paid</option>
                <option value="partial" ${original === 'partial' ? 'selected' : ''}>Partial</option>
                <option value="not-paid" ${original === 'not-paid' ? 'selected' : ''}>Not Paid</option>
            `;
            cell.textContent = '';
            cell.appendChild(select);
        }
        // For budgeted and actual, create number input
        else if (field === 'budgeted' || field === 'actual') {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.value = original;
            input.className = 'inline-edit-input';
            input.dataset.field = field;
            cell.textContent = '';
            cell.appendChild(input);

            if (field === 'budgeted') {
                input.focus();
                input.select();
            }
        }
        // For others, create text input
        else {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = original;
            input.className = 'inline-edit-input';
            input.dataset.field = field;
            cell.textContent = '';
            cell.appendChild(input);
        }

        // Add keyboard shortcuts
        const inputElement = cell.querySelector('input, select');
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveBudgetRowChanges(row);
            } else if (e.key === 'Escape') {
                cancelBudgetRowEdit(row);
            }
        });
    });

    // Add save/cancel buttons
    const actionsCell = row.querySelector('.actions');
    actionsCell.innerHTML = `
        <button class="btn btn-primary" onclick="saveBudgetRowChanges(this.closest('tr'))">Save</button>
        <button class="btn btn-secondary" onclick="cancelBudgetRowEdit(this.closest('tr'))">Cancel</button>
    `;
}

function saveBudgetRowChanges(row) {
    const id = row.dataset.id;
    const inputs = row.querySelectorAll('.inline-edit-input');

    const updates = {};
    inputs.forEach(input => {
        const field = input.dataset.field;
        updates[field] = input.value;
    });

    // Convert number fields
    if (updates.budgeted) updates.budgeted = parseFloat(updates.budgeted) || 0;
    if (updates.actual) updates.actual = parseFloat(updates.actual) || 0;

    // Update Firebase
    collections.budget.doc(id).update(updates)
        .then(() => {
            // Real-time listener will update the UI
        })
        .catch((error) => {
            console.error('Error updating budget item:', error);
            alert('Error saving changes. Please try again.');
            cancelBudgetRowEdit(row);
        });
}

function cancelBudgetRowEdit(row) {
    // Re-render budget to restore original state
    renderBudget();
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
    const tbody = document.getElementById('stage-tbody');
    const title = document.getElementById('stage-title');

    // Determine which stage to show
    const isMainStage = state.currentStage === 'main';
    const stageData = isMainStage ? state.mainStageInputs : state.cocktailStageInputs;
    const collectionName = isMainStage ? 'mainStageInputs' : 'cocktailStageInputs';
    const stageName = isMainStage ? 'Main Stage' : 'Cocktail Stage';

    // Update title
    title.textContent = `${stageName} - Audio & Technical Inputs`;

    if (stageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No inputs</td></tr>';
        return;
    }

    // Sort by channel number
    const sorted = [...stageData].sort((a, b) => {
        const aNum = parseInt(a.channel) || 0;
        const bNum = parseInt(b.channel) || 0;
        return aNum - bNum;
    });

    tbody.innerHTML = sorted.map(item => {
        return `
            <tr data-id="${item.id}" ondblclick="makeStageRowEditable(this, '${collectionName}')">
                <td data-field="channel" data-original="${escapeHtml(item.channel || '')}">${escapeHtml(item.channel || '')}</td>
                <td data-field="subsnake" data-original="${escapeHtml(item.subsnake || '')}">${escapeHtml(item.subsnake || '')}</td>
                <td data-field="instrument" data-original="${escapeHtml(item.instrument || '')}">${escapeHtml(item.instrument || '')}</td>
                <td data-field="mics" data-original="${escapeHtml(item.mics || '')}">${escapeHtml(item.mics || '')}</td>
                <td data-field="stands" data-original="${escapeHtml(item.stands || '')}">${escapeHtml(item.stands || '')}</td>
                <td data-field="notes" data-original="${escapeHtml(item.notes || '')}">${escapeHtml(item.notes || '')}</td>
                <td data-field="symbol" data-original="${escapeHtml(item.symbol || '')}">${escapeHtml(item.symbol || '')}</td>
            </tr>
        `;
    }).join('');
}

// Inline Editing for Stage Inputs
function makeStageRowEditable(row, collectionName) {
    if (row.classList.contains('editing')) return;

    row.classList.add('editing');

    const cells = row.querySelectorAll('td[data-field]');

    cells.forEach(cell => {
        const field = cell.dataset.field;
        const original = cell.dataset.original;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'inline-edit-input';
        input.dataset.field = field;

        cell.textContent = '';
        cell.appendChild(input);

        if (field === 'channel') {
            input.focus();
            input.select();
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveStageRowChanges(row, collectionName);
            } else if (e.key === 'Escape') {
                cancelStageRowEdit(collectionName);
            }
        });
    });
}

function saveStageRowChanges(row, collectionName) {
    const id = row.dataset.id;
    const inputs = row.querySelectorAll('.inline-edit-input');

    const updates = {};
    inputs.forEach(input => {
        const field = input.dataset.field;
        updates[field] = input.value;
    });

    collections[collectionName].doc(id).update(updates)
        .then(() => {
            // Stage input updated successfully
        })
        .catch((error) => {
            console.error('Error updating stage input:', error);
            alert('Error saving changes. Please try again.');
            cancelStageRowEdit(collectionName);
        });
}

function cancelStageRowEdit(collectionName) {
    if (collectionName === 'mainStageInputs') {
        renderMainStage();
    } else {
        renderCocktailStage();
    }
}

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


function renderStaff() {
    const grid = document.getElementById('staff-grid');

    if (state.staff.length === 0) {
        grid.innerHTML = '<p class="empty-state">No staff members added yet. Click "Add Staff Member" to get started.</p>';
        return;
    }

    grid.innerHTML = state.staff.map(member => `
        <div class="staff-card">
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
    `).join('');
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
        } else {
            staffData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.staff.add(staffData);
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving staff member:', error);
        alert('Error saving staff member. Please try again.');
    }
}

window.deleteStaff = createDeleteHandler('staff', 'staff member');

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

    // Auto-create a plot if none is selected (same behavior as clicking "+ New Plot")
    setTimeout(() => {
        if (!state.currentPlotId) {
            console.log('No plot selected - auto-creating new plot');
            createNewPlot();
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

    // Add event listeners for auto-save
    state.canvas.on('object:modified', () => {
        triggerAutoSave();
    });

    state.canvas.on('object:added', () => {
        triggerAutoSave();
    });

    state.canvas.on('object:removed', () => {
        triggerAutoSave();
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
    state.canvas.on('object:added', () => {
        if (!state.isUndoRedoing) saveCanvasState();
    });
    state.canvas.on('object:modified', () => {
        if (!state.isUndoRedoing) saveCanvasState();
    });
    state.canvas.on('object:removed', () => {
        if (!state.isUndoRedoing) saveCanvasState();
    });

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

            // Reset plot selection and update selector
            state.currentPlotId = null;
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
                loadPlot(plotId);
            } else {
                // Clear canvas if no plot selected
                if (state.canvas) {
                    deleteStage();  // Clean up stage first
                    state.canvas.clear();
                    state.canvas.backgroundColor = '#ffffff';
                    drawGrid();
                }
                state.currentPlotId = null;

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
        newPlotBtn.addEventListener('click', createNewPlot);
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
        canvasData: null,
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
        updateUndoRedoButtons();

        // Save initial state
        setTimeout(() => {
            saveCanvasState();
        }, 100);

        updateSaveStatus('New plot created');
    } catch (error) {
        console.error('Error creating plot:', error);
        alert('Error creating plot. Please try again.');
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
    } catch (error) {
        console.error('Error deleting plot:', error);
        alert('Error deleting plot. Please try again.');
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
            canvasData: originalPlot.canvasData, // Copy the canvas data
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await collections.stagePlots.add(duplicatedPlotData);

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
    } catch (error) {
        console.error('Error duplicating plot:', error);
        alert('Error duplicating plot. Please try again.');
    }
}

// Load Plot from Firestore
function loadPlot(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;

    state.currentPlotId = plotId;

    // Clear undo/redo stacks when loading a different plot
    state.undoStack = [];
    state.redoStack = [];
    updateUndoRedoButtons();

    // Update plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = plot.name || '';
        plotNameInput.disabled = false;
    }

    // Clear canvas and delete existing stage
    if (state.canvas) {
        deleteStage();  // Clean up old stage first
        state.canvas.clear();
        state.canvas.backgroundColor = '#ffffff';
        drawGrid();

        // Load canvas data if it exists
        if (plot.canvasData) {
            state.canvas.loadFromJSON(plot.canvasData, () => {
                state.canvas.renderAll();
                // Redraw grid to ensure it's in the background
                drawGrid();

                // Rebuild rectangle data structure from loaded canvas objects
                const rectMap = new Map(); // Map rectId to {rect, widthLabel, heightLabel}

                state.canvas.getObjects().forEach(obj => {
                    if (obj.rectId) {
                        if (!rectMap.has(obj.rectId)) {
                            rectMap.set(obj.rectId, {id: obj.rectId});
                        }
                        const rectData = rectMap.get(obj.rectId);

                        // Identify what type of object this is
                        if (obj.type === 'rect' && !obj.isRectDimension) {
                            rectData.rect = obj;
                        } else if (obj.isRectDimension) {
                            if (obj.dimensionType === 'width') {
                                rectData.widthLabel = obj;
                            } else if (obj.dimensionType === 'height') {
                                rectData.heightLabel = obj;
                            }
                        }
                    }
                });

                // Rebuild stageRectangles array
                state.stageRectangles = Array.from(rectMap.values()).filter(
                    rectData => rectData.rect && rectData.widthLabel && rectData.heightLabel
                );

                // Set to draw tool (tools are always available now)
                setTool('draw');

                // Save initial state for undo/redo
                setTimeout(() => {
                    saveCanvasState();
                }, 100);
            });
        } else {
            // No canvas data, just set draw tool
            setTool('draw');

            // Save initial state
            setTimeout(() => {
                saveCanvasState();
            }, 100);
        }
    }

    updateSaveStatus('Loaded');
}

// Trigger Auto-Save (debounced)
function triggerAutoSave() {
    // Clear existing timeout
    if (state.autoSaveTimeout) {
        clearTimeout(state.autoSaveTimeout);
    }

    // Set new timeout for 500ms
    state.autoSaveTimeout = setTimeout(() => {
        savePlot();
    }, 500);

    updateSaveStatus('Saving...');
}

// Save Plot to Firestore
async function savePlot() {
    if (!state.currentPlotId || !state.canvas) return;

    // Use fixed dimensions
    const width = 40;
    const height = 30;

    const canvasData = state.canvas.toJSON();

    const plotData = {
        width: width,
        height: height,
        canvasData: canvasData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await collections.stagePlots.doc(state.currentPlotId).update(plotData);
        updateSaveStatus('Saved');
    } catch (error) {
        console.error('Error saving plot:', error);
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

        state.canvas.add(element);
        state.canvas.setActiveObject(element);
        state.canvas.renderAll();
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
    if (state.isUndoRedoing || !state.canvas || !state.currentPlotId) return;

    const canvasState = state.canvas.toJSON();
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
    const currentState = state.canvas.toJSON();
    state.redoStack.push(JSON.stringify(currentState));

    // Restore previous state
    const previousState = state.undoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(previousState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        triggerAutoSave();
    });
}

function redo() {
    if (state.redoStack.length === 0 || !state.canvas) return;

    // Save current state to undo stack
    const currentState = state.canvas.toJSON();
    state.undoStack.push(JSON.stringify(currentState));

    // Restore next state
    const nextState = state.redoStack.pop();
    state.isUndoRedoing = true;

    state.canvas.loadFromJSON(nextState, () => {
        state.canvas.renderAll();
        drawGrid(); // Redraw grid
        state.isUndoRedoing = false;
        updateUndoRedoButtons();
        triggerAutoSave();
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
        // Undo: Ctrl+Z or Cmd+Z
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
        rectData.rect.set({
            selectable: false,
            evented: false
        });
    });

    if (tool === 'draw') {
        // Drawing mode: click and drag creates rectangles
        state.canvas.on('mouse:down', startDrawingRectangle);
        state.canvas.on('mouse:move', continueDrawingRectangle);
        state.canvas.on('mouse:up', finishDrawingRectangle);
    } else if (tool === 'move') {
        // Move mode: drag existing rectangles
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

        state.canvas.selection = true;

        state.canvas.renderAll();
    }

    state.canvas.renderAll();
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

    // Create temporary rectangle
    state.currentDrawingRect = new fabric.Rect({
        left: pointer.x,
        top: pointer.y,
        width: 0,
        height: 0,
        fill: 'rgba(201, 169, 97, 0.2)',
        stroke: '#c9a961',
        strokeWidth: 3,
        selectable: false,
        evented: false,
        pixelsPerFoot: pixelsPerFoot
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

    // Create dimension labels
    const widthLabel = new fabric.Text(feetToFeetInches(widthFeet), {
        left: rect.left + rect.width / 2,
        top: rect.top - 15,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: '#c9a961',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        isRectDimension: true,
        dimensionType: 'width'
    });

    const heightLabel = new fabric.Text(feetToFeetInches(heightFeet), {
        left: rect.left - 15,
        top: rect.top + rect.height / 2,
        fontSize: 12,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fill: '#c9a961',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: 3,
        originX: 'center',
        originY: 'center',
        angle: -90,
        selectable: false,
        evented: false,
        isRectDimension: true,
        dimensionType: 'height'
    });

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

    state.canvas.renderAll();
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
        if (!state.currentPlotId) return;

        const newName = plotNameInput.value.trim();
        if (!newName) {
            alert('Plot name cannot be empty');
            // Restore previous name
            const plot = state.stagePlots.find(p => p.id === state.currentPlotId);
            if (plot) {
                plotNameInput.value = plot.name;
            }
            return;
        }

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
        } catch (error) {
            console.error('Error updating plot name:', error);
            alert('Error updating plot name. Please try again.');
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

// Make functions globally accessible
window.toggleCategorySection = toggleCategorySection;
window.makeBudgetRowEditable = makeBudgetRowEditable;
window.saveBudgetRowChanges = saveBudgetRowChanges;
window.cancelBudgetRowEdit = cancelBudgetRowEdit;
window.makeRowEditable = makeRowEditable;
window.saveRowChanges = saveRowChanges;
window.cancelRowEdit = cancelRowEdit;
window.makeStageRowEditable = makeStageRowEditable;

