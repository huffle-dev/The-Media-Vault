// A stand-in for the `window.vault` bridge the desktop app's preload script provides, so the real interface
// runs in an ordinary web page on made-up data. Everything is in memory: a refresh starts over, and nothing
// ever leaves the page. Anything the stand-in doesn't cover (online search, sync, Steam…) quietly does
// nothing, so those buttons simply don't respond rather than breaking the page.
import { buildSampleItems } from "./sampleData.js";

export function installDemoVault(target = window) {
  let items = buildSampleItems();
  let nextId = items.length + 1;
  let nextListId = 3;
  const lists = [
    { id: 1, name: "Favourites", is_default: 1, created_at: "2026-01-01" },
    { id: 2, name: "Weekend picks", is_default: 0, created_at: "2026-01-02" },
  ];
  const members = new Set(); // "listId:itemId"
  const add = (listId, id) => members.add(`${listId}:${id}`);
  const idOf = (title) => (items.find((i) => i.title === title) || {}).id;
  ["Metropolis", "Sintel", "Frankenstein", "The Great Gatsby", "OpenTTD", "Ashes", "Go", "Safety Last!", "Spring"].forEach((t) => add(1, idOf(t)));
  ["Sherlock Jr.", "The Time Machine", "SuperTuxKart", "Backgammon", "Infinity"].forEach((t) => add(2, idOf(t)));

  const settings = new Map([["welcomed", true], ["demo", true]]);
  const withLists = (it) => ({ ...it, list_ids: lists.filter((l) => members.has(`${l.id}:${it.id}`)).map((l) => l.id) });
  const get = (id) => items.find((i) => i.id === id);
  const listsWithCounts = () => lists.map((l) => ({ ...l, item_count: items.filter((i) => members.has(`${l.id}:${i.id}`)).length }));
  const patchItem = (id, fields) => {
    items = items.map((i) => (i.id === id ? { ...i, ...fields } : i));
    return withLists(get(id));
  };

  const explicit = {
    items: {
      getAll: async () => items.map(withLists),
      add: async (data) => {
        const created = { is_local: 0, status: "wishlist", date_added: new Date().toISOString().slice(0, 10), list_ids: [], custom_fields: {}, ...data, id: nextId++ };
        items = [created, ...items];
        return created;
      },
      update: async (id, data) => patchItem(id, data),
      updateFields: async (id, fields) => patchItem(id, fields),
      delete: async (arg) => { items = items.filter((i) => i.id !== arg.id); return { success: true }; },
      deleteMany: async ({ ids }) => { items = items.filter((i) => !ids.includes(i.id)); return { success: true, deleted: ids.length }; },
      search: async (q) => items.filter((i) => `${i.title} ${i.creator || ""}`.toLowerCase().includes(String(q || "").toLowerCase())),
      getGenres: async () => [...new Set(items.map((i) => i.genre).filter(Boolean))].sort(),
      findDuplicate: async ({ title, media_type }) => items.find((i) => i.media_type === media_type && i.title.toLowerCase() === String(title || "").toLowerCase()) || null,
    },
    lists: {
      getAll: async () => listsWithCounts(),
      create: async (name) => {
        const n = String(name || "").trim();
        if (!n) throw new Error("List name can't be empty.");
        if (lists.some((l) => l.name.toLowerCase() === n.toLowerCase())) throw new Error(`A list named "${n}" already exists.`);
        const l = { id: nextListId++, name: n, is_default: 0, created_at: new Date().toISOString().slice(0, 10) };
        lists.push(l);
        return { ...l, item_count: 0 };
      },
      delete: async (id) => {
        const l = lists.find((x) => x.id === id);
        if (!l) return { success: false, error: "List not found." };
        if (l.is_default) return { success: false, error: "Favourites can't be deleted." };
        lists.splice(lists.indexOf(l), 1);
        return { success: true };
      },
      addItems: async (listId, ids) => { ids.forEach((id) => add(listId, id)); return { success: true }; },
      removeItem: async (listId, id) => { members.delete(`${listId}:${id}`); return { success: true }; },
      toggleFavourite: async (id) => {
        const key = `1:${id}`;
        if (members.has(key)) { members.delete(key); return { success: true, favourited: false }; }
        members.add(key);
        return { success: true, favourited: true };
      },
    },
    customTypes: { getAll: async () => [] },
    settings: {
      get: async (key) => (settings.has(key) ? settings.get(key) : null),
      set: async (key, value) => { settings.set(key, value); return true; },
    },
    folders: { getAll: async () => [] },
    app: { getInfo: async () => ({ version: "demo", dataPath: "(this is an online demo — nothing is saved)" }) },
    cloudSync: {
      status: async () => null,
      isConnected: async () => false,
      getConfig: async () => ({ configured: false }),
    },
    gog: { isConnected: async () => false },
    // Search Online shows whatever message a failed search throws, so say why it can't work here.
    search: {
      query: async () => { throw new Error("Online search is switched off in this demo — in the real app it searches TMDB, Open Library, Steam, BoardGameGeek and more."); },
      details: async () => { throw new Error("Online search is switched off in this demo."); },
      thumbnail: async () => null,
    },
    discovery: { getDismissed: async () => [] },
    coverArt: { scanOrphaned: async () => [] },
  };

  // Unknown calls: `on…` subscriptions return a do-nothing unsubscribe; everything else resolves to nothing.
  const namespace = (name) => new Proxy(explicit[name] || {}, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop !== "string") return undefined;
      if (/^on[A-Z]/.test(prop)) return () => () => {};
      return async () => null;
    },
  });
  target.vault = new Proxy({}, { get: (_, ns) => (typeof ns === "string" ? namespace(ns) : undefined) });
  target.__DEMO__ = true;
}
