(() => {
  const STORAGE_KEY = 'savings-goals:v1';
  const form = document.getElementById('goalForm');
  const goalList = document.getElementById('goalList');
  const clearAllBtn = document.getElementById('clearAll');
  const mainLayout = document.getElementById('main');

  function loadGoals() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveGoals(goals) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }

  function formatCurrency(n) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);
  }

  function ensureFields(g) {
    g.title = g.title || 'Untitled';
    g.target = Number(g.target || 0);
    g.saved = Number(g.saved || 0);
    g.date = g.date || '';
    g.interest = Number(g.interest || 0);
    g.rate_period = g.rate_period || 'yearly';
    g.deposits = g.deposits || [];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function createGoalElement(g, idx) {
    ensureFields(g);
    const percent = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
    const el = document.createElement('div');
    el.className = 'goal';
    el.style.cursor = 'pointer';

    const left = document.createElement('div');
    left.style.maxWidth = '70%';
    const title = document.createElement('div');
    title.innerHTML = `<strong>${escapeHtml(g.title)}</strong>`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${g.date || 'No date'} • ${formatCurrency(g.saved)} of ${formatCurrency(g.target)}`;
    left.appendChild(title);
    left.appendChild(meta);

    const prog = document.createElement('div');
    prog.className = 'progress';
    const fill = document.createElement('i');
    fill.style.width = percent + '%';
    prog.appendChild(fill);
    left.appendChild(prog);

    const right = document.createElement('div');
    right.className = 'actions';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn small';
    viewBtn.textContent = 'Open';
    viewBtn.onclick = (ev) => { ev.stopPropagation(); openDetail(idx); };
    const delBtn = document.createElement('button');
    delBtn.className = 'btn ghost small';
    delBtn.textContent = 'Delete';
    delBtn.onclick = (ev) => { ev.stopPropagation(); if (confirm('Delete this goal?')) deleteGoal(idx); };
    right.appendChild(viewBtn);
    right.appendChild(delBtn);

    el.appendChild(left);
    el.appendChild(right);
    el.onclick = () => openDetail(idx);
    return el;
  }

  function render() {
    const goals = loadGoals();
    goalList.innerHTML = '';
    if (goals.length === 0) {
      goalList.innerHTML = '<div class="empty">No goals yet — add one to get started.</div>';
      return;
    }

    // keep original indexes for actions
    const indexed = goals.map((g, i) => ({ g, i }));
    indexed.sort((a, b) => {
      const ad = a.g.date || '';
      const bd = b.g.date || '';
      if (ad && bd) return new Date(ad) - new Date(bd);
      if (ad) return -1;
      if (bd) return 1;
      return 0;
    });

    let totalTarget = 0, totalSaved = 0;
    indexed.forEach(({ g, i: origIdx }) => {
      totalTarget += Number(g.target || 0);
      totalSaved += Number(g.saved || 0);
      goalList.appendChild(createGoalElement(g, origIdx));
    });
  }

  function addGoal(goal) {
    const goals = loadGoals();
    ensureFields(goal);
    goals.push(goal);
    saveGoals(goals);
    render();
  }

  function deleteGoal(index) {
    const goals = loadGoals();
    goals.splice(index, 1);
    saveGoals(goals);
    render();
  }

  function updateGoal(index, patch) {
    const goals = loadGoals();
    const g = goals[index];
    if (!g) return false;
    Object.assign(g, patch);
    g.saved = Number(g.saved || 0);
    g.target = Number(g.target || 0);
    g.interest = Number(g.interest || 0);
    g.rate_period = g.rate_period || 'yearly';
    g.deposits = g.deposits || [];
    saveGoals(goals);
    return true;
  }

  // projection helpers
  function computeProjectionAmount(current, interestPercent, ratePeriod, periods, periodicContribution = 0) {
    const PV = Number(current || 0);
    const rAnn = Number(interestPercent || 0) / 100;
    if (!periods || periods <= 0) return Number(PV.toFixed(2));
    const r = (ratePeriod === 'monthly') ? (rAnn / 12) : rAnn;
    if (Math.abs(r) < 1e-12) {
      const fv = PV + periodicContribution * periods;
      return Number(fv.toFixed(2));
    }
    const factor = Math.pow(1 + r, periods);
    const fvPV = PV * factor;
    const fvContrib = periodicContribution ? (periodicContribution * ((factor - 1) / r)) : 0;
    return Number((fvPV + fvContrib).toFixed(2));
  }

  function computeRequiredPerPeriod(current, target, interestPercent, ratePeriod, periods) {
    const PV = Number(current || 0);
    const FV = Number(target || 0);
    const rAnn = Number(interestPercent || 0) / 100;
    if (!periods || periods <= 0) return null;
    const r = (ratePeriod === 'monthly') ? (rAnn / 12) : rAnn;
    if (Math.abs(r) < 1e-12) {
      return Number(((FV - PV) / periods).toFixed(2));
    }
    const factor = Math.pow(1 + r, periods);
    const denom = (factor - 1) / r;
    const numerator = FV - PV * factor;
    const C = numerator / denom;
    return Number(C.toFixed(2));
  }

  function periodsUntilTargetDate(targetDateStr, ratePeriod) {
    if (!targetDateStr) return null;
    const target = new Date(targetDateStr);
    const now = new Date();
    const diffMs = target - now;
    if (diffMs <= 0) return 0;
    if (ratePeriod === 'monthly') {
      const months = diffMs / (1000 * 60 * 60 * 24 * 30.4375);
      return Math.max(0, months);
    } else {
      const years = diffMs / (1000 * 60 * 60 * 24 * 365);
      return Math.max(0, years);
    }
  }

  // detail view
  function openDetail(index) {
    const goals = loadGoals();
    const g = goals[index];
    if (!g) return;
    ensureFields(g);

    mainLayout.innerHTML = `
      <div style="grid-column:1/-1">
        <section class="card" aria-labelledby="detail-heading">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div style="min-width:0">
              <h2 id="detail-heading" style="margin:0">${escapeHtml(g.title)}</h2>

              <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input id="nameInput" type="text" value="${escapeHtml(g.title)}" style="padding:6px;border:1px solid #e6e9ee;border-radius:6px">
                <input id="dateInput" type="date" value="${escapeHtml(g.date)}" style="padding:6px;border:1px solid #e6e9ee;border-radius:6px">
                <button id="saveNameBtn" class="btn small">Save name & date</button>
              </div>

              <div class="small-muted" style="margin-top:8px">Target ${formatCurrency(g.target)}</div>
            </div>
            <div style="display:flex;gap:8px">
              <button id="backBtn" class="btn small">Back</button>
              <button id="deleteBtn" class="btn ghost small">Delete</button>
            </div>
          </div>

          <div class="detail-row">
            <div>
              <h3 style="margin-top:12px;margin-bottom:8px">Balance & deposits</h3>
              <div><strong id="balanceDisplay">${formatCurrency(g.saved)}</strong></div>
              <div class="small-muted" style="margin-top:6px">Interest: <span id="interestDisplay">${g.interest}% (${g.rate_period})</span></div>

              <h4 style="margin-top:12px;margin-bottom:6px">Deposits</h4>
              <ul id="depositList" class="deposit-list">
                ${ (g.deposits||[]).map(d=>`<li>${formatCurrency(d.amount)} — ${escapeHtml(d.date)}</li>`).join('') }
              </ul>

              <div style="margin-top:12px">
                <label class="small-muted">Add deposit</label>
                <div style="display:flex;gap:8px">
                  <input id="depAmount" type="number" step="0.01" placeholder="Amount" style="flex:1">
                  <input id="depDate" type="date" style="width:140px">
                  <button id="addDepBtn" class="btn small">+ Add</button>
                </div>
              </div>
            </div>

            <div>
              <h3 style="margin-top:12px;margin-bottom:8px">Interest & simulation</h3>

              <label class="small-muted">Interest rate (%)</label>
              <input id="interestInput" type="number" step="0.01" value="${g.interest}">

              <label class="small-muted" style="margin-top:8px">Rate period</label>
              <select id="ratePeriodInput">
                <option value="yearly" ${g.rate_period === 'yearly' ? 'selected' : ''}>Yearly</option>
                <option value="monthly" ${g.rate_period === 'monthly' ? 'selected' : ''}>Monthly</option>
              </select>

              <div style="margin-top:12px">
                <label class="small-muted">Simulate periods</label>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                  <input id="simPeriods" type="number" min="1" value="1" style="width:100px">
                  <button id="runSim" class="btn small">Run projection</button>
                  <button id="calcNeedBtn" class="btn small">Calc needed /period</button>
                </div>

                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                  <button id="runSimToTarget" class="btn ghost small">Simulate to target date</button>
                  <button id="calcNeedToTarget" class="btn ghost small">Calc needed → target date</button>
                </div>

                <div id="simResult" class="sim-result" aria-live="polite" style="display:none"></div>
                <div id="simNeeded" class="sim-result" aria-live="polite" style="display:none"></div>
                <div class="small-muted" style="margin-top:8px">Simulation shows a projection only and does not change the saved amount.</div>
              </div>

              <div style="margin-top:16px">
                <label class="small-muted">Edit saved / target</label>
                <div style="display:flex;gap:8px;margin-top:6px">
                  <input id="editSaved" type="number" step="0.01" value="${g.saved}">
                  <input id="editTarget" type="number" step="0.01" value="${g.target}">
                  <button id="saveEdits" class="btn small">Save</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => { location.reload(); });
    document.getElementById('deleteBtn').addEventListener('click', () => {
      if (confirm('Delete this goal?')) { deleteGoal(index); location.reload(); }
    });

    document.getElementById('saveNameBtn').addEventListener('click', () => {
      const nv = document.getElementById('nameInput').value.trim();
      const newDate = document.getElementById('dateInput').value || '';
      if (!nv) { alert('Name cannot be empty'); return; }
      updateGoal(index, { title: nv, date: newDate });
      const heading = document.getElementById('detail-heading');
      if (heading) heading.textContent = nv;
      render();
    });

    document.getElementById('addDepBtn').addEventListener('click', () => {
      const amt = parseFloat(document.getElementById('depAmount').value) || 0;
      const dte = document.getElementById('depDate').value || (new Date()).toISOString().slice(0, 10);
      if (amt <= 0) { alert('Enter an amount greater than 0'); return; }
      g.deposits = g.deposits || [];
      g.deposits.push({ amount: amt, date: dte });
      g.saved = Number(g.saved || 0) + amt;
      updateGoal(index, { deposits: g.deposits, saved: g.saved });
      const depositList = document.getElementById('depositList');
      depositList.innerHTML = (g.deposits || []).map(d => `<li>${formatCurrency(d.amount)} — ${escapeHtml(d.date)}</li>`).join('');
      document.getElementById('balanceDisplay').textContent = formatCurrency(g.saved);
      render();
      document.getElementById('depAmount').value = '';
      document.getElementById('depDate').value = '';
      document.getElementById('interestDisplay').textContent = `${g.interest}% (${g.rate_period})`;
    });

    document.getElementById('runSim').addEventListener('click', () => {
      const periods = Math.max(1, parseInt(document.getElementById('simPeriods').value) || 1);
      const projected = computeProjectionAmount(g.saved, g.interest, g.rate_period, periods);
      const simResult = document.getElementById('simResult');
      simResult.style.display = 'block';
      const reached = (g.target > 0 && projected >= g.target);
      simResult.innerHTML = `Projection after ${periods} period(s): <strong>${formatCurrency(projected)}</strong>` +
        (g.target > 0 ? ` — ${reached ? '<strong style="color:green">target reached</strong>' : '<span class="muted">target not reached</span>'}` : '');
      document.getElementById('simNeeded').style.display = 'none';
    });

    document.getElementById('calcNeedBtn').addEventListener('click', () => {
      const periods = Math.max(1, parseInt(document.getElementById('simPeriods').value) || 1);
      const needed = computeRequiredPerPeriod(g.saved, g.target, g.interest, g.rate_period, periods);
      const simNeeded = document.getElementById('simNeeded');
      simNeeded.style.display = 'block';
      if (needed === null) { simNeeded.innerHTML = 'Invalid number of periods.'; return; }
      if (needed <= 0) simNeeded.innerHTML = `No additional periodic deposit required — current balance projected to meet or exceed target in ${periods} period(s).`;
      else simNeeded.innerHTML = `To reach ${formatCurrency(g.target)} in ${periods} ${g.rate_period === 'monthly' ? 'month(s)' : 'year(s)'}: add <strong>${formatCurrency(needed)}</strong> each period (with interest).`;
    });

    document.getElementById('runSimToTarget').addEventListener('click', () => {
      const periods = periodsUntilTargetDate(g.date, g.rate_period);
      const simResult = document.getElementById('simResult');
      if (periods === null) { simResult.style.display = 'block'; simResult.innerHTML = 'No target date set for this goal.'; document.getElementById('simNeeded').style.display = 'none'; return; }
      if (periods === 0) { simResult.style.display = 'block'; simResult.innerHTML = 'Target date is today or in the past — no simulation needed.'; document.getElementById('simNeeded').style.display = 'none'; return; }
      const projected = computeProjectionAmount(g.saved, g.interest, g.rate_period, periods);
      const reached = (g.target > 0 && projected >= g.target);
      simResult.style.display = 'block';
      simResult.innerHTML = `Projection to target date (${g.date}) — ${Number(periods.toFixed(2))} ${g.rate_period === 'monthly' ? 'month(s)' : 'year(s)'}: <strong>${formatCurrency(projected)}</strong>` +
        (g.target > 0 ? ` — ${reached ? '<strong style="color:green">target reached</strong>' : '<span class="muted">target not reached</span>'}` : '');
      document.getElementById('simNeeded').style.display = 'none';
    });

    document.getElementById('calcNeedToTarget').addEventListener('click', () => {
      const periods = periodsUntilTargetDate(g.date, g.rate_period);
      const simNeeded = document.getElementById('simNeeded');
      if (periods === null) { simNeeded.style.display = 'block'; simNeeded.innerHTML = 'No target date set for this goal.'; return; }
      if (periods === 0) { simNeeded.style.display = 'block'; simNeeded.innerHTML = 'Target date is today or in the past — no additional deposits will help timing.'; return; }
      const needed = computeRequiredPerPeriod(g.saved, g.target, g.interest, g.rate_period, periods);
      simNeeded.style.display = 'block';
      if (needed === null) simNeeded.innerHTML = 'Invalid input.';
      else if (needed <= 0) simNeeded.innerHTML = `No additional periodic deposit required — current balance projected to meet or exceed target by ${g.date}.`;
      else simNeeded.innerHTML = `To reach ${formatCurrency(g.target)} by ${g.date} (${Number(periods.toFixed(2))} ${g.rate_period === 'monthly' ? 'month(s)' : 'year(s)'}): add <strong>${formatCurrency(needed)}</strong> each period (with interest).`;
    });

    document.getElementById('interestInput').addEventListener('change', (e) => {
      const v = parseFloat(e.target.value) || 0;
      g.interest = v;
      updateGoal(index, { interest: g.interest });
      document.getElementById('interestDisplay').textContent = `${g.interest}% (${g.rate_period})`;
      render();
    });

    document.getElementById('ratePeriodInput').addEventListener('change', (e) => {
      g.rate_period = e.target.value;
      updateGoal(index, { rate_period: g.rate_period });
      document.getElementById('interestDisplay').textContent = `${g.interest}% (${g.rate_period})`;
      render();
    });

    document.getElementById('saveEdits').addEventListener('click', () => {
      const newSaved = parseFloat(document.getElementById('editSaved').value) || 0;
      const newTarget = parseFloat(document.getElementById('editTarget').value) || 0;
      updateGoal(index, { saved: newSaved, target: newTarget });
      alert('Saved');
      document.getElementById('balanceDisplay').textContent = formatCurrency(newSaved);
      render();
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const title = form.title.value.trim();
    const target = parseFloat(form.target.value) || 0;
    const saved = parseFloat(form.saved.value) || 0;
    const date = form.date.value || '';
    const interest = parseFloat(form.interest.value) || 0;
    const rate_period = document.getElementById('rate_period').value || 'yearly';
    if (!title || target <= 0) {
      alert('Please provide a goal name and a positive target amount.');
      return;
    }
    addGoal({ title, target, saved, date, interest, rate_period, deposits: [] });
    form.reset();
    form.saved.value = '0';
    form.interest.value = '0';
    render();
  });

  clearAllBtn.addEventListener('click', function () {
    if (confirm('Clear all goals? This cannot be undone.')) {
      saveGoals([]);
      render();
    }
  });

  // initial render
  render();
})();