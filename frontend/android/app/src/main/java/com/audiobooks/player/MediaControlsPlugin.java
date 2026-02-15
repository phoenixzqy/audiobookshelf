package com.audiobooks.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
 */
@CapacitorPlugin(name = "MediaControls")
public class MediaControlsPlugin extends Plugin {
    private static final String TAG = "MediaControlsPlugin";
    private MediaPlaybackService service;
    private BroadcastReceiver actionReceiver;

    @Override
    public void load() {
        registerActionReceiver();
    }

    private void registerActionReceiver() {
        actionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (action == null) return;

                JSObject data = new JSObject();
                switch (action) {
                    case MediaPlaybackService.ACTION_PLAY:
                        data.put("action", "play");
                        break;
                    case MediaPlaybackService.ACTION_PAUSE:
                        data.put("action", "pause");
                        break;
                    case MediaPlaybackService.ACTION_PREV:
                        data.put("action", "previous");
                        break;
                    case MediaPlaybackService.ACTION_NEXT:
                        data.put("action", "next");
                        break;
                    case MediaPlaybackService.ACTION_STOP:
                        data.put("action", "stop");
                        break;
                    default:
                        return;
                }
                notifyListeners("mediaAction", data);
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(MediaPlaybackService.ACTION_PLAY);
        filter.addAction(MediaPlaybackService.ACTION_PAUSE);
        filter.addAction(MediaPlaybackService.ACTION_PREV);
        filter.addAction(MediaPlaybackService.ACTION_NEXT);
        filter.addAction(MediaPlaybackService.ACTION_STOP);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(actionReceiver, filter);
        }
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title", "Audiobook Player");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        String artUrl = call.getString("artUrl", "");

        Intent intent = new Intent(getContext(), MediaPlaybackService.class);
        getContext().startService(intent);

        // Since we can't bind to service easily in a plugin, we use a static approach
        // The service is started and we send metadata via intent extras
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
        if (actionReceiver != null) {
            try {
                getContext().unregisterReceiver(actionReceiver);
            } catch (Exception e) {
                Log.w(TAG, "Receiver already unregistered", e);
            }
        }
    }
}
