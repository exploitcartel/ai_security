// db/init.js
// Creates the SQLite database and seeds it with realistic demo data.
// Run with: npm run seed

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "ventify.db");
const db = new Database(DB_PATH);

// Deterministic on purpose (NOT crypto.randomBytes): every seed run, on
// every machine/repo copy (v1, v2, v3), must produce the exact same
// username/password pairs and the exact same financial/payroll/inventory
// numbers, so a student asking the same question gets the same answer
// regardless of which copy they're testing against. Each call advances an
// independent small PRNG, seeded from a call counter.
let _pwCallCount = 0;
function randomPassword() {
  _pwCallCount += 1;
  let s = _pwCallCount * 104729 + 7;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(next() * chars.length)];
  return pw;
}

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

// --- Financial records (last 3 years / 36 months per client) ---------------
function lastNMonths(n, endYear, endMonth) {
  const out = [];
  let y = endYear, m = endMonth;
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
const months = lastNMonths(36, 2026, 8); // 2023-09 .. 2026-08
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
  // 1-2 invoices per month, spread across all 36 months
  const invPerMonth = 1 + Math.floor(rand() * 2);
  const numInvoices = invPerMonth * months.length;
  for (let i = 0; i < numInvoices; i++) {
    const amount = Math.round((3200 + rand() * 46800) * 100) / 100;
    // Guarantee the first invoice per client is overdue, for the
    // notifications feature.
    const status = i === 0 ? "overdue" : statuses[Math.floor(rand() * statuses.length)];
    const day = 3 + Math.floor(rand() * 25);
    const month = months[Math.floor((i / numInvoices) * months.length)];
    insertInvoice.run(
      cid,
      `INV-${month}-${String(idx + 1).padStart(3, "0")}-${i + 1}`,
      amount,
      status,
      `${month}-${String(day).padStart(2, "0")}`
    );
  }
});

// --- Payroll (18-28 employees per client, realistic roles/salaries) --------
const positions = [
  ["Chief Executive Officer", 1.9],
  ["Chief Financial Officer", 1.6],
  ["Chief Operating Officer", 1.55],
  ["Operations Manager", 1.15],
  ["Sales Director", 1.25],
  ["Sales Representative", 0.75],
  ["Warehouse Supervisor", 0.85],
  ["Warehouse Associate", 0.55],
  ["Senior Accountant", 0.95],
  ["Staff Accountant", 0.68],
  ["Logistics Coordinator", 0.8],
  ["HR Manager", 0.9],
  ["HR Coordinator", 0.62],
  ["Procurement Specialist", 0.82],
  ["Plant Technician", 0.7],
  ["Quality Control Inspector", 0.72],
  ["IT Support Specialist", 0.78],
  ["Customer Service Representative", 0.6],
  ["Marketing Coordinator", 0.7],
  ["Administrative Assistant", 0.55],
  ["Maintenance Technician", 0.65],
  ["Shift Supervisor", 0.8],
];
const firstNames = ["James", "Maria", "David", "Elena", "Thomas", "Nadia", "Peter", "Ana", "Marco", "Sofia", "Alex", "Ingrid"];
const lastNames = ["Whitfield", "Rossi", "Kowalski", "Bergström", "Novak", "Dupont", "Larsen", "Petrova", "Schulz", "Moreau"];

const insertEmployee = db.prepare(
  "INSERT INTO employees (client_id, full_name, position, monthly_salary, bank_name, bank_account) VALUES (?, ?, ?, ?, ?, ?)"
);

clientIds.forEach((cid) => {
  const rand = seededRandom(cid * 53 + 11);
  const baseSalary = 2800 + rand() * 1400; // base scale varies per company
  const numEmployees = 18 + Math.floor(rand() * 11); // 18-28 employees
  for (let i = 0; i < numEmployees; i++) {
    const pos = positions[Math.floor(rand() * positions.length)];
    const fn = firstNames[Math.floor(rand() * firstNames.length)];
    const ln = lastNames[Math.floor(rand() * lastNames.length)];
    const salary = Math.round(baseSalary * pos[1] * (0.9 + rand() * 0.2) * 100) / 100;
    insertEmployee.run(cid, `${fn} ${ln}`, pos[0], salary, fakeBankName(rand), fakeIban(rand));
  }
});

