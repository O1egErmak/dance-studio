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
  trainer1Pct: 60,
  trainer2Pct: 40,
  rent: 0,
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
  priceInput: $('priceInput'), addDateBtn: $('addDateBtn'),
  attendanceWrap: $('attendanceWrap'), attEmpty: $('attEmpty'),
  attendanceTable: $('attendanceTable'),
  trainer1Pct: $('trainer1Pct'), trainer2Pct: $('trainer2Pct'),
  rentInput: $('rentInput'), otherExpInput: $('otherExpInput'),
  resTotal: $('resTotal'), resExpenses: $('resExpenses'),
  resNet: $('resNet'), resT1: $('resT1'), resT2: $('resT2'),
  t1pct: $('t1pct'), t2pct: $('t2pct'),
  modalOverlay: $('modalOverlay'), modalTitle: $('modalTitle'),
  modalBody: $('modalBody'), modalCancel: $('modalCancel'),
  modalConfirm: $('modalConfirm'), toast: $('toast')
};

/* ======================== Auth ======================== */
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    E.userAvatar.src = user.photoURL || '';
    E.userName.textContent = (user.displayName||user.email||'').split(' ')[0];
    E.loginScreen.hidden = true;
    E.mainApp.hidden = false;
    buildMonthSelect();
    loadGroups();
  } else {
    currentUser = null;
    cleanup();
    E.loginScreen.hidden = false;
    E.mainApp.hidden = true;
  }
});

E.googleSignInBtn.addEventListener('click', () => {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isMobile || isSafari) {
    auth.signInWithRedirect(googleProvider).catch(e => toast('Ошибка входа: '+e.message));
  } else {
    auth.signInWithPopup(googleProvider).catch(e => toast('Ошибка входа: '+e.message));
  }
});

auth.getRedirectResult().catch(e => {
  if (e && e.code !== 'auth/no-auth-event') toast('Ошибка: '+e.message);
});

E.signOutBtn.addEventListener('click', () => { cleanup(); auth.signOut(); });

function cleanup(){
  if(groupsUnsub){ groupsUnsub(); groupsUnsub=null; }
  if(monthUnsub){ monthUnsub(); monthUnsub=null; }
}

/* ======================== Firestore helpers ======================== */
function userRef(){ return db.collection('dance_users').doc(currentUser.uid); }
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
  groupsUnsub = groupsRef().orderBy('createdAt').onSnapshot(snap => {
    groups = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderGroupList();
    if(currentGroupId && !groups.find(g=>g.id===currentGroupId)){
      currentGroupId = null;
      showNoGroup();
    }
  }, e => toast('Ошибка загрузки групп: '+e.message));
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

function selectGroup(id){
  currentGroupId = id;
  renderGroupList();
  const g = groups.find(x=>x.id===id);
  if(!g) return;
  E.groupTitle.textContent = g.name;
  E.noGroup.hidden = true;
  E.groupView.hidden = false;
  subscribeMonth();
}

function showNoGroup(){
  E.groupView.hidden = true;
  E.noGroup.hidden = false;
}

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
        trainer1Pct:     Number(d.trainer1Pct)  || 60,
        trainer2Pct:     Number(d.trainer2Pct)  || 40,
        rent:            Number(d.rent)          || 0,
        otherExp:        Number(d.otherExp)      || 0
      };
    } else {
      monthData = { subscriptions:[], trainingDates:[], oneTimePrice:300,
                    oneTimeVisitors:[], trainer1Pct:60, trainer2Pct:40, rent:0, otherExp:0 };
    }
    syncInputsFromData();
    renderAll();
  }, e => toast('Ошибка загрузки месяца: '+e.message));
}

function syncInputsFromData(){
  E.priceInput.value   = monthData.oneTimePrice || '';
  E.trainer1Pct.value  = monthData.trainer1Pct;
  E.trainer2Pct.value  = monthData.trainer2Pct;
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

function renderAttendance(){
  const dates = monthData.trainingDates;
  const visitors = monthData.oneTimeVisitors;

  if(dates.length===0 && visitors.length===0){
    E.attEmpty.hidden = false;
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
  E.statStudents.textContent = monthData.subscriptions.filter(s=>s.name).length;
  E.statSubTotal.textContent = fmtUah(subTotal);
  E.statOneTime.textContent  = fmtUah(oneTimeTotal);
  E.statTotal.textContent    = fmtUah(total);
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
