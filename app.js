/**
 * CoinTrack - Personal Finance Dashboard
 * Architecture: Modular Vanilla JS (Utils, Storage, State, Renderer, Events)
 */

// ==========================================
// 1. UTILITIES & CONSTANTS
// ==========================================
const CONSTANTS = {
  STORAGE_KEY: 'cointrack_data_v1',
  THEME_KEY: 'cointrack_theme',
  CATEGORIES: ['Housing', 'Food', 'Salary', 'Transport', 'Entertainment', 'Utilities', 'Health', 'Shopping', 'Other'],
  CURRENCY: 'NGN',
  LOCALE: 'en-NG'
};

const Utils = {
  uid: () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  
  // Prevent XSS by escaping HTML entities
  escapeHTML: (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
  },

  // Strict financial rounding to avoid floating-point errors
  roundCurrency: (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100,

  formatCurrency: (value) => new Intl.NumberFormat(CONSTANTS.LOCALE, {
    style: 'currency',
    currency: CONSTANTS.CURRENCY,
    maximumFractionDigits: 2
  }).format(Utils.roundCurrency(value)),

  formatDate: (dateString) => new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(`${dateString}T12:00:00`)),

  // Date range calculation based on period
  getDateRange: (period) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch (period) {
      case 'lastMonth':
        start.setMonth(now.getMonth() - 1, 1);
        end.setMonth(now.getMonth(), 0);
        break;
      case 'last30':
        start.setDate(now.getDate() - 30);
        break;
      case 'last90':
        start.setDate(now.getDate() - 90);
        break;
      case 'thisYear':
        start.setMonth(0, 1);
        break;
      case 'currentMonth':
      default:
        start.setDate(1);
        break;
    }
    // Normalize to midnight to avoid timezone edge cases
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  },

  isDateInRange: (dateString, start, end) => {
    const d = new Date(`${dateString}T12:00:00`);
    return d >= start && d <= end;
  }
};

