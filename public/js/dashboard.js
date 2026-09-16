let currentUser = null;
let invoicesRaw = [];
let ordersRaw = [];

async function init() {
  const meRes = await fetch("/api/auth/me", { credentials: "include" });
  if (!meRes.ok) {
    window.location.href = "/";
    return;
  }
  currentUser = await meRes.json();

  document.getElementById("user-name").textContent = currentUser.fullName;
  document.getElementById("user-role").textContent = currentUser.role.replace("_", " ");
  document.getElementById("user-avatar").textContent = currentUser.fullName
    .split(" ").map((p) => p[0]).join("").slice(0, 2);
  document.getElementById("company-chip").textContent =
    currentUser.companyName || "All Clients (internal)";

  if (currentUser.role === "admin") {
    document.getElementById("nav-ai-settings").classList.remove("hidden");
    loadAISettings();
  }

  startMarketTicker();

  loadProfileCompany();
  await loadOverview();
  await loadInvoices();
  await loadPayroll();
  await loadInventory();
  await loadSuppliers();
  await loadOrders();
  await loadTransactions();
  await loadLastPayrollRun();
  await loadNotifications();
}

function fmt(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status) {
  const label = status.replace("_", " ");
  return `<span class="badge badge-${status}">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadOverview() {
  const res = await fetch("/api/dashboard-summary", { credentials: "include" });
  const data = await res.json();
  const records = data.records || [];

  const tbody = document.querySelector("#overview-table tbody");
  tbody.innerHTML = "";
  let totalRevenue = 0, totalExpenses = 0, totalProfit = 0;

  records.forEach((r) => {
    totalRevenue += r.revenue;
    totalExpenses += r.expenses;
    totalProfit += r.profit;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.month}</td><td>$${fmt(r.revenue)}</td><td>$${fmt(r.expenses)}</td><td>$${fmt(r.profit)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("summary-cards").innerHTML = `
    <div class="card"><div class="label">Total Revenue</div><div class="value">$${fmt(totalRevenue)}</div></div>
    <div class="card"><div class="label">Total Expenses</div><div class="value">$${fmt(totalExpenses)}</div></div>
    <div class="card"><div class="label">Net Profit</div><div class="value">$${fmt(totalProfit)}</div></div>
  `;

  renderRevenueChart(records);
}

// ---------------------------------------------------------------------------
// Overview chart (Chart.js, rendered from the same scoped records as the table)
// ---------------------------------------------------------------------------

let revenueChartInstance = null;

function renderRevenueChart(records) {
  const canvas = document.getElementById("revenue-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  revenueChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: records.map((r) => r.month),
      datasets: [
        {
          label: "Revenue",
          data: records.map((r) => r.revenue),
          borderColor: "#2f7fc1",
          backgroundColor: "rgba(47,127,193,0.15)",
          fill: true,
          tension: 0.35,
        },
        {
          label: "Expenses",
          data: records.map((r) => r.expenses),
          borderColor: "#c0392b",
          backgroundColor: "rgba(192,57,43,0.08)",
          fill: true,
          tension: 0.35,
        },
        {
          label: "Profit",
          data: records.map((r) => r.profit),
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
      scales: { y: { ticks: { callback: (v) => "$" + Number(v).toLocaleString() } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Live Market Watch ticker - simulated client-side only, purely decorative.
// Not backed by any API - never carries real or per-user data.
// ---------------------------------------------------------------------------

const TICKER_SEED = [
  { symbol: "VFX", name: "Ventify Finance", price: 128.44 },
  { symbol: "NRVX", name: "Norvex Logistics", price: 76.10 },
  { symbol: "BFA", name: "Brightfield Agro", price: 42.85 },
  { symbol: "SEP", name: "Solara Energy Partners", price: 210.33 },
  { symbol: "HPG", name: "Hallmark Print Group", price: 18.92 },
  { symbol: "CRM", name: "Cobalt Ridge Mining", price: 64.77 },
  { symbol: "UCS", name: "Union Coastal Shipping", price: 55.20 },
  { symbol: "APX", name: "Aldergate Pharmaceuticals", price: 301.15 },
  { symbol: "NRG", name: "Northlane Retail Group", price: 29.60 },
  { symbol: "FST", name: "Ferrovia Steelworks", price: 88.40 },
];

let tickerState = TICKER_SEED.map((t) => ({ ...t, prevPrice: t.price }));

function renderTicker() {
  const tbody = document.querySelector("#ticker-table tbody");
  if (!tbody) return;
  tbody.innerHTML = tickerState
    .map((t) => {
      const change = t.price - t.prevPrice;
      const pct = t.prevPrice ? (change / t.prevPrice) * 100 : 0;
      const dir = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat";
      const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
      return `<tr>
        <td>${t.symbol}</td>
        <td>${t.name}</td>
        <td>$${t.price.toFixed(2)}</td>
        <td class="ticker-${dir}">${arrow} ${Math.abs(pct).toFixed(2)}%</td>
      </tr>`;
    })
    .join("");
}

function tickMarket() {
  tickerState = tickerState.map((t) => {
    const drift = (Math.random() - 0.5) * (t.price * 0.02);
    const newPrice = Math.max(1, Math.round((t.price + drift) * 100) / 100);
    return { ...t, prevPrice: t.price, price: newPrice };
  });
  renderTicker();
}

function startMarketTicker() {
  renderTicker();
  setInterval(tickMarket, 2000);
}

async function loadInvoices() {
  const res = await fetch("/api/invoices", { credentials: "include" });
  invoicesRaw = await res.json();
  renderInvoices();
}

function renderInvoices() {
  const filter = document.getElementById("invoices-filter").value;
  const tbody = document.querySelector("#invoices-table tbody");
  tbody.innerHTML = "";
  invoicesRaw
    .filter((inv) => !filter || inv.issue_date.startsWith(filter))
    .forEach((inv) => {
      const tr = document.createElement("tr");
      const label = inv.client_name ? `${inv.invoice_number} (${inv.client_name})` : inv.invoice_number;
      tr.innerHTML = `<td>${label}</td><td>$${fmt(inv.amount)}</td><td>${statusBadge(inv.status)}</td><td>${inv.issue_date}</td>`;
      tbody.appendChild(tr);
    });
}

async function loadPayroll() {
  const res = await fetch("/api/payroll", { credentials: "include" });
  const employees = await res.json();
  const tbody = document.querySelector("#payroll-table tbody");
  tbody.innerHTML = "";
  employees.forEach((e) => {
    const tr = document.createElement("tr");
    const name = e.client_name ? `${e.full_name} (${e.client_name})` : e.full_name;
    tr.innerHTML = `<td>${name}</td><td>${e.position}</td><td>$${fmt(e.monthly_salary)}</td><td>${e.bank_name}</td><td>${e.bank_account}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadInventory() {
  const res = await fetch("/api/inventory", { credentials: "include" });
  const items = await res.json();
  const tbody = document.querySelector("#inventory-table tbody");
  tbody.innerHTML = "";
  items.forEach((i) => {
    const tr = document.createElement("tr");
    const name = i.client_name ? `${i.item_name} (${i.client_name})` : i.item_name;
    const lowStock = i.quantity < 10 ? ' style="color:#c0392b;font-weight:600;"' : "";
    tr.innerHTML = `<td>${name}</td><td${lowStock}>${i.quantity}</td><td>$${fmt(i.unit_value)}</td><td>$${fmt(i.total_value)}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadSuppliers() {
  const res = await fetch("/api/suppliers", { credentials: "include" });
  const suppliers = await res.json();
  const tbody = document.querySelector("#suppliers-table tbody");
  tbody.innerHTML = "";
  suppliers.forEach((s) => {
    const tr = document.createElement("tr");
    const name = s.client_name ? `${s.supplier_name} (${s.client_name})` : s.supplier_name;
    tr.innerHTML = `<td>${name}</td><td>${s.category}</td><td>${s.contact_email}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadOrders() {
  const res = await fetch("/api/purchase-orders", { credentials: "include" });
  ordersRaw = await res.json();
  renderOrders();
}

function renderOrders() {
  const filter = document.getElementById("orders-filter").value;
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";
  ordersRaw
    .filter((o) => !filter || o.order_date.startsWith(filter))
    .forEach((o) => {
      const tr = document.createElement("tr");
      const orderLabel = o.client_name ? `${o.order_number} (${o.client_name})` : o.order_number;
      tr.innerHTML = `<td>${orderLabel}</td><td>${o.supplier_name}</td><td>$${fmt(o.amount)}</td><td>${statusBadge(o.status)}</td><td>${o.order_date}</td>`;
      tbody.appendChild(tr);
    });
}

async function loadTransactions() {
  const res = await fetch("/api/transactions", { credentials: "include" });
  const txs = await res.json();
  const tbody = document.querySelector("#transactions-table tbody");
  tbody.innerHTML = "";
  txs.forEach((t) => {
    const tr = document.createElement("tr");
    const desc = t.client_name ? `${t.description} (${t.client_name})` : t.description;
    const sign = t.type === "credit" ? "+" : "−";
    const color = t.type === "credit" ? "#1e8e5a" : "#c0392b";
    tr.innerHTML = `<td>${t.tx_date}</td><td>${desc}</td><td>${statusBadge(t.type)}</td>
      <td style="color:${color};font-weight:600;">${sign}$${fmt(t.amount)}</td><td>$${fmt(t.balance_after)}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadLastPayrollRun() {
  const res = await fetch("/api/payroll/last-run", { credentials: "include" });
  const data = await res.json();
  const statusEl = document.getElementById("payroll-status");
  if (data.lastRun) {
    statusEl.textContent = `Last run: ${data.lastRun.run_date} — ${data.lastRun.employee_count} employees paid, total $${fmt(data.lastRun.total_amount)}.`;
  } else {
    statusEl.textContent = "Payroll has not been run yet this cycle.";
  }
}

async function loadProfileCompany() {
  const res = await fetch("/api/profile", { credentials: "include" });
  const data = await res.json();
  renderProfile(data.company);
}

function renderProfile(company) {
  const tbody = document.querySelector("#profile-table tbody");
  let rows = `
    <tr><td>Full name</td><td>${currentUser.fullName}</td></tr>
    <tr><td>Username</td><td>${currentUser.username}</td></tr>
    <tr><td>Role</td><td>${currentUser.role.replace("_", " ")}</td></tr>
    <tr><td>Company</td><td>${currentUser.companyName || "N/A (internal staff)"}</td></tr>
  `;
  if (company) {
    rows += `
      <tr><td>Company Bank</td><td>${company.bank_name || "N/A"}</td></tr>
      <tr><td>Company Account (IBAN)</td><td>${company.bank_account || "N/A"}</td></tr>
    `;
  }
  tbody.innerHTML = rows;
}

async function loadNotifications() {
  const res = await fetch("/api/notifications", { credentials: "include" });
  const notifications = await res.json();
  const badge = document.getElementById("bell-badge");
  const list = document.getElementById("bell-list");

  if (notifications.length === 0) {
    badge.classList.add("hidden");
    list.innerHTML = `<div class="bell-empty">No notifications.</div>`;
    return;
  }

  badge.textContent = notifications.length;
  badge.classList.remove("hidden");
  list.innerHTML = notifications
    .map((n) => `<div class="bell-item bell-${n.type}">${n.message}</div>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Sidebar / navigation
// ---------------------------------------------------------------------------

document.getElementById("burger-btn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
});

document.querySelectorAll(".nav-group-header").forEach((header) => {
  header.addEventListener("click", () => {
    header.parentElement.classList.toggle("expanded");
  });
});

function activateView(viewName, label) {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
  document.querySelectorAll(`.nav-item[data-view="${viewName}"]`).forEach((i) => i.classList.add("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${viewName}`).classList.remove("hidden");
  document.getElementById("view-title").textContent = label;
}

document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    activateView(item.dataset.view, item.textContent.trim());
  });
});

// --- Logout ---
document.getElementById("logout-btn").addEventListener("click", () => {
  window.location.href = "/api/auth/logout";
});

// --- Change password ---
document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const msg = document.getElementById("password-msg");
  msg.textContent = "";
  msg.className = "form-msg";

  if (newPassword !== confirmPassword) {
    msg.textContent = "New passwords do not match.";
    msg.classList.add("error");
    return;
  }

  try {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Could not update password.";
      msg.classList.add("error");
      return;
    }
    msg.textContent = "Password updated successfully.";
    msg.classList.add("ok");
    document.getElementById("password-form").reset();
  } catch (err) {
    msg.textContent = "Could not reach the server.";
    msg.classList.add("error");
  }
});

// --- AI Provider settings (admin only) ---
async function loadAISettings() {
  const statusEl = document.getElementById("ai-status");
  try {
    const res = await fetch("/api/settings/ai", { credentials: "include" });
    if (!res.ok) {
      statusEl.textContent = "Could not load AI settings.";
      return;
    }
    const data = await res.json();
    document.getElementById("ai-provider").value = data.provider || "gemini";
    document.getElementById("ai-model").value = data.model || data.defaultModel || "";
    document.getElementById("ai-model").placeholder = data.defaultModel || "e.g. gemini-2.5-flash";
    statusEl.textContent = data.configured
      ? `Configured: ${data.provider} / ${data.model} (key ${data.apiKeyMasked}). The lab AI assistant is live.`
      : "Not configured yet. The AI assistant won't respond until a key is saved here.";
  } catch (err) {
    statusEl.textContent = "Could not reach the server.";
  }
}

document.getElementById("ai-settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const provider = document.getElementById("ai-provider").value;
  const model = document.getElementById("ai-model").value.trim();
  const apiKey = document.getElementById("ai-api-key").value.trim();
  const msg = document.getElementById("ai-settings-msg");
  msg.textContent = "";
  msg.className = "form-msg";

  try {
    const res = await fetch("/api/settings/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider, apiKey, model }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || "Could not save the AI settings.";
      msg.classList.add("error");
      return;
    }
    msg.textContent = "Saved. The AI assistant is live.";
    msg.classList.add("ok");
    document.getElementById("ai-api-key").value = "";
    loadAISettings();
  } catch (err) {
    msg.textContent = "Could not reach the server.";
    msg.classList.add("error");
  }
});

