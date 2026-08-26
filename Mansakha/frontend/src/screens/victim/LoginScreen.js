import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiClient } from '../../services/apiClient';
import { useVictimPasswordLogin } from '../../services/hooks';
import { authContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import IconInput from '../../components/IconInput';
import AuthModeSelect from '../../components/AuthModeSelect';

WebBrowser.maybeCompleteAuthSession();

const AUTH_MODE = { PASSWORD: 'password', EMAIL_OTP: 'email_otp', MOBILE_OTP: 'mobile_otp' };
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

const THEME = {
  bg: '#F8F9FD',
  cardBg: '#FFFFFF',
  primaryDark: '#0F172A',
  textMain: '#0F172A',
  textMuted: '#64748B',
  accentBlue: '#E0F2FE',
  accentIcon: '#0284C7',
  danger: '#EF4444',
  border: '#E2E8F0',
};

function GoogleSignInButton({ onVerified, onError, setLoading }) {
  const [, googleResponse, promptGoogleLogin] = Google.useIdTokenAuthRequest({ clientId: GOOGLE_CLIENT_ID });

  React.useEffect(() => {
    // On web this flow returns the ID token in `params.id_token` (implicit
    // flow), not `authentication.idToken` - that field is only populated by
    // expo-auth-session's auto code-exchange path, which doesn't run here.
    if (googleResponse?.type === 'success' && googleResponse.params?.id_token) {
      (async () => {
        onError(null);
        setLoading(true);
        try {
          const data = await apiClient.post('/api/auth/victim/google', { idToken: googleResponse.params.id_token });
          await onVerified(data);
        } catch (err) {
          onError(err.message);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [googleResponse]);

  return (
    <Pressable style={styles.outlineBtn} onPress={() => promptGoogleLogin()}>
      <Feather name="log-in" size={18} color={THEME.primaryDark} style={{ marginRight: 8 }} />
      <Text style={styles.outlineBtnText}>Continue with Google</Text>
    </Pressable>
  );
}

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const toast = useToast();
  const { tier } = useResponsive();

  const [authMode, setAuthMode] = useState(AUTH_MODE.EMAIL_OTP);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState(null);

  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneRequestId, setPhoneRequestId] = useState(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const passwordLoginMutation = useVictimPasswordLogin();

  const resetOtpFlow = () => {
    setEmail(''); setCode(''); setRequestId(null);
    setPhone(''); setPhoneCode(''); setPhoneRequestId(null);
    setError(null);
  };

  const requestEmailOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/victim/otp/request', { email });
      setRequestId(data.requestId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/victim/otp/verify', { requestId, code });
      if (data.registered) {
        await login({ token: data.token, accountType: 'victim' });
      } else {
        navigation.navigate('VictimSignup', { pendingToken: data.pendingToken, verifiedContact: data.verifiedContact });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestPhoneOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/victim/phone-otp/request', { phone: `+91${phone}` });
      setPhoneRequestId(data.requestId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/victim/phone-otp/verify', { requestId: phoneRequestId, code: phoneCode });
      if (data.registered) {
        await login({ token: data.token, accountType: 'victim' });
      } else {
        navigation.navigate('VictimSignup', { pendingToken: data.pendingToken, verifiedContact: data.verifiedContact });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    setError(null);
    try {
      const data = await passwordLoginMutation.mutateAsync({ identifier, password });
      await login({ token: data.token, accountType: 'victim' });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleForgotPassword = () => {
    setAuthMode(AUTH_MODE.EMAIL_OTP);
    toast.info('Use a one-time code to sign in instead - proving your contact this way works the same as resetting a password.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerBox}>
        <View style={styles.logoBadge}>
          <Feather name="shield" size={28} color={THEME.accentIcon} />
        </View>
        <Text style={styles.screenTitle}>Welcome to Mansakha</Text>
        <Text style={styles.screenSubtitle}>
          Secure, non-judgmental, and confidential mental well-being support anytime.
        </Text>
      </View>

      <View style={[styles.card, { maxWidth: authContentWidth[tier] }]}>
        <AuthModeSelect
          options={[
            { value: AUTH_MODE.PASSWORD, label: 'Password', icon: 'lock' },
            { value: AUTH_MODE.EMAIL_OTP, label: 'Email OTP', icon: 'mail' },
            { value: AUTH_MODE.MOBILE_OTP, label: 'Mobile OTP', icon: 'smartphone' },
          ]}
          value={authMode}
          onChange={(v) => { setAuthMode(v); resetOtpFlow(); }}
        />

        {authMode === AUTH_MODE.PASSWORD ? (
          <View style={{ marginTop: 12 }}>
            <IconInput icon="user" placeholder="Email or phone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
            <IconInput
              icon="lock"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              trailingIcon={showPassword ? 'eye-off' : 'eye'}
              onTrailingPress={() => setShowPassword((v) => !v)}
            />
            <Pressable onPress={handleForgotPassword} style={styles.forgotRow}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={handlePasswordLogin} disabled={passwordLoginMutation.isPending}>
              <Text style={styles.primaryBtnText}>{passwordLoginMutation.isPending ? 'Signing In...' : 'Sign In'}</Text>
            </Pressable>
          </View>
        ) : authMode === AUTH_MODE.EMAIL_OTP ? (
          <View style={{ marginTop: 12 }}>
            <IconInput icon="mail" placeholder="Email Address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!requestId} />
            {!requestId ? (
              <Pressable style={styles.primaryBtn} onPress={requestEmailOtp} disabled={loading}>
                <Text style={styles.primaryBtnText}>{loading ? 'Sending...' : 'Send Code'}</Text>
              </Pressable>
            ) : (
              <>
                <IconInput icon="key" placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
                <Pressable style={styles.primaryBtn} onPress={verifyEmailOtp} disabled={loading}>
                  <Text style={styles.primaryBtnText}>{loading ? 'Verifying...' : 'Verify & Continue'}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            <IconInput
              icon="smartphone"
              prefix="+91"
              placeholder="Phone number"
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
              keyboardType="phone-pad"
              editable={!phoneRequestId}
            />
            {!phoneRequestId ? (
              <Pressable style={styles.primaryBtn} onPress={requestPhoneOtp} disabled={loading}>
                <Text style={styles.primaryBtnText}>{loading ? 'Sending...' : 'Send Code'}</Text>
              </Pressable>
            ) : (
              <>
                <IconInput icon="key" placeholder="6-digit code" value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" />
                <Pressable style={styles.primaryBtn} onPress={verifyPhoneOtp} disabled={loading}>
                  <Text style={styles.primaryBtnText}>{loading ? 'Verifying...' : 'Verify & Continue'}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.divider} />

        {GOOGLE_CLIENT_ID ? (
          <GoogleSignInButton
            onVerified={async (data) => {
              if (data.registered) await login({ token: data.token, accountType: 'victim' });
              else navigation.navigate('VictimSignup', { pendingToken: data.pendingToken, verifiedContact: data.verifiedContact });
            }}
            onError={setError}
            setLoading={setLoading}
          />
        ) : (
          <View style={styles.googleDisabled}>
            <Text style={styles.notice}>Google sign-in client ID not set up yet.</Text>
          </View>
        )}

        <View style={styles.bannerInfo}>
          <Feather name="shield" size={18} color={THEME.accentIcon} style={{ marginRight: 10 }} />
          <Text style={styles.bannerText}>
            Your data is fully encrypted and never shared without your explicit consent.
          </Text>
        </View>

        <Pressable style={styles.switchRow} onPress={() => navigation.navigate('VictimSignup')}>
          <Text style={styles.switchText}>Don't have an account? <Text style={styles.linkText}>Sign up</Text></Text>
        </Pressable>
      </View>

      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('StaffLogin')}>
        <Text style={styles.linkText}>Counsellor / Admin Login</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 24, paddingVertical: 40, alignItems: 'center' },
  headerBox: { alignItems: 'center', marginBottom: 20 },
  logoBadge: { width: 64, height: 64, borderRadius: 20, backgroundColor: THEME.accentBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  screenTitle: { fontSize: 24, fontWeight: '700', color: THEME.textMain, textAlign: 'center' },
  screenSubtitle: { fontSize: 13, color: THEME.textMuted, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  card: { width: '100%', backgroundColor: THEME.cardBg, borderRadius: 20, padding: 20, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderColor: THEME.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  outlineBtnText: { color: THEME.textMain, fontWeight: '600', fontSize: 15 },
  forgotRow: { alignItems: 'flex-end', marginTop: 4, marginBottom: 8 },
  linkText: { color: THEME.accentIcon, fontSize: 13, fontWeight: '600' },
  notice: { fontSize: 12, color: THEME.textMuted, textAlign: 'center', marginVertical: 8 },
  errorText: { fontSize: 13, color: THEME.danger, textAlign: 'center', marginTop: 8 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 16 },
  googleDisabled: { borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 12, backgroundColor: THEME.bg },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.accentBlue, borderRadius: 12, padding: 12, marginTop: 16 },
  bannerText: { fontSize: 12, color: THEME.textMain, flex: 1, lineHeight: 16 },
  switchRow: { marginTop: 16, alignItems: 'center' },
  switchText: { fontSize: 13, color: THEME.textMuted },
  linkRow: { marginTop: 24, padding: 10 },
});