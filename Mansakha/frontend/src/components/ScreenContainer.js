import React from 'react';
import { ScrollView, View, StyleSheet, useWindowDimensions } from 'react-native';
import { colors } from '../theme/colors';
import { layout, responsivePadding } from '../theme/layout';

// Every screen's outer wrapper - centers content at a defined max-width
// with responsive gutters, instead of each screen stretching its content
// edge-to-edge on a wide browser window. `scroll=false` for screens that
// already manage their own FlatList/ScrollView internally.
export default function ScreenContainer({ children, scroll = true, style, contentStyle }) {
  const { width } = useWindowDimensions();
  const padding = responsivePadding(width);

  const inner = (
    <View style={[styles.inner, { paddingHorizontal: padding }, contentStyle]}>
      {children}
    </View>
  );

  if (!scroll) {
    return <View style={[styles.root, style]}>{inner}</View>;
  }

  return (
    <ScrollView style={[styles.root, style]} contentContainerStyle={styles.scrollContent}>
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingVertical: 24, flex: 1 },
});
