const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// three.js-ecosystem packages (@react-three/fiber, @react-three/drei) ship a
// "module" field pointing at a pre-bundled ESM file that Metro's resolver
// cannot load as a package entry point (unlike webpack/vite, which read
// "module" natively) - it errors as if the file doesn't exist at all, even
// though it's present on disk. Dropping "browser"/"module" from the field
// priority forces Metro to always use each package's "main" field instead,
// which points to a plain CommonJS bundle Metro handles natively.
config.resolver.resolverMainFields = ['react-native', 'main'];

module.exports = config;
