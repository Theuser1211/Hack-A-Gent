import { betterSqlite3 } from 'better-sqlite3';

const db = betterSqlite3('./database.db', { verbose: console.log });

export async function initializeDatabase() {
  // Create table if not exists
  db.prepare('CREATE TABLE IF NOT EXISTS ai_context (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, inputs TEXT, timestamps TEXT)')().run();

  // Return success
  return true;
}

export async function saveAiContext(userId: string, inputs: string, timestamps: string) {
  // Insert data into table
  const stmt = db.prepare('INSERT INTO ai_context (user_id, inputs, timestamps) VALUES (?, ?, ?)');
  stmt.run(userId, inputs, timestamps);

  // Return success
  return true;
}

export async function getAiContext(userId: string) {
  // Query data from table
  const stmt = db.prepare('SELECT * FROM ai_context WHERE user_id = ?');
  const result = stmt.get(userId);

  // Return result
  return result;
}