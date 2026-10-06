const mem = new Map();
export const getItemAsync = async (k) => (mem.has(k) ? mem.get(k) : null);
export const setItemAsync = async (k, v) => { mem.set(k, v); };
export const deleteItemAsync = async (k) => { mem.delete(k); };
