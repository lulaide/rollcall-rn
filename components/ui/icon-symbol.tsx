// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = SymbolViewProps['name'];

/**
 * SF Symbols → Material Icons mapping for the rollcall app.
 * Add new entries here whenever a new SF symbol is referenced anywhere.
 */
const MAPPING: IconMapping = {
  // Tabs
  'checkmark.circle.fill': 'check-circle',
  'calendar': 'calendar-today',
  'gearshape.fill': 'settings',

  // Misc
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.down': 'expand-more',
  'chevron.up': 'expand-less',

  // Rollcall
  'qrcode.viewfinder': 'qr-code-scanner',
  'number.circle': 'looks-one',
  'location.circle': 'my-location',
  'questionmark.circle': 'help-outline',
  'checkmark.circle': 'check-circle-outline',
  'xmark.circle.fill': 'cancel',
  'mappin.circle.fill': 'place',
  'calendar.badge.checkmark': 'event-available',
  'rectangle.portrait.and.arrow.right': 'logout',
  'clock': 'schedule',
  'checkmark.seal.fill': 'verified',
  'exclamationmark.triangle': 'warning',

  // Network
  'wifi': 'wifi',
  'wifi.slash': 'wifi-off',

  // Accounts / multi-account
  'person.2.fill': 'group',
  'person.crop.circle.badge.plus': 'person-add',
  'dot.radiowaves.left.and.right': 'sensors',
  'ellipsis.circle': 'more-horiz',
  'doc.on.doc': 'content-copy',
  'square.and.arrow.down': 'download',
  'trash': 'delete',
  'plus': 'add',
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const mapped = MAPPING[name as string];
  if (!mapped) {
    if (__DEV__) console.warn(`[IconSymbol] missing mapping for SF symbol "${String(name)}"`);
  }
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={mapped ?? 'help-outline'}
      style={style}
    />
  );
}
