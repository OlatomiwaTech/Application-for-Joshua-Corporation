const STORAGE_KEY = 'personal-expense-tracker-transactions';
const THEME_KEY = 'personal-expense-tracker-theme';

const categories = ['Housing', 'Food', 'Salary', 'Transport', 'Entertainment', 'Utilities', 'Health', 'Shopping'];

const state = {
  transactions: [],
  filters: {
    search: '',
    type: 'all',
    category: 'all'
  }
};

const dom = {
  form: document.querySelector('#transactionForm'),
  title: document.querySelector('#title'),
  amount: document.querySelector('#amount'),
  date: document.querySelector('#date'),
  category: document.querySelector('#category'),
  categoryFilter: document.querySelector('#categoryFilter'),
  typeFilter: document.querySelector('#typeFilter'),
  search: document.querySelector('#search'),
  transactions: document.querySelector('#transactions'),
  emptyState: document.querySelector('#emptyState'),
  resultCount: document.querySelector('#resultCount'),
  balanceValue: document.querySelector('#balanceValue'),
  incomeValue: document.querySelector('#incomeValue'),
  expenseValue: document.querySelector('#expenseValue'),
  breakdown: document.querySelector('#categoryBreakdown'),
  themeToggle: document.querySelector('#themeToggle'),
  todayLabel: document.querySelector('#todayLabel')
};

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const formatCurrency = (value) => money.format(value);
const formatDate = (value) => dateFormatter.format(new Date(`${value}T12:00:00`));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function getInitialTransactions() {
  const today = new Date();
  const iso = (offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    return date.toISOString().slice(0, 10);
  };

  return [
    { id: uid(), title: 'Monthly salary', amount: 4800, category: 'Salary', date: iso(2), type: 'income' },
    { id: uid(), title: 'Apartment rent', amount: -1650, category: 'Housing', date: iso(5), type: 'expense' },
    { id: uid(), title: 'Weekend groceries', amount: -138.45, category: 'Food', date: iso(1), type: 'expense' }
  ];
}

function loadTransactions() {
  const saved = localStorage.getItem(STORAGE_KEY);
  state.transactions = saved ? JSON.parse(saved) : getInitialTransactions();
  persistTransactions();
}

function persistTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function setDefaultDate() {
  dom.date.value = new Date().toISOString().slice(0, 10);
  dom.todayLabel.textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());
}

function populateCategories() {
  const formOptions = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  const filterOptions = categories.map((category) => `<option value="${category}">${category}</option>`).join('');
  dom.category.innerHTML = `<option value="">Select category</option>${formOptions}`;
  dom.categoryFilter.innerHTML = `<option value="all">All categories</option>${filterOptions}`;
}

function setFieldError(field, message = '') {
  field.classList.toggle('invalid', Boolean(message));
  const error = document.querySelector(`[data-error-for="${field.id}"]`);
  if (error) error.textContent = message;
}

function validateForm(formData) {
  let isValid = true;
  const title = formData.get('title').trim();
  const amount = Number(formData.get('amount'));
  const category = formData.get('category');
  const date = formData.get('date');

  setFieldError(dom.title);
  setFieldError(dom.amount);
  setFieldError(dom.category);
  setFieldError(dom.date);

  if (!title) {
    setFieldError(dom.title, 'Enter a short description.');
    isValid = false;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setFieldError(dom.amount, 'Enter an amount greater than zero.');
    isValid = false;
  }

  if (!category) {
    setFieldError(dom.category, 'Choose a category.');
    isValid = false;
  }

  if (!date) {
    setFieldError(dom.date, 'Choose a transaction date.');
    isValid = false;
  }

  return isValid;
}

function getMonthlyTotals() {
  const now = new Date();
  return state.transactions.reduce((totals, item) => {
    const date = new Date(`${item.date}T12:00:00`);
    const isCurrentMonth = date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    totals.balance += item.amount;

    if (isCurrentMonth && item.amount > 0) totals.income += item.amount;
    if (isCurrentMonth && item.amount < 0) totals.expenses += Math.abs(item.amount);

    return totals;
  }, { balance: 0, income: 0, expenses: 0 });
}