// --- Month filters ---
document.getElementById("invoices-filter").addEventListener("change", renderInvoices);
document.getElementById("orders-filter").addEventListener("change", renderOrders);

// --- Run Payroll ---
document.getElementById("run-payroll-btn").addEventListener("click", async () => {
  const btn = document.getElementById("run-payroll-btn");
  const statusEl = document.getElementById("payroll-status");
  btn.disabled = true;
  btn.textContent = "Processing...";
  statusEl.textContent = "Generating transfers for all employees...";

  await new Promise((resolve) => setTimeout(resolve, 1400)); // simulate processing time

  try {
    const res = await fetch("/api/payroll/run", { method: "POST", credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || "Could not run payroll.";
    } else {
      statusEl.textContent = `Payroll run completed on ${data.runDate} — ${data.employeeCount} employees paid, total $${fmt(data.totalAmount)}.`;
    }
  } catch (err) {
    statusEl.textContent = "Could not reach the server.";
  }

  btn.disabled = false;
  btn.textContent = "Run Payroll";
});

// --- Bell dropdown ---
document.getElementById("bell-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("bell-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("bell-dropdown");
  if (!dropdown.classList.contains("hidden") && !dropdown.contains(e.target)) {
    dropdown.classList.add("hidden");
  }
});

