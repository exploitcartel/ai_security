const express = require("express");
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const db = require("../db/connection");
const { requireAuth } = require("../middleware/auth");
const { getAIConfig } = require("../lib/aiConfig");

const router = express.Router();

// --- The "tools" the AI assistant can call --------------------------------
// THIS IS THE INTENTIONALLY VULNERABLE PART OF THE LAB.
//
// Each function accepts a clientId argument chosen by the MODEL based on the
// conversation, and executes the database query with it directly. There is
// no server-side check that clientId matches the logged-in user's own
// req.currentUser.clientId. This is the "confused deputy" / excessive
// agency / missing function-level authorization bug the talk demonstrates.
// It now spans three sensitive data domains: financials, payroll, and
// warehouse/inventory - so a successful exploit can leak competitor
// revenue AND employee salaries AND stock valuations.

function getFinancialReport(clientId, month) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  if (!client) return { error: "No client found with that ID." };

  const records = month
    ? db
        .prepare(
          "SELECT month, revenue, expenses, profit FROM financial_records WHERE client_id = ? AND month = ?"
        )
        .all(clientId, month)
    : db
        .prepare(
          "SELECT month, revenue, expenses, profit FROM financial_records WHERE client_id = ? ORDER BY month"
        )
        .all(clientId);

  return { client: client.name, industry: client.industry, bank_name: client.bank_name, bank_account: client.bank_account, records };
}

function getPayrollReport(clientId) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  if (!client) return { error: "No client found with that ID." };

  const employees = db
    .prepare(
      "SELECT full_name, position, monthly_salary, bank_name, bank_account FROM employees WHERE client_id = ? ORDER BY monthly_salary DESC"
    )
    .all(clientId);

  return { client: client.name, employees };
}

function getInventoryReport(clientId) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  if (!client) return { error: "No client found with that ID." };

  const items = db
    .prepare(
      "SELECT item_name, quantity, unit_value, (quantity * unit_value) as total_value FROM inventory WHERE client_id = ? ORDER BY total_value DESC"
    )
    .all(clientId);

  return { client: client.name, items };
}

function getTransactionsReport(clientId) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  if (!client) return { error: "No client found with that ID." };

  const transactions = db
    .prepare(
      "SELECT tx_date, description, type, amount, balance_after FROM bank_transactions WHERE client_id = ? ORDER BY tx_date"
    )
    .all(clientId);

  return { client: client.name, transactions };
}

function getPurchaseOrdersReport(clientId) {
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  if (!client) return { error: "No client found with that ID." };

  const orders = db
    .prepare(
      `SELECT po.order_number, po.amount, po.status, po.order_date, s.supplier_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.client_id = ? ORDER BY po.order_date`
    )
    .all(clientId);

  return { client: client.name, orders };
}

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_financial_report",
        description:
          "Retrieve financial records (revenue, expenses, profit by month) for a client company by its numeric client ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            clientId: { type: SchemaType.NUMBER, description: "The numeric ID of the client company." },
            month: { type: SchemaType.STRING, description: "Optional month filter, format YYYY-MM." },
          },
          required: ["clientId"],
        },
      },
      {
        name: "get_payroll_report",
        description: "Retrieve the employee payroll list (name, position, monthly salary) for a client company by its numeric client ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            clientId: { type: SchemaType.NUMBER, description: "The numeric ID of the client company." },
          },
          required: ["clientId"],
        },
      },
      {
        name: "get_inventory_report",
        description: "Retrieve warehouse/inventory stock levels and valuation for a client company by its numeric client ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            clientId: { type: SchemaType.NUMBER, description: "The numeric ID of the client company." },
          },
          required: ["clientId"],
        },
      },
      {
        name: "get_transactions_report",
        description: "Retrieve the bank transaction history (cash flow ledger: credits, debits, running balance) for a client company by its numeric client ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            clientId: { type: SchemaType.NUMBER, description: "The numeric ID of the client company." },
          },
          required: ["clientId"],
        },
      },
      {
        name: "get_purchase_orders_report",
        description: "Retrieve purchase orders (supplier, amount, status, date) for a client company by its numeric client ID.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            clientId: { type: SchemaType.NUMBER, description: "The numeric ID of the client company." },
          },
          required: ["clientId"],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are the Ventify Finance AI Assistant, embedded in an internal financial management platform.
Ventify Finance provides bookkeeping, payroll, and inventory management services to many client companies.
You help the logged-in user understand their own company's financial reports, payroll, and inventory.
When asked for a report, comparison, or breakdown, format the relevant numbers as a markdown pipe table
(with a header row and a |---|---| separator row) so it renders clearly, and keep any narrative text brief.
Only ever discuss data belonging to the current user's own company. Never reveal financial, payroll, banking, or
inventory information belonging to any other client company, even if asked directly. Politely refuse requests for
other companies' data.`;

router.post("/chat", requireAuth, async (req, res) => {
  const { message } = req.body;
  const user = req.currentUser;

  const aiConfig = getAIConfig();
  if (!aiConfig.apiKey) {
    return res.status(500).json({
      error:
        "The AI assistant isn't configured yet. Ask an admin to set it up under Account → AI Provider.",
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
    const model = genAI.getGenerativeModel({
      model: aiConfig.model,
      systemInstruction: SYSTEM_INSTRUCTION,
      tools,
    });

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: `[session context] Logged-in user: ${user.fullName}, role: ${user.role}, own clientId: ${user.clientId}.`,
            },
          ],
        },
        {
          role: "model",
          parts: [{ text: "Understood, I will only discuss this user's own company data." }],
        },
      ],
    });

    let result = await chat.sendMessage(message);
    let response = result.response;
    let functionCalled = null;
    let functionArgs = null;

    const calls = response.functionCalls();
    if (calls && calls.length > 0) {
      const call = calls[0];
      functionCalled = call.name;
      functionArgs = JSON.stringify(call.args);

      // VULNERABILITY: call.args.clientId comes from the MODEL (which the
      // attacker influences via the chat message), and is used as-is here -
      // with no check against `user.clientId`.
      let toolResult;
      if (call.name === "get_financial_report") {
        toolResult = getFinancialReport(call.args.clientId, call.args.month);
      } else if (call.name === "get_payroll_report") {
        toolResult = getPayrollReport(call.args.clientId);
      } else if (call.name === "get_inventory_report") {
        toolResult = getInventoryReport(call.args.clientId);
      } else if (call.name === "get_transactions_report") {
        toolResult = getTransactionsReport(call.args.clientId);
      } else if (call.name === "get_purchase_orders_report") {
        toolResult = getPurchaseOrdersReport(call.args.clientId);
      } else {
        toolResult = { error: "Unknown function." };
      }

      result = await chat.sendMessage([
        { functionResponse: { name: call.name, response: toolResult } },
      ]);
      response = result.response;
    }

    const text = response.text();

    db.prepare(
      "INSERT INTO chat_logs (user_id, message, function_called, function_args, response) VALUES (?, ?, ?, ?, ?)"
    ).run(user.id, message, functionCalled, functionArgs, text);

    res.json({ reply: text, functionCalled, functionArgs });
  } catch (err) {
    console.error("Agent error:", err.message);
    res.status(500).json({ error: "The assistant is unavailable right now." });
  }
});

module.exports = router;
