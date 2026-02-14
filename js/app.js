// Global state
const state = {
    vendors: [],
    budget: [],
    timeline: [],
    currentPage: 'dashboard',
    currentDay: 'Thursday'  // For timeline filtering
};

// Event date
const eventDate = new Date('April 25, 2026 18:00:00');

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupNavigation();
    setupModals();
    setupCountdown();
    loadAllData();
    setupFormHandlers();
    setupSearchAndFilter();
    setupDayTabs();
    setupBudgetSorting();
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
        });
    });
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
            <td>${escapeHtml(vendor.name || '')}</td>
            <td>${escapeHtml(vendor.category || '')}</td>
            <td>
                ${vendor.contactPerson ? escapeHtml(vendor.contactPerson) + '<br>' : ''}
                ${vendor.email ? `<small>${escapeHtml(vendor.email)}</small>` : ''}
            </td>
            <td>${vendor.amount ? formatCurrency(vendor.amount) : '-'}</td>
            <td><span class="status-badge ${vendor.status}">${vendor.status || 'pending'}</span></td>
            <td><span class="status-badge ${vendor.paymentStatus}">${formatPaymentStatus(vendor.paymentStatus)}</span></td>
            <td>
                <button class="btn btn-edit" onclick="editVendor('${vendor.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteVendor('${vendor.id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function getFilteredVendors() {
    let filtered = [...state.vendors];

    const searchTerm = document.getElementById('vendor-search')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('vendor-category-filter')?.value || '';
    const statusFilter = document.getElementById('vendor-status-filter')?.value || '';

    if (searchTerm) {
        filtered = filtered.filter(v =>
            (v.name || '').toLowerCase().includes(searchTerm) ||
            (v.contactPerson || '').toLowerCase().includes(searchTerm) ||
            (v.email || '').toLowerCase().includes(searchTerm)
        );
    }

    if (categoryFilter) {
        filtered = filtered.filter(v => v.category === categoryFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(v => v.status === statusFilter);
    }

    return filtered;
}

// Budget
function renderBudget() {
    renderBudgetCategories();
    renderBudgetTable();
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

// Timeline
function renderTimeline() {
    const container = document.getElementById('timeline-items');

    // Filter by current day
    const filteredTimeline = state.timeline.filter(item => item.day === state.currentDay);

    // Update day title
    const dayTitle = document.getElementById('timeline-day-title');
    if (dayTitle) {
        dayTitle.textContent = `${state.currentDay} Timeline`;
    }

    if (filteredTimeline.length === 0) {
        container.innerHTML = '<p class="empty-state">No tasks for this day</p>';
        return;
    }

    // Sort by time
    const sorted = [...filteredTimeline].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    container.innerHTML = sorted.map(item => {
        const isComplete = item.completed === true;

        return `
            <div class="timeline-item ${isComplete ? 'complete' : ''}">
                <div class="timeline-checkbox">
                    <input type="checkbox"
                           ${isComplete ? 'checked' : ''}
                           onchange="toggleTaskComplete('${item.id}', this.checked)">
                </div>
                <div class="timeline-content">
                    <div class="timeline-meta">
                        ${item.time ? `<div class="timeline-meta-item"><strong>🕐 ${item.time}</strong></div>` : ''}
                    </div>
                    <div class="timeline-task ${isComplete ? 'complete' : ''}">
                        ${escapeHtml(item.event || '')}
                    </div>
                    <div class="timeline-meta">
                        ${item.responsible ? `<div class="timeline-meta-item">👤 ${escapeHtml(item.responsible)}</div>` : ''}
                        ${item.staff ? `<div class="timeline-meta-item">👥 ${escapeHtml(item.staff)}</div>` : ''}
                    </div>
                </div>
                <div class="timeline-actions">
                    <button class="btn btn-edit" onclick="editTimelineItem('${item.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteTimelineItem('${item.id}')">Delete</button>
                </div>
            </div>
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
