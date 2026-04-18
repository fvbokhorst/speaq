/**
 * @format
 *
 * Boots the app with the user's saved theme already applied BEFORE
 * App.tsx (and therefore every screen's StyleSheet.create) is imported.
 * This is required because StyleSheet caches colors at module-load time.
 */

import { AppRegistry, View } from 'react-native';
import React from 'react';
import { loadAndApplyStoredTheme, colors } from './src/theme/brand';
import { name as appName } from './app.json';

let AppComponent = null;
let appReady = false;
const pendingListeners = new Set();

loadAndApplyStoredTheme()
  .catch(() => {})
  .finally(() => {
    AppComponent = require('./App').default;
    appReady = true;
    pendingListeners.forEach((fn) => fn());
    pendingListeners.clear();
  });

function LazyApp() {
  const [ready, setReady] = React.useState(appReady);
  React.useEffect(() => {
    if (ready) return;
    const onReady = () => setReady(true);
    pendingListeners.add(onReady);
    return () => pendingListeners.delete(onReady);
  }, [ready]);

  if (!ready || !AppComponent) {
    // Use the resolved theme's background so we don't flash the wrong color.
    return React.createElement(View, {
      style: { flex: 1, backgroundColor: colors.depth.void },
    });
  }
  return React.createElement(AppComponent);
}

AppRegistry.registerComponent(appName, () => LazyApp);
