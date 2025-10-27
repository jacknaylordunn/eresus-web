# eResus Deployment Guide

This guide covers deploying your eResus application to production.

## Pre-Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Environment variables set up
- [ ] Service Worker tested locally
- [ ] PWA manifest verified
- [ ] Dark mode styling confirmed
- [ ] All features tested in production build

## Environment Variables

### Required Variables

Create these in your hosting platform's environment settings:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## Deployment Options

### Option 1: Lovable (Recommended)

Lovable provides the easiest deployment experience:

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Connect to Lovable**
   - Visit [Lovable Project](https://lovable.dev/projects/b3a354e9-d5be-4221-ac00-a91dbae6ce2d)
   - Go to Settings > GitHub
   - Connect your repository

3. **Add Environment Variables**
   - Go to Settings > Environment Variables
   - Add all Firebase configuration variables
   - Save changes

4. **Deploy**
   - Click "Share" > "Publish"
   - Your app will be live at `yourapp.lovable.app`

5. **Custom Domain (Optional)**
   - Go to Settings > Domains
   - Follow instructions to connect your custom domain

### Option 2: Vercel

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Build Locally**
   ```bash
   npm run build
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Set Environment Variables**
   - Go to Vercel Dashboard > Project Settings > Environment Variables
   - Add all Firebase variables
   - Redeploy for variables to take effect

### Option 3: Netlify

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Build Project**
   ```bash
   npm run build
   ```

3. **Deploy**
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. **Configure Environment**
   - Go to Netlify Dashboard > Site Settings > Environment Variables
   - Add Firebase configuration
   - Trigger rebuild

### Option 4: Firebase Hosting

Perfect for keeping everything in one Firebase project:

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting**
   ```bash
   firebase init hosting
   ```
   
   Configuration:
   - Public directory: `dist`
   - Single-page app: `Yes`
   - GitHub integration: Optional

4. **Build Project**
   ```bash
   npm run build
   ```

5. **Deploy**
   ```bash
   firebase deploy --only hosting
   ```

6. **Environment Variables**
   
   Since Firebase Hosting serves static files, create a `.env.production` file:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   # ... other variables
   ```
   
   Then rebuild before deploying:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

## Post-Deployment Steps

### 1. Verify PWA Functionality

- Open your deployed app in Chrome/Edge
- Check for install prompt
- Install the app
- Test offline functionality
- Verify service worker registration in DevTools

### 2. Test on Mobile Devices

**iOS Testing:**
- Open in Safari
- Try "Add to Home Screen"
- Verify app icon appearance
- Test touch interactions
- Verify dark mode displays correctly

**Android Testing:**
- Open in Chrome
- Tap "Install app"
- Check app behavior when offline
- Verify haptic feedback works
- Test device sync

### 3. Firebase Console Check

- Verify Firestore database is receiving data
- Check document structure in Firestore
- Review security rules
- Monitor usage and performance

### 4. Security Hardening

**Update Firestore Rules** (Critical!)

Replace development rules with proper security:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can access their own data
    match /artifacts/{artifact}/users/{userId}/arrestLogs/{document=**} {
      // Add authentication check:
      allow read, write: if request.auth != null 
                         && request.auth.uid == userId;
    }
  }
}
```

For multi-device access without authentication, use device-specific rules:
```javascript
match /artifacts/{artifact}/users/{deviceId}/arrestLogs/{document=**} {
  // Allow access if deviceId matches
  allow read, write: if request.resource.data.deviceId == deviceId;
}
```

### 5. Performance Monitoring

Enable Firebase Performance Monitoring:

1. Go to Firebase Console
2. Navigate to Performance
3. Click "Get Started"
4. Monitor app performance metrics

### 6. Analytics Setup

If using Google Analytics:

1. Go to Firebase Console > Analytics
2. Enable Google Analytics
3. Your measurement ID is already configured
4. View analytics data in Firebase console

## Maintenance

### Regular Updates

```bash
# Update dependencies
npm update

# Rebuild and redeploy
npm run build
[your deployment command]
```

### Monitoring

- Check Firebase Console daily for usage patterns
- Monitor Firestore read/write quotas
- Review error logs
- Track PWA installation metrics

### Backup Strategy

Firestore data is automatically backed up by Firebase, but consider:

1. **Export Firestore Data** (monthly)
   ```bash
   gcloud firestore export gs://[BUCKET_NAME]
   ```

2. **Version Control**
   - Keep your GitHub repo updated
   - Tag releases for easy rollback

## Troubleshooting

### Service Worker Not Updating

```bash
# Clear cache and redeploy
rm -rf dist
npm run build
[deploy command]
```

Users may need to:
1. Close all app tabs
2. Clear browser cache
3. Reload the app

### Environment Variables Not Working

- Ensure variables start with `VITE_`
- Check capitalization
- Redeploy after adding variables
- Clear build cache: `rm -rf dist node_modules/.vite`

### Firebase Connection Issues

- Verify API key is correct
- Check Firebase project status
- Ensure Firestore is enabled
- Review security rules

### PWA Not Installing

- Check manifest.json is accessible
- Verify HTTPS is enabled (required for PWA)
- Confirm service worker registration
- Check browser console for errors

## Scaling Considerations

### Firestore Limits

Free tier includes:
- 50,000 reads/day
- 20,000 writes/day
- 1 GB storage

For high-traffic scenarios:
- Monitor usage in Firebase Console
- Upgrade to Blaze (pay-as-you-go) plan
- Implement data cleanup strategy
- Consider Firebase caching

### CDN Optimization

For global users:
- Use Firebase Hosting (includes CDN)
- Or configure CloudFlare
- Enable compression
- Optimize images and assets

## Support Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Lovable Documentation](https://docs.lovable.dev/)

## Emergency Rollback

If you need to quickly rollback:

**Lovable:**
- Go to History
- Select previous version
- Click "Restore"

**Firebase Hosting:**
```bash
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

**Vercel/Netlify:**
- Go to Deployments
- Find previous working version
- Click "Promote to Production"

---

Remember: Always test thoroughly in a staging environment before deploying to production!
