'use strict';

/* ======================== Firebase ======================== */
const firebaseConfig = {
  apiKey: "AIzaSyAe7BhoNaluYMKQgW_SMb2_tNVKadkgVJI",
  authDomain: "tabel-f40c3.firebaseapp.com",
  projectId: "tabel-f40c3",
  storageBucket: "tabel-f40c3.firebasestorage.app",
  messagingSenderId: "90528693206",
  appId: "1:90528693206:web:2579f4a2e787b5f0344277"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

/* ======================== Constants ======================== */
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const GROUP_COLORS = ['#d48fd4','#f0a0c0','#7dd3c0','#f0c070','#a0c8f0','#c0d48f'];

/* ======================== State ======================== */
let currentUser = null;
let groups      = [];           // [{id,name,color}]
let currentGroupId = null;
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth();

let monthData = {
  subscriptions: [],    // [{id,name,amount,note}]
  trainingDates: [],    // [{id,date,label}]
  oneTimePrice: 300,
  oneTimeVisitors: [],  // [{id,name,visits:{dateId:bool}}]
  trainer1Pct: 100,
  trainer2Pct: 0,
  rent: 0,
  rentWorkDays: 0,
  rentPerDay: 0,
  otherExp: 0
};

let groupsUnsub  = null;
let monthUnsub   = null;
let saveTimeout  = null;

/* ======================== DOM ======================== */
const $ = id => document.getElementById(id);
const E = {
  loginScreen: $('loginScreen'), mainApp: $('mainApp'),
  googleSignInBtn: $('googleSignInBtn'), signOutBtn: $('signOutBtn'),
  userAvatar: $('userAvatar'), userName: $('userName'),
  groupList: $('groupList'), addGroupBtn: $('addGroupBtn'),
  mobileMenuBtn: $('mobileMenuBtn'), sidebarBackdrop: $('sidebarBackdrop'),
  allGroupsBtn: $('allGroupsBtn'), allGroupsView: $('allGroupsView'),
  agFromMonth: $('agFromMonth'), agFromYear: $('agFromYear'),
  agToMonth: $('agToMonth'), agToYear: $('agToYear'),
  agAllTime: $('agAllTime'), agBuildBtn: $('agBuildBtn'),
  agEmpty: $('agEmpty'), agResults: $('agResults'),
  agSubTotal: $('agSubTotal'), agOneTime: $('agOneTime'), agTotal: $('agTotal'),
  agExpenses: $('agExpenses'), agNet: $('agNet'), agGroupBody: $('agGroupBody'),
  noGroup: $('noGroup'), groupView: $('groupView'),
  groupTitle: $('groupTitle'),
  monthSelect: $('monthSelect'), yearInput: $('yearInput'),
  prevMonth: $('prevMonth'), nextMonth: $('nextMonth'),
  renameGroupBtn: $('renameGroupBtn'), deleteGroupBtn: $('deleteGroupBtn'),
  statStudents: $('statStudents'), statSubTotal: $('statSubTotal'),
  statOneTime: $('statOneTime'), statTotal: $('statTotal'),
  subscriptionBody: $('subscriptionBody'),
  subTotalFooter: $('subTotalFooter'), subEmpty: $('subEmpty'),
  addStudentBtn: $('addStudentBtn'),
  priceInput: $('priceInput'), addDateBtn: $('addDateBtn'), fillTueThuBtn: $('fillTueThuBtn'),
  attendanceWrap: $('attendanceWrap'), attEmpty: $('attEmpty'),
  attendanceTable: $('attendanceTable'),
  trainer1Pct: $('trainer1Pct'), trainer2Pct: $('trainer2Pct'),
  rentWorkDays: $('rentWorkDays'), rentPerDay: $('rentPerDay'),
  rentInput: $('rentInput'), otherExpInput: $('otherExpInput'),
  resTotal: $('resTotal'), resExpenses: $('resExpenses'),
  resNet: $('resNet'), resT1: $('resT1'), resT2: $('resT2'),
  t1pct: $('t1pct'), t2pct: $('t2pct'),
  modalOverlay: $('modalOverlay'), modalTitle: $('modalTitle'),
  modalBody: $('modalBody'), modalCancel: $('modalCancel'),
  modalConfirm: $('modalConfirm'), toast: $('toast'),
  authLoading: $('authLoading'),
  reportFromMonth: $('reportFromMonth'), reportFromYear: $('reportFromYear'),
  reportToMonth: $('reportToMonth'), reportToYear: $('reportToYear'),
  reportAllTime: $('reportAllTime'), reportBuildBtn: $('reportBuildBtn'),
  reportEmpty: $('reportEmpty'), reportResults: $('reportResults'),
  repSubTotal: $('repSubTotal'), repOneTime: $('repOneTime'), repTotal: $('repTotal'),
  repExpenses: $('repExpenses'), repNet: $('repNet'), repT1: $('repT1'), repT2: $('repT2'),
  reportMonthBody: $('reportMonthBody')
};

/* ======================== Auth ======================== */

// Explicit persistence: some mobile browsers (in-app webviews, private mode)
// don't reliably keep the default persistence across the redirect round-trip.
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.error('persistence', e));

function showAuthLoading(msg){
  if(!E.authLoading) return;
  const p = E.authLoading.querySelector('p');
  if(p) p.textContent = msg;
  E.authLoading.hidden = false;
}
function hideAuthLoading(){
  if(E.authLoading) E.authLoading.hidden = true;
}

