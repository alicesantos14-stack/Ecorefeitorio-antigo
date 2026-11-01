const STORAGE_KEY = 'ecorefeitorio-data-v1';
const SESSION_KEY = 'ecorefeitorio-session-v1';
const DEFAULT_MENU = { title: 'Almoço do dia', main: '', side: '', salad: '', dessert: '' };
const DEFAULT_DATA = { yes: 0, no: 0, small: 0, medium: 0, pin: '1234', queue: [], queueNextAt: null, menu: { ...DEFAULT_MENU }, weeklyMenus: {} };
const PLATE_DISPLAY_MS = 15000;
let queueTimer;
let pendingPortion = null;

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateKey(yesterday);
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const weeklyMenus = saved.weeklyMenus && typeof saved.weeklyMenus === 'object' && !Array.isArray(saved.weeklyMenus)
      ? { ...saved.weeklyMenus } : {};
    const today = String(new Date().getDay());
    if (!weeklyMenus[today] && saved.menu && (saved.menu.main || saved.menu.side || saved.menu.salad || saved.menu.dessert)) {
      weeklyMenus[today] = { ...DEFAULT_MENU, ...saved.menu };
    }
    return {
      ...DEFAULT_DATA,
      ...saved,
      menu: { ...DEFAULT_MENU, ...(saved.menu || {}) },
      weeklyMenus,
      queue: Array.isArray(saved.queue) ? saved.queue.filter((type) => type === 'small' || type === 'medium') : []
    };
  } catch {
    return { ...DEFAULT_DATA, weeklyMenus: {} };
  }
}

let data = loadData();
let loggedIn = false;
let activePage = 'filaPage';

const $ = (id) => document.getElementById(id);
const pages = ['filaPage', 'totemPage', 'kitchenPage', 'servedPage', 'settingsPage'];

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function rollOverDay() {
  const today = dateKey();
  if (!data.date) {
    data.date = today;
    saveData();
  } else if (data.date !== today) {
    data.previousDay = {
      date: data.date,
      yes: data.yes,
      no: data.no,
      small: data.small,
      medium: data.medium
    };
    data.date = today;
    data.yes = 0;
    data.no = 0;
    data.small = 0;
    data.medium = 0;
    data.queue = [];
    data.queueNextAt = null;
    saveData();
    $('menuDayInput').value = String(new Date().getDay());
    setMenuFormValues($('menuDayInput').value);
    $('responseNotice').textContent = '';
    $('totemNotice').textContent = '';
  }
}

function formatKg(portions, gramsPerPortion) {
  return ((portions * gramsPerPortion) / 1000).toFixed(3).replace('.', ',');
}

