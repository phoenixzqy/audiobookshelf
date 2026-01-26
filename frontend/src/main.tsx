import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import './i18n';
import { platformService } from './services/platformService';
import { initializeConfig } from './config/appConfig';
import { initializeCapacitor } from './capacitor/init';

/**
 * Bootstrap the application
 *
 * Handles platform-specific initialization before rendering:
 * - Initializes config (fetches from GitHub for native apps)
 * - Initializes Capacitor plugins for native platforms
 * - Uses appropriate router based on platform
 */
async function bootstrap(): Promise<void> {
  console.log(`[App] Bootstrapping on ${platformService.platform}...`);

  try {
    // Initialize config (fetches remote config for native apps)
    await initializeConfig();

    // Initialize Capacitor plugins if running as native app
    if (platformService.isNative) {
      await initializeCapacitor();
    }
  } catch (error) {
    console.error('[App] Bootstrap error:', error);
    // Continue anyway - app may still partially work
  }

  // Create root element
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  const root = ReactDOM.createRoot(rootElement);

  // Choose router based on platform
  // - Web: BrowserRouter with basename for GitHub Pages
  // - Native: MemoryRouter (no browser history)
  if (platformService.isNative) {
    // Native app - use MemoryRouter
    root.render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </React.StrictMode>
    );
  } else {
    // Web app - use BrowserRouter with basename
    const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

    root.render(
      <React.StrictMode>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  }

  console.log('[App] Rendered successfully');
}

// Start the app
bootstrap().catch((error) => {
  console.error('[App] Fatal bootstrap error:', error);

  // Show error message in case of fatal error
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #111827; color: white; font-family: system-ui;">
        <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">Failed to start app</h1>
        <p style="color: #9ca3af;">${error.message || 'Unknown error'}</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; border: none; border-radius: 0.25rem; color: white; cursor: pointer;">
          Retry
        </button>
      </div>
    `;
  }
});