// ==========================================
// 2. STORAGE LAYER (Versioned & Validated)
// ==========================================
const Storage = {
  load: () => {
    try {
      const raw = localStorage.getItem(CONSTANTS.STORAGE_KEY);
      if (!raw) return Storage.getDefaultState();
      
      const data = JSON.parse(raw);
      // Schema validation
      if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('Invalid schema');
      
      // Ensure all transactions have required fields and rounded amounts
      data.transactions = data.transactions.map(t => ({
        id: t.id || Utils.uid(),
        title: String(t.title || '').trim(),
        amount: Utils.roundCurrency(Number(t.amount) || 0),
        category: CONSTANTS.CATEGORIES.includes(t.category) ? t.category : 'Other',
        date: t.date || new Date().toISOString().slice(0, 10),
        type: t.amount >= 0 ? 'income' : 'expense',
        notes: String(t.notes || '').trim()
      }));

      // Initialize budgets if missing
      if (!data.budgets) {
        data.budgets = {};
        CONSTANTS.CATEGORIES.forEach(cat => { data.budgets[cat] = 0; });
      }

      return data;
    } catch (e) {
      console.error('Storage load error, resetting:', e);
      return Storage.getDefaultState();
    }
  },

  save: (state) => {
    try {
      localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify({
        transactions: state.transactions,
        budgets: state.budgets
      }));
    } catch (e) {
      console.error('Storage save error:', e);
      alert('Failed to save data. LocalStorage may be full.');
    }
  },

  getDefaultState: () => {
    const today = new Date();
    const iso = (offset) => {
      const d = new Date(today);
      d.setDate(today.getDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    
    const budgets = {};
    CONSTANTS.CATEGORIES.forEach(cat => { budgets[cat] = 0; });

    return {
      transactions: [
        { id: Utils.uid(), title: 'Monthly salary', amount: 480000, category: 'Salary', date: iso(2), type: 'income', notes: '' },
        { id: Utils.uid(), title: 'Apartment rent', amount: -165000, category: 'Housing', date: iso(5), type: 'expense', notes: '' },
        { id: Utils.uid(), title: 'Weekend groceries', amount: -13845, category: 'Food', date: iso(1), type: 'expense', notes: '' }
      ],
      budgets: budgets
    };
  }
};

// ==========================================
// 3. STATE MANAGEMENT
// ==========================================
const State = {
  data: Storage.load(),
  filters: {
    search: '',
    type: 'all',
    category: 'all',
    sort: 'date-desc',
    period: 'currentMonth'
  },
  editingId: null
};

// ==========================================
// 4. DOM REFERENCES
// ==========================================
const DOM = {
  form: document.querySelector('#transactionForm'),
  editIdField: document.querySelector('#editTransactionId'),
  submitBtn: document.querySelector('#submitBtn'),
  cancelEditBtn: document.querySelector('#cancelEditBtn'),
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
  categoryBreakdown: document.querySelector('#categoryBreakdown'),
  budgetBreakdown: document.querySelector('#budgetBreakdown'),
  currentPeriodLabel: document.querySelector('#currentPeriodLabel'),
  themeToggle: document.querySelector('#themeToggle'),
  // Modals
  dataModal: document.querySelector('#dataModal'),
  budgetModal: document.querySelector('#budgetModal'),
  dataMenuBtn: document.querySelector('#dataMenuBtn'),
  closeDataModalBtn: document.querySelector('#closeDataModalBtn'),
  editBudgetsBtn: document.querySelector('#editBudgetsBtn'),
  closeBudgetModalBtn: document.querySelector('#closeBudgetModalBtn'),
  cancelBudgetBtn: document.querySelector('#cancelBudgetBtn'),
  saveBudgetsBtn: document.querySelector('#saveBudgetsBtn'),
  budgetFormContainer: document.querySelector('#budgetFormContainer'),
  exportJsonBtn: document.querySelector('#exportJsonBtn'),
  exportCsvBtn: document.querySelector('#exportCsvBtn'),
  importJsonBtn: document.querySelector('#importJsonBtn'),
  importFile: document.querySelector('#importFile'),
  clearDataBtn: document.querySelector('#clearDataBtn')
};

// ==========================================
// 5. CORE LOGIC & CALCULATIONS
// ==========================================
function getFilteredAndSortedTransactions() {
  const { start, end } = Utils.getDateRange(State.filters.period);
  
  let filtered = State.data.transactions.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(State.filters.search.toLowerCase()) || 
                          (item.notes && item.notes.toLowerCase().includes(State.filters.search.toLowerCase()));
    const matchesType = State.filters.type === 'all' || item.type === State.filters.type;
    const matchesCategory = State.filters.category === 'all' || item.category === State.filters.category;
    const matchesDate = Utils.isDateInRange(item.date, start, end);
    
    return matchesSearch && matchesType && matchesCategory && matchesDate;
  });

  // Sorting
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
      totals.balance += item.amount;
      if (item.amount > 0) totals.income += item.amount;
      else totals.expenses += Math.abs(item.amount);
    }
    return totals;
  }, { balance: 0, income: 0, expenses: 0 });
}

