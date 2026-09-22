const STORAGE_KEY = 'finance_tracker_data';
const SETTINGS_KEY = 'finance_tracker_settings';

const CATEGORIES = {
    expense: [
        { id: 'food', name: 'Еда', icon: '🍔', color: '#ff6b6b' },
        { id: 'entertainment', name: 'Развлечения', icon: '🎮', color: '#a855f7' },
        { id: 'gifts', name: 'Подарки', icon: '🎁', color: '#f59e0b' }
    ]
};

const DEFAULT_SETTINGS = {
    monthlyIncome: 0,
    savingsGoal: 200,
    transportCost: 54,
    phoneCost: 57,
    notificationsEnabled: true
};

let state = {
    transactions: [],
    settings: { ...DEFAULT_SETTINGS },
    currentPeriod: 'week',
    currentView: 'main',
    selectedCategory: 'food'
};

function loadData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) state.transactions = JSON.parse(data);
        const settings = localStorage.getItem(SETTINGS_KEY);
        if (settings) state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settings) };
    } catch (e) {
        console.error('Load error:', e);
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function getPeriodBounds(period) {
    const now = new Date();
    if (period === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const start = new Date(now.setDate(diff));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    } else {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }
}

function filterTransactions(period) {
    const { start, end } = getPeriodBounds(period);
    return state.transactions.filter(t => {
        const date = new Date(t.date);
        return date >= start && date <= end;
    });
}

function calculateTotals(transactions) {
    let expense = 0;
    const byCategory = {};
    
    transactions.forEach(t => {
        expense += t.amount;
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });
    
    return { expense, byCategory };
}

function calculateWeeklyQuota() {
    const { monthlyIncome, savingsGoal, transportCost, phoneCost } = state.settings;
    if (monthlyIncome <= 0) return 0;
    
    const fixedMonthly = savingsGoal + transportCost + phoneCost;
    const availableMonthly = monthlyIncome - fixedMonthly;
    const weeklyQuota = Math.max(0, availableMonthly / 4.33);
    
    return Math.round(weeklyQuota * 100) / 100;
}

function getMonthlyAvailable() {
    const { monthlyIncome, savingsGoal, transportCost, phoneCost } = state.settings;
    if (monthlyIncome <= 0) return 0;
    return Math.max(0, monthlyIncome - savingsGoal - transportCost - phoneCost);
}

function formatMoney(amount) {
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

function formatMoneyCompact(amount) {
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽';
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function updateCircle(data, period) {
    const { expense, byCategory } = data;
    const weeklyQuota = calculateWeeklyQuota();
    const monthlyAvailable = getMonthlyAvailable();
    const isWeek = period === 'week';
    const currentQuota = isWeek ? weeklyQuota : monthlyAvailable;
    const remaining = currentQuota - expense;
    
    const quotaRing = document.getElementById('quotaRing');
    const expenseRing = document.getElementById('expenseRing');
    const centerAmount = document.getElementById('centerAmount');
    const centerLabel = document.getElementById('centerLabel');
    const centerQuota = document.getElementById('centerQuota');
    const centerWarning = document.getElementById('centerWarning');
    const circleCenter = document.getElementById('circleCenter');
    const circleWrapper = document.getElementById('circleWrapper');
    
    const quotaCircumference = 2 * Math.PI * 140;
    const expenseCircumference = 2 * Math.PI * 122;
    
    let quotaProgress = 0, expenseProgress = 0;
    const maxVal = Math.max(expense, currentQuota, 1);
    
    if (currentQuota > 0) quotaProgress = (currentQuota / maxVal) * quotaCircumference;
    if (expense > 0) expenseProgress = (expense / maxVal) * expenseCircumference;
    
    quotaRing.style.strokeDashoffset = quotaCircumference - quotaProgress;
    expenseRing.style.strokeDashoffset = expenseCircumference - expenseProgress;
    
    const isLow = currentQuota > 0 && remaining <= 5 && remaining > 0;
    const isNegative = remaining < 0;
    
    if (isWeek) {
        if (isLow || isNegative) {
            circleCenter.classList.add('burn');
            circleWrapper.classList.add('burn');
            expenseRing.style.stroke = 'url(#burnGradient)';
            quotaRing.style.stroke = 'url(#burnGradient)';
            centerAmount.textContent = formatMoney(Math.max(remaining, 0));
            centerLabel.textContent = 'Остаток недели';
            centerQuota.textContent = `Квота: ${formatMoney(weeklyQuota)}`;
            centerWarning.textContent = isNegative ? 'Бюджет превышен!' : `Осталось: ${formatMoney(remaining)}`;
        } else {
            circleCenter.classList.remove('burn');
            circleWrapper.classList.remove('burn');
            expenseRing.style.stroke = 'url(#expenseGradient)';
            quotaRing.style.stroke = 'url(#quotaGradient)';
            centerAmount.textContent = formatMoney(remaining);
            centerLabel.textContent = weeklyQuota > 0 ? 'Остаток недели' : 'Лимит не задан';
            centerQuota.textContent = weeklyQuota > 0 ? `Квота: ${formatMoney(weeklyQuota)}` : 'Укажите доход в настройках';
            centerWarning.textContent = '';
        }
    } else {
        circleCenter.classList.remove('burn');
        circleWrapper.classList.remove('burn');
        expenseRing.style.stroke = 'url(#expenseGradient)';
        quotaRing.style.stroke = 'url(#quotaGradient)';
        centerAmount.textContent = formatMoney(monthlyAvailable - expense);
        centerLabel.textContent = 'Баланс месяца';
        centerQuota.textContent = `Лимит месяца: ${formatMoney(monthlyAvailable)}`;
        centerWarning.textContent = '';
    }
    
    document.getElementById('totalExpense').textContent = formatMoney(expense);
    const weekRemaining = weeklyQuota - expense;
    document.getElementById('totalBalance').textContent = formatMoney(isWeek ? weekRemaining : (monthlyAvailable - expense));
    document.getElementById('totalBalance').style.color = (isWeek ? weekRemaining : (monthlyAvailable - expense)) >= 0 ? 'var(--accent-available)' : 'var(--accent-expense)';
    document.getElementById('monthlyAvailable').textContent = formatMoney(monthlyAvailable);
}

function renderQuotaBreakdown() {
    const container = document.getElementById('quotaBreakdown');
    const { monthlyIncome, savingsGoal, transportCost, phoneCost } = state.settings;
    const weeklyQuota = calculateWeeklyQuota();
    const monthlyAvailable = getMonthlyAvailable();
    
    if (monthlyIncome <= 0) {
        container.innerHTML = '<div style="color:var(--text-dim); font-size:13px; width:100%; text-align:center; padding:10px;">Укажите доход в настройках для расчёта квоты</div>';
        document.getElementById('quotaValue').textContent = '0 ₽';
        document.getElementById('quotaSubtitle').textContent = 'Автокалькуляция';
        return;
    }
    
    const fixedMonthly = savingsGoal + transportCost + phoneCost;
    
    document.getElementById('quotaValue').textContent = formatMoney(weeklyQuota);
    document.getElementById('quotaSubtitle').textContent = `Из ${formatMoneyCompact(monthlyIncome)} / мес`;
    
    container.innerHTML = `
        <div class="quota-item income">
            <span class="qi-label">Доход</span>
            <span class="qi-value">+${formatMoneyCompact(monthlyIncome)}</span>
        </div>
        <div class="quota-item">
            <span class="qi-label">Накопления</span>
            <span class="qi-value">−${formatMoneyCompact(savingsGoal)}</span>
        </div>
        <div class="quota-item">
            <span class="qi-label">Проезд</span>
            <span class="qi-value">−${formatMoneyCompact(transportCost)}</span>
        </div>
        <div class="quota-item">
            <span class="qi-label">Телефон</span>
            <span class="qi-value">−${formatMoneyCompact(phoneCost)}</span>
        </div>
        <div class="quota-item available">
            <span class="qi-label">Доступно в месяц</span>
            <span class="qi-value">${formatMoneyCompact(monthlyAvailable)}</span>
        </div>
        <div class="quota-item quota-final">
            <span class="qi-label">Квота в неделю</span>
            <span class="qi-value">${formatMoneyCompact(weeklyQuota)}</span>
        </div>
    `;
}

function renderCategories(data) {
    const container = document.getElementById('categoryList');
    const { expense, byCategory } = data;
    
    container.innerHTML = CATEGORIES.expense.map(cat => {
        const amount = byCategory[cat.id] || 0;
        const percent = expense > 0 ? (amount / expense) * 100 : 0;
        return `
            <div class="category-item">
                <div class="category-info">
                    <div class="category-name">
                        <span class="category-icon" style="background: ${cat.color}22;">${cat.icon}</span>
                        ${cat.name}
                    </div>
                    <span class="category-amount">${formatMoney(amount)}</span>
                </div>
                <div class="category-progress">
                    <div class="category-progress-bar" style="width: ${percent}%; background: ${cat.color};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTransactions(transactions) {
    const container = document.getElementById('transactionsList');
    
    if (transactions.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-dim); padding:40px 20px;">Нет расходов за этот период</div>';
        return;
    }
    
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sorted.map(t => {
        const cat = CATEGORIES.expense.find(c => c.id === t.category) || { icon: '📝', color: '#666' };
        return `
            <div class="transaction-item" data-id="${t.id}">
                <div class="transaction-icon" style="background: ${cat.color}22; color: ${cat.color};">${cat.icon}</div>
                <div class="transaction-info">
                    <div class="transaction-category">${cat.name}</div>
                    ${t.note ? `<div class="transaction-note">${t.note}</div>` : ''}
                </div>
                <div class="transaction-right">
                    <span class="transaction-amount">−${formatMoney(t.amount)}</span>
                    <span class="transaction-date">${formatDate(t.date)}</span>
                </div>
                <button class="delete-btn" data-id="${t.id}" aria-label="Удалить">🗑️</button>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            state.transactions = state.transactions.filter(tr => tr.id !== id);
            saveData();
            render();
        });
    });
}

function render() {
    const transactions = filterTransactions(state.currentPeriod);
    const data = calculateTotals(transactions);
    
    updateCircle(data, state.currentPeriod);
    renderCategories(data);
    renderTransactions(transactions);
    document.getElementById('monthlyIncome').value = state.settings.monthlyIncome || '';
    document.getElementById('savingsGoal').value = state.settings.savingsGoal || '';
    document.getElementById('transportCost').value = state.settings.transportCost || '';
    document.getElementById('phoneCost').value = state.settings.phoneCost || '';
    document.getElementById('notificationsEnabled').checked = state.settings.notificationsEnabled;
}

function showModal(overlayId) {
    document.getElementById(overlayId).classList.add('active');
}

function hideModal(overlayId) {
    document.getElementById(overlayId).classList.remove('active');
}

function resetForm() {
    document.getElementById('transactionForm').reset();
    state.selectedCategory = 'food';
    renderCategoryButtons();
    document.getElementById('amount').focus();
}

function renderCategoryButtons() {
    const container = document.getElementById('categoryButtons');
    const cats = CATEGORIES.expense;
    container.innerHTML = cats.map(cat => `
        <button type="button" class="category-btn ${state.selectedCategory === cat.id ? 'selected' : ''}" data-category="${cat.id}">
            <span class="cat-icon">${cat.icon}</span> ${cat.name}
        </button>
    `).join('');
    
    container.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.selectedCategory = btn.dataset.category;
            renderCategoryButtons();
        });
    });
}

function initEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentPeriod = btn.dataset.period;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            render();
        });
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentView = btn.dataset.view;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            if (state.currentView === 'add') {
                showModal('modalOverlay');
                resetForm();
            } else if (state.currentView === 'settings') {
                showModal('settingsModalOverlay');
            } else {
                document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
            }
        });
    });
    
    document.getElementById('closeModal').addEventListener('click', () => {
        hideModal('modalOverlay');
        document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="add"]').classList.remove('active');
        state.currentView = 'main';
    });
    
    document.getElementById('closeSettings').addEventListener('click', () => {
        hideModal('settingsModalOverlay');
        document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="settings"]').classList.remove('active');
        state.currentView = 'main';
    });
    
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalOverlay') {
            hideModal('modalOverlay');
            document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
            document.querySelector('.nav-btn[data-view="add"]').classList.remove('active');
            state.currentView = 'main';
        }
    });
    
    document.getElementById('settingsModalOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModalOverlay') {
            hideModal('settingsModalOverlay');
            document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
            document.querySelector('.nav-btn[data-view="settings"]').classList.remove('active');
            state.currentView = 'main';
        }
    });
    
    document.getElementById('transactionForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('amount').value);
        const note = document.getElementById('note').value.trim();
        
        if (!amount || !state.selectedCategory) return;
        
        state.transactions.unshift({
            id: Date.now().toString(),
            type: 'expense',
            category: state.selectedCategory,
            amount,
            note,
            date: new Date().toISOString()
        });
        
        saveData();
        render();
        hideModal('modalOverlay');
        document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="add"]').classList.remove('active');
        state.currentView = 'main';
    });
    
    document.getElementById('saveSettings').addEventListener('click', () => {
        state.settings.monthlyIncome = parseFloat(document.getElementById('monthlyIncome').value) || 0;
        state.settings.savingsGoal = parseFloat(document.getElementById('savingsGoal').value) || 0;
        state.settings.transportCost = parseFloat(document.getElementById('transportCost').value) || 0;
        state.settings.phoneCost = parseFloat(document.getElementById('phoneCost').value) || 0;
        state.settings.notificationsEnabled = document.getElementById('notificationsEnabled').checked;
        saveData();
        render();
        hideModal('settingsModalOverlay');
        document.querySelector('.nav-btn[data-view="main"]').classList.add('active');
        document.querySelector('.nav-btn[data-view="settings"]').classList.remove('active');
        state.currentView = 'main';
    });
    
    document.getElementById('clearData').addEventListener('click', () => {
        if (confirm('Удалить ВСЕ данные? Это действие нельзя отменить.')) {
            state.transactions = [];
            saveData();
            render();
        }
    });
}

function init() {
    loadData();
    initEventListeners();
    renderCategoryButtons();
    render();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            console.log('SW ready');
        });
    }
}

document.addEventListener('DOMContentLoaded', init);