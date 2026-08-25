import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/apiClient';
import AuthLayout from '../../components/AuthLayout';
import IconInput from '../../components/IconInput';
import AuthModeSelect from '../../components/AuthModeSelect';
import Button from '../../components/Button';

const ROLE_OPTIONS = [
  { value: 'Administration', label: 'Administration', icon: 'shield' },
  { value: 'Counsellor', label: 'Counsellor', icon: 'users' },
];

// Staff Login surface - shared by Administration (District/State/National) and
// Counsellor (Build Prompt Section 3). The same official can hold both roles
// (official_roles is a join table, not a flat column), so the dropdown below
// picks which role this session logs in as - the backend validates the account
// actually holds it, rather than silently defaulting to whichever role happened
// to be first.
export default function StaffLoginScreen({ navigation }) {
  const { login } = useAuth();
  const [role, setRole] = useState('Counsellor');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/staff/login', { email, password, roleName: role });
      await login({ token: data.token, accountType: 'staff', mustChangePassword: data.mustChangePassword });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Staff Login" subtitle="Sign in as Administration or Counsellor.">
      <AuthModeSelect options={ROLE_OPTIONS} value={role} onChange={setRole} />

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

      <Button title={`Sign in as ${role}`} icon="arrow-right" onPress={handleLogin} loading={loading} style={styles.fullWidth} />

      {/* No link to Ministry login here, deliberately - it's an internal-only
          entry point, reachable only via a direct URL (see RootNavigator.js's
          `linking` config), not discoverable through in-app navigation. */}
      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('VictimLogin')}>
        <Text style={styles.link}>Victim login</Text>
      </Pressable>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%', marginTop: spacing.xs },
  error: { color: colors.danger, marginBottom: 8, textAlign: 'center' },
  linkRow: { marginTop: 20, alignItems: 'center' },
  link: { color: colors.primary, fontSize: 13, fontWeight: '500' },
});
