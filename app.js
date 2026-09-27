/**
 * CoinTrack — Personal Finance Dashboard
 * Modular vanilla JS: Utils · Storage · State · DOM · Logic · Render · Events
 */

/* ================= 1. UTILITIES & CONSTANTS ================= */
const CONSTANTS = {
  STORAGE_KEY: 'cointrack_data_v1',
  THEME_KEY: 'cointrack_theme',
  CATEGORIES: ['Housing', 'Food', 'Salary', 'Transport', 'Entertainment', 'Utilities', 'Health', 'Shopping', 'Other'],
  CURRENCY: 'NGN',
  LOCALE: 'en-NG'
};

const Utils = {
  uid: () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),

  // Prevent XSS when interpolating user content into innerHTML.
  escapeHTML: (str) => {
    if (typeof str !== 'string') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, (c) => map[c]);
  },

  // Strict 2-decimal rounding to avoid floating-point drift.
  roundCurrency: (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100,

  formatCurrency: (value) => new Intl.NumberFormat(CONSTANTS.LOCALE, {
    style: 'currency', currency: CONSTANTS.CURRENCY, maximumFractionDigits: 2
  }).format(Utils.roundCurrency(value)),

  formatCompact: (value) => {
    const abs = Math.abs(value);
    if (abs >= 1e6) return '₦' + (value / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '₦' + Math.round(value / 1e3) + 'k';
    return '₦' + Math.round(value);
  },

  formatDate: (dateString) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(`${dateString}T12:00:00`)),

  getDateRange: (period) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    switch (period) {
      case 'lastMonth':
        start.setMonth(now.getMonth() - 1, 1);
        end.setDate(0); // last day of previous month
        break;
      case 'last30': start.setDate(now.getDate() - 30); break;
      case 'last90': start.setDate(now.getDate() - 90); break;
      case 'thisYear': start.setMonth(0, 1); break;
      case 'all': start.setFullYear(1970, 0, 1); break;
      case 'currentMonth':
      default: start.setDate(1); break;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  },

  isDateInRange: (dateString, start, end) => {
    const d = new Date(`${dateString}T12:00:00`);
    return d >= start && d <= end;
  }
};

/* ================= 2. STORAGE LAYER ================= */
const Storage = {
  load: () => {
    try {
      const raw = localStorage.getItem(CONSTANTS.STORAGE_KEY);
      if (!raw) return Storage.getDefaultState();
      const data = JSON.parse(raw);
      if (!Array.isArray(data.transactions)) throw new Error('Invalid schema');
      data.transactions = data.transactions.map((t) => ({
        id: t.id || Utils.uid(),
        title: String(t.title || '').trim(),
        amount: Utils.roundCurrency(Number(t.amount) || 0),
        category: CONSTANTS.CATEGORIES.includes(t.category) ? t.category : 'Other',
        date: t.date || new Date().toISOString().slice(0, 10),
        type: Number(t.amount) >= 0 ? 'income' : 'expense',
        notes: String(t.notes || '').trim()
      }));
      if (!data.budgets || typeof data.budgets !== 'object') {
        data.budgets = {};
        CONSTANTS.CATEGORIES.forEach((c) => { data.budgets[c] = 0; });
      }
      return data;
    } catch (e) {
      console.error('Storage load failed, resetting:', e);
      return Storage.getDefaultState();
    }
  },

  save: (data) => {
    try {
      localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify({
        transactions: data.transactions, budgets: data.budgets
      }));
    } catch (e) {
      console.error('Storage save failed:', e);
      Toast.show('Could not save data (storage may be full).', { type: 'error' });
    }
  },

  getDefaultState: () => {
    const today = new Date();
    const iso = (offset) => { const d = new Date(today); d.setDate(today.getDate() - offset); return d.toISOString().slice(0, 10); };
    const budgets = {};
    CONSTANTS.CATEGORIES.forEach((c) => { budgets[c] = 0; });
    budgets.Food = 60000; budgets.Transport = 25000; budgets.Entertainment = 20000;
    return {
      transactions: [
        { id: Utils.uid(), title: 'Monthly salary', amount: 480000, category: 'Salary', date: iso(2), type: 'income', notes: '' },
        { id: Utils.uid(), title: 'Apartment rent', amount: -165000, category: 'Housing', date: iso(5), type: 'expense', notes: '' },
        { id: Utils.uid(), title: 'Weekend groceries', amount: -13845, category: 'Food', date: iso(1), type: 'expense', notes: '' }
      ],
      budgets
    };
  }
};

