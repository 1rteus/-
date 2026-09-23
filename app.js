'use strict';

const CATEGORIES = {
    food: { name: 'Еда', icon: '🍔', color: '#ff6b6b' },
    fun: { name: 'Развлечения', icon: '🎮', color: '#a855f7' },
    gifts: { name: 'Подарки', icon: '🎁', color: '#f59e0b' },
    other: { name: 'Другое', icon: '📦', color: '#64748b' }
};

const STORAGE_KEY = 'finance_tracker_data';
const SETTINGS_KEY = 'finance_tracker_settings';

const DEFAULT_SETTINGS = {
    monthlyIncome: 0,
    savingsGoal: 200,
    transportCost: 54,
    phoneCost: 57,
    notificationsEnabled: true
};

const QUOTA_RADIUS = 140;
const EXPENSE_RADIUS = 122;
const QUOTA_C = 2 * Math.PI * QUOTA_RADIUS;
const EXPENSE_C = 2 * Math.PI * EXPENSE_RADIUS;
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
    transactions: [],
    settings: { ...DEFAULT_SETTINGS },
    period: 'week',
    weekOffset: 0,
    selectedCategory: 'food'
};

function formatMoney(value) {
    const rounded = Math.round(value);
    const abs = Math.abs(rounded);
    const formatted = new Intl.NumberFormat('ru-RU').format(abs);
    return (rounded < 0 ? '-' : '') + formatted + ' ₽';
}

function loadState() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (Array.isArray(data)) {
            state.transactions = data.filter((t) => t && typeof t.amount === 'number' && t.amount > 0);
        }
    } catch (e) {
        state.transactions = [];
    }
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        state.settings = { ...DEFAULT_SETTINGS, ...settings };
    } catch (e) {
        state.settings = { ...DEFAULT_SETTINGS };
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function getAvailableMonthly() {
    const s = state.settings;
    const income = Number(s.monthlyIncome) || 0;
    if (income <= 0) return 0;
    const total = income - (Number(s.savingsGoal) || 0) - (Number(s.transportCost) || 0) - (Number(s.phoneCost) || 0);
    return Math.max(0, total);
}

function getWeeklyQuota() {
    return getAvailableMonthly() / 4.33;
}

function getQuota(period) {
    return period === 'month' ? getAvailableMonthly() : getWeeklyQuota();
}

function getWeekBounds(offset) {
    const now = new Date();
    const day = now.getDay() || 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1) + offset * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { start, end };
}

function getMonthBounds() {
    const now = new Date();
    return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
    };
}

function getPeriodBounds(period, weekOffset) {
    return period === 'month' ? getMonthBounds() : getWeekBounds(weekOffset);
}

function getPeriodTransactions() {
    const { start, end } = getPeriodBounds(state.period, state.weekOffset);
    return state.transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d < end;
    });
}

function getPeriodExpense() {
    return getPeriodTransactions().reduce((sum, t) => sum + t.amount, 0);
}

function getCategoryExpense(categoryKey) {
    return getPeriodTransactions()
        .filter((t) => t.category === categoryKey)
        .reduce((sum, t) => sum + t.amount, 0);
}

function drawCategorySegments(expense, quota, burn) {
    const group = document.getElementById('expenseRings');
    if (!group) return;
    group.innerHTML = '';
    if (expense <= 0) return;

    const ratio = quota > 0 ? Math.min(expense / quota, 1) : 1;
    const totalArc = ratio * EXPENSE_C;
    let cursor = 0;

    Object.keys(CATEGORIES).forEach((key) => {
        const amount = getCategoryExpense(key);
        if (amount <= 0) return;
        const len = (amount / expense) * totalArc;
        if (len <= 0.1) return;

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', '160');
        circle.setAttribute('cy', '160');
        circle.setAttribute('r', String(EXPENSE_RADIUS));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke-width', '18');
        circle.setAttribute('stroke', burn ? 'url(#burnGradient)' : CATEGORIES[key].color);
        circle.setAttribute('stroke-dasharray', `${len} ${EXPENSE_C - len}`);
        circle.setAttribute('stroke-dashoffset', String(-cursor));
        group.appendChild(circle);
        cursor += len;
    });
}

