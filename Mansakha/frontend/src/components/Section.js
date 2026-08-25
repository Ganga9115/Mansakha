import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { layout } from '../theme/layout';

// A real, named section (eyebrow + title + optional trailing action, then
// content) - replaces dashboards being an undifferentiated stack of
// same-weight Cards with clearly separated, labeled zones.
export default function Section({ eyebrow, title, action, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {(eyebrow || title || action) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
            {title && <Text style={styles.title}>{title}</Text>}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: layout.sectionGap },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    marginBottom: layout.sectionHeaderGap,
  },
  headerText: { flex: 1 },
  eyebrow: { ...typography.label, color: colors.primary, marginBottom: 2 },
  title: { ...typography.h2, color: colors.textPrimary },
});
