import React, { ReactNode } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';

// Note: We intentionally avoid wrapping children with a touchable here.
// Touchable wrappers at the screen root can steal gestures from ScrollView/FlatList
// and cause intermittent scroll freezes. Each screen's ScrollView already uses
// keyboardDismissMode/on-drag and keyboardShouldPersistTaps to handle keyboard.
export function KeyboardDismissView({ style, children, testID }: { style?: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}