function updateCircle() {
    const quota = getQuota(state.period);
    const expense = getPeriodExpense();
    const remaining = quota - expense;
    const hasQuota = quota > 0;
    const burn = hasQuota && remaining <= 5;

    const quotaRing = document.getElementById('quotaRing');
    const expenseTrack = document.getElementById('expenseTrack');
    const wrapper = document.getElementById('circleWrapper');
    const center = document.getElementById('circleCenter');
    const amountEl = document.getElementById('centerAmount');
    const labelEl = document.getElementById('centerLabel');
    const quotaEl = document.getElementById('centerQuota');
    const warningEl = document.getElementById('centerWarning');

    quotaRing.style.strokeDasharray = String(QUOTA_C);
    quotaRing.style.strokeDashoffset = hasQuota ? '0' : String(QUOTA_C);
    expenseTrack.style.strokeDasharray = String(EXPENSE_C);
    expenseTrack.style.strokeDashoffset = hasQuota ? '0' : String(EXPENSE_C);
    expenseTrack.style.opacity = hasQuota ? '1' : '0';

    drawCategorySegments(expense, quota, burn);

    if (hasQuota) {
        amountEl.textContent = formatMoney(remaining);
        labelEl.textContent = state.period === 'month' ? 'Остаток месяца' : 'Остаток недели';
        quotaEl.textContent = 'Квота: ' + formatMoney(quota);
    } else {
        amountEl.textContent = formatMoney(expense);
        labelEl.textContent = 'Потрачено';
        quotaEl.textContent = 'Укажите доход';
    }

    if (burn) {
        warningEl.textContent = remaining < 0 ? 'Перерасход!' : 'Горит!';
        wrapper.classList.add('burn');
        center.classList.add('burn');
    } else {
        warningEl.textContent = '';
        wrapper.classList.remove('burn');
        center.classList.remove('burn');
    }
}

function updateStats() {
    const quota = getQuota(state.period);
    const expense = getPeriodExpense();
    const remaining = quota - expense;

    document.getElementById('totalExpense').textContent = formatMoney(expense);
    document.getElementById('totalBalance').textContent = formatMoney(quota > 0 ? remaining : 0);
    document.getElementById('balanceLabel').textContent =
        state.period === 'month' ? 'Остаток месяца' : 'Остаток недели';
    document.getElementById('monthlyAvailable').textContent = formatMoney(getAvailableMonthly());
}

function updateWeekNav() {
    const nav = document.getElementById('weekNav');
    const indicator = document.getElementById('weekIndicator');
    const nextBtn = document.getElementById('nextWeek');
    const prevBtn = document.getElementById('prevWeek');

    if (state.period !== 'week') {
        nav.classList.add('hidden');
        return;
    }
    nav.classList.remove('hidden');
    nextBtn.disabled = state.weekOffset >= 0;
    prevBtn.disabled = state.weekOffset <= -52;

    if (state.weekOffset === 0) {
        indicator.textContent = 'Эта неделя';
        return;
    }
    const { start, end } = getWeekBounds(state.weekOffset);
    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    indicator.textContent = `${fmt(start)} – ${fmt(new Date(end.getTime() - 1))}`;
}

