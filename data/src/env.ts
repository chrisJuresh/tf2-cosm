/**
 * Configuration and secrets, from the environment only. `.env.example` lists the
 * names; the real `.env` is gitignored and never read into the catalogue.
 */
import { readFileSync } from "node:fs";

/** Reads a `.env` file into process.env without overwriting anything already set. */
export function loadDotEnv(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match as unknown as [string, string, string];
    if (process.env[name] !== undefined) continue;
    process.env[name] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in, or export it.`);
  }
  return value.trim();
}