// --- Warehouse / inventory ---------------------------------------------------
const warehouseItemsByIndustry = {
  Manufacturing: ["Raw Steel Coil", "Industrial Fasteners", "Hydraulic Pumps", "Packaging Crates", "Welding Rods", "Conveyor Rollers", "Lubricant Drums", "Safety Harnesses"],
  Transportation: ["Spare Truck Tires", "Diesel Filters", "Pallet Jacks", "GPS Tracking Units", "Brake Assemblies", "Engine Oil (bulk)", "Cargo Straps", "Fleet Batteries"],
  Agriculture: ["Fertilizer (bulk bags)", "Seed Stock", "Irrigation Pipes", "Harvesting Blades", "Pesticide Drums", "Tractor Parts", "Storage Silos Hardware", "Greenhouse Film Rolls"],
  Energy: ["Solar Panel Units", "Inverters", "Transformer Coils", "Battery Storage Cells", "Cabling (spools)", "Circuit Breakers", "Turbine Blades", "Grid Connectors"],
  Publishing: ["Paper Stock (rolls)", "Ink Cartridges", "Binding Materials", "Printing Plates", "Laminate Film", "Toner Cartridges", "Binding Glue", "Trim Blades"],
  Mining: ["Drill Bits", "Conveyor Belts", "Safety Equipment Sets", "Explosive Charges (logged)", "Ventilation Fans", "Ore Sample Kits", "Hydraulic Jacks", "Protective Suits"],
  Maritime: ["Shipping Containers", "Marine Rope", "Anchor Chains", "Navigation Equipment", "Life Rafts", "Marine Paint Drums", "Winch Cables", "Ballast Pumps"],
  Pharmaceuticals: ["Active Ingredient Stock", "Vial Packaging", "Cold Storage Units", "Lab Reagents", "Sterile Gloves (boxes)", "Blister Pack Sheets", "Centrifuge Tubes", "Quality Control Kits"],
  Retail: ["Seasonal Apparel Stock", "Point-of-Sale Terminals", "Shelving Units", "Packaging Bags", "Security Tags", "Mannequins", "Barcode Scanners", "Gift Card Stock"],
  Hospitality: ["Linen Stock", "Kitchen Equipment", "Furniture Sets", "Cleaning Supplies (bulk)", "Guest Toiletry Kits", "Minibar Stock", "Uniform Sets", "Banquet Tableware"],
  Telecommunications: ["Fiber Optic Cable (spools)", "Network Routers", "Server Racks", "SIM Card Stock", "Antenna Units", "Patch Panels", "UPS Battery Packs", "Cable Splicers"],
  Forestry: ["Timber Logs", "Sawmill Blades", "Wood Pallets", "Protective Gear", "Chainsaw Chains", "Wood Preservative Drums", "Log Chains", "Bark Mulch Stock"],
  Construction: ["Cement Bags", "Rebar Stock", "Scaffolding Sets", "Power Tools", "Safety Helmets", "Concrete Mixers Parts", "Insulation Rolls", "Drywall Sheets"],
  "Food & Beverage": ["Bulk Grain Stock", "Refrigeration Units", "Bottling Equipment", "Packaging Cartons", "Flavoring Concentrates", "Glass Bottles (pallets)", "Sanitation Supplies", "Label Rolls"],
  Automotive: ["Engine Components", "Brake Pad Sets", "Paint Stock", "Assembly Tools", "Windshield Glass", "Tire Stock", "Battery Packs", "Wiring Harnesses"],
  Insurance: ["Office Equipment", "Archive Storage Units", "IT Hardware", "Printer Supplies", "Security Cabinets", "Backup Storage Drives"],
  Materials: ["Cement Clinker", "Aggregate Stock", "Bagging Equipment", "Quality Test Kits", "Silo Liners", "Conveyor Belting", "Dust Filters", "Weighbridge Parts"],
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
  const numSuppliers = 4 + Math.floor(rand() * 3); // 4-6 suppliers per client
  const supplierIds = [];
  for (let i = 0; i < numSuppliers; i++) {
    const name = supplierNamePool[Math.floor(rand() * supplierNamePool.length)];
    const category = supplierCategories[Math.floor(rand() * supplierCategories.length)];
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "");
    const sid = insertSupplier.run(cid, name, category, `orders@${slug}.com`).lastInsertRowid;
    supplierIds.push(sid);
  }
  // 2-3 purchase orders per month, spread across all 36 months
  const poPerMonth = 2 + Math.floor(rand() * 2);
  const numPOs = poPerMonth * months.length;
  for (let i = 0; i < numPOs; i++) {
    const supplierId = supplierIds[Math.floor(rand() * supplierIds.length)];
    const amount = Math.round((1500 + rand() * 28000) * 100) / 100;
    const status = poStatuses[Math.floor(rand() * poStatuses.length)];
    const day = 2 + Math.floor(rand() * 26);
    const month = months[Math.floor((i / numPOs) * months.length)];
    insertPO.run(
      cid,
      supplierId,
      `PO-${month}-${String(idx + 1).padStart(2, "0")}${String(i + 1).padStart(3, "0")}`,
      amount,
      status,
      `${month}-${String(day).padStart(2, "0")}`
    );
  }
});

