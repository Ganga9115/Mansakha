import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Icon-prefixed text input with an optional trailing action (used for the
// password show/hide toggle) - @expo/vector-icons is already bundled with Expo,
// not a new dependency. `error`: string shown as helper text + red border.
export default function IconInput({ icon, trailingIcon, onTrailingPress, error, onFocus, onBlur, ...textInputProps }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <View style={[styles.wrapper, focused && styles.wrapperFocused, error && styles.wrapperError]}>
        <Feather name={icon} size={18} color={error ? colors.danger : colors.textSecondary} style={styles.leadingIcon} />
        <TextInput
          style={[styles.input, trailingIcon && styles.inputWithTrailing]}
          placeholderTextColor={colors.textSecondary}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...textInputProps}
        />
        {trailingIcon && (
          <Pressable onPress={onTrailingPress} style={styles.trailingButton} hitSlop={8}>
            <Feather name={trailingIcon} size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  wrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: spacing.md,
  },
  wrapperFocused: { borderColor: colors.primary },
  wrapperError: { borderColor: colors.danger },
  leadingIcon: { marginRight: spacing.sm },
  input: {
    flex: 1, paddingVertical: 12, color: colors.textPrimary, ...typography.body,
    // react-native-web renders TextInput as a browser <input>, which gets its
    // own default focus outline (a thick black box in Chrome/Edge) layered on
    // top of the wrapper's intentional border - this suppresses that, since the
    // wrapper's border is already the field's visual boundary.
    outlineStyle: 'none', outlineWidth: 0,
  },
  inputWithTrailing: { marginRight: 4 },
  trailingButton: { padding: 4 },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, marginLeft: spacing.xs },
});
