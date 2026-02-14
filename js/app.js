// Global state
const state = {
    vendors: [],
    budget: [],
    timeline: [],
    mainStageInputs: [],
    cocktailStageInputs: [],
    staff: [],
    currentPage: 'dashboard',
    currentDay: 'Thursday',  // For timeline filtering
    currentStage: 'main'  // For stage input filtering
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