// --- Bank transactions (cash flow ledger, last 3 years) --------------------
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
  // ~6-9 transactions per month, spread across all 36 months
  const perMonth = 6 + Math.floor(rand() * 4);
  const numTx = perMonth * months.length;
  for (let i = 0; i < numTx; i++) {
    const isCredit = rand() < 0.4;
    const amount = isCredit
      ? Math.round((4000 + rand() * 60000) * 100) / 100
      : Math.round((300 + rand() * 18000) * 100) / 100;
    balance = isCredit ? balance + amount : balance - amount;
    balance = Math.round(balance * 100) / 100;
    const month = months[Math.floor((i / numTx) * months.length)];
    const day = 1 + Math.floor(rand() * 27);
    const desc = isCredit
      ? txDescriptionsCredit[Math.floor(rand() * txDescriptionsCredit.length)]
      : txDescriptionsDebit[Math.floor(rand() * txDescriptionsDebit.length)];
    insertTx.run(
      cid,
      `${month}-${String(day).padStart(2, "0")}`,
      desc,
      isCredit ? "credit" : "debit",
      amount,
      balance
    );
  }
});
// Every account gets its own random password - there is no shared demo
// password anymore. All of them are written to CREDENTIALS.local.txt
// (gitignored) at the end of this script; nothing sensitive is hardcoded
// or committed.
const credentials = [];

const insertUser = db.prepare(
  "INSERT INTO users (username, password_hash, full_name, role, client_id) VALUES (?, ?, ?, ?, ?)"
);

function createUser(username, fullName, role, clientId, companyName) {
  const password = randomPassword();
  insertUser.run(username, bcrypt.hashSync(password, 10), fullName, role, clientId);
  credentials.push({ username, role, companyName: companyName || "", password });
}

createUser("admin", "System Administrator", "admin", null);
createUser("dev.ops", "Genti Hoxha", "admin", null);
createUser("j.morrow", "Julia Morrow", "financial_agent", null);
createUser("t.reyes", "Tomas Reyes", "financial_agent", null);

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
  createUser(username, fullName, "business_viewer", clientIds[idx], clients[idx][0]);
});

// --- Write generated credentials to a local, gitignored file ---------------
const credentialsPath = path.join(__dirname, "..", "CREDENTIALS.local.txt");
const credentialLines = [
  "Ventify Finance - generated demo credentials",
  `Generated at: ${new Date().toISOString()}`,
  "Do NOT commit this file (already in .gitignore). Re-run `npm run seed` to regenerate.",
  "",
  "username         role              company                     password",
  "----------------------------------------------------------------------------------",
  ...credentials.map(
    (c) =>
      `${c.username.padEnd(16)} ${c.role.padEnd(17)} ${c.companyName.padEnd(27)} ${c.password}`
  ),
];
fs.writeFileSync(credentialsPath, credentialLines.join("\n") + "\n");

const sysadmin = credentials.find((c) => c.username === "admin");
const victim = credentials.find((c) => c.username === "m.durrant");

const countOf = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

console.log("Database seeded successfully.");
console.log(`- ${clients.length} client companies, ${months.length} months of history each (${months[0]} to ${months[months.length - 1]})`);
console.log(`- ${countOf("financial_records")} financial records`);
console.log(`- ${countOf("invoices")} invoices`);
console.log(`- ${countOf("employees")} payroll records across all companies`);
console.log(`- ${countOf("inventory")} inventory line items across all companies`);
console.log(`- ${countOf("suppliers")} suppliers, ${countOf("purchase_orders")} purchase orders`);
console.log(`- ${countOf("bank_transactions")} bank transactions`);
console.log(`- ${credentials.length} users, each with its own random password`);
console.log("");
console.log(`All credentials written to: ${credentialsPath}`);
console.log(`Sysadmin login: admin / ${sysadmin.password}`);
console.log(`  -> log in as sysadmin first and set the AI provider API key under`);
console.log(`     Account -> AI Provider before running the demo.`);
console.log(`Demo victim account: m.durrant / ${victim.password}  (Marcus Durrant, Meridian Textiles)`);

db.close();
