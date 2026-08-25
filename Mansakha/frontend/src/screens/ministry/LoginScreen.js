import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/apiClient';
import AuthLayout from '../../components/AuthLayout';
import IconInput from '../../components/IconInput';
import Button from '../../components/Button';
import AlertBanner from '../../components/AlertBanner';

// Ministry Super-login - a distinct entry point, not merged with Staff Login
// (Build Prompt Section 3). Internal-only: reachable only via a direct URL, never
// linked from the public-facing app (see RootNavigator.js's `linking` config).
// Deliberately standalone - no link back to Staff/Victim login either, so this
// page doesn't itself become a way to discover those aren't the only surfaces.
export default function MinistryLoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/ministry/login', { email, password });
      await login({ token: data.token, accountType: 'ministry', mustChangePassword: data.mustChangePassword });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Ministry Super-login" subtitle="Internal access only">
      <AlertBanner variant="warning" title="Restricted access">
        This console is for authorized Ministry personnel only. All access is logged and audited.
      </AlertBanner>
      <IconInput
        icon="mail"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <IconInput
        icon="lock"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        trailingIcon={showPassword ? 'eye-off' : 'eye'}
        onTrailingPress={() => setShowPassword((v) => !v)}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Sign in" onPress={handleLogin} loading={loading} style={styles.fullWidth} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%', marginTop: spacing.xs },
  error: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.sm, textAlign: 'center' },
});
