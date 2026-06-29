import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Ferment } from "./types.js";

const DB_PATH = process.env.FERMENT_DB || join(homedir(), ".pi", "ferments", "ferments.json");

class FermentStore {
  private ferments: Map<string, Ferment> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    if (!existsSync(DB_PATH)) return;
    try {
      const data = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      for (const [id, f] of Object.entries(data)) {
        this.ferments.set(id, f as Ferment);
      }
    } catch (e) {
      console.warn("ferment: failed to load store, starting fresh:", e);
    }
  }

  private save() {
    mkdirSync(join(DB_PATH, ".."), { recursive: true });
    const obj: Record<string, Ferment> = {};
    for (const [id, f] of this.ferments) obj[id] = f;
    writeFileSync(DB_PATH, JSON.stringify(obj, null, 2));
  }

  get(id: string): Ferment | undefined {
    return this.ferments.get(id);
  }

  set(f: Ferment) {
    this.ferments.set(f.id, f);
    this.save();
  }
}

export const store = new FermentStore();
