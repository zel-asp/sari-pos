import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { FontAwesome5, FontAwesome } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/app-button';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string, type: string) => void;
  title?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = Math.min(SCREEN_WIDTH * 0.75, 280);

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Scan Product Code',
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [scanned, setScanned] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);

  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setScanned(false);
    }
  }

  // Animated laser scan line
  const [scanAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      // Loop the laser scan animation
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2200,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2200,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      animation.start();

      return () => {
        animation.stop();
      };
    }
  }, [visible, scanAnim]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanned) return;
    const data = result.data?.trim();
    if (!data) return;

    setScanned(true);
    onScan(data, result.type);
    onClose();
  };

  const laserTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_AREA_SIZE - 4],
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <FontAwesome name="times" size={20} color="#ffffff" />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setTorch((t) => !t)}
              hitSlop={12}
              style={[styles.headerActionBtn, torch && styles.headerActionBtnActive]}
            >
              <FontAwesome5
                name="bolt"
                size={16}
                color={torch ? '#fbbf24' : '#ffffff'}
              />
            </Pressable>
            <Pressable
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              hitSlop={12}
              style={styles.headerActionBtn}
            >
              <FontAwesome5 name="sync-alt" size={15} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* Camera or Permission Flow */}
        {!permission ? (
          <View style={styles.centered}>
            <Text style={styles.permissionText}>Loading camera status...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <View style={styles.permissionIconCircle}>
              <FontAwesome5 name="camera" size={32} color="#059669" />
            </View>
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionSubtitle}>
              Sari POS needs camera access to scan 1D retail barcodes (EAN-13, UPC) and 2D QR codes on grocery items.
            </Text>
            <AppButton
              onPress={() => {
                void requestPermission();
              }}
              title="Grant Camera Access"
              icon={<FontAwesome5 name="check" size={14} color="#ffffff" />}
              size="lg"
              style={{ width: '100%', marginBottom: 12 }}
            />
            <AppButton
              onPress={onClose}
              title="Cancel & Enter Manually"
              variant="secondary"
              size="md"
              style={{ width: '100%' }}
            />
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={styles.camera}
              facing={facing}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: [
                  'qr',
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                  'code39',
                  'code93',
                  'datamatrix',
                  'pdf417',
                  'aztec',
                  'itf14',
                  'codabar',
                ],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Dark Mask Overlay around target area */}
            <View style={styles.maskContainer}>
              <View style={styles.maskTop} />
              <View style={styles.maskMiddle}>
                <View style={styles.maskSide} />
                <View style={styles.scanTarget}>
                  {/* Corner Target Markers */}
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />

                  {/* Animated Scanning Laser */}
                  <Animated.View
                    style={[
                      styles.laserLine,
                      {
                        transform: [{ translateY: laserTranslateY }],
                      },
                    ]}
                  />
                </View>
                <View style={styles.maskSide} />
              </View>
              <View style={styles.maskBottom}>
                <View style={styles.supportedBadge}>
                  <FontAwesome5 name="barcode" size={14} color="#34d399" style={{ marginRight: 6 }} />
                  <Text style={styles.supportedText}>Supports 1D Barcodes & 2D QR Codes</Text>
                </View>
                <Text style={styles.hintText}>
                  Center the barcode inside the frame to scan automatically
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtnActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.25)',
    borderWidth: 1.5,
    borderColor: '#fbbf24',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    maxWidth: 400,
    alignSelf: 'center',
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 26,
  },
  permissionText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  maskContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  maskTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  maskMiddle: {
    height: SCAN_AREA_SIZE,
    flexDirection: 'row',
  },
  maskSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  scanTarget: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  maskBottom: {
    flex: 1.3,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#10b981',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  laserLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2.5,
    backgroundColor: '#34d399',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    borderRadius: 2,
  },
  supportedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 150, 105, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.5)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 10,
  },
  supportedText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '700',
  },
  hintText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
    maxWidth: 280,
    lineHeight: 18,
  },
});
