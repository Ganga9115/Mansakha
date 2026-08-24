import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

const RISK_COLOR = { Low: colors.low, Moderate: colors.moderate, High: colors.high, Critical: colors.danger };

export default function RiskBadge({ riskLevel }) {
  if (!riskLevel) return null;
  const color = RISK_COLOR[riskLevel] || colors.textSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.text}>{riskLevel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  text: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
