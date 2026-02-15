package com.audiobooks.player;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaControlsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * CRITICAL: Keep WebView alive for background audio playback.
     * When the Activity goes to background, Android pauses the WebView
     * (stopping JS timers, audio, and network). We immediately resume it
     * so audio continues playing. The foreground MediaPlaybackService
     * keeps the process alive and prevents the OS from killing it.
     */
    @Override
    public void onStop() {
        super.onStop();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }
}
