import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, Platform, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVictimLogin } from '../../services/hooks';
import { apiClient } from '../../services/apiClient';
import { useResponsive } from '../../hooks/useResponsive';
import IconInput from '../../components/IconInput';
import { typography } from '../../theme/typography';

const THEME = {
  bg: '#F0F9FF', // Soft sky blue background
  cardBg: 'rgba(255, 255, 255, 0.95)',
  primaryDark: '#1E1B4B', // Deep dark purple/blue for button
  textMain: '#1E1B4B',
  textMuted: '#64748B',
  inputBg: '#F8FAFC', // Very light filled background for inputs
  accentIcon: '#0284C7',
  danger: '#EF4444',
  border: 'rgba(255, 255, 255, 1)',
};

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { isDesktop } = useResponsive();
  const toast = useToast();

  const [docketNumber, setDocketNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const loginMutation = useVictimLogin();

  const handleLogin = async () => {
    if (!docketNumber.trim() || !password.trim()) {
      toast.error('Please fill in all fields.');
      return;
    }
    try {
      const data = await loginMutation.mutateAsync({
        docketNumber: docketNumber.trim(),
        password: password.trim(),
      });
      if (data.mustChangePassword) {
        setTempToken(data.token);
        setRequirePasswordChange(true);
        return;
      }
      await login({ token: data.token, accountType: 'victim' });
    } catch (err) {
      console.error('Login error:', err);
      toast.error(err.message || 'Login failed - check your details and try again');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setChangingPassword(true);
    try {
      await apiClient.post('/api/auth/victim/change-password', { newPassword }, tempToken);
      await login({ token: tempToken, accountType: 'victim' });
    } catch (err) {
      toast.error(err.message || 'Could not update password.');
      setChangingPassword(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Abstract Background Blobs */}
      <View style={styles.bgBlob1} />
      <View style={styles.bgBlob2} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, isDesktop ? styles.cardDesktop : styles.cardMobile]}>
          
          {/* Left Pane: Illustration (Desktop Only) */}
          {isDesktop && (
            <View style={styles.imagePane}>
              <Image 
                source={require('../../../assets/login_illustration.jpg')} 
                style={styles.illustration} 
                resizeMode="cover" 
              />
            </View>
          )}

          {/* Right Pane: Form */}
          <View style={[styles.formPane, isDesktop ? styles.formPaneDesktop : styles.formPaneMobile]}>
            <View style={styles.headerBox}>
              <Text style={styles.screenTitle}>Let's sign you in.</Text>
              <Text style={styles.screenSubtitle}>
                Welcome back to your secure support account.
              </Text>
            </View>

            {!requirePasswordChange ? (
              <>
                <View style={styles.formContainer}>
                  <IconInput 
                    icon="hash" 
                    placeholder="Docket ID" 
                    value={docketNumber} 
                    onChangeText={setDocketNumber} 
                    autoCapitalize="characters" 
                    containerStyle={styles.customInput}
                  />
                  <IconInput 
                    icon="lock" 
                    placeholder="Password" 
                    value={password} 
                    onChangeText={setPassword} 
                    secureTextEntry={!showPassword} 
                    trailingIcon={showPassword ? 'eye-off' : 'eye'}
                    onTrailingPress={() => setShowPassword(!showPassword)}
                    containerStyle={styles.customInput}
                  />
                </View>

                <Pressable style={styles.primaryBtn} onPress={handleLogin} disabled={loginMutation.isPending}>
                  <Text style={styles.primaryBtnText}>{loginMutation.isPending ? 'Signing In...' : 'Sign in now'}</Text>
                </Pressable>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or get help</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => Linking.openURL('https://www.dosje.gov.in/organisation/national-helpline-against-atrocities/')}
                >
                  <Text style={styles.secondaryBtnText}>NHAA Portal</Text>
                </Pressable>

                <Text style={styles.notice}>
                  Don't have an account?{' '}
                  <Text
                    style={styles.linkText}
                    onPress={() => {
                      if (Platform.OS !== 'web') Linking.openURL('tel:14566');
                    }}
                  >
                    Call 14566 to register
                  </Text>
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.screenTitle, { marginTop: 16 }]}>Change Password</Text>
                <Text style={[styles.screenSubtitle, { marginBottom: 24 }]}>
                  This is your first time signing in - set a new password to continue.
                </Text>
                <View style={styles.formContainer}>
                  <IconInput icon="lock" placeholder="New password (min 8 characters)" value={newPassword} onChangeText={setNewPassword} secureTextEntry containerStyle={styles.customInput} />
                </View>

                <Pressable style={styles.primaryBtn} onPress={handleChangePassword} disabled={changingPassword}>
                  <Text style={styles.primaryBtnText}>{changingPassword ? 'Updating...' : 'Update & Continue'}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg, overflow: 'hidden' },
  bgBlob1: {
    position: 'absolute', top: -150, right: -100, width: 450, height: 450,
    borderRadius: 225, backgroundColor: '#BAE6FD', opacity: 0.6,
  },
  bgBlob2: {
    position: 'absolute', bottom: -100, left: -150, width: 350, height: 350,
    borderRadius: 175, backgroundColor: '#7DD3FC', opacity: 0.4,
  },
  scrollContent: { 
    flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingVertical: 40 
  },
  card: { 
    backgroundColor: THEME.cardBg, 
    borderRadius: 32, 
    borderWidth: 1.5, 
    borderColor: THEME.border,
    ...Platform.select({ web: { backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' } }),
    shadowColor: '#000', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.08, shadowRadius: 48, elevation: 10, 
    overflow: 'hidden',
  },
  cardDesktop: { flexDirection: 'row', width: '100%', maxWidth: 1000 },
  cardMobile: { flexDirection: 'column', width: '100%', maxWidth: 420 },
  
  imagePane: { flex: 1, backgroundColor: '#E0F2FE' },
  illustration: { width: '100%', height: '100%' },
  
  formPane: { flex: 1, justifyContent: 'center' },
  formPaneDesktop: { paddingHorizontal: 48, paddingVertical: 20 },
  formPaneMobile: { padding: 32 },

  headerBox: { marginBottom: 16 },
  screenTitle: { ...typography.display, color: THEME.textMain, marginBottom: 2 },
  screenSubtitle: { ...typography.body, color: THEME.textMuted },
  
  formContainer: { gap: 8, marginBottom: 16 },
  customInput: {
    backgroundColor: THEME.inputBg,
    borderColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 10,
  },

  primaryBtn: { 
    backgroundColor: THEME.primaryDark, borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    shadowColor: THEME.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { ...typography.bodyStrong, color: '#FFFFFF', fontSize: 16 },
  
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { ...typography.bodySmall, marginHorizontal: 16, color: '#94A3B8' },

  secondaryBtn: { 
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0'
  },
  secondaryBtnText: { ...typography.bodyStrong, color: THEME.textMain, fontSize: 15 },

  notice: { ...typography.bodySmall, color: THEME.textMuted, textAlign: 'center', marginTop: 16 },
  linkText: { ...typography.bodyStrong, color: THEME.textMain, textDecorationLine: 'underline' },
});
