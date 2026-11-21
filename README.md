# Boxify Customer Churn & Retention Intelligence Deck

An executive-level, interactive, HTML-based BI presentation and dashboard report designed for the **Boxify** data analyst case study.

Developed as a Power BI-style command deck featuring dynamic analytical computations, multi-dimensional cross-filtering, cohort retention analysis, in-browser explainable machine learning (logistic regression), interactive risk scoring, and strategic what-if sensitivity simulation.

---

## Quick Start (How to Run)

### Method 1: Double-Click (Zero Setup, 100% Offline)
Simply double-click **`index.html`** in this folder.
- The deck automatically loads the data from the auto-generated `data.js` backup.
- Apache ECharts and PapaParse are pre-packaged in the local `/lib` directory, so the presentation operates completely offline without internet or local web servers.

### Method 2: Local Web Server (Direct CSV Fetch)
If you prefer running via HTTP/HTTPS:
```bash
# Using Python 3:
python -m http.server 8000

# Or using Node.js:
npx serve
```
Then navigate to `http://localhost:8000` in your browser. The app will directly fetch and parse `./boxify_customers.csv` on the fly.

### Method 3: Drag-and-Drop / Manual File Selection
If both direct fetch and `data.js` are unavailable, the presentation launches a built-in file picker and drag-and-drop zone. Select `boxify_customers.csv` directly from your disk—all parsing and processing executes 100% locally in your browser.

---

## Project Structure

```
boxify-churn-deck/
├── index.html                   # Master presentation shell & DOM layout
├── styles.css                   # Fluent / Power BI design system & print stylesheet
├── app.js                       # Analytical engine, ML model, slicers & chart controllers
├── boxify_customers.csv         # 5,000 raw subscriber records
├── data.js                      # In-browser data backup for file:// protocol
├── boxify-churn-deck-single.html# Standalone all-in-one single HTML build
├── README.md                    # Project documentation & operational guide
└── lib/
    ├── echarts.min.js           # Pinned Apache ECharts 5.5.0 local copy
    └── papaparse.min.js         # Pinned PapaParse 5.4.1 local copy
```

---

## Dataset & Business Snapshot

- **Source File:** `boxify_customers.csv` (5,000 records, 11 dimensions)
- **Snapshot Date:** 21 November 2026
- **Observation Window:** 36 Operating Months (November 2023 – November 2026)
- **Currency:** Indian Rupee (₹ INR) with Lakh/Crore conversions
- **Headline Metrics:**
  - Total Subscribers: **5,000** (Active: **2,646** | Churned: **2,354**)
  - Baseline Portfolio Churn Rate: **47.08%**
  - Annualised Lost Revenue: **₹2.13 Crore** (₹21,341,943)
  - Active vs Churned CLV: **₹9,082** vs **₹4,868** (46.4% value destruction)

---

## Core Deck Structure (10 Core Slides + 2 Appendices)

1. **Executive Summary:** Headline KPI cards with count-up animations, core takeaways, and business targets.
2. **Business Context & Scope:** Strategic framing, unit economics, definitions, formulas, and constraints.
3. **Data Overview & Quality Assurance:** Comprehensive data dictionary, validation checks (0 invalid nulls, 0 duplicate IDs), and profiling distributions.
4. **KPI Command Center:** 8 Power BI metric cards, monthly churn trend line, inflow/outflow bars, and cohort retention heatmap.
5. **Segment Risk Breakdown:** Churn by Plan, Payment Mode, Age, Location, and Gender; interactive ranked table with conditional data bars and click-to-cross-filter.
6. **Engagement vs Churn:** Engagement band churn rates, scatter plot (score vs tenure), Point-Biserial correlation (r = -0.3791), and the Score 40 cliff analysis.
7. **CLV & Revenue Attrition:** Active vs Churned CLV, tenure hazard histogram, revenue lost treemap, and Kaplan-Meier survival curves.
8. **Predictive Analytics (ML):** Pure JS Logistic Regression (80/20 train/test split, 0.830 ROC AUC, 75.2% accuracy), feature importance odds ratios, interactive Risk Scorer widget, and Top 20 At-Risk Active Subscribers table.
9. **Retention Simulator (What-If):** Interactive sliders for engagement lift, plan upgrades, early churn reduction, and retention discounts with real-time target tracking (5%–10% goal).
10. **Strategic Recommendations:** Phase 1 Quick Wins (0–30 days) vs Phase 2 Scaled Strategies (3–6 months), segment playbooks, and governance scorecards.
- **Appendix A1:** Mathematical and algorithmic derivations (Logistic regression gradient descent, Mann-Whitney U AUC, survival formulas).
- **Appendix A2:** Granular segment master table with in-table search, sorting, and CSV export.

---

## Interactivity & Power BI Capabilities

- **Real-Time Cross-Filtering:** Slicer sidebar enables filtering across Subscription Plan, Location, Age Group, Payment Mode, Gender, Join Year, and Status.
- **Click-to-Filter Visuals:** Clicking on any chart bar in the Segment Analysis slide instantly cross-filters all slides.
- **Dynamic Chart Insights:** Under every chart, a contextual callout sentence explains the exact operational takeaway.
- **Table / Chart Toggle:** Easily toggle between visual graphics and tabular raw numbers.
- **Exporting Data:** Download CSV buttons on all critical tables.
- **PDF Export:** Press `Ctrl + P` (or click "PDF Export" in the header) for a clean, 1-slide-per-page landscape PDF output with charts intact.
- **Fullscreen Mode:** Press `F` to present in distraction-free fullscreen.

---

## How to Update the Dataset

To swap in an updated CSV file:
1. Replace `boxify_customers.csv` with your new file (keeping the same 11 column headers).
2. If using Method 1 (double-click without server), update `data.js` by running:
   ```bash
   python -c "import csv, json; rows=list(csv.DictReader(open('boxify_customers.csv', encoding='utf-8'))); open('data.js','w', encoding='utf-8').write('window.BOXIFY_DATA = ' + json.dumps(rows) + ';')"
   ```
3. Refresh `index.html`—all KPIs, charts, models, and tables will recompute automatically!