// If we're mid-way through a mobile redirect login, show a spinner instead of
// a blank/stuck screen while Firebase resolves the result.
// The flag stores a timestamp (not just '1') so a stale flag from an
// interrupted/old redirect attempt can't get us stuck forever on reload.
const REDIRECT_FLAG_MAX_AGE_MS = 60000; // treat anything older than this as stale
const redirectStartedAt = Number(sessionStorage.getItem('authRedirectPending')) || 0;
const redirectPending = redirectStartedAt > 0 && (Date.now() - redirectStartedAt) < REDIRECT_FLAG_MAX_AGE_MS;
if (redirectStartedAt > 0 && !redirectPending) {
  // Stale leftover flag from a previous session — clear it silently.
  sessionStorage.removeItem('authRedirectPending');
}
if (redirectPending) {
  E.loginScreen.hidden = true;
  showAuthLoading('Завершаем вход...');
  // Safety net: if nothing resolves within 12s (blocked network, unauthorized
  // domain, etc.) stop showing an endless spinner and tell the user.
  setTimeout(() => {
    if (!currentUser) {
      sessionStorage.removeItem('authRedirectPending');
      hideAuthLoading();
      E.loginScreen.hidden = false;
      toast('Не удалось завершить вход. Проверьте интернет и попробуйте снова.');
    }
  }, 12000);
}

auth.onAuthStateChanged(user => {
  try{
    hideAuthLoading();
    sessionStorage.removeItem('authRedirectPending');
    if (user) {
      currentUser = user;
      E.userAvatar.src = user.photoURL || '';
      E.userName.textContent = (user.displayName||user.email||'').split(' ')[0];
      E.loginScreen.hidden = true;
      E.mainApp.hidden = false;
      buildMonthSelect();
      buildReportSelects();
      buildAllGroupsSelects();
      loadGroups();
    } else {
      currentUser = null;
      cleanup();
      E.loginScreen.hidden = false;
      E.mainApp.hidden = true;
    }
  } catch(err){
    // Never leave the screen blank: something above threw (Safari storage
    // quirks after a popup sign-in are a known culprit) — fall back to a
    // visible, retryable state instead of a silent black screen.
    console.error('onAuthStateChanged handler failed', err);
    E.mainApp.hidden = true;
    E.loginScreen.hidden = false;
    hideAuthLoading();
    toast('Что-то пошло не так после входа. Попробуйте ещё раз.');
  }
});

// Absolute last-resort safety net: if for any reason nothing became visible
// shortly after load (login screen, loading spinner, or the app itself),
// force the login screen back on instead of leaving a blank page.
setTimeout(() => {
  const nothingVisible = E.loginScreen.hidden && E.mainApp.hidden &&
    (!E.authLoading || E.authLoading.hidden);
  if (nothingVisible) {
    console.warn('Nothing visible after load — forcing login screen as a fallback.');
    E.loginScreen.hidden = false;
  }
}, 6000);

E.googleSignInBtn.addEventListener('click', async () => {
  // Popup only. The redirect flow needs sessionStorage to survive a full
  // navigation to accounts.google.com and back — Safari's cross-site storage
  // partitioning breaks exactly that, throwing "missing initial state".
  // A popup doesn't need that round trip, so it's the reliable option here.
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    const userJustClosedIt = [
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request'
    ].includes(e.code);
    if (userJustClosedIt) return;

    if (e.code === 'auth/popup-blocked') {
      toast('Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для этого сайта в настройках браузера и нажмите «Войти» ещё раз.');
    } else {
      toast('Ошибка входа: '+e.message);
    }
  }
});

auth.getRedirectResult().then(result => {
  sessionStorage.removeItem('authRedirectPending');
  if (result && result.user) hideAuthLoading();
}).catch(e => {
  sessionStorage.removeItem('authRedirectPending');
  hideAuthLoading();
  E.loginScreen.hidden = false;
  if (e && e.code !== 'auth/no-auth-event') toast('Ошибка входа: '+e.message);
});

E.signOutBtn.addEventListener('click', () => { cleanup(); auth.signOut(); });

function cleanup(){
  if(groupsUnsub){ groupsUnsub(); groupsUnsub=null; }
  if(monthUnsub){ monthUnsub(); monthUnsub=null; }
}

/* ======================== Firestore helpers ======================== */
// All data lives under one shared "household" document, regardless of which
// of the allowed Google accounts is currently signed in (see Firestore rules
// for the matching allow-list by email).
const HOUSEHOLD_OWNER_UID = 'nwKYKEAb1GeWFUlMGtPWgaGgLp12';
function userRef(){ return db.collection('dance_users').doc(HOUSEHOLD_OWNER_UID); }
function groupsRef(){ return userRef().collection('groups'); }
function monthRef(){
  const key = `${currentGroupId}_${currentYear}_${pad(currentMonth+1)}`;
  return userRef().collection('months').doc(key);
}

function scheduleSave(){
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveMonth, 700);
}

