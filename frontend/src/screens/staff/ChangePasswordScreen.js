import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/apiClient';
import { useToast } from '../../context/ToastContext';
import { spacing } from '../../theme/spacing';
import AuthLayout from '../../components/AuthLayout';
import IconInput from '../../components/IconInput';
import Button from '../../components/Button';

// Optional forced "change your password" step on first login for Ministry-provisioned
// Staff/Ministry accounts (Build Prompt Section 3).
export default function ChangePasswordScreen() {
  const { session, updateSession } = useAuth();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setPasswordError(null);
    setConfirmError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/api/auth/staff/change-password', { newPassword }, session.token);
      toast.success('Password updated');
      await updateSession({ mustChangePassword: false });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Set a new password" subtitle="Required before you continue — this is a one-time step.">
      <IconInput
        icon="lock"
        placeholder="New password"
        value={newPassword}
        onChangeText={(v) => { setNewPassword(v); if (passwordError) setPasswordError(null); }}
        secureTextEntry={!showPassword}
        trailingIcon={showPassword ? 'eye-off' : 'eye'}
        onTrailingPress={() => setShowPassword((v) => !v)}
        error={passwordError}
      />
      <IconInput
        icon="lock"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChangeText={(v) => { setConfirmPassword(v); if (confirmError) setConfirmError(null); }}
        secureTextEntry={!showPassword}
        error={confirmError}
      />

      <Button title="Save & continue" onPress={handleSubmit} loading={loading} style={styles.button} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  button: { marginTop: spacing.xs },
});
