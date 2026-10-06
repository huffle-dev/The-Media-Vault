// This phone's id in the cloud's `devices` table, made once and kept (so the marks
// it writes, like "owned", always belong to the same device row).
const KEY = "mobile_device_id";

export function getDeviceId(makeId) {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const id = makeId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return makeId(); // storage unavailable: a fresh id this session only
  }
}
