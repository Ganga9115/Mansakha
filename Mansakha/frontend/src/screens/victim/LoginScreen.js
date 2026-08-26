import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useVictimLogin } from '../../services/hooks';
import { authContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import IconInput from '../../components/IconInput';

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

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { tier } = useResponsive();

  const [docketNumber, setDocketNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [error, setError] = useState(null);

  const loginMutation = useVictimLogin();

  const handleLogin = async () => {
    setError(null);
    if (!docketNumber.trim() || !fullName.trim() || !contactNumber.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      const data = await loginMutation.mutateAsync({
        docketNumber: docketNumber.trim(),
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
      });
      await login({ token: data.token, accountType: 'victim' });
    } catch (err) {
      console.error('Login error:', err);
      setError(`Login failed: ${err.message || 'Unknown error'}`);
    }
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
        <IconInput icon="hash" placeholder="Docket ID" value={docketNumber} onChangeText={setDocketNumber} autoCapitalize="characters" />
        <IconInput icon="user" placeholder="Full Name" value={fullName} onChangeText={setFullName} />
        <IconInput icon="phone" placeholder="Mobile Number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable style={styles.primaryBtn} onPress={handleLogin} disabled={loginMutation.isPending}>
          <Text style={styles.primaryBtnText}>{loginMutation.isPending ? 'Signing In...' : 'Sign In'}</Text>
        </Pressable>

        <View style={styles.bannerInfo}>
          <Feather name="shield" size={18} color={THEME.accentIcon} style={{ marginRight: 10 }} />
          <Text style={styles.bannerText}>
            Your data is fully encrypted and never shared without your explicit consent.
          </Text>
        </View>

        <Text style={styles.notice}>
          Don't have login details? Contact{' '}
          <Text 
            style={{ color: THEME.primaryDark, textDecorationLine: 'underline' }} 
            onPress={() => Linking.openURL('https://www.dosje.gov.in/organisation/national-helpline-against-atrocities/')}
          >
            NHAA Portal
          </Text>
          {' '}or{' '}
          <Text 
            style={{ color: THEME.primaryDark, textDecorationLine: 'underline' }} 
            onPress={() => {
              if (Platform.OS !== 'web') {
                Linking.openURL('tel:14566');
              }
            }}
          >
            14566
          </Text>
          {' '}to get registered.
        </Text>
      </View>


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
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  linkText: { color: THEME.accentIcon, fontSize: 13, fontWeight: '600' },
  notice: { fontSize: 12, color: THEME.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 17 },
  errorText: { fontSize: 13, color: THEME.danger, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.accentBlue, borderRadius: 12, padding: 12, marginTop: 16 },
  bannerText: { fontSize: 12, color: THEME.textMain, flex: 1, lineHeight: 16 },
  linkRow: { marginTop: 24, padding: 10 },
});
