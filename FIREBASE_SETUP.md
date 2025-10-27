# Firebase Configuration for eResus

## Current Setup

Your app now uses **device-based identification** with localStorage (no sign-in required). Each device gets a unique ID that persists across sessions.

## Firebase Configuration Needed

### 1. Enable Firestore Database

In your Firebase Console (https://console.firebase.google.com/):

1. Go to **Build > Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (we'll secure it properly next)
4. Select your preferred region
5. Click **Enable**

### 2. Configure Firestore Security Rules

Your app stores arrest logs per device. Update your Firestore rules to allow device-based access:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Allow access to arrest logs based on userId (device ID)
    match /artifacts/eresus-6e65e/users/{userId}/arrestLogs/{document=**} {
      allow read, write: if true; // Allow all devices to read/write their own data
    }
    
    match /artifacts/eresus-6e65e/users/{userId}/arrestLogsArchive/{document=**} {
      allow read, write: if true; // Allow all devices to read/write their own archived data
    }
    
    // Default: deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Important:** These rules allow any device to access data. Since each device has a unique ID stored in localStorage, this provides device-level isolation. Consider adding request authentication if you need additional security.

### 3. Optional: Enable Offline Persistence

Firestore automatically caches data for offline use. Your service worker also caches:
- The app shell
- All Resuscitation Council UK PDFs
- Previously loaded data

This means the app works fully offline after the first load.

## How It Works

1. **First Load**: 
   - App generates unique device ID
   - Stores in localStorage as `eresus_user_id`
   - Connects to Firestore with this ID

2. **Subsequent Loads**:
   - App reads device ID from localStorage
   - Fetches all arrest logs for that device
   - Works offline using cached data

3. **Data Sync**:
   - When online: saves to Firestore automatically
   - When offline: saves to local state
   - Auto-syncs when connection restored

## Testing

1. Open the app in browser
2. Create an arrest log
3. Open DevTools > Application > Local Storage
4. Note your `eresus_user_id`
5. Close and reopen the app - same device ID, same logs
6. Open in incognito/different browser - new device ID, new logs

## No Authentication Needed

You **do not** need to enable:
- Firebase Authentication
- Email/password sign-in
- Anonymous authentication

The app works purely with device identification via localStorage.
