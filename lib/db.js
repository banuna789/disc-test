// D1 storage for test results. The table is created on first use, so no manual SQL setup is needed.
// Pages project → Settings → Bindings → D1 database, variable name DB.

let ready = false;

export async function ensureSchema(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    name TEXT NOT NULL,
    dob TEXT NOT NULL,
    d INTEGER NOT NULL, i INTEGER NOT NULL, s INTEGER NOT NULL, c INTEGER NOT NULL,
    total INTEGER NOT NULL,
    primary_style TEXT NOT NULL,
    secondary_style TEXT,
    mode TEXT,
    lang TEXT
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS results_created ON results (created_at)").run();
  ready = true;
}