function renderCategoryList() {
    const container = document.getElementById('categoryList');
    const expense = getPeriodExpense();
    const quota = getQuota(state.period);
    container.innerHTML = '';

    Object.keys(CATEGORIES).forEach((key) => {
        const cat = CATEGORIES[key];
        const amount = getCategoryExpense(key);
        let percent = 0;
        if (quota > 0) {
            percent = Math.min((amount / quota) * 100, 100);
        } else if (expense > 0) {
            percent = (amount / expense) * 100;
        }

        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <div class="category-info">
                <div class="category-name">
                    <span class="category-icon" style="background:${cat.color}22">${cat.icon}</span>
                    <span>${cat.name}</span>
                </div>
                <span class="category-amount" style="color:${cat.color}">${formatMoney(amount)}</span>
            </div>
            <div class="category-progress">
                <div class="category-progress-bar" style="width:${percent}%;background:${cat.color}"></div>
            </div>
        `;
        container.appendChild(item);
    });
}

function renderTransactions() {
    const container = document.getElementById('transactionsList');
    const items = getPeriodTransactions().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="transaction-item"><div class="transaction-info"><div class="transaction-category">Пока пусто</div><div class="transaction-note">Добавьте первый расход</div></div></div>';
        return;
    }

    items.forEach((t) => {
        const cat = CATEGORIES[t.category] || CATEGORIES.other;
        const d = new Date(t.date);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.innerHTML = `
            <div class="transaction-icon" style="background:${cat.color}22">${cat.icon}</div>
            <div class="transaction-info">
                <div class="transaction-category">${cat.name}</div>
                ${t.note ? `<div class="transaction-note">${escapeHtml(t.note)}</div>` : ''}
            </div>
            <div class="transaction-right">
                <div class="transaction-amount">-${formatMoney(t.amount)}</div>
                <div class="transaction-date">${dateStr} ${timeStr}</div>
            </div>
            <button class="delete-btn" data-id="${t.id}" aria-label="Удалить">✕</button>
        `;
        container.appendChild(item);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderCategoryButtons() {
    const container = document.getElementById('categoryButtons');
    container.innerHTML = '';
    Object.keys(CATEGORIES).forEach((key) => {
        const cat = CATEGORIES[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'category-btn' + (state.selectedCategory === key ? ' selected' : '');
        btn.dataset.category = key;
        btn.innerHTML = `<span class="cat-icon">${cat.icon}</span><span>${cat.name}</span>`;
        btn.addEventListener('click', () => {
            state.selectedCategory = key;
            renderCategoryButtons();
        });
        container.appendChild(btn);
    });
}

function renderAll() {
    updateCircle();
    updateStats();
    updateWeekNav();
    renderCategoryList();
    renderTransactions();
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.period = btn.dataset.period;
            renderAll();
        });
    });
}

function initWeekNav() {
    document.getElementById('prevWeek').addEventListener('click', () => {
        if (state.weekOffset > -52) {
            state.weekOffset -= 1;
            renderAll();
        }
    });
    document.getElementById('nextWeek').addEventListener('click', () => {
        if (state.weekOffset < 0) {
            state.weekOffset += 1;
            renderAll();
        }
    });
}

function initBottomNav() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === 'add') {
                openModal('modalOverlay');
            } else if (view === 'settings') {
                openSettings();
            } else {
                closeModal('modalOverlay');
                closeModal('settingsModalOverlay');
            }
            document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function initForm() {
    const form = document.getElementById('transactionForm');
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('closeModal');

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal('modalOverlay');
            setActiveNav('main');
        }
    });
    closeBtn.addEventListener('click', () => {
        closeModal('modalOverlay');
        setActiveNav('main');
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('amount');
        const noteInput = document.getElementById('note');
        const amount = parseFloat(amountInput.value);

        if (!amount || amount <= 0 || !CATEGORIES[state.selectedCategory]) return;

        state.transactions.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            amount: Math.round(amount * 100) / 100,
            category: state.selectedCategory,
            note: noteInput.value.trim(),
            date: new Date().toISOString()
        });
        saveState();
        form.reset();
        state.selectedCategory = 'food';
        renderCategoryButtons();
        closeModal('modalOverlay');
        setActiveNav('main');
        renderAll();
    });
}

function setActiveNav(view) {
    document.querySelectorAll('.nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.view === view);
    });
}

function initTransactionsDelete() {
    document.getElementById('transactionsList').addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-btn');
        if (!btn) return;
        state.transactions = state.transactions.filter((t) => t.id !== btn.dataset.id);
        saveState();
        renderAll();
    });
}

function openSettings() {
    document.getElementById('monthlyIncome').value = state.settings.monthlyIncome || '';
    document.getElementById('savingsGoal').value = state.settings.savingsGoal || '';
    document.getElementById('transportCost').value = state.settings.transportCost || '';
    document.getElementById('phoneCost').value = state.settings.phoneCost || '';
    document.getElementById('notificationsEnabled').checked = !!state.settings.notificationsEnabled;
    openModal('settingsModalOverlay');
}

function initSettings() {
    const overlay = document.getElementById('settingsModalOverlay');
    const closeBtn = document.getElementById('closeSettings');
    const saveBtn = document.getElementById('saveSettings');
    const clearBtn = document.getElementById('clearData');

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal('settingsModalOverlay');
            setActiveNav('main');
        }
    });
    closeBtn.addEventListener('click', () => {
        closeModal('settingsModalOverlay');
        setActiveNav('main');
    });

    saveBtn.addEventListener('click', () => {
        state.settings = {
            monthlyIncome: Math.max(0, parseFloat(document.getElementById('monthlyIncome').value) || 0),
            savingsGoal: Math.max(0, parseFloat(document.getElementById('savingsGoal').value) || 0),
            transportCost: Math.max(0, parseFloat(document.getElementById('transportCost').value) || 0),
            phoneCost: Math.max(0, parseFloat(document.getElementById('phoneCost').value) || 0),
            notificationsEnabled: document.getElementById('notificationsEnabled').checked
        };
        saveSettings();
        closeModal('settingsModalOverlay');
        setActiveNav('main');
        renderAll();
    });

    clearBtn.addEventListener('click', () => {
        if (!confirm('Очистить все данные? Это действие нельзя отменить.')) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SETTINGS_KEY);
        state.transactions = [];
        state.settings = { ...DEFAULT_SETTINGS };
        state.period = 'week';
        state.weekOffset = 0;
        document.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.period === 'week');
        });
        closeModal('settingsModalOverlay');
        setActiveNav('main');
        renderAll();
    });
}

function init() {
    loadState();
    renderCategoryButtons();
    initTabs();
    initWeekNav();
    initBottomNav();
    initForm();
    initTransactionsDelete();
    initSettings();
    renderAll();
}

document.addEventListener('DOMContentLoaded', init);
