const express = require("express");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// NOTE FOR THE LAB: every route in this file correctly scopes data access
// to req.currentUser.clientId (for business_viewer accounts). This is here
// deliberately, to contrast with routes/agent.js, where the same scoping
// check is missing at the AI tool-execution layer.

router.get("/dashboard-summary", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const records = db
      .prepare(
        "SELECT month, revenue, expenses, profit FROM financial_records WHERE client_id = ? ORDER BY month"
      )
      .all(clientId);
    return res.json({ scope: "own_company", records });
  }

  const totals = db
    .prepare(
      `SELECT month, ROUND(SUM(revenue),2) as revenue, ROUND(SUM(expenses),2) as expenses, ROUND(SUM(profit),2) as profit
       FROM financial_records GROUP BY month ORDER BY month`
    )
    .all();
  res.json({ scope: "all_clients_aggregate", records: totals });
});

router.get("/invoices", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const invoices = db
      .prepare(
        "SELECT invoice_number, amount, status, issue_date FROM invoices WHERE client_id = ? ORDER BY issue_date DESC"
      )
      .all(clientId);
    return res.json(invoices);
  }

  const invoices = db
    .prepare(
      `SELECT i.invoice_number, i.amount, i.status, i.issue_date, c.name as client_name
       FROM invoices i JOIN clients c ON c.id = i.client_id ORDER BY i.issue_date DESC LIMIT 50`
    )
    .all();
  res.json(invoices);
});

router.get("/payroll", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const employees = db
      .prepare(
        "SELECT full_name, position, monthly_salary, bank_name, bank_account FROM employees WHERE client_id = ? ORDER BY monthly_salary DESC"
      )
      .all(clientId);
    return res.json(employees);
  }

  const employees = db
    .prepare(
      `SELECT e.full_name, e.position, e.monthly_salary, e.bank_name, e.bank_account, c.name as client_name
       FROM employees e JOIN clients c ON c.id = e.client_id ORDER BY e.monthly_salary DESC LIMIT 50`
    )
    .all();
  res.json(employees);
});

router.get("/inventory", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const items = db
      .prepare(
        "SELECT item_name, quantity, unit_value, (quantity * unit_value) as total_value FROM inventory WHERE client_id = ? ORDER BY total_value DESC"
      )
      .all(clientId);
    return res.json(items);
  }

  const items = db
    .prepare(
      `SELECT i.item_name, i.quantity, i.unit_value, (i.quantity * i.unit_value) as total_value, c.name as client_name
       FROM inventory i JOIN clients c ON c.id = i.client_id ORDER BY total_value DESC LIMIT 50`
    )
    .all();
  res.json(items);
});

router.get("/suppliers", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const suppliers = db
      .prepare("SELECT supplier_name, category, contact_email FROM suppliers WHERE client_id = ?")
      .all(clientId);
    return res.json(suppliers);
  }

  const suppliers = db
    .prepare(
      `SELECT s.supplier_name, s.category, s.contact_email, c.name as client_name
       FROM suppliers s JOIN clients c ON c.id = s.client_id LIMIT 50`
    )
    .all();
  res.json(suppliers);
});

router.get("/purchase-orders", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const orders = db
      .prepare(
        `SELECT po.order_number, po.amount, po.status, po.order_date, s.supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.client_id = ? ORDER BY po.order_date DESC`
      )
      .all(clientId);
    return res.json(orders);
  }

  const orders = db
    .prepare(
      `SELECT po.order_number, po.amount, po.status, po.order_date, s.supplier_name, c.name as client_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN clients c ON c.id = po.client_id
       ORDER BY po.order_date DESC LIMIT 50`
    )
    .all();
  res.json(orders);
});

router.get("/profile", requireAuth, (req, res) => {
  const { clientId } = req.currentUser;
  if (!clientId) return res.json({ company: null });
  const c = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  res.json({ company: c });
});

// --- Transactions / cash flow ------------------------------------------------
router.get("/transactions", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  if (role === "business_viewer") {
    const txs = db
      .prepare(
        "SELECT tx_date, description, type, amount, balance_after FROM bank_transactions WHERE client_id = ? ORDER BY tx_date DESC, id DESC"
      )
      .all(clientId);
    return res.json(txs);
  }

  const txs = db
    .prepare(
      `SELECT bt.tx_date, bt.description, bt.type, bt.amount, bt.balance_after, c.name as client_name
       FROM bank_transactions bt JOIN clients c ON c.id = bt.client_id
       ORDER BY bt.tx_date DESC, bt.id DESC LIMIT 80`
    )
    .all();
  res.json(txs);
});

// --- Payroll run (simulated) -------------------------------------------------
router.get("/payroll/last-run", requireAuth, (req, res) => {
  const { clientId } = req.currentUser;
  if (!clientId) return res.json({ lastRun: null });
  const run = db
    .prepare(
      "SELECT run_date, employee_count, total_amount, status FROM payroll_runs WHERE client_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(clientId);
  res.json({ lastRun: run || null });
});

router.post("/payroll/run", requireAuth, (req, res) => {
  const { clientId } = req.currentUser;
  if (!clientId) {
    return res.status(400).json({ error: "Only a client account can run payroll for its own company." });
  }

  const employees = db
    .prepare("SELECT monthly_salary FROM employees WHERE client_id = ?")
    .all(clientId);
  const totalAmount = Math.round(employees.reduce((sum, e) => sum + e.monthly_salary, 0) * 100) / 100;
  const runDate = new Date().toISOString().slice(0, 10);

  db.prepare(
    "INSERT INTO payroll_runs (client_id, run_date, employee_count, total_amount, status) VALUES (?, ?, ?, ?, 'completed')"
  ).run(clientId, runDate, employees.length, totalAmount);

  res.json({
    ok: true,
    runDate,
    employeeCount: employees.length,
    totalAmount,
  });
});

// --- Notifications (computed live from real data) ---------------------------
router.get("/notifications", requireAuth, (req, res) => {
  const { role, clientId } = req.currentUser;

  const notifications = [];

  const overdueInvoices = clientId
    ? db.prepare("SELECT invoice_number, amount FROM invoices WHERE client_id = ? AND status = 'overdue'").all(clientId)
    : db.prepare("SELECT invoice_number, amount FROM invoices WHERE status = 'overdue' LIMIT 10").all();

  overdueInvoices.forEach((inv) => {
    notifications.push({
      type: "warning",
      message: `Invoice ${inv.invoice_number} is overdue ($${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
    });
  });

  const lowStock = clientId
    ? db.prepare("SELECT item_name, quantity FROM inventory WHERE client_id = ? AND quantity < 10").all(clientId)
    : db.prepare("SELECT item_name, quantity FROM inventory WHERE quantity < 10 LIMIT 10").all();

  lowStock.forEach((item) => {
    notifications.push({
      type: "danger",
      message: `Stock for "${item.item_name}" is low (${item.quantity} units left).`,
    });
  });

  const pendingOrders = clientId
    ? db.prepare("SELECT order_number FROM purchase_orders WHERE client_id = ? AND status = 'processing'").all(clientId)
    : [];
  pendingOrders.forEach((po) => {
    notifications.push({
      type: "info",
      message: `Purchase order ${po.order_number} is still processing.`,
    });
  });

  res.json(notifications);
});

module.exports = router;