// ---------------------------------------------------------------------------
// Chat widget
// ---------------------------------------------------------------------------

document.getElementById("chat-toggle").addEventListener("click", () => {
  const widget = document.getElementById("chat-widget");
  if (widget.classList.contains("fullpage")) {
    // Clicking the header while in full-page mode just steps back to the
    // normal floating panel, not all the way to the collapsed bubble.
    widget.classList.remove("fullpage");
    return;
  }
  widget.classList.toggle("collapsed");
});

document.getElementById("chat-expand-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const widget = document.getElementById("chat-widget");
  widget.classList.remove("collapsed");
  widget.classList.toggle("fullpage");
});

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  await sendChatMessage(message);
});

// --- Quick action buttons (Reports view) ---
document.querySelectorAll(".quick-action-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("chat-widget").classList.remove("collapsed");
    sendChatMessage(btn.dataset.prompt);
  });
});

async function sendChatMessage(message) {
  addMessage(message, "user");
  const typingId = addMessage("...", "bot", true);

  try {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    replaceMessage(typingId, data.reply || data.error || "Something went wrong.");
  } catch (err) {
    replaceMessage(typingId, "Could not reach the assistant.");
  }
}

function addMessage(text, who, isMarkdown) {
  const messages = document.getElementById("chat-messages");
  const div = document.createElement("div");
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  div.id = id;
  div.className = `msg ${who}`;
  div.innerHTML = isMarkdown ? renderMarkdown(text) : escapeHtml(text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return id;
}

function replaceMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = renderMarkdown(text);
  const messages = document.getElementById("chat-messages");
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Very small markdown renderer: supports pipe tables, **bold**, and line breaks.
// Good enough to make AI-generated reports look structured instead of a wall of text.
function renderMarkdown(text) {
  if (!text) return "";
  const lines = text.split("\n");
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|") && lines[i + 1] && lines[i + 1].includes("---")) {
      const headerCells = line.split("|").map((c) => c.trim()).filter(Boolean);
      let tableHtml = '<table class="chat-table"><thead><tr>';
      headerCells.forEach((c) => (tableHtml += `<th>${escapeHtml(c)}</th>`));
      tableHtml += "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowCells = lines[i].split("|").map((c) => c.trim()).filter(Boolean);
        tableHtml += "<tr>" + rowCells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
        i++;
      }
      tableHtml += "</tbody></table>";
      html += tableHtml;
    } else {
      const bolded = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += bolded + "<br/>";
      i++;
    }
  }
  return html;
}

init();
