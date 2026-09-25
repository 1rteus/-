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
const DAY_MS = 86400000;

const state = {
    transactions: [],
    settings: { ...DEFAULT_SETTINGS },
    period: 'week',
    weekOffset: 0,
    selectedCategory: 'food',
    formType: 'expense'
};

function formatMoney(value) {
    const totalKop = Math.round(Math.abs(value) * 100);
    const whole = Math.floor(totalKop / 100);
    const kop = totalKop % 100;
    const sign = value < 0 ? '-' : '';
    const wholeStr = new Intl.NumberFormat('ru-RU').format(whole);
    if (kop === 0) return sign + wholeStr + ' ₽';
    return sign + wholeStr + '.' + String(kop).padStart(2, '0') + ' ₽';
}

function parseAmount(raw) {
    const normalized = String(raw).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const value = parseFloat(normalized);
    if (!value || value <= 0) return null;
    return Math.round(value * 100) / 100;
}

function parseFloatSafe(raw, fallback) {
    const normalized = String(raw == null ? '' : raw).trim().replace(',', '.');
    const value = parseFloat(normalized);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function addMonths(d, n) {
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), lastDay));
    return target;
}

function isIncome(t) {
    return t.type === 'income';
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

function getIncomes() {
    return state.transactions
        .filter(isIncome)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getMonthlyIncomeSource() {
    const settingsIncome = Number(state.settings.monthlyIncome) || 0;
    if (settingsIncome > 0) return settingsIncome;
    const incomes = getIncomes();
    return incomes.length ? incomes[incomes.length - 1].amount : 0;
}

function getAvailableMonthly() {
    const s = state.settings;
    const income = getMonthlyIncomeSource();
    if (income <= 0) return 0;
    const total = income - (Number(s.savingsGoal) || 0) - (Number(s.transportCost) || 0) - (Number(s.phoneCost) || 0);
    return Math.max(0, total);
}

function getWeeklyQuota() {
    return getAvailableMonthly() / 4.33;
}

function getCycle() {
    const incomes = getIncomes();
    const now = new Date();
    const past = incomes.filter((i) => new Date(i.date) <= now);

    if (past.length === 0) {
        const mb = getMonthBounds();
        return { start: mb.start, end: mb.end, hasIncome: false };
    }

    let start = startOfDay(new Date(past[past.length - 1].date));
    let guard = 0;
    while (addMonths(start, 1) <= now && guard < 600) {
        start = addMonths(start, 1);
        guard += 1;
    }
    return { start, end: addMonths(start, 1), hasIncome: true };
}

function getDaysToTopUp() {
    const cycle = getCycle();
    if (!cycle.hasIncome) return null;
    return Math.max(0, Math.ceil((startOfDay(cycle.end) - startOfDay(new Date())) / DAY_MS));
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
    if (period === 'month') {
        const cycle = getCycle();
        return { start: cycle.start, end: cycle.end };
    }
    return getWeekBounds(weekOffset);
}

function txnsIn(start, end) {
    return state.transactions.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d < end;
    });
}

function expensesIn(start, end) {
    return txnsIn(start, end)
        .filter((t) => !isIncome(t))
        .reduce((sum, t) => sum + t.amount, 0);
}

function getPeriodTransactions() {
    const { start, end } = getPeriodBounds(state.period, state.weekOffset);
    return txnsIn(start, end);
}

function getPeriodExpense() {
    const { start, end } = getPeriodBounds(state.period, state.weekOffset);
    return expensesIn(start, end);
}

function getCategoryExpense(categoryKey) {
    const { start, end } = getPeriodBounds(state.period, state.weekOffset);
    return txnsIn(start, end)
        .filter((t) => !isIncome(t) && t.category === categoryKey)
        .reduce((sum, t) => sum + t.amount, 0);
}

function computeWeekCarry(targetOffset) {
    if (getAvailableMonthly() <= 0) return 0;

    const cycle = getCycle();
    const currentWeekStart = getWeekBounds(0).start;
    const daysFromCurrent = Math.round((startOfDay(cycle.start) - currentWeekStart) / DAY_MS);
    const fromOffset = Math.floor(daysFromCurrent / 7);

    let carry = 0;
    for (let w = fromOffset; w < targetOffset; w += 1) {
        const b = getWeekBounds(w);
        const spent = expensesIn(b.start, b.end);
        const remaining = getWeeklyQuota() + carry - spent;
        carry = (remaining < 0 || spent > 0) ? remaining : 0;
    }
    return carry;
}

function getWeekCarry(offset) {
    return computeWeekCarry(offset);
}

