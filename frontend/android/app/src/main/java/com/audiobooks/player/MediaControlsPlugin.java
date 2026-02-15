package com.audiobooks.player;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin bridge for MediaPlaybackService.
 * Allows the WebView JS to control the native media notification.
 * Uses a static reference for direct service→plugin communication
 * (avoids broadcast reliability issues on Android 13+/14+).
 */
@CapacitorPlugin(name = "MediaControls")
public class MediaControlsPlugin extends Plugin {
    private static final String TAG = "MediaControlsPlugin";

    /** Static reference for MediaPlaybackService to dispatch events directly */
    static MediaControlsPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /**
     * Called by MediaPlaybackService to forward media button actions to JS.
     * Runs on the main thread via Capacitor's listener mechanism.
     */
    void dispatchMediaAction(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("mediaAction", data);
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title", "Audiobook Player");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artUrl = call.getString("artUrl", "");

        Intent metaIntent = new Intent(getContext(), MediaPlaybackService.class);
        metaIntent.putExtra("command", "updateMetadata");
        metaIntent.putExtra("title", title);
        metaIntent.putExtra("artist", artist);
        metaIntent.putExtra("album", album);
        metaIntent.putExtra("artUrl", artUrl);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(metaIntent);
        } else {
            getContext().startService(metaIntent);
        }

        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        boolean playing = call.getBoolean("isPlaying", false);
        long position = call.getInt("position", 0) * 1000L;
        long duration = call.getInt("duration", 0) * 1000L;

        Intent intent = new Intent(getContext(), MediaPlaybackService.class);
        intent.putExtra("command", "updatePlaybackState");
        intent.putExtra("isPlaying", playing);
        intent.putExtra("position", position);
        intent.putExtra("duration", duration);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        Intent intent = new Intent(getContext(), MediaPlaybackService.class);
        getContext().stopService(intent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
    }
}
