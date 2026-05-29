import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { GlassCard } from '@/src/components/Glass';
import { IconSymbol } from '@/components/ui/icon-symbol';
import ExpoDataScanner, {
  ExpoDataScannerView,
} from '@/modules/expo-data-scanner';
import { useAppState } from '@/src/store/appState';

export default function ScannerScreen() {
  const router = useRouter();

  const batchCheckinQR = useAppState(s => s.batchCheckinQR);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerSupported, setScannerSupported] = React.useState(Platform.OS === 'android');
  const [scanned, setScanned] = React.useState<string | null>(null);
  const [manualVisible, setManualVisible] = React.useState(false);
  const [manualValue, setManualValue] = React.useState('');
  const scanLockedRef = React.useRef(false);

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let cancelled = false;
    ExpoDataScanner.isSupported()
      .then(v => { if (!cancelled) setScannerSupported(v); })
      .catch(() => { if (!cancelled) setScannerSupported(false); });
    return () => { cancelled = true; };
  }, []);

  const handleScannedValue = React.useCallback((value?: string) => {
    if (!value || scanLockedRef.current) return;
    scanLockedRef.current = true;
    setScanned(value);
    if (Platform.OS === 'android') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const resetScan = () => {
    scanLockedRef.current = false;
    setScanned(null);
  };

  const submit = async (raw: string) => {
    await batchCheckinQR(raw);
    router.back();
  };

  const promptManual = () => {
    setManualValue('');
    setManualVisible(true);
  };

  const submitManual = () => {
    const value = manualValue.trim();
    if (!value) {
      Alert.alert('内容为空', '请粘贴 42 位 hex 或包含 !3~ 的链接');
      return;
    }
    setManualVisible(false);
    scanLockedRef.current = false;
    handleScannedValue(value);
  };

  const renderFallback = (title = '相机扫码不可用', text = '请使用手动输入', action?: React.ReactNode) => (
    <View style={styles.fallback}>
      <IconSymbol name="qrcode.viewfinder" size={64} color="rgba(255,255,255,0.5)" />
      <Text style={styles.fallbackTitle}>{title}</Text>
      <Text style={styles.fallbackText}>{text}</Text>
      {action}
    </View>
  );

  const renderCamera = () => {
    if (Platform.OS === 'android') {
      if (!cameraPermission) {
        return renderFallback('正在检查相机权限', '请稍候');
      }

      if (!cameraPermission.granted) {
        return renderFallback(
          '需要相机权限',
          '请允许使用相机扫描签到二维码',
          <Pressable onPress={requestCameraPermission} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>授权相机</Text>
          </Pressable>,
        );
      }

      return (
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          facing="back"
          onBarcodeScanned={scanned ? undefined : event => handleScannedValue(event.data)}
          style={StyleSheet.absoluteFill}
        />
      );
    }

    if (scannerSupported) {
      return (
        <ExpoDataScannerView
          enabled={!scanned}
          style={StyleSheet.absoluteFill}
          onScan={e => handleScannedValue(e.nativeEvent.value)}
        />
      );
    }

    return renderFallback();
  };

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>{renderCamera()}</View>

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <GlassCard borderRadius={999} style={styles.topGlass}>
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.topBtn}>取消</Text>
            </Pressable>
            <Text style={styles.topTitle}>扫码签到</Text>
            <Pressable onPress={promptManual} hitSlop={8}>
              <Text style={[styles.topBtn, { color: '#3478f6' }]}>手动输入</Text>
            </Pressable>
          </View>
        </GlassCard>
      </SafeAreaView>

      {scanned && (
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <GlassCard borderRadius={18}>
            <View style={styles.scannedHeader}>
              <IconSymbol name="checkmark.circle.fill" size={20} color="#34d399" />
              <Text style={styles.scannedTitle}>已识别二维码</Text>
            </View>
            <Text style={styles.scannedValue} numberOfLines={2}>
              {scanned.slice(0, 80)}{scanned.length > 80 ? '…' : ''}
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                onPress={resetScan}
                style={[styles.actionBtn, styles.actionBtnSecondary]}
              >
                <Text style={[styles.actionText, { color: '#fff' }]}>重新扫描</Text>
              </Pressable>
              <Pressable
                onPress={() => submit(scanned)}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Text style={[styles.actionText, { color: '#fff' }]}>提交签到</Text>
              </Pressable>
            </View>
          </GlassCard>
        </SafeAreaView>
      )}

      <Modal
        animationType="fade"
        transparent
        visible={manualVisible}
        onRequestClose={() => setManualVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <GlassCard borderRadius={18} style={styles.manualCard}>
            <Text style={styles.manualTitle}>手动输入二维码</Text>
            <Text style={styles.manualHint}>粘贴 42 位 hex 或包含 !3~ 的链接</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setManualValue}
              placeholder="二维码内容"
              placeholderTextColor="rgba(235,235,245,0.35)"
              style={styles.manualInput}
              value={manualValue}
            />
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setManualVisible(false)}
                style={[styles.actionBtn, styles.actionBtnSecondary]}
              >
                <Text style={[styles.actionText, { color: '#fff' }]}>取消</Text>
              </Pressable>
              <Pressable
                onPress={submitManual}
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Text style={[styles.actionText, { color: '#fff' }]}>确定</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 28,
  },
  fallbackTitle: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  fallbackText: { color: 'rgba(235,235,245,0.6)', fontSize: 13, textAlign: 'center' },
  permissionButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#3478f6',
  },
  permissionButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  topGlass: { padding: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  topBtn: { color: '#fff', fontSize: 15 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scannedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scannedTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  scannedValue: {
    color: 'rgba(235,235,245,0.7)',
    fontSize: 12,
    fontFamily: 'Menlo',
    marginTop: 8,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: 'rgba(120,120,128,0.4)' },
  actionBtnPrimary: { backgroundColor: '#3478f6' },
  actionText: { fontSize: 15, fontWeight: '600' },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  manualCard: { padding: 18 },
  manualTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  manualHint: { color: 'rgba(235,235,245,0.6)', fontSize: 13, marginTop: 6 },
  manualInput: {
    minHeight: 110,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    color: '#fff',
    backgroundColor: 'rgba(120,120,128,0.26)',
    fontFamily: 'Menlo',
    fontSize: 13,
    textAlignVertical: 'top',
  },
});