function saveMonth(){
  if(!currentUser||!currentGroupId) return;
  monthRef().set({
    ...monthData,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => toast('Ошибка сохранения: '+e.message));
}

/* ======================== Groups ======================== */
function loadGroups(){
  if(groupsUnsub) groupsUnsub();
  let loaded = false;
  // If Firestore never responds (blocked network, offline, etc.) let the user
  // know instead of leaving a silently empty screen.
  setTimeout(() => {
    if(!loaded) toast('Группы долго не загружаются. Проверьте интернет-соединение.');
  }, 8000);
  groupsUnsub = groupsRef().orderBy('createdAt').onSnapshot(snap => {
    loaded = true;
    groups = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderGroupList();
    if(currentGroupId && !groups.find(g=>g.id===currentGroupId)){
      currentGroupId = null;
    }
    // Nothing selected yet (fresh login, or the page just loaded): pick the
    // first group automatically instead of leaving every screen hidden and
    // waiting for a sidebar click — on mobile the sidebar starts off-screen,
    // so that click may never be reachable.
    if(!currentGroupId){
      if(groups.length > 0) selectGroup(groups[0].id);
      else showNoGroup();
    }
  }, e => {
    loaded = true;
    toast('Ошибка загрузки групп: '+e.message);
    // Never leave every screen hidden — show *something* retryable.
    if(!currentGroupId) showNoGroup();
  });
}

function renderGroupList(){
  E.groupList.innerHTML = '';
  groups.forEach((g,i) => {
    const li = document.createElement('li');
    li.className = 'group-item' + (g.id===currentGroupId?' active':'');
    li.dataset.id = g.id;
    li.innerHTML = `<span class="group-dot" style="background:${g.color||GROUP_COLORS[i%GROUP_COLORS.length]}"></span><span>${escHtml(g.name)}</span>`;
    li.addEventListener('click', () => selectGroup(g.id));
    E.groupList.appendChild(li);
  });
}

function openSidebar(){
  document.querySelector('.sidebar').classList.add('open');
  E.sidebarBackdrop.classList.add('open');
}
function closeSidebar(){
  document.querySelector('.sidebar').classList.remove('open');
  E.sidebarBackdrop.classList.remove('open');
}
E.mobileMenuBtn.addEventListener('click', openSidebar);
E.sidebarBackdrop.addEventListener('click', closeSidebar);

function selectGroup(id){
  currentGroupId = id;
  renderGroupList();
  const g = groups.find(x=>x.id===id);
  if(!g) return;
  closeSidebar();
  E.groupTitle.textContent = g.name;
  E.allGroupsView.hidden = true;
  E.allGroupsBtn.classList.remove('active');
  E.noGroup.hidden = true;
  E.groupView.hidden = false;
  subscribeMonth();

  // Different group => previous period report no longer applies
  E.reportResults.hidden = true;
  E.reportEmpty.hidden = false;
  E.reportEmpty.textContent = 'Выберите период и нажмите «Показать»';
}

function showNoGroup(){
  E.allGroupsView.hidden = true;
  E.allGroupsBtn.classList.remove('active');
  E.groupView.hidden = true;
  E.noGroup.hidden = false;
}

function showAllGroupsView(){
  currentGroupId = null;
  renderGroupList();
  closeSidebar();
  E.noGroup.hidden = true;
  E.groupView.hidden = true;
  E.allGroupsView.hidden = false;
  E.allGroupsBtn.classList.add('active');
}

E.allGroupsBtn.addEventListener('click', showAllGroupsView);

/* ======================== Add/rename/delete group ======================== */
E.addGroupBtn.addEventListener('click', () => {
  openModal('Новая группа', '<label>Название группы<input type="text" id="mi-name" placeholder="Хилс" maxlength="40"></label>', async () => {
    const name = $('mi-name').value.trim();
    if(!name){ toast('Введи название'); return false; }
    const idx = groups.length;
    await groupsRef().add({ name, color: GROUP_COLORS[idx%GROUP_COLORS.length], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    toast('Группа создана!');
  });
});

E.renameGroupBtn.addEventListener('click', () => {
  const g = groups.find(x=>x.id===currentGroupId);
  if(!g) return;
  openModal('Переименовать группу',
    `<label>Название<input type="text" id="mi-name" value="${escHtml(g.name)}" maxlength="40"></label>`,
    async () => {
      const name = $('mi-name').value.trim();
      if(!name){ toast('Введи название'); return false; }
      await groupsRef().doc(currentGroupId).update({ name });
      E.groupTitle.textContent = name;
      toast('Переименовано');
    });
});

E.deleteGroupBtn.addEventListener('click', () => {
  if(!confirm('Удалить группу и ВСЕ её данные? Это необратимо.')) return;
  groupsRef().doc(currentGroupId).delete();
  currentGroupId = null;
  showNoGroup();
  toast('Группа удалена');
});

/* ======================== Period ======================== */
function buildMonthSelect(){
  E.monthSelect.innerHTML = MONTHS.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
  E.monthSelect.value = currentMonth;
  E.yearInput.value = currentYear;
}

E.monthSelect.addEventListener('change', () => { currentMonth=Number(E.monthSelect.value); onPeriodChange(); });
E.yearInput.addEventListener('change', () => { currentYear=Number(E.yearInput.value)||currentYear; onPeriodChange(); });
E.prevMonth.addEventListener('click', () => shiftMonth(-1));
E.nextMonth.addEventListener('click', () => shiftMonth(1));

function shiftMonth(d){
  let m=currentMonth+d, y=currentYear;
  if(m<0){m=11;y--;} if(m>11){m=0;y++;}
  currentMonth=m; currentYear=y;
  E.monthSelect.value=m; E.yearInput.value=y;
  onPeriodChange();
}

function onPeriodChange(){
  if(currentGroupId) subscribeMonth();
}

/* ======================== Month data ======================== */
function generateWeekdayDates(year, month /* 0-indexed */, weekdays /* e.g. [2,4] */){
  const result = [];
  const d = new Date(year, month, 1);
  while(d.getMonth() === month){
    if(weekdays.includes(d.getDay())){
      const iso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      result.push({ id: uid(), date: iso, label: DAYS[d.getDay()] });
    }
    d.setDate(d.getDate()+1);
  }
  return result;
}

function subscribeMonth(){
  if(monthUnsub){ monthUnsub(); monthUnsub=null; }
  monthRef().onSnapshot(snap => {
    if(snap.exists){
      const d = snap.data();
      monthData = {
        subscriptions:   Array.isArray(d.subscriptions)   ? d.subscriptions   : [],
        trainingDates:   Array.isArray(d.trainingDates)   ? d.trainingDates   : [],
        oneTimePrice:    Number(d.oneTimePrice)  || 300,
        oneTimeVisitors: Array.isArray(d.oneTimeVisitors) ? d.oneTimeVisitors : [],
        trainer1Pct:     d.trainer1Pct !== undefined ? Number(d.trainer1Pct) : 100,
        trainer2Pct:     d.trainer2Pct !== undefined ? Number(d.trainer2Pct) : 0,
        rent:            Number(d.rent)          || 0,
        rentWorkDays:    Number(d.rentWorkDays)  || 0,
        rentPerDay:      Number(d.rentPerDay)    || 0,
        otherExp:        Number(d.otherExp)      || 0
      };
      syncInputsFromData();
      renderAll();
    } else {
      // Brand-new month: pre-fill Tuesdays/Thursdays automatically so you
      // only have to type names and tick boxes, not add every date by hand.
      monthData = { subscriptions:[], trainingDates: generateWeekdayDates(currentYear, currentMonth, [2,4]),
                    oneTimePrice:300, oneTimeVisitors:[], trainer1Pct:100, trainer2Pct:0, rent:0,
                    rentWorkDays:0, rentPerDay:0, otherExp:0 };
      syncInputsFromData();
      renderAll();
      scheduleSave();
    }
  }, e => toast('Ошибка загрузки месяца: '+e.message));
}

function syncInputsFromData(){
  E.priceInput.value   = monthData.oneTimePrice || '';
  E.trainer1Pct.value  = monthData.trainer1Pct;
  E.trainer2Pct.value  = monthData.trainer2Pct;
  E.rentWorkDays.value = monthData.rentWorkDays || '';
  E.rentPerDay.value   = monthData.rentPerDay || '';
  E.rentInput.value    = monthData.rent || '';
  E.otherExpInput.value= monthData.otherExp || '';
}

function renderAll(){
  renderSubscriptions();
  renderAttendance();
  renderStats();
  renderTrainerCalc();
}

/* ======================== Subscriptions ======================== */
E.addStudentBtn.addEventListener('click', () => {
  monthData.subscriptions.push({ id: uid(), name:'', amount:0, note:'' });
  renderSubscriptions();
  renderStats();
  scheduleSave();
});

function renderSubscriptions(){
  const rows = monthData.subscriptions;
  E.subscriptionBody.innerHTML = '';
  E.subEmpty.hidden = rows.length > 0;

  rows.forEach((s,i) => {
    const tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.innerHTML = `
      <td class="row-num">${i+1}</td>
      <td><input type="text" class="f-name" value="${escAttr(s.name)}" placeholder="Имя ученицы"></td>
      <td><input type="number" class="f-amount" value="${s.amount||''}" min="0" step="100" placeholder="0"></td>
      <td><input type="text" class="f-note" value="${escAttr(s.note||'')}" placeholder="заметка"></td>
      <td><button class="row-del" title="Удалить">✕</button></td>
    `;
    E.subscriptionBody.appendChild(tr);
  });

  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
  E.subTotalFooter.textContent = fmtUah(total);
}

E.subscriptionBody.addEventListener('input', e => {
  const tr = e.target.closest('tr'); if(!tr) return;
  const row = monthData.subscriptions.find(r=>r.id===tr.dataset.id); if(!row) return;
  if(e.target.classList.contains('f-name'))   row.name   = e.target.value;
  if(e.target.classList.contains('f-amount')) row.amount = Number(e.target.value)||0;
  if(e.target.classList.contains('f-note'))   row.note   = e.target.value;
  // update footer live
  const total = monthData.subscriptions.reduce((s,r)=>s+(Number(r.amount)||0),0);
  E.subTotalFooter.textContent = fmtUah(total);
  renderStats(); scheduleSave();
});

E.subscriptionBody.addEventListener('click', e => {
  const btn = e.target.closest('.row-del'); if(!btn) return;
  const tr = btn.closest('tr');
  monthData.subscriptions = monthData.subscriptions.filter(r=>r.id!==tr.dataset.id);
  renderSubscriptions(); renderStats(); scheduleSave();
});

/* ======================== Attendance ======================== */
E.addDateBtn.addEventListener('click', () => {
  openModal('Добавить дату тренировки',
    `<label>Дата<input type="date" id="mi-date" value="${todayISO()}"></label>
     <label style="margin-top:12px;display:block;">Метка (необязательно)<input type="text" id="mi-label" placeholder="Вт, Чт, Сб…" maxlength="10"></label>`,
    () => {
      const date = $('mi-date').value;
      const labelIn = $('mi-label').value.trim();
      if(!date){ toast('Выбери дату'); return false; }
      const d = new Date(date+'T00:00:00');
      const label = labelIn || DAYS[d.getDay()];
      if(monthData.trainingDates.find(x=>x.date===date)){ toast('Эта дата уже добавлена'); return false; }
      monthData.trainingDates.push({ id: uid(), date, label });
      monthData.trainingDates.sort((a,b)=>a.date.localeCompare(b.date));
      renderAttendance(); scheduleSave();
    });
});

E.fillTueThuBtn.addEventListener('click', () => {
  const generated = generateWeekdayDates(currentYear, currentMonth, [2,4]);
  const existingDates = new Set(monthData.trainingDates.map(x=>x.date));
  const toAdd = generated.filter(x=>!existingDates.has(x.date));
  if(toAdd.length===0){ toast('Все вторники и четверги этого месяца уже добавлены'); return; }
  monthData.trainingDates.push(...toAdd);
  monthData.trainingDates.sort((a,b)=>a.date.localeCompare(b.date));
  renderAttendance(); scheduleSave();
  toast(`Добавлено дат: ${toAdd.length}`);
});

function renderAttendance(){
  try{
    renderAttendanceInner();
  } catch(err){
    console.error('renderAttendance failed', err);
    E.attEmpty.hidden = false;
    E.attEmpty.textContent = 'Не получилось отрисовать таблицу разовых посещений. Обновите страницу; если не поможет — напишите разработчику.';
    E.attendanceTable.innerHTML = '';
    toast('Ошибка отображения разовых посещений');
  }
}

function renderAttendanceInner(){
  // Defensive: drop any malformed visitor records (e.g. old/corrupted data)
  // instead of letting them crash the whole render.
  monthData.oneTimeVisitors = (monthData.oneTimeVisitors||[]).filter(v => v && typeof v === 'object');
  monthData.oneTimeVisitors.forEach(v => {
    if(!v.id) v.id = uid();
    if(typeof v.name !== 'string') v.name = '';
    if(!v.visits || typeof v.visits !== 'object') v.visits = {};
  });
  monthData.trainingDates = (monthData.trainingDates||[]).filter(d => d && typeof d === 'object' && d.date);

  const dates = monthData.trainingDates;
  const visitors = monthData.oneTimeVisitors;

  if(dates.length===0 && visitors.length===0){
    E.attEmpty.hidden = false;
    E.attEmpty.textContent = 'Добавьте даты тренировок и учениц-разовиков';
    E.attendanceTable.innerHTML = '';
    return;
  }
  E.attEmpty.hidden = true;

  // Build table
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');

  // Name col
  const thName = document.createElement('th');
  thName.className='th-name';
  thName.textContent='ФИО';
  hr.appendChild(thName);

  // Date cols
  dates.forEach(d => {
    const th = document.createElement('th');
    th.className='th-date';
    const inner = document.createElement('div');
    inner.className='th-date-inner';
    const lbl = document.createElement('span');
    lbl.className='date-label';
    const dt = new Date(d.date+'T00:00:00');
    lbl.textContent = `${dt.getDate()}.${pad(dt.getMonth()+1)}`;
    const day = document.createElement('span');
    day.className='date-day';
    day.textContent = d.label;
    const del = document.createElement('button');
    del.className='date-del';
    del.textContent='✕';
    del.title='Удалить дату';
    del.dataset.dateid=d.id;
    del.addEventListener('click', () => {
      monthData.trainingDates = monthData.trainingDates.filter(x=>x.id!==d.id);
      // clean visits
      monthData.oneTimeVisitors.forEach(v => { if(v.visits) delete v.visits[d.id]; });
      renderAttendance(); renderStats(); scheduleSave();
    });
    inner.append(lbl, day, del);
    th.appendChild(inner);
    hr.appendChild(th);
  });

  // Total col
  const thTotal = document.createElement('th');
  thTotal.textContent='Сумма';
  hr.appendChild(thTotal);

  // Del col
  const thDel = document.createElement('th');
  hr.appendChild(thDel);

  thead.appendChild(hr);

  const tbody = document.createElement('tbody');

  visitors.forEach(v => {
    if(!v.visits) v.visits={};
    const tr = document.createElement('tr');
    tr.dataset.id=v.id;

    // name
    const tdName = document.createElement('td');
    tdName.className='td-name';
    const inp = document.createElement('input');
    inp.type='text'; inp.value=v.name||''; inp.placeholder='Имя';
    inp.addEventListener('input', () => {
      v.name = inp.value;
      scheduleSave();
    });
    tdName.appendChild(inp);
    tr.appendChild(tdName);

    // check cells
    let visitCount=0;
    dates.forEach(d => {
      const td = document.createElement('td');
      td.className='td-check';
      const btn = document.createElement('button');
      btn.className='check-btn'+(v.visits[d.id]?' checked':'');
      btn.textContent = v.visits[d.id] ? '✓' : '';
      btn.addEventListener('click', () => {
        v.visits[d.id] = !v.visits[d.id];
        btn.classList.toggle('checked', v.visits[d.id]);
        btn.textContent = v.visits[d.id] ? '✓' : '';
        updateVisitorTotal(tr, v);
        renderStats(); scheduleSave();
      });
      if(v.visits[d.id]) visitCount++;
      td.appendChild(btn);
      tr.appendChild(td);
    });

    // total
    const tdTotal = document.createElement('td');
    const price = Number(monthData.oneTimePrice)||0;
    tdTotal.className='att-total';
    tdTotal.textContent = fmtUah(visitCount*price);
    tdTotal.dataset.total='1';
    tr.appendChild(tdTotal);

    // del
    const tdDel = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className='row-del';
    delBtn.textContent='✕';
    delBtn.addEventListener('click', () => {
      monthData.oneTimeVisitors = monthData.oneTimeVisitors.filter(x=>x.id!==v.id);
      renderAttendance(); renderStats(); scheduleSave();
    });
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });

  // Add row button
  const trAdd = document.createElement('tr');
  const tdAdd = document.createElement('td');
  tdAdd.colSpan = dates.length+3;
  const addBtn = document.createElement('button');
  addBtn.className='att-add-row';
  addBtn.textContent='+ Добавить разового посетителя';
  addBtn.addEventListener('click', () => {
    monthData.oneTimeVisitors.push({ id:uid(), name:'', visits:{} });
    renderAttendance(); scheduleSave();
  });
  tdAdd.appendChild(addBtn);
  trAdd.appendChild(tdAdd);
  tbody.appendChild(trAdd);

  // Clear & rebuild
  E.attendanceTable.innerHTML='';
  E.attendanceTable.appendChild(thead);
  E.attendanceTable.appendChild(tbody);
}

function updateVisitorTotal(tr, v){
  const price = Number(monthData.oneTimePrice)||0;
  const count = Object.values(v.visits||{}).filter(Boolean).length;
  const td = tr.querySelector('[data-total]');
  if(td) td.textContent = fmtUah(count*price);
}

E.priceInput.addEventListener('input', () => {
  monthData.oneTimePrice = Number(E.priceInput.value)||0;
  // refresh totals in table without full re-render
  if(currentGroupId) renderAttendance();
  renderStats(); scheduleSave();
});

/* ======================== Settings ======================== */
[E.trainer1Pct, E.trainer2Pct, E.rentInput, E.otherExpInput].forEach(inp => {
  inp.addEventListener('input', () => {
    monthData.trainer1Pct = Number(E.trainer1Pct.value)||0;
    monthData.trainer2Pct = Number(E.trainer2Pct.value)||0;
    monthData.rent        = Number(E.rentInput.value)||0;
    monthData.otherExp    = Number(E.otherExpInput.value)||0;
    renderTrainerCalc(); scheduleSave();
  });
});

// Rent calculator: work days x rate per day. Recomputes the "Аренда зала"
// total whenever either of these two changes; the total itself stays a
// normal editable field afterwards (you can still tweak it by hand).
[E.rentWorkDays, E.rentPerDay].forEach(inp => {
  inp.addEventListener('input', () => {
    monthData.rentWorkDays = Number(E.rentWorkDays.value)||0;
    monthData.rentPerDay   = Number(E.rentPerDay.value)||0;
    monthData.rent = monthData.rentWorkDays * monthData.rentPerDay;
    E.rentInput.value = monthData.rent || '';
    renderTrainerCalc(); scheduleSave();
  });
});

/* ======================== Stats ======================== */
function calcTotals(){
  const subTotal = monthData.subscriptions.reduce((s,r)=>s+(Number(r.amount)||0),0);
  const price = Number(monthData.oneTimePrice)||0;
  const oneTimeTotal = monthData.oneTimeVisitors.reduce((s,v) => {
    const count = Object.values(v.visits||{}).filter(Boolean).length;
    return s + count*price;
  }, 0);
  return { subTotal, oneTimeTotal, total: subTotal+oneTimeTotal };
}

function renderStats(){
  const { subTotal, oneTimeTotal, total } = calcTotals();
  const rent  = Number(monthData.rent)||0;
  const other = Number(monthData.otherExp)||0;
  const net = Math.max(total-rent-other, 0);
  E.statStudents.textContent = monthData.subscriptions.filter(s=>s.name).length;
  E.statSubTotal.textContent = fmtUah(subTotal);
  E.statOneTime.textContent  = fmtUah(oneTimeTotal);
  E.statTotal.textContent    = fmtUah(net);
  renderTrainerCalc();
}

function renderTrainerCalc(){
  const { total } = calcTotals();
  const rent = Number(monthData.rent)||0;
  const other = Number(monthData.otherExp)||0;
  const expenses = rent+other;
  const net = Math.max(total-expenses, 0);
  const t1pct = Number(monthData.trainer1Pct)||0;
  const t2pct = Number(monthData.trainer2Pct)||0;

  E.resTotal.textContent    = fmtUah(total);
  E.resExpenses.textContent = fmtUah(expenses);
  E.resNet.textContent      = fmtUah(net);
  E.resT1.textContent       = fmtUah(Math.round(net*t1pct/100));
  E.resT2.textContent       = fmtUah(Math.round(net*t2pct/100));
  E.t1pct.textContent       = t1pct;
  E.t2pct.textContent       = t2pct;
}

/* ======================== Period report ======================== */
function buildReportSelects(){
  const opts = MONTHS.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
  E.reportFromMonth.innerHTML = opts;
  E.reportToMonth.innerHTML = opts;
  const y = new Date().getFullYear();
  E.reportFromMonth.value = 0;
  E.reportFromYear.value = y;
  E.reportToMonth.value = new Date().getMonth();
  E.reportToYear.value = y;
}

function buildAllGroupsSelects(){
  const opts = MONTHS.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
  E.agFromMonth.innerHTML = opts;
  E.agToMonth.innerHTML = opts;
  const y = new Date().getFullYear();
  E.agFromMonth.value = 0;
  E.agFromYear.value = y;
  E.agToMonth.value = new Date().getMonth();
  E.agToYear.value = y;
}

E.agAllTime.addEventListener('change', () => {
  const disabled = E.agAllTime.checked;
  [E.agFromMonth, E.agFromYear, E.agToMonth, E.agToYear].forEach(el => el.disabled = disabled);
});

E.agBuildBtn.addEventListener('click', runAllGroupsReport);

async function runAllGroupsReport(){
  E.agBuildBtn.disabled = true;
  E.agBuildBtn.textContent = 'Считаем...';

  try{
    // Every month doc across every group lives in the same "months"
    // collection with id "<groupId>_YYYY_MM" — pull the whole collection
    // once and bucket it in memory instead of querying per group.
    const snap = await userRef().collection('months').get();

    const allTime = E.agAllTime.checked;
    const fromKey = Number(E.agFromYear.value)*12 + Number(E.agFromMonth.value);
    const toKey   = Number(E.agToYear.value)*12 + Number(E.agToMonth.value);

    const byGroup = {}; // groupId -> {name, subTotal, oneTimeTotal, total, expenses, net}

    snap.forEach(doc => {
      const parts = doc.id.split('_'); // [groupId, year, month]
      if(parts.length !== 3) return;
      const groupId = parts[0];
      const year = Number(parts[1]);
      const month = Number(parts[2]) - 1;
      if(Number.isNaN(year) || Number.isNaN(month)) return;
      const key = year*12 + month;
      if(!allTime && (key < fromKey || key > toKey)) return;

      const d = doc.data();
      const subTotal = Array.isArray(d.subscriptions)
        ? d.subscriptions.reduce((s,r)=>s+(Number(r.amount)||0),0) : 0;
      const price = Number(d.oneTimePrice)||0;
      const oneTimeTotal = Array.isArray(d.oneTimeVisitors)
        ? d.oneTimeVisitors.reduce((s,v)=>{
            const count = Object.values(v && v.visits || {}).filter(Boolean).length;
            return s + count*price;
          },0) : 0;
      const total = subTotal + oneTimeTotal;
      const rent = Number(d.rent)||0;
      const other = Number(d.otherExp)||0;
      const expenses = rent+other;
      const net = Math.max(total-expenses,0);

      if(!byGroup[groupId]){
        const g = groups.find(x=>x.id===groupId);
        byGroup[groupId] = { name: g ? g.name : 'Удалённая группа', subTotal:0, oneTimeTotal:0, total:0, expenses:0, net:0 };
      }
      const b = byGroup[groupId];
      b.subTotal += subTotal; b.oneTimeTotal += oneTimeTotal; b.total += total;
      b.expenses += expenses; b.net += net;
    });

    renderAllGroupsReport(byGroup);
  } catch(e){
    toast('Ошибка построения общего отчёта: '+e.message);
  } finally {
    E.agBuildBtn.disabled = false;
    E.agBuildBtn.textContent = 'Показать';
  }
}

function renderAllGroupsReport(byGroup){
  const rows = Object.values(byGroup);
  if(rows.length===0){
    E.agResults.hidden = true;
    E.agEmpty.hidden = false;
    E.agEmpty.textContent = 'За выбранный период данных нет';
    return;
  }
  E.agEmpty.hidden = true;
  E.agResults.hidden = false;

  const sum = key => rows.reduce((s,r)=>s+r[key],0);
  const subTotal = sum('subTotal'), oneTimeTotal = sum('oneTimeTotal'),
        total = sum('total'), expenses = sum('expenses'), net = sum('net');

  E.agSubTotal.textContent = fmtUah(subTotal);
  E.agOneTime.textContent  = fmtUah(oneTimeTotal);
  E.agTotal.textContent    = fmtUah(net);
  E.agExpenses.textContent = fmtUah(expenses);
  E.agNet.textContent      = fmtUah(net);

  rows.sort((a,b)=>b.net-a.net);
  E.agGroupBody.innerHTML = rows.map(r => `
    <tr>
      <td>${escHtml(r.name)}</td>
      <td>${fmtUah(r.total)}</td>
      <td>${fmtUah(r.expenses)}</td>
      <td>${fmtUah(r.net)}</td>
    </tr>
  `).join('');
}

E.reportAllTime.addEventListener('change', () => {
  const disabled = E.reportAllTime.checked;
  [E.reportFromMonth, E.reportFromYear, E.reportToMonth, E.reportToYear].forEach(el => el.disabled = disabled);
});

E.reportBuildBtn.addEventListener('click', runPeriodReport);

async function runPeriodReport(){
  if(!currentGroupId){ toast('Сначала выбери группу'); return; }

  E.reportBuildBtn.disabled = true;
  E.reportBuildBtn.textContent = 'Считаем...';

  try{
    // All month docs for this group have ids "<groupId>_YYYY_MM", so a range
    // query on the document id prefix pulls every month in one request.
    const prefix = `${currentGroupId}_`;
    const snap = await userRef().collection('months')
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<', prefix + '\uf8ff')
      .get();

    const allTime = E.reportAllTime.checked;
    const fromKey = Number(E.reportFromYear.value)*12 + Number(E.reportFromMonth.value);
    const toKey   = Number(E.reportToYear.value)*12 + Number(E.reportToMonth.value);

    const rows = [];
    snap.forEach(doc => {
      const parts = doc.id.split('_'); // [groupId, year, month]
      const year = Number(parts[1]);
      const month = Number(parts[2]) - 1;
      if(Number.isNaN(year) || Number.isNaN(month)) return;
      const key = year*12 + month;
      if(!allTime && (key < fromKey || key > toKey)) return;

      const d = doc.data();
      const subTotal = Array.isArray(d.subscriptions)
        ? d.subscriptions.reduce((s,r)=>s+(Number(r.amount)||0),0) : 0;
      const price = Number(d.oneTimePrice)||0;
      const oneTimeTotal = Array.isArray(d.oneTimeVisitors)
        ? d.oneTimeVisitors.reduce((s,v)=>{
            const count = Object.values(v.visits||{}).filter(Boolean).length;
            return s + count*price;
          },0) : 0;
      const total = subTotal + oneTimeTotal;
      const rent = Number(d.rent)||0;
      const other = Number(d.otherExp)||0;
      const expenses = rent+other;
      const net = Math.max(total-expenses,0);
      const t1pct = Number(d.trainer1Pct)||0;
      const t2pct = Number(d.trainer2Pct)||0;

      rows.push({
        year, month, subTotal, oneTimeTotal, total, expenses, net,
        t1: Math.round(net*t1pct/100), t2: Math.round(net*t2pct/100)
      });
    });

    rows.sort((a,b) => (a.year*12+a.month) - (b.year*12+b.month));
    renderPeriodReport(rows);
  } catch(e){
    toast('Ошибка построения отчёта: '+e.message);
  } finally {
    E.reportBuildBtn.disabled = false;
    E.reportBuildBtn.textContent = 'Показать';
  }
}

function renderPeriodReport(rows){
  if(rows.length===0){
    E.reportResults.hidden = true;
    E.reportEmpty.hidden = false;
    E.reportEmpty.textContent = 'За выбранный период данных нет';
    return;
  }
  E.reportEmpty.hidden = true;
  E.reportResults.hidden = false;

  const sum = key => rows.reduce((s,r)=>s+r[key],0);
  const subTotal = sum('subTotal'), oneTimeTotal = sum('oneTimeTotal'),
        total = sum('total'), expenses = sum('expenses'), net = sum('net'),
        t1 = sum('t1'), t2 = sum('t2');

  E.repSubTotal.textContent = fmtUah(subTotal);
  E.repOneTime.textContent  = fmtUah(oneTimeTotal);
  E.repTotal.textContent    = fmtUah(total);
  E.repExpenses.textContent = fmtUah(expenses);
  E.repNet.textContent      = fmtUah(net);
  E.repT1.textContent       = fmtUah(t1);
  E.repT2.textContent       = fmtUah(t2);

  E.reportMonthBody.innerHTML = rows.map(r => `
    <tr>
      <td>${MONTHS[r.month]} ${r.year}</td>
      <td>${fmtUah(r.subTotal)}</td>
      <td>${fmtUah(r.oneTimeTotal)}</td>
      <td>${fmtUah(r.total)}</td>
      <td>${fmtUah(r.net)}</td>
    </tr>
  `).join('');
}

/* ======================== Tabs ======================== */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-'+btn.dataset.tab).classList.add('active');
  });
});

