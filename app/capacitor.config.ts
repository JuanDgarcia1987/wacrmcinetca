import type { CapacitorConfig } from '@capacitor/cli';

const config:
  CapacitorConfig = {
  appId: 'com.wacrmcinetca.app',
  appName: 'wacrm',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {

   url: 'https://wacrm-wacrm.pnp1lh.easypanel.host',
    cleartext: false,
    allowNavigation:
  ['https://wacrm-wacrm.pnp1lh.easypanel.host*']
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    PushNotifications: {
      // Show a real system notification (with sound) even while the app is
      // open in the foreground — the default is to suppress it and only fire
      // the JS 'pushNotificationReceived' listener (silent). Only 'sound' +
      // 'alert'/'banner' apply on Android. Baked in at APK build time, so this
      // change requires rebuilding the app.
      presentationOptions: ['alert', 'banner', 'sound'],
    },
  },
};

export default config;
