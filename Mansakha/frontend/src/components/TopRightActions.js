import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import SosButton from './SosButton';
import { colors } from '../theme/colors';

export default function TopRightActions() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <SosButton asHeaderIcon />
      <Pressable style={styles.iconCircleBtn} onPress={() => navigation?.navigate('support')}>
        <Feather name="bell" size={18} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
