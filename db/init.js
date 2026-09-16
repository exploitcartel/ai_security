// db/init.js
// Creates the SQLite database and seeds it with realistic demo data.
// Run with: npm run seed

const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "ventify.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
DROP TABLE IF EXISTS chat_logs;
DROP TABLE IF EXISTS payroll_runs;
DROP TABLE IF EXISTS bank_transactions;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS financial_records;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS clients;

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  bank_name TEXT,
  bank_account TEXT
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','financial_agent','business_viewer')),
  client_id INTEGER REFERENCES clients(id)
);

CREATE TABLE financial_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  month TEXT NOT NULL,
  revenue REAL NOT NULL,
  expenses REAL NOT NULL,
  profit REAL NOT NULL
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  invoice_number TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('paid','pending','overdue')),
  issue_date TEXT NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  full_name TEXT NOT NULL,
  position TEXT NOT NULL,
  monthly_salary REAL NOT NULL,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL
);

CREATE TABLE inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_value REAL NOT NULL
);

CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  supplier_name TEXT NOT NULL,
  category TEXT NOT NULL,
  contact_email TEXT NOT NULL
);

CREATE TABLE purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  order_number TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('delivered','in_transit','processing','cancelled')),
  order_date TEXT NOT NULL
);

CREATE TABLE chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  function_called TEXT,
  function_args TEXT,
  response TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  tx_date TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('credit','debit')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL
);

CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  run_date TEXT NOT NULL,
  employee_count INTEGER NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
);
`);

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// --- Realistic client companies -------------------------------------------
const clients = [
  ["Meridian Textiles", "Manufacturing", "finance@meridiantextiles.com"],
  ["Norvex Logistics", "Transportation", "accounts@norvexlogistics.com"],
  ["Brightfield Agro", "Agriculture", "billing@brightfieldagro.com"],
  ["Solara Energy Partners", "Energy", "finance@solaraenergy.com"],
  ["Hallmark Print Group", "Publishing", "ap@hallmarkprint.com"],
  ["Cobalt Ridge Mining", "Mining", "finance@cobaltridge.com"],
  ["Union Coastal Shipping", "Maritime", "billing@unioncoastal.com"],
  ["Aldergate Pharmaceuticals", "Pharmaceuticals", "finance@aldergatepharma.com"],
  ["Northlane Retail Group", "Retail", "ap@northlaneretail.com"],
  ["Ferrovia Steelworks", "Manufacturing", "finance@ferroviasteel.com"],
  ["Pinecrest Hospitality", "Hospitality", "billing@pinecresthotels.com"],
  ["Delta Fibernet", "Telecommunications", "finance@deltafibernet.com"],
  ["Cascade Timber Co.", "Forestry", "ap@cascadetimber.com"],
  ["Ironwood Construction", "Construction", "finance@ironwoodconstruction.com"],
  ["Vantage Foods Ltd.", "Food & Beverage", "billing@vantagefoods.com"],
  ["Sterling Auto Components", "Automotive", "finance@sterlingauto.com"],
  ["Marlow Insurance Group", "Insurance", "ap@marlowinsurance.com"],
  ["Quarrystone Cement", "Materials", "finance@quarrystonecement.com"],
  ["Everline Apparel", "Retail", "billing@everlineapparel.com"],
  ["Harborview Seafoods", "Food & Beverage", "finance@harborviewseafoods.com"],
];

const BANK_NAMES = [
  "NorthBridge Commercial Bank", "Meridian Trust Bank", "Union Continental Bank",
  "Alpine Financial Group", "Harborstone Bank", "Cresthaven National Bank",
  "Silverlake Banking Group", "Ashford & Co. Bank",
];

function fakeIban(rand) {
  const countries = ["GB", "DE", "FR", "NL", "ES", "IT", "SE", "CH"];
  const country = countries[Math.floor(rand() * countries.length)];
  const check = String(10 + Math.floor(rand() * 89));
  const bankCode = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join("");
  let digits = "";
  for (let i = 0; i < 16; i++) digits += Math.floor(rand() * 10);
  const grouped = (bankCode + digits).match(/.{1,4}/g).join(" ");
  return `${country}${check} ${grouped}`;
}

function fakeBankName(rand) {
  return BANK_NAMES[Math.floor(rand() * BANK_NAMES.length)];
}

const insertClient = db.prepare(
  "INSERT INTO clients (name, industry, contact_email, status, bank_name, bank_account) VALUES (?, ?, ?, 'active', ?, ?)"
);
const clientIds = clients.map((c, idx) => {
  const rand = seededRandom((idx + 1) * 401 + 5);
  return insertClient.run(c[0], c[1], c[2], fakeBankName(rand), fakeIban(rand)).lastInsertRowid;
});

// --- Financial records (last 3 months per client) --------------------------
const months = ["2026-06", "2026-07", "2026-08"];
const insertRecord = db.prepare(
  "INSERT INTO financial_records (client_id, month, revenue, expenses, profit) VALUES (?, ?, ?, ?, ?)"
);

clientIds.forEach((cid) => {
  const rand = seededRandom(cid * 17 + 3);
  months.forEach((m) => {
    const revenue = Math.round((80000 + rand() * 420000) * 100) / 100;
    const expenseRatio = 0.55 + rand() * 0.3;
    const expenses = Math.round(revenue * expenseRatio * 100) / 100;
    const profit = Math.round((revenue - expenses) * 100) / 100;
    insertRecord.run(cid, m, revenue, expenses, profit);
  });
});

// --- Invoices ---------------------------------------------------------------
const insertInvoice = db.prepare(
  "INSERT INTO invoices (client_id, invoice_number, amount, status, issue_date) VALUES (?, ?, ?, ?, ?)"
);
const statuses = ["paid", "paid", "paid", "pending", "overdue"];
clientIds.forEach((cid, idx) => {
  const rand = seededRandom(cid * 31 + 7);
  for (let i = 0; i < 4; i++) {
    const amount = Math.round((3200 + rand() * 46800) * 100) / 100;
    // Guarantee the first invoice per client is overdue, for the
    // notifications feature.
    const status = i === 0 ? "overdue" : statuses[Math.floor(rand() * statuses.length)];
    const day = 3 + Math.floor(rand() * 25);
    insertInvoice.run(
      cid,
      `INV-2026${String(idx + 1).padStart(3, "0")}-${i + 1}`,
      amount,
      status,
      `2026-08-${String(day).padStart(2, "0")}`
    );
  }
});

// --- Payroll (5-8 employees per client, realistic roles/salaries) ----------
const positions = [
  ["Chief Executive Officer", 1.9],
  ["Chief Financial Officer", 1.6],
  ["Operations Manager", 1.15],
  ["Sales Director", 1.25],
  ["Warehouse Supervisor", 0.85],
  ["Senior Accountant", 0.95],
  ["Logistics Coordinator", 0.8],
  ["HR Manager", 0.9],
  ["Procurement Specialist", 0.82],
  ["Plant Technician", 0.7],
];
const firstNames = ["James", "Maria", "David", "Elena", "Thomas", "Nadia", "Peter", "Ana", "Marco", "Sofia", "Alex", "Ingrid"];
const lastNames = ["Whitfield", "Rossi", "Kowalski", "Bergström", "Novak", "Dupont", "Larsen", "Petrova", "Schulz", "Moreau"];

const insertEmployee = db.prepare(
  "INSERT INTO employees (client_id, full_name, position, monthly_salary, bank_name, bank_account) VALUES (?, ?, ?, ?, ?, ?)"
);

clientIds.forEach((cid) => {
  const rand = seededRandom(cid * 53 + 11);
  const baseSalary = 2800 + rand() * 1400; // base scale varies per company
  const numEmployees = 5 + Math.floor(rand() * 4); // 5-8 employees
  const shuffled = [...positions].sort(() => rand() - 0.5).slice(0, numEmployees);
  shuffled.forEach((pos) => {
    const fn = firstNames[Math.floor(rand() * firstNames.length)];
    const ln = lastNames[Math.floor(rand() * lastNames.length)];
    const salary = Math.round(baseSalary * pos[1] * (0.9 + rand() * 0.2) * 100) / 100;
    insertEmployee.run(cid, `${fn} ${ln}`, pos[0], salary, fakeBankName(rand), fakeIban(rand));
  });
});

// --- Warehouse / inventory ---------------------------------------------------
const warehouseItemsByIndustry = {
  Manufacturing: ["Raw Steel Coil", "Industrial Fasteners", "Hydraulic Pumps", "Packaging Crates"],
  Transportation: ["Spare Truck Tires", "Diesel Filters", "Pallet Jacks", "GPS Tracking Units"],
  Agriculture: ["Fertilizer (bulk bags)", "Seed Stock", "Irrigation Pipes", "Harvesting Blades"],
  Energy: ["Solar Panel Units", "Inverters", "Transformer Coils", "Battery Storage Cells"],
  Publishing: ["Paper Stock (rolls)", "Ink Cartridges", "Binding Materials", "Printing Plates"],
  Mining: ["Drill Bits", "Conveyor Belts", "Safety Equipment Sets", "Explosive Charges (logged)"],
  Maritime: ["Shipping Containers", "Marine Rope", "Anchor Chains", "Navigation Equipment"],
  Pharmaceuticals: ["Active Ingredient Stock", "Vial Packaging", "Cold Storage Units", "Lab Reagents"],
  Retail: ["Seasonal Apparel Stock", "Point-of-Sale Terminals", "Shelving Units", "Packaging Bags"],
  Hospitality: ["Linen Stock", "Kitchen Equipment", "Furniture Sets", "Cleaning Supplies (bulk)"],
  Telecommunications: ["Fiber Optic Cable (spools)", "Network Routers", "Server Racks", "SIM Card Stock"],
  Forestry: ["Timber Logs", "Sawmill Blades", "Wood Pallets", "Protective Gear"],
  Construction: ["Cement Bags", "Rebar Stock", "Scaffolding Sets", "Power Tools"],
  "Food & Beverage": ["Bulk Grain Stock", "Refrigeration Units", "Bottling Equipment", "Packaging Cartons"],
  Automotive: ["Engine Components", "Brake Pad Sets", "Paint Stock", "Assembly Tools"],
  Insurance: ["Office Equipment", "Archive Storage Units", "IT Hardware"],
  Materials: ["Cement Clinker", "Aggregate Stock", "Bagging Equipment", "Quality Test Kits"],
};

const insertInventory = db.prepare(
  "INSERT INTO inventory (client_id, item_name, quantity, unit_value) VALUES (?, ?, ?, ?)"
);

clients.forEach((c, idx) => {
  const cid = clientIds[idx];
  const industry = c[1];
  const items = warehouseItemsByIndustry[industry] || ["General Stock Materials"];
  const rand = seededRandom(cid * 71 + 13);
  items.forEach((item, itemIdx) => {
    // Guarantee the first item per client is a "low stock" case for the
    // notifications feature (quantity under the 10-unit alert threshold).
    const quantity = itemIdx === 0 ? 1 + Math.floor(rand() * 9) : 40 + Math.floor(rand() * 2000);
    const unitValue = Math.round((5 + rand() * 480) * 100) / 100;
    insertInventory.run(cid, item, quantity, unitValue);
  });
});

// --- Suppliers & purchase orders --------------------------------------------
const supplierNamePool = [
  "Atlas Materials Supply", "Blackrock Wholesale", "Continental Parts Co.",
  "Dunwich Trading Ltd.", "Everstone Distributors", "Falcon Freight Supply",
  "Granite Bay Sourcing", "Harborline Vendors", "Ironclad Components",
  "Junction Point Supply",
];
const supplierCategories = ["Raw Materials", "Equipment", "Packaging", "Logistics", "Maintenance"];

const insertSupplier = db.prepare(
  "INSERT INTO suppliers (client_id, supplier_name, category, contact_email) VALUES (?, ?, ?, ?)"
);
const insertPO = db.prepare(
  "INSERT INTO purchase_orders (client_id, supplier_id, order_number, amount, status, order_date) VALUES (?, ?, ?, ?, ?, ?)"
);
const poStatuses = ["delivered", "delivered", "in_transit", "processing", "cancelled"];

clientIds.forEach((cid, idx) => {
  const rand = seededRandom(cid * 89 + 19);
  const numSuppliers = 2 + Math.floor(rand() * 2); // 2-3 suppliers per client
  const supplierIds = [];
  for (let i = 0; i < numSuppliers; i++) {
    const name = supplierNamePool[Math.floor(rand() * supplierNamePool.length)];
    const category = supplierCategories[Math.floor(rand() * supplierCategories.length)];
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "");
    const sid = insertSupplier.run(cid, name, category, `orders@${slug}.com`).lastInsertRowid;
    supplierIds.push(sid);
  }
  for (let i = 0; i < 5; i++) {
    const supplierId = supplierIds[Math.floor(rand() * supplierIds.length)];
    const amount = Math.round((1500 + rand() * 28000) * 100) / 100;
    const status = poStatuses[Math.floor(rand() * poStatuses.length)];
    const day = 2 + Math.floor(rand() * 26);
    insertPO.run(
      cid,
      supplierId,
      `PO-2026-${String(idx + 1).padStart(2, "0")}${i + 1}`,
      amount,
      status,
      `2026-08-${String(day).padStart(2, "0")}`
    );
  }
});

// --- Bank transactions (cash flow ledger, last ~10 weeks) -------------------
const txDescriptionsCredit = [
  "Customer payment received", "Invoice settlement", "Wire transfer in",
  "Client deposit", "Contract milestone payment",
];
const txDescriptionsDebit = [
  "Supplier payment", "Payroll transfer", "Equipment lease payment",
  "Utility bill", "Office rent", "Insurance premium", "Freight & shipping fee",
  "Software subscription",
];

const insertTx = db.prepare(
  "INSERT INTO bank_transactions (client_id, tx_date, description, type, amount, balance_after) VALUES (?, ?, ?, ?, ?, ?)"
);

clientIds.forEach((cid) => {
  const rand = seededRandom(cid * 131 + 29);
  let balance = 40000 + rand() * 60000;
  const numTx = 16 + Math.floor(rand() * 6); // 16-21 transactions
  // spread across June, July, August 2026
  const txMonths = ["06", "07", "08"];
  for (let i = 0; i < numTx; i++) {
    const isCredit = rand() < 0.4;
    const amount = isCredit
      ? Math.round((4000 + rand() * 60000) * 100) / 100
      : Math.round((300 + rand() * 18000) * 100) / 100;
    balance = isCredit ? balance + amount : balance - amount;
    balance = Math.round(balance * 100) / 100;
    const month = txMonths[Math.floor((i / numTx) * txMonths.length)];
    const day = 1 + Math.floor(rand() * 27);
    const desc = isCredit
      ? txDescriptionsCredit[Math.floor(rand() * txDescriptionsCredit.length)]
      : txDescriptionsDebit[Math.floor(rand() * txDescriptionsDebit.length)];
    insertTx.run(
      cid,
      `2026-${month}-${String(day).padStart(2, "0")}`,
      desc,
      isCredit ? "credit" : "debit",
      amount,
      balance
    );
  }
});
// Password for every seeded account is: Ventify2026!
const hash = bcrypt.hashSync("Ventify2026!", 10);

const insertUser = db.prepare(
  "INSERT INTO users (username, password_hash, full_name, role, client_id) VALUES (?, ?, ?, ?, ?)"
);

insertUser.run("admin", hash, "Alma Krasniqi", "admin", null);
insertUser.run("dev.ops", hash, "Genti Hoxha", "admin", null);
insertUser.run("j.morrow", hash, "Julia Morrow", "financial_agent", null);
insertUser.run("t.reyes", hash, "Tomas Reyes", "financial_agent", null);

const viewerLogins = [
  ["m.durrant", "Marcus Durrant"],
  ["s.arnett", "Sylvia Arnett"],
  ["p.kowalski", "Piotr Kowalski"],
  ["l.fontaine", "Laure Fontaine"],
  ["r.oduya", "Robert Oduya"],
  ["h.bergman", "Hanna Bergman"],
  ["c.villanueva", "Carlos Villanueva"],
  ["a.singh", "Ananya Singh"],
  ["d.mercer", "Diane Mercer"],
  ["f.ricci", "Fabio Ricci"],
  ["n.kowalczyk", "Nina Kowalczyk"],
  ["b.osei", "Ben Osei"],
  ["e.laurent", "Elise Laurent"],
  ["w.hartmann", "Werner Hartmann"],
  ["k.tanaka", "Kenji Tanaka"],
  ["m.okafor", "Maria Okafor"],
  ["j.becker", "Julia Becker"],
  ["s.novak", "Stefan Novak"],
  ["r.dubois", "Renée Dubois"],
  ["t.lindqvist", "Tobias Lindqvist"],
];

viewerLogins.forEach(([username, fullName], idx) => {
  insertUser.run(username, hash, fullName, "business_viewer", clientIds[idx]);
});

console.log("Database seeded successfully.");
console.log(`- ${clients.length} client companies`);
console.log(`- ${clientIds.length * months.length} financial records`);
console.log(`- ${clientIds.length * 4} invoices`);
console.log(`- payroll and inventory records for all ${clientIds.length} companies`);
console.log(`- suppliers and purchase orders for all ${clientIds.length} companies`);
console.log(`- ${2 + 2 + viewerLogins.length} users (all passwords: Ventify2026!)`);
console.log("");
console.log("Demo victim account: m.durrant / Ventify2026!  (Marcus Durrant, Meridian Textiles)");

db.close();
