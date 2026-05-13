import React from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn("Uygulama hata sınırına düştü.", error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.container}>
          <Text style={styles.title}>Puantaj Maaş</Text>
          <Text style={styles.message}>
            Uygulama açılırken beklenmeyen bir hata oluştu. Veriler korunur; uygulamayı kapatıp tekrar açın.
          </Text>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0b1220"
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center"
  },
  message: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center"
  }
});