function getAvailable() {
    if (state.period === 'month') return getAvailableMonthly();
    return getWeeklyQuota() + computeWeekCarry(state.weekOffset);
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
    const available = getAvailable();
    const expense = getPeriodExpense();
    const remaining = available - expense;
    const hasQuota = available > 0;
    const burn = hasQuota && remaining <= 5;
    const cycle = getCycle();
    const days = getDaysToTopUp();

    const quotaRing = document.getElementById('quotaRing');
    const expenseTrack = document.getElementById('expenseTrack');
    const wrapper = document.getElementById('circleWrapper');
    const center = document.getElementById('circleCenter');
    const amountEl = document.getElementById('centerAmount');
    const labelEl = document.getElementById('centerLabel');
    const quotaEl = document.getElementById('centerQuota');
    const carryEl = document.getElementById('centerCarry');
    const warningEl = document.getElementById('centerWarning');

    quotaRing.style.strokeDasharray = String(QUOTA_C);
    quotaRing.style.strokeDashoffset = hasQuota ? '0' : String(QUOTA_C);
    expenseTrack.style.strokeDasharray = String(EXPENSE_C);
    expenseTrack.style.strokeDashoffset = hasQuota ? '0' : String(EXPENSE_C);
    expenseTrack.style.opacity = hasQuota ? '1' : '0';

    drawCategorySegments(expense, available, burn);

    if (hasQuota) {
        amountEl.textContent = formatMoney(remaining);
        if (state.period === 'month') {
            labelEl.textContent = 'Остаток до пополнения';
            quotaEl.textContent = days !== null
                ? 'Квота: ' + formatMoney(available) + ' · ' + days + ' дн.'
                : 'Квота: ' + formatMoney(available);
        } else {
            labelEl.textContent = 'Остаток недели';
            quotaEl.textContent = 'Квота: ' + formatMoney(available);
        }
        const carry = state.period === 'week' ? getWeekCarry(state.weekOffset) : 0;
        if (Math.abs(carry) >= 0.5) {
            carryEl.textContent = 'Перенос: ' + formatMoney(carry);
            carryEl.classList.remove('hidden');
        } else {
            carryEl.classList.add('hidden');
        }
    } else {
        amountEl.textContent = formatMoney(expense);
        labelEl.textContent = 'Потрачено';
        quotaEl.textContent = 'Укажите доход';
        carryEl.classList.add('hidden');
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

    void cycle;
}

function updateStats() {
    const available = getAvailable();
    const expense = getPeriodExpense();
    const remaining = available - expense;
    const incomes = getIncomes();
    const days = getDaysToTopUp();

    document.getElementById('totalExpense').textContent = formatMoney(expense);
    document.getElementById('totalBalance').textContent = formatMoney(available > 0 ? remaining : 0);
    document.getElementById('balanceLabel').textContent =
        state.period === 'month' ? 'Остаток до пополнения' : 'Остаток недели';
    document.getElementById('lastIncome').textContent =
        incomes.length ? formatMoney(incomes[incomes.length - 1].amount) : '—';
    document.getElementById('daysToTopUp').textContent = days !== null ? days + ' дн.' : '—';
}

function getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

function canGoPrevWeek() {
    return getWeekBounds(state.weekOffset - 1).start >= getMonthStart();
}

function canGoNextWeek() {
    return state.weekOffset < 0;
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
    nextBtn.disabled = !canGoNextWeek();
    prevBtn.disabled = !canGoPrevWeek();

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
    const quota = getAvailable();
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
        const income = isIncome(t);
        const cat = income
            ? { name: 'Пополнение', icon: '💰', color: '#4ecdc4' }
            : (CATEGORIES[t.category] || CATEGORIES.other);
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
                <div class="transaction-amount${income ? ' income' : ''}">${income ? '+' : '-'}${formatMoney(t.amount)}</div>
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

function setFormType(type) {
    state.formType = type;
    document.querySelectorAll('.type-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.type === type);
    });
    document.getElementById('categoryGroup').classList.toggle('hidden', type === 'income');
    document.getElementById('dateGroup').classList.toggle('hidden', type !== 'income');
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

function openAddModal() {
    const dateInput = document.getElementById('txDate');
    if (dateInput) dateInput.value = todayStr();
    openModal('modalOverlay');
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
        if (canGoPrevWeek()) {
            state.weekOffset -= 1;
            renderAll();
        }
    });
    document.getElementById('nextWeek').addEventListener('click', () => {
        if (canGoNextWeek()) {
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
                openAddModal();
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

    document.querySelectorAll('.type-btn').forEach((btn) => {
        btn.addEventListener('click', () => setFormType(btn.dataset.type));
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('amount');
        const noteInput = document.getElementById('note');
        const amount = parseAmount(amountInput.value);

        if (!amount) return;

        const tx = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            amount,
            note: noteInput.value.trim(),
            date: new Date().toISOString()
        };

        if (state.formType === 'income') {
            const dateVal = document.getElementById('txDate').value;
            if (dateVal) {
                const [y, m, d] = dateVal.split('-').map(Number);
                tx.date = new Date(y, m - 1, d).toISOString();
            }
            tx.type = 'income';
        } else {
            if (!CATEGORIES[state.selectedCategory]) return;
            tx.category = state.selectedCategory;
        }

        state.transactions.push(tx);
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
            monthlyIncome: parseFloatSafe(document.getElementById('monthlyIncome').value, 0),
            savingsGoal: parseFloatSafe(document.getElementById('savingsGoal').value, 0),
            transportCost: parseFloatSafe(document.getElementById('transportCost').value, 0),
            phoneCost: parseFloatSafe(document.getElementById('phoneCost').value, 0),
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
    setFormType('expense');
    initTabs();
    initWeekNav();
    initBottomNav();
    initForm();
    initTransactionsDelete();
    initSettings();
    renderAll();
}

document.addEventListener('DOMContentLoaded', init);
