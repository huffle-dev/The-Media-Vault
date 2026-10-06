// Re-exports every module in this package from one place. Consumers can
// either `require("@media-vault/core")` for everything, or reach a single
// file directly (e.g. `require("@media-vault/core/format")`) the same way
// the desktop app used to reach these under lib/.
module.exports = {
  ...require("./authValidation"),
  ...require("./csv"),
  ...require("./csvMapping"),
  ...require("./discogsParser"),
  ...require("./fetchWithTimeout"),
  ...require("./folderScan"),
  ...require("./format"),
  ...require("./htmlText"),
  ...require("./httpHeaders"),
  ...require("./openLibraryParser"),
  ...require("./pathSafety"),
  ...require("./ratingParsers"),
  ...require("./textEncoding"),
};
