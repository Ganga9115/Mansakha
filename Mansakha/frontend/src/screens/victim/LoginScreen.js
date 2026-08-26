import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useJurisdictionOptions, useVictimLogin, useGpsLookup } from '../../services/hooks';
import { authContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import IconInput from '../../components/IconInput';
import Dropdown from '../../components/Dropdown';

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
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [pendingGpsDistrictId, setPendingGpsDistrictId] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState(null);

  const stateQuery = useJurisdictionOptions('state');
  const districtQuery = useJurisdictionOptions('district', stateId);
  const loginMutation = useVictimLogin();
  const gpsLookupMutation = useGpsLookup();

  // Alphabetical regardless of the order the backend returns them in - all
  // States/UTs, and each State's Districts, sorted by name for the dropdowns.
  const stateOptions = (stateQuery.data?.jurisdictions || [])
    .map((j) => ({ value: j.jurisdictionId, label: j.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const districtOptions = (districtQuery.data?.jurisdictions || [])
    .map((j) => ({ value: j.jurisdictionId, label: j.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Once a GPS-matched state's own district list has loaded, apply the
  // GPS-suggested district selection (its label isn't known until then).
  useEffect(() => {
    if (!pendingGpsDistrictId) return;
    const match = districtOptions.find((d) => d.value === pendingGpsDistrictId);
    if (match) {
      setDistrictId(match.value);
      setPendingGpsDistrictId(null);
    }
  }, [districtOptions, pendingGpsDistrictId]);

  const handleAutoDetect = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return; // optional convenience only - leave dropdowns manual
      const position = await Location.getCurrentPositionAsync({});
      const result = await gpsLookupMutation.mutateAsync({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      if (!result?.stateName || !result?.jurisdictionId) return;
      const matchedState = stateOptions.find((o) => o.label.toLowerCase() === result.stateName.toLowerCase());
      if (matchedState) {
        setStateId(matchedState.value);
        setPendingGpsDistrictId(result.jurisdictionId);
      }
    } catch (err) {
      // Best-effort convenience - fail silently, manual selection still works.
    } finally {
      setGpsLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    const stateOption = stateOptions.find((o) => o.value === stateId);
    if (!docketNumber.trim() || !fullName.trim() || !stateOption || !districtId) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      const data = await loginMutation.mutateAsync({
        docketNumber: docketNumber.trim(),
        fullName: fullName.trim(),
        stateName: stateOption.label,
        jurisdictionId: districtId,
      });
      await login({ token: data.token, accountType: 'victim' });
    } catch (err) {
      setError('No matching record found - check your details and try again.');
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

        <Pressable style={styles.gpsBtn} onPress={handleAutoDetect} disabled={gpsLoading}>
          {gpsLoading ? (
            <ActivityIndicator size="small" color={THEME.accentIcon} style={{ marginRight: 8 }} />
          ) : (
            <Feather name="navigation" size={16} color={THEME.accentIcon} style={{ marginRight: 8 }} />
          )}
          <Text style={styles.gpsBtnText}>{gpsLoading ? 'Detecting location...' : 'Auto-detect my location'}</Text>
        </Pressable>

        <Dropdown
          options={stateOptions}
          value={stateId}
          onChange={(v) => { setStateId(v); setDistrictId(''); setPendingGpsDistrictId(null); }}
          placeholder="State"
        />
        <Dropdown
          options={districtOptions}
          value={districtId}
          onChange={setDistrictId}
          placeholder={stateId ? 'District' : 'Select a state first'}
          disabled={!stateId}
        />

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
          Don't have login details? Contact your assigned counsellor or district office to get registered.
        </Text>
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
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: THEME.border, borderRadius: 12, paddingVertical: 12, marginBottom: 16, backgroundColor: THEME.accentBlue },
  gpsBtnText: { color: THEME.accentIcon, fontWeight: '600', fontSize: 13 },
  primaryBtn: { backgroundColor: THEME.primaryDark, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  linkText: { color: THEME.accentIcon, fontSize: 13, fontWeight: '600' },
  notice: { fontSize: 12, color: THEME.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 17 },
  errorText: { fontSize: 13, color: THEME.danger, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.accentBlue, borderRadius: 12, padding: 12, marginTop: 16 },
  bannerText: { fontSize: 12, color: THEME.textMain, flex: 1, lineHeight: 16 },
  linkRow: { marginTop: 24, padding: 10 },
});
