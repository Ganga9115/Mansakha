import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// A small info-icon + tap-to-reveal helper text, directly next to a
// complex metric/term - satisfies "tooltips and disclaimers inline"
// without a hover-only tooltip library (hover doesn't exist on touch
// devices anyway, so tap-to-toggle is the accessible default here).
export default function InlineTooltip({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="More information"
        accessibilityHint={text}
      >
        <Feather name="info" size={13} color={colors.textSecondary} style={styles.icon} />
      </Pressable>
      {open && (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', marginLeft: spacing.xs },
  icon: { marginTop: 1 },
  bubble: {
    position: 'absolute', top: 18, left: -8, zIndex: 20, width: 220,
    backgroundColor: colors.textPrimary, borderRadius: radius.sm, padding: spacing.sm,
  },
  bubbleText: { ...typography.caption, color: colors.white },
});