/* ================= 3. STATE ================= */
const State = {
  data: Storage.load(),
  filters: { search: '', type: 'all', category: 'all', sort: 'date-desc', period: 'currentMonth' },
  editingId: null
};

/* ================= 4. DOM ================= */
const DOM = {
  form: document.querySelector('#transactionForm'),
  editIdField: document.querySelector('#editTransactionId'),
  title: document.querySelector('#title'),
  amount: document.querySelector('#amount'),
  date: document.querySelector('#date'),
  category: document.querySelector('#category'),
  notes: document.querySelector('#notes'),
  submitBtn: document.querySelector('#submitBtn'),
  cancelEditBtn: document.querySelector('#cancelEditBtn'),
  formHeading: document.querySelector('#formHeading'),

  search: document.querySelector('#search'),
  typeFilter: document.querySelector('#typeFilter'),
  categoryFilter: document.querySelector('#categoryFilter'),
  sortFilter: document.querySelector('#sortFilter'),
  periodSelector: document.querySelector('#periodSelector'),
  resetFiltersBtn: document.querySelector('#resetFiltersBtn'),

  transactionsList: document.querySelector('#transactions'),
  emptyState: document.querySelector('#emptyState'),
  resultCount: document.querySelector('#resultCount'),

  balanceValue: document.querySelector('#balanceValue'),
  incomeValue: document.querySelector('#incomeValue'),
  expenseValue: document.querySelector('#expenseValue'),
  savingsRateValue: document.querySelector('#savingsRateValue'),
  cashFlowLabel: document.querySelector('#cashFlowLabel'),
  currentPeriodLabel: document.querySelector('#currentPeriodLabel'),

  chart: document.querySelector('#cashflowChart'),
  insightsList: document.querySelector('#insightsList'),
  categoryBreakdown: document.querySelector('#categoryBreakdown'),
  budgetBreakdown: document.querySelector('#budgetBreakdown'),

  themeToggle: document.querySelector('#themeToggle'),

  dataModal: document.querySelector('#dataModal'),
  dataMenuBtn: document.querySelector('#dataMenuBtn'),
  closeDataModalBtn: document.querySelector('#closeDataModalBtn'),
  exportJsonBtn: document.querySelector('#exportJsonBtn'),
  exportCsvBtn: document.querySelector('#exportCsvBtn'),
  importJsonBtn: document.querySelector('#importJsonBtn'),
  importFile: document.querySelector('#importFile'),
  clearDataBtn: document.querySelector('#clearDataBtn'),

  budgetModal: document.querySelector('#budgetModal'),
  editBudgetsBtn: document.querySelector('#editBudgetsBtn'),
  closeBudgetModalBtn: document.querySelector('#closeBudgetModalBtn'),
  cancelBudgetBtn: document.querySelector('#cancelBudgetBtn'),
  saveBudgetsBtn: document.querySelector('#saveBudgetsBtn'),
  budgetFormContainer: document.querySelector('#budgetFormContainer'),

  confirmModal: document.querySelector('#confirmModal'),
  confirmTitle: document.querySelector('#confirmTitle'),
  confirmMessage: document.querySelector('#confirmMessage'),
  confirmBtn: document.querySelector('#confirmBtn'),
  confirmCancelBtn: document.querySelector('#confirmCancelBtn'),

  toastContainer: document.querySelector('#toastContainer')
};

/* ================= 5. TOASTS & CONFIRM ================= */
const Toast = {
  show(message, opts = {}) {
    const { type = 'info', duration = 3200, action } = opts;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    const span = document.createElement('span');
    span.textContent = message;
    el.appendChild(span);

    let timer;
    const dismiss = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); };

    if (action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.onClick(); clearTimeout(timer); dismiss(); });
      el.appendChild(btn);
    }

    DOM.toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    timer = setTimeout(dismiss, duration);
  }
};

// Promise-based accessible confirm dialog (replaces window.confirm).
function showConfirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    DOM.confirmTitle.textContent = title;
    DOM.confirmMessage.textContent = message;
    DOM.confirmBtn.textContent = confirmLabel;
    DOM.confirmBtn.classList.toggle('danger', danger);
    DOM.confirmModal.showModal();

    const finish = (result) => {
      DOM.confirmBtn.onclick = null;
      DOM.confirmCancelBtn.onclick = null;
      DOM.confirmModal.close();
      resolve(result);
    };
    DOM.confirmBtn.onclick = () => finish(true);
    DOM.confirmCancelBtn.onclick = () => finish(false);
    DOM.confirmModal.addEventListener('cancel', () => finish(false), { once: true });
  });
}

