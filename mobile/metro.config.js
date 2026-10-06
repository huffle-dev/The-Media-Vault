// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Browser demo build (scripts/build-phone-demo.js sets MEDIA_VAULT_PHONE_DEMO=1): when bundling for
// the web, swap the server connection and the phone-only libraries for in-memory stand-ins from
// ./demo, so the real app screens run in a page with the made-up demo library. The phone build never
// sets the variable and is unaffected.
if (process.env.MEDIA_VAULT_PHONE_DEMO) {
  const demo = (...p) => path.join(__dirname, 'demo', ...p);
  const byPackage = {
    'expo-secure-store': demo('shims', 'secureStore.js'),
    'expo-file-system': demo('shims', 'fileSystem.js'),
    'expo-camera': demo('shims', 'phoneOnly.js'),
    'expo-share-intent': demo('shims', 'phoneOnly.js'),
    'react-native-webview': demo('shims', 'phoneOnly.js'),
    'expo-image-picker': demo('shims', 'phoneOnly.js'),
    'expo-image-manipulator': demo('shims', 'phoneOnly.js'),
    'expo-sqlite/localStorage/install': demo('shims', 'empty.js'),
    'react-native-url-polyfill/auto': demo('shims', 'empty.js'),
  };
  const byLocalFile = { supabase: demo('supabase.js'), coverArtStorage: demo('coverArtStorage.js') };
  const original = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web') {
      if (byPackage[moduleName]) return { type: 'sourceFile', filePath: byPackage[moduleName] };
      const local = /(?:^|\/)(supabase|coverArtStorage)$/.exec(moduleName);
      const from = context.originModulePath || '';
      if (local && moduleName.startsWith('.') && from.startsWith(__dirname) && !from.includes('node_modules') && !from.startsWith(demo())) {
        return { type: 'sourceFile', filePath: byLocalFile[local[1]] };
      }
    }
    return (original || context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
