// expo-file-system for the browser demo: an in-memory "disk" with just the calls the phone app makes
// (File: exists/create/write/text/delete/uri/name; Directory: exists/create/list; Paths.document).
const disk = new Map();
const dirs = new Set();
const join = (parts) => parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/").replace(/\/+/g, "/");

export const Paths = { document: { uri: "demo-doc" }, cache: { uri: "demo-cache" } };

export class File {
  constructor(...parts) { this.uri = join(parts); this.name = this.uri.split("/").pop(); }
  get exists() { return disk.has(this.uri); }
  get size() { return this.exists ? String(disk.get(this.uri)).length : 0; }
  create() { if (!disk.has(this.uri)) disk.set(this.uri, ""); }
  write(content) { disk.set(this.uri, content); }
  async text() { return String(disk.get(this.uri) ?? ""); }
  async arrayBuffer() { return new TextEncoder().encode(String(disk.get(this.uri) ?? "")).buffer; }
  delete() { disk.delete(this.uri); }
}

export class Directory {
  constructor(...parts) { this.uri = join(parts); this.name = this.uri.split("/").pop(); }
  get exists() { return dirs.has(this.uri); }
  create() { dirs.add(this.uri); }
  list() { return [...disk.keys()].filter((k) => k.startsWith(`${this.uri}/`)).map((k) => new File(k)); }
}
