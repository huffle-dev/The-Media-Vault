// Browser demo: covers are plain picture files on the web page, not saved copies on a phone that could be left
// damaged, so there is nothing to repair. In a browser an image that is swapped out while it is still loading
// also reports an "error", which the real repair routine (../coverHealing.js) would mistake for a damaged file and
// blank the tile. So the demo uses this no-op version.
export const onCoverHealed = () => () => {};
export function reportCoverError() {}
