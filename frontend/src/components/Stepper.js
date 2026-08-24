import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

// Numbered circle-and-connector-bar stepper, matching FarmConnect's signup
// wizard (filled green circle -> bar -> next circle). step is 1-indexed;
// steps is the total count.
export default function Stepper({ step, steps = 3 }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: steps }).map((_, i) => {
        const n = i + 1;
        const reached = n <= step;
        const completed = n < step;
        return (
          <React.Fragment key={n}>
            <View style={[styles.circle, reached && styles.circleActive]}>
              {completed ? (
                <Feather name="check" size={14} color={colors.onPrimary} />
              ) : (
                <Text style={[styles.circleText, reached && styles.circleTextActive]}>{n}</Text>
              )}
            </View>
            {n < steps && <View style={[styles.bar, n < step && styles.barActive]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const CIRCLE_SIZE = 28;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  circle: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  circleActive: { backgroundColor: colors.primary },
  circleText: { ...typography.bodySmall, fontWeight: '700', color: colors.textSecondary },
  circleTextActive: { color: colors.onPrimary },
  bar: { width: 32, height: 3, borderRadius: 2, backgroundColor: colors.border, marginHorizontal: 6 },
  barActive: { backgroundColor: colors.primary },
});
