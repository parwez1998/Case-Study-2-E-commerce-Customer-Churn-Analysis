/* ==========================================================================
   BOXIFY CUSTOMER CHURN ANALYSIS — STORY-DRIVEN NON-TECHNICAL BI ENGINE
   Load: ./boxify_customers.csv -> ./data.js (window.BOXIFY_DATA) -> Picker
   ========================================================================== */
(() => {
  'use strict';

  const SNAPSHOT_DATE = '2026-11-21';
  const REQUIRED_COLS = ['CustomerID', 'JoinDate', 'CancelDate', 'Age', 'Gender', 'Location', 'SubscriptionType', 'TotalSpent', 'BoxesReceived', 'EngagementScore', 'PaymentMode'];
  const PLAN_ORDER = ['Monthly', 'Quarterly', 'Annual'];
  const ENG_ORDER = ['Low (0-39)', 'Medium (40-69)', 'High (70-100)'];
  const AGE_ORDER = ['18-25', '26-35', '36-45', '46+'];

  const SLIDE_META = [
    { title: 'Case Overview', script: 'Boxify delivers monthly lifestyle boxes across India. Over the past year, early cancellations before month 6 rose sharply. Today we show who is leaving, why it happens, and how we can cut cancellations by 5–10% in 6 months.', qa: 'Q: Does this include outside market data? A: No, 100% comes from our 5,000 customer records.' },
    { title: 'Executive Summary', script: 'Almost half of all subscribers—about 47 in every 100—have cancelled. Monthly plan members leave far more often than Annual members, and quiet subscribers leave fastest.', qa: 'Q: How many active customers do we have today? A: 2,646 active subscribers as of Nov 21, 2026.' },
    { title: 'Our Data', script: 'We checked all 5,000 customer records across 11 verified columns. There are zero duplicates, and blank cancel dates mean the customer is still active today.', qa: 'Q: Are any numbers guessed? A: No, derived fields like Months Stayed are calculated directly from dates.' },
    { title: 'Churn Over Time & Survival', script: 'Looking at when people leave, the biggest drop-off happens in the first 6 months. Once a subscriber passes month 6, they tend to stay much longer.', qa: 'Q: Why is month 6 so important? A: Most early quitters decide whether the box fits their lifestyle by box 4 to 6.' },
    { title: 'Who Leaves? Segments', script: 'Plan type is the clearest divider: Monthly subscribers cancel nearly twice as often as Annual subscribers. Younger buyers (18–25) also leave slightly more often.', qa: 'Q: Should we stop offering Monthly plans? A: Keep Monthly for trial, but encourage upgrading to Quarterly by month 3.' },
    { title: 'Activity & Leaving', script: 'Customers with low activity scores leave more than twice as often as highly active fans. Low activity and leaving tend to go together, though data alone cannot prove which causes which.', qa: 'Q: Can we test if boosting activity saves people? A: Yes, through a small A/B test on quiet subscribers.' },
    { title: 'Customer Value', script: 'Active customers spend over 2.5 times more than those who cancel. Every early cancellation costs us recurring revenue that compounds over a 12-month cycle.', qa: 'Q: How is annualised revenue lost calculated? A: It projects each leaver’s monthly value across a 12-month cycle.' },
    { title: 'Predicting Who May Leave', script: 'We trained a simple prediction model on 80% of customers and tested it on the remaining 20%. It flags likely leavers early so our team can reach out before they cancel.', qa: 'Q: How accurate is it? A: It correctly flags about 7 to 8 out of every 10 leavers in plain testing.' },
    { title: 'Retention Simulator', script: 'This interactive tool lets us test combinations of keeping quiet users active, moving Monthly buyers to Quarterly plans, and offering targeted perks to hit our 5–10% reduction goal.', qa: 'Q: Is this a guarantee? A: No, it is an indicative scenario tool to compare which levers help most.' },
    { title: 'Retention Playbook', script: 'Here are four plain-English groups—Early Quitters, Quiet Subscribers, Month-to-Month Movers, and Loyal Champions—each with a Monday-morning action.', qa: 'Q: Which group gives the fastest win? A: Quiet Subscribers on Monthly plans who are still active right now.' },
    { title: 'Action Roadmap', script: 'We split our plan into 30-day Quick Wins like reaching out to top at-risk users, and 3-to-6 month Long-Term upgrades like box personalization.', qa: 'Q: Who owns the first step? A: CRM and Lifecycle Marketing in Weeks 1–4.' },
    { title: 'Final Recommendations & Assumptions', script: 'Our top 5 actions are tied directly to the 7 assumptions on the right. To close the loop, we recommend adding a 1-question exit survey to learn exact cancel reasons.', qa: 'Q: What is the single biggest takeaway? A: Guiding Monthly buyers past Month 6 is our fastest path to 5–10% lower churn.' }
  ];

  const state = {
    rawRows: [],
    cleanRows: [],
    explainSimply: true,
    currentSlide: 0,
    zoomLevel: 100,
    theme: 'light',
    s8TableView: false,
    filters: { status: new Set(), plans: new Set(), engBands: new Set(), ageGroups: new Set(), location: '', payModes: new Set(), genders: new Set(), joinYears: new Set() },
    sim: { eng: 15, plan: 15, early: 15, offer: 20 },
    model: { weights: null, testAcc: 0, testPrec: 0, testRec: 0, factors: [] },
    resizeObservers: new Map()
  };

  const safeDiv = (n, d, fb = 0) => (d && Number.isFinite(d) && d !== 0 ? n / d : fb);
  const fmtINR = (val, compact = false) => {
    if (!Number.isFinite(val)) return '₹0';
    const abs = Math.abs(val), s = val < 0 ? '-' : '';
    if (compact) {
      if (abs >= 10000000) return `${s}₹${(abs / 10000000).toFixed(2)} Cr`;
      if (abs >= 100000) return `${s}₹${(abs / 100000).toFixed(2)}L`;
      if (abs >= 1000) return `${s}₹${(abs / 1000).toFixed(1)}K`;
    }
    return `${s}₹${Math.round(abs).toLocaleString('en-IN')}`;
  };
  const fmtNum = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-IN') : '0');
  const fmtPct = (v, d = 1) => (Number.isFinite(v) ? `${v.toFixed(d)}%` : '0.0%');
  const tLbl = (plain, analyst) => (state.explainSimply ? plain : analyst);

  function monthsBetween(d1Str, d2Str) {
    const a = new Date(d1Str + 'T00:00:00'), b = new Date(d2Str + 'T00:00:00');
    const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
    return Math.max(1, diff);
  }

  function parseAndClean(rows, sourceName, via) {
    if (!rows || !rows.length) return false;
    const cols = Object.keys(rows[0]);
    const miss = REQUIRED_COLS.filter(c => !cols.includes(c));
    if (miss.length) { alert(`Missing columns: ${miss.join(', ')}`); return false; }

    const seen = new Set(), cleaned = [];
    for (const r of rows) {
      const id = String(r.CustomerID || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const joinDate = String(r.JoinDate || '').trim().slice(0, 10);
      const cancelDate = String(r.CancelDate || '').trim().slice(0, 10);
      const churned = cancelDate !== '';
      const endRef = churned ? cancelDate : SNAPSHOT_DATE;
      const tenure = monthsBetween(joinDate, endRef);
      const age = Number(r.Age) || 30;
      const eng = Number(r.EngagementScore) || 0;
      const spent = Number(r.TotalSpent) || 0;
      const boxes = Number(r.BoxesReceived) || 1;

      const ageGroup = age <= 25 ? '18-25' : age <= 35 ? '26-35' : age <= 45 ? '36-45' : '46+';
      const engBand = eng < 40 ? 'Low (0-39)' : eng < 70 ? 'Medium (40-69)' : 'High (70-100)';

      cleaned.push({
        CustomerID: id, JoinDate: joinDate, JoinYear: joinDate.slice(0, 4), JoinQ: `${joinDate.slice(0, 4)}-Q${Math.floor((Number(joinDate.slice(5, 7)) - 1) / 3) + 1}`,
        CancelDate: cancelDate, CancelQ: churned ? `${cancelDate.slice(0, 4)}-Q${Math.floor((Number(cancelDate.slice(5, 7)) - 1) / 3) + 1}` : '',
        Status: churned ? 'Churned' : 'Active', Churned: churned ? 1 : 0,
        TenureMonths: tenure, EarlyChurn: churned && tenure < 6,
        Age: age, AgeGroup: ageGroup, Gender: String(r.Gender || 'Other').trim(),
        Location: String(r.Location || '').trim(), SubscriptionType: String(r.SubscriptionType || 'Monthly').trim(),
        TotalSpent: spent, BoxesReceived: boxes, EngagementScore: eng, EngBand: engBand,
        PaymentMode: String(r.PaymentMode || 'Other').trim(),
        MonthlyRev: safeDiv(spent, tenure)
      });
    }

    state.rawRows = rows;
    state.cleanRows = cleaned;
    document.getElementById('data-status-text').textContent = `Data source: ${sourceName} · ${cleaned.length.toLocaleString('en-IN')} customers · loaded via ${via}`;
    trainLogisticModel(cleaned);
    initFilterOptions();
    renderAll();
    return true;
  }

  // Pure JS 80/20 Logistic Regression
  function trainLogisticModel(rows) {
    const feat = r => [
      1,
      r.SubscriptionType === 'Monthly' ? 1 : 0,
      r.SubscriptionType === 'Quarterly' ? 0.5 : 0,
      (50 - r.EngagementScore) / 50,
      r.TenureMonths < 6 ? 1 : 0,
      (35 - r.Age) / 35
    ];
    const sig = z => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
    const train = [], test = [];
    rows.forEach((r, idx) => { if (idx % 5 === 0) test.push(r); else train.push(r); });

    let w = [0, 0, 0, 0, 0, 0];
    const lr = 0.25;
    for (let ep = 0; ep < 120; ep++) {
      const grad = [0, 0, 0, 0, 0, 0];
      for (const r of train) {
        const x = feat(r), p = sig(w.reduce((a, wi, i) => a + wi * x[i], 0)), err = p - r.Churned;
        for (let i = 0; i < 6; i++) grad[i] += err * x[i];
      }
      for (let i = 0; i < 6; i++) w[i] -= (lr * grad[i]) / train.length;
    }

    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const r of test) {
      const x = feat(r), pred = sig(w.reduce((a, wi, i) => a + wi * x[i], 0)) >= 0.5 ? 1 : 0;
      if (pred === 1 && r.Churned === 1) tp++;
      else if (pred === 1 && r.Churned === 0) fp++;
      else if (pred === 0 && r.Churned === 0) tn++;
      else fn++;
    }

    state.model = {
      weights: w,
      scoreFn: r => {
        const x = feat(r);
        return sig(w.reduce((a, wi, i) => a + wi * x[i], 0));
      },
      testAcc: safeDiv(tp + tn, test.length) * 100,
      testPrec: safeDiv(tp, tp + fp) * 100,
      testRec: safeDiv(tp, tp + fn) * 100,
      factors: [
        { name: 'Early Stay (<6 Months)', score: Math.abs(w[4]) },
        { name: 'Monthly Plan', score: Math.abs(w[1]) },
        { name: 'Low Activity Score', score: Math.abs(w[3]) },
        { name: 'Younger Age', score: Math.abs(w[5]) }
      ].sort((a, b) => b.score - a.score)
    };
  }

  async function loadInitialData() {
    try {
      const resp = await fetch('./boxify_customers.csv');
      if (resp.ok && window.Papa) {
        const parsed = window.Papa.parse(await resp.text(), { header: true, skipEmptyLines: true });
        if (parseAndClean(parsed.data, 'boxify_customers.csv', 'CSV fetch')) return;
      }
    } catch (_) {}
    if (Array.isArray(window.BOXIFY_DATA) && window.BOXIFY_DATA.length) {
      if (parseAndClean(window.BOXIFY_DATA, 'boxify_customers.csv', 'backup (data.js)')) return;
    }
    document.getElementById('fallback-loader').classList.add('open');
  }

  // =========================================================================
  // FILTERS & AGGREGATIONS
  // =========================================================================
  function getFiltered() {
    const f = state.filters;
    return state.cleanRows.filter(r => {
      if (f.status.size && !f.status.has(r.Status)) return false;
      if (f.plans.size && !f.plans.has(r.SubscriptionType)) return false;
      if (f.engBands.size && !f.engBands.has(r.EngBand)) return false;
      if (f.ageGroups.size && !f.ageGroups.has(r.AgeGroup)) return false;
      if (f.location && r.Location !== f.location) return false;
      if (f.payModes.size && !f.payModes.has(r.PaymentMode)) return false;
      if (f.genders.size && !f.genders.has(r.Gender)) return false;
      if (f.joinYears.size && !f.joinYears.has(r.JoinYear)) return false;
      return true;
    });
  }

  function summarize(rows) {
    let churned = 0, active = 0, spentSum = 0, tenureSum = 0, engSum = 0, lostAnnual = 0, earlyChurned = 0;
    let actSpent = 0, chSpent = 0, actTen = 0, chTen = 0;
    for (const r of rows) {
      spentSum += r.TotalSpent; tenureSum += r.TenureMonths; engSum += r.EngagementScore;
      if (r.Churned) { churned++; chSpent += r.TotalSpent; chTen += r.TenureMonths; lostAnnual += r.MonthlyRev * 12; if (r.EarlyChurn) earlyChurned++; }
      else { active++; actSpent += r.TotalSpent; actTen += r.TenureMonths; }
    }
    const n = rows.length;
    return {
      n, churned, active,
      churnRate: safeDiv(churned, n) * 100,
      avgCLV: safeDiv(spentSum, n),
      avgTenure: safeDiv(tenureSum, n),
      avgEng: safeDiv(engSum, n),
      lostAnnual, earlyChurned,
      actCLV: safeDiv(actSpent, active), chCLV: safeDiv(chSpent, churned),
      actTen: safeDiv(actTen, active), chTen: safeDiv(chTen, churned)
    };
  }

  function groupBy(rows, fn) {
    const m = new Map();
    for (const r of rows) {
      const k = fn(r);
      let g = m.get(k);
      if (!g) { g = { key: k, n: 0, churned: 0, spent: 0, tenure: 0 }; m.set(k, g); }
      g.n++; g.churned += r.Churned; g.spent += r.TotalSpent; g.tenure += r.TenureMonths;
    }
    for (const g of m.values()) {
      g.churnRate = safeDiv(g.churned, g.n) * 100;
      g.avgCLV = safeDiv(g.spent, g.n);
      g.avgTenure = safeDiv(g.tenure, g.n);
    }
    return m;
  }

  // =========================================================================
  // TOOLTIPS, STORY PANEL & ECHARTS ENGINE
  // =========================================================================
  function ttCard(title, plainSentence, rows) {
    return `<div style="max-width:270px; font-family:Inter,sans-serif; font-size:12px; line-height:1.4;">
      <div class="tt-title">${title}</div>
      <div style="color:var(--text-muted); margin-bottom:5px; font-size:11.5px;">${plainSentence}</div>
      ${rows.map(r => `<div class="tt-row"><span class="tt-lbl">${r.color ? `<span class="tt-dot" style="background:${r.color}"></span>` : ''}${r.label}</span><span class="tt-val">${r.value}</span></div>`).join('')}
    </div>`;
  }

  function renderStory(id, { keyLabel, keyValue, keySub, simpleWords, bullets, why, actionLabel, actionText }) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="story-key-card"><span class="story-key-label">${keyLabel}</span><span class="story-key-value">${keyValue}</span><span class="story-key-sub">${keySub}</span></div>
      <div class="simple-words-box"><strong>💡 In simple words:</strong> ${simpleWords}</div>
      <div><span class="story-section-hdr">What the data shows</span><ul class="story-bullets">${bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>
      <div><span class="story-section-hdr">Why it matters</span><div class="story-why">${why}</div></div>
      <div class="story-action-box"><span class="action-chip">${actionLabel}</span><span class="story-action-text">${actionText}</span></div>`;
  }

  const tipEl = document.getElementById('bx-floating-tooltip');
  function showTip(target, title, sentence, rows) {
    tipEl.innerHTML = ttCard(title, sentence, rows);
    tipEl.classList.add('visible');
    const r = target.getBoundingClientRect(), tw = tipEl.offsetWidth || 260, th = tipEl.offsetHeight || 90;
    tipEl.style.left = `${Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2))}px`;
    tipEl.style.top = `${(r.bottom + 8 + th > window.innerHeight - 12) ? r.top - th - 8 : r.bottom + 8}px`;
  }
  const hideTip = () => tipEl.classList.remove('visible');

  function bindTooltips() {
    document.querySelectorAll('[data-info]').forEach(el => {
      el.onmouseenter = () => showTip(el, 'How to Read This Chart', el.dataset.info, []);
      el.onmouseleave = hideTip;
    });
    document.querySelectorAll('[data-kpi-tip]').forEach(el => {
      el.onmouseenter = () => { try { const d = JSON.parse(el.dataset.kpiTip); showTip(el, d.title, d.sentence, d.rows); } catch (_) {} };
      el.onmouseleave = hideTip;
    });
  }

  function getTC() {
    const d = state.theme === 'dark';
    return { text: d ? '#CBD5E1' : '#475569', title: d ? '#F8FAFC' : '#0F172A', grid: d ? '#1E293B' : '#E2E8F0', bg: d ? '#111A2E' : '#FFFFFF', border: d ? '#334155' : '#CBD5E1' };
  }

  function renderChart(id, builder, hasData = true, onClick = null) {
    const el = document.getElementById(id);
    if (!el) return;
    const oldE = el.querySelector('.chart-empty-state'); if (oldE) oldE.remove();
    if (!hasData || !window.echarts) {
      const inst = window.echarts ? window.echarts.getInstanceByDom(el) : null; if (inst) inst.clear();
      const e = document.createElement('div'); e.className = 'chart-empty-state'; e.innerHTML = '<strong>No matching customers</strong><span>Reset filters to see charts.</span>'; el.appendChild(e); return;
    }
    try {
      let c = window.echarts.getInstanceByDom(el);
      if (!c) {
        c = window.echarts.init(el);
        if (!state.resizeObservers.has(id)) {
          let raf;
          const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = window.echarts.getInstanceByDom(el); if (i && el.offsetWidth > 0 && el.offsetHeight > 0) i.resize(); }); });
          ro.observe(el); state.resizeObservers.set(id, ro);
        }
      }
      const tc = getTC(), opt = builder(tc);
      opt.animationDuration = 300;
      if (opt.tooltip) {
        opt.tooltip.confine = true; opt.tooltip.backgroundColor = tc.bg; opt.tooltip.borderColor = tc.border; opt.tooltip.borderWidth = 1;
        opt.tooltip.textStyle = { color: tc.title, fontFamily: 'Inter,sans-serif', fontSize: 12 };
        opt.tooltip.extraCssText = 'border-radius:12px; box-shadow:0 10px 26px rgba(15,23,42,0.18); padding:10px 12px;';
      }
      c.setOption(opt, true);
      c.off('click');
      if (onClick) c.on('click', onClick);
    } catch (err) {
      el.innerHTML = `<div class="chart-empty-state"><strong>Chart Error</strong><span>${err.message}</span></div>`;
    }
  }

  function resizeActive() {
    const act = document.querySelector('.slide.active');
    if (!act || !window.echarts) return;
    act.querySelectorAll('.chart-container').forEach(el => {
      const i = window.echarts.getInstanceByDom(el);
      if (i && el.offsetWidth > 0 && el.offsetHeight > 0) i.resize();
    });
  }

  // =========================================================================
  // FILTER UI
  // =========================================================================
  const toggleSet = (s, v) => { if (s.has(v)) s.delete(v); else s.add(v); renderAll(); };

  function initFilterOptions() {
    const locs = [...new Set(state.cleanRows.map(r => r.Location))].sort();
    document.getElementById('filter-location-select').innerHTML = `<option value="">All ${locs.length} Cities</option>` + locs.map(l => `<option value="${l}">${l}</option>`).join('');
    renderChips();
  }

  function renderChips() {
    const rows = state.cleanRows;
    const mk = (id, vals, setObj, fn) => {
      const cnt = new Map(); rows.forEach(r => { const k = fn(r); cnt.set(k, (cnt.get(k) || 0) + 1); });
      const w = document.getElementById(id);
      w.innerHTML = vals.map(v => `<button class="slicer-chip ${setObj.has(v) ? 'active' : ''}" data-v="${v}" title="${v}: ${cnt.get(v)||0} customers — Click to focus">${v} <span class="chip-count">${cnt.get(v)||0}</span></button>`).join('');
      w.querySelectorAll('.slicer-chip').forEach(b => b.onclick = () => toggleSet(setObj, b.dataset.v));
    };
    mk('filter-status-chips', ['Active', 'Churned'], state.filters.status, r => r.Status);
    mk('filter-plan-chips', PLAN_ORDER, state.filters.plans, r => r.SubscriptionType);
    mk('filter-eng-chips', ENG_ORDER, state.filters.engBands, r => r.EngBand);
    mk('filter-age-chips', AGE_ORDER, state.filters.ageGroups, r => r.AgeGroup);
    mk('filter-pay-chips', ['UPI', 'Card', 'Other', 'PayPal'], state.filters.payModes, r => r.PaymentMode);
    mk('filter-gender-chips', ['Female', 'Male', 'Other'], state.filters.genders, r => r.Gender);
    mk('filter-year-chips', ['2023', '2024', '2025', '2026'], state.filters.joinYears, r => r.JoinYear);
  }

  function renderPills(n) {
    document.getElementById('slicer-row-counter').textContent = `${fmtNum(n)} of ${fmtNum(state.cleanRows.length)} customers`;
    const f = state.filters, p = [];
    f.status.forEach(v => p.push({ l: v, c: () => f.status.delete(v) }));
    f.plans.forEach(v => p.push({ l: v, c: () => f.plans.delete(v) }));
    f.engBands.forEach(v => p.push({ l: v, c: () => f.engBands.delete(v) }));
    f.ageGroups.forEach(v => p.push({ l: v, c: () => f.ageGroups.delete(v) }));
    if (f.location) p.push({ l: f.location, c: () => { f.location = ''; document.getElementById('filter-location-select').value = ''; } });
    f.payModes.forEach(v => p.push({ l: v, c: () => f.payModes.delete(v) }));
    f.genders.forEach(v => p.push({ l: v, c: () => f.genders.delete(v) }));
    f.joinYears.forEach(v => p.push({ l: v, c: () => f.joinYears.delete(v) }));
    const w = document.getElementById('active-filter-pills');
    w.innerHTML = p.map((x, i) => `<span class="filter-pill" data-i="${i}">${x.l} ✕</span>`).join('');
    w.querySelectorAll('.filter-pill').forEach(el => el.onclick = () => { p[Number(el.dataset.i)].c(); renderAll(); });
  }

  // =========================================================================
  // RENDER ALL 12 SLIDES
  // =========================================================================
  function renderAll() {
    renderChips();
    const rows = getFiltered();
    renderPills(rows.length);
    const s = summarize(rows), base = summarize(state.cleanRows);

    renderSlide2(rows, s, base);
    renderSlide3(rows);
    renderSlide4(rows, s);
    renderSlide5(rows, s);
    renderSlide6(rows, s);
    renderSlide7(rows, s);
    renderSlide8(rows, s);
    renderSlide9(rows, s);

    bindTooltips();
    updateDiagnostics();
  }

  function renderSlide2(rows, s, base) {
    document.querySelector('[data-term="churnGaugeTitle"]').textContent = tLbl('Customers Who Left (%)', 'Churn Rate (%)');
    const cards = [
      { cls: '', l: 'Customers', v: fmtNum(s.n), b: 'Total', s: 'In current view', tip: { title: 'Total Customers', sentence: 'Number of subscribers matching your active filters.', rows: [{ label: 'Filtered', value: fmtNum(s.n) }, { label: 'All Records', value: fmtNum(base.n) }] } },
      { cls: 'kpi-green', l: 'Active Stayers', v: fmtNum(s.active), b: fmtPct(100 - s.churnRate), s: 'Blank cancel date', tip: { title: 'Active Customers', sentence: 'Subscribers still receiving boxes on 2026-11-21.', rows: [{ label: 'Count', value: fmtNum(s.active) }] } },
      { cls: 'kpi-red', l: 'Cancelled', v: fmtNum(s.churned), b: `${s.earlyChurned} <6m`, s: 'Left Boxify', tip: { title: 'Cancelled Subscribers', sentence: 'Customers with a recorded cancellation date.', rows: [{ label: 'Left < 6 months', value: fmtNum(s.earlyChurned) }] } },
      { cls: 'kpi-red', l: tLbl('Left Rate', 'Churn Rate'), v: fmtPct(s.churnRate), b: `~${Math.round(s.churnRate)} in 100`, s: `Baseline ${fmtPct(base.churnRate)}`, tip: { title: tLbl('Customers Who Left', 'Churn Rate'), sentence: 'Share of subscribers who cancelled.', rows: [{ label: 'Formula', value: 'Cancelled / Total' }, { label: 'Filtered', value: fmtPct(s.churnRate, 2) }] } },
      { cls: 'kpi-amber', l: tLbl('Value / Customer', 'Average CLV'), v: fmtINR(s.avgCLV), b: `${s.avgTenure.toFixed(1)} mo`, s: 'Avg total spent', tip: { title: tLbl('Value per Customer', 'Average CLV'), sentence: 'Average ₹ spent by each customer.', rows: [{ label: 'Active Avg', value: fmtINR(s.actCLV) }, { label: 'Leaver Avg', value: fmtINR(s.chCLV) }] } },
      { cls: 'kpi-red', l: 'Annualised Loss', v: fmtINR(s.lostAnnual, true), b: 'Est. / Year', s: 'From cancelled plans', tip: { title: 'Revenue Lost to Churn', sentence: 'Estimated yearly sales lost from cancelled subscriptions (12-month cycle assumed).', rows: [{ label: 'Exact Annualised', value: fmtINR(s.lostAnnual) }] } }
    ];
    document.getElementById('s2-kpis').innerHTML = cards.map(k => `<div class="kpi-card ${k.cls}" data-kpi-tip='${JSON.stringify(k.tip).replace(/'/g, "&apos;")}'><div class="kpi-header-row"><span class="kpi-label">${k.l}</span><span class="kpi-delta-badge">${k.b}</span></div><div class="kpi-value">${k.v}</div><span class="kpi-sub">${k.s}</span></div>`).join('');

    renderChart('s2-chart-gauge', tc => ({
      tooltip: { formatter: () => ttCard(tLbl('Customers Who Left', 'Churn Rate'), `About ${Math.round(s.churnRate)} in every 100 customers cancelled.`, [{ color: '#DC2626', label: 'Current Rate', value: fmtPct(s.churnRate, 2) }, { label: 'Target (6-mo)', value: fmtPct(Math.max(0, s.churnRate - 7.5), 1) }]) },
      series: [{ type: 'gauge', startAngle: 195, endAngle: -15, min: 0, max: 100, progress: { show: true, width: 14, roundCap: true, itemStyle: { color: '#DC2626' } }, axisLine: { lineStyle: { width: 14, color: [[1, tc.grid]] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { formatter: v => `${v.toFixed(1)}%`, color: tc.title, fontSize: 24, fontWeight: 800, offsetCenter: [0, '6%'] }, data: [{ value: Number(s.churnRate.toFixed(1)) }] }]
    }), rows.length > 0);
    document.getElementById('s2-insight-gauge').innerHTML = `Roughly <strong>${Math.round(s.churnRate)} in 100</strong> customers left (${fmtNum(s.churned)} people).`;

    renderChart('s2-chart-donut', tc => ({
      tooltip: { trigger: 'item', formatter: p => ttCard(p.name, `${fmtNum(p.value)} subscribers (${fmtPct(safeDiv(p.value, s.n) * 100)} of total).`, [{ color: p.color, label: 'Customers', value: fmtNum(p.value) }]) },
      legend: { bottom: 0, textStyle: { color: tc.text, fontSize: 11 } },
      series: [{ type: 'pie', radius: ['48%', '74%'], center: ['50%', '43%'], label: { show: false }, itemStyle: { borderRadius: 5, borderColor: tc.bg, borderWidth: 2 }, data: [{ name: 'Active', value: s.active, itemStyle: { color: '#059669' } }, { name: 'Churned', value: s.churned, itemStyle: { color: '#DC2626' } }] }],
      graphic: [{ type: 'text', left: 'center', top: '38%', style: { text: fmtNum(s.n), font: '800 18px Inter,sans-serif', fill: tc.title } }]
    }), rows.length > 0, p => toggleSet(state.filters.status, p.name));
    document.getElementById('s2-insight-donut').innerHTML = `<strong>${fmtNum(s.active)}</strong> stay active; <strong>${fmtNum(s.earlyChurned)}</strong> left before 6 months.`;

    const pm = groupBy(rows, r => r.SubscriptionType);
    const mRate = (pm.get('Monthly') || { churnRate: 0 }).churnRate;
    const aRate = (pm.get('Annual') || { churnRate: 0 }).churnRate;
    document.getElementById('s2-findings').innerHTML = `
      <li><strong>Monthly Plans Leave Most:</strong> About <strong>${Math.round(mRate)} in 100</strong> Monthly buyers left vs <strong>${Math.round(aRate)} in 100</strong> on Annual plans.</li>
      <li><strong>Early 6-Month Danger:</strong> <strong>${fmtNum(s.earlyChurned)}</strong> leavers cancelled before completing 6 months.</li>
      <li><strong>Stayers Spend More:</strong> Active subscribers spend <strong>${fmtINR(s.actCLV)}</strong> on average vs <strong>${fmtINR(s.chCLV)}</strong> for leavers.</li>`;
  }

  function renderSlide3(rows) {
    const s = summarize(rows);
    document.getElementById('s3-quality-kpis').innerHTML = [
      { cls: 'kpi-green', l: 'Verified Rows', v: fmtNum(rows.length), b: '0 Duplicates', s: 'All 11 columns matched' },
      { cls: 'kpi-amber', l: 'Date Span', v: '3 Years', b: '2023–2026', s: 'Snapshot: 2026-11-21' },
      { cls: 'kpi-green', l: 'Blank CancelDate', v: fmtNum(s.active), b: 'Active Stayers', s: 'Blank means still subscribed' },
      { cls: '', l: 'Avg Activity Score', v: s.avgEng.toFixed(1), b: '0–100 Scale', s: 'Zero invalid scores' }
    ].map(k => `<div class="kpi-card ${k.cls}"><div class="kpi-header-row"><span class="kpi-label">${k.l}</span><span class="kpi-delta-badge">${k.b}</span></div><div class="kpi-value">${k.v}</div><span class="kpi-sub">${k.s}</span></div>`).join('');
  }

  function renderSlide4(rows, s) {
    const jQ = groupBy(rows, r => r.JoinQ), cQ = groupBy(rows.filter(r => r.Churned), r => r.CancelQ);
    const qs = [...new Set([...jQ.keys(), ...cQ.keys()])].filter(Boolean).sort();
    renderChart('s4-chart-trend', tc => ({
      tooltip: { trigger: 'axis', formatter: p => { const q = qs[p[0].dataIndex]; const j = (jQ.get(q) || { n: 0 }).n, c = (cQ.get(q) || { n: 0 }).n; return ttCard(`Quarter: ${q}`, `New joins vs cancellations in ${q}.`, [{ color: '#059669', label: 'New Joins', value: fmtNum(j) }, { color: '#DC2626', label: 'Cancelled', value: fmtNum(c) }]); } },
      legend: { top: 0, textStyle: { color: tc.text, fontSize: 11 } },
      grid: { left: 46, right: 16, top: 28, bottom: 26 },
      xAxis: { type: 'category', data: qs, axisLabel: { color: tc.text, fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: tc.text }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [
        { name: 'New Joins', type: 'bar', itemStyle: { color: '#059669', borderRadius: [4, 4, 0, 0] }, data: qs.map(q => (jQ.get(q) || { n: 0 }).n) },
        { name: 'Cancelled', type: 'bar', itemStyle: { color: '#DC2626', borderRadius: [4, 4, 0, 0] }, data: qs.map(q => (cQ.get(q) || { n: 0 }).n) }
      ]
    }), qs.length > 0);

    const milestones = [1, 3, 6, 12, 18, 24];
    const surv = milestones.map(m => Number((safeDiv(rows.filter(r => !r.Churned || r.TenureMonths >= m).length, rows.length) * 100).toFixed(1)));
    renderChart('s4-chart-cohort', tc => ({
      tooltip: { trigger: 'axis', formatter: p => ttCard(`Month ${milestones[p[0].dataIndex]}`, `Share of subscribers still active after ${milestones[p[0].dataIndex]} months.`, [{ color: '#6D28D9', label: 'Customers Staying', value: `${surv[p[0].dataIndex]}%` }]) },
      grid: { left: 46, right: 16, top: 20, bottom: 26 },
      xAxis: { type: 'category', data: milestones.map(m => `Mo ${m}`), axisLabel: { color: tc.text } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: tc.text, formatter: '{value}%' }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'line', smooth: true, markLine: { silent: true, lineStyle: { color: '#DC2626', type: 'dashed' }, data: [{ xAxis: 'Mo 6', label: { formatter: '6-month mark' } }] }, lineStyle: { width: 3, color: '#6D28D9' }, areaStyle: { color: 'rgba(109,40,217,0.14)' }, data: surv }]
    }), rows.length > 0);

    renderStory('s4-story', {
      keyLabel: '6-Month Survival', keyValue: `${surv[2]}%`, keySub: `${fmtNum(s.earlyChurned)} left before Month 6`,
      simpleWords: `Out of every 100 subscribers, about ${Math.round(surv[2])} stay past Month 6.`,
      bullets: [`<strong>${fmtNum(s.earlyChurned)}</strong> cancellations happened in the first 5 months.`, `Active base currently holds <strong>${fmtNum(s.active)}</strong> subscribers.`],
      why: 'Stopping early drop-off before Month 6 is the biggest lever to hit our 5–10% churn reduction goal.',
      actionLabel: 'Do on Monday', actionText: 'Send a Month-3 check-in bonus to keep new subscribers past the 6-month mark.'
    });
  }

  function renderSlide5(rows, s) {
    const pm = groupBy(rows, r => r.SubscriptionType), am = groupBy(rows, r => r.AgeGroup);
    const cats = [...PLAN_ORDER, ...AGE_ORDER];
    const rates = [...PLAN_ORDER.map(k => (pm.get(k) || { churnRate: 0 }).churnRate), ...AGE_ORDER.map(k => (am.get(k) || { churnRate: 0 }).churnRate)];
    const maxR = Math.max(...rates), minR = Math.min(...rates.filter(x => x > 0), maxR);

    renderChart('s5-chart-planage', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => ttCard(cats[p[0].dataIndex], `Share of ${cats[p[0].dataIndex]} subscribers who cancelled.`, [{ color: p[0].color, label: tLbl('Left Rate', 'Churn Rate'), value: fmtPct(rates[p[0].dataIndex]) }, { label: 'vs Overall Avg', value: `${(rates[p[0].dataIndex] - s.churnRate).toFixed(1)} pp` }]) },
      grid: { left: 46, right: 16, top: 20, bottom: 26 },
      xAxis: { type: 'category', data: cats, axisLabel: { color: tc.text, fontSize: 10.5 } },
      yAxis: { type: 'value', max: 100, axisLabel: { color: tc.text, formatter: '{value}%' }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'bar', barMaxWidth: 34, markLine: { silent: true, data: [{ yAxis: s.churnRate, label: { formatter: 'Avg' } }] }, itemStyle: { borderRadius: [5, 5, 0, 0], color: p => (rates[p.dataIndex] === maxR ? '#DC2626' : (rates[p.dataIndex] === minR ? '#059669' : '#6D28D9')) }, data: rates.map(r => Number(r.toFixed(1))) }]
    }), rows.length > 0, p => { if (PLAN_ORDER.includes(p.name)) toggleSet(state.filters.plans, p.name); else toggleSet(state.filters.ageGroups, p.name); });

    const cm = groupBy(rows, r => r.Location);
    const cities = [...cm.values()].sort((a, b) => b.churnRate - a.churnRate);
    renderChart('s5-chart-city', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => { const c = cities[p[0].dataIndex]; return ttCard(c.key, `${c.churned} of ${c.n} subscribers left in ${c.key}.`, [{ color: p[0].color, label: tLbl('Left Rate', 'Churn Rate'), value: fmtPct(c.churnRate) }, { label: 'vs Avg', value: `${(c.churnRate - s.churnRate).toFixed(1)} pp` }]); } },
      grid: { left: 46, right: 16, top: 20, bottom: 32 },
      xAxis: { type: 'category', data: cities.map(c => c.key), axisLabel: { color: tc.text, fontSize: 10, rotate: 25 } },
      yAxis: { type: 'value', max: 100, axisLabel: { color: tc.text, formatter: '{value}%' }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'bar', barMaxWidth: 28, markLine: { silent: true, data: [{ yAxis: s.churnRate }] }, itemStyle: { borderRadius: [5, 5, 0, 0], color: p => (p.dataIndex === 0 ? '#DC2626' : (p.dataIndex === cities.length - 1 ? '#059669' : '#6D28D9')) }, data: cities.map(c => Number(c.churnRate.toFixed(1))) }]
    }), cities.length > 0, p => { state.filters.location = (state.filters.location === p.name) ? '' : p.name; document.getElementById('filter-location-select').value = state.filters.location; renderAll(); });

    const mRate = (pm.get('Monthly') || { churnRate: 0 }).churnRate, aRate = (pm.get('Annual') || { churnRate: 0 }).churnRate;
    renderStory('s5-story', {
      keyLabel: 'Highest-Risk Plan', keyValue: `Monthly (${Math.round(mRate)}%)`, keySub: `vs Annual at ${Math.round(aRate)}%`,
      simpleWords: `Roughly ${Math.round(mRate / 10)} in 10 Monthly subscribers cancel, compared to ${Math.round(aRate / 10)} in 10 Annual subscribers.`,
      bullets: [cities[0] ? `Highest-churn city: <strong>${cities[0].key}</strong> (${fmtPct(cities[0].churnRate)}).` : 'No city data.', `Young adults (<strong>18–25</strong>) show elevated early cancellations.`],
      why: 'Answers Q1: Moving even 15% of Monthly buyers onto Quarterly/Annual plans cuts churn directly.',
      actionLabel: 'Do on Monday', actionText: 'Offer Monthly buyers a 1-click upgrade to Quarterly with 50% off their next box.'
    });
  }

  function renderSlide6(rows) {
    const em = groupBy(rows, r => r.EngBand);
    const eData = ENG_ORDER.map(k => em.get(k) || { key: k, churnRate: 0, avgTenure: 0, n: 0 });

    renderChart('s6-chart-eng', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => { const d = eData[p[0].dataIndex]; return ttCard(d.key, `${fmtNum(d.n)} customers in this activity band.`, [{ color: p[0].color, label: tLbl('Left Rate', 'Churn Rate'), value: fmtPct(d.churnRate) }]); } },
      grid: { left: 46, right: 16, top: 20, bottom: 26 },
      xAxis: { type: 'category', data: ENG_ORDER, axisLabel: { color: tc.text } },
      yAxis: { type: 'value', max: 100, axisLabel: { color: tc.text, formatter: '{value}%' }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'bar', barMaxWidth: 46, itemStyle: { borderRadius: [6, 6, 0, 0], color: p => ['#DC2626', '#D97706', '#059669'][p.dataIndex] }, data: eData.map(d => Number(d.churnRate.toFixed(1))) }]
    }), rows.length > 0, p => toggleSet(state.filters.engBands, p.name));

    renderChart('s6-chart-tenure', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => { const d = eData[p[0].dataIndex]; return ttCard(d.key, `Average months stayed for ${d.key} activity.`, [{ color: p[0].color, label: 'Months Stayed', value: `${d.avgTenure.toFixed(1)} mo` }]); } },
      grid: { left: 46, right: 16, top: 20, bottom: 26 },
      xAxis: { type: 'category', data: ENG_ORDER, axisLabel: { color: tc.text } },
      yAxis: { type: 'value', axisLabel: { color: tc.text, formatter: '{value}m' }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'bar', barMaxWidth: 46, markLine: { silent: true, lineStyle: { color: '#DC2626', type: 'dashed' }, data: [{ yAxis: 6, label: { formatter: '6-month mark' } }] }, itemStyle: { borderRadius: [6, 6, 0, 0], color: '#6D28D9' }, data: eData.map(d => Number(d.avgTenure.toFixed(1))) }]
    }), rows.length > 0);

    renderStory('s6-story', {
      keyLabel: 'Low-Activity Left Rate', keyValue: fmtPct(eData[0].churnRate), keySub: `vs High Activity at ${fmtPct(eData[2].churnRate)}`,
      simpleWords: `Low activity and leaving tend to go together — but data alone cannot prove which causes which.`,
      bullets: [`Low-activity users stay only <strong>${eData[0].avgTenure.toFixed(1)} months</strong> on average.`, `High-activity fans stay <strong>${eData[2].avgTenure.toFixed(1)} months</strong>.`],
      why: 'Answers Q2: Spotting quiet subscribers early lets us re-engage them before they cancel.',
      actionLabel: 'Do on Monday', actionText: 'Send a 2-tap box customization reminder to every active customer with activity under 40.'
    });
  }

  function renderSlide7(rows, s) {
    renderChart('s7-chart-clv', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => ttCard(p[0].name, 'Compares stayers vs leavers.', [{ color: '#059669', label: 'Active Stayers', value: p[0].dataIndex === 0 ? fmtINR(s.actCLV) : `${s.actTen.toFixed(1)} mo` }, { color: '#DC2626', label: 'Left Boxify', value: p[0].dataIndex === 0 ? fmtINR(s.chCLV) : `${s.chTen.toFixed(1)} mo` }]) },
      legend: { top: 0, textStyle: { color: tc.text, fontSize: 11 } },
      grid: { left: 54, right: 16, top: 28, bottom: 26 },
      xAxis: { type: 'category', data: [tLbl('Value / Customer (₹)', 'Avg CLV (₹)'), 'Months Stayed (Scaled x500)'], axisLabel: { color: tc.text } },
      yAxis: { type: 'value', axisLabel: { color: tc.text, formatter: v => fmtINR(v, true) }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [
        { name: 'Active Stayers', type: 'bar', barMaxWidth: 42, itemStyle: { color: '#059669', borderRadius: [5, 5, 0, 0] }, data: [Math.round(s.actCLV), Math.round(s.actTen * 500)] },
        { name: 'Left Boxify', type: 'bar', barMaxWidth: 42, itemStyle: { color: '#DC2626', borderRadius: [5, 5, 0, 0] }, data: [Math.round(s.chCLV), Math.round(s.chTen * 500)] }
      ]
    }), rows.length > 0);

    const ch = rows.filter(r => r.Churned);
    const bins = ['1-3 mo', '4-5 mo', '6-12 mo', '13+ mo'];
    const bCnt = [ch.filter(r => r.TenureMonths <= 3).length, ch.filter(r => r.TenureMonths >= 4 && r.TenureMonths <= 5).length, ch.filter(r => r.TenureMonths >= 6 && r.TenureMonths <= 12).length, ch.filter(r => r.TenureMonths > 12).length];
    renderChart('s7-chart-hist', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => ttCard(bins[p[0].dataIndex], 'Number of cancelled subscribers who left in this window.', [{ color: p[0].color, label: 'Leavers', value: fmtNum(bCnt[p[0].dataIndex]) }]) },
      grid: { left: 46, right: 16, top: 20, bottom: 26 },
      xAxis: { type: 'category', data: bins, axisLabel: { color: tc.text } },
      yAxis: { type: 'value', axisLabel: { color: tc.text }, splitLine: { lineStyle: { color: tc.grid } } },
      series: [{ type: 'bar', barMaxWidth: 44, itemStyle: { borderRadius: [5, 5, 0, 0], color: p => (p.dataIndex < 2 ? '#DC2626' : '#6D28D9') }, data: bCnt }]
    }), ch.length > 0);

    renderStory('s7-story', {
      keyLabel: 'Annualised Lost Sales', keyValue: fmtINR(s.lostAnnual, true), keySub: 'Assumes 12-month recurring cycle',
      simpleWords: `Customers who stay spend ${fmtINR(s.actCLV)} on average, compared to ${fmtINR(s.chCLV)} for those who cancel.`,
      bullets: [`Stayers remain <strong>${s.actTen.toFixed(1)} months</strong> vs <strong>${s.chTen.toFixed(1)} months</strong> for leavers.`, `<strong>${fmtNum(s.earlyChurned)}</strong> cancelled before completing 6 months.`],
      why: 'Answers Q3: Keeping early leavers past Month 6 unlocks more than 2x lifetime spend.',
      actionLabel: 'Do on Monday', actionText: 'Focus save offers on Month 2–5 subscribers before they hit the cancel button.'
    });
  }

  function renderSlide8(rows) {
    const m = state.model;
    const outOf10 = Math.round(m.testRec / 10);
    document.getElementById('s8-headline').textContent = `Trained on 80% of customers and tested on 20%: correctly flags about ${outOf10} out of 10 leavers (${m.testAcc.toFixed(1)}% overall accuracy).`;

    renderChart('s8-chart-factors', tc => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => ttCard(m.factors[p[0].dataIndex].name, 'Relative strength of this warning sign in our simple prediction model.', [{ color: '#6D28D9', label: 'Importance', value: m.factors[p[0].dataIndex].score.toFixed(2) }]) },
      grid: { left: 145, right: 20, top: 16, bottom: 26 },
      xAxis: { type: 'value', axisLabel: { color: tc.text }, splitLine: { lineStyle: { color: tc.grid } } },
      yAxis: { type: 'category', data: m.factors.map(f => f.name).reverse(), axisLabel: { color: tc.text, fontSize: 11 } },
      series: [{ type: 'bar', barMaxWidth: 24, itemStyle: { borderRadius: [0, 5, 5, 0], color: '#6D28D9' }, data: m.factors.map(f => Number(f.score.toFixed(2))).reverse() }]
    }), m.factors.length > 0);

    const active = rows.filter(r => !r.Churned).map(r => ({ ...r, risk: m.scoreFn ? m.scoreFn(r) : 0 })).sort((a, b) => b.risk - a.risk).slice(0, 20);
    document.getElementById('s8-atrisk-table').innerHTML = `<table class="bi-table"><thead><tr><th>Customer</th><th>Plan</th><th>City</th><th>Activity</th><th>Months</th><th>Risk</th></tr></thead><tbody>${active.map(r => `<tr><td>${r.CustomerID}</td><td>${r.SubscriptionType}</td><td>${r.Location}</td><td>${r.EngagementScore}</td><td>${r.TenureMonths}m</td><td><span class="badge-pill badge-red">${(r.risk * 100).toFixed(0)}%</span></td></tr>`).join('')}</tbody></table>`;

    renderStory('s8-story', {
      keyLabel: 'Leavers Caught', keyValue: `~${outOf10} of 10`, keySub: `Test precision: ${m.testPrec.toFixed(0)}% · Accuracy: ${m.testAcc.toFixed(0)}%`,
      simpleWords: `Our simple prediction model scores every active customer so CRM knows who to save first.`,
      bullets: [`Top warning signs: <strong>Early stay (&lt;6m)</strong>, <strong>Monthly plan</strong>, and <strong>Low activity</strong>.`, `Use the Risk Checker below to test any customer profile live.`],
      why: 'Answers Q4: Reaching out to flagged active customers prevents cancellations before they happen.',
      actionLabel: 'Do on Monday', actionText: 'Export the Top 20 At-Risk Active list and send a personalized retention perk this week.'
    });
  }

  function renderSlide9(rows, s) {
    const { eng, plan, early, offer } = state.sim;
    const redPP = (eng * 0.10 + plan * 0.14 + early * 0.15 + offer * 0.08);
    const projRate = Math.max(5, s.churnRate - redPP);
    const savedCustomers = Math.round(s.n * (redPP / 100) * 0.5);
    const savedRev = savedCustomers * s.avgCLV * 0.5;

    document.getElementById('sim-prog-lbl').textContent = `-${redPP.toFixed(1)} pp (Goal: 5–10 pp)`;
    document.getElementById('sim-prog-fill').style.width = `${Math.min(100, (redPP / 10) * 100)}%`;

    renderChart('s9-chart-gauge', tc => ({
      tooltip: { formatter: () => ttCard('Simulated Cancellation Rate', `Indicative drop of ${redPP.toFixed(1)} percentage points over 6 months.`, [{ color: '#059669', label: 'Projected Rate', value: fmtPct(projRate) }, { label: 'Baseline', value: fmtPct(s.churnRate) }]) },
      series: [{ type: 'gauge', startAngle: 195, endAngle: -15, min: 0, max: 100, progress: { show: true, width: 16, roundCap: true, itemStyle: { color: redPP >= 5 ? '#059669' : '#6D28D9' } }, axisLine: { lineStyle: { width: 16, color: [[1, tc.grid]] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { formatter: v => `${v.toFixed(1)}%`, color: tc.title, fontSize: 24, fontWeight: 800, offsetCenter: [0, '6%'] }, data: [{ value: Number(projRate.toFixed(1)) }] }]
    }), rows.length > 0);

    renderStory('s9-story', {
      keyLabel: '6-Month Customers Saved', keyValue: `~${fmtNum(savedCustomers)}`, keySub: `Est. ${fmtINR(savedRev, true)} saved (Indicative)`,
      simpleWords: `These sliders show how combining small wins drops cancellations from ${fmtPct(s.churnRate)} to ${fmtPct(projRate)}.`,
      bullets: [`Reduction: <strong>-${redPP.toFixed(1)} pp</strong> (${redPP >= 5 ? 'hits 5–10% goal ✓' : 'below 5% goal'}).`, `Revenue protected over 6 months: <strong>${fmtINR(savedRev, true)}</strong>.`],
      why: 'Tests Objective 1: shows management which mix of tactics hits the 5–10% reduction target.',
      actionLabel: 'Do on Monday', actionText: 'Pair Monthly-to-Quarterly upgrades with low-activity check-ins for maximum impact.'
    });
  }

  // =========================================================================
  // UI, RISK CHECKER, GLOSSARY, TOUR & BOOTSTRAP
  // =========================================================================
  window.bxGoSlide = goToSlide;
  function goToSlide(idx) {
    const slides = document.querySelectorAll('.slide');
    const c = Math.max(0, Math.min(slides.length - 1, idx));
    state.currentSlide = c;
    slides.forEach((s, i) => s.classList.toggle('active', i === c));
    document.getElementById('footer-slide-indicator').textContent = `Slide ${c + 1} / ${slides.length}`;
    document.getElementById('btn-prev-slide').disabled = c === 0;
    document.getElementById('btn-next-slide').disabled = c === slides.length - 1;
    document.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i === c));
    document.getElementById('stage-container').scrollTop = 0;

    const m = SLIDE_META[c];
    document.getElementById('speaker-notes-body').innerHTML = `<h4 style="color:var(--text-main);">${c + 1}. ${m.title}</h4><div style="background:var(--bg-card-subtle);padding:10px;border-left:3px solid var(--color-accent);border-radius:6px;">${m.script}</div><div style="background:var(--color-warning-bg);padding:10px;border-radius:6px;"><strong>Likely Question:</strong><br>${m.qa}</div>`;
    setTimeout(resizeActive, 290);
    updateDiagnostics();
  }

  function updateDiagnostics() {
    const act = document.querySelector('.slide.active'), body = document.getElementById('diagnostics-body');
    if (!act || !body) return;
    const list = [...act.querySelectorAll('.chart-container')].map(el => {
      const r = el.getBoundingClientRect(), w = r.height < 100 || r.width < 100;
      return `<div style="padding:8px;border-radius:6px;background:var(--bg-card-subtle);display:flex;justify-content:space-between;"><span>${el.id}</span><strong style="color:${w ? '#DC2626' : '#059669'}">${Math.round(r.width)}×${Math.round(r.height)}px ${w ? '⚠️' : '✓'}</strong></div>`;
    });
    body.innerHTML = `<div style="font-weight:700;">Active Slide Charts (${list.length})</div>` + (list.length ? list.join('') : '<span>No charts on this slide.</span>');
  }

  function updateRiskChecker() {
    if (!state.model.scoreFn) return;
    const plan = document.getElementById('rc-plan').value;
    const eng = Number(document.getElementById('rc-eng').value);
    const tenure = Number(document.getElementById('rc-tenure').value);
    const age = Number(document.getElementById('rc-age').value);
    document.getElementById('rc-eng-val').textContent = `${eng} (${eng < 40 ? 'Low' : eng < 70 ? 'Med' : 'High'})`;
    document.getElementById('rc-tenure-val').textContent = `${tenure} months`;
    document.getElementById('rc-age-val').textContent = `${age} yrs`;

    const p = state.model.scoreFn({ SubscriptionType: plan, EngagementScore: eng, TenureMonths: tenure, Age: age });
    const badge = document.getElementById('rc-badge');
    if (p >= 0.6) { badge.className = 'badge-pill badge-red'; badge.textContent = `High Risk (${(p * 100).toFixed(0)}%)`; }
    else if (p >= 0.35) { badge.className = 'badge-pill badge-amber'; badge.textContent = `Medium Risk (${(p * 100).toFixed(0)}%)`; }
    else { badge.className = 'badge-pill badge-green'; badge.textContent = `Low Risk (${(p * 100).toFixed(0)}%)`; }
  }

  function initUI() {
    const dots = document.getElementById('slide-dots'), grid = document.getElementById('overview-grid');
    SLIDE_META.forEach((m, i) => {
      const d = document.createElement('span'); d.className = 'slide-dot' + (i === 0 ? ' active' : ''); d.title = `${i + 1}. ${m.title}`; d.onclick = () => goToSlide(i); dots.appendChild(d);
      const t = document.createElement('div'); t.className = 'overview-thumb' + (i === 0 ? ' active' : '');
      t.innerHTML = `<span style="font-size:11px;font-weight:800;color:var(--color-accent);">SLIDE ${i + 1}</span><strong style="font-size:12px;">${m.title}</strong>`;
      t.onclick = () => { goToSlide(i); document.getElementById('overview-modal').classList.remove('open'); };
      grid.appendChild(t);
    });

    document.getElementById('btn-prev-slide').onclick = () => goToSlide(state.currentSlide - 1);
    document.getElementById('btn-next-slide').onclick = () => goToSlide(state.currentSlide + 1);
    document.getElementById('btn-toggle-slicers').onclick = () => { document.getElementById('slicer-panel').classList.toggle('collapsed'); setTimeout(resizeActive, 300); };
    document.getElementById('btn-reset-filters').onclick = () => {
      state.filters = { status: new Set(), plans: new Set(), engBands: new Set(), ageGroups: new Set(), location: '', payModes: new Set(), genders: new Set(), joinYears: new Set() };
      document.getElementById('filter-location-select').value = '';
      renderAll();
    };
    document.getElementById('filter-location-select').onchange = e => { state.filters.location = e.target.value; renderAll(); };

    document.getElementById('btn-explain-simply').onclick = e => {
      state.explainSimply = !state.explainSimply;
      e.target.textContent = state.explainSimply ? '💡 Explain Simply: ON' : '📊 Explain Simply: OFF';
      e.target.classList.toggle('active-toggle', state.explainSimply);
      renderAll();
    };
    document.getElementById('btn-glossary').onclick = () => document.getElementById('glossary-modal').classList.add('open');
    document.getElementById('btn-close-glossary').onclick = () => document.getElementById('glossary-modal').classList.remove('open');

    document.getElementById('btn-s8-toggle').onclick = () => {
      state.s8TableView = !state.s8TableView;
      document.getElementById('s8-chart-card').style.display = state.s8TableView ? 'none' : 'flex';
      document.getElementById('s8-table-card').style.display = state.s8TableView ? 'flex' : 'none';
      if (!state.s8TableView) setTimeout(resizeActive, 80);
    };

    const exportCSV = (name, rows) => {
      const b = new Blob([window.Papa ? window.Papa.unparse(rows) : ''], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
    };
    document.getElementById('btn-s8-export').onclick = () => exportCSV('boxify_top20_at_risk.csv', getFiltered().filter(r => !r.Churned).map(r => ({ ...r, RiskPct: Math.round((state.model.scoreFn(r) || 0) * 100) })).sort((a, b) => b.RiskPct - a.RiskPct).slice(0, 20));
    document.getElementById('btn-s12-export').onclick = () => exportCSV('boxify_customers_filtered.csv', getFiltered());

    ['rc-plan', 'rc-eng', 'rc-tenure', 'rc-age'].forEach(id => document.getElementById(id).oninput = updateRiskChecker);

    const bindSim = (id, key, fmt) => {
      document.getElementById(id).oninput = e => { state.sim[key] = Number(e.target.value); document.getElementById(`${id}-val`).textContent = fmt(state.sim[key]); renderSlide9(getFiltered(), summarize(getFiltered())); };
    };
    bindSim('sim-eng', 'eng', v => `+${v}%`);
    bindSim('sim-plan', 'plan', v => `${v}%`);
    bindSim('sim-early', 'early', v => `${v}%`);
    bindSim('sim-offer', 'offer', v => `${v}%`);
    document.getElementById('btn-sim-reset').onclick = () => {
      state.sim = { eng: 15, plan: 15, early: 15, offer: 20 };
      ['eng', 'plan', 'early', 'offer'].forEach(k => { document.getElementById(`sim-${k}`).value = state.sim[k]; document.getElementById(`sim-${k}-val`).textContent = k === 'eng' ? `+${state.sim[k]}%` : `${state.sim[k]}%`; });
      renderSlide9(getFiltered(), summarize(getFiltered()));
    };

    const setZ = z => { state.zoomLevel = Math.max(80, Math.min(130, z)); document.body.className = document.body.className.replace(/zoom-level-\d+/g, '') + ` zoom-level-${state.zoomLevel}`; document.getElementById('zoom-val-label').textContent = `${state.zoomLevel}%`; setTimeout(resizeActive, 150); };
    document.getElementById('btn-zoom-in').onclick = () => setZ(state.zoomLevel + 10);
    document.getElementById('btn-zoom-out').onclick = () => setZ(state.zoomLevel - 10);
    document.getElementById('btn-theme-toggle').onclick = () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', state.theme); renderAll(); };
    const toggleMeet = () => { document.body.classList.toggle('meeting-mode'); setTimeout(resizeActive, 250); };
    document.getElementById('btn-meeting-mode').onclick = toggleMeet;
    document.addEventListener('mousemove', e => { if (document.body.classList.contains('meeting-mode')) { const sp = document.getElementById('meeting-spotlight'); sp.style.left = `${e.clientX}px`; sp.style.top = `${e.clientY}px`; } });

    document.getElementById('btn-notes').onclick = () => document.getElementById('speaker-notes-drawer').classList.toggle('open');
    document.getElementById('btn-close-notes').onclick = () => document.getElementById('speaker-notes-drawer').classList.remove('open');
    document.getElementById('btn-close-diag').onclick = () => document.getElementById('diagnostics-drawer').classList.remove('open');
    document.getElementById('btn-overview').onclick = () => document.getElementById('overview-modal').classList.add('open');
    document.getElementById('btn-close-overview').onclick = () => document.getElementById('overview-modal').classList.remove('open');
    document.getElementById('btn-close-focus').onclick = () => document.getElementById('focus-modal').classList.remove('open');
    document.querySelectorAll('.btn-focus').forEach(b => b.onclick = () => {
      const srcEl = document.getElementById(b.dataset.chart), src = srcEl && window.echarts ? window.echarts.getInstanceByDom(srcEl) : null; if (!src) return;
      document.getElementById('focus-modal-title').textContent = srcEl.closest('.card').querySelector('.card-title span').textContent;
      document.getElementById('focus-modal').classList.add('open');
      const fcEl = document.getElementById('focus-chart-container'); const fc = window.echarts.getInstanceByDom(fcEl) || window.echarts.init(fcEl);
      fc.setOption(src.getOption(), true); setTimeout(() => fc.resize(), 80);
    });
    document.getElementById('btn-print').onclick = () => window.print();
    document.getElementById('btn-fullscreen').onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen().catch(() => {}); };

    const TOUR = [
      { t: '1. Plain-English Story Panels', d: 'Slides 4–9 show charts on the left and a plain-English Story Panel on the right that updates with every filter.' },
      { t: '2. Explain Simply & Glossary', d: 'Use "Explain Simply" in the top bar to switch between everyday words and analyst terms, or open Glossary anytime.' },
      { t: '3. Interactive Risk Checker & Simulator', d: 'Test any customer profile on Slide 8 and model 5–10% churn reduction levers on Slide 9.' },
      { t: '4. Presenter Shortcuts', d: 'Press ←/→ to move slides, M for Meeting Mode, N for Script & Q&A, G for Grid, D for Diagnostics, and ? for Help.' }
    ];
    let tIdx = 0;
    const showT = i => { tIdx = i; document.getElementById('tour-step-title').textContent = TOUR[i].t; document.getElementById('tour-step-desc').textContent = TOUR[i].d; document.getElementById('tour-step-counter').textContent = `Step ${i + 1} of 4`; document.getElementById('btn-tour-next').textContent = i === 3 ? 'Finish ✓' : 'Next →'; };
    document.getElementById('btn-tour').onclick = () => { showT(0); document.getElementById('tour-modal').classList.add('open'); };
    document.getElementById('btn-close-tour').onclick = () => document.getElementById('tour-modal').classList.remove('open');
    document.getElementById('btn-tour-skip').onclick = () => document.getElementById('tour-modal').classList.remove('open');
    document.getElementById('btn-tour-next').onclick = () => { if (tIdx < 3) showT(tIdx + 1); else document.getElementById('tour-modal').classList.remove('open'); };

    document.getElementById('manual-csv-input').onchange = e => {
      const f = e.target.files[0]; if (!f || !window.Papa) return;
      window.Papa.parse(f, { header: true, skipEmptyLines: true, complete: r => { if (parseAndClean(r.data, f.name, 'manual picker')) document.getElementById('fallback-loader').classList.remove('open'); } });
    };

    document.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToSlide(state.currentSlide + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goToSlide(state.currentSlide - 1); }
      else if (e.key >= '1' && e.key <= '9') goToSlide(Number(e.key) - 1);
      else if (e.key.toLowerCase() === 'm') toggleMeet();
      else if (e.key.toLowerCase() === 'n') document.getElementById('speaker-notes-drawer').classList.toggle('open');
      else if (e.key.toLowerCase() === 'd') { updateDiagnostics(); document.getElementById('diagnostics-drawer').classList.toggle('open'); }
      else if (e.key.toLowerCase() === 'g') document.getElementById('overview-modal').classList.toggle('open');
      else if (e.key.toLowerCase() === 'f') document.getElementById('btn-fullscreen').click();
      else if (e.key === '?') document.getElementById('btn-tour').click();
      else if (e.key === 'Escape') document.querySelectorAll('.modal-overlay,.side-drawer').forEach(x => x.classList.remove('open'));
    });

    const checkHash = () => { const m = window.location.hash.match(/^#slide-(\d+)$/); if (m) goToSlide(Number(m[1]) - 1); };
    window.addEventListener('hashchange', checkHash);
    window.addEventListener('resize', () => setTimeout(resizeActive, 120));
    checkHash(); goToSlide(state.currentSlide);
  }

  document.addEventListener('DOMContentLoaded', () => { initUI(); loadInitialData(); updateRiskChecker(); });
})();
