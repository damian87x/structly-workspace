import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
  callIntegrationFunction,
  getIntegrationBackendConfig,
} from "./src/lib/integrationBackend";
import { buildReceiptSheet } from "./src/lib/buildSpreadsheet";
import {
  RECEIPT_FIELD_ROWS,
  confirmReceiptExtraction,
} from "./src/lib/confirmReceiptExtraction";
import { enrichReceipt } from "./src/lib/enrichReceipt";
import { exportReviewedReceipts } from "./src/lib/exportReviewedReceipts";
import { shouldSendHeartbeat } from "./src/lib/heartbeats";
import {
  pickReceiptFromLibrary,
  takeReceiptPhoto,
} from "./src/lib/receiptCapture";
import { buildReviewReceipt } from "./src/lib/reviewReceipt";
import { applyCorrection } from "./src/lib/reviewQueue";
import { getHealthRows } from "./src/lib/integrationCapabilities";
import { getDefaultTriggerDashboard } from "./src/lib/integrationDashboard";
import { createMobileDeviceHeartbeatPayload } from "./src/lib/mobileIntegrationRuntime";
import {
  createTriggerPayload,
  deleteTriggerPayload,
  pauseTriggerPayload,
  resumeTriggerPayload,
  updateTriggerPayload,
} from "./src/lib/triggers";
import {
  CONTEXT_REVIEW_DECISIONS,
  applyReceiptContextDecision,
  getReceiptContextDisplay,
  mergeReceiptContextSuggestion,
} from "./src/lib/receiptContextReview";

const AMOUNT_RECEIPT_FIELDS = ["net", "vat", "gross"];
const INTEGRATION_CONTROL_ROWS = [
  ["Create trigger", "create", "canCreate"],
  ["Edit", "update", "canEdit"],
  ["Pause", "pause", "canPause"],
  ["Resume", "resume", "canResume"],
  ["Delete", "delete", "canDelete"],
];

function formatFieldValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function isSameReviewedReceipt(currentReceipt, expectedReceipt) {
  return (
    currentReceipt?.capturedAt === expectedReceipt.capturedAt &&
    currentReceipt?.source === expectedReceipt.source &&
    currentReceipt?.sourceUri === expectedReceipt.sourceUri
  );
}

function mergeEnrichedReceiptContext(currentRows, expectedReceipt, enrichedReceipt) {
  const currentReceipt = currentRows[0];

  if (
    !currentReceipt ||
    !enrichedReceipt?.context ||
    !isSameReviewedReceipt(currentReceipt, expectedReceipt)
  ) {
    return currentRows;
  }

  return [
    mergeReceiptContextSuggestion(currentReceipt, enrichedReceipt.context),
    ...currentRows.slice(1),
  ];
}

