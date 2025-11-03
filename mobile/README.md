# Finance Tracker Mobile App

React Native mobile application for Finance Tracker built with Expo, React Navigation, and Supabase.

## Features

- ✅ User authentication with Supabase
- ✅ Login/Logout functionality
- ✅ Protected routes
- ✅ Cross-platform (Android & iOS)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `mobile` directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can get these values from your Supabase project:
- Go to https://app.supabase.com
- Select your project
- Go to Settings → API
- Copy the URL and anon/public key

### 3. Run the App

**Development:**
```bash
npm start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan QR code with Expo Go app on your phone

**Android:**
```bash
npm run android
```

**iOS:**
```bash
npm run ios
```

## Building APK for Android

### Option 1: Using EAS Build (Recommended)

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Configure the project:
```bash
eas build:configure
```

4. Build APK:
```bash
eas build --platform android --profile preview
```

### Option 2: Local Build (Requires Android Studio)

1. Install Android Studio and setup Android SDK
2. Generate a keystore for signing (optional for debug builds)
3. Build APK:
```bash
npx expo prebuild
cd android
./gradlew assembleRelease
```

The APK will be in `android/app/build/outputs/apk/release/`

### Option 3: Development Build (For Testing)

```bash
npx expo run:android
```

This creates a development build that you can test on a device or emulator.

## Project Structure

```
mobile/
├── App.tsx                 # Main app entry point
├── lib/
│   ├── supabaseClient.ts  # Supabase client configuration
│   └── auth.tsx           # Authentication context & provider
├── screens/
│   ├── SignInScreen.tsx   # Login screen
│   └── DashboardScreen.tsx # Main dashboard
└── navigation/
    └── AppNavigator.tsx   # Navigation setup
```

## Troubleshooting

### Login not working?
- Check that your `.env` file has correct Supabase credentials
- Ensure the Supabase project has authentication enabled
- Verify the user exists in Supabase Auth (or use the auto-signup feature)

### Build errors?
- Make sure Node.js version is 18.18.x or 20.x
- Clear cache: `npx expo start -c`
- Delete node_modules and reinstall: `rm -rf node_modules && npm install`

### APK build fails?
- Ensure Android SDK is properly installed
- Check that Java/JDK is installed and configured
- For EAS builds, ensure you're logged in: `eas login`

## Next Steps

- Add more screens (Transactions, Accounts, Reports, etc.)
- Implement navigation drawer/tabs
- Add offline support
- Implement push notifications
- Add biometric authentication

## Support

For issues related to:
- **Expo**: https://docs.expo.dev/
- **React Navigation**: https://reactnavigation.org/
- **Supabase**: https://supabase.com/docs