function updateDisplay() {
  rollOverDay();
  clearTimeout(queueTimer);
  if (data.queue.length) {
    const now = Date.now();
    if (!Number.isFinite(data.queueNextAt)) {
      data.queueNextAt = now + PLATE_DISPLAY_MS;
      saveData();
    } else if (now >= data.queueNextAt) {
      const elapsed = Math.floor((now - data.queueNextAt) / PLATE_DISPLAY_MS) + 1;
      data.queue.splice(0, elapsed);
      data.queueNextAt = data.queue.length ? data.queueNextAt + elapsed * PLATE_DISPLAY_MS : null;
      saveData();
    }
    if (data.queue.length) {
      queueTimer = setTimeout(() => {
        data = loadData();
        updateDisplay();
      }, Math.max(0, data.queueNextAt - Date.now()));
    }
  }
  const total = data.yes + data.no;
  const served = data.small + data.medium;
  const yesterday = data.previousDay && data.previousDay.date === yesterdayKey()
    ? data.previousDay : null;
  let recommended = data.yes;
  const yesterdayServed = yesterday ? yesterday.small + yesterday.medium : 0;
  if (yesterday && yesterday.yes > 0 && yesterdayServed > 0) {
    const rate = Math.min(1, Math.max(0.8, yesterdayServed / yesterday.yes));
    recommended = Math.ceil(data.yes * rate);
  }
  $('totalCount').textContent = total;
  $('yesCount').textContent = data.yes;
  $('noCount').textContent = data.no;
  const yesPercentage = total ? Math.round((data.yes / total) * 100) : 0;
  $('responsePercent').textContent = `${yesPercentage}%`;
  $('responseProgress').style.width = `${yesPercentage}%`;
  $('riceAmount').innerHTML = `${formatKg(recommended, 130)} <small>kg</small>`;
  $('beansAmount').innerHTML = `${formatKg(recommended, 80)} <small>kg</small>`;
  $('meatAmount').innerHTML = `${formatKg(recommended, 120)} <small>kg</small>`;
  $('smallCount').textContent = data.small;
  $('mediumCount').textContent = data.medium;
  $('servedTotal').textContent = served;
  $('kitchenServedTotal').textContent = served;
  const today = new Date();
  const todayMenu = data.weeklyMenus[String(today.getDay())] || DEFAULT_MENU;
  $('filaMenuDay').textContent = today.toLocaleDateString('pt-BR', { weekday: 'long' });
  $('filaMenuTitle').textContent = todayMenu.title || DEFAULT_MENU.title;
  $('filaMenuMain').textContent = todayMenu.main || 'Cardápio ainda não cadastrado para hoje';
  $('filaMenuSide').textContent = todayMenu.side || '—';
  $('filaMenuSalad').textContent = todayMenu.salad || '—';
  $('filaMenuDessert').textContent = todayMenu.dessert || '—';

  const nextPlate = data.queue[0];
  $('nextPlateTitle').textContent = nextPlate
    ? `Prato ${nextPlate === 'small' ? 'pequeno' : 'médio'}`
    : 'Aguardando pedido';
  $('queueStatus').textContent = nextPlate
    ? `${data.queue.length} ${data.queue.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'}.`
    : 'Quando um aluno escolher uma porção, ela aparecerá aqui.';
  $('plateQueue').replaceChildren(...data.queue.slice(1).map((type) => {
    const item = document.createElement('li');
    item.textContent = `Prato ${type === 'small' ? 'pequeno' : 'médio'}`;
    return item;
  }));
}

function setMenuFormValues(day = String(new Date().getDay())) {
  const menu = data.weeklyMenus[day] || DEFAULT_MENU;
  $('menuTitleInput').value = menu.title || DEFAULT_MENU.title;
  $('menuMainInput').value = menu.main || '';
  $('menuSideInput').value = menu.side || '';
  $('menuSaladInput').value = menu.salad || '';
  $('menuDessertInput').value = menu.dessert || '';
}

function showPage(pageId) {
  activePage = pageId;
  pages.forEach((id) => $(id).classList.toggle('hidden', id !== pageId));
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageId);
  });
  const isTotem = pageId === 'totemPage';
  $('bottomNav').classList.toggle('hidden', isTotem);
  $('dashboard').classList.toggle('totem-mode', isTotem);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = $('email').value.trim();
  const password = $('loginPassword').value;
  if (!email || !password) {
    $('loginError').textContent = 'Preencha o e-mail e a senha para continuar.';
    return;
  }
  loggedIn = true;
  localStorage.setItem(SESSION_KEY, email);
  $('userEmail').textContent = email;
  $('loginError').textContent = '';
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  showPage('filaPage');
  updateDisplay();
});

$('logoutButton').addEventListener('click', () => {
  loggedIn = false;
  localStorage.removeItem(SESSION_KEY);
  $('dashboard').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginPassword').value = '';
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});

$('menuDayInput').addEventListener('change', () => {
  setMenuFormValues($('menuDayInput').value);
  $('menuNotice').textContent = '';
});

$('menuForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const day = $('menuDayInput').value;
  data.weeklyMenus[day] = {
    title: $('menuTitleInput').value.trim() || DEFAULT_MENU.title,
    main: $('menuMainInput').value.trim(),
    side: $('menuSideInput').value.trim(),
    salad: $('menuSaladInput').value.trim(),
    dessert: $('menuDessertInput').value.trim()
  };
  saveData();
  updateDisplay();
  const selectedDay = $('menuDayInput').selectedOptions[0].textContent;
  $('menuNotice').textContent = `Cardápio de ${selectedDay} salvo.`;
});

