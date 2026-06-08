import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define DB directory path
const dbDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

class JsonCollection {
  constructor(name) {
    this.filePath = path.join(dbDir, `db_${name}.json`);
    this.data = this._load();
  }

  _load() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
      return [];
    }
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(content || "[]");
    } catch (e) {
      console.error(`Error reading database file: ${this.filePath}`, e);
      return [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error(`Error writing database file: ${this.filePath}`, e);
    }
  }

  async find(query = {}) {
    return this.data.filter(item => {
      for (const key in query) {
        // Simple exact match
        if (query[key] !== item[key]) {
          return false;
        }
      }
      return true;
    });
  }

  async findOne(query = {}) {
    const results = await this.find(query);
    return results.length > 0 ? results[0] : null;
  }

  async findById(id) {
    return this.data.find(item => item._id === id || item.id === id) || null;
  }

  async create(obj) {
    const newRecord = {
      _id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      createdAt: new Date().toISOString(),
      ...obj
    };
    
    // Save/update helper
    newRecord.save = async () => {
      const idx = this.data.findIndex(item => item._id === newRecord._id);
      if (idx !== -1) {
        this.data[idx] = { ...newRecord };
      }
      this._save();
      return newRecord;
    };

    this.data.push(newRecord);
    this._save();
    return newRecord;
  }

  async findByIdAndUpdate(id, updateData, options = {}) {
    const idx = this.data.findIndex(item => item._id === id || item.id === id);
    if (idx === -1) return null;
    
    this.data[idx] = {
      ...this.data[idx],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    this._save();
    return this.data[idx];
  }

  async deleteOne(query = {}) {
    const idx = this.data.findIndex(item => {
      for (const key in query) {
        if (query[key] !== item[key]) {
          return false;
        }
      }
      return true;
    });
    if (idx === -1) return { deletedCount: 0 };
    this.data.splice(idx, 1);
    this._save();
    return { deletedCount: 1 };
  }
}

// Instantiate collections
export const jsonDb = {
  users: new JsonCollection("users"),
  activities: new JsonCollection("activities"),
  challenges: new JsonCollection("challenges"), // cache signature nonces
  sharedKeys: new JsonCollection("shared_keys")
};
