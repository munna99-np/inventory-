# Quick Start Guide

## 🚀 Getting Started

### 1. Setup Environment

Create a `.env` file in the `mobile` folder:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**How to get these values:**
1. Go to https://app.supabase.com
2. Select your project
3. Go to **Settings** → **API**
4. Copy **Project URL** and **anon public** key

### 2. Install Dependencies

```bash
cd mobile
npm install
```

### 3. Test the App

**Start development server:**
```bash
npm start
```

**Run on Android:**
```bash
npm run android
```

**Run on iOS (Mac only):**
```bash
npm run ios
```

**Run on device:**
- Install Expo Go app on your phone
- Scan the QR code from `npm start`

### 4. Test Login

Default credentials (if auto-signup enabled):
- Email: `admin@gmail.com`
- Password: `admin@123`

Or create your own user in Supabase Dashboard → Authentication → Users

## 📦 Building APK

### Easiest Method (Cloud Build):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Build APK
npm run build:android
```

You'll get a download link for your APK!

### Local Build:

See `BUILD_INSTRUCTIONS.md` for detailed steps.

## ✅ What's Working

- ✅ Supabase authentication
- ✅ Login page with validation
- ✅ Auto-signup for new users
- ✅ Protected routes
- ✅ Sign out functionality
- ✅ Session persistence (stays logged in)
- ✅ Navigation between screens
- ✅ Loading states
- ✅ Error handling

## 🐛 Troubleshooting

**"Supabase configuration missing" error:**
- Check `.env` file exists in `mobile/` folder
- Verify variables start with `EXPO_PUBLIC_`
- Restart the dev server after changing `.env`

**Login not working:**
- Check Supabase URL and key are correct
- Verify user exists in Supabase Auth
- Check network connection
- Look at console logs for errors

**Build fails:**
- Make sure Node.js is 18.18.x or 20.x
- Clear cache: `npx expo start -c`
- Delete `node_modules` and reinstall

## 📱 Next Steps

The app is ready to use! You can now:

1. **Test login/logout** - Everything should work smoothly
2. **Build APK** - Use instructions above
3. **Add more features** - Transactions, Reports, etc.
4. **Customize UI** - Update colors, fonts, styles

## 📚 Documentation

- Full README: `README.md`
- Build Instructions: `BUILD_INSTRUCTIONS.md`
- Project structure: Check `README.md`

## 🎉 You're All Set!

The mobile app is ready. Just add your Supabase credentials and start building!