function getCategoryExpensesForPeriod() {
  const { start, end } = Utils.getDateRange(State.filters.period);
  const expenses = {};
  
  State.data.transactions.forEach(item => {
    if (item.amount < 0 && Utils.isDateInRange(item.date, start, end)) {
      expenses[item.category] = (expenses[item.category] || 0) + Math.abs(item.amount);
    }
  });
  
  return Object.entries(expenses)
    .map(([category, amount]) => ({ category, amount: Utils.roundCurrency(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

// ==========================================
// 6. RENDERING
// ==========================================
function renderSummary() {
  const totals = getPeriodTotals();
  DOM.balanceValue.textContent = Utils.formatCurrency(totals.balance);
  DOM.incomeValue.textContent = Utils.formatCurrency(totals.income);
  DOM.expenseValue.textContent = Utils.formatCurrency(totals.expenses);
  
  const savingsRate = totals.income > 0 ? Math.round(((totals.income - totals.expenses) / totals.income) * 100) : 0;
  DOM.savingsRateValue.textContent = `${Math.max(0, savingsRate)}%`;
  DOM.cashFlowLabel.textContent = `Net cash flow: ${Utils.formatCurrency(totals.income - totals.expenses)}`;
  
  const periodLabels = {
    currentMonth: 'This Month', lastMonth: 'Last Month', last30: 'Last 30 Days',
    last90: 'Last 90 Days', thisYear: 'This Year', all: 'All Time'
  };
  DOM.currentPeriodLabel.textContent = periodLabels[State.filters.period];
}

function renderBreakdown() {
  const expenses = getCategoryExpensesForPeriod();
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  
  if (!expenses.length) {
    DOM.categoryBreakdown.innerHTML = '<p class="text-sm font-semibold text-slate-500 dark:text-slate-400 text-center py-4">No expenses in this period.</p>';
    return;
  }

  DOM.categoryBreakdown.innerHTML = expenses.map(({ category, amount }) => {
    const percent = total ? Math.round((amount / total) * 100) : 0;
    return `
      <div>
        <div class="mb-2 flex items-center justify-between gap-3 text-sm">
          <span class="font-bold text-slate-800 dark:text-slate-100">${Utils.escapeHTML(category)}</span>
          <span class="font-extrabold text-slate-500 dark:text-slate-300">${Utils.formatCurrency(amount)} · ${percent}%</span>
        </div>
        <div class="progress-track" aria-label="${Utils.escapeHTML(category)} ${percent} percent">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderBudgets() {
  const expenses = getCategoryExpensesForPeriod();
  const expenseMap = Object.fromEntries(expenses.map(e => [e.category, e.amount]));
  
  const budgetCategories = CONSTANTS.CATEGORIES.filter(cat => cat !== 'Salary'); // Don't budget income
  
  DOM.budgetBreakdown.innerHTML = budgetCategories.map(category => {
    const budget = State.data.budgets[category] || 0;
    if (budget <= 0) return ''; // Hide unset budgets
    
    const spent = expenseMap[category] || 0;
    const remaining = Utils.roundCurrency(budget - spent);
    const percent = Math.min(100, Math.round((spent / budget) * 100));
    
    let statusClass = '';
    let statusText = `${Utils.formatCurrency(remaining)} remaining`;
    if (percent >= 100) {
      statusClass = 'danger';
      statusText = 'Budget exceeded!';
    } else if (percent >= 80) {
      statusClass = 'warning';
      statusText = 'Approaching limit';
    }

    return `
      <div>
        <div class="mb-1 flex items-center justify-between text-xs font-bold">
          <span class="text-slate-700 dark:text-slate-200">${Utils.escapeHTML(category)}</span>
          <span class="${statusClass === 'danger' ? 'text-rose-600' : statusClass === 'warning' ? 'text-amber-600' : 'text-slate-500'}">
            ${Utils.formatCurrency(spent)} / ${Utils.formatCurrency(budget)}
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${statusClass}" style="width: ${percent}%"></div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${statusText}</p>
      </div>
    `;
  }).join('') || '<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No budgets set. Click "Manage" to add limits.</p>';
}

function renderTransactions() {
  const filtered = getFilteredAndSortedTransactions();
  DOM.resultCount.textContent = `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`;
  
  DOM.emptyState.classList.toggle('hidden', filtered.length > 0);
  DOM.transactionsList.classList.toggle('hidden', filtered.length === 0);
  
  DOM.transactionsList.innerHTML = filtered.map(item => {
    const isIncome = item.amount > 0;
    const amountClass = isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const sign = isIncome ? '+' : '-';
    
    return `
      <article class="transaction-item" data-id="${item.id}">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate text-base font-bold text-slate-900 dark:text-white">${Utils.escapeHTML(item.title)}</h3>
              <span class="rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">${Utils.escapeHTML(item.category)}</span>
            </div>
            <p class="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              ${Utils.formatDate(item.date)} ${item.notes ? `· ${Utils.escapeHTML(item.notes)}` : ''}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <p class="text-right text-base font-black ${amountClass}">${sign}${Utils.formatCurrency(Math.abs(item.amount))}</p>
            <button class="edit-btn" type="button" data-edit="${item.id}" aria-label="Edit ${Utils.escapeHTML(item.title)}">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="delete-btn" type="button" data-delete="${item.id}" aria-label="Delete ${Utils.escapeHTML(item.title)}">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderAll() {
  renderSummary();
  renderBreakdown();
  renderBudgets();
  renderTransactions();
}

// ==========================================
// 7. EVENT HANDLERS
// ==========================================
function setFieldError(field, message = '') {
  field.classList.toggle('invalid', Boolean(message));
  const error = document.querySelector(`[data-error-for="${field.id}"]`);
  if (error) error.textContent = message;
}

function validateForm(formData) {
  let isValid = true;
  const title = formData.get('title')?.trim();
  const amount = Number(formData.get('amount'));
  const category = formData.get('category');
  const date = formData.get('date');

  [DOM.title, DOM.amount, DOM.category, DOM.date].forEach(setFieldError);

  if (!title) { setFieldError(DOM.title, 'Enter a short description.'); isValid = false; }
  if (!Number.isFinite(amount) || amount <= 0) { setFieldError(DOM.amount, 'Enter an amount greater than zero.'); isValid = false; }
  if (!category) { setFieldError(DOM.category, 'Choose a category.'); isValid = false; }
  if (!date) { setFieldError(DOM.date, 'Choose a transaction date.'); isValid = false; }

  return isValid;
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(DOM.form);
  if (!validateForm(formData)) return;

  const type = formData.get('type');
  const rawAmount = Utils.roundCurrency(Math.abs(Number(formData.get('amount'))));
  const amount = type === 'expense' ? -rawAmount : rawAmount;

  const transactionData = {
    id: State.editingId || Utils.uid(),
    title: formData.get('title').trim(),
    amount: amount,
    category: formData.get('category'),
    date: formData.get('date'),
    type: type,
    notes: formData.get('notes')?.trim() || ''
  };

  if (State.editingId) {
    const index = State.data.transactions.findIndex(t => t.id === State.editingId);
    if (index !== -1) State.data.transactions[index] = transactionData;
    State.editingId = null;
    DOM.submitBtn.textContent = 'Add Transaction';
    DOM.cancelEditBtn.classList.add('hidden');
  } else {
    State.data.transactions.unshift(transactionData);
  }

  Storage.save(State.data);
  DOM.form.reset();
  DOM.date.value = new Date().toISOString().slice(0, 10);
  DOM.form.querySelector('input[name="type"][value="income"]').checked = true;
  renderAll();
}

function handleEdit(id) {
  const item = State.data.transactions.find(t => t.id === id);
  if (!item) return;

  State.editingId = id;
  DOM.editIdField.value = id;
  DOM.title.value = item.title;
  DOM.amount.value = Math.abs(item.amount);
  DOM.date.value = item.date;
  DOM.category.value = item.category;
  DOM.form.querySelector(`input[name="type"][value="${item.type}"]`).checked = true;
  DOM.form.querySelector('#notes').value = item.notes || '';
  
  DOM.submitBtn.textContent = 'Update Transaction';
  DOM.cancelEditBtn.classList.remove('hidden');
  
  // Scroll to form on mobile
  DOM.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  DOM.title.focus();
}

function handleDelete(id) {
  if (!confirm('Are you sure you want to delete this transaction? This cannot be undone.')) return;
  
  const item = document.querySelector(`[data-id="${id}"]`);
  if (item) {
    item.classList.add('removing');
    setTimeout(() => {
      State.data.transactions = State.data.transactions.filter(t => t.id !== id);
      Storage.save(State.data);
      renderAll();
    }, 220);
  }
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

// ==========================================
// 8. DATA IMPORT / EXPORT
// ==========================================
function exportJSON() {
  const dataStr = JSON.stringify(State.data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cointrack-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const headers = ['Date', 'Type', 'Category', 'Title', 'Amount', 'Notes'];
  const rows = State.data.transactions.map(t => [
    t.date, t.type, t.category, `"${t.title.replace(/"/g, '""')}"`, Math.abs(t.amount), `"${(t.notes || '').replace(/"/g, '""')}"`
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cointrack-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.transactions || !Array.isArray(imported.transactions)) {
        throw new Error('Invalid file structure');
      }
      
      if (confirm(`This will replace your current data with ${imported.transactions.length} transactions. Continue?`)) {
        State.data = Storage.load(); // Reset to default structure
        State.data.transactions = imported.transactions.map(t => ({
          id: t.id || Utils.uid(),
          title: String(t.title || '').trim(),
          amount: Utils.roundCurrency(Number(t.amount) || 0),
          category: CONSTANTS.CATEGORIES.includes(t.category) ? t.category : 'Other',
          date: t.date || new Date().toISOString().slice(0, 10),
          type: Number(t.amount) >= 0 ? 'income' : 'expense',
          notes: String(t.notes || '').trim()
        }));
        
        if (imported.budgets) {
          CONSTANTS.CATEGORIES.forEach(cat => {
            State.data.budgets[cat] = Utils.roundCurrency(Number(imported.budgets[cat]) || 0);
          });
        }
        
        Storage.save(State.data);
        renderAll();
        DOM.dataModal.close();
        alert('Data imported successfully!');
      }
    } catch (err) {
      alert('Failed to import: Invalid or corrupted JSON file.');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (confirm('WARNING: This will permanently delete ALL transactions and budgets. This cannot be undone. Are you sure?')) {
    localStorage.removeItem(CONSTANTS.STORAGE_KEY);
    State.data = Storage.getDefaultState();
    Storage.save(State.data);
    renderAll();
    DOM.dataModal.close();
  }
}

// ==========================================
// 9. INITIALIZATION & BINDING
// ==========================================
function populateCategories() {
  const options = CONSTANTS.CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  DOM.category.innerHTML = `<option value="">Select category</option>${options}`;
  DOM.categoryFilter.innerHTML = `<option value="all">All categories</option>${options}`;
}

function renderBudgetForm() {
  DOM.budgetFormContainer.innerHTML = CONSTANTS.CATEGORIES.filter(c => c !== 'Salary').map(cat => {
    const currentBudget = State.data.budgets[cat] || 0;
    return `
      <div class="mb-4">
        <label class="field-label">${cat}</label>
        <input type="number" class="field budget-input" data-category="${cat}" value="${currentBudget > 0 ? currentBudget : ''}" placeholder="0.00" step="0.01" min="0" />
      </div>
    `;
  }).join('');
}

function saveBudgets() {
  const inputs = DOM.budgetFormContainer.querySelectorAll('.budget-input');
  inputs.forEach(input => {
    const cat = input.dataset.category;
    const val = Utils.roundCurrency(Number(input.value) || 0);
    State.data.budgets[cat] = val >= 0 ? val : 0;
  });
  Storage.save(State.data);
  renderBudgets();
  DOM.budgetModal.close();
}

function applySavedTheme() {
  const saved = localStorage.getItem(CONSTANTS.THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : prefersDark);
}

function bindEvents() {
  // Form
  DOM.form.addEventListener('submit', handleSubmit);
  DOM.cancelEditBtn.addEventListener('click', () => {
    State.editingId = null;
    DOM.form.reset();
    DOM.date.value = new Date().toISOString().slice(0, 10);
    DOM.form.querySelector('input[name="type"][value="income"]').checked = true;
    DOM.submitBtn.textContent = 'Add Transaction';
    DOM.cancelEditBtn.classList.add('hidden');
  });

  // Filters
  DOM.search.addEventListener('input', (e) => { State.filters.search = e.target.value; renderTransactions(); });
  DOM.typeFilter.addEventListener('change', (e) => { State.filters.type = e.target.value; renderTransactions(); });
  DOM.categoryFilter.addEventListener('change', (e) => { State.filters.category = e.target.value; renderTransactions(); });
  DOM.sortFilter.addEventListener('change', (e) => { State.filters.sort = e.target.value; renderTransactions(); });
  DOM.periodSelector.addEventListener('change', (e) => { State.filters.period = e.target.value; renderAll(); });
  DOM.resetFiltersBtn.addEventListener('click', handleResetFilters);

  // Transaction List Delegation
  DOM.transactionsList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete]');
    const editBtn = e.target.closest('[data-edit]');
    if (deleteBtn) handleDelete(deleteBtn.dataset.delete);
    if (editBtn) handleEdit(editBtn.dataset.edit);
  });

  // Theme
  DOM.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(CONSTANTS.THEME_KEY, isDark ? 'dark' : 'light');
  });

  // Modals
  DOM.dataMenuBtn.addEventListener('click', () => DOM.dataModal.showModal());
  DOM.closeDataModalBtn.addEventListener('click', () => DOM.dataModal.close());
  DOM.editBudgetsBtn.addEventListener('click', () => {
    renderBudgetForm();
    DOM.budgetModal.showModal();
  });
  DOM.closeBudgetModalBtn.addEventListener('click', () => DOM.budgetModal.close());
  DOM.cancelBudgetBtn.addEventListener('click', () => DOM.budgetModal.close());
  DOM.saveBudgetsBtn.addEventListener('click', saveBudgets);

  // Data Management
  DOM.exportJsonBtn.addEventListener('click', exportJSON);
  DOM.exportCsvBtn.addEventListener('click', exportCSV);
  DOM.importJsonBtn.addEventListener('click', () => DOM.importFile.click());
  DOM.importFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) importJSON(e.target.files[0]);
    e.target.value = ''; // Reset
  });
  DOM.clearDataBtn.addEventListener('click', clearAllData);
}

function init() {
  applySavedTheme();
  populateCategories();
  DOM.date.value = new Date().toISOString().slice(0, 10);
  bindEvents();
  renderAll();
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}