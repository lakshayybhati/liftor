# App Store Deployment Guide for Liftor

This guide will walk you through the complete process of uploading your app to the Apple App Store.

## Prerequisites

Before you begin, ensure you have:

1. ✅ **Apple Developer Account** ($99/year)
   - Enrolled at [developer.apple.com](https://developer.apple.com)
   - Account in good standing

2. ✅ **EAS CLI Installed**
   ```bash
   npm install -g eas-cli
   ```

3. ✅ **Expo Account**
   - Sign up at [expo.dev](https://expo.dev)
   - Login via CLI: `eas login`

4. ✅ **Environment Variables Set Up**
   - EXPO_PUBLIC_SUPABASE_URL
   - EXPO_PUBLIC_SUPABASE_ANON_KEY
   - EXPO_PUBLIC_GEMINI_API_KEY
   - EXPO_PUBLIC_REVENUECAT_IOS_API_KEY

## Step 1: Configure EAS Project

First, you need to initialize or configure your EAS project:

```bash
# Login to EAS
eas login

# Configure your project (if not already done)
eas build:configure
```

This will create/update your EAS project ID in `app.json`.

## Step 2: Set Up Environment Variables

Create a `.env` file in your project root (don't commit this to git):

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_CfuHeBCwQmEZeYiYLvtHInhIQVs
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_txuAMppyVuWBJpJAtpWcwrhMxYl
EXPO_PUBLIC_REVENUECAT_REQUIRED_ENTITLEMENT=elite
EXPO_PUBLIC_ENVIRONMENT=production
```

## Step 3: Build for iOS Production

Run the production build command:

```bash
eas build --platform ios --profile production
```

This will:
- Build your app in the cloud
- Auto-increment the build number
- Use Release configuration
- Create an IPA file ready for App Store submission

**Note:** The first build will prompt you to:
- Set up iOS credentials (or use existing Apple Developer credentials)
- Choose between automatic or manual credential management
- **Recommended:** Choose automatic credential management

## Step 4: Submit to App Store Connect

Once the build completes successfully, submit to App Store:

```bash
eas submit --platform ios --latest
```

This will:
- Upload the latest build to App Store Connect
- You'll be prompted for your Apple ID credentials
- The app will appear in App Store Connect for review

Alternatively, you can manually download the IPA and upload via:
- Xcode → Window → Organizer
- Or Transporter app from Mac App Store

## Step 5: Complete App Store Listing

Now go to [App Store Connect](https://appstoreconnect.apple.com):

### 5.1 Create App Store Listing

1. Go to "My Apps" → Click "+" → "New App"
2. Fill in:
   - **Platform:** iOS
   - **Name:** Liftor (or your preferred name)
   - **Primary Language:** English
   - **Bundle ID:** liftor.app
   - **SKU:** liftor-app (or any unique identifier)
   - **User Access:** Full Access

### 5.2 App Information

- **Category:** Health & Fitness
- **Content Rights:** Check if you own the rights
- **Age Rating:** Complete the questionnaire

### 5.3 Pricing and Availability

- Select countries/regions
- Set price (if not using in-app purchases for core features)

### 5.4 Prepare for Submission

Fill in all required fields:

#### App Information
- **Privacy Policy URL:** Required (create one if you don't have)
- **App Category:** Health & Fitness
- **Subtitle:** Short description (30 characters)
- **Keywords:** Comma-separated for search

#### Version Information
- **Screenshots:** Required (at least one set)
  - 6.7" Display (iPhone 14 Pro Max): 1290 x 2796 pixels
  - 6.5" Display (iPhone 11 Pro Max): 1242 x 2688 pixels
  - 5.5" Display (iPhone 8 Plus): 1242 x 2208 pixels
  
- **Promotional Text:** Optional, can be updated anytime
- **Description:** Detailed app description (up to 4000 characters)
- **What's New:** Release notes for this version
- **Support URL:** Your support/contact page
- **Marketing URL:** Optional

### 5.5 App Review Information

- **Contact Information:** Your contact details
- **Demo Account:** If login is required, provide test credentials
- **Notes:** Any special instructions for reviewers

### 5.6 App Privacy

Complete the privacy questionnaire:
- Data types collected
- How data is used
- Whether data is linked to users
- Whether data is used for tracking

## Step 6: Submit for Review

1. Select the build from the dropdown (it may take 10-15 minutes to process)
2. Complete all required fields
3. Click "Add for Review"
4. Click "Submit to App Review"

## Review Process

- **Review Time:** Typically 24-48 hours
- **Status Updates:** You'll receive emails
- **Possible Outcomes:**
  - ✅ Approved → Your app goes live
  - ❌ Rejected → Address issues and resubmit

## Common Rejection Reasons to Avoid

1. **Missing Privacy Policy:** Ensure you have one
2. **Incomplete App Information:** Fill all required fields
3. **Crashes or Bugs:** Test thoroughly before submission
4. **Misleading Screenshots:** Use actual app screenshots
5. **Incomplete Demo Account:** Provide working test credentials
6. **Guideline Violations:** Review [App Store Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Post-Submission

Once approved:
- Your app appears in the App Store within 24 hours
- You can update app information anytime
- Submit new builds for updates using the same process

## App Updates

For future updates:

1. Update version in `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. Build and submit:
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios --latest
   ```

3. Create new version in App Store Connect
4. Add "What's New" notes
5. Submit for review

## Troubleshooting

### Build Fails
- Check error logs in EAS dashboard
- Ensure all dependencies are compatible
- Verify environment variables

### Submission Fails
- Verify Apple ID credentials
- Check that bundle ID matches in both EAS and App Store Connect
- Ensure build is processed in App Store Connect

### App Rejected
- Read rejection notes carefully
- Address all issues mentioned
- Reply to reviewer if you need clarification
- Make changes and resubmit

## Resources

- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Expo EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Quick Command Reference

```bash
# Login to EAS
eas login

# Check build status
eas build:list

# Build for iOS production
eas build --platform ios --profile production

# Submit latest build
eas submit --platform ios --latest

# View build details
eas build:view

# Cancel a build
eas build:cancel
```

---

**Good luck with your submission! 🚀**

