// No babel config existed before this - react-native-reanimated (already
// an installed dependency) was consequently never actually functional:
// its `useAnimatedStyle`/worklet transform requires this plugin, listed
// last, or animations silently no-op or throw at runtime.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
