import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getSupabaseConfig,
  signInWithPassword,
} from "./src/lib/supabaseAuth";

export default function App() {
  const config = useMemo(() => getSupabaseConfig(), []);
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState(config.error);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);

  async function handleSignIn() {
    if (!config.url || !config.anonKey || isSigningIn) {
      return;
    }

    setErrorMessage(null);
    setIsSigningIn(true);

    const { error, session: nextSession } = await signInWithPassword({
      anonKey: config.anonKey,
      email: email.trim(),
      password,
      url: config.url,
    });

    if (error || !nextSession) {
      setErrorMessage("Unable to sign in with those credentials.");
      setIsSigningIn(false);
      return;
    }

    setSession(nextSession);
    setIsSigningIn(false);
  }

  if (session) {
    return <CaptureScreen email={session.user?.email} />;
  }

  return (
    <SignInScreen
      email={email}
      errorMessage={errorMessage}
      isSigningIn={isSigningIn}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={handleSignIn}
      password={password}
      signInDisabled={!config.url || !config.anonKey || isSigningIn}
    />
  );
}

function SignInScreen({
  email,
  errorMessage,
  isSigningIn,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  password,
  signInDisabled,
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.signInContainer}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>Structly</Text>
          <Text style={styles.title}>Sign-In</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={onEmailChange}
              placeholder="name@example.com"
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={onPasswordChange}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: signInDisabled }}
            disabled={signInDisabled}
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.button,
              signInDisabled ? styles.buttonDisabled : null,
              pressed && !signInDisabled ? styles.buttonPressed : null,
            ]}
          >
            {isSigningIn ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CaptureScreen({ email }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.captureContainer}>
        <Text style={styles.brand}>Structly</Text>
        <Text style={styles.title}>Capture</Text>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Receipt pack</Text>
          <Text style={styles.panelValue}>Ready</Text>
          {email ? <Text style={styles.panelMeta}>Signed in as {email}</Text> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "600",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonPressed: {
    backgroundColor: "#374151",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  captureContainer: {
    flex: 1,
    gap: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  error: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "600",
  },
  field: {
    gap: 8,
  },
  form: {
    gap: 18,
  },
  header: {
    gap: 8,
    marginBottom: 36,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  label: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  panel: {
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  panelMeta: {
    color: "#4B5563",
    fontSize: 14,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  panelValue: {
    color: "#047857",
    fontSize: 16,
    fontWeight: "600",
  },
  safeArea: {
    backgroundColor: "#F9FAFB",
    flex: 1,
  },
  signInContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
  },
});
