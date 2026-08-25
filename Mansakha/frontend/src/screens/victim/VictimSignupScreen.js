import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiClient } from '../../services/apiClient';
import {
  useCaseTypeOptions,
  useDistrictOptions,
  useLanguageOptions,
  useVictimRegister,
} from '../../services/hooks';
import IconInput from '../../components/IconInput';
import AuthModeSelect from '../../components/AuthModeSelect';
import Dropdown from '../../components/Dropdown';

WebBrowser.maybeCompleteAuthSession();

const AUTH_MODE = { EMAIL_OTP: 'email_otp', MOBILE_OTP: 'mobile_otp' };
const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'].map((s) => ({ value: s, label: s }));
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
    <Pressable style={styles.outlineBtn} onPress={() => promptGoogleLogin()}>
      <Feather name="log-in" size={18} color={THEME.primaryDark} style={{ marginRight: 8 }} />
      <Text style={styles.outlineBtnText}>Continue with Google</Text>
    </Pressable>
  );
}

// Horizontal Stepper Bar aligned with login styling
function HorizontalStepper({ currentStep }) {
  const steps = ['Verify contact', 'Case details', 'Password'];
  return (
    <View style={stepperStyles.container}>
      {steps.map((label, idx) => {
        const stepNum = idx + 1;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        return (
          <React.Fragment key={label}>
            <View style={stepperStyles.stepItem}>
              <View style={[stepperStyles.circle, isActive && stepperStyles.activeCircle, isDone && stepperStyles.doneCircle]}>
                {isDone ? (
                  <Feather name="check" size={12} color="#FFF" />
                ) : (
                  <Text style={[stepperStyles.circleText, isActive && stepperStyles.activeCircleText]}>{stepNum}</Text>
                )}
              </View>
              <Text style={[stepperStyles.label, isActive && stepperStyles.activeLabel]}>{label}</Text>
            </View>
            {idx < steps.length - 1 && (
              <View style={[stepperStyles.line, isDone && stepperStyles.doneLine]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, width: '100%' },
  stepItem: { alignItems: 'center' },
  circle: { width: 26, height: 26, borderRadius: 13, backgroundColor: THEME.border, justifyContent: 'center', alignItems: 'center' },
  activeCircle: { backgroundColor: THEME.accentIcon },
  doneCircle: { backgroundColor: '#10B981' },
  circleText: { fontSize: 12, fontWeight: '700', color: THEME.textMuted },
  activeCircleText: { color: '#FFF' },
  label: { fontSize: 11, color: THEME.textMuted, marginTop: 4, fontWeight: '500' },
  activeLabel: { color: THEME.textMain, fontWeight: '700' },
  line: { flex: 1, height: 2, backgroundColor: THEME.border, marginHorizontal: 6, marginBottom: 16 },
  doneLine: { backgroundColor: '#10B981' },
});

export default function VictimSignupScreen({ route, navigation }) {
  const { login } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState(route.params?.pendingToken ? 2 : 1);
  const [authMode, setAuthMode] = useState(AUTH_MODE.EMAIL_OTP);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [requestId, setRequestId] = useState(null);

  const [pendingToken, setPendingToken] = useState(route.params?.pendingToken || null);
  const [fullName, setFullName] = useState(route.params?.verifiedContact?.name || '');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [stateName, setStateName] = useState('');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [caseStage, setCaseStage] = useState('');
  const [docketNumber, setDocketNumber] = useState('');
  const [preferredLanguageId, setPreferredLanguageId] = useState('');
  const [address, setAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [stepErrors, setStepErrors] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const caseTypesQuery = useCaseTypeOptions();
  const districtsQuery = useDistrictOptions();
  const languagesQuery = useLanguageOptions();
  const registerMutation = useVictimRegister();

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
        toast.info('An account already exists for this contact - signing you in.');
        await login({ token: data.token, accountType: 'victim' });
      } else {
        setPendingToken(data.pendingToken);
        if (data.verifiedContact?.name && !fullName) setFullName(data.verifiedContact.name);
        setStep(2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifiedContact = async (data) => {
    if (data.registered) {
      toast.info('An account already exists for this contact - signing you in.');
      await login({ token: data.token, accountType: 'victim' });
      return;
    }
    setPendingToken(data.pendingToken);
    if (data.verifiedContact?.name && !fullName) setFullName(data.verifiedContact.name);
    setStep(2);
  };

  const validateStep2 = () => {
    const errors = {};
    if (!fullName.trim()) errors.fullName = 'Required';
    if (!caseTypeId) errors.caseTypeId = 'Required';
    if (!stateName) errors.stateName = 'Required';
    if (!jurisdictionId) errors.jurisdictionId = 'Required';
    if (!caseStage) errors.caseStage = 'Required';
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
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
    
    // Pass session token to success screen instead of logging in directly
    navigation.navigate('SignupSuccess', { token: data.token });
  } catch (err) {
    setError(err.message);
  }
};

  const caseTypeOptions = (caseTypesQuery.data?.caseTypes || []).map((c) => ({ value: c.case_type_id, label: c.name }));
  const allDistricts = districtsQuery.data?.jurisdictions || [];
  const stateOptions = [...new Set(allDistricts.map((j) => j.stateName).filter(Boolean))].sort().map((s) => ({ value: s, label: s }));
  const districtOptions = allDistricts.filter((j) => !stateName || j.stateName === stateName).map((j) => ({ value: j.jurisdictionId, label: j.name }));
  const languageOptions = (languagesQuery.data?.languages || []).map((l) => ({ value: l.language_id, label: l.name }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Matching Brand Header */}
      <View style={styles.headerBox}>
        <View style={styles.logoBadge}>
          <Feather name="shield" size={28} color={THEME.accentIcon} />
        </View>
        <Text style={styles.screenTitle}>Create Account</Text>
        <Text style={styles.screenSubtitle}>
          Fill in your details so your case history can be tracked correctly.
        </Text>
      </View>

      {/* Modern Horizontal Stepper */}
      <HorizontalStepper currentStep={step} />

      <View style={styles.card}>
        {step === 1 && (
          <View>
            <AuthModeSelect
              options={[
                { value: AUTH_MODE.EMAIL_OTP, label: 'Email OTP', icon: 'mail' },
                { value: AUTH_MODE.MOBILE_OTP, label: 'Mobile OTP', icon: 'smartphone' },
              ]}
              value={authMode}
              onChange={setAuthMode}
            />
            {authMode === AUTH_MODE.EMAIL_OTP ? (
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
              <Text style={styles.notice}>Mobile OTP setup needed for this device - not wired up in this pass.</Text>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.divider} />

            {GOOGLE_CLIENT_ID ? (
              <GoogleSignInButton onVerified={handleVerifiedContact} onError={setError} setLoading={setLoading} />
            ) : (
              <View style={styles.googleDisabled}>
                <Text style={styles.notice}>Google sign-in client ID not set up yet.</Text>
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <IconInput icon="user" placeholder="Full name" value={fullName} onChangeText={setFullName} error={stepErrors.fullName} />
            <Dropdown options={caseTypeOptions} value={caseTypeId} onChange={setCaseTypeId} placeholder="Case type" error={stepErrors.caseTypeId} />
            <Dropdown options={stateOptions} value={stateName} onChange={(v) => { setStateName(v); setJurisdictionId(''); }} placeholder="State" error={stepErrors.stateName} />
            <Dropdown options={districtOptions} value={jurisdictionId} onChange={setJurisdictionId} placeholder={stateName ? 'District' : 'Select a state first'} error={stepErrors.jurisdictionId} disabled={!stateName} />
            <Dropdown options={CASE_STAGE_OPTIONS} value={caseStage} onChange={setCaseStage} placeholder="Case stage" error={stepErrors.caseStage} />
            <IconInput icon="hash" placeholder="Docket number (optional)" value={docketNumber} onChangeText={setDocketNumber} />
            <Dropdown options={languageOptions} value={preferredLanguageId} onChange={setPreferredLanguageId} placeholder="Preferred language (optional)" />
            <IconInput icon="map-pin" placeholder="Address (optional)" value={address} onChangeText={setAddress} multiline numberOfLines={2} />

            <Text style={styles.notice}>You'll be asked what you consent to share, right after this.</Text>
            
            <View style={styles.buttonRow}>
              <Pressable style={[styles.outlineBtn, styles.halfBtn]} onPress={() => setStep(1)}>
                <Text style={styles.outlineBtnText}>Back</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, styles.halfBtn]} onPress={() => { if (validateStep2()) setStep(3); }}>
                <Text style={styles.primaryBtnText}>Next</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <IconInput
              icon="lock"
              placeholder="Create a password (optional)"
              value={regPassword}
              onChangeText={setRegPassword}
              secureTextEntry={!showPassword}
              trailingIcon={showPassword ? 'eye-off' : 'eye'}
              onTrailingPress={() => setShowPassword((v) => !v)}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.buttonRow}>
              <Pressable style={[styles.outlineBtn, styles.halfBtn]} onPress={() => setStep(2)}>
                <Text style={styles.outlineBtnText}>Back</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, styles.halfBtn]} onPress={() => submitRegistration(true)} disabled={registerMutation.isPending}>
                <Text style={styles.primaryBtnText}>{registerMutation.isPending ? 'Creating...' : 'Create Account'}</Text>
              </Pressable>
            </View>

            <Pressable style={{ marginTop: 12, alignItems: 'center' }} onPress={() => submitRegistration(false)}>
              <Text style={styles.linkText}>Skip, use OTP only</Text>
            </Pressable>
          </View>
        )}

        {/* Security Info Banner */}
        <View style={styles.bannerInfo}>
          <Feather name="shield" size={18} color={THEME.accentIcon} style={{ marginRight: 10 }} />
          <Text style={styles.bannerText}>
            Your data is fully encrypted and never shared without your explicit consent.
          </Text>
        </View>

        {/* Navigation back to sign in */}
        <Pressable style={styles.switchRow} onPress={() => navigation.navigate('VictimLogin')}>
          <Text style={styles.switchText}>Already have an account? <Text style={styles.linkText}>Sign in</Text></Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 24, paddingVertical: 40, alignItems: 'center' },
  headerBox: { alignItems: 'center', marginBottom: 16 },
  logoBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: THEME.accentBlue,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  screenTitle: { fontSize: 24, fontWeight: '700', color: THEME.textMain, textAlign: 'center' },
  screenSubtitle: { fontSize: 13, color: THEME.textMuted, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  card: { width: '100%', backgroundColor: THEME.cardBg, borderRadius: 20, padding: 20, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  outlineBtn: { borderWidth: 1, borderColor: THEME.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  outlineBtnText: { color: THEME.textMain, fontWeight: '600', fontSize: 15 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  halfBtn: { flex: 1 },
  linkText: { color: THEME.accentIcon, fontSize: 13, fontWeight: '600' },
  notice: { fontSize: 12, color: THEME.textMuted, textAlign: 'center', marginVertical: 8 },
  errorText: { fontSize: 13, color: THEME.danger, textAlign: 'center', marginTop: 8 },
  divider: { height: 1, backgroundColor: THEME.border, marginVertical: 16 },
  googleDisabled: { borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 12, backgroundColor: THEME.bg },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.accentBlue, borderRadius: 12, padding: 12, marginTop: 16 },
  bannerText: { fontSize: 12, color: THEME.textMain, flex: 1, lineHeight: 16 },
  switchRow: { marginTop: 16, alignItems: 'center' },
  switchText: { fontSize: 13, color: THEME.textMuted },
});