export default function App() {
  const config = useMemo(() => getSupabaseConfig(), []);
  const backendConfig = useMemo(() => getIntegrationBackendConfig(), []);
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
    return (
      <CaptureScreen
        anonKey={config.anonKey}
        backendConfig={backendConfig}
        email={session.user?.email}
        session={session}
      />
    );
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

function CaptureScreen({ anonKey, backendConfig, email, session, vision }) {
  const [captureError, setCaptureError] = useState(null);
  const [confirmedReceipt, setConfirmedReceipt] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exportResult, setExportResult] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isTriggerActionRunning, setIsTriggerActionRunning] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [reviewedReceipts, setReviewedReceipts] = useState([]);
  const [selectingSource, setSelectingSource] = useState(null);
  const [triggerActionError, setTriggerActionError] = useState(null);
  const [triggerActionMessage, setTriggerActionMessage] = useState(null);
  const [backendStatus, setBackendStatus] = useState({
    codeExecutionConfigured: false,
    providerConfigured: false,
    reachable: false,
    schedulerConfigured: false,
    stale: true,
  });
  const [integrationSync, setIntegrationSync] = useState({
    error: false,
    hydrated: false,
    loading: false,
    runHistory: [],
    triggerDefinitions: [],
  });
  const lastHeartbeatSentAtRef = useRef(null);
  const receiptSheet = useMemo(
    () => buildReceiptSheet(reviewedReceipts),
    [reviewedReceipts],
  );
  const receiptSummary = {
    needsReviewCount: receiptSheet.validation.needsReviewCount,
    rowCount: reviewedReceipts.length,
  };
  const integrationDashboard = useMemo(
    () =>
      getDefaultTriggerDashboard({
        backend: {
          reachable: backendStatus.reachable,
          stale: backendStatus.stale,
        },
        background: {
          configured: false,
          supported: true,
        },
        codeExecutionConfigured: backendStatus.codeExecutionConfigured,
        providerConfigured: backendStatus.providerConfigured,
        runHistory: integrationSync.runHistory,
        schedulerConfigured: backendStatus.schedulerConfigured,
        syncError: integrationSync.error,
        syncHydrated: integrationSync.hydrated,
        syncLoading: integrationSync.loading,
        triggers: integrationSync.triggerDefinitions,
        userId: email,
      }),
    [backendStatus, email, integrationSync],
  );
  const integrationHealthRows = getHealthRows(integrationDashboard.health);
  const selectedTrigger = integrationDashboard.triggers[0] || null;
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
  const extractedReceipt = confirmedReceipt ? reviewedReceipts[0] : null;
  const extractedFieldRows = extractedReceipt
    ? RECEIPT_FIELD_ROWS.map(({ field, label }) => ({
        displayValue: formatFieldValue(extractedReceipt.fields?.[field]),
        field,
        label,
      }))
    : [];
  const receiptContext = extractedReceipt
    ? getReceiptContextDisplay(extractedReceipt)
    : null;

  useEffect(() => {
    let active = true;

    if (!backendConfig || !session) {
      return () => {
        active = false;
      };
    }

    async function refreshIntegrationState(appState = AppState.currentState || "active") {
      const now = Date.now();
      const heartbeatDue = shouldSendHeartbeat({
        lastSentAt: lastHeartbeatSentAtRef.current,
        now,
      });
      const heartbeatBody = createMobileDeviceHeartbeatPayload({
        appState,
        capabilities: {
          device: Platform.OS === "android" ? "android_phone" : Platform.OS,
        },
        platform: Platform.OS,
        session,
        userId: email,
      });

      setIntegrationSync((currentSync) => ({
        ...currentSync,
        error: false,
        loading: true,
      }));

      try {
        const [statusResult, syncResult, heartbeatResult] = await Promise.all([
          callIntegrationFunction({
            anonKey,
            body: {},
            config: backendConfig,
            functionName: "status-read",
            session,
          }),
          callIntegrationFunction({
            anonKey,
            body: {},
            config: backendConfig,
            functionName: "mobile-sync",
            session,
          }),
          heartbeatDue
            ? callIntegrationFunction({
                anonKey,
                body: heartbeatBody,
                config: backendConfig,
                functionName: "heartbeat-ingest",
                session,
              })
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!active) {
          return;
        }

        if (heartbeatDue && !heartbeatResult.error) {
          lastHeartbeatSentAtRef.current = now;
        }

        if (statusResult.error || !statusResult.data) {
          setBackendStatus({
            codeExecutionConfigured: false,
            providerConfigured: false,
            reachable: false,
            schedulerConfigured: false,
            stale: true,
          });
        } else {
          const { data } = statusResult;

          setBackendStatus({
            codeExecutionConfigured: data.codeExecution === "available",
            providerConfigured: data.bridge === "available",
            reachable: data.backend === "available",
            schedulerConfigured: data.cron === "available",
            stale:
              data.workerHeartbeat === "stale" ||
              data.workerHeartbeat === "failed",
          });
        }

        if (syncResult.error || !syncResult.data) {
          setIntegrationSync((currentSync) => ({
            ...currentSync,
            error: true,
            loading: false,
          }));
          return;
        }

        setIntegrationSync({
          error: false,
          hydrated: true,
          loading: false,
          runHistory: syncResult.data.runHistory || [],
          triggerDefinitions: syncResult.data.triggerDefinitions || [],
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setBackendStatus({
          codeExecutionConfigured: false,
          providerConfigured: false,
          reachable: false,
          schedulerConfigured: false,
          stale: true,
        });
        setIntegrationSync((currentSync) => ({
          ...currentSync,
          error: true,
          loading: false,
        }));
      }
    }

    void refreshIntegrationState();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refreshIntegrationState(nextAppState);
      }
    });

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, [anonKey, backendConfig, email, session]);

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

  async function handleUseReceipt() {
    if (!receipt || isExtracting) {
      return;
    }

    setCaptureError(null);
    setConfirmedReceipt(false);
    setExportError(null);
    setExportResult(null);
    setReviewedReceipts([]);
    setIsExtracting(true);

    try {
      const result = await confirmReceiptExtraction(receipt, { vision });
      const receiptForReview = buildReviewReceipt(result.receipt, receipt);

      setReviewedReceipts([receiptForReview]);
      setConfirmedReceipt(true);
      void enrichReceipt(receiptForReview)
        .then((enrichedReceipt) => {
          setReviewedReceipts((currentRows) =>
            mergeEnrichedReceiptContext(
              currentRows,
              receiptForReview,
              enrichedReceipt,
            ),
          );
        })
        .catch(() => {});
    } catch (error) {
      setCaptureError(error?.message || "Unable to extract receipt fields.");
    } finally {
      setIsExtracting(false);
    }
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

  function handleReceiptContextDecision(decision) {
    setExportError(null);
    setExportResult(null);
    setReviewedReceipts((currentRows) =>
      currentRows.length > 0
        ? applyReceiptContextDecision(currentRows, 0, decision)
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

  async function refreshSyncedTriggers() {
    const syncResult = await callIntegrationFunction({
      anonKey,
      body: {},
      config: backendConfig,
      functionName: "mobile-sync",
      session,
    });

    if (syncResult.error || !syncResult.data) {
      setIntegrationSync((currentSync) => ({
        ...currentSync,
        error: true,
        loading: false,
      }));
      return;
    }

    setIntegrationSync({
      error: false,
      hydrated: true,
      loading: false,
      runHistory: syncResult.data.runHistory || [],
      triggerDefinitions: syncResult.data.triggerDefinitions || [],
    });
  }

  function getTriggerActionPayload(action) {
    if (action === "create") {
      return createTriggerPayload({
        name: "Receipt follow-up",
        source: "backend_catalog",
        type: "receipt_reviewed",
        userId: session?.user?.id || email,
      });
    }

    if (!selectedTrigger) {
      return null;
    }

    if (action === "update") {
      return updateTriggerPayload(selectedTrigger, {
        name: selectedTrigger.name || "Receipt follow-up",
      });
    }

    if (action === "pause") {
      return pauseTriggerPayload(selectedTrigger);
    }

    if (action === "resume") {
      return resumeTriggerPayload(selectedTrigger);
    }

    if (action === "delete") {
      return deleteTriggerPayload(selectedTrigger);
    }

    return null;
  }

  async function handleTriggerAction(action) {
    const payload = getTriggerActionPayload(action);

    if (!payload || isTriggerActionRunning) {
      return;
    }

    setTriggerActionError(null);
    setTriggerActionMessage(null);
    setIsTriggerActionRunning(true);

    try {
      const result = await callIntegrationFunction({
        anonKey,
        body: payload,
        config: backendConfig,
        functionName: "trigger-actions",
        session,
      });

      if (result.error) {
        setTriggerActionError("Unable to update trigger.");
        return;
      }

      setTriggerActionMessage("Trigger action saved.");
      await refreshSyncedTriggers();
    } catch (error) {
      setTriggerActionError("Unable to update trigger.");
    } finally {
      setIsTriggerActionRunning(false);
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

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Integration health</Text>
          {integrationHealthRows.map((row) => (
            <View key={row.label} style={styles.statusRow}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.statusValue}>{row.status}</Text>
            </View>
          ))}
          <Text style={styles.panelMeta}>
            {integrationDashboard.health.backgroundNote}
          </Text>
          <Text style={styles.panelMeta}>
            Connector status: {integrationDashboard.provider.copy}
          </Text>
          <Text style={styles.panelMeta}>
            Trigger list: {integrationDashboard.triggerListState}
          </Text>
          <Text style={styles.panelMeta}>Catalog source: backend</Text>
          {integrationDashboard.triggers.map((trigger) => (
            <View key={trigger.id} style={styles.triggerRow}>
              <Text style={styles.label}>{trigger.name}</Text>
              <Text style={styles.panelMeta}>{trigger.displayStatus}</Text>
            </View>
          ))}
          <View style={styles.integrationControls}>
            {INTEGRATION_CONTROL_ROWS.map(([label, action, controlKey]) => {
              const needsSelectedTrigger = action !== "create";
              const enabled =
                integrationDashboard.triggerControls[controlKey] &&
                !isTriggerActionRunning &&
                (!needsSelectedTrigger ||
                  (integrationSync.hydrated && Boolean(selectedTrigger)));

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !enabled }}
                  disabled={!enabled}
                  key={label}
                  onPress={() => handleTriggerAction(action)}
                  style={[
                    styles.smallButton,
                    !enabled ? styles.smallButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.smallButtonText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {triggerActionMessage ? (
            <Text style={styles.panelMeta}>{triggerActionMessage}</Text>
          ) : null}
          {triggerActionError ? (
            <Text style={styles.error}>{triggerActionError}</Text>
          ) : null}
          <Text style={styles.panelMeta}>Run history</Text>
          {integrationDashboard.runHistory.map((run) => (
            <Text key={run.id} style={styles.panelMeta}>
              {run.status}
            </Text>
          ))}
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
              {isExtracting ? (
                <Text style={styles.panelMeta}>Extracting receipt fields...</Text>
              ) : null}
              {extractedFieldRows.length > 0 ? (
                <View style={styles.extractedFields}>
                  {extractedFieldRows.map((fieldRow) => (
                    <View key={fieldRow.field} style={styles.extractedFieldRow}>
                      <Text style={styles.label}>{fieldRow.label}</Text>
                      <Text style={styles.extractedFieldValue}>
                        {fieldRow.displayValue || "Needs review"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {receiptContext ? (
                <View style={styles.contextReview}>
                  <Text style={styles.panelTitle}>Receipt context</Text>
                  <View style={styles.extractedFieldRow}>
                    <Text style={styles.label}>Place</Text>
                    <Text style={styles.extractedFieldValue}>
                      {receiptContext.location || "No place captured"}
                    </Text>
                  </View>
                  <View style={styles.extractedFieldRow}>
                    <Text style={styles.label}>Billable client</Text>
                    <Text style={styles.extractedFieldValue}>
                      {receiptContext.billableClient || "No billable client"}
                    </Text>
                  </View>
                  <View style={styles.contextToggleRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          receiptContext.decision ===
                          CONTEXT_REVIEW_DECISIONS.CONFIRM,
                      }}
                      onPress={() =>
                        handleReceiptContextDecision(
                          CONTEXT_REVIEW_DECISIONS.CONFIRM,
                        )
                      }
                      style={({ pressed }) => [
                        styles.contextToggleButton,
                        receiptContext.decision === CONTEXT_REVIEW_DECISIONS.CONFIRM
                          ? styles.contextToggleButtonSelected
                          : null,
                        pressed ? styles.contextToggleButtonPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.contextToggleText,
                          receiptContext.decision === CONTEXT_REVIEW_DECISIONS.CONFIRM
                            ? styles.contextToggleTextSelected
                            : null,
                        ]}
                      >
                        Confirm
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{
                        selected:
                          receiptContext.decision ===
                          CONTEXT_REVIEW_DECISIONS.CLEAR,
                      }}
                      onPress={() =>
                        handleReceiptContextDecision(
                          CONTEXT_REVIEW_DECISIONS.CLEAR,
                        )
                      }
                      style={({ pressed }) => [
                        styles.contextToggleButton,
                        receiptContext.decision === CONTEXT_REVIEW_DECISIONS.CLEAR
                          ? styles.contextToggleButtonSelected
                          : null,
                        pressed ? styles.contextToggleButtonPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.contextToggleText,
                          receiptContext.decision === CONTEXT_REVIEW_DECISIONS.CLEAR
                            ? styles.contextToggleTextSelected
                            : null,
                        ]}
                      >
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isExtracting }}
                  disabled={isExtracting}
                  onPress={handleUseReceipt}
                  style={({ pressed }) => [
                    styles.button,
                    styles.actionButton,
                    isExtracting ? styles.buttonDisabled : null,
                    pressed && !isExtracting ? styles.buttonPressed : null,
                  ]}
                >
                  {isExtracting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.buttonText}>Use this receipt</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isExtracting }}
                  disabled={isExtracting}
                  onPress={handleRetakeOrChange}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.actionButton,
                    isExtracting ? styles.secondaryButtonDisabled : null,
                    pressed && !isExtracting
                      ? styles.secondaryButtonPressed
                      : null,
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
                onPress={() =>
                  handleReceiptSelection(() => takeReceiptPhoto(), "camera")
                }
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
  contextReview: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    gap: 10,
    marginTop: 6,
    paddingTop: 14,
  },
  contextToggleButton: {
    alignItems: "center",
    borderColor: "#D1D5DB",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 120,
    paddingHorizontal: 14,
  },
  contextToggleButtonPressed: {
    backgroundColor: "#E5E7EB",
  },
  contextToggleButtonSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  contextToggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  contextToggleText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  contextToggleTextSelected: {
    color: "#FFFFFF",
  },
  error: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "600",
  },
  extractedFields: {
    gap: 10,
    marginTop: 4,
  },
  extractedFieldRow: {
    gap: 4,
  },
  extractedFieldValue: {
    color: "#111827",
    fontSize: 16,
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
  integrationControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  smallButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  smallButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  smallButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statusValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
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
  triggerRow: {
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10,
  },
});
