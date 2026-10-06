// Zip-slip / path-traversal guard: a resolved destination path must stay
// inside destDir. Shared by every place a filesystem destination is derived
// from untrusted input (a zip entry's name, a CSV row's own reference to an
// image file) — previously hand-duplicated in both places; unit-tested here
// once instead of twice. No "path" module dependency (Metro/React Native
// has no Node core-module polyfill for it) — checks both possible
// separators directly instead of asking the platform for path.sep, since
// every real caller's destDir/destPath already use whichever separator
// their own platform does.
function isPathContained(destPath, destDir) {
  return destPath === destDir || destPath.startsWith(destDir + "/") || destPath.startsWith(destDir + "\\");
}

module.exports = { isPathContained };