$('yesButton').addEventListener('click', () => {
  rollOverDay();
  data.yes += 1;
  saveData();
  updateDisplay();
  $('responseNotice').textContent = 'Resposta “Vou comer” registrada.';
});

$('noButton').addEventListener('click', () => {
  rollOverDay();
  data.no += 1;
  saveData();
  updateDisplay();
  $('responseNotice').textContent = 'Resposta “Não vou comer” registrada.';
});

function choosePortion(type) {
  pendingPortion = type;
  const label = type === 'small' ? 'pequena' : 'média';
  $('confirmationMessage').textContent = `Você escolheu a porção ${label}. Deseja confirmar o pedido?`;
  $('portionConfirmation').classList.remove('hidden');
  $('totemNotice').textContent = '';
}

function servePortion(type) {
  data = loadData();
  updateDisplay();
  data[type] += 1;
  if (!data.queue.length) data.queueNextAt = Date.now() + PLATE_DISPLAY_MS;
  data.queue.push(type);
  saveData();
  updateDisplay();
  pendingPortion = null;
  $('portionConfirmation').classList.add('hidden');
  const label = type === 'small' ? 'Pequeno' : 'Médio';
  $('totemNotice').textContent = `Porção ${label.toLowerCase()} confirmada. Bom apetite!`;
}

$('smallPortion').addEventListener('click', () => choosePortion('small'));
$('mediumPortion').addEventListener('click', () => choosePortion('medium'));
$('confirmPortionButton').addEventListener('click', () => {
  if (pendingPortion) servePortion(pendingPortion);
});
$('cancelPortionButton').addEventListener('click', () => {
  pendingPortion = null;
  $('portionConfirmation').classList.add('hidden');
  $('totemNotice').textContent = 'Escolha cancelada. Você pode selecionar outra porção.';
});

$('unlockButton').addEventListener('click', () => {
  $('unlockPin').value = '';
  $('unlockError').textContent = '';
  $('pinModal').classList.remove('hidden');
  $('unlockPin').focus();
});

$('closeModal').addEventListener('click', () => $('pinModal').classList.add('hidden'));
$('pinModal').addEventListener('click', (event) => {
  if (event.target === $('pinModal')) $('pinModal').classList.add('hidden');
});

$('unlockForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if ($('unlockPin').value === data.pin) {
    $('pinModal').classList.add('hidden');
    showPage('filaPage');
  } else {
    $('unlockError').textContent = 'Senha incorreta. Tente novamente.';
    $('unlockPin').select();
  }
});

$('pinForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const newPin = $('newPin').value.trim();
  if (!/^\d{4,8}$/.test(newPin)) {
    $('pinNotice').textContent = 'A senha deve ter de 4 a 8 dígitos.';
    return;
  }
  data.pin = newPin;
  saveData();
  $('newPin').value = '';
  $('pinNotice').textContent = 'Senha do Totem atualizada com sucesso.';
});

$('resetButton').addEventListener('click', () => {
  const confirmed = window.confirm('Zerar as respostas, os pratos e a fila de hoje? Esses dados não poderão ser usados na comparação de amanhã.');
  if (!confirmed) return;
  rollOverDay();
  data.yes = 0;
  data.no = 0;
  data.small = 0;
  data.medium = 0;
  data.queue = [];
  data.queueNextAt = null;
  saveData();
  updateDisplay();
  $('responseNotice').textContent = '';
  $('totemNotice').textContent = '';
});

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    data = loadData();
    updateDisplay();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    data = loadData();
    updateDisplay();
  }
});

const savedEmail = localStorage.getItem(SESSION_KEY);
if (savedEmail) {
  loggedIn = true;
  $('userEmail').textContent = savedEmail;
  $('loginScreen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  showPage('filaPage');
}

$('menuDayInput').value = String(new Date().getDay());
setInterval(updateDisplay, 60000);
updateDisplay();
setMenuFormValues($('menuDayInput').value);
                               
