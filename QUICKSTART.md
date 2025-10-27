# eResus Quick Start Guide

Get your eResus app running in 5 minutes!

## 🚀 Super Quick Start (Development)

1. **Clone and Install**
   ```bash
   git clone https://github.com/jacknaylordunn/eresus.git
   cd eresus
   npm install
   ```

2. **Configure Firebase** (Copy the example file)
   ```bash
   cp .env.example .env.local
   ```

3. **Add Your Firebase Credentials** (Edit `.env.local`)
   
   Get these from [Firebase Console](https://console.firebase.google.com/):
   ```env
   VITE_FIREBASE_API_KEY=your_actual_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123:web:abc123
   VITE_FIREBASE_MEASUREMENT_ID=G-ABC123
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Open Your Browser**
   
   Navigate to: `http://localhost:8080`

## 🔥 Firebase Setup (5 Steps)

### 1. Create Firebase Project
- Go to [Firebase Console](https://console.firebase.google.com/)
- Click "Add project"
- Enter project name: "eresus" (or your choice)
- Disable Google Analytics (or enable if you want it)
- Click "Create project"

### 2. Add Web App
- In your project, click the web icon `</>`
- Enter app nickname: "eResus Web"
- Don't check "Firebase Hosting" yet
- Click "Register app"
- **Copy the configuration values** - you'll need these!

### 3. Enable Firestore
- In left sidebar, click "Firestore Database"
- Click "Create database"
- Select "Start in production mode"
- Choose a location (closest to your users)
- Click "Enable"

### 4. Set Security Rules
- In Firestore, click "Rules" tab
- Replace with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{artifact}/users/{userId}/arrestLogs/{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
- Click "Publish"
- ⚠️ **Note**: These are development rules. See DEPLOYMENT.md for production rules!

### 5. Copy Config to .env.local
- Use the values from step 2
- Paste into your `.env.local` file
- Save the file

## ✅ Verify It Works

1. **Start the app** (`npm run dev`)
2. **Click "Start Arrest"**
3. **Check Firebase Console** > Firestore Database
4. You should see a new document under:
   ```
   artifacts/eresus-web-app/users/{device-id}/arrestLogs/arrest_log
   ```

If you see the document, **you're all set!** 🎉

## 📱 Test as PWA (Optional)

### On Desktop
1. Build for production: `npm run build`
2. Preview: `npm run preview`
3. Open `http://localhost:4173`
4. Look for install icon in address bar
5. Click to install as desktop app

### On Mobile
1. Deploy to hosting (see DEPLOYMENT.md)
2. Open on phone/tablet
3. Follow device-specific installation:
   - **iOS**: Share button → "Add to Home Screen"
   - **Android**: Menu → "Install app"

## 🎯 First Time Usage

### Starting an Arrest
1. Open the app
2. Click **"Start Arrest"**
3. CPR cycle timer begins automatically

### Logging Events
- **Rhythm Analysis**: Click "Analyse Rhythm"
  - Select "Shockable" or "Non-Shockable"
- **Defibrillation**: Click "Deliver Shock" (appears after shockable rhythm)
- **Medications**: Click "Adrenaline" to log doses
- **Outcomes**: 
  - Click "ROSC" for return of circulation
  - Click "End Arrest" when ceasing resuscitation

### Understanding the Display
- **Big Timer**: Total arrest duration
- **CPR Cycle**: Time until next rhythm check (2 minutes)
- **Statistics**: Quick view of shocks, drugs, and events
- **Event Log**: Timestamped list of all interventions

### Multi-Device Testing
1. Open app on Device A
2. Start an arrest
3. Open same app on Device B
4. Both devices show the same arrest data!

## 🚨 Common Issues

### "Firebase not initialized"
**Fix**: Check your `.env.local` file has all variables and restart dev server

### "Permission denied" in Firestore
**Fix**: 
1. Go to Firebase Console > Firestore > Rules
2. Make sure rules allow read/write (see Step 4 above)
3. Click "Publish"

### Timer not starting
**Fix**: Check browser console for errors. Make sure Firebase is configured correctly.

### Service worker errors in development
**Fix**: Service workers only fully work over HTTPS. Either:
- Ignore in development (expected behavior)
- Test in production deployment
- Use `localhost` (which is treated as secure)

### Dark mode not showing
**Fix**: It's enabled by default. Check browser dev tools console for theme errors.

## 🎓 Learning the Code

### Key Files to Understand
- `src/pages/Index.tsx` - Main app logic and UI
- `src/lib/firebase.ts` - Firebase configuration
- `src/types/arrest.ts` - Type definitions
- `src/utils/` - Utility functions
- `public/sw.js` - Service worker for PWA

### Making Changes
1. Edit files in `src/`
2. Save (hot reload in dev mode)
3. Build: `npm run build`
4. Test: `npm run preview`

### Adding Features
- **New interventions**: Edit `Index.tsx`, add button and log function
- **Change timings**: Modify `CPR_CYCLE_DURATION` or `ADRENALINE_INTERVAL`
- **Styling**: Edit Tailwind classes or `src/index.css`
- **More data fields**: Update type definitions in `src/types/arrest.ts`

## 📚 Next Steps

Once you're comfortable:

1. **Read README.md** - Full feature documentation
2. **Check DEPLOYMENT.md** - Production deployment guide
3. **Review Security** - Implement proper Firestore rules
4. **Test Thoroughly** - Try all features in different scenarios
5. **Deploy** - Get it live for real use

## 💡 Pro Tips

- **Keep dev console open**: Catches issues early
- **Test offline**: Turn off WiFi to verify PWA functionality
- **Multiple tabs**: Open app in 2+ tabs to test sync
- **Mobile first**: Most users will use on phone/tablet
- **Clear cache**: If things act weird after changes

## 🆘 Need Help?

- **Documentation**: See README.md and DEPLOYMENT.md
- **Firebase Issues**: [Firebase Docs](https://firebase.google.com/docs)
- **GitHub Issues**: [Report bugs](https://github.com/jacknaylordunn/eresus/issues)
- **Lovable Support**: [Project Page](https://lovable.dev/projects/b3a354e9-d5be-4221-ac00-a91dbae6ce2d)

---

**You're all set! Happy coding! 🚀**
