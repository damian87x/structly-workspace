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
import { buildReceiptSheet } from "./src/lib/buildSpreadsheet";
import { exportReviewedReceipts } from "./src/lib/exportReviewedReceipts";
import {
  pickReceiptFromLibrary,
  takeReceiptPhoto,
} from "./src/lib/receiptCapture";
import { applyCorrection } from "./src/lib/reviewQueue";

const REQUIRED_RECEIPT_FIELDS = [
  "vendor",
  "date",
  "net",
  "vat",
  "gross",
  "category",
];
const AMOUNT_RECEIPT_FIELDS = ["net", "vat", "gross"];

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatFieldValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function getReceiptField(receipt, field) {
  if (hasValue(receipt?.fields?.[field])) {
    return receipt.fields[field];
  }

  if (field === "vendor") {
    return receipt?.fileName || "Selected receipt";
  }

  if (field === "category") {
    return receipt?.source || "Receipt";
  }

  return null;
}

function buildMissingFieldIssues(fields) {
  return REQUIRED_RECEIPT_FIELDS
    .filter((field) => !hasValue(fields[field]))
    .map((field) => ({
      field,
      message: `${field} is missing.`,
      type: "missing-field",
    }));
}

function buildReviewedReceipt(receipt) {
  const fields = REQUIRED_RECEIPT_FIELDS.reduce(
    (nextFields, field) => ({
      ...nextFields,
      [field]: getReceiptField(receipt, field),
    }),
    {},
  );
  const existingIssues = Array.isArray(receipt?.validation?.issues)
    ? receipt.validation.issues
    : [];
  const missingIssues = buildMissingFieldIssues(fields);
  const issues = existingIssues.length > 0 ? existingIssues : missingIssues;

  return {
    fields,
    validation: {
      issues,
      needsReview:
        Boolean(receipt?.validation?.needsReview) || issues.length > 0,
    },
  };
}

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
  const [exportError, setExportError] = useState(null);
  const [exportResult, setExportResult] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [reviewedReceipts, setReviewedReceipts] = useState([]);
  const [selectingSource, setSelectingSource] = useState(null);
  const receiptSheet = useMemo(
    () => buildReceiptSheet(reviewedReceipts),
    [reviewedReceipts],
  );
  const receiptSummary = {
    needsReviewCount: receiptSheet.validation.needsReviewCount,
    rowCount: reviewedReceipts.length,
  };
  const needsReviewRow = receiptSheet.validation.needsReviewRows[0] || null;
  const reviewReceipt = needsReviewRow
    ? reviewedReceipts[needsReviewRow.index]
    : null;
  const reviewIssue = needsReviewRow?.issues?.[0] || null;
  const reviewField = reviewIssue?.field || "gross";
  const reviewFieldValue = reviewReceipt
    ? formatFieldValue(reviewReceipt.fields?.[reviewField])
    : "";
  const reviewMessage =
    reviewIssue?.message || needsReviewRow?.reasons?.[0] || "This row needs review.";

  async function handleReceiptSelection(selectReceipt, source) {
    if (selectingSource) {
      return;
    }

    setCaptureError(null);
    setConfirmedReceipt(false);
    setExportError(null);
    setExportResult(null);
    setReviewedReceipts([]);
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
    setExportError(null);
    setExportResult(null);
    setReceipt(null);
    setReviewedReceipts([]);
  }

  function handleUseReceipt() {
    if (!receipt) {
      return;
    }

    setCaptureError(null);
    setExportError(null);
    setExportResult(null);
    setReviewedReceipts([buildReviewedReceipt(receipt)]);
    setConfirmedReceipt(true);
  }

  function handleReceiptCorrection(field, value) {
    setExportError(null);
    setExportResult(null);
    setReviewedReceipts((currentRows) =>
      currentRows.length > 0
        ? applyCorrection(currentRows, 0, { [field]: value })
        : currentRows,
    );
  }

  async function handleExportShare() {
    if (isExporting || reviewedReceipts.length === 0) {
      return;
    }

    setExportError(null);
    setExportResult(null);
    setIsExporting(true);

    try {
      const result = await exportReviewedReceipts(reviewedReceipts);
      setExportResult(result.exportResult);
    } catch (error) {
      setExportError("Unable to export reviewed receipts.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.captureContainer}>
        <Text style={styles.brand}>Structly</Text>
        <Text style={styles.title}>Capture</Text>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Receipt pack</Text>
          <Text style={styles.panelValue}>Ready</Text>
          <Text style={styles.panelMeta}>Rows: {receiptSummary.rowCount}</Text>
          <Text style={styles.panelMeta}>
            Needs review: {receiptSummary.needsReviewCount}
          </Text>
          {email ? <Text style={styles.panelMeta}>Signed in as {email}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: isExporting || receiptSummary.rowCount === 0,
            }}
            disabled={isExporting || receiptSummary.rowCount === 0}
            onPress={handleExportShare}
            style={({ pressed }) => [
              styles.button,
              isExporting || receiptSummary.rowCount === 0
                ? styles.buttonDisabled
                : null,
              pressed && !isExporting && receiptSummary.rowCount > 0
                ? styles.buttonPressed
                : null,
            ]}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Export/Share</Text>
            )}
          </Pressable>
          {exportResult?.uri ? (
            <Text style={styles.panelMeta}>Exported: {exportResult.uri}</Text>
          ) : null}
          {exportError ? <Text style={styles.error}>{exportError}</Text> : null}
        </View>

        {receipt ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Receipt preview</Text>
              <Image
                accessibilityLabel="Selected receipt preview"
                resizeMode="cover"
                source={{ uri: receipt.uri }}
                style={styles.receiptPreview}
              />
              {confirmedReceipt ? (
                <Text
                  style={needsReviewRow ? styles.reviewValue : styles.panelValue}
                >
                  {needsReviewRow ? "Needs review" : "Review complete"}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleUseReceipt}
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

            {needsReviewRow ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Review receipt</Text>
                <Text style={styles.panelMeta}>{reviewMessage}</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Correct {reviewField}</Text>
                  <TextInput
                    accessibilityLabel={`Correct ${reviewField}`}
                    keyboardType={
                      AMOUNT_RECEIPT_FIELDS.includes(reviewField)
                        ? "decimal-pad"
                        : "default"
                    }
                    onChangeText={(value) =>
                      handleReceiptCorrection(reviewField, value)
                    }
                    style={styles.input}
                    value={reviewFieldValue}
                  />
                </View>
              </View>
            ) : null}
          </>
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
  reviewValue: {
    color: "#B45309",
    fontSize: 16,
    fontWeight: "700",
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