/* ======================== Modal ======================== */
function openModal(title, bodyHtml, onConfirm){
  E.modalTitle.textContent = title;
  E.modalBody.innerHTML = bodyHtml;
  E.modalOverlay.hidden = false;
  // focus first input
  const first = E.modalBody.querySelector('input');
  if(first) setTimeout(()=>first.focus(),50);

  const cleanup = () => { E.modalOverlay.hidden=true; };
  E.modalCancel.onclick = cleanup;
  E.modalOverlay.onclick = e => { if(e.target===E.modalOverlay) cleanup(); };
  E.modalConfirm.onclick = async () => {
    const result = await onConfirm();
    if(result !== false) cleanup();
  };
}

/* ======================== Utils ======================== */
function uid(){ return 'i'+Math.random().toString(36).slice(2,9)+Date.now().toString(36); }
function pad(n){ return String(n).padStart(2,'0'); }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function fmtUah(n){ return (Math.round(n)).toLocaleString('ru-RU')+'₴'; }

function toast(msg){
  E.toast.textContent=msg;
  E.toast.hidden=false;
  requestAnimationFrame(()=>E.toast.classList.add('show'));
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>{
    E.toast.classList.remove('show');
    setTimeout(()=>{E.toast.hidden=true;},250);
  },2200);
}
