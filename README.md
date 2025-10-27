# eResus - Cardiac Arrest Clinical Scribe

A professional web application for documenting cardiac arrest resuscitation attempts in real-time. Built for healthcare professionals working in emergency and pre-hospital care settings.

## Features

- ⏱️ **Real-time Timer** - Track total arrest time and CPR cycle durations
- 📊 **Event Logging** - Automatic timestamping of all interventions
- 💉 **Drug Tracking** - Monitor adrenaline administration with interval reminders
- ⚡ **Shock Counter** - Track defibrillation attempts
- 🔄 **Rhythm Analysis** - Document shockable vs non-shockable rhythms
- 💾 **Cloud Sync** - Real-time synchronization across devices via Firebase
- 📱 **PWA Ready** - Install as a mobile app for offline functionality
- 🌙 **Dark Mode** - Optimized for low-light clinical environments

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Firebase Firestore
- **PWA**: Service Worker with offline caching
- **State Management**: React hooks with Firebase real-time sync

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project (for cloud sync functionality)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jacknaylordunn/eresus.git
   cd eresus
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   
   Create a `.env.local` file in the root directory:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

   You can find these values in your Firebase Console:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (or create a new one)
   - Go to Project Settings > General
   - Scroll to "Your apps" and select the web app
   - Copy the config values

4. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:8080`

### Firebase Setup

1. **Create a Firebase Project**
   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project"
   - Follow the setup wizard

2. **Enable Firestore Database**
   - In your Firebase project, go to Firestore Database
   - Click "Create database"
   - Start in production mode
   - Choose a location close to your users

3. **Configure Firestore Rules**
   
   For development, you can use these basic rules (replace with proper authentication for production):
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

   ⚠️ **Important**: For production, implement proper authentication and security rules!

## Deployment

### Deploy to Lovable (Recommended)

This project is optimized for deployment on Lovable:

1. Push your code to GitHub
2. Connect your GitHub repo to [Lovable](https://lovable.dev)
3. Add your Firebase environment variables in Project Settings
4. Click "Publish" to deploy

### Deploy to Other Platforms

The app can be deployed to any static hosting service:

**Vercel:**
```bash
npm run build
vercel --prod
```

**Netlify:**
```bash
npm run build
netlify deploy --prod --dir=dist
```

**Firebase Hosting:**
```bash
npm run build
firebase deploy
```

Remember to add your environment variables in your hosting platform's settings.

## PWA Installation

### iOS (iPhone/iPad)
1. Open the app in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Android
1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap "Install app" or "Add to Home screen"

### Desktop
- Chrome/Edge: Look for the install icon in the address bar
- Click it to install as a desktop app

## Usage

### Starting an Arrest
1. Click "Start Arrest" to begin timing
2. The CPR cycle timer will automatically start

### During Resuscitation
- Click "Analyse Rhythm" when checking the monitor
- Select "Shockable" or "Non-Shockable" based on rhythm
- For shockable rhythms, click "Deliver Shock"
- Log drugs by clicking "Adrenaline" (tracks doses automatically)
- The app reminds you when adrenaline is due (every 4 minutes)

### Outcomes
- Click "ROSC" when return of spontaneous circulation is achieved
- Click "End Arrest" when resuscitation efforts cease
- All events are automatically timestamped and synced to the cloud

### Multi-Device Sync
- Each device has a unique ID stored locally
- All arrest data syncs in real-time via Firebase
- Review the same arrest log on multiple devices simultaneously

## Development

### Project Structure
```
src/
├── components/     # Reusable UI components (shadcn/ui)
├── hooks/          # Custom React hooks
├── lib/            # Core libraries (Firebase, device management)
├── pages/          # Application pages/routes
├── types/          # TypeScript type definitions
├── utils/          # Utility functions (time formatting, haptics, etc.)
└── constants/      # App constants and templates
```

### Key Files
- `src/lib/firebase.ts` - Firebase configuration
- `src/lib/device.ts` - Device ID management
- `src/types/arrest.ts` - TypeScript definitions
- `src/pages/Index.tsx` - Main application logic
- `public/sw.js` - Service worker for PWA
- `public/manifest.json` - PWA manifest

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Clinical Use Disclaimer

⚠️ **Important**: This application is designed as a documentation aid for trained healthcare professionals. It does NOT provide clinical guidance or replace clinical judgment. Users must follow their local protocols and guidelines for cardiac arrest management.

This tool:
- ✅ Helps document timing and interventions
- ✅ Provides reminders based on standard intervals
- ❌ Does NOT diagnose or provide treatment recommendations
- ❌ Should NOT be the sole basis for clinical decisions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is available for use by healthcare professionals and organizations working in emergency medical services.

## Support

For issues, questions, or feature requests:
- GitHub Issues: [https://github.com/jacknaylordunn/eresus/issues](https://github.com/jacknaylordunn/eresus/issues)
- Project URL: [https://lovable.dev/projects/b3a354e9-d5be-4221-ac00-a91dbae6ce2d](https://lovable.dev/projects/b3a354e9-d5be-4221-ac00-a91dbae6ce2d)

## Acknowledgments

- Built with [Lovable](https://lovable.dev)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Based on Resuscitation Council UK guidelines

---

**Made with ❤️ for healthcare professionals**
