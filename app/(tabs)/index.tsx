import * as React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import ExpoDataScanner, {
  ExpoDataScannerView,
} from '@/modules/expo-data-scanner';

const LMS_URL = 'http://lms.tc.cqupt.edu.cn/';

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; httpStatus: number; ms: number; bodyPreview: string }
  | { status: 'error'; message: string; ms: number };

export default function SmokeTestScreen() {
  const [fetchState, setFetchState] = React.useState<FetchState>({ status: 'idle' });
  const [scanned, setScanned] = React.useState<string | null>(null);

  const [scannerSupported, setScannerSupported] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    ExpoDataScanner.isSupported()
      .then((v) => { if (!cancelled) setScannerSupported(v); })
      .catch(() => { if (!cancelled) setScannerSupported(false); });
    return () => { cancelled = true; };
  }, []);

  const liquidGlass = isLiquidGlassAvailable();

  const runFetch = React.useCallback(async () => {
    setFetchState({ status: 'loading' });
    const t0 = Date.now();
    try {
      // No-redirect (manual) so we can see the original 302.
      const res = await fetch(LMS_URL, { redirect: 'manual' });
      const ms = Date.now() - t0;
      let preview = '';
      try {
        preview = (await res.text()).slice(0, 120);
      } catch {
        // body may be empty for opaque-redirect
      }
      setFetchState({
        status: 'ok',
        httpStatus: res.status,
        ms,
        bodyPreview: preview,
      });
    } catch (e: any) {
      setFetchState({
        status: 'error',
        message: e?.message ?? String(e),
        ms: Date.now() - t0,
      });
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>CQUPT Rollcall · RN Smoke Test</Text>
        <Text style={styles.subtitle}>
          验证 expo-glass-effect / DataScanner / 明文 HTTP / LiveContainer
        </Text>

        {/* === 1. Liquid Glass card === */}
        <Section heading="① Liquid Glass">
          <GlassCardOrFallback>
            <Row label="Platform" value={Platform.OS} />
            <Row
              label="iOS 26 Liquid Glass"
              value={liquidGlass ? '可用 ✓' : '降级 (UIVisualEffectView 或 div)'}
            />
            <Row
              label="DataScanner"
              value={scannerSupported ? '可用 ✓' : '不支持 (Android/Web/老设备)'}
            />
          </GlassCardOrFallback>
        </Section>

        {/* === 2. LMS HTTP fetch === */}
        <Section heading="② 明文 HTTP 到 LMS">
          <Pressable
            onPress={runFetch}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              fetchState.status === 'loading' && styles.buttonDisabled,
            ]}
            disabled={fetchState.status === 'loading'}>
            <Text style={styles.buttonText}>
              {fetchState.status === 'loading' ? '请求中…' : `GET ${LMS_URL}`}
            </Text>
          </Pressable>
          <FetchResult state={fetchState} />
        </Section>

        {/* === 3. DataScanner === */}
        <Section heading="③ VisionKit DataScanner">
          <View style={styles.scannerBox}>
            {scannerSupported ? (
              <ExpoDataScannerView
                enabled
                style={StyleSheet.absoluteFill}
                onScan={(e) => setScanned(e.nativeEvent.value)}
              />
            ) : (
              <View style={styles.scannerFallback}>
                <Text style={styles.scannerFallbackText}>
                  扫码模块在当前平台不可用
                </Text>
                <Text style={styles.scannerFallbackHint}>
                  Smoke test：iOS 16+ 真机 / LiveContainer 才能验证
                </Text>
              </View>
            )}
          </View>
          <Row
            label="最近扫码结果"
            value={scanned ? scanned.slice(0, 48) : '(未扫码)'}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// -------- helpers --------

function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function FetchResult({ state }: { state: FetchState }) {
  if (state.status === 'idle') {
    return <Text style={styles.muted}>点击按钮发起请求</Text>;
  }
  if (state.status === 'loading') {
    return <Text style={styles.muted}>等待响应…</Text>;
  }
  if (state.status === 'ok') {
    const ok = state.httpStatus >= 200 && state.httpStatus < 400;
    return (
      <View>
        <Text style={[styles.resultText, ok ? styles.ok : styles.warn]}>
          HTTP {state.httpStatus} · {state.ms} ms
        </Text>
        {state.bodyPreview ? (
          <Text style={styles.preview} numberOfLines={3}>
            {state.bodyPreview}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <Text style={[styles.resultText, styles.err]}>
      ✗ {state.message} · {state.ms} ms
    </Text>
  );
}

function GlassCardOrFallback({ children }: { children: React.ReactNode }) {
  // GlassView is safe on all platforms in expo-glass-effect; on web/android it
  // renders a translucent View, on iOS 26 it's real Liquid Glass, on older iOS
  // it's UIVisualEffectView with system blur.
  return (
    <GlassView style={styles.glassCard} glassEffectStyle="regular">
      <View style={styles.glassInner}>{children}</View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0e' },
  content: { padding: 16, paddingBottom: 48, gap: 18 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#aaa', fontSize: 13, marginTop: -6 },
  section: { gap: 8 },
  sectionHeading: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  glassCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  glassInner: { padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowLabel: { color: '#ccc', fontSize: 14 },
  rowValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#3478f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  muted: { color: '#888', fontSize: 13, marginTop: 4 },
  resultText: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  ok: { color: '#34d399' },
  warn: { color: '#fbbf24' },
  err: { color: '#f87171' },
  preview: {
    color: '#bbb',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    marginTop: 6,
  },
  scannerBox: {
    height: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  scannerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scannerFallbackText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scannerFallbackHint: { color: '#999', fontSize: 12, marginTop: 6 },
});
