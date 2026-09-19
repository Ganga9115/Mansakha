import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import IconInput from '../../shared/components/IconInput';
import Dropdown from '../../shared/components/Dropdown';
import { useJurisdictionOptions, useCaseTypeOptions, useStationOptions, useSelfRegister, useSuggestCaseType } from '../../shared/services/hooks';
import { typography } from '../../shared/theme/typography';

// Replaces Data Operator's manual intake entirely (that role no longer
// exists) - mirrors the real NHAA/SAMBAL portal's own self-service
// "Register Grievance" flow, keyed on Aadhaar the same way that portal
// uses it for identity. Docket ID + temporary password are generated
// automatically and delivered by SMS - never shown on this screen, matching
// the reference portal's own "check your SMS" pattern rather than
// displaying a credential the browser/device could leak.
export default function SelfRegisterScreen({ onBackToLogin }) {
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  // The victim's own residential address and the place the offense
  // happened can genuinely differ (e.g. a victim who has since relocated) -
  // same distinction the real NHAA/SAMBAL portal draws with its own "Is
  // Place of Offence same as Victim Address?" question. Victim's district
  // routes relief/compensation to that district's DWO; the offense's
  // nearest police station is who gets assigned the FIR/investigation.
  const [offenseSameAsAddress, setOffenseSameAsAddress] = useState(true);
  const [offenseStateId, setOffenseStateId] = useState('');
  const [offenseDistrictId, setOffenseDistrictId] = useState('');
  const [stationId, setStationId] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const stateQuery = useJurisdictionOptions('state');
  const districtQuery = useJurisdictionOptions('district', stateId || undefined);
  const offenseStateQuery = useJurisdictionOptions('state');
  const offenseDistrictQuery = useJurisdictionOptions('district', offenseStateId || undefined);
  const caseTypeQuery = useCaseTypeOptions();
  const effectiveOffenseDistrictId = offenseSameAsAddress ? districtId : offenseDistrictId;
  const stationQuery = useStationOptions(effectiveOffenseDistrictId || undefined);
  const registerMutation = useSelfRegister();
  const suggestMutation = useSuggestCaseType();

  const stateOptions = (stateQuery.data?.jurisdictions || []).map((j) => ({ value: j.jurisdictionId, label: j.name }));
  const districtOptions = (districtQuery.data?.jurisdictions || []).map((j) => ({ value: j.jurisdictionId, label: j.name }));
  const offenseStateOptions = (offenseStateQuery.data?.jurisdictions || []).map((j) => ({ value: j.jurisdictionId, label: j.name }));
  const offenseDistrictOptions = (offenseDistrictQuery.data?.jurisdictions || []).map((j) => ({ value: j.jurisdictionId, label: j.name }));
  const caseTypeOptions = (caseTypeQuery.data?.caseTypes || []).map((c) => ({ value: c.case_type_id, label: c.name }));
  const stationOptions = (stationQuery.data?.stations || []).map((s) => ({ value: s.stationId, label: s.name }));

  // Fires once the victim pauses typing a real description - a live keystroke
  // trigger would spam the endpoint on every letter. Best-effort: a failed
  // or unsure suggestion just clears the chip, never blocks the form.
  const handleDescriptionBlur = async () => {
    if (!description.trim() || description.trim().length < 15) { setSuggestion(null); return; }
    try {
      const { suggestion: s } = await suggestMutation.mutateAsync(description.trim());
      setSuggestion(s);
    } catch {
      setSuggestion(null);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!fullName.trim() || !contactNumber.trim() || !aadhaarNumber.trim() || !districtId || !caseTypeId) {
      setError('Please fill in your name, mobile number, Aadhaar number, district, and case type.');
      return;
    }
    if (contactNumber.trim().length !== 10) {
      setError('Mobile number must be exactly 10 digits.');
      return;
    }
    if (aadhaarNumber.trim().length !== 12) {
      setError('Aadhaar number must be exactly 12 digits.');
      return;
    }
    try {
      const data = await registerMutation.mutateAsync({
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        aadhaarNumber: aadhaarNumber.trim(),
        jurisdictionId: districtId,
        caseTypeId,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        stationId: stationId || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not complete registration. Please try again.');
    }
  };

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.successContainer}>
        <View style={styles.successIconCircle}>
          <Feather name="check" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.successTitle}>Registered Successfully</Text>
        <Text style={styles.successBody}>
          {result.smsSent
            ? `Your docket ID and password have been sent by SMS to ${contactNumber}. Use them to log in below.`
            : 'Your case has been registered, but the SMS could not be sent. Please contact your assigned counsellor for your login details.'}
        </Text>
        <Pressable style={styles.primaryBtn} onPress={onBackToLogin}>
          <Text style={styles.primaryBtnText}>Go to Login</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Register a New Case</Text>
      <Text style={styles.subtitle}>
        Tell us what happened. We'll create your account and send your login details by SMS.
      </Text>

      <IconInput icon="user" placeholder="Full Name" value={fullName} onChangeText={setFullName} containerStyle={styles.input} />
      <IconInput
        icon="phone"
        placeholder="Mobile Number"
        value={contactNumber}
        onChangeText={(t) => setContactNumber(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={10}
        containerStyle={styles.input}
      />
      <IconInput
        icon="credit-card"
        placeholder="Aadhaar Number"
        value={aadhaarNumber}
        onChangeText={(t) => setAadhaarNumber(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={12}
        containerStyle={styles.input}
      />

      <Text style={styles.sectionLabel}>Your Address</Text>
      <Dropdown
        options={stateOptions}
        value={stateId}
        onChange={(v) => { setStateId(v); setDistrictId(''); }}
        placeholder="Select State"
      />
      <Dropdown
        options={districtOptions}
        value={districtId}
        onChange={setDistrictId}
        placeholder={stateId ? 'Select District' : 'Select a state first'}
        disabled={!stateId}
      />

      <IconInput
        icon="map-pin"
        placeholder="Address (optional)"
        value={address}
        onChangeText={setAddress}
        containerStyle={styles.input}
      />

      <IconInput
        icon="edit-3"
        placeholder="Briefly describe what happened"
        value={description}
        onChangeText={setDescription}
        onBlur={handleDescriptionBlur}
        multiline
        numberOfLines={3}
        containerStyle={styles.input}
      />

      {suggestion && caseTypeId !== suggestion.caseTypeId && (
        <Pressable style={styles.suggestionChip} onPress={() => setCaseTypeId(suggestion.caseTypeId)}>
          <Feather name="zap" size={12} color="#7C5CBF" />
          <Text style={styles.suggestionText}>Suggested: {suggestion.caseTypeName} (based on your description) - tap to use</Text>
        </Pressable>
      )}

      <Dropdown
        options={caseTypeOptions}
        value={caseTypeId}
        onChange={setCaseTypeId}
        placeholder="Select Case Type"
      />

      <Text style={styles.sectionLabel}>Place of Offense</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleOption, offenseSameAsAddress && styles.toggleOptionActive]}
          onPress={() => { setOffenseSameAsAddress(true); setStationId(''); }}
        >
          <Text style={[styles.toggleText, offenseSameAsAddress && styles.toggleTextActive]}>Same as my address</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleOption, !offenseSameAsAddress && styles.toggleOptionActive]}
          onPress={() => { setOffenseSameAsAddress(false); setStationId(''); }}
        >
          <Text style={[styles.toggleText, !offenseSameAsAddress && styles.toggleTextActive]}>Different location</Text>
        </Pressable>
      </View>

      {!offenseSameAsAddress && (
        <>
          <Dropdown
            options={offenseStateOptions}
            value={offenseStateId}
            onChange={(v) => { setOffenseStateId(v); setOffenseDistrictId(''); setStationId(''); }}
            placeholder="Offense State"
          />
          <Dropdown
            options={offenseDistrictOptions}
            value={offenseDistrictId}
            onChange={(v) => { setOffenseDistrictId(v); setStationId(''); }}
            placeholder={offenseStateId ? 'Offense District' : 'Select a state first'}
            disabled={!offenseStateId}
          />
        </>
      )}

      <Dropdown
        options={stationOptions}
        value={stationId}
        onChange={setStationId}
        placeholder={effectiveOffenseDistrictId ? 'Nearest Police Station (optional)' : 'Select a district above first'}
        disabled={!effectiveOffenseDistrictId}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable style={styles.primaryBtn} onPress={handleSubmit} disabled={registerMutation.isPending}>
        <Text style={styles.primaryBtnText}>{registerMutation.isPending ? 'Registering...' : 'Register'}</Text>
      </Pressable>

      <Text style={styles.backLink} onPress={onBackToLogin}>
        Already have an account? <Text style={styles.backLinkBold}>Sign in</Text>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  title: { ...typography.display, color: '#4A3070', marginBottom: 4 },
  subtitle: { ...typography.body, color: '#64748B', marginBottom: 20 },
  input: { marginBottom: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#7C5CBF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toggleOption: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', backgroundColor: '#FFFFFF',
  },
  toggleOptionActive: { backgroundColor: '#4A3070', borderColor: '#4A3070' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  toggleTextActive: { color: '#FFFFFF' },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0EAFB', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    marginBottom: 16, alignSelf: 'flex-start',
  },
  suggestionText: { fontSize: 12, color: '#4A3070', fontWeight: '600', flexShrink: 1 },
  errorText: { color: '#DC2626', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#4A3070', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  backLink: { textAlign: 'center', marginTop: 18, fontSize: 13, color: '#64748B' },
  backLinkBold: { color: '#4A3070', fontWeight: '700' },
  successContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { ...typography.display, color: '#4A3070', marginBottom: 12, textAlign: 'center' },
  successBody: { ...typography.body, color: '#64748B', textAlign: 'center', marginBottom: 28, lineHeight: 22 },
});