/* ================= 6. CORE LOGIC ================= */
function getFilteredAndSortedTransactions() {
  const { start, end } = Utils.getDateRange(State.filters.period);
  const q = State.filters.search.toLowerCase();

  const filtered = State.data.transactions.filter((item) => {
    const matchesSearch = !q ||
      item.title.toLowerCase().includes(q) ||
      (item.notes && item.notes.toLowerCase().includes(q));
    const matchesType = State.filters.type === 'all' || item.type === State.filters.type;
    const matchesCategory = State.filters.category === 'all' || item.category === State.filters.category;
    const matchesDate = Utils.isDateInRange(item.date, start, end);
    return matchesSearch && matchesType && matchesCategory && matchesDate;
  });

  filtered.sort((a, b) => {
    switch (State.filters.sort) {
      case 'date-asc': return new Date(a.date) - new Date(b.date);
      case 'amount-desc': return Math.abs(b.amount) - Math.abs(a.amount);
      case 'amount-asc': return Math.abs(a.amount) - Math.abs(b.amount);
      case 'date-desc':
      default: return new Date(b.date) - new Date(a.date);
    }
  });
  return filtered;
}

function getPeriodTotals() {
  const { start, end } = Utils.getDateRange(State.filters.period);
  return State.data.transactions.reduce((totals, item) => {
    if (Utils.isDateInRange(item.date, start, end)) {
      totals.balance = Utils.roundCurrency(totals.balance + item.amount);
      if (item.amount > 0) totals.income = Utils.roundCurrency(totals.income + item.amount);
      else totals.expenses = Utils.roundCurrency(totals.expenses + Math.abs(item.amount));
    }
    return totals;
  }, { balance: 0, income: 0, expenses: 0 });
}

function getCategoryExpensesForPeriod() {
  const { start, end } = Utils.getDateRange(State.filters.period);
  const expenses = {};
  State.data.transactions.forEach((item) => {
    if (item.amount < 0 && Utils.isDateInRange(item.date, start, end)) {
      expenses[item.category] = Utils.roundCurrency((expenses[item.category] || 0) + Math.abs(item.amount));
    }
  });
  return Object.entries(expenses)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getMonthlySeries(months = 6) {
  const series = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    series.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
      income: 0, expense: 0
    });
  }
  State.data.transactions.forEach((t) => {
    const d = new Date(`${t.date}T12:00:00`);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const s = series.find((x) => x.key === key);
    if (!s) return;
    if (t.amount > 0) s.income = Utils.roundCurrency(s.income + t.amount);
    else s.expense = Utils.roundCurrency(s.expense + Math.abs(t.amount));
  });
  return series;
}

/* ================= 7. RENDERING ================= */
function renderSummary() {
  const totals = getPeriodTotals();
  DOM.balanceValue.textContent = Utils.formatCurrency(totals.balance);
  DOM.incomeValue.textContent = Utils.formatCurrency(totals.income);
  DOM.expenseValue.textContent = Utils.formatCurrency(totals.expenses);

  const rate = totals.income > 0 ? Math.round(((totals.income - totals.expenses) / totals.income) * 100) : 0;
  DOM.savingsRateValue.textContent = `${Math.max(0, rate)}%`;
  DOM.cashFlowLabel.textContent = `Net cash flow ${Utils.formatCurrency(totals.income - totals.expenses)}`;

  const labels = {
    currentMonth: 'This month', lastMonth: 'Last month', last30: 'Last 30 days',
    last90: 'Last 90 days', thisYear: 'This year', all: 'All time'
  };
  DOM.currentPeriodLabel.textContent = labels[State.filters.period];
}

