import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import {
  pickReceiptFromLibrary,
  takeReceiptPhoto,
} from "./src/lib/receiptCapture";

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
  const [captureError, setCaptureError] = useState(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [selectingSource, setSelectingSource] = useState(null);

  async function handleReceiptSelection(selectReceipt, source) {
    if (selectingSource) {
      return;
    }

    setCaptureError(null);
    setConfirmedReceipt(false);
    setSelectingSource(source);

    try {
      const result = await selectReceipt();

      if (result.status === "cancelled") {
        return;
      }

      if (result.error || !result.receipt) {
        setCaptureError(
          result.error?.message || "Unable to select a receipt image.",
        );
        return;
      }

      setReceipt(result.receipt);
    } catch (error) {
      setCaptureError("Unable to open receipt images on this device.");
    } finally {
      setSelectingSource(null);
    }
  }

  function handleRetakeOrChange() {
    setCaptureError(null);
    setConfirmedReceipt(false);
    setReceipt(null);
  }

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

        {receipt ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Receipt preview</Text>
            <Image
              accessibilityLabel="Selected receipt preview"
              resizeMode="cover"
              source={{ uri: receipt.uri }}
              style={styles.receiptPreview}
            />
            {confirmedReceipt ? (
              <Text style={styles.panelValue}>Receipt selected</Text>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmedReceipt(true)}
                style={({ pressed }) => [
                  styles.button,
                  styles.actionButton,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                <Text style={styles.buttonText}>Use this receipt</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleRetakeOrChange}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.actionButton,
                  pressed ? styles.secondaryButtonPressed : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Retake or change</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Add a receipt</Text>
            <Text style={styles.panelMeta}>
              Start with a fresh photo or choose an existing receipt image.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(selectingSource) }}
                disabled={Boolean(selectingSource)}
                onPress={() => handleReceiptSelection(takeReceiptPhoto, "camera")}
                style={({ pressed }) => [
                  styles.button,
                  styles.actionButton,
                  selectingSource ? styles.buttonDisabled : null,
                  pressed && !selectingSource ? styles.buttonPressed : null,
                ]}
              >
                {selectingSource === "camera" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Take photo</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(selectingSource) }}
                disabled={Boolean(selectingSource)}
                onPress={() =>
                  handleReceiptSelection(pickReceiptFromLibrary, "library")
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.actionButton,
                  selectingSource ? styles.secondaryButtonDisabled : null,
                  pressed && !selectingSource
                    ? styles.secondaryButtonPressed
                    : null,
                ]}
              >
                {selectingSource === "library" ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Pick from library</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {captureError ? <Text style={styles.error}>{captureError}</Text> : null}
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
  actionButton: {
    flex: 1,
    minWidth: 160,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
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
  receiptPreview: {
    aspectRatio: 3 / 4,
    backgroundColor: "#E5E7EB",
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    width: "100%",
  },
  safeArea: {
    backgroundColor: "#F9FAFB",
    flex: 1,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  secondaryButtonPressed: {
    backgroundColor: "#E5E7EB",
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
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
