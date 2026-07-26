# Recipe App - Project Context

## Overview
A recipe management web application that stores recipes locally using IndexedDB and uses Google Gemini AI for recipe generation, parsing, and suggestions.

**Live URL**: https://erinslist.netlify.app

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript (no framework)
- **Storage**: IndexedDB via Dexie.js (`js/libs/dexie.js`)
- **AI**: Google Gemini API (`gemini-2.5-flash` model)
- **Backend**: Netlify Functions (serverless)
- **Deployment**: Netlify

## Project Structure
```
├── index.html          # Main HTML (single-page app)
├── script.js           # Main application logic (364KB - large file)
├── style.css           # Styles
├── js/libs/dexie.js    # IndexedDB wrapper library
├── netlify/functions/  # Serverless API endpoints
│   ├── ask-about-recipe.js        # Recipe Q&A with AI
│   ├── generate-recipe-chat.js    # Chat-based recipe generation
│   ├── generate-recipes-from-ideas.js  # Bulk recipe ideas
│   ├── generate-weekly-plan.js    # Weekly meal planning
│   ├── log-error.js               # Client-side error logging -> Firestore
│   ├── ocr.js                     # OCR text extraction
│   ├── parse-recipe-text.js       # Parse recipe from text
│   └── process-recipe-image.js    # Extract recipe from image
└── netlify.toml        # Netlify configuration
```

## Environment Variables
- `GOOGLE_GEMINI_API_KEY` - Required for all AI functions
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` - Firebase Admin SDK service account credentials, required by `log-error.js` to write to the `errorLogs` Firestore collection. Generate via Firebase Console > Project Settings > Service Accounts > Generate new private key; `FIREBASE_PRIVATE_KEY` must have its newlines escaped as `\n` when stored as a Netlify env var.

## Error Logging
Client-side errors are automatically captured and sent to the `log-error` Netlify function, which writes them to the `errorLogs` Firestore collection. This covers uncaught exceptions, unhandled promise rejections, and every existing `console.error()` call in `script.js` (via a wrapped `console.error`, set up once near the top of the file) — no need to instrument individual call sites. Each entry includes the error message/stack, current view, viewport size, user agent, logged-in user ID (or local-mode flag), and a rolling breadcrumb trail of recent console activity. Client-side dedup (10s window) and a 25-log session cap keep repeated/looping errors from flooding Firestore.

## Local Development

### Setup
1. Install Netlify CLI: `npm install -g netlify-cli`
2. Link to Netlify site: `netlify link`
3. Run local dev server: `netlify dev`

This runs the app at `http://localhost:8888` with full function support.

### CORS
All functions use `process.env.CONTEXT === 'dev'` to detect local development and allow CORS automatically. No manual configuration needed.

## Branches
- `main` - Production branch
- `MenuFolders` - Feature branch for menu organization
- `mobile-desktop-UI-update` - UI improvements for responsive design

## Feature Backlog (from feature-requests.md)
- User accounts with saved preferences
- Planner section - assign recipes to future days
- Ingredient groups - commonly used blocks of ingredients
- Shopping list - generate from recipes in date range

## Key Patterns
- All Netlify functions follow the same structure: CORS headers, OPTIONS handling, POST validation, Gemini AI call, JSON response
- Functions expect JSON body with specific fields (varies by function)
- AI responses are parsed and validated before returning to client

## Recipe Card System
Recipe cards use a compact/expand pattern:
- **Compact view**: Title, folder badge, rating stars, tags, ingredient match indicator (during search)
- **Expanded view**: Full details including ingredients table, instructions, action buttons
- **State management**: `expandedRecipeIds` Set tracks which cards are expanded (persists across re-renders)
- **Toggle**: Click anywhere on card header to expand/collapse
- **Key functions**: `displayRecipes()`, `toggleRecipeCard()`, `buildRatingStars()`, `buildActionButtons()`, `buildBottomActionRow()`, `buildIngredientMatchIndicator()`