function renderChart() {
  const series = getMonthlySeries(6);
  const maxVal = Math.max(...series.flatMap((s) => [s.income, s.expense]), 1);
  const W = 560, H = 230, padL = 46, padR = 8, padT = 12, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const groupW = innerW / series.length;
  const barW = Math.min(16, groupW / 3);
  const baseY = padT + innerH;

  let grid = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + innerH - (i / steps) * innerH;
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="chart-grid" />`;
    grid += `<text x="${padL - 8}" y="${y + 3}" class="chart-label" text-anchor="end">${Utils.formatCompact((maxVal * i) / steps)}</text>`;
  }

  let bars = '';
  series.forEach((s, i) => {
    const cx = padL + i * groupW + groupW / 2;
    const ih = Math.max(s.income > 0 ? 2 : 0, (s.income / maxVal) * innerH);
    const eh = Math.max(s.expense > 0 ? 2 : 0, (s.expense / maxVal) * innerH);
    bars += `<rect class="chart-bar chart-bar-income" x="${cx - barW - 2}" y="${baseY - ih}" width="${barW}" height="${ih}" rx="3"><title>${s.label} income: ${Utils.formatCurrency(s.income)}</title></rect>`;
    bars += `<rect class="chart-bar chart-bar-expense" x="${cx + 2}" y="${baseY - eh}" width="${barW}" height="${eh}" rx="3"><title>${s.label} expenses: ${Utils.formatCurrency(s.expense)}</title></rect>`;
    bars += `<text x="${cx}" y="${H - 8}" class="chart-label" text-anchor="middle">${s.label}</text>`;
  });

  DOM.chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${bars}</svg>`;
}

