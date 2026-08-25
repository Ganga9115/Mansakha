import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { spacing } from '../theme/spacing';
import { layout } from '../theme/layout';
import StatCard from './StatCard';

// A real grid for stat tiles - fixed column count per breakpoint, every
// tile sharing StatCard's flat/bordered proportions. items:
// [{ label, value, icon?, disclaimer? }] (color is no longer used - the
// numeric value itself is the visual anchor, not a colored icon tile).
export default function StatGrid({ items }) {
  const { width } = useWindowDimensions();
  const columns = width >= layout.breakpoint.wide ? 4 : width >= layout.breakpoint.tablet ? 3 : 2;
  const widthPct = `${100 / columns}%`;

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={item.label} style={[styles.tileWrap, { width: widthPct }]}>
          <StatCard label={item.label} value={item.value} icon={item.icon} disclaimer={item.disclaimer} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm },
  tileWrap: { padding: spacing.sm },
});
