// Ventify Finance - homepage "Real-time dashboards" showcase.
// Illustrative only (like the Live Market Watch ticker on the dashboard) -
// no login, no per-client data. Just gives visitors a feel for the kind of
// reporting the platform produces, in the same visual style as the real
// in-app dashboard (see public/js/dashboard.js for the authenticated version).

const VENTIFY_PALETTE = ["#0b3d66", "#14568c", "#2f7fc1", "#6fa8d8", "#1e8e5a", "#b8860b"];

Chart.defaults.font.family = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
Chart.defaults.color = "#5b6b7a";

// --- 1. Platform Revenue & Profit Trend (line/area) ------------------------
new Chart(document.getElementById("chart-revenue-trend"), {
  type: "line",
  data: {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    datasets: [
      {
        label: "Revenue",
        data: [3.1, 3.4, 3.3, 3.8, 4.1, 4.3, 4.6, 4.9],
        borderColor: "#2f7fc1",
        backgroundColor: "rgba(47,127,193,0.15)",
        fill: true,
        tension: 0.35,
      },
      {
        label: "Profit",
        data: [0.9, 1.0, 0.95, 1.2, 1.3, 1.35, 1.5, 1.6],
        borderColor: "#1e8e5a",
        backgroundColor: "rgba(30,142,90,0.12)",
        fill: true,
        tension: 0.35,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
    scales: { y: { ticks: { callback: (v) => "$" + v + "M" } } },
  },
});

// --- 2. Client Companies by Industry (doughnut) -----------------------------
new Chart(document.getElementById("chart-industries"), {
  type: "doughnut",
  data: {
    labels: ["Manufacturing & Industrial", "Retail & Consumer", "Energy & Resources", "Logistics & Transportation", "Food & Beverage", "Other"],
    datasets: [
      {
        data: [26, 19, 16, 14, 13, 12],
        backgroundColor: VENTIFY_PALETTE,
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } },
  },
});

// --- 3. Invoices by Status (bar) --------------------------------------------
new Chart(document.getElementById("chart-invoice-status"), {
  type: "bar",
  data: {
    labels: ["Paid", "Pending", "Overdue"],
    datasets: [
      {
        label: "Share of invoices",
        data: [68, 22, 10],
        backgroundColor: ["#1e8e5a", "#b8860b", "#c0392b"],
        borderRadius: 6,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { ticks: { callback: (v) => v + "%" }, max: 100 } },
  },
});

// --- 4. Monthly Transaction Volume (bar + line combo) -----------------------
new Chart(document.getElementById("chart-transactions"), {
  data: {
    labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
    datasets: [
      {
        type: "bar",
        label: "Transactions processed",
        data: [1180, 1340, 1290, 1510, 1620, 1780],
        backgroundColor: "#2f7fc1",
        borderRadius: 5,
        order: 2,
      },
      {
        type: "line",
        label: "Total value ($M)",
        data: [2.1, 2.4, 2.3, 2.7, 2.9, 3.2],
        borderColor: "#0b3d66",
        backgroundColor: "#0b3d66",
        yAxisID: "y1",
        tension: 0.3,
        order: 1,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
    scales: {
      y: { position: "left", title: { display: true, text: "Transactions" } },
      y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "$M" } },
    },
  },
});
