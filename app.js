const STORAGE_KEY = 'finance_tracker_data';
const SETTINGS_KEY = 'finance_tracker_settings';

const CATEGORIES = {
    expense: [
        { id: 'food', name: 'Еда', icon: '🍔', color: '#ff6b6b' },
        { id: 'entertainment', name: 'Развлечения', icon: '🎮', color: '#a855f7' },
        { id: 'gifts', name: 'Подарки', icon: '🎁', color: '#f59e0b' },
        { id: 'other', name: 'Другое', icon: '📦', color: '#64748b' }
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
    selectedCategory: 'food',
    weekOffset: 0
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

function getPeriodBounds(period, weekOffset = 0) {
    const now = new Date();
    if (period === 'week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const start = new Date(now.getFullYear(), now.getMonth(), diff - weekOffset * 7);
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

function getWeeksInMonth() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const firstMonday = new Date(firstDay);
    const day = firstDay.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    firstMonday.setDate(firstDay.getDate() + diff);
    const diffWeeks = Math.ceil((lastDay - firstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return Math.max(4, Math.min(6, diffWeeks));
}

function filterTransactions(period, weekOffset = 0) {
    const { start, end } = getPeriodBounds(period, weekOffset);
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
    const expenseRingsContainer = document.getElementById('expenseRings');
    const centerAmount = document.getElementById('centerAmount');
    const centerLabel = document.getElementById('centerLabel');
    const centerQuota = document.getElementById('centerQuota');
    const centerWarning = document.getElementById('centerWarning');
    const circleCenter = document.getElementById('circleCenter');
    const circleWrapper = document.getElementById('circleWrapper');
    const prevWeekBtn = document.getElementById('prevWeek');
    const nextWeekBtn = document.getElementById('nextWeek');
    const weekIndicator = document.getElementById('weekIndicator');
    
    const quotaCircumference = 2 * Math.PI * 140;
    const baseExpenseCircumference = 2 * Math.PI * 122;
    
    // Calculate category totals
    const categoryTotals = {};
    let totalExpense = 0;
    for (const [catId, amount] of Object.entries(byCategory)) {
        categoryTotals[catId] = (categoryTotals[catId] || 0) + amount;
        totalExpense += amount;
    }
    
    // Draw segmented expense rings
    if (expenseRingsContainer.children.length === 0) {
        // Create one ring per category
        const categories = CATEGORIES.expense;
        let offset = 0;
        categories.forEach((cat, i) => {
            const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ring.setAttribute('class', 'category-expense-ring');
            ring.setAttribute('cx', '160');
            ring.setAttribute('cy', '160');
            ring.setAttribute('r', 122 - i * 8); // Slightly smaller for each category
            ring.setAttribute('stroke-width', 14);
            const percent = totalExpense > 0 ? (categoryTotals[cat.id] / totalExpense) * 100 : 0;
            const circumference = baseExpenseCircumference * (percent / 100);
            ring.setAttribute('stroke-dasharray', circumference);
            ring.setAttribute('stroke-dashoffset', circumference);
            ring.setAttribute('stroke', cat.color);
            ring.setAttribute('fill', 'none');
            ring.setAttribute('stroke-linecap', 'round');
            expenseRingsContainer.appendChild(ring);
            offset += percent;
        });
    }
    
    // Update ring dashoffsets based on current category totals
    const rings = expenseRingsContainer.querySelectorAll('.category-expense-ring');
    let cumulativeOffset = 0;
    
    rings.forEach((ring, i) => {
        const catId = Object.keys(categoryTotals)[i] || 'other';
        const amount = categoryTotals[catId] || 0;
        const percent = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
        const circumference = baseExpenseCircumference * (percent / 100);
        ring.setAttribute('stroke-dashoffset', circumference);
        cumulativeOffset += percent;
    });
    
    // Also update the main expense ring for backward compatibility
    const mainExpenseRing = document.getElementById('expenseRing');
    mainExpenseRing.style.strokeDashoffset = baseExpenseCircumference - (totalExpense / Math.max(expense, 1) * baseExpenseCircumference);
    
    const quotaProgress = currentQuota > 0 ? (currentQuota / Math.max(totalExpense, 1)) * quotaCircumference : 0;
    quotaRing.style.strokeDashoffset = quotaCircumference - quotaProgress;
    
    const isLow = currentQuota > 0 && remaining <= 5 && remaining > 0;
    const isNegative = remaining < 0;
    
    if (isWeek) {
        if (isLow || isNegative) {
            circleCenter.classList.add('burn');
            circleWrapper.classList.add('burn');
            mainExpenseRing.style.stroke = 'url(#burnGradient)';
            quotaRing.style.stroke = 'url(#burnGradient)';
            rings.forEach(ring => ring.style.stroke = 'url(#burnGradient)');
            centerAmount.textContent = formatMoney(Math.max(remaining, 0));
            centerLabel.textContent = 'Остаток недели';
            centerQuota.textContent = `Квота: ${formatMoney(weeklyQuota)}`;
            centerWarning.textContent = isNegative ? 'Бюджет превышен!' : `Осталось: ${formatMoney(remaining)}`;
        } else {
            circleCenter.classList.remove('burn');
            circleWrapper.classList.remove('burn');
            mainExpenseRing.style.stroke = 'url(#expenseGradient)';
            quotaRing.style.stroke = 'url(#quotaGradient)';
            rings.forEach(ring => ring.style.stroke = cat => CATEGORIES.expense.find(c => c.id === cat.id)?.color);
            // Set each ring color
            rings.forEach((ring, i) => {
                const cat = CATEGORIES.expense[i];
                if (cat) ring.style.stroke = cat.color;
            });
            centerAmount.textContent = formatMoney(remaining);
            centerLabel.textContent = weeklyQuota > 0 ? 'Остаток недели' : 'Лимит не задан';
            centerQuota.textContent = weeklyQuota > 0 ? `Квота: ${formatMoney(weeklyQuota)}` : 'Укажите доход в настройках';
            centerWarning.textContent = '';
        }
    } else {
        circleCenter.classList.remove('burn');
        circleWrapper.classList.remove('burn');
        mainExpenseRing.style.stroke = 'url(#expenseGradient)';
        quotaRing.style.stroke = 'url(#quotaGradient)';
        rings.forEach(ring => ring.style.stroke = '#64748b');
        centerAmount.textContent = formatMoney(monthlyAvailable - expense);
        centerLabel.textContent = 'Баланс месяца';
        centerQuota.textContent = `Лимит месяца: ${formatMoney(monthlyAvailable)}`;
        centerWarning.textContent = '';
    }
    
    // Update week navigation
    updateWeekNavigation(period);
    
    document.getElementById('totalExpense').textContent = formatMoney(totalExpense);
    const weekRemaining = weeklyQuota - totalExpense;
    document.getElementById('totalBalance').textContent = formatMoney(isWeek ? weekRemaining : (monthlyAvailable - totalExpense));
    document.getElementById('totalBalance').style.color = (isWeek ? weekRemaining : (monthlyAvailable - totalExpense)) >= 0 ? 'var(--accent-available)' : 'var(--accent-expense)';
    document.getElementById('monthlyAvailable').textContent = formatMoney(monthlyAvailable);
}

function updateWeekNavigation(period) {
    const weeksInMonth = getWeeksInMonth();
    const prevWeekBtn = document.getElementById('prevWeek');
    const nextWeekBtn = document.getElementById('nextWeek');
    const weekIndicator = document.getElementById('weekIndicator');
    
    if (period !== 'week') {
        prevWeekBtn.style.display = 'none';
        nextWeekBtn.style.display = 'none';
        weekIndicator.textContent = 'Неделя';
        return;
    }
    
    prevWeekBtn.style.display = 'block';
    nextWeekBtn.style.display = 'block';
    
    // Calculate which week we're showing based on currentOffset
    const offset = state.weekOffset || 0;
    const currentWeekNum = offset + 1;
    weekIndicator.textContent = `Неделя ${currentWeekNum} из ${weeksInMonth}`;
    
    // Enable/disable navigation buttons
    prevWeekBtn.disabled = offset <= 0;
    nextWeekBtn.disabled = offset >= weeksInMonth - 1;
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
    const transactions = filterTransactions(state.currentPeriod, state.weekOffset);
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
            // Reset week offset when switching periods
            if (state.currentPeriod !== 'week') {
                state.weekOffset = 0;
            }
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
    
    document.getElementById('prevWeek').addEventListener('click', () => {
        if (state.weekOffset > 0) {
            state.weekOffset--;
            render();
        }
    });
    
    document.getElementById('nextWeek').addEventListener('click', () => {
        const weeksInMonth = getWeeksInMonth();
        if (state.weekOffset < weeksInMonth - 1) {
            state.weekOffset++;
            render();
        }
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