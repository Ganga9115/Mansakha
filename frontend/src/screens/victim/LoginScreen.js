import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiClient } from '../../services/apiClient';
import { useCaseTypeOptions, useDistrictOptions, useLanguageOptions, useVictimRegister, useVictimPasswordLogin } from '../../services/hooks';
import AuthLayout from '../../components/AuthLayout';
import IconInput from '../../components/IconInput';
import SegmentedToggle from '../../components/SegmentedToggle';
import Dropdown from '../../components/Dropdown';
import Stepper from '../../components/Stepper';
import Button from '../../components/Button';

WebBrowser.maybeCompleteAuthSession();

const MODE = { LOGIN: 'login', SIGNUP: 'signup' };
const LOGIN_AUTH_MODE = { PASSWORD: 'password', OTP: 'otp' };
const CONTACT_METHOD = { EMAIL: 'email', MOBILE: 'mobile' };
const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'].map((s) => ({ value: s, label: s }));

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

// Google.useAuthRequest() throws synchronously during render if clientId is
// undefined (expo-auth-session's own invariant check) - isolating the hook
// into its own component that only mounts once EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
// is actually set avoids that (a conditionally SKIPPED component, hooks
// included, is fine; conditionally skipping a hook call inside one component
// is not - rules of hooks).
function GoogleSignInButton({ onVerified, onError, setLoading }) {
  const [, googleResponse, promptGoogleLogin] = Google.useAuthRequest({ clientId: GOOGLE_CLIENT_ID });

  React.useEffect(() => {
    if (googleResponse?.type === 'success' && googleResponse.authentication?.idToken) {
      (async () => {
        onError(null);
        setLoading(true);
        try {
          const data = await apiClient.post('/api/auth/victim/google', { idToken: googleResponse.authentication.idToken });
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
    <Button title="Continue with Google" variant="outline" onPress={() => promptGoogleLogin()} style={styles.fullWidth} />
  );
}

// Victim Login/Signup - Build Prompt Section 3 (OTP via mobile, OTP via
// email, or Gmail/Google OAuth) plus password as a fourth option, added on
// explicit request for parity with FarmConnect - password is always
// optional at registration and OTP/Google always keep working regardless,
// preserving the accessibility reasoning (Section 9) behind not requiring one.
export default function VictimLoginScreen({ navigation }) {
  const { login } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState(MODE.LOGIN);
  const [step, setStep] = useState(1); // signup only

  const [loginAuthMode, setLoginAuthMode] = useState(LOGIN_AUTH_MODE.OTP);
  const [contactMethod, setContactMethod] = useState(CONTACT_METHOD.EMAIL);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [pendingToken, setPendingToken] = useState(null);
  const [fullName, setFullName] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [caseStage, setCaseStage] = useState('');
  const [docketNumber, setDocketNumber] = useState('');
  const [preferredLanguageId, setPreferredLanguageId] = useState('');
  const [address, setAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [stepErrors, setStepErrors] = useState({});

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const caseTypesQuery = useCaseTypeOptions();
  const districtsQuery = useDistrictOptions();
  const languagesQuery = useLanguageOptions();
  const registerMutation = useVictimRegister();
  const passwordLoginMutation = useVictimPasswordLogin();

  const resetOtpFlow = () => { setEmail(''); setCode(''); setRequestId(null); setError(null); };

  const switchMode = (next) => {
    setMode(next);
    setStep(1);
    setError(null);
    resetOtpFlow();
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
      await handleVerifiedContact(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Shared by the Login-mode OTP branch, Signup step 1, and Google - all
  // three ultimately produce the same shape of result.
  const handleVerifiedContact = async (data) => {
    if (data.registered) {
      if (mode === MODE.SIGNUP) toast.info('An account already exists for this contact - signing you in.');
      await login({ token: data.token, accountType: 'victim' });
      return;
    }
    // Verified but no case linked yet - route into registration instead of a
    // dead end, whether this was reached from Login's OTP tab or Signup.
    setPendingToken(data.pendingToken);
    if (data.verifiedContact?.name && !fullName) setFullName(data.verifiedContact.name);
    setMode(MODE.SIGNUP);
    setStep(2);
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
    setLoginAuthMode(LOGIN_AUTH_MODE.OTP);
    toast.info('Use a one-time code to sign in instead - proving your contact this way works the same as resetting a password.');
  };

  const validateStep2 = () => {
    const errors = {};
    if (!fullName.trim()) errors.fullName = 'Required';
    if (!caseTypeId) errors.caseTypeId = 'Required';
    if (!jurisdictionId) errors.jurisdictionId = 'Required';
    if (!caseStage) errors.caseStage = 'Required';
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToStep3 = () => {
    if (validateStep2()) setStep(3);
  };

  const submitRegistration = async (withPassword) => {
    setError(null);
    try {
      const data = await registerMutation.mutateAsync({
        pendingToken,
        fullName: fullName.trim(),
        caseTypeId,
        jurisdictionId,
        caseStage,
        docketNumber: docketNumber.trim() || undefined,
        preferredLanguageId: preferredLanguageId || undefined,
        address: address.trim() || undefined,
        password: withPassword && regPassword ? regPassword : undefined,
      });
      toast.success('Registration complete - welcome to Mansakha.');
      await login({ token: data.token, accountType: 'victim' });
    } catch (err) {
      setError(err.message);
    }
  };

  const caseTypeOptions = (caseTypesQuery.data?.caseTypes || []).map((c) => ({ value: c.case_type_id, label: c.name }));
  const districtOptions = (districtsQuery.data?.jurisdictions || []).map((j) => ({
    value: j.jurisdictionId, label: j.stateName ? `${j.name}, ${j.stateName}` : j.name,
  }));
  const languageOptions = (languagesQuery.data?.languages || []).map((l) => ({ value: l.language_id, label: l.name }));

  const otpFields = (
    <View>
      <SegmentedToggle
        options={[
          { value: CONTACT_METHOD.EMAIL, label: 'Email OTP', icon: 'mail' },
          { value: CONTACT_METHOD.MOBILE, label: 'Mobile OTP', icon: 'smartphone' },
        ]}
        value={contactMethod}
        onChange={(v) => { setContactMethod(v); resetOtpFlow(); }}
      />
      {contactMethod === CONTACT_METHOD.EMAIL ? (
        <View>
          <IconInput
            icon="mail"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!requestId}
          />
          {!requestId ? (
            <Button title="Send code" onPress={requestEmailOtp} loading={loading} style={styles.fullWidth} />
          ) : (
            <>
              <IconInput icon="key" placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
              <Button title="Verify & continue" onPress={verifyEmailOtp} loading={loading} style={styles.fullWidth} />
            </>
          )}
        </View>
      ) : (
        <Text style={styles.notice}>
          Mobile OTP needs a one-time phone-verifier setup on this device/browser before it can send codes -
          not wired up in this build pass yet.
        </Text>
      )}
    </View>
  );

  return (
    <AuthLayout>
      <SegmentedToggle
        options={[{ value: MODE.LOGIN, label: 'Login' }, { value: MODE.SIGNUP, label: 'Signup' }]}
        value={mode}
        onChange={switchMode}
      />

      {mode === MODE.LOGIN && (
        <View>
          <SegmentedToggle
            options={[{ value: LOGIN_AUTH_MODE.PASSWORD, label: 'Password', icon: 'lock' }, { value: LOGIN_AUTH_MODE.OTP, label: 'OTP', icon: 'key' }]}
            value={loginAuthMode}
            onChange={setLoginAuthMode}
          />

          {loginAuthMode === LOGIN_AUTH_MODE.PASSWORD ? (
            <View>
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
                <Text style={styles.link}>Forgot password?</Text>
              </Pressable>
              <Button
                title="Sign In"
                icon="arrow-right"
                onPress={handlePasswordLogin}
                loading={passwordLoginMutation.isPending}
                style={styles.fullWidth}
              />
            </View>
          ) : otpFields}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.divider} />

          {GOOGLE_CLIENT_ID ? (
            <GoogleSignInButton onVerified={handleVerifiedContact} onError={setError} setLoading={setLoading} />
          ) : (
            <View style={styles.googleDisabled}>
              <Text style={styles.notice}>Google sign-in needs EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID configured - not set up yet.</Text>
            </View>
          )}
        </View>
      )}

      {mode === MODE.SIGNUP && (
        <View>
          <Stepper step={step} steps={3} />

          {step === 1 && (
            <View>
              {otpFields}
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.divider} />
              {GOOGLE_CLIENT_ID ? (
                <GoogleSignInButton onVerified={handleVerifiedContact} onError={setError} setLoading={setLoading} />
              ) : (
                <View style={styles.googleDisabled}>
                  <Text style={styles.notice}>Google sign-in needs EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID configured - not set up yet.</Text>
                </View>
              )}
            </View>
          )}

          {step === 2 && (
            <View>
              <IconInput icon="user" placeholder="Full name" value={fullName} onChangeText={setFullName} error={stepErrors.fullName} />
              <Dropdown
                options={caseTypeOptions}
                value={caseTypeId}
                onChange={setCaseTypeId}
                placeholder="Case type"
                error={stepErrors.caseTypeId}
              />
              <Dropdown
                options={districtOptions}
                value={jurisdictionId}
                onChange={setJurisdictionId}
                placeholder="District"
                error={stepErrors.jurisdictionId}
              />
              <Dropdown
                options={CASE_STAGE_OPTIONS}
                value={caseStage}
                onChange={setCaseStage}
                placeholder="Case stage"
                error={stepErrors.caseStage}
              />
              <IconInput icon="hash" placeholder="Docket number (optional)" value={docketNumber} onChangeText={setDocketNumber} />
              <Dropdown options={languageOptions} value={preferredLanguageId} onChange={setPreferredLanguageId} placeholder="Preferred language (optional)" />
              <IconInput icon="map-pin" placeholder="Address (optional)" value={address} onChangeText={setAddress} multiline numberOfLines={2} />

              <Text style={styles.notice}>You'll be asked what you consent to share, and how, right after this.</Text>

              <View style={styles.buttonRow}>
                <Button title="Back" variant="outline" onPress={() => setStep(1)} style={styles.halfWidth} />
                <Button title="Next" icon="arrow-right" onPress={goToStep3} style={styles.halfWidth} />
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.stepIntro}>Set a password for faster sign-in (optional) - OTP will always still work.</Text>
              <IconInput
                icon="lock"
                placeholder="Create a password (optional)"
                value={regPassword}
                onChangeText={setRegPassword}
                secureTextEntry
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.buttonRow}>
                <Button title="Back" variant="outline" onPress={() => setStep(2)} style={styles.halfWidth} />
                <Button
                  title="Create Account"
                  icon="arrow-right"
                  onPress={() => submitRegistration(true)}
                  loading={registerMutation.isPending}
                  style={styles.halfWidth}
                />
              </View>
              <Button
                title="Skip, use OTP only"
                variant="ghost"
                onPress={() => submitRegistration(false)}
                loading={registerMutation.isPending}
                style={styles.fullWidth}
              />
            </View>
          )}
        </View>
      )}

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{mode === MODE.LOGIN ? "Don't have an account? " : 'Already have an account? '}</Text>
        <Pressable onPress={() => switchMode(mode === MODE.LOGIN ? MODE.SIGNUP : MODE.LOGIN)}>
          <Text style={styles.link}>{mode === MODE.LOGIN ? 'Sign up' : 'Sign in'}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('StaffLogin')}>
        <Text style={styles.link}>Government / Staff login</Text>
      </Pressable>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  fullWidth: { width: '100%', marginTop: spacing.xs },
  halfWidth: { flex: 1 },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  notice: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', padding: spacing.sm },
  stepIntro: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  error: { ...typography.bodySmall, color: colors.danger, marginTop: spacing.sm, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  googleDisabled: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.md,
    alignItems: 'center', backgroundColor: colors.white, opacity: 0.6,
  },
  forgotRow: { alignItems: 'flex-end', marginBottom: spacing.md, marginTop: -spacing.xs },
  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { ...typography.bodySmall, color: colors.textSecondary },
  linkRow: { marginTop: spacing.md, alignItems: 'center' },
  link: { color: colors.primary, fontSize: 13, fontWeight: '500' },
});