function getFilteredTransactions() {
  return state.transactions
    .filter((item) => item.title.toLowerCase().includes(state.filters.search.toLowerCase()))
    .filter((item) => state.filters.type === 'all' || item.type === state.filters.type)
    .filter((item) => state.filters.category === 'all' || item.category === state.filters.category)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderSummary() {
  const totals = getMonthlyTotals();
  dom.balanceValue.textContent = formatCurrency(totals.balance);
  dom.incomeValue.textContent = formatCurrency(totals.income);
  dom.expenseValue.textContent = formatCurrency(totals.expenses);
}

function renderBreakdown() {
  const expensesByCategory = state.transactions
    .filter((item) => item.amount < 0)
    .reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Math.abs(item.amount);
      return acc;
    }, {});

  const rows = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, amount]) => sum + amount, 0);

  if (!rows.length) {
    dom.breakdown.innerHTML = '<p class="rounded-2xl bg-slate-500/10 p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">No expenses yet.</p>';
    return;
  }

  dom.breakdown.innerHTML = rows.map(([category, amount]) => {
    const percent = total ? Math.round((amount / total) * 100) : 0;
    return `
      <div>
        <div class="mb-2 flex items-center justify-between gap-3 text-sm">
          <span class="font-bold text-slate-800 dark:text-slate-100">${category}</span>
          <span class="font-extrabold text-slate-500 dark:text-slate-300">${formatCurrency(amount)} · ${percent}%</span>
        </div>
        <div class="progress-track" aria-label="${category} ${percent} percent">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTransactions() {
  const filtered = getFilteredTransactions();
  dom.resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`;
  dom.emptyState.classList.toggle('hidden', filtered.length > 0);
  dom.transactions.classList.toggle('hidden', filtered.length === 0);

  dom.transactions.innerHTML = filtered.map((item) => {
    const isIncome = item.amount > 0;
    const amountClass = isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const sign = isIncome ? '+' : '-';

    return `
      <article class="transaction-item" data-id="${item.id}">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate text-base font-extrabold text-slate-900 dark:text-white">${item.title}</h3>
              <span class="rounded-full bg-slate-500/10 px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">${item.category}</span>
            </div>
            <p class="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">${formatDate(item.date)} · ${item.type}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <p class="text-right text-base font-black ${amountClass}">${sign}${formatCurrency(Math.abs(item.amount))}</p>
            <button class="delete-btn" type="button" data-delete="${item.id}" aria-label="Delete ${item.title}">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
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
  renderTransactions();
}

function handleSubmit(event) {
  event.preventDefault();
  const formData = new FormData(dom.form);
  if (!validateForm(formData)) return;

  const type = formData.get('type');
  const rawAmount = Math.abs(Number(formData.get('amount')));
  const amount = type === 'expense' ? -rawAmount : rawAmount;

  state.transactions.unshift({
    id: uid(),
    title: formData.get('title').trim(),
    amount,
    category: formData.get('category'),
    date: formData.get('date'),
    type
  });

  persistTransactions();
  dom.form.reset();
  setDefaultDate();
  document.querySelector('input[name="type"][value="income"]').checked = true;
  renderAll();
}

function handleDelete(id) {
  const item = document.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  item.classList.add('removing');
  window.setTimeout(() => {
    state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    persistTransactions();
    renderAll();
  }, 220);
}

function bindEvents() {
  dom.form.addEventListener('submit', handleSubmit);
  dom.search.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderTransactions();
  });
  dom.typeFilter.addEventListener('change', (event) => {
    state.filters.type = event.target.value;
    renderTransactions();
  });
  dom.categoryFilter.addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    renderTransactions();
  });
  dom.transactions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete]');
    if (button) handleDelete(button.dataset.delete);
  });
  dom.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  });
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : prefersDark);
}

function init() {
  applySavedTheme();
  populateCategories();
  setDefaultDate();
  loadTransactions();
  bindEvents();
  renderAll();
}

init();