function renderBreakdown() {
  const expenses = getCategoryExpensesForPeriod();
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  if (!expenses.length) {
    DOM.categoryBreakdown.innerHTML = '<p class="muted" style="font-size:13px;">No expenses in this period.</p>';
    return;
  }
  DOM.categoryBreakdown.innerHTML = expenses.map(({ category, amount }) => {
    const percent = total ? Math.round((amount / total) * 100) : 0;
    return `
      <div>
        <div class="bar-row-head">
          <span class="name">${Utils.escapeHTML(category)}</span>
          <span class="val">${Utils.formatCurrency(amount)} · ${percent}%</span>
        </div>
        <div class="progress-track" role="img" aria-label="${Utils.escapeHTML(category)} ${percent} percent of spending">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderBudgets() {
  const expenses = getCategoryExpensesForPeriod();
  const spentMap = Object.fromEntries(expenses.map((e) => [e.category, e.amount]));
  const cats = CONSTANTS.CATEGORIES.filter((c) => c !== 'Salary');

  const rows = cats.map((category) => {
    const budget = State.data.budgets[category] || 0;
    if (budget <= 0) return '';
    const spent = spentMap[category] || 0;
    const remaining = Utils.roundCurrency(budget - spent);
    const percent = Math.min(100, Math.round((spent / budget) * 100));
    let cls = '', note = `${Utils.formatCurrency(remaining)} remaining`, noteCls = '';
    if (spent > budget) { cls = 'danger'; note = `Over by ${Utils.formatCurrency(spent - budget)}`; noteCls = 'over'; }
    else if (percent >= 80) { cls = 'warning'; note = 'Approaching limit'; }
    return `
      <div>
        <div class="bar-row-head">
          <span class="name">${Utils.escapeHTML(category)}</span>
          <span class="val">${Utils.formatCurrency(spent)} / ${Utils.formatCurrency(budget)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${cls}" style="width:${percent}%"></div></div>
        <p class="bar-note ${noteCls}">${note}</p>
      </div>`;
  }).filter(Boolean);

  DOM.budgetBreakdown.innerHTML = rows.length
    ? rows.join('')
    : '<p class="muted" style="font-size:13px;">No budgets set. Click “Manage” to add limits.</p>';
}

function renderInsights() {
  const insights = [];
  const totals = getPeriodTotals();
  const catExpenses = getCategoryExpensesForPeriod();

  if (catExpenses.length) {
    const top = catExpenses[0];
    const total = catExpenses.reduce((s, c) => s + c.amount, 0);
    const pct = Math.round((top.amount / total) * 100);
    insights.push(`Your biggest spending area is <strong>${Utils.escapeHTML(top.category)}</strong>, about ${pct}% of expenses.`);
  }
  if (totals.income > 0) {
    const rate = Math.round(((totals.income - totals.expenses) / totals.income) * 100);
    if (rate >= 20) insights.push(`Strong saving habit — you kept <strong>${rate}%</strong> of income this period.`);
    else if (rate > 0) insights.push(`You saved <strong>${rate}%</strong> of income. A common target is 20%+.`);
    else insights.push(`Expenses exceeded income by <strong>${Utils.formatCurrency(Math.abs(totals.income - totals.expenses))}</strong>.`);
  }

  const spentMap = Object.fromEntries(catExpenses.map((e) => [e.category, e.amount]));
  const over = Object.entries(State.data.budgets).filter(([cat, b]) => b > 0 && cat !== 'Salary' && (spentMap[cat] || 0) > b);
  if (over.length) insights.push(`<strong>${over.length}</strong> budget${over.length > 1 ? 's are' : ' is'} over limit this period.`);

  if (!insights.length) insights.push('Add a few transactions to unlock personalised insights.');

  DOM.insightsList.innerHTML = insights
    .slice(0, 3)
    .map((text) => `<li><span class="dot dot-income"></span><span>${text}</span></li>`)
    .join('');
}

function renderTransactions() {
  const filtered = getFilteredAndSortedTransactions();
  DOM.resultCount.textContent = `${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`;
  DOM.emptyState.classList.toggle('hidden', filtered.length > 0);
  DOM.transactionsList.classList.toggle('hidden', filtered.length === 0);

  DOM.transactionsList.innerHTML = filtered.map((item) => {
    const isIncome = item.amount > 0;
    const sign = isIncome ? '+' : '−';
    return `
      <article class="transaction-item" data-id="${item.id}">
        <div class="tx-main">
          <div class="tx-top">
            <h3 class="tx-title">${Utils.escapeHTML(item.title)}</h3>
            <span class="tx-cat">${Utils.escapeHTML(item.category)}</span>
          </div>
          <p class="tx-meta">${Utils.formatDate(item.date)} · ${item.type}${item.notes ? ' · ' + Utils.escapeHTML(item.notes) : ''}</p>
        </div>
        <div class="tx-right">
          <p class="tx-amount ${isIncome ? 'income' : 'expense'}">${sign}${Utils.formatCurrency(Math.abs(item.amount))}</p>
          <button class="row-btn edit" type="button" data-edit="${item.id}" aria-label="Edit ${Utils.escapeHTML(item.title)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="row-btn delete" type="button" data-delete="${item.id}" aria-label="Delete ${Utils.escapeHTML(item.title)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </article>`;
  }).join('');
}

function renderAll() {
  renderSummary();
  renderChart();
  renderBreakdown();
  renderBudgets();
  renderInsights();
  renderTransactions();
}

/* ================= 8. FORM & ACTIONS ================= */
function setFieldError(field, message = '') {
  field.classList.toggle('invalid', Boolean(message));
  const error = document.querySelector(`[data-error-for="${field.id}"]`);
  if (error) error.textContent = message;
}

function validateForm(formData) {
  let valid = true;
  const title = (formData.get('title') || '').trim();
  const amount = Number(formData.get('amount'));
  const category = formData.get('category');
  const date = formData.get('date');

  [DOM.title, DOM.amount, DOM.category, DOM.date].forEach((f) => setFieldError(f));

  if (!title) { setFieldError(DOM.title, 'Enter a short description.'); valid = false; }
  if (!Number.isFinite(amount) || amount <= 0) { setFieldError(DOM.amount, 'Enter an amount greater than zero.'); valid = false; }
  if (!category) { setFieldError(DOM.category, 'Choose a category.'); valid = false; }
  if (!date) { setFieldError(DOM.date, 'Choose a date.'); valid = false; }
  return valid;
}

function resetForm() {
  State.editingId = null;
  DOM.editIdField.value = '';
  DOM.form.reset();
  DOM.date.value = new Date().toISOString().slice(0, 10);
  DOM.form.querySelector('input[name="type"][value="income"]').checked = true;
  DOM.submitBtn.textContent = 'Add transaction';
  DOM.formHeading.textContent = 'Add transaction';
  DOM.cancelEditBtn.classList.add('hidden');
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(DOM.form);
  if (!validateForm(formData)) return;

  const type = formData.get('type');
  const raw = Utils.roundCurrency(Math.abs(Number(formData.get('amount'))));
  const amount = type === 'expense' ? -raw : raw;

  const tx = {
    id: State.editingId || Utils.uid(),
    title: formData.get('title').trim(),
    amount,
    category: formData.get('category'),
    date: formData.get('date'),
    type,
    notes: (formData.get('notes') || '').trim()
  };

  if (State.editingId) {
    const i = State.data.transactions.findIndex((t) => t.id === State.editingId);
    if (i !== -1) State.data.transactions[i] = tx;
    Toast.show('Transaction updated', { type: 'success' });
    resetForm();
  } else {
    State.data.transactions.unshift(tx);
    Toast.show('Transaction added', { type: 'success' });
    resetForm();
  }

  Storage.save(State.data);
  renderAll();
}

function handleEdit(id) {
  const item = State.data.transactions.find((t) => t.id === id);
  if (!item) return;
  State.editingId = id;
  DOM.editIdField.value = id;
  DOM.title.value = item.title;
  DOM.amount.value = Math.abs(item.amount);
  DOM.date.value = item.date;
  DOM.category.value = item.category;
  DOM.notes.value = item.notes || '';
  DOM.form.querySelector(`input[name="type"][value="${item.type}"]`).checked = true;
  DOM.submitBtn.textContent = 'Save changes';
  DOM.formHeading.textContent = 'Edit transaction';
  DOM.cancelEditBtn.classList.remove('hidden');
  document.querySelector('#add-transaction').scrollIntoView({ behavior: 'smooth', block: 'start' });
  DOM.title.focus();
}

// Delete with undo (no blocking confirm for a reversible action).
function handleDelete(id) {
  const index = State.data.transactions.findIndex((t) => t.id === id);
  if (index === -1) return;
  const removed = State.data.transactions[index];
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.add('removing');

  setTimeout(() => {
    State.data.transactions.splice(index, 1);
    Storage.save(State.data);
    renderAll();
    Toast.show('Transaction deleted', {
      type: 'success', duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          State.data.transactions.splice(index, 0, removed);
          Storage.save(State.data);
          renderAll();
        }
      }
    });
  }, 220);
}

function handleResetFilters() {
  State.filters = { search: '', type: 'all', category: 'all', sort: 'date-desc', period: 'currentMonth' };
  DOM.search.value = '';
  DOM.typeFilter.value = 'all';
  DOM.categoryFilter.value = 'all';
  DOM.sortFilter.value = 'date-desc';
  DOM.periodSelector.value = 'currentMonth';
  renderAll();
}

/* ================= 9. IMPORT / EXPORT ================= */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(State.data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `cointrack-backup-${new Date().toISOString().slice(0, 10)}.json`);
  Toast.show('JSON backup downloaded', { type: 'success' });
}

function exportCSV() {
  const headers = ['Date', 'Type', 'Category', 'Title', 'Amount', 'Notes'];
  const rows = State.data.transactions.map((t) => [
    t.date, t.type, t.category,
    `"${t.title.replace(/"/g, '""')}"`,
    Math.abs(t.amount),
    `"${(t.notes || '').replace(/"/g, '""')}"`
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `cointrack-${new Date().toISOString().slice(0, 10)}.csv`);
  Toast.show('CSV exported', { type: 'success' });
}

async function importJSON(file) {
  const text = await file.text();
  let imported;
  try { imported = JSON.parse(text); }
  catch { Toast.show('Import failed: not a valid JSON file.', { type: 'error' }); return; }

  if (!Array.isArray(imported.transactions)) {
    Toast.show('Import failed: missing transactions list.', { type: 'error' });
    return;
  }

  const ok = await showConfirm({
    title: 'Import data?',
    message: `This replaces your current data with ${imported.transactions.length} transactions.`,
    confirmLabel: 'Import',
    danger: false
  });
  if (!ok) return;

  State.data.transactions = imported.transactions.map((t) => ({
    id: t.id || Utils.uid(),
    title: String(t.title || '').trim(),
    amount: Utils.roundCurrency(Number(t.amount) || 0),
    category: CONSTANTS.CATEGORIES.includes(t.category) ? t.category : 'Other',
    date: t.date || new Date().toISOString().slice(0, 10),
    type: Number(t.amount) >= 0 ? 'income' : 'expense',
    notes: String(t.notes || '').trim()
  }));

  if (imported.budgets && typeof imported.budgets === 'object') {
    CONSTANTS.CATEGORIES.forEach((c) => {
      State.data.budgets[c] = Utils.roundCurrency(Number(imported.budgets[c]) || 0);
    });
  }

  Storage.save(State.data);
  renderAll();
  DOM.dataModal.close();
  Toast.show('Data imported successfully', { type: 'success' });
}

async function clearAllData() {
  const ok = await showConfirm({
    title: 'Clear all data?',
    message: 'This permanently deletes every transaction and budget. This cannot be undone.',
    confirmLabel: 'Delete everything',
    danger: true
  });
  if (!ok) return;
  State.data = Storage.getDefaultState();
  Storage.save(State.data);
  renderAll();
  DOM.dataModal.close();
  Toast.show('All data cleared', { type: 'success' });
}

/* ================= 10. BUDGET MODAL ================= */
function renderBudgetForm() {
  DOM.budgetFormContainer.innerHTML = CONSTANTS.CATEGORIES
    .filter((c) => c !== 'Salary')
    .map((cat) => {
      const val = State.data.budgets[cat] || 0;
      return `
        <div>
          <label class="field-label" for="budget-${Utils.escapeHTML(cat)}">${Utils.escapeHTML(cat)}</label>
          <input class="field budget-input" id="budget-${Utils.escapeHTML(cat)}" type="number" min="0" step="0.01"
                 data-category="${Utils.escapeHTML(cat)}" value="${val > 0 ? val : ''}" placeholder="0.00" />
        </div>`;
    }).join('');
}

function saveBudgets() {
  DOM.budgetFormContainer.querySelectorAll('.budget-input').forEach((input) => {
    const cat = input.dataset.category;
    const val = Utils.roundCurrency(Number(input.value) || 0);
    State.data.budgets[cat] = val >= 0 ? val : 0;
  });
  Storage.save(State.data);
  renderBudgets();
  DOM.budgetModal.close();
  Toast.show('Budgets saved', { type: 'success' });
}

/* ================= 11. THEME ================= */
function applySavedTheme() {
  const saved = localStorage.getItem(CONSTANTS.THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : prefersDark);
}

/* ================= 12. SETUP & EVENTS ================= */
function populateCategories() {
  const options = CONSTANTS.CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');
  DOM.category.innerHTML = `<option value="">Select category</option>${options}`;
  DOM.categoryFilter.innerHTML = `<option value="all">All categories</option>${options}`;
}

function bindEvents() {
  DOM.form.addEventListener('submit', handleSubmit);
  DOM.cancelEditBtn.addEventListener('click', resetForm);

  DOM.search.addEventListener('input', (e) => { State.filters.search = e.target.value; renderTransactions(); });
  DOM.typeFilter.addEventListener('change', (e) => { State.filters.type = e.target.value; renderTransactions(); });
  DOM.categoryFilter.addEventListener('change', (e) => { State.filters.category = e.target.value; renderTransactions(); });
  DOM.sortFilter.addEventListener('change', (e) => { State.filters.sort = e.target.value; renderTransactions(); });
  DOM.periodSelector.addEventListener('change', (e) => { State.filters.period = e.target.value; renderAll(); });
  DOM.resetFiltersBtn.addEventListener('click', handleResetFilters);

  DOM.transactionsList.addEventListener('click', (e) => {
    const del = e.target.closest('[data-delete]');
    const edit = e.target.closest('[data-edit]');
    if (del) handleDelete(del.dataset.delete);
    if (edit) handleEdit(edit.dataset.edit);
  });

  DOM.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(CONSTANTS.THEME_KEY, isDark ? 'dark' : 'light');
  });

  DOM.dataMenuBtn.addEventListener('click', () => DOM.dataModal.showModal());
  DOM.closeDataModalBtn.addEventListener('click', () => DOM.dataModal.close());
  DOM.exportJsonBtn.addEventListener('click', exportJSON);
  DOM.exportCsvBtn.addEventListener('click', exportCSV);
  DOM.importJsonBtn.addEventListener('click', () => DOM.importFile.click());
  DOM.importFile.addEventListener('change', (e) => {
    if (e.target.files.length) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  DOM.clearDataBtn.addEventListener('click', clearAllData);

  DOM.editBudgetsBtn.addEventListener('click', () => { renderBudgetForm(); DOM.budgetModal.showModal(); });
  DOM.closeBudgetModalBtn.addEventListener('click', () => DOM.budgetModal.close());
  DOM.cancelBudgetBtn.addEventListener('click', () => DOM.budgetModal.close());
  DOM.saveBudgetsBtn.addEventListener('click', saveBudgets);
}

function init() {
  applySavedTheme();
  populateCategories();
  DOM.date.value = new Date().toISOString().slice(0, 10);
  bindEvents();
  renderAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();