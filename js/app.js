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
    angleMode: 'orthogonal',  // 'orthogonal' (90°) or 'angle45' (45°)
    snapDistance: 10  // Pixels for snap-to-align
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
    setupBudgetSorting();
    setupExportAndPrint();
    setupStagePlotTabs();
    setupStagePlotControls();
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

// Load all data from Firestore
function loadAllData() {
    loadVendors();
    loadBudget();
    loadTimeline();
    loadMainStageInputs();
    loadCocktailStageInputs();
    loadStaff();
    loadStagePlots();
}

function loadVendors() {
    collections.vendors.onSnapshot((snapshot) => {
        state.vendors = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderVendors();
        updateDashboard();
    }, (error) => {
        console.error('Error loading vendors:', error);
    });
}

function loadBudget() {
    collections.budget.onSnapshot((snapshot) => {
        state.budget = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderBudget();
        updateDashboard();
    }, (error) => {
        console.error('Error loading budget:', error);
    });
}

function loadTimeline() {
    collections.timeline.onSnapshot((snapshot) => {
        state.timeline = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderTimeline();
        updateDashboard();
    }, (error) => {
        console.error('Error loading timeline:', error);
    });
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

function renderBudgetTable(filterCategory = null) {
    const tbody = document.getElementById('budget-tbody');

    let budgetToRender = state.budget;

    // Filter by category if specified
    if (filterCategory) {
        budgetToRender = state.budget.filter(item => item.category === filterCategory);
    }

    if (budgetToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No budget items found</td></tr>';
        return;
    }

    tbody.innerHTML = budgetToRender.map(item => {
        const budgeted = parseFloat(item.budgeted) || 0;
        const actual = parseFloat(item.actual) || 0;
        const difference = budgeted - actual;
        const diffClass = difference < 0 ? 'over-budget' : difference > 0 ? 'under-budget' : '';

        return `
            <tr>
                <td>${escapeHtml(item.vendor)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td>${formatCurrency(budgeted)}</td>
                <td>${formatCurrency(actual)}</td>
                <td class="${diffClass}">${formatCurrency(Math.abs(difference))} ${difference < 0 ? 'over' : difference > 0 ? 'under' : ''}</td>
                <td><span class="status-badge ${item.paymentStatus}">${formatPaymentStatus(item.paymentStatus)}</span></td>
                <td class="actions">
                    <button class="btn btn-edit" onclick="editBudgetItem('${item.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteBudgetItem('${item.id}')">Delete</button>
                </td>
            </tr>
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

function openVendorModal(vendorId = null) {
    const modal = document.getElementById('vendor-modal');
    const form = document.getElementById('vendor-form');
    const title = document.getElementById('vendor-modal-title');

    form.reset();

    if (vendorId) {
        const vendor = state.vendors.find(v => v.id === vendorId);
        if (vendor) {
            title.textContent = 'Edit Vendor';
            document.getElementById('vendor-id').value = vendor.id;
            document.getElementById('vendor-name').value = vendor.name || '';
            document.getElementById('vendor-category').value = vendor.category || '';
            document.getElementById('vendor-contact').value = vendor.contactPerson || '';
            document.getElementById('vendor-email').value = vendor.email || '';
            document.getElementById('vendor-phone').value = vendor.phone || '';
            document.getElementById('vendor-amount').value = vendor.amount || '';
            document.getElementById('vendor-status').value = vendor.status || 'pending';
            document.getElementById('vendor-payment-status').value = vendor.paymentStatus || 'not-paid';
            document.getElementById('vendor-notes').value = vendor.notes || '';
        }
    } else {
        title.textContent = 'Add Vendor';
        document.getElementById('vendor-id').value = '';
    }

    modal.classList.add('active');
}

function openBudgetModal(itemId = null) {
    const modal = document.getElementById('budget-modal');
    const form = document.getElementById('budget-form');
    const title = document.getElementById('budget-modal-title');

    form.reset();

    if (itemId) {
        const item = state.budget.find(b => b.id === itemId);
        if (item) {
            title.textContent = 'Edit Budget Item';
            document.getElementById('budget-id').value = item.id;
            document.getElementById('budget-vendor').value = item.vendor || '';
            document.getElementById('budget-category').value = item.category || '';
            document.getElementById('budget-contact').value = item.contact || '';
            document.getElementById('budget-phone').value = item.phone || '';
            document.getElementById('budget-email').value = item.email || '';
            document.getElementById('budget-budgeted').value = item.budgeted || '';
            document.getElementById('budget-actual').value = item.actual || '';
            document.getElementById('budget-payment-status').value = item.paymentStatus || 'not-paid';
            document.getElementById('budget-notes').value = item.notes || '';
        }
    } else {
        title.textContent = 'Add Budget Item';
        document.getElementById('budget-id').value = '';
    }

    modal.classList.add('active');
}

function openTimelineModal(itemId = null) {
    const modal = document.getElementById('timeline-modal');
    const form = document.getElementById('timeline-form');
    const title = document.getElementById('timeline-modal-title');

    form.reset();

    if (itemId) {
        const item = state.timeline.find(t => t.id === itemId);
        if (item) {
            title.textContent = 'Edit Task';
            document.getElementById('timeline-id').value = item.id;
            document.getElementById('timeline-task').value = item.task || '';
            document.getElementById('timeline-due-date').value = item.dueDate || '';
            document.getElementById('timeline-status').value = item.status || 'not-started';
            document.getElementById('timeline-responsible').value = item.responsible || '';
            document.getElementById('timeline-notes').value = item.notes || '';
        }
    } else {
        title.textContent = 'Add Task';
        document.getElementById('timeline-id').value = '';
        document.getElementById('timeline-status').value = 'not-started';
    }

    modal.classList.add('active');
}

// Form Handlers
function setupFormHandlers() {
    document.getElementById('vendor-form').addEventListener('submit', handleVendorSubmit);
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('timeline-form').addEventListener('submit', handleTimelineSubmit);
    document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
}

async function handleVendorSubmit(e) {
    e.preventDefault();

    const vendorData = {
        name: document.getElementById('vendor-name').value,
        category: document.getElementById('vendor-category').value,
        contactPerson: document.getElementById('vendor-contact').value,
        email: document.getElementById('vendor-email').value,
        phone: document.getElementById('vendor-phone').value,
        amount: parseFloat(document.getElementById('vendor-amount').value) || 0,
        status: document.getElementById('vendor-status').value,
        paymentStatus: document.getElementById('vendor-payment-status').value,
        notes: document.getElementById('vendor-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const vendorId = document.getElementById('vendor-id').value;

    try {
        if (vendorId) {
            await collections.vendors.doc(vendorId).update(vendorData);
        } else {
            vendorData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.vendors.add(vendorData);
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving vendor:', error);
        alert('Error saving vendor. Please try again.');
    }
}

async function handleBudgetSubmit(e) {
    e.preventDefault();

    const budgetData = {
        vendor: document.getElementById('budget-vendor').value,
        category: document.getElementById('budget-category').value,
        contact: document.getElementById('budget-contact').value,
        phone: document.getElementById('budget-phone').value,
        email: document.getElementById('budget-email').value,
        budgeted: parseFloat(document.getElementById('budget-budgeted').value) || 0,
        actual: parseFloat(document.getElementById('budget-actual').value) || 0,
        paymentStatus: document.getElementById('budget-payment-status').value,
        notes: document.getElementById('budget-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const budgetId = document.getElementById('budget-id').value;

    try {
        if (budgetId) {
            await collections.budget.doc(budgetId).update(budgetData);
        } else {
            budgetData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.budget.add(budgetData);
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving budget item:', error);
        alert('Error saving budget item. Please try again.');
    }
}

async function handleTimelineSubmit(e) {
    e.preventDefault();

    const timelineData = {
        task: document.getElementById('timeline-task').value,
        dueDate: document.getElementById('timeline-due-date').value,
        status: document.getElementById('timeline-status').value,
        responsible: document.getElementById('timeline-responsible').value,
        notes: document.getElementById('timeline-notes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const timelineId = document.getElementById('timeline-id').value;

    try {
        if (timelineId) {
            await collections.timeline.doc(timelineId).update(timelineData);
        } else {
            timelineData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await collections.timeline.add(timelineData);
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving timeline item:', error);
        alert('Error saving task. Please try again.');
    }
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

window.deleteVendor = async (id) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
        try {
            await collections.vendors.doc(id).delete();
        } catch (error) {
            console.error('Error deleting vendor:', error);
            alert('Error deleting vendor. Please try again.');
        }
    }
};

window.deleteBudgetItem = async (id) => {
    if (confirm('Are you sure you want to delete this budget item?')) {
        try {
            await collections.budget.doc(id).delete();
        } catch (error) {
            console.error('Error deleting budget item:', error);
            alert('Error deleting budget item. Please try again.');
        }
    }
};

window.deleteTimelineItem = async (id) => {
    if (confirm('Are you sure you want to delete this task?')) {
        try {
            await collections.timeline.doc(id).delete();
        } catch (error) {
            console.error('Error deleting task:', error);
            alert('Error deleting task. Please try again.');
        }
    }
};

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

// Budget Category Sorting
function setupBudgetSorting() {
    const sortSelect = document.getElementById('budget-category-sort');

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            const selectedCategory = e.target.value;

            if (!selectedCategory) {
                // Show all items if no category selected
                renderBudgetTable();
                return;
            }

            // Filter and render only items from selected category
            renderBudgetTable(selectedCategory);
        });
    }
}

// Export and Print Functionality
function setupExportAndPrint() {
    // Print Buttons
    const printTimelineBtn = document.getElementById('print-timeline-btn');
    const printStaffBtn = document.getElementById('print-staff-btn');

    if (printTimelineBtn) {
        printTimelineBtn.addEventListener('click', printTimeline);
    }
    if (printStaffBtn) {
        printStaffBtn.addEventListener('click', printStaff);
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

// Print Timeline Function
function printTimeline() {
    window.print();
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
            console.log('Timeline item updated successfully');
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
            console.log('Budget item updated successfully');
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
function loadMainStageInputs() {
    collections.mainStageInputs.onSnapshot((snapshot) => {
        state.mainStageInputs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if (state.currentPage === 'input-lists') {
            renderStageInputs();
        }
    }, (error) => {
        console.error('Error loading main stage inputs:', error);
    });
}

function loadCocktailStageInputs() {
    collections.cocktailStageInputs.onSnapshot((snapshot) => {
        state.cocktailStageInputs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if (state.currentPage === 'input-lists') {
            renderStageInputs();
        }
    }, (error) => {
        console.error('Error loading cocktail stage inputs:', error);
    });
}

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
            console.log('Stage input updated successfully');
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

function loadStaff() {
    collections.staff.onSnapshot((snapshot) => {
        state.staff = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if (state.currentPage === 'staff') {
            renderStaff();
        }
    }, (error) => {
        console.error('Error loading staff:', error);
    });
}

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

window.deleteStaff = async (id) => {
    if (confirm('Are you sure you want to remove this staff member?')) {
        try {
            await collections.staff.doc(id).delete();
        } catch (error) {
            console.error('Error deleting staff member:', error);
            alert('Error deleting staff member. Please try again.');
        }
    }
};


// Print Staff
function printStaff() {
    window.print();
}

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
function loadStagePlots() {
    collections.stagePlots.onSnapshot((snapshot) => {
        state.stagePlots = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        if (state.currentPage === 'stage-plots') {
            updatePlotSelector();
        }
    }, (error) => {
        console.error('Error loading stage plots:', error);
    });
}

// Initialize Stage Plots page
function initializeStagePlots() {
    if (!state.canvas) {
        setupCanvas();
    }
    updatePlotSelector();
    updateCanvasInfo();
}

// Setup Fabric.js Canvas
function setupCanvas() {
    const canvasElement = document.getElementById('stage-canvas');
    if (!canvasElement) return;

    // Initialize Fabric.js canvas
    state.canvas = new fabric.Canvas('stage-canvas', {
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        selection: true
    });

    // Draw grid background
    drawGrid();

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

    // Add double-click handler for editing dimension labels and element labels
    state.canvas.on('mouse:dblclick', (e) => {
        if (e.target && e.target.isDimensionLabel) {
            editDimensionLabel(e.target);
        } else if (e.target && e.target.isStageElement) {
            editElementLabel(e.target);
        }
    });
}

// Draw grid on canvas
function drawGrid() {
    if (!state.canvas) return;

    const width = document.getElementById('stage-width').value || 40;
    const height = document.getElementById('stage-height').value || 30;

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

    // Draw vertical grid lines
    for (let i = 0; i <= width; i++) {
        const line = new fabric.Line([
            i * pixelsPerFoot, 0,
            i * pixelsPerFoot, height * pixelsPerFoot
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1,
            selectable: false,
            evented: false,
            gridLine: true
        });
        state.canvas.add(line);
        state.canvas.sendToBack(line);
    }

    // Draw horizontal grid lines
    for (let i = 0; i <= height; i++) {
        const line = new fabric.Line([
            0, i * pixelsPerFoot,
            width * pixelsPerFoot, i * pixelsPerFoot
        ], {
            stroke: '#e0e0e0',
            strokeWidth: 1,
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

    // Apply dimensions button
    const applyDimensionsBtn = document.getElementById('apply-dimensions-btn');
    if (applyDimensionsBtn) {
        applyDimensionsBtn.addEventListener('click', () => {
            drawGrid();
            updateCanvasInfo();
            triggerAutoSave();
        });
    }

    // Print button
    const printPlotBtn = document.getElementById('print-plot-btn');
    if (printPlotBtn) {
        printPlotBtn.addEventListener('click', printPlot);
    }

    // Draw Stage button
    const drawStageBtn = document.getElementById('draw-stage-btn');
    if (drawStageBtn) {
        drawStageBtn.addEventListener('click', toggleDrawingMode);
    }

    // Finish Drawing button
    const finishDrawingBtn = document.getElementById('finish-drawing-btn');
    if (finishDrawingBtn) {
        finishDrawingBtn.addEventListener('click', finishDrawingStage);
    }

    // Edit Stage button
    const editStageBtn = document.getElementById('edit-stage-btn');
    if (editStageBtn) {
        editStageBtn.addEventListener('click', unlockStage);
    }

    // Element library buttons
    const elementButtons = document.querySelectorAll('.element-btn');
    elementButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const elementType = btn.dataset.element;
            addElementToCanvas(elementType);
        });
    });

    // Angle mode buttons
    const orthogonalModeBtn = document.getElementById('orthogonal-mode-btn');
    const angle45ModeBtn = document.getElementById('angle45-mode-btn');

    if (orthogonalModeBtn) {
        orthogonalModeBtn.addEventListener('click', () => {
            setAngleMode('orthogonal');
        });
    }

    if (angle45ModeBtn) {
        angle45ModeBtn.addEventListener('click', () => {
            setAngleMode('angle45');
        });
    }

    // Tool mode buttons
    const drawToolBtn = document.getElementById('draw-rect-tool-btn');
    const moveToolBtn = document.getElementById('move-tool-btn');

    if (drawToolBtn) {
        drawToolBtn.addEventListener('click', () => {
            setTool('draw');
        });
    }

    if (moveToolBtn) {
        moveToolBtn.addEventListener('click', () => {
            setTool('move');
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

// Create New Plot
async function createNewPlot() {
    const plotName = prompt('Enter a name for this stage plot:');
    if (!plotName) return;

    const width = parseInt(document.getElementById('stage-width').value) || 40;
    const height = parseInt(document.getElementById('stage-height').value) || 30;

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

        // Update plot name input
        const plotNameInput = document.getElementById('plot-name-input');
        if (plotNameInput) {
            plotNameInput.value = plotName;
            plotNameInput.disabled = false;
        }

        // Clear canvas and redraw grid
        if (state.canvas) {
            state.canvas.clear();
            state.canvas.backgroundColor = '#ffffff';
            drawGrid();
        }

        updateSaveStatus('Saved');
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

// Load Plot from Firestore
function loadPlot(plotId) {
    const plot = state.stagePlots.find(p => p.id === plotId);
    if (!plot) return;

    state.currentPlotId = plotId;

    // Update plot name input
    const plotNameInput = document.getElementById('plot-name-input');
    if (plotNameInput) {
        plotNameInput.value = plot.name || '';
        plotNameInput.disabled = false;
    }

    // Update dimensions
    document.getElementById('stage-width').value = plot.width || 40;
    document.getElementById('stage-height').value = plot.height || 30;

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

                // Find and restore stage polygon and dimension labels references
                state.canvas.getObjects().forEach(obj => {
                    if (obj.isStageOutline) {
                        state.stagePolygon = obj;
                        // Show Edit Stage button since stage exists
                        const drawBtn = document.getElementById('draw-stage-btn');
                        const editBtn = document.getElementById('edit-stage-btn');
                        if (drawBtn && editBtn) {
                            drawBtn.style.display = 'none';
                            editBtn.style.display = 'inline-block';
                        }
                    }
                    if (obj.isDimensionLabel) {
                        state.dimensionLabels.push(obj);
                    }
                });
            });
        }
    }

    updateCanvasInfo();
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

    const width = parseInt(document.getElementById('stage-width').value) || 40;
    const height = parseInt(document.getElementById('stage-height').value) || 30;

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

        // Reset to empty after 2 seconds if saved successfully
        if (status === 'Saved') {
            setTimeout(() => {
                saveStatus.textContent = '';
            }, 2000);
        }
    }
}

// Update Canvas Info
function updateCanvasInfo() {
    const width = document.getElementById('stage-width').value || 40;
    const height = document.getElementById('stage-height').value || 30;

    const dimensionsSpan = document.getElementById('canvas-dimensions');
    if (dimensionsSpan) {
        dimensionsSpan.textContent = `${width}ft × ${height}ft`;
    }
}

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

// Setup Keyboard Shortcuts (Delete key)
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
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

// Drawing Mode Variables
let drawingPoints = [];
let drawingLines = [];
let tempCircles = [];
let snapIndicator = null;  // Visual feedback for snap-to-close
const SNAP_DISTANCE = 20;  // Pixels to snap to first point

// =============================================
// RECTANGLE-BASED STAGE DRAWING SYSTEM
// =============================================

// Toggle Drawing Mode (Rectangle-based)
function toggleDrawingMode() {
    if (!state.canvas) return;

    state.isDrawingStage = !state.isDrawingStage;

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
        setTool('draw');
    } else {
        cancelDrawingMode();
    }
}

// Set Tool Mode (Draw or Move)
function setTool(tool) {
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

        updateSaveStatus('📐 Draw mode - Click and drag to create rectangles');
    } else if (tool === 'move') {
        // Move mode: drag existing rectangles
        state.stageRectangles.forEach(rectData => {
            rectData.rect.set({
                selectable: true,
                evented: true,
                hasControls: false,
                hasBorders: true,
                borderColor: '#c9a961',
                lockRotation: true
            });

            // Add moving event handler for snap-to-align
            rectData.rect.on('moving', function(e) {
                snapRectangleToAlign(rectData);
                updateRectangleDimensions(rectData);
            });
        });

        state.canvas.selection = true;
        updateSaveStatus('🤚 Move mode - Drag rectangles to position (they snap together!)');
    }

    state.canvas.renderAll();
}

// Start Drawing a Rectangle
function startDrawingRectangle(e) {
    if (!state.isDrawingStage || state.currentTool !== 'draw' || state.currentDrawingRect) return;

    const pointer = state.canvas.getPointer(e.e);
    state.drawingStartPoint = { x: pointer.x, y: pointer.y };

    // Get pixels per foot for live dimension display
    const width = parseInt(document.getElementById('stage-width').value) || 40;
    const height = parseInt(document.getElementById('stage-height').value) || 30;
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
    if (!state.isDrawingStage || !state.currentDrawingRect || !state.drawingStartPoint) return;

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
    if (!state.isDrawingStage || !state.currentDrawingRect) return;

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

    updateSaveStatus(`Drew ${feetToFeetInches(widthFeet)} × ${feetToFeetInches(heightFeet)} rectangle - Draw another or click Finish`);
    state.canvas.renderAll();
}

// Handle Mouse Move While Drawing (for snap indicator)
function handleDrawingMouseMove(e) {
    if (!state.isDrawingStage || drawingPoints.length < 3) return;

    const pointer = state.canvas.getPointer(e.e);
    const firstPoint = drawingPoints[0];
    const dx = pointer.x - firstPoint.x;
    const dy = pointer.y - firstPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Show snap indicator when near first point
    if (distance < SNAP_DISTANCE) {
        if (!snapIndicator) {
            snapIndicator = new fabric.Circle({
                left: firstPoint.x,
                top: firstPoint.y,
                radius: SNAP_DISTANCE,
                fill: 'transparent',
                stroke: '#c9a961',
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
                originX: 'center',
                originY: 'center'
            });
            state.canvas.add(snapIndicator);
        }
    } else {
        // Remove snap indicator when far from first point
        if (snapIndicator) {
            state.canvas.remove(snapIndicator);
            snapIndicator = null;
        }
    }

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

// Snap point to 90-degree angle (orthogonal) from previous point
function snapToOrthogonal(prevPoint, currentPoint) {
    const dx = currentPoint.x - prevPoint.x;
    const dy = currentPoint.y - prevPoint.y;

    // Determine if more horizontal or vertical
    if (Math.abs(dx) > Math.abs(dy)) {
        // More horizontal - snap to 0° or 180°
        return { x: currentPoint.x, y: prevPoint.y };
    } else {
        // More vertical - snap to 90° or 270°
        return { x: prevPoint.x, y: currentPoint.y };
    }
}

// Snap point to 45-degree angle from previous point
function snapTo45Degrees(prevPoint, currentPoint) {
    const dx = currentPoint.x - prevPoint.x;
    const dy = currentPoint.y - prevPoint.y;

    // Calculate angle in degrees
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Round to nearest 45 degrees
    const snappedAngle = Math.round(angle / 45) * 45;

    // Calculate distance
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate new point at snapped angle
    const radians = snappedAngle * (Math.PI / 180);
    return {
        x: prevPoint.x + distance * Math.cos(radians),
        y: prevPoint.y + distance * Math.sin(radians)
    };
}

// Set angle mode for drawing
function setAngleMode(mode) {
    state.angleMode = mode;

    // Update button active states
    const orthogonalBtn = document.getElementById('orthogonal-mode-btn');
    const angle45Btn = document.getElementById('angle45-mode-btn');

    if (orthogonalBtn && angle45Btn) {
        orthogonalBtn.classList.remove('active');
        angle45Btn.classList.remove('active');

        if (mode === 'orthogonal') {
            orthogonalBtn.classList.add('active');
        } else {
            angle45Btn.classList.add('active');
        }
    }

    // Update status if in drawing mode
    if (state.isDrawingStage) {
        updateSaveStatus('Drawing mode active - ' + (mode === 'orthogonal' ? '90° mode' : '45° mode'));
    }
}

// Handle Click While Drawing
function handleDrawingClick(e) {
    if (!state.isDrawingStage) return;

    let pointer = state.canvas.getPointer(e.e);

    // Check if we should snap to first point to close the shape
    if (drawingPoints.length >= 3) {
        const firstPoint = drawingPoints[0];
        const dx = pointer.x - firstPoint.x;
        const dy = pointer.y - firstPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If close to first point, snap to it and finish drawing
        if (distance < SNAP_DISTANCE) {
            finishDrawingStage();
            return;
        }
    }

    // Snap to angle based on current mode
    if (drawingPoints.length > 0) {
        const prevPoint = drawingPoints[drawingPoints.length - 1];
        if (state.angleMode === 'orthogonal') {
            pointer = snapToOrthogonal(prevPoint, pointer);
        } else {
            pointer = snapTo45Degrees(prevPoint, pointer);
        }
    }

    // Add point
    drawingPoints.push({ x: pointer.x, y: pointer.y });

    // Draw circle at point
    const circle = new fabric.Circle({
        left: pointer.x,
        top: pointer.y,
        radius: 5,
        fill: '#c9a961',
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center'
    });
    state.canvas.add(circle);
    tempCircles.push(circle);

    // Draw line from previous point
    if (drawingPoints.length > 1) {
        const prevPoint = drawingPoints[drawingPoints.length - 2];
        const line = new fabric.Line([prevPoint.x, prevPoint.y, pointer.x, pointer.y], {
            stroke: '#c9a961',
            strokeWidth: 3,
            selectable: false,
            evented: false
        });
        state.canvas.add(line);
        drawingLines.push(line);
    }

    state.canvas.renderAll();
}

// Finish Drawing Stage
// Finish Drawing/Editing and Lock All Rectangles
function finishDrawingStage() {
    // Handle both drawing mode and editing mode
    if (!state.isDrawingStage && !state.isEditingStage) return;

    if (state.stageRectangles.length === 0) {
        alert('Please draw at least one rectangle for the stage.');
        return;
    }

    // Lock all rectangles and their labels
    state.stageRectangles.forEach(rectData => {
        rectData.rect.set({
            selectable: false,
            evented: false,
            locked: true
        });

        // Remove moving event handlers
        rectData.rect.off('moving');

        rectData.widthLabel.set({
            selectable: false,
            evented: false
        });
        rectData.heightLabel.set({
            selectable: false,
            evented: false
        });
    });

    state.stageLocked = true;

    // Show Edit Stage button, hide Draw/Finish buttons
    const drawBtn = document.getElementById('draw-stage-btn');
    const editBtn = document.getElementById('edit-stage-btn');
    const finishBtn = document.getElementById('finish-drawing-btn');

    if (drawBtn) drawBtn.style.display = 'none';
    if (editBtn) editBtn.style.display = 'inline-block';
    if (finishBtn) finishBtn.style.display = 'none';

    // Exit drawing/editing mode
    cancelDrawingMode();

    updateSaveStatus(`Stage locked with ${state.stageRectangles.length} rectangle(s)`);
    state.canvas.renderAll();
    triggerAutoSave();
}

// Fix rectangle geometry - force perpendicular corners for orthogonal shapes
function fixRectangleGeometry(points, updatedSegments, pixelsPerFoot) {
    // Only attempt rectangle fix if exactly 4 sides
    if (points.length !== 4) return;

    // Check if we're in orthogonal mode and updated parallel walls
    if (state.angleMode !== 'orthogonal' || updatedSegments.length < 2) return;

    // Determine if updated segments are horizontal or vertical
    const firstSegIdx = updatedSegments[0];
    const p1 = points[firstSegIdx];
    const p2 = points[(firstSegIdx + 1) % points.length];
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);

    const isHorizontal = dx > dy;

    if (isHorizontal) {
        // Updated horizontal walls - fix vertical walls
        // Get Y positions of the two horizontal walls
        const y1 = (points[0].y + points[1].y) / 2;  // Top wall Y
        const y2 = (points[2].y + points[3].y) / 2;  // Bottom wall Y

        // Get X positions of vertical walls (keep them as is)
        const x1 = points[0].x;  // Left X
        const x2 = points[1].x;  // Right X

        // Reconstruct rectangle with perfect 90° corners
        points[0] = { x: x1, y: y1 };  // Top-left
        points[1] = { x: x2, y: y1 };  // Top-right
        points[2] = { x: x2, y: y2 };  // Bottom-right
        points[3] = { x: x1, y: y2 };  // Bottom-left
    } else {
        // Updated vertical walls - fix horizontal walls
        // Get X positions of the two vertical walls
        const x1 = (points[0].x + points[3].x) / 2;  // Left wall X
        const x2 = (points[1].x + points[2].x) / 2;  // Right wall X

        // Get Y positions of horizontal walls (keep them as is)
        const y1 = points[0].y;  // Top Y
        const y2 = points[2].y;  // Bottom Y

        // Reconstruct rectangle with perfect 90° corners
        points[0] = { x: x1, y: y1 };  // Top-left
        points[1] = { x: x2, y: y1 };  // Top-right
        points[2] = { x: x2, y: y2 };  // Bottom-right
        points[3] = { x: x1, y: y2 };  // Bottom-left
    }
}

// Find parallel segments in the polygon
function findParallelSegments(points, segmentIndex, angleTolerance = 5) {
    const parallelSegments = [];

    const p1 = points[segmentIndex];
    const p2 = points[(segmentIndex + 1) % points.length];

    // Calculate angle of the target segment (in degrees)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Check all other segments
    for (let i = 0; i < points.length; i++) {
        if (i === segmentIndex) continue;  // Skip the segment itself

        const q1 = points[i];
        const q2 = points[(i + 1) % points.length];

        const dx2 = q2.x - q1.x;
        const dy2 = q2.y - q1.y;
        let segmentAngle = Math.atan2(dy2, dx2) * (180 / Math.PI);

        // Normalize angles to [0, 180) for comparison (parallel lines can point opposite directions)
        let normalizedTarget = ((targetAngle % 180) + 180) % 180;
        let normalizedSegment = ((segmentAngle % 180) + 180) % 180;

        // Check if angles are within tolerance
        const angleDiff = Math.abs(normalizedTarget - normalizedSegment);

        if (angleDiff < angleTolerance || angleDiff > (180 - angleTolerance)) {
            parallelSegments.push(i);
        }
    }

    return parallelSegments;
}

// Edit Dimension Label (Double-click handler)
function editDimensionLabel(label) {
    if (!state.stagePolygon || !label.isDimensionLabel) return;

    const segmentIndex = label.segmentIndex;
    const currentText = label.text;

    // Parse current dimension from feet-inches format
    const currentDimension = parseFeetInches(currentText);

    // Prompt for new dimension
    const newDimensionStr = prompt(
        `Enter new dimension:\n(Current: ${currentText})\n\nFormats accepted: 20'6" or 20.5`,
        currentText
    );
    if (!newDimensionStr) return;  // User cancelled

    const newDimension = parseFeetInches(newDimensionStr);
    if (!newDimension || newDimension <= 0) {
        alert('Please enter a valid dimension (e.g., 20\'6" or 20.5)');
        return;
    }

    // Get stage dimensions for scaling
    const width = parseInt(document.getElementById('stage-width').value) || 40;
    const height = parseInt(document.getElementById('stage-height').value) || 30;
    const canvasWidth = state.canvas.width;
    const canvasHeight = state.canvas.height;
    const pixelsPerFoot = Math.min(canvasWidth / width, canvasHeight / height);

    // Get polygon points
    const points = state.stagePolygon.points;

    // Smart dimension linking: find parallel walls
    const parallelSegments = findParallelSegments(points, segmentIndex);
    let segmentsToUpdate = [segmentIndex];  // Always update the current segment

    if (parallelSegments.length > 0) {
        // Ask user if they want to update parallel walls
        const parallelCount = parallelSegments.length;
        const message = parallelCount === 1
            ? 'Found 1 parallel wall. Update it to match this dimension?'
            : `Found ${parallelCount} parallel walls. Update them all to match this dimension?`;

        const updateParallel = confirm(message);
        if (updateParallel) {
            segmentsToUpdate = segmentsToUpdate.concat(parallelSegments);
        }
    }
    // Update all selected segments with smart geometry preservation
    const newDistancePixels = newDimension * pixelsPerFoot;

    // Calculate midpoints and angles for all segments to update
    const segmentData = segmentsToUpdate.map(segIdx => {
        const p1 = points[segIdx];
        const p2 = points[(segIdx + 1) % points.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angle = Math.atan2(dy, dx);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        return { segIdx, midX, midY, angle, p1Index: segIdx, p2Index: (segIdx + 1) % points.length };
    });

    // Update each segment from its center point
    for (const data of segmentData) {
        const halfDist = newDistancePixels / 2;

        // Calculate new p1 and p2 centered on the midpoint
        const newP1 = {
            x: data.midX - halfDist * Math.cos(data.angle),
            y: data.midY - halfDist * Math.sin(data.angle)
        };
        const newP2 = {
            x: data.midX + halfDist * Math.cos(data.angle),
            y: data.midY + halfDist * Math.sin(data.angle)
        };

        // Update the points
        points[data.p1Index] = newP1;
        points[data.p2Index] = newP2;
    }

    // Fix connecting segments to close the polygon properly
    // For each point, if it was updated by multiple segments, average the positions
    const pointUpdates = {};
    for (const data of segmentData) {
        // Track which points were modified
        if (!pointUpdates[data.p1Index]) pointUpdates[data.p1Index] = [];
        if (!pointUpdates[data.p2Index]) pointUpdates[data.p2Index] = [];

        pointUpdates[data.p1Index].push(points[data.p1Index]);
        pointUpdates[data.p2Index].push(points[data.p2Index]);
    }

    // Average positions for points that were updated multiple times
    for (const [pointIndex, positions] of Object.entries(pointUpdates)) {
        if (positions.length > 1) {
            const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
            const avgY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
            points[parseInt(pointIndex)] = { x: avgX, y: avgY };
        }
    }

    // Fix rectangle geometry if in orthogonal mode
    fixRectangleGeometry(points, segmentsToUpdate, pixelsPerFoot);

    // Remove old polygon and dimension labels
    state.canvas.remove(state.stagePolygon);
    state.dimensionLabels.forEach(lbl => state.canvas.remove(lbl));
    state.dimensionLabels = [];

    // Recreate polygon with updated points
    const polygon = new fabric.Polygon(points, {
        fill: 'rgba(201, 169, 97, 0.2)',
        stroke: '#c9a961',
        strokeWidth: 3,
        selectable: false,
        evented: false,
        objectCaching: false,
        isStageOutline: true
    });

    state.canvas.add(polygon);
    state.canvas.sendToBack(polygon);
    state.stagePolygon = polygon;

    // Recreate all dimension labels with updated values
    for (let i = 0; i < points.length; i++) {
        const pt1 = points[i];
        const pt2 = points[(i + 1) % points.length];

        // Calculate distance
        const deltaX = pt2.x - pt1.x;
        const deltaY = pt2.y - pt1.y;
        const distPx = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const distFt = distPx / pixelsPerFoot;

        // Calculate midpoint
        const midX = (pt1.x + pt2.x) / 2;
        const midY = (pt1.y + pt2.y) / 2;

        // Create new label
        const newLabel = new fabric.Text(feetToFeetInches(distFt), {
            left: midX,
            top: midY,
            fontSize: 12,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fill: '#c9a961',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: 3,
            originX: 'center',
            originY: 'center',
            selectable: true,
            evented: true,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            lockScalingX: true,
            lockScalingY: true,
            hasControls: false,
            hasBorders: true,
            borderColor: '#c9a961',
            isDimensionLabel: true,
            segmentIndex: i
        });

        state.canvas.add(newLabel);
        state.dimensionLabels.push(newLabel);
    }

    state.canvas.renderAll();
    triggerAutoSave();

    // Update status message
    const statusMessage = segmentsToUpdate.length > 1
        ? `Dimension updated (${segmentsToUpdate.length} parallel walls)`
        : 'Dimension updated';
    updateSaveStatus(statusMessage);
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

    // Reset arrays
    drawingPoints = [];
    drawingLines = [];
    tempCircles = [];

    // Re-enable selection
    if (state.canvas) {
        state.canvas.selection = true;
        state.canvas.forEachObject(obj => {
            obj.selectable = true;
        });

        // Remove drawing handlers
        state.canvas.off('mouse:down', handleDrawingClick);
        state.canvas.off('mouse:move', handleDrawingMouseMove);
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
            updateSaveStatus('Plot name updated');
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

    const width = document.getElementById('stage-width').value || 40;
    const height = document.getElementById('stage-height').value || 30;
    const plotName = state.currentPlotId ?
        state.stagePlots.find(p => p.id === state.currentPlotId)?.name || 'Untitled Plot' :
        'Untitled Plot';
    const stageTypeName = state.currentStagePlotType === 'main' ? 'Main Stage' : 'Cocktail Stage';

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${plotName} - ${stageTypeName}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    margin: 20px;
                    padding: 0;
                }
                h1 {
                    color: #c9a961;
                    margin-bottom: 5px;
                }
                .subtitle {
                    color: #666;
                    margin-bottom: 10px;
                    font-size: 14px;
                }
                .dimensions {
                    margin-bottom: 20px;
                    font-size: 14px;
                    color: #333;
                }
                img {
                    max-width: 100%;
                    height: auto;
                    border: 1px solid #ddd;
                }
                @media print {
                    body { margin: 0; }
                    img { max-width: 100%; page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <h1>${plotName}</h1>
            <div class="subtitle">${stageTypeName}</div>
            <div class="dimensions">Stage Dimensions: ${width}ft × ${height}ft</div>
            <img src="${dataURL}" alt="Stage Plot">
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

