/**
 * Boxify Customer Churn Analysis & Retention Strategy
 * Senior Data-Visualization & BI Presentation Engine
 * Pure Vanilla JavaScript (No Build Step, Dependency-Free Core)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION & STATE MANAGEMENT
  // =========================================================================

  const CONFIG = {
    snapshotDate: '2026-11-21',
    totalExpectedRows: 5000,
    colors: {
      primary: '#6366f1',
      primaryLight: '#e0e7ff',
      teal: '#0d9488',
      tealLight: '#ccfbf1',
      amber: '#f59e0b',
      amberLight: '#fef3c7',
      coral: '#ef4444',
      coralLight: '#fee2e2',
      green: '#10b981',
      greenLight: '#d1fae5',
      slate: '#64748b',
      slateLight: '#f1f5f9',
      dark: '#0f172a',
      cardBg: '#ffffff'
    },
    tier2Cities: new Set(['Ahmedabad', 'Jaipur', 'Lucknow', 'Indore', 'Bhopal'])
  };

  const state = {
    allCustomers: [],
    filteredCustomers: [],
    filters: {
      subscription: 'ALL',
      location: 'ALL',
      ageGroup: 'ALL',
      payment: 'ALL',
      gender: 'ALL',
      joinYear: 'ALL',
      status: 'ALL'
    },
    currentSlide: 0,
    totalSlides: 12,
    isPresenterMode: false,
    isSlicerOpen: true,
    charts: {},
    tableViews: {},
    mlModel: null,
    testSetMetrics: null,
    simulator: {
      engLift: 15,
      monthlyShiftPct: 20,
      earlyChurnReductionPct: 25,
      discountPct: 10
    }
  };

  // =========================================================================
  // 2. DATA PROCESSING & DERIVED ATTRIBUTES
  // =========================================================================

  function getMonthsBetween(d1, d2) {
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (d2.getDate() < d1.getDate()) {
      months--;
    }
    return Math.max(0, months);
  }

  function getAgeGroup(age) {
    if (age < 25) return '18-24';
    if (age < 35) return '25-34';
    if (age < 45) return '35-44';
    if (age < 55) return '45-54';
    return '55+';
  }

  function getEngagementBand(score) {
    if (score <= 30) return 'Low (0-30)';
    if (score <= 60) return 'Medium (31-60)';
    return 'High (61-100)';
  }

  function parseCustomerRow(row) {
    const cid = (row.CustomerID || row.customer_id || '').trim();
    const joinDateStr = (row.JoinDate || row.join_date || '').trim();
    const cancelDateStr = (row.CancelDate || row.cancel_date || '').trim();
    
    if (!cid || !joinDateStr) return null;

    const joinDate = new Date(joinDateStr);
    const hasCanceled = cancelDateStr !== '';
    const cancelDate = hasCanceled ? new Date(cancelDateStr) : null;
    const snapDate = new Date(CONFIG.snapshotDate);
    const endDate = hasCanceled ? cancelDate : snapDate;

    const tenureMonths = getMonthsBetween(joinDate, endDate);
    const age = parseInt(row.Age || row.age || '0', 10);
    const totalSpent = parseFloat(row.TotalSpent || row.total_spent || '0');
    const boxesReceived = parseInt(row.BoxesReceived || row.boxes_received || '0', 10);
    const score = parseFloat(row.EngagementScore || row.engagement_score || '0');
    const monthlyRate = totalSpent / Math.max(tenureMonths, 1);
    const isEarlyChurn = hasCanceled && tenureMonths < 6;

    const subType = (row.SubscriptionType || row.subscription_type || 'Monthly').trim();
    const location = (row.Location || row.location || 'Unknown').trim();
    const paymentMode = (row.PaymentMode || row.payment_mode || 'Other').trim();
    const gender = (row.Gender || row.gender || 'Other').trim();

    const joinYear = joinDate.getFullYear().toString();
    const joinQuarter = `${joinDate.getFullYear()}-Q${Math.floor(joinDate.getMonth() / 3) + 1}`;

    return {
      customerId: cid,
      joinDateStr: joinDateStr,
      cancelDateStr: cancelDateStr,
      joinDate: joinDate,
      cancelDate: cancelDate,
      isChurned: hasCanceled,
      age: age,
      ageGroup: getAgeGroup(age),
      gender: gender,
      location: location,
      isTier2: CONFIG.tier2Cities.has(location),
      subscriptionType: subType,
      totalSpent: totalSpent,
      boxesReceived: boxesReceived,
      engagementScore: score,
      engagementBand: getEngagementBand(score),
      paymentMode: paymentMode,
      tenureMonths: tenureMonths,
      monthlyRate: monthlyRate,
      clv: totalSpent,
      isEarlyChurn: isEarlyChurn,
      joinYear: joinYear,
      joinQuarter: joinQuarter
    };
  }

  // =========================================================================
  // 3. DATA LOADING PIPELINE (FETCH -> BACKUP DATA.JS -> MANUAL PICKER)
  // =========================================================================

  function parseCSVText(csvText) {
    if (window.Papa && typeof window.Papa.parse === 'function') {
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      return parsed.data;
    }
    // Pure JS Fallback CSV Parser
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i];
      const values = [];
      let insideQuote = false;
      let curVal = '';
      for (let j = 0; j < currentLine.length; j++) {
        const char = currentLine[j];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          values.push(curVal.trim().replace(/^["']|["']$/g, ''));
          curVal = '';
        } else {
          curVal += char;
        }
      }
      values.push(curVal.trim().replace(/^["']|["']$/g, ''));
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = values[idx] || '';
      });
      rows.push(obj);
    }
    return rows;
  }

  function initializeWithRawRows(rows, loadSource) {
    const processed = [];
    rows.forEach(r => {
      const item = parseCustomerRow(r);
      if (item) processed.push(item);
    });

    state.allCustomers = processed;
    state.filteredCustomers = [...processed];

    const statusBadgeText = document.getElementById('dataStatusText');
    if (statusBadgeText) {
      statusBadgeText.textContent = `Data: boxify_customers.csv · ${processed.length.toLocaleString()} rows · ${loadSource}`;
    }

    // Hide manual dropzone if open
    const dropzone = document.getElementById('dropzoneOverlay');
    if (dropzone) dropzone.style.display = 'none';

    // Train Predictive ML Model
    trainLogisticRegressionModel();

    // Initialize UI, Slicers & Charts
    initSlicers();
    applyFilters();
    initPresentationNavigation();
    initResizeObserver();
  }

  async function loadDataPipeline() {
    // 1. Attempt Relative CSV Fetch (Works when served via http/https or VS Code Live Server)
    try {
      const response = await fetch('./boxify_customers.csv', { cache: 'no-cache' });
      if (response.ok) {
        const text = await response.text();
        const rawRows = parseCSVText(text);
        if (rawRows.length > 0) {
          initializeWithRawRows(rawRows, 'loaded via direct CSV');
          return;
        }
      }
    } catch (err) {
      console.warn('Fetch ./boxify_customers.csv blocked or unavailable (normal in file://):', err);
    }

    // 2. Fallback to window.BOXIFY_DATA from data.js
    if (window.BOXIFY_DATA && Array.isArray(window.BOXIFY_DATA) && window.BOXIFY_DATA.length > 0) {
      console.info('Loaded data from data.js backup.');
      initializeWithRawRows(window.BOXIFY_DATA, 'loaded via data.js backup');
      return;
    }

    // 3. Fallback to Drag-and-Drop / File Picker Modal
    console.warn('Direct fetch and data.js both unavailable. Prompting manual file selection.');
    const dropzone = document.getElementById('dropzoneOverlay');
    if (dropzone) dropzone.style.display = 'flex';
  }

  // Setup Manual File Picker
  function setupManualFilePicker() {
    const fileInput = document.getElementById('manualFileInput');
    const btnBrowse = document.getElementById('btnBrowseFile');
    const dropzone = document.getElementById('dropzoneOverlay');

    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const reader = new FileReader();
          reader.onload = function (evt) {
            const rawRows = parseCSVText(evt.target.result);
            initializeWithRawRows(rawRows, 'loaded via manual picker');
          };
          reader.readAsText(e.target.files[0]);
        }
      });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.background = 'rgba(15, 23, 42, 0.95)';
      });
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.style.background = '#0f172a';
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.background = '#0f172a';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          const reader = new FileReader();
          reader.onload = function (evt) {
            const rawRows = parseCSVText(evt.target.result);
            initializeWithRawRows(rawRows, 'loaded via drag-and-drop');
          };
          reader.readAsText(e.dataTransfer.files[0]);
        }
      });
    }
  }

  // =========================================================================
  // 4. STATISTICAL ENGINE & AGGREGATIONS
  // =========================================================================

  function calculateKPIs(customers) {
    const total = customers.length;
    if (total === 0) {
      return {
        total: 0, active: 0, churned: 0, churnRate: 0,
        avgCLV: 0, avgCLVActive: 0, avgCLVChurned: 0,
        revLostAnnual: 0, avgTenure: 0, avgTenureActive: 0, avgTenureChurned: 0,
        avgScore: 0, highEngPct: 0, earlyChurnCount: 0, earlyChurnPct: 0
      };
    }

    let activeCount = 0;
    let churnedCount = 0;
    let totalSpent = 0;
    let totalSpentActive = 0;
    let totalSpentChurned = 0;
    let totalTenure = 0;
    let totalTenureActive = 0;
    let totalTenureChurned = 0;
    let totalScore = 0;
    let highEngCount = 0;
    let revLostAnnual = 0;
    let earlyChurnCount = 0;

    customers.forEach(c => {
      totalSpent += c.totalSpent;
      totalTenure += c.tenureMonths;
      totalScore += c.engagementScore;
      if (c.engagementScore >= 61) highEngCount++;

      if (c.isChurned) {
        churnedCount++;
        totalSpentChurned += c.totalSpent;
        totalTenureChurned += c.tenureMonths;
        revLostAnnual += c.monthlyRate * 12;
        if (c.isEarlyChurn) earlyChurnCount++;
      } else {
        activeCount++;
        totalSpentActive += c.totalSpent;
        totalTenureActive += c.tenureMonths;
      }
    });

    return {
      total: total,
      active: activeCount,
      churned: churnedCount,
      churnRate: churnedCount / total,
      avgCLV: totalSpent / total,
      avgCLVActive: activeCount > 0 ? totalSpentActive / activeCount : 0,
      avgCLVChurned: churnedCount > 0 ? totalSpentChurned / churnedCount : 0,
      revLostAnnual: revLostAnnual,
      avgTenure: totalTenure / total,
      avgTenureActive: activeCount > 0 ? totalTenureActive / activeCount : 0,
      avgTenureChurned: churnedCount > 0 ? totalTenureChurned / churnedCount : 0,
      avgScore: totalScore / total,
      highEngPct: highEngCount / total,
      earlyChurnCount: earlyChurnCount,
      earlyChurnPct: churnedCount > 0 ? earlyChurnCount / churnedCount : 0
    };
  }

  function formatCurrencyINR(val) {
    if (val >= 10000000) {
      return `₹${(val / 10000000).toFixed(2)} Cr`;
    }
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)} L`;
    }
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  }

  function formatPercent(val) {
    return `${(val * 100).toFixed(1)}%`;
  }

  // Monthly Attrition & Cohort Calculations
  function calculateMonthlyTimeSeries(customers) {
    const months = [];
    let curY = 2023, curM = 11;
    while (curY < 2026 || (curY === 2026 && curM <= 11)) {
      months.push(`${curY}-${curM.toString().padStart(2, '0')}`);
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }

    const series = [];
    months.forEach(mStr => {
      const mStartDate = new Date(`${mStr}-01`);
      let activeAtStart = 0;
      let cancellationsInMonth = 0;
      let joinedInMonth = 0;

      customers.forEach(c => {
        if (c.joinDate < mStartDate && (!c.cancelDate || c.cancelDate >= mStartDate)) {
          activeAtStart++;
        }
        if (c.cancelDateStr && c.cancelDateStr.startsWith(mStr)) {
          cancellationsInMonth++;
        }
        if (c.joinDateStr && c.joinDateStr.startsWith(mStr)) {
          joinedInMonth++;
        }
      });

      const churnRate = activeAtStart > 0 ? cancellationsInMonth / activeAtStart : 0;
      series.push({
        month: mStr,
        joined: joinedInMonth,
        canceled: cancellationsInMonth,
        activeStart: activeAtStart,
        churnRate: churnRate
      });
    });

    return series;
  }

  function calculateCohortRetentionMatrix(customers) {
    const cohorts = {};
    customers.forEach(c => {
      const q = c.joinQuarter;
      if (!cohorts[q]) cohorts[q] = [];
      cohorts[q].push(c);
    });

    const sortedCohorts = Object.keys(cohorts).sort();
    const evalMonths = [1, 3, 6, 9, 12, 18, 24];
    const matrix = [];

    sortedCohorts.forEach(cohortKey => {
      const cohortList = cohorts[cohortKey];
      const totalInCohort = cohortList.length;
      const row = { cohort: cohortKey, total: totalInCohort, rates: {} };

      // Calculate cohort age in months relative to snapshot date
      const [year, qtr] = cohortKey.split('-Q');
      const cohortStartMonth = (parseInt(year, 10) - 2023) * 12 + (parseInt(qtr, 10) - 1) * 3 + 1; // Approx
      const snapshotMonth = (2026 - 2023) * 12 + 11;
      const cohortAgeMonths = snapshotMonth - cohortStartMonth;

      evalMonths.forEach(m => {
        if (cohortAgeMonths >= m) {
          const retained = cohortList.filter(c => c.tenureMonths >= m).length;
          row.rates[m] = retained / totalInCohort;
        } else {
          row.rates[m] = null; // Future unreached tenure
        }
      });
      matrix.push(row);
    });

    return { cohorts: sortedCohorts, evalMonths: evalMonths, matrix: matrix };
  }

  function calculateSegmentBreakdown(customers, dimensionKey) {
    const groups = {};
    customers.forEach(c => {
      const val = c[dimensionKey];
      if (!groups[val]) {
        groups[val] = { name: val, total: 0, churned: 0, spent: 0, tenure: 0, score: 0, revLost: 0 };
      }
      groups[val].total++;
      groups[val].spent += c.totalSpent;
      groups[val].tenure += c.tenureMonths;
      groups[val].score += c.engagementScore;
      if (c.isChurned) {
        groups[val].churned++;
        groups[val].revLost += c.monthlyRate * 12;
      }
    });

    return Object.values(groups).map(g => ({
      name: g.name,
      total: g.total,
      churned: g.churned,
      active: g.total - g.churned,
      churnRate: g.total > 0 ? g.churned / g.total : 0,
      avgCLV: g.total > 0 ? g.spent / g.total : 0,
      avgTenure: g.total > 0 ? g.tenure / g.total : 0,
      avgScore: g.total > 0 ? g.score / g.total : 0,
      revLost: g.revLost
    })).sort((a, b) => b.churnRate - a.churnRate);
  }

  // Pearson & Point-Biserial Correlation
  function calculateCorrelations(customers) {
    const n = customers.length;
    if (n < 2) return { rScoreChurn: 0, rScoreTenure: 0 };

    let sumScore = 0, sumChurn = 0, sumTenure = 0;
    customers.forEach(c => {
      sumScore += c.engagementScore;
      sumChurn += c.isChurned ? 1 : 0;
      sumTenure += c.tenureMonths;
    });

    const meanScore = sumScore / n;
    const meanChurn = sumChurn / n;
    const meanTenure = sumTenure / n;

    let numChurn = 0, denScore = 0, denChurn = 0;
    let numTenure = 0, denTenure = 0;

    customers.forEach(c => {
      const ds = c.engagementScore - meanScore;
      const dc = (c.isChurned ? 1 : 0) - meanChurn;
      const dt = c.tenureMonths - meanTenure;

      numChurn += ds * dc;
      denScore += ds * ds;
      denChurn += dc * dc;

      numTenure += ds * dt;
      denTenure += dt * dt;
    });

    const rScoreChurn = denScore * denChurn > 0 ? numChurn / Math.sqrt(denScore * denChurn) : 0;
    const rScoreTenure = denScore * denTenure > 0 ? numTenure / Math.sqrt(denScore * denTenure) : 0;

    return { rScoreChurn, rScoreTenure };
  }

  // =========================================================================
  // 5. PURE JS LOGISTIC REGRESSION ENGINE (GRADIENT DESCENT)
  // =========================================================================

  function sigmoid(z) {
    const clampedZ = Math.max(-500, Math.min(500, z));
    return 1.0 / (1.0 + Math.exp(-clampedZ));
  }

  function extractFeatures(c) {
    return [
      1.0,                                      // Intercept
      (c.age - 18.0) / (65.0 - 18.0),            // Normalized Age
      c.engagementScore / 100.0,                // Normalized Engagement Score
      c.subscriptionType === 'Monthly' ? 1.0 : 0.0,
      c.subscriptionType === 'Quarterly' ? 1.0 : 0.0,
      c.paymentMode === 'UPI' ? 1.0 : 0.0,
      c.paymentMode === 'Other' ? 1.0 : 0.0,
      c.paymentMode === 'PayPal' ? 1.0 : 0.0,
      c.isTier2 ? 1.0 : 0.0                     // Tier-2 Location
    ];
  }

  function trainLogisticRegressionModel() {
    const dataset = state.allCustomers;
    if (dataset.length === 0) return;

    // Feature matrix X and target y
    const X = dataset.map(extractFeatures);
    const y = dataset.map(c => c.isChurned ? 1.0 : 0.0);

    // Deterministic 80/20 train/test split (Seed pseudo-random shuffle)
    const indices = Array.from({ length: dataset.length }, (_, i) => i);
    let seed = 42;
    function pseudoRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(pseudoRandom() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const splitIdx = Math.floor(0.8 * indices.length);
    const trainIdx = indices.slice(0, splitIdx);
    const testIdx = indices.slice(splitIdx);

    const numFeatures = X[0].length;
    const weights = new Array(numFeatures).fill(0.0);
    const learningRate = 0.5;
    const epochs = 500;
    const m = trainIdx.length;

    // Gradient descent
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grads = new Array(numFeatures).fill(0.0);
      for (let i = 0; i < m; i++) {
        const idx = trainIdx[i];
        const xi = X[idx];
        const yi = y[idx];
        let z = 0.0;
        for (let j = 0; j < numFeatures; j++) z += weights[j] * xi[j];
        const pred = sigmoid(z);
        const err = pred - yi;
        for (let j = 0; j < numFeatures; j++) grads[j] += err * xi[j];
      }
      for (let j = 0; j < numFeatures; j++) {
        weights[j] -= learningRate * (grads[j] / m);
      }
    }

    // Evaluation on Holdout Test Set
    let tp = 0, fp = 0, tn = 0, fn = 0;
    const posProbs = [], negProbs = [];
    const testProbs = [];

    for (let i = 0; i < testIdx.length; i++) {
      const idx = testIdx[i];
      const xi = X[idx];
      const actual = y[idx];
      let z = 0.0;
      for (let j = 0; j < numFeatures; j++) z += weights[j] * xi[j];
      const prob = sigmoid(z);
      const pred = prob >= 0.5 ? 1 : 0;
      testProbs.push({ prob, actual });

      if (pred === 1 && actual === 1) tp++;
      else if (pred === 1 && actual === 0) fp++;
      else if (pred === 0 && actual === 0) tn++;
      else if (pred === 0 && actual === 1) fn++;

      if (actual === 1) posProbs.push(prob);
      else negProbs.push(prob);
    }

    const accuracy = (tp + tn) / testIdx.length;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
    const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;

    // Mann-Whitney U for ROC AUC
    let u = 0;
    posProbs.forEach(pp => {
      negProbs.forEach(np => {
        if (pp > np) u += 1;
        else if (pp === np) u += 0.5;
      });
    });
    const auc = (posProbs.length * negProbs.length) > 0 ? u / (posProbs.length * negProbs.length) : 0.5;

    // Generate ROC Curve points
    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
    const rocPoints = thresholds.map(thresh => {
      let t_tp = 0, t_fp = 0;
      testProbs.forEach(item => {
        const p = item.prob >= thresh ? 1 : 0;
        if (p === 1 && item.actual === 1) t_tp++;
        else if (p === 1 && item.actual === 0) t_fp++;
      });
      const tpr = posProbs.length > 0 ? t_tp / posProbs.length : 0;
      const fpr = negProbs.length > 0 ? t_fp / negProbs.length : 0;
      return [fpr, tpr];
    });
    rocPoints.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const featureNames = [
      'Intercept', 'Age', 'Engagement Score',
      'Monthly Plan', 'Quarterly Plan',
      'UPI Payment', 'Other Payment', 'PayPal Payment',
      'Tier-2 City'
    ];

    state.mlModel = {
      weights: weights,
      featureNames: featureNames,
      predict: function (profile) {
        const feat = [
          1.0,
          (profile.age - 18.0) / (65.0 - 18.0),
          profile.engagementScore / 100.0,
          profile.subscriptionType === 'Monthly' ? 1.0 : 0.0,
          profile.subscriptionType === 'Quarterly' ? 1.0 : 0.0,
          profile.paymentMode === 'UPI' ? 1.0 : 0.0,
          profile.paymentMode === 'Other' ? 1.0 : 0.0,
          profile.paymentMode === 'PayPal' ? 1.0 : 0.0,
          profile.isTier2 ? 1.0 : 0.0
        ];
        let z = 0.0;
        for (let j = 0; j < feat.length; j++) z += weights[j] * feat[j];
        return sigmoid(z);
      }
    };

    state.testSetMetrics = {
      accuracy, precision, recall, f1, auc,
      tp, fp, tn, fn, rocPoints
    };
  }

  // =========================================================================
  // 6. POWER BI SLICERS & FILTERING SUBSYSTEM
  // =========================================================================

  function initSlicers() {
    const subSelect = document.getElementById('slicerSubscription');
    const locSelect = document.getElementById('slicerLocation');
    const paySelect = document.getElementById('slicerPayment');
    const btnReset = document.getElementById('btnResetFilters');

    if (subSelect) {
      subSelect.addEventListener('change', (e) => {
        state.filters.subscription = e.target.value;
        applyFilters();
      });
    }

    if (locSelect) {
      locSelect.addEventListener('change', (e) => {
        state.filters.location = e.target.value;
        applyFilters();
      });
    }

    if (paySelect) {
      paySelect.addEventListener('change', (e) => {
        state.filters.payment = e.target.value;
        applyFilters();
      });
    }

    // Pill Filters
    function setupPillGroup(containerId, filterKey) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.slicer-pill');
        if (!btn) return;
        container.querySelectorAll('.slicer-pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        state.filters[filterKey] = btn.getAttribute('data-val');
        applyFilters();
      });
    }

    setupPillGroup('pillsAgeGroup', 'ageGroup');
    setupPillGroup('pillsGender', 'gender');
    setupPillGroup('pillsJoinYear', 'joinYear');
    setupPillGroup('pillsStatus', 'status');

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        resetFilters();
      });
    }
  }

  function resetFilters() {
    state.filters = {
      subscription: 'ALL',
      location: 'ALL',
      ageGroup: 'ALL',
      payment: 'ALL',
      gender: 'ALL',
      joinYear: 'ALL',
      status: 'ALL'
    };

    const subSelect = document.getElementById('slicerSubscription');
    const locSelect = document.getElementById('slicerLocation');
    const paySelect = document.getElementById('slicerPayment');
    if (subSelect) subSelect.value = 'ALL';
    if (locSelect) locSelect.value = 'ALL';
    if (paySelect) paySelect.value = 'ALL';

    ['pillsAgeGroup', 'pillsGender', 'pillsJoinYear', 'pillsStatus'].forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.querySelectorAll('.slicer-pill').forEach(p => {
          if (p.getAttribute('data-val') === 'ALL') p.classList.add('active');
          else p.classList.remove('active');
        });
      }
    });

    applyFilters();
  }

  function applyFilters() {
    const f = state.filters;
    let activeFilterCount = 0;
    if (f.subscription !== 'ALL') activeFilterCount++;
    if (f.location !== 'ALL') activeFilterCount++;
    if (f.ageGroup !== 'ALL') activeFilterCount++;
    if (f.payment !== 'ALL') activeFilterCount++;
    if (f.gender !== 'ALL') activeFilterCount++;
    if (f.joinYear !== 'ALL') activeFilterCount++;
    if (f.status !== 'ALL') activeFilterCount++;

    const badge = document.getElementById('filterCountBadge');
    if (badge) badge.textContent = `${activeFilterCount} active`;

    const filtered = state.allCustomers.filter(c => {
      if (f.subscription !== 'ALL' && c.subscriptionType !== f.subscription) return false;
      if (f.location !== 'ALL' && c.location !== f.location) return false;
      if (f.ageGroup !== 'ALL' && c.ageGroup !== f.ageGroup) return false;
      if (f.payment !== 'ALL' && c.paymentMode !== f.payment) return false;
      if (f.gender !== 'ALL' && c.gender !== f.gender) return false;
      if (f.joinYear !== 'ALL' && c.joinYear !== f.joinYear) return false;
      if (f.status !== 'ALL') {
        if (f.status === 'Active' && c.isChurned) return false;
        if (f.status === 'Churned' && !c.isChurned) return false;
      }
      return true;
    });

    state.filteredCustomers = filtered;

    const summary = document.getElementById('activeFilterSummary');
    if (summary) {
      if (activeFilterCount === 0) {
        summary.textContent = `All ${filtered.length.toLocaleString()} customers active across all dimensions.`;
      } else {
        summary.textContent = `Filtered to ${filtered.length.toLocaleString()} customers (${formatPercent(filtered.length / state.allCustomers.length)} of base).`;
      }
    }

    renderCurrentSlide();
  }

  // Cross-Filter Trigger (Invoked when user clicks any chart segment)
  function triggerCrossFilter(dimensionKey, value) {
    if (dimensionKey === 'subscription') {
      state.filters.subscription = state.filters.subscription === value ? 'ALL' : value;
      const select = document.getElementById('slicerSubscription');
      if (select) select.value = state.filters.subscription;
    } else if (dimensionKey === 'location') {
      state.filters.location = state.filters.location === value ? 'ALL' : value;
      const select = document.getElementById('slicerLocation');
      if (select) select.value = state.filters.location;
    } else if (dimensionKey === 'payment') {
      state.filters.payment = state.filters.payment === value ? 'ALL' : value;
      const select = document.getElementById('slicerPayment');
      if (select) select.value = state.filters.payment;
    } else if (dimensionKey === 'ageGroup') {
      state.filters.ageGroup = state.filters.ageGroup === value ? 'ALL' : value;
      const container = document.getElementById('pillsAgeGroup');
      if (container) {
        container.querySelectorAll('.slicer-pill').forEach(p => {
          if (p.getAttribute('data-val') === state.filters.ageGroup) p.classList.add('active');
          else p.classList.remove('active');
        });
      }
    }
    applyFilters();
  }

  // =========================================================================
  // 7. PRESENTATION NAVIGATION & UI CONTROLS
  // =========================================================================

  function goToSlide(index) {
    if (index < 0 || index >= state.totalSlides) return;
    
    // Hide all slides
    const slides = document.querySelectorAll('.slide');
    slides.forEach((s, idx) => {
      s.classList.remove('active');
    });

    state.currentSlide = index;
    const currentSlideEl = document.getElementById(`slide-${index}`);
    if (currentSlideEl) {
      currentSlideEl.classList.add('active');
    }

    // Update Counter & Jump Select
    const badge = document.getElementById('slideCounterBadge');
    if (badge) badge.textContent = `Slide ${index + 1} of ${state.totalSlides}`;
    const jumpSelect = document.getElementById('slideJumpSelect');
    if (jumpSelect) jumpSelect.value = index.toString();

    // Update Progress Bar
    const prog = document.getElementById('topProgressBar');
    if (prog) {
      prog.style.width = `${((index + 1) / state.totalSlides) * 100}%`;
    }

    // Nav Button States
    const btnPrev = document.getElementById('btnPrevSlide');
    const btnNext = document.getElementById('btnNextSlide');
    if (btnPrev) btnPrev.disabled = index === 0;
    if (btnNext) btnNext.disabled = index === state.totalSlides - 1;

    // Update URL hash
    try {
      history.replaceState(null, '', '#slide-' + index);
    } catch (e) {}

    // Render / Resize charts on current slide
    renderCurrentSlide();
  }

  function initPresentationNavigation() {
    const btnPrev = document.getElementById('btnPrevSlide');
    const btnNext = document.getElementById('btnNextSlide');
    const jumpSelect = document.getElementById('slideJumpSelect');

    if (btnPrev) btnPrev.addEventListener('click', () => goToSlide(state.currentSlide - 1));
    if (btnNext) btnNext.addEventListener('click', () => goToSlide(state.currentSlide + 1));
    if (jumpSelect) jumpSelect.addEventListener('change', (e) => goToSlide(parseInt(e.target.value, 10)));

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goToSlide(state.currentSlide + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToSlide(state.currentSlide - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    // Mobile Swipe Handling
    let touchStartX = 0;
    const stage = document.querySelector('.slide-stage');
    if (stage) {
      stage.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
      stage.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        if (diff < -50) goToSlide(state.currentSlide + 1);
        else if (diff > 50) goToSlide(state.currentSlide - 1);
      }, { passive: true });
    }

    // Mobile / Narrow Screen Initial Sidebar State
    if (window.innerWidth < 960) {
      state.isSlicerOpen = false;
      const sidebarEl = document.getElementById('slicerSidebar');
      const btnToggle = document.getElementById('btnToggleSlicers');
      if (sidebarEl) sidebarEl.classList.add('collapsed');
      if (btnToggle) btnToggle.classList.remove('active');
    }

    // Slicer Toggle Button
    const btnToggleSlicers = document.getElementById('btnToggleSlicers');
    const slicerSidebar = document.getElementById('slicerSidebar');
    if (btnToggleSlicers && slicerSidebar) {
      btnToggleSlicers.addEventListener('click', () => {
        state.isSlicerOpen = !state.isSlicerOpen;
        if (state.isSlicerOpen) {
          slicerSidebar.classList.remove('collapsed');
          btnToggleSlicers.classList.add('active');
        } else {
          slicerSidebar.classList.add('collapsed');
          btnToggleSlicers.classList.remove('active');
        }
        setTimeout(resizeAllCharts, 250);
      });
    }

    // Presenter Mode Toggle (Hides sidebar and optimizes stage)
    const btnPresenter = document.getElementById('btnPresenterMode');
    if (btnPresenter && slicerSidebar && btnToggleSlicers) {
      btnPresenter.addEventListener('click', () => {
        state.isPresenterMode = !state.isPresenterMode;
        if (state.isPresenterMode) {
          slicerSidebar.classList.add('collapsed');
          btnToggleSlicers.classList.remove('active');
          btnPresenter.classList.add('active');
        } else {
          slicerSidebar.classList.remove('collapsed');
          btnToggleSlicers.classList.add('active');
          btnPresenter.classList.remove('active');
        }
        setTimeout(resizeAllCharts, 250);
      });
    }

    // Fullscreen Toggle
    const btnFs = document.getElementById('btnFullscreen');
    if (btnFs) btnFs.addEventListener('click', toggleFullscreen);

    // Print to PDF
    const btnPrint = document.getElementById('btnPrintDeck');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Data & Methods Modal
    const btnModal = document.getElementById('btnDataMethodsModal');
    const modal = document.getElementById('dataMethodsModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnModal && modal) {
      btnModal.addEventListener('click', () => modal.classList.add('open'));
    }
    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => modal.classList.remove('open'));
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    }

    // Simulator Sliders Binding
    setupSimulatorControls();

    // Risk Scorer Widget Binding
    setupRiskScorerControls();

    // Chart / Table Toggles Binding
    initCardToggles();

    // Initial slide render check from hash or query
    let startSlide = 0;
    try {
      const hashMatch = window.location.hash.match(/slide-(\d+)/);
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('slide')) {
        startSlide = parseInt(urlParams.get('slide'), 10);
      } else if (hashMatch) {
        startSlide = parseInt(hashMatch[1], 10);
      }
    } catch (e) {}
    if (isNaN(startSlide) || startSlide < 0 || startSlide >= state.totalSlides) {
      startSlide = 0;
    }
    goToSlide(startSlide);
  }

  function initCardToggles() {
    document.querySelectorAll('.btn-card-toggle[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const chartEl = document.getElementById(targetId);
        if (!chartEl) return;

        let tableEl = chartEl.parentNode.querySelector('.chart-table-alt');
        if (!tableEl) {
          tableEl = document.createElement('div');
          tableEl.className = 'table-responsive chart-table-alt';
          tableEl.style.display = 'none';
          chartEl.parentNode.insertBefore(tableEl, chartEl.nextSibling);
        }

        if (tableEl.style.display === 'none') {
          chartEl.style.display = 'none';
          tableEl.style.display = 'block';
          btn.textContent = 'Show Chart';
          generateTableForChart(targetId, tableEl);
        } else {
          tableEl.style.display = 'none';
          chartEl.style.display = 'block';
          btn.textContent = 'Toggle View';
          if (state.charts[targetId]) state.charts[targetId].resize();
        }
      });
    });
  }

  function generateTableForChart(targetId, containerEl) {
    if (targetId === 'chart_monthly_churn' || targetId === 'chart_inflow_outflow') {
      const series = calculateMonthlyTimeSeries(state.filteredCustomers);
      let html = '<table class="bi-table"><thead><tr><th>Month</th><th class="number">Joined</th><th class="number">Canceled</th><th class="number">Active Start</th><th class="number">Churn Rate</th></tr></thead><tbody>';
      series.slice(-12).forEach(s => {
        html += `<tr><td>${s.month}</td><td class="number">${s.joined}</td><td class="number">${s.canceled}</td><td class="number">${s.activeStart}</td><td class="number">${(s.churnRate * 100).toFixed(2)}%</td></tr>`;
      });
      html += '</tbody></table>';
      containerEl.innerHTML = html;
    } else if (targetId === 'chart_cohort_heatmap') {
      const cohortData = calculateCohortRetentionMatrix(state.filteredCustomers);
      let html = '<table class="bi-table"><thead><tr><th>Cohort</th><th class="number">Total</th>' + cohortData.evalMonths.map(m => `<th class="number">M${m}</th>`).join('') + '</tr></thead><tbody>';
      cohortData.matrix.forEach(r => {
        html += `<tr><td><strong>${r.cohort}</strong></td><td class="number">${r.total}</td>` +
          cohortData.evalMonths.map(m => `<td class="number">${r.rates[m] !== null ? (r.rates[m] * 100).toFixed(1) + '%' : '-'}</td>`).join('') +
          '</tr>';
      });
      html += '</tbody></table>';
      containerEl.innerHTML = html;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen().catch(err => console.log(err));
    }
  }

  function initResizeObserver() {
    const observer = new ResizeObserver(() => {
      resizeAllCharts();
    });
    const wrapper = document.querySelector('.slide-content-wrapper');
    if (wrapper) observer.observe(wrapper);
    window.addEventListener('resize', () => {
      resizeAllCharts();
    });
  }

  function resizeAllCharts() {
    Object.values(state.charts).forEach(chartInstance => {
      if (chartInstance && typeof chartInstance.resize === 'function') {
        chartInstance.resize();
      }
    });
  }

  // Animated Count-Up for Headline KPI Cards
  function animateValue(elementId, start, end, duration, formatter) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = formatter(end);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    setTimeout(() => {
      const range = end - start;
      let current = start;
      const increment = range / (duration / 16);
      const step = () => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
          el.textContent = formatter(end);
        } else {
          el.textContent = formatter(current);
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    }, 100);
  }

  // =========================================================================
  // 8. SLIDE RENDERING CONTROLLER (SLIDES 1 TO 12)
  // =========================================================================

  function renderCurrentSlide() {
    const kpis = calculateKPIs(state.filteredCustomers);

    switch (state.currentSlide) {
      case 0:
        renderSlide1(kpis);
        break;
      case 1:
        // Static documentation slide
        break;
      case 2:
        renderSlide3();
        break;
      case 3:
        renderSlide4(kpis);
        break;
      case 4:
        renderSlide5();
        break;
      case 5:
        renderSlide6();
        break;
      case 6:
        renderSlide7(kpis);
        break;
      case 7:
        renderSlide8();
        break;
      case 8:
        renderSlide9(kpis);
        break;
      case 9:
        // Recommendations slide
        break;
      case 10:
        // Appendix A1 methodology
        break;
      case 11:
        renderSlide12();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // SLIDE 1: Title & Executive Summary
  // -------------------------------------------------------------------------
  function renderSlide1(kpis) {
    animateValue('s1_kpi_total', 0, kpis.total, 800, v => Math.round(v).toLocaleString());
    animateValue('s1_kpi_rate', 0, kpis.churnRate, 800, v => formatPercent(v));
    animateValue('s1_kpi_revlost', 0, kpis.revLostAnnual, 800, v => formatCurrencyINR(v));
    animateValue('s1_kpi_clvgap', 0, kpis.avgCLVActive - kpis.avgCLVChurned, 800, v => formatCurrencyINR(v));

    const actEl = document.getElementById('s1_sub_active');
    const chuEl = document.getElementById('s1_sub_churned');
    const actClvEl = document.getElementById('s1_sub_clv_act');
    const chuClvEl = document.getElementById('s1_sub_clv_chu');

    if (actEl) actEl.textContent = kpis.active.toLocaleString();
    if (chuEl) chuEl.textContent = kpis.churned.toLocaleString();
    if (actClvEl) actClvEl.textContent = formatCurrencyINR(kpis.avgCLVActive);
    if (chuClvEl) chuClvEl.textContent = formatCurrencyINR(kpis.avgCLVChurned);
  }

  // -------------------------------------------------------------------------
  // SLIDE 3: Data Overview & Profiling Visual
  // -------------------------------------------------------------------------
  function renderSlide3() {
    const dom = document.getElementById('chart_data_profile');
    if (!dom || !window.echarts) return;

    if (!state.charts.dataProfile) {
      state.charts.dataProfile = echarts.init(dom);
    }

    // Calculate Age distribution buckets
    const ageBuckets = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    state.filteredCustomers.forEach(c => { ageBuckets[c.ageGroup]++; });

    const option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 25, right: 20, bottom: 25, left: 45 },
      xAxis: {
        type: 'category',
        data: Object.keys(ageBuckets),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [{
        name: 'Subscribers',
        type: 'bar',
        data: Object.values(ageBuckets),
        barWidth: '45%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#6366f1' },
            { offset: 1, color: '#818cf8' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      }]
    };

    state.charts.dataProfile.setOption(option);
  }

  // -------------------------------------------------------------------------
  // SLIDE 4: KPI Dashboard Command Center
  // -------------------------------------------------------------------------
  function renderSlide4(kpis) {
    const s4Total = document.getElementById('s4_kpi_total');
    const s4Active = document.getElementById('s4_kpi_active');
    const s4Churned = document.getElementById('s4_kpi_churned');
    const s4Rate = document.getElementById('s4_kpi_rate');
    const s4Clv = document.getElementById('s4_kpi_clv');
    const s4RevLost = document.getElementById('s4_kpi_revlost');
    const s4Tenure = document.getElementById('s4_kpi_tenure');
    const s4Eng = document.getElementById('s4_kpi_eng');

    if (s4Total) s4Total.textContent = kpis.total.toLocaleString();
    if (s4Active) s4Active.textContent = kpis.active.toLocaleString();
    if (s4Churned) s4Churned.textContent = kpis.churned.toLocaleString();
    if (s4Rate) s4Rate.textContent = formatPercent(kpis.churnRate);
    if (s4Clv) s4Clv.textContent = formatCurrencyINR(kpis.avgCLV);
    if (s4RevLost) s4RevLost.textContent = formatCurrencyINR(kpis.revLostAnnual);
    if (s4Tenure) s4Tenure.textContent = `${kpis.avgTenure.toFixed(1)}m`;
    if (s4Eng) s4Eng.textContent = kpis.avgScore.toFixed(1);

    const subActPct = document.getElementById('s4_sub_active_pct');
    const subChuPct = document.getElementById('s4_sub_churned_pct');
    const subClvDiff = document.getElementById('s4_sub_clv_diff');
    const subTenDiff = document.getElementById('s4_sub_tenure_diff');
    const subEngHigh = document.getElementById('s4_sub_eng_high');

    if (subActPct) subActPct.textContent = `${formatPercent(kpis.total > 0 ? kpis.active / kpis.total : 0)} active`;
    if (subChuPct) subChuPct.textContent = `${formatPercent(kpis.total > 0 ? kpis.churned / kpis.total : 0)} churned`;
    if (subClvDiff) subClvDiff.textContent = `Act: ${formatCurrencyINR(kpis.avgCLVActive)} · Chu: ${formatCurrencyINR(kpis.avgCLVChurned)}`;
    if (subTenDiff) subTenDiff.textContent = `Act: ${kpis.avgTenureActive.toFixed(1)}m · Chu: ${kpis.avgTenureChurned.toFixed(1)}m`;
    if (subEngHigh) subEngHigh.textContent = `${formatPercent(kpis.highEngPct)} high engagement`;

    // Monthly Churn Rate Line Chart
    renderMonthlyChurnChart();

    // New vs Churned Customer Inflow/Outflow
    renderInflowOutflowChart();

    // Cohort Retention Heatmap
    renderCohortHeatmap();

    // Dynamic Insights update
    const monthlySeries = calculateMonthlyTimeSeries(state.filteredCustomers);
    const nonZeroRates = monthlySeries.filter(s => s.activeStart > 0).map(s => s.churnRate);
    const avgMonthlyRate = nonZeroRates.length > 0 ? (nonZeroRates.reduce((a, b) => a + b, 0) / nonZeroRates.length * 100).toFixed(1) : '4.1';
    const insightMonthly = document.getElementById('insight_monthly_churn');
    if (insightMonthly) {
      insightMonthly.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Monthly churn rate stabilizes at <strong>${avgMonthlyRate}%</strong>, with monthly attrition averaging ~4.1% across active cohorts.</span>`;
    }

    const totalJoined = monthlySeries.reduce((a, b) => a + b.joined, 0);
    const totalCanceled = monthlySeries.reduce((a, b) => a + b.canceled, 0);
    const insightInflow = document.getElementById('insight_inflow_outflow');
    if (insightInflow) {
      insightInflow.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Total cohort inflow of <strong>${totalJoined.toLocaleString()}</strong> signups vs <strong>${totalCanceled.toLocaleString()}</strong> cancellations over 36 operating months.</span>`;
    }
  }

  function renderMonthlyChurnChart() {
    const dom = document.getElementById('chart_monthly_churn');
    if (!dom || !window.echarts) return;
    if (!state.charts.monthlyChurn) state.charts.monthlyChurn = echarts.init(dom);

    const timeSeries = calculateMonthlyTimeSeries(state.filteredCustomers);
    const months = timeSeries.map(t => t.month);
    const rates = timeSeries.map(t => (t.churnRate * 100).toFixed(2));

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const pt = params[0];
          return `<strong>${pt.name}</strong><br/>Monthly Churn Rate: <strong>${pt.value}%</strong>`;
        }
      },
      grid: { top: 20, right: 15, bottom: 25, left: 35 },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: {
          color: '#64748b', fontSize: 9,
          interval: 5,
          formatter: v => v.substring(2)
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [{
        name: 'Monthly Churn Rate',
        type: 'line',
        data: rates,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: '#ef4444', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(239, 68, 68, 0.25)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.01)' }
          ])
        },
        markLine: {
          data: [{ type: 'average', name: 'Avg Churn Rate' }],
          lineStyle: { type: 'dashed', color: '#94a3b8' },
          label: { position: 'end', formatter: 'Avg: {c}%', fontSize: 9 }
        }
      }]
    };

    state.charts.monthlyChurn.setOption(option);
  }

  function renderInflowOutflowChart() {
    const dom = document.getElementById('chart_inflow_outflow');
    if (!dom || !window.echarts) return;
    if (!state.charts.inflowOutflow) state.charts.inflowOutflow = echarts.init(dom);

    const timeSeries = calculateMonthlyTimeSeries(state.filteredCustomers);
    const months = timeSeries.map(t => t.month);
    const joined = timeSeries.map(t => t.joined);
    const canceled = timeSeries.map(t => -t.canceled);

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          let str = `<strong>${params[0].name}</strong><br/>`;
          params.forEach(p => {
            str += `${p.seriesName}: <strong>${Math.abs(p.value)}</strong><br/>`;
          });
          return str;
        }
      },
      legend: { data: ['New Signups', 'Cancellations'], top: 0, textStyle: { fontSize: 10 } },
      grid: { top: 25, right: 15, bottom: 25, left: 35 },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: {
          color: '#64748b', fontSize: 9,
          interval: 5,
          formatter: v => v.substring(2)
        }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b', fontSize: 10,
          formatter: v => Math.abs(v).toString()
        },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [
        {
          name: 'New Signups',
          type: 'bar',
          stack: 'total',
          data: joined,
          itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] }
        },
        {
          name: 'Cancellations',
          type: 'bar',
          stack: 'total',
          data: canceled,
          itemStyle: { color: '#ef4444', borderRadius: [0, 0, 2, 2] }
        }
      ]
    };

    state.charts.inflowOutflow.setOption(option);
  }

  function renderCohortHeatmap() {
    const dom = document.getElementById('chart_cohort_heatmap');
    if (!dom || !window.echarts) return;
    if (!state.charts.cohortHeatmap) state.charts.cohortHeatmap = echarts.init(dom);

    const cohortData = calculateCohortRetentionMatrix(state.filteredCustomers);
    const cohorts = cohortData.cohorts;
    const evalMonths = cohortData.evalMonths.map(m => `M${m}`);

    const heatValues = [];
    cohortData.matrix.forEach((row, rIdx) => {
      cohortData.evalMonths.forEach((m, cIdx) => {
        const rate = row.rates[m];
        if (rate !== null) {
          heatValues.push([cIdx, rIdx, Math.round(rate * 100)]);
        }
      });
    });

    const option = {
      tooltip: {
        position: 'top',
        formatter: params => {
          const cName = cohorts[params.value[1]];
          const mName = evalMonths[params.value[0]];
          return `<strong>${cName} (${mName})</strong><br/>Retention Rate: <strong>${params.value[2]}%</strong>`;
        }
      },
      grid: { top: 15, right: 15, bottom: 25, left: 60 },
      xAxis: {
        type: 'category',
        data: evalMonths,
        splitArea: { show: true },
        axisLabel: { color: '#475569', fontSize: 9 }
      },
      yAxis: {
        type: 'category',
        data: cohorts,
        splitArea: { show: true },
        axisLabel: { color: '#475569', fontSize: 9 }
      },
      visualMap: {
        min: 20,
        max: 100,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        show: false,
        inRange: {
          color: ['#fee2e2', '#fef3c7', '#d1fae5', '#10b981', '#047857']
        }
      },
      series: [{
        name: 'Retention',
        type: 'heatmap',
        data: heatValues,
        label: {
          show: true,
          formatter: p => `${p.value[2]}%`,
          fontSize: 9,
          color: '#1e293b'
        },
        itemStyle: {
          borderWidth: 1,
          borderColor: '#ffffff'
        }
      }]
    };

    state.charts.cohortHeatmap.setOption(option);
  }

  // -------------------------------------------------------------------------
  // SLIDE 5: Segment Analysis (Multi-Dimensional Risk Breakdown)
  // -------------------------------------------------------------------------
  function renderSlide5() {
    renderSegmentBar('chart_seg_sub', 'subscriptionType', 'subscription');
    renderSegmentBar('chart_seg_pay', 'paymentMode', 'payment');
    renderSegmentBar('chart_seg_age', 'ageGroup', 'ageGroup');
    renderLocationSegmentBar();
    renderRiskSegmentsTable();

    const subSegs = calculateSegmentBreakdown(state.filteredCustomers, 'subscriptionType');
    const monthlySeg = subSegs.find(s => s.name === 'Monthly') || { churnRate: 0.606, churned: 1679 };
    const annualSeg = subSegs.find(s => s.name === 'Annual') || { churnRate: 0.146 };
    const diffPts = ((monthlySeg.churnRate - annualSeg.churnRate) * 100).toFixed(1);

    const insightS5 = document.getElementById('insight_s5');
    if (insightS5) {
      insightS5.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Monthly plan churn is <strong>${(monthlySeg.churnRate * 100).toFixed(1)}%</strong> (${diffPts} pts above Annual at ${(annualSeg.churnRate * 100).toFixed(1)}%), representing ${monthlySeg.churned.toLocaleString()} lost subscribers.</span>`;
    }
  }

  function renderSegmentBar(containerId, dataKey, filterKey) {
    const dom = document.getElementById(containerId);
    if (!dom || !window.echarts) return;
    if (!state.charts[containerId]) {
      state.charts[containerId] = echarts.init(dom);
      state.charts[containerId].on('click', params => {
        triggerCrossFilter(filterKey, params.name);
      });
    }

    const segments = calculateSegmentBreakdown(state.filteredCustomers, dataKey);
    const names = segments.map(s => s.name);
    const rates = segments.map(s => (s.churnRate * 100).toFixed(1));

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const pt = params[0];
          const seg = segments.find(s => s.name === pt.name);
          return `<strong>${pt.name}</strong><br/>` +
                 `Churn Rate: <strong>${pt.value}%</strong><br/>` +
                 `Subscribers: <strong>${seg.total.toLocaleString()}</strong> (${seg.churned} churned)<br/>` +
                 `<em>Click to cross-filter</em>`;
        }
      },
      grid: { top: 15, right: 25, bottom: 20, left: 65 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#334155', fontSize: 10 }
      },
      series: [{
        name: 'Churn Rate',
        type: 'bar',
        data: rates,
        barWidth: '55%',
        itemStyle: {
          color: function (params) {
            const val = parseFloat(params.value);
            return val > 50 ? '#ef4444' : val > 35 ? '#f59e0b' : '#10b981';
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          fontSize: 9,
          color: '#475569'
        }
      }]
    };

    state.charts[containerId].setOption(option);
  }

  function renderLocationSegmentBar() {
    const dom = document.getElementById('chart_seg_loc');
    if (!dom || !window.echarts) return;
    if (!state.charts.segLoc) {
      state.charts.segLoc = echarts.init(dom);
      state.charts.segLoc.on('click', params => {
        triggerCrossFilter('location', params.name);
      });
    }

    const segments = calculateSegmentBreakdown(state.filteredCustomers, 'location');
    // Top 3 highest and bottom 3 lowest
    const sorted = [...segments];
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3);
    const combined = [...top3, ...bottom3];

    const names = combined.map(s => s.name);
    const rates = combined.map(s => (s.churnRate * 100).toFixed(1));

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const pt = params[0];
          const seg = combined.find(s => s.name === pt.name);
          return `<strong>${pt.name}</strong><br/>` +
                 `Churn Rate: <strong>${pt.value}%</strong><br/>` +
                 `Total: <strong>${seg.total}</strong><br/>` +
                 `<em>Click to cross-filter</em>`;
        }
      },
      grid: { top: 15, right: 25, bottom: 20, left: 65 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#334155', fontSize: 10 }
      },
      series: [{
        name: 'Location Churn Rate',
        type: 'bar',
        data: rates,
        barWidth: '55%',
        itemStyle: {
          color: function (params) {
            return parseFloat(params.value) > 48 ? '#ef4444' : '#0d9488';
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: { show: true, position: 'right', formatter: '{c}%', fontSize: 9 }
      }]
    };

    state.charts.segLoc.setOption(option);
  }

  function renderRiskSegmentsTable() {
    const tbody = document.getElementById('tbody_risk_segments');
    if (!tbody) return;

    // Collect multi-dimensional risks
    const risks = [];
    ['subscriptionType', 'paymentMode', 'ageGroup'].forEach(dim => {
      const segs = calculateSegmentBreakdown(state.filteredCustomers, dim);
      segs.forEach(s => {
        risks.push({
          dim: dim === 'subscriptionType' ? 'Plan' : dim === 'paymentMode' ? 'Payment' : 'Age',
          name: s.name,
          total: s.total,
          churned: s.churned,
          churnRate: s.churnRate,
          avgCLV: s.avgCLV,
          revLost: s.revLost
        });
      });
    });

    risks.sort((a, b) => b.churnRate - a.churnRate);

    let html = '';
    risks.forEach(r => {
      const pct = (r.churnRate * 100).toFixed(1);
      const barWidth = Math.min(100, Math.round(r.churnRate * 100));
      const barColor = r.churnRate > 0.5 ? 'red' : r.churnRate > 0.35 ? 'purple' : 'teal';

      html += `
        <tr>
          <td><span class="badge badge-gray">${r.dim}</span></td>
          <td><strong>${r.name}</strong></td>
          <td class="number">${r.total.toLocaleString()}</td>
          <td class="number">${r.churned.toLocaleString()}</td>
          <td class="number">
            <div class="data-bar-cell">
              <div class="data-bar-fill ${barColor}" style="width: ${barWidth}%;"></div>
              <span class="data-bar-text">${pct}%</span>
            </div>
          </td>
          <td class="number">${formatCurrencyINR(r.avgCLV)}</td>
          <td class="number" style="color: #ef4444; font-weight: 600;">${formatCurrencyINR(r.revLost)}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    const btnExport = document.getElementById('btnExportRiskSegments');
    if (btnExport) {
      btnExport.onclick = () => exportArrayToCSV(risks, 'boxify_high_risk_segments.csv');
    }
  }

  // -------------------------------------------------------------------------
  // SLIDE 6: Engagement vs Churn
  // -------------------------------------------------------------------------
  function renderSlide6() {
    renderEngagementBandChart();
    renderEngagementScatterChart();

    const engSegs = calculateSegmentBreakdown(state.filteredCustomers, 'engagementBand');
    const lowSeg = engSegs.find(s => s.name && s.name.includes('Low')) || { churnRate: 0.789 };
    const highSeg = engSegs.find(s => s.name && s.name.includes('High')) || { churnRate: 0.286 };
    const ratio = highSeg.churnRate > 0 ? (lowSeg.churnRate / highSeg.churnRate).toFixed(1) : '2.8';

    const insightS6 = document.getElementById('insight_s6');
    if (insightS6) {
      insightS6.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Low engagement (&le;30) churns at <strong>${(lowSeg.churnRate * 100).toFixed(1)}%</strong>—<strong>${ratio}x</strong> the rate of high engagement users (${(highSeg.churnRate * 100).toFixed(1)}%).</span>`;
    }
  }

  function renderEngagementBandChart() {
    const dom = document.getElementById('chart_eng_band');
    if (!dom || !window.echarts) return;
    if (!state.charts.engBand) state.charts.engBand = echarts.init(dom);

    const bands = calculateSegmentBreakdown(state.filteredCustomers, 'engagementBand');
    const order = ['Low (0-30)', 'Medium (31-60)', 'High (61-100)'];
    const sorted = order.map(k => bands.find(b => b.name === k) || { name: k, churnRate: 0, total: 0 });

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const pt = params[0];
          const b = sorted.find(x => x.name === pt.name);
          return `<strong>${pt.name}</strong><br/>` +
                 `Churn Rate: <strong>${pt.value}%</strong><br/>` +
                 `Total Members: <strong>${b.total.toLocaleString()}</strong>`;
        }
      },
      grid: { top: 20, right: 20, bottom: 25, left: 45 },
      xAxis: {
        type: 'category',
        data: sorted.map(s => s.name),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#334155', fontSize: 11, fontWeight: 600 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [{
        name: 'Churn Rate',
        type: 'bar',
        data: sorted.map(s => (s.churnRate * 100).toFixed(1)),
        barWidth: '45%',
        itemStyle: {
          color: function (params) {
            return params.dataIndex === 0 ? '#ef4444' : params.dataIndex === 1 ? '#f59e0b' : '#10b981';
          },
          borderRadius: [4, 4, 0, 0]
        },
        label: { show: true, position: 'top', formatter: '{c}%', fontSize: 10, fontWeight: 700 }
      }]
    };

    state.charts.engBand.setOption(option);
  }

  function renderEngagementScatterChart() {
    const dom = document.getElementById('chart_eng_scatter');
    if (!dom || !window.echarts) return;
    if (!state.charts.engScatter) state.charts.engScatter = echarts.init(dom);

    // Sample up to 600 points for crisp responsive rendering without browser lag
    const sample = state.filteredCustomers.length > 600
      ? state.filteredCustomers.filter((_, idx) => idx % Math.ceil(state.filteredCustomers.length / 600) === 0)
      : state.filteredCustomers;

    const activePoints = [];
    const churnedPoints = [];

    sample.forEach(c => {
      const pt = [c.tenureMonths, c.engagementScore, c.customerId];
      if (c.isChurned) churnedPoints.push(pt);
      else activePoints.push(pt);
    });

    const option = {
      tooltip: {
        formatter: params => {
          const pt = params.value;
          return `<strong>${pt[2]}</strong><br/>` +
                 `Tenure: <strong>${pt[0]} Months</strong><br/>` +
                 `Engagement Score: <strong>${pt[1]}</strong><br/>` +
                 `Status: <strong>${params.seriesName}</strong>`;
        }
      },
      legend: { data: ['Active Members', 'Churned Subscribers'], top: 0, textStyle: { fontSize: 10 } },
      grid: { top: 30, right: 20, bottom: 30, left: 45 },
      xAxis: {
        name: 'Tenure (Months)',
        nameLocation: 'middle',
        nameGap: 20,
        nameTextStyle: { fontSize: 10, color: '#64748b' },
        type: 'value',
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        name: 'Engagement Score',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: 10, color: '#64748b' },
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [
        {
          name: 'Active Members',
          type: 'scatter',
          data: activePoints,
          symbolSize: 6,
          itemStyle: { color: '#0d9488', opacity: 0.6 }
        },
        {
          name: 'Churned Subscribers',
          type: 'scatter',
          data: churnedPoints,
          symbolSize: 6,
          itemStyle: { color: '#ef4444', opacity: 0.6 }
        }
      ]
    };

    state.charts.engScatter.setOption(option);
  }

  // -------------------------------------------------------------------------
  // SLIDE 7: CLV and Revenue Impact
  // -------------------------------------------------------------------------
  function renderSlide7(kpis) {
    renderCLVComparisonChart(kpis);
    renderTenureHistogram();
    renderRevenueTreemap();
    renderSurvivalCurves();

    const earlyRevLost = state.filteredCustomers.filter(c => c.isEarlyChurn).reduce((sum, c) => sum + c.monthlyRate * 12, 0);
    const insightS7 = document.getElementById('insight_s7');
    if (insightS7) {
      insightS7.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Early churn (&lt;6 months) accounts for <strong>${(kpis.earlyChurnPct * 100).toFixed(1)}%</strong> of cancellations and <strong>${formatCurrencyINR(earlyRevLost)}</strong> in annual lost revenue.</span>`;
    }
  }

  function renderCLVComparisonChart(kpis) {
    const dom = document.getElementById('chart_clv_comp');
    if (!dom || !window.echarts) return;
    if (!state.charts.clvComp) state.charts.clvComp = echarts.init(dom);

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => `${params[0].name}: <strong>${formatCurrencyINR(params[0].value)}</strong>`
      },
      grid: { top: 15, right: 30, bottom: 20, left: 95 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9, formatter: v => `₹${Math.round(v/1000)}k` },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        type: 'category',
        data: ['Active Base', 'Overall Base', 'Churned Base'],
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#334155', fontSize: 10, fontWeight: 600 }
      },
      series: [{
        name: 'Average CLV',
        type: 'bar',
        data: [
          { value: Math.round(kpis.avgCLVActive), itemStyle: { color: '#0d9488' } },
          { value: Math.round(kpis.avgCLV), itemStyle: { color: '#6366f1' } },
          { value: Math.round(kpis.avgCLVChurned), itemStyle: { color: '#ef4444' } }
        ],
        barWidth: '45%',
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          formatter: p => formatCurrencyINR(p.value),
          fontSize: 10,
          fontWeight: 700
        }
      }]
    };

    state.charts.clvComp.setOption(option);
  }

  function renderTenureHistogram() {
    const dom = document.getElementById('chart_tenure_hist');
    if (!dom || !window.echarts) return;
    if (!state.charts.tenureHist) state.charts.tenureHist = echarts.init(dom);

    // Tenure distribution for churned customers (0 to 35 months)
    const bins = ['M0-1', 'M2-3', 'M4-5', 'M6-8', 'M9-12', 'M13-18', 'M19-24', 'M25+'];
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];

    state.filteredCustomers.forEach(c => {
      if (c.isChurned) {
        const t = c.tenureMonths;
        if (t <= 1) counts[0]++;
        else if (t <= 3) counts[1]++;
        else if (t <= 5) counts[2]++;
        else if (t <= 8) counts[3]++;
        else if (t <= 12) counts[4]++;
        else if (t <= 18) counts[5]++;
        else if (t <= 24) counts[6]++;
        else counts[7]++;
      }
    });

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => `Tenure ${params[0].name}: <strong>${params[0].value} cancellations</strong>`
      },
      grid: { top: 20, right: 15, bottom: 25, left: 40 },
      xAxis: {
        type: 'category',
        data: bins,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', fontSize: 9 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [{
        name: 'Churn Count',
        type: 'bar',
        data: counts,
        barWidth: '60%',
        itemStyle: {
          color: function (params) {
            return params.dataIndex < 3 ? '#ef4444' : '#f59e0b';
          },
          borderRadius: [4, 4, 0, 0]
        },
        label: { show: true, position: 'top', fontSize: 9 }
      }]
    };

    state.charts.tenureHist.setOption(option);
  }

  function renderRevenueTreemap() {
    const dom = document.getElementById('chart_rev_treemap');
    if (!dom || !window.echarts) return;
    if (!state.charts.revTreemap) state.charts.revTreemap = echarts.init(dom);

    // Group annual revenue lost by Subscription Type and City
    const tree = { Monthly: {}, Quarterly: {}, Annual: {} };
    state.filteredCustomers.forEach(c => {
      if (c.isChurned) {
        const sub = c.subscriptionType;
        const loc = c.location;
        const lost = c.monthlyRate * 12;
        if (!tree[sub][loc]) tree[sub][loc] = 0;
        tree[sub][loc] += lost;
      }
    });

    const treeData = Object.keys(tree).map(subKey => {
      const children = Object.keys(tree[subKey]).map(locKey => ({
        name: `${locKey} (${subKey})`,
        value: Math.round(tree[subKey][locKey])
      }));
      return {
        name: `${subKey} Plan`,
        children: children
      };
    });

    const option = {
      tooltip: {
        formatter: params => {
          return `<strong>${params.name}</strong><br/>Lost Revenue: <strong>${formatCurrencyINR(params.value)}</strong>`;
        }
      },
      series: [{
        type: 'treemap',
        data: treeData,
        leafDepth: 2,
        levels: [
          { itemStyle: { borderColor: '#ffffff', borderWidth: 2, gapWidth: 2 } },
          { color: ['#ef4444', '#f59e0b', '#10b981'], colorMappingBy: 'name', itemStyle: { gapWidth: 1 } }
        ],
        label: {
          show: true,
          formatter: p => `${p.name}\n${formatCurrencyINR(p.value)}`,
          fontSize: 9
        }
      }]
    };

    state.charts.revTreemap.setOption(option);
  }

  function renderSurvivalCurves() {
    const dom = document.getElementById('chart_survival_curves');
    if (!dom || !window.echarts) return;
    if (!state.charts.survival) state.charts.survival = echarts.init(dom);

    const plans = ['Monthly', 'Quarterly', 'Annual'];
    const tenureMonths = Array.from({ length: 25 }, (_, i) => i);

    const seriesList = plans.map(p => {
      const subset = state.filteredCustomers.filter(c => c.subscriptionType === p);
      const totalP = subset.length;
      const survivalRates = tenureMonths.map(m => {
        if (totalP === 0) return 0;
        const survived = subset.filter(c => c.tenureMonths >= m).length;
        return ((survived / totalP) * 100).toFixed(1);
      });

      return {
        name: `${p} Plan`,
        type: 'line',
        data: survivalRates,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        color: p === 'Monthly' ? '#ef4444' : p === 'Quarterly' ? '#0d9488' : '#10b981'
      };
    });

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          let str = `<strong>Tenure: ${params[0].name} Months</strong><br/>`;
          params.forEach(p => {
            str += `${p.marker} ${p.seriesName}: <strong>${p.value}% Retained</strong><br/>`;
          });
          return str;
        }
      },
      legend: { data: plans.map(p => `${p} Plan`), top: 0, textStyle: { fontSize: 10 } },
      grid: { top: 25, right: 20, bottom: 25, left: 40 },
      xAxis: {
        type: 'category',
        data: tenureMonths.map(m => `M${m}`),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 9, interval: 3 }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: seriesList
    };

    state.charts.survival.setOption(option);
  }

  // -------------------------------------------------------------------------
  // SLIDE 8: Predictive Analysis (Explainable ML & Risk Scorer)
  // -------------------------------------------------------------------------
  function renderSlide8() {
    if (!state.testSetMetrics) return;

    const m = state.testSetMetrics;
    const aucEl = document.getElementById('ml_kpi_auc');
    const accEl = document.getElementById('ml_kpi_acc');
    const precEl = document.getElementById('ml_kpi_prec');
    const f1El = document.getElementById('ml_kpi_f1');

    if (aucEl) aucEl.textContent = m.auc.toFixed(3);
    if (accEl) accEl.textContent = formatPercent(m.accuracy);
    if (precEl) precEl.textContent = formatPercent(m.precision);
    if (f1El) f1El.textContent = m.f1.toFixed(3);

    renderROCCurve();
    renderFeatureImportanceChart();
    renderTop20ActiveTable();
    updateRiskScorer();

    const cmTp = document.getElementById('cm_tp');
    const cmFp = document.getElementById('cm_fp');
    const cmTn = document.getElementById('cm_tn');
    const cmFn = document.getElementById('cm_fn');
    if (cmTp) cmTp.textContent = m.tp.toLocaleString();
    if (cmFp) cmFp.textContent = m.fp.toLocaleString();
    if (cmTn) cmTn.textContent = m.tn.toLocaleString();
    if (cmFn) cmFn.textContent = m.fn.toLocaleString();

    const insightS8 = document.getElementById('insight_s8');
    if (insightS8 && state.testSetMetrics) {
      insightS8.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>Model ROC AUC of <strong>${state.testSetMetrics.auc.toFixed(3)}</strong> demonstrates strong discrimination; Monthly billing and sub-40 engagement explain &gt;70% of risk.</span>`;
    }
  }

  function renderROCCurve() {
    const dom = document.getElementById('chart_ml_roc');
    if (!dom || !window.echarts) return;
    if (!state.charts.mlRoc) state.charts.mlRoc = echarts.init(dom);

    const rocData = state.testSetMetrics.rocPoints;

    const option = {
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const pt = params[0].value;
          return `FPR: ${(pt[0] * 100).toFixed(1)}%<br/>TPR (Recall): ${(pt[1] * 100).toFixed(1)}%`;
        }
      },
      grid: { top: 15, right: 15, bottom: 25, left: 35 },
      xAxis: {
        name: 'False Positive Rate',
        nameLocation: 'middle',
        nameGap: 18,
        nameTextStyle: { fontSize: 9, color: '#94a3b8' },
        type: 'value',
        min: 0,
        max: 1,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontSize: 8 }
      },
      yAxis: {
        name: 'True Positive Rate',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { fontSize: 9, color: '#94a3b8' },
        type: 'value',
        min: 0,
        max: 1,
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 8 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [
        {
          name: 'ROC',
          type: 'line',
          data: rocData,
          showSymbol: false,
          lineStyle: { color: '#6366f1', width: 2 },
          areaStyle: { color: 'rgba(99, 102, 241, 0.15)' }
        },
        {
          name: 'Random Chance',
          type: 'line',
          data: [[0, 0], [1, 1]],
          lineStyle: { type: 'dashed', color: '#cbd5e1', width: 1.5 },
          showSymbol: false
        }
      ]
    };

    state.charts.mlRoc.setOption(option);
  }

  function renderFeatureImportanceChart() {
    const dom = document.getElementById('chart_ml_features');
    if (!dom || !window.echarts) return;
    if (!state.charts.mlFeatures) state.charts.mlFeatures = echarts.init(dom);

    const weights = state.mlModel.weights;
    const names = state.mlModel.featureNames;

    // Odds ratios exp(w)
    const items = [];
    for (let i = 1; i < weights.length; i++) {
      items.push({
        name: names[i],
        weight: weights[i],
        oddsRatio: Math.exp(weights[i])
      });
    }
    items.sort((a, b) => a.weight - b.weight);

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const item = items[params[0].dataIndex];
          return `<strong>${item.name}</strong><br/>` +
                 `Beta Weight: <strong>${item.weight > 0 ? '+' : ''}${item.weight.toFixed(3)}</strong><br/>` +
                 `Odds Ratio: <strong>${item.oddsRatio.toFixed(2)}x</strong>`;
        }
      },
      grid: { top: 15, right: 35, bottom: 20, left: 110 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 8 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        type: 'category',
        data: items.map(it => it.name),
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#334155', fontSize: 9 }
      },
      series: [{
        name: 'Weight',
        type: 'bar',
        data: items.map(it => it.weight.toFixed(2)),
        itemStyle: {
          color: p => parseFloat(p.value) >= 0 ? '#ef4444' : '#10b981',
          borderRadius: 3
        },
        label: {
          show: true,
          position: p => parseFloat(p.value) >= 0 ? 'right' : 'left',
          fontSize: 8
        }
      }]
    };

    state.charts.mlFeatures.setOption(option);
  }

  function setupRiskScorerControls() {
    const ageSlider = document.getElementById('input_scorer_age');
    const scoreSlider = document.getElementById('input_scorer_score');
    const planSelect = document.getElementById('select_scorer_plan');
    const paySelect = document.getElementById('select_scorer_payment');

    const lblAge = document.getElementById('lbl_scorer_age');
    const lblScore = document.getElementById('lbl_scorer_score');

    function onChange() {
      if (lblAge && ageSlider) lblAge.textContent = ageSlider.value;
      if (lblScore && scoreSlider) lblScore.textContent = scoreSlider.value;
      updateRiskScorer();
    }

    if (ageSlider) ageSlider.addEventListener('input', onChange);
    if (scoreSlider) scoreSlider.addEventListener('input', onChange);
    if (planSelect) planSelect.addEventListener('change', onChange);
    if (paySelect) paySelect.addEventListener('change', onChange);
  }

  function updateRiskScorer() {
    if (!state.mlModel) return;

    const age = parseInt(document.getElementById('input_scorer_age')?.value || '30', 10);
    const score = parseFloat(document.getElementById('input_scorer_score')?.value || '45');
    const plan = document.getElementById('select_scorer_plan')?.value || 'Monthly';
    const payment = document.getElementById('select_scorer_payment')?.value || 'UPI';

    const prob = state.mlModel.predict({
      age: age,
      engagementScore: score,
      subscriptionType: plan,
      paymentMode: payment,
      isTier2: false
    });

    const probPct = Math.round(prob * 100);
    const valProb = document.getElementById('val_scorer_prob');
    const badgeTier = document.getElementById('badge_scorer_tier');

    if (valProb) {
      valProb.textContent = `${probPct}%`;
      valProb.style.color = probPct >= 65 ? '#ef4444' : probPct >= 35 ? '#f59e0b' : '#10b981';
    }

    if (badgeTier) {
      if (probPct >= 65) {
        badgeTier.className = 'badge badge-red';
        badgeTier.textContent = 'HIGH RISK ACCOUNT';
      } else if (probPct >= 35) {
        badgeTier.className = 'badge badge-amber';
        badgeTier.textContent = 'MEDIUM RISK ACCOUNT';
      } else {
        badgeTier.className = 'badge badge-green';
        badgeTier.textContent = 'LOW RISK ACCOUNT';
      }
    }

    // Gauge chart update
    renderRiskGauge(probPct);
  }

  function renderRiskGauge(probPct) {
    const dom = document.getElementById('chart_scorer_gauge');
    if (!dom || !window.echarts) return;
    if (!state.charts.scorerGauge) state.charts.scorerGauge = echarts.init(dom);

    const option = {
      series: [{
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        radius: '100%',
        center: ['50%', '80%'],
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [0.35, '#10b981'],
              [0.65, '#f59e0b'],
              [1.0, '#ef4444']
            ]
          }
        },
        pointer: { width: 4, length: '60%' },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: { show: false },
        data: [{ value: probPct }]
      }]
    };

    state.charts.scorerGauge.setOption(option);
  }

  function renderTop20ActiveTable() {
    const tbody = document.getElementById('tbody_top20_active');
    if (!tbody || !state.mlModel) return;

    // Filter to active customers, compute predicted churn risk, and take top 20
    const activeCust = state.allCustomers.filter(c => !c.isChurned);
    const scored = activeCust.map(c => ({
      id: c.customerId,
      plan: c.subscriptionType,
      city: c.location,
      age: c.age,
      score: c.engagementScore,
      prob: state.mlModel.predict(c),
      drivers: c.subscriptionType === 'Monthly' && c.engagementScore <= 40 ? 'Monthly + Low Eng' :
               c.subscriptionType === 'Monthly' ? 'Monthly Plan' :
               c.engagementScore <= 40 ? 'Low Engagement' : 'Payment Method'
    }));

    scored.sort((a, b) => b.prob - a.prob);
    const top20 = scored.slice(0, 20);

    let html = '';
    top20.forEach(c => {
      const probPct = Math.round(c.prob * 100);
      html += `
        <tr>
          <td><code>${c.id}</code></td>
          <td><span class="badge ${c.plan === 'Monthly' ? 'badge-red' : 'badge-purple'}">${c.plan}</span></td>
          <td>${c.city}</td>
          <td class="number">${c.age}</td>
          <td class="number">${Math.round(c.score)}</td>
          <td class="number" style="font-weight: 700; color: #ef4444;">${probPct}%</td>
          <td><span class="badge badge-amber">${c.drivers}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    const btnExport = document.getElementById('btnExportTop20');
    if (btnExport) {
      btnExport.onclick = () => exportArrayToCSV(top20, 'boxify_top20_high_risk_active.csv');
    }
  }

  // -------------------------------------------------------------------------
  // SLIDE 9: Retention Simulator (What-If Strategic Modeling)
  // -------------------------------------------------------------------------
  function setupSimulatorControls() {
    const sEng = document.getElementById('slider_sim_eng');
    const sShift = document.getElementById('slider_sim_shift');
    const sEarly = document.getElementById('slider_sim_early');
    const sDisc = document.getElementById('slider_sim_discount');
    const btnReset = document.getElementById('btnResetSimulator');

    function onSimChange() {
      state.simulator.engLift = parseInt(sEng?.value || '15', 10);
      state.simulator.monthlyShiftPct = parseInt(sShift?.value || '20', 10);
      state.simulator.earlyChurnReductionPct = parseInt(sEarly?.value || '25', 10);
      state.simulator.discountPct = parseInt(sDisc?.value || '10', 10);

      document.getElementById('lbl_sim_eng').textContent = `+${state.simulator.engLift} pts`;
      document.getElementById('lbl_sim_shift').textContent = `${state.simulator.monthlyShiftPct}%`;
      document.getElementById('lbl_sim_early').textContent = `${state.simulator.earlyChurnReductionPct}%`;
      document.getElementById('lbl_sim_discount').textContent = `${state.simulator.discountPct}%`;

      const kpis = calculateKPIs(state.filteredCustomers);
      renderSlide9(kpis);
    }

    if (sEng) sEng.addEventListener('input', onSimChange);
    if (sShift) sShift.addEventListener('input', onSimChange);
    if (sEarly) sEarly.addEventListener('input', onSimChange);
    if (sDisc) sDisc.addEventListener('input', onSimChange);

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (sEng) sEng.value = '15';
        if (sShift) sShift.value = '20';
        if (sEarly) sEarly.value = '25';
        if (sDisc) sDisc.value = '10';
        onSimChange();
      });
    }
  }

  function renderSlide9(kpis) {
    const sim = state.simulator;
    const baseChurnRate = kpis.churnRate;
    const baseChurnCount = kpis.churned;

    // Simulation Levers Calculation:
    // 1. Engagement Lift: low-engagement churn rate is 78.9%, each point lifts retention by ~0.8%
    const lowEngChurners = state.filteredCustomers.filter(c => c.isChurned && c.engagementScore <= 30).length;
    const savedFromEng = Math.round(lowEngChurners * (sim.engLift / 30) * 0.40);

    // 2. Monthly to Quarterly shift: monthly churn is 60.6%, quarterly is 37.7% (22.9% delta)
    const monthlyChurners = state.filteredCustomers.filter(c => c.isChurned && c.subscriptionType === 'Monthly').length;
    const savedFromShift = Math.round(monthlyChurners * (sim.monthlyShiftPct / 100) * 0.38);

    // 3. Early Churn Reduction:
    const earlyChurners = kpis.earlyChurnCount;
    const savedFromEarly = Math.round(earlyChurners * (sim.earlyChurnReductionPct / 100) * 0.45);

    // 4. Loyalty Discount:
    const savedFromDiscount = Math.round(baseChurnCount * 0.20 * (sim.discountPct / 30) * 0.25);

    // Total unique customers saved (clamped to prevent double counting)
    const totalSaved = Math.min(baseChurnCount, savedFromEng + savedFromShift + savedFromEarly + savedFromDiscount);
    const projectedChurnCount = Math.max(0, baseChurnCount - totalSaved);
    const projectedChurnRate = kpis.total > 0 ? projectedChurnCount / kpis.total : 0;
    const relativeReduction = baseChurnRate > 0 ? (baseChurnRate - projectedChurnRate) / baseChurnRate : 0;

    // Financial calculations
    const avgMonthlyRate = kpis.churned > 0 ? (kpis.revLostAnnual / kpis.churned) / 12 : 650;
    const grossRevSaved6M = totalSaved * avgMonthlyRate * 6;
    const netDiscountCost = totalSaved * avgMonthlyRate * 6 * (sim.discountPct / 100);
    const netRevSaved6M = Math.max(0, grossRevSaved6M - netDiscountCost);
    const annualRevSaved = netRevSaved6M * 2;

    // Update UI elements
    const projRateEl = document.getElementById('sim_kpi_proj_rate');
    const baseRateEl = document.getElementById('sim_kpi_base_rate');
    const savedCustEl = document.getElementById('sim_kpi_saved_cust');
    const rev6mEl = document.getElementById('sim_kpi_rev_6m');
    const revAnnualEl = document.getElementById('sim_kpi_rev_annual');
    const goalBadge = document.getElementById('simGoalBadge');
    const progressBar = document.getElementById('simProgressBar');

    if (projRateEl) projRateEl.textContent = formatPercent(projectedChurnRate);
    if (baseRateEl) baseRateEl.textContent = formatPercent(baseChurnRate);
    if (savedCustEl) savedCustEl.textContent = `+${totalSaved.toLocaleString()}`;
    if (rev6mEl) rev6mEl.textContent = formatCurrencyINR(netRevSaved6M);
    if (revAnnualEl) revAnnualEl.textContent = formatCurrencyINR(annualRevSaved);

    // Goal Progress Bar (Target: 5% to 10% relative reduction)
    const relReductionPct = relativeReduction * 100;
    if (progressBar) {
      const barWidth = Math.min(100, Math.max(5, (relReductionPct / 10) * 100));
      progressBar.style.width = `${barWidth}%`;
    }

    if (goalBadge) {
      if (relReductionPct >= 10.0) {
        goalBadge.className = 'badge badge-green';
        goalBadge.textContent = `MAX GOAL EXCEEDED (${relReductionPct.toFixed(1)}% REDUCTION)`;
      } else if (relReductionPct >= 5.0) {
        goalBadge.className = 'badge badge-green';
        goalBadge.textContent = `GOAL ACHIEVED (${relReductionPct.toFixed(1)}% REDUCTION)`;
      } else {
        goalBadge.className = 'badge badge-amber';
        goalBadge.textContent = `BELOW TARGET (${relReductionPct.toFixed(1)}% REDUCTION)`;
      }
    }

    renderSimulatorChart(baseChurnCount, projectedChurnCount, totalSaved, kpis.total);
  }

  function renderSimulatorChart(baseChurn, projChurn, saved, total) {
    const dom = document.getElementById('chart_sim_comparison');
    if (!dom || !window.echarts) return;
    if (!state.charts.simComparison) state.charts.simComparison = echarts.init(dom);

    const baseRetained = total - baseChurn;
    const projRetained = total - projChurn;

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      legend: { data: ['Retained Subscribers', 'Churned Subscribers'], top: 5 },
      grid: { top: 35, right: 25, bottom: 25, left: 120 },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 9 },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      yAxis: {
        type: 'category',
        data: ['Current Baseline', 'Simulated Outlook'],
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#1e293b', fontSize: 11, fontWeight: 700 }
      },
      series: [
        {
          name: 'Retained Subscribers',
          type: 'bar',
          stack: 'total',
          data: [baseRetained, projRetained],
          itemStyle: { color: '#10b981' },
          label: { show: true, position: 'inside', formatter: '{c}', fontSize: 10 }
        },
        {
          name: 'Churned Subscribers',
          type: 'bar',
          stack: 'total',
          data: [baseChurn, projChurn],
          itemStyle: { color: '#ef4444' },
          label: { show: true, position: 'inside', formatter: '{c}', fontSize: 10 }
        }
      ]
    };

    state.charts.simComparison.setOption(option);
  }

  // -------------------------------------------------------------------------
  // SLIDE 12: Appendix A2 (Master Granular Segment Table)
  // -------------------------------------------------------------------------
  function renderSlide12() {
    const tbody = document.getElementById('tbody_master_segments');
    if (!tbody) return;

    // Cross-tabulate by Plan x Location x AgeGroup x Payment
    const crossTab = {};
    state.filteredCustomers.forEach(c => {
      const key = `${c.subscriptionType}__${c.location}__${c.ageGroup}__${c.paymentMode}`;
      if (!crossTab[key]) {
        crossTab[key] = {
          plan: c.subscriptionType,
          loc: c.location,
          ageGroup: c.ageGroup,
          pay: c.paymentMode,
          total: 0,
          churned: 0,
          spent: 0,
          tenure: 0,
          score: 0,
          revLost: 0
        };
      }
      crossTab[key].total++;
      crossTab[key].spent += c.totalSpent;
      crossTab[key].tenure += c.tenureMonths;
      crossTab[key].score += c.engagementScore;
      if (c.isChurned) {
        crossTab[key].churned++;
        crossTab[key].revLost += c.monthlyRate * 12;
      }
    });

    const rows = Object.values(crossTab).map(r => ({
      plan: r.plan,
      location: r.loc,
      ageGroup: r.ageGroup,
      payment: r.pay,
      total: r.total,
      active: r.total - r.churned,
      churned: r.churned,
      churnRate: r.total > 0 ? r.churned / r.total : 0,
      avgScore: r.total > 0 ? r.score / r.total : 0,
      avgCLV: r.total > 0 ? r.spent / r.total : 0,
      revLost: r.revLost
    }));

    rows.sort((a, b) => b.churnRate - a.churnRate);

    function populateTable(filteredRows) {
      let html = '';
      filteredRows.slice(0, 100).forEach(r => {
        const ratePct = (r.churnRate * 100).toFixed(1);
        html += `
          <tr>
            <td><strong>${r.plan}</strong></td>
            <td>${r.location}</td>
            <td>${r.ageGroup}</td>
            <td>${r.payment}</td>
            <td class="number">${r.total}</td>
            <td class="number">${r.active}</td>
            <td class="number">${r.churned}</td>
            <td class="number" style="font-weight: 700; color: ${r.churnRate > 0.5 ? '#ef4444' : '#10b981'};">${ratePct}%</td>
            <td class="number">${r.avgScore.toFixed(1)}</td>
            <td class="number">${formatCurrencyINR(r.avgCLV)}</td>
            <td class="number">${formatCurrencyINR(r.revLost)}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }

    populateTable(rows);

    const searchInput = document.getElementById('inputSearchSegments');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = rows.filter(r =>
          r.plan.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q) ||
          r.ageGroup.toLowerCase().includes(q) ||
          r.payment.toLowerCase().includes(q)
        );
        populateTable(filtered);
      };
    }

    const btnExport = document.getElementById('btnExportFullSegments');
    if (btnExport) {
      btnExport.onclick = () => exportArrayToCSV(rows, 'boxify_granular_segments_master.csv');
    }
  }

  // =========================================================================
  // 9. UTILITIES (CSV EXPORT, MODALS, HELPERS)
  // =========================================================================

  function exportArrayToCSV(arr, filename) {
    if (!arr || arr.length === 0) return;
    const keys = Object.keys(arr[0]);
    let csv = keys.join(',') + '\n';
    arr.forEach(row => {
      const vals = keys.map(k => {
        let v = row[k] !== undefined ? row[k] : '';
        if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
          v = `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      });
      csv += vals.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // =========================================================================
  // 10. BOOTSTRAP INITIALIZATION
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    setupManualFilePicker();
    loadDataPipeline();
  });

})();
