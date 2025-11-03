# Build Instructions for Android APK

## Prerequisites

1. **Node.js** (18.18.x or 20.x)
2. **Expo CLI** (installed globally or via npx)
3. **Android Studio** (for local builds)
4. **Java JDK** (for local builds)

## Method 1: EAS Build (Easiest - Cloud Build)

This method builds your APK in the cloud. No local setup needed!

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

### Step 2: Login to Expo
```bash
eas login
```
(Create an account at https://expo.dev if you don't have one)

### Step 3: Configure EAS
```bash
eas build:configure
```

### Step 4: Build APK
```bash
npm run build:android
```

Or manually:
```bash
eas build --platform android --profile preview
```

The build will run in the cloud and you'll get a download link for your APK.

## Method 2: Local Build (Requires Android Studio)

### Step 1: Setup Android Studio

1. Download and install [Android Studio](https://developer.android.com/studio)
2. Open Android Studio → SDK Manager
3. Install:
   - Android SDK
   - Android SDK Platform
   - Android SDK Build-Tools
4. Set environment variables:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk  # macOS/Linux
   # or
   set ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk  # Windows
   
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   ```

### Step 2: Generate Native Project
```bash
cd mobile
npm run prebuild
```

This creates the `android` and `ios` folders.

### Step 3: Build APK

#### Debug APK (unsigned, for testing):
```bash
cd android
./gradlew assembleDebug
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Release APK (requires signing):

1. Generate a keystore (first time only):
```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore finance-tracker-key.keystore -alias finance-tracker -keyalg RSA -keysize 2048 -validity 10000
```

2. Create `android/gradle.properties` and add:
```properties
FINANCE_TRACKER_UPLOAD_STORE_FILE=finance-tracker-key.keystore
FINANCE_TRACKER_UPLOAD_KEY_ALIAS=finance-tracker
FINANCE_TRACKER_UPLOAD_STORE_PASSWORD=your-keystore-password
FINANCE_TRACKER_UPLOAD_KEY_PASSWORD=your-key-password
```

3. Update `android/app/build.gradle` signing config (if needed)

4. Build release APK:
```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

## Method 3: Development Build (Quick Testing)

For quick testing without full build:

```bash
npm run android
```

This runs on an emulator or connected device.

## Environment Variables

Make sure you have a `.env` file with:

```env
EXPO_PUBLIC_SUPABASE_URL=your_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key
```

## Troubleshooting

### "SDK location not found"
- Set `ANDROID_HOME` environment variable
- Or set `sdk.dir` in `android/local.properties`

### "Gradle sync failed"
- Check internet connection
- Try: `cd android && ./gradlew clean`

### Build takes too long
- Use EAS Build (cloud) for faster builds
- Or ensure you have good internet for downloading dependencies

### APK not installing on device
- Enable "Install from unknown sources" on Android device
- Check that the APK is for the correct architecture (arm64-v8a, armeabi-v7a, x86, x86_64)

## Testing the APK

1. Transfer APK to Android device (USB, email, cloud storage)
2. On device: Settings → Security → Enable "Install from unknown sources"
3. Open the APK file and install
4. Open the app and test login functionality

## Distribution

For Google Play Store:
- Build App Bundle: `eas build --platform android --profile production`
- Upload the `.aab` file to Google Play Console

For direct distribution:
- Use the `.apk` file from Method 1 or Method 2
