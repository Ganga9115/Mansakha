import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import TopRightActions from '../../components/TopRightActions';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorMessages, useSendCounsellorMessage, useAssignedCounsellor } from '../../services/hooks';

function Bubble({ message }) {
  const isVictim = message.senderType === 'victim';
  return (
    <View style={[styles.bubbleRow, isVictim && styles.bubbleRowVictim]}>
      <View style={[styles.bubble, isVictim ? styles.bubbleVictim : styles.bubbleOfficial]}>
        <Text style={[styles.bubbleText, isVictim && styles.bubbleTextVictim]}>{message.body}</Text>
      </View>
    </View>
  );
}

export default function CounsellorChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const counsellorQuery = useAssignedCounsellor();
  const historyQuery = useCounsellorMessages();
  const sendMessage = useSendCounsellorMessage();
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage.mutateAsync(text);
    requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.headerIconTile}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{counsellorQuery.data?.fullName || 'Your Counsellor'}</Text>
          <Text style={styles.subtext}>Private, opted-in conversation</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <QueryBoundary query={historyQuery} empty={(d) => !d?.messages?.length}>
          {(data) => (
            <FlatList
              ref={listRef}
              data={data.messages}
              keyExtractor={(m) => String(m.messageId)}
              renderItem={({ item }) => <Bubble message={item} />}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
            />
          )}
        </QueryBoundary>
      </View>

      <View style={[styles.inputBar, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          multiline
        />
        <Pressable style={styles.sendBtn} onPress={handleSend} disabled={sendMessage.isPending || !draft.trim()}>
          <Feather name="send" size={18} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  bubbleRow: { flexDirection: 'row', marginBottom: spacing.sm },
  bubbleRowVictim: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleOfficial: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
  bubbleVictim: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextVictim: { color: colors.white },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1, ...typography.body, color: colors.textPrimary, maxHeight: 100,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
});
