// Browser demo: covers are plain picture files next to the page, so "saved on the device" is just the address.
export const getCoverArtSourceUrl = (uri) => uri || null;
export const peekCachedCoverArtUri = (url) => url;
export const cacheCoverArtFromUrl = async (url) => url;
export const verifyCachedCover = async () => true;
export const coverFileNameForUrl = (url) => String(url);
export const listLinkedCoverFiles = () => [];
export const deleteCoverFiles = () => 0;
export const mobileCoverArtStorage = {
  coverArtDir: () => "",
  joinPath: (_dir, filename) => filename,
  fileExists: () => false,
  downloadImage: async () => {},
  ensureImage: async () => {},
};
