import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

// A blank white screen with no error boundary anywhere in the tree is exactly what
// happened when Google.useAuthRequest() threw on an unconfigured client ID - the
// crash was invisible. This guarantees a visible error instead, wherever it happens.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught error in app tree:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  title: { fontSize: 18, fontWeight: '700', color: colors.danger, marginBottom: 8 },
  message: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
