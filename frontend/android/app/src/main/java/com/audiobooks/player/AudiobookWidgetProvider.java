package com.audiobooks.player;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home screen widget (1×4) for audiobook playback controls.
 * Displays title, artist, and play/pause/prev/next buttons.
 * Communicates with MediaPlaybackService via broadcast intents.
 */
public class AudiobookWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "widget_prefs";
    private static final String KEY_TITLE = "widget_title";
    private static final String KEY_ARTIST = "widget_artist";
    private static final String KEY_PLAYING = "widget_playing";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            updateWidget(context, manager, widgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        String action = intent.getAction();
        if (action == null) return;

        // Handle media actions from widget buttons
        switch (action) {
            case MediaPlaybackService.ACTION_PLAY:
            case MediaPlaybackService.ACTION_PAUSE:
            case MediaPlaybackService.ACTION_PREV:
            case MediaPlaybackService.ACTION_NEXT:
                // Forward to service
                Intent serviceIntent = new Intent(context, MediaPlaybackService.class);
                serviceIntent.setAction(action);
                context.startService(serviceIntent);
                break;

            case "com.audiobooks.player.UPDATE_WIDGET":
                // Update widget with new metadata
                String title = intent.getStringExtra("title");
                String artist = intent.getStringExtra("artist");
                boolean playing = intent.getBooleanExtra("isPlaying", false);

                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                if (title != null) editor.putString(KEY_TITLE, title);
                if (artist != null) editor.putString(KEY_ARTIST, artist);
                editor.putBoolean(KEY_PLAYING, playing);
                editor.apply();

                updateAllWidgets(context);
                break;
        }
    }

    private void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_audiobook);

        // Load saved state
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String title = prefs.getString(KEY_TITLE, "Audiobook Player");
        String artist = prefs.getString(KEY_ARTIST, "No book playing");
        boolean playing = prefs.getBoolean(KEY_PLAYING, false);

        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_artist, artist);
        views.setImageViewResource(R.id.widget_play_pause,
            playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play);

        // Button intents
        views.setOnClickPendingIntent(R.id.widget_prev, createBroadcastIntent(context, MediaPlaybackService.ACTION_PREV, 10));
        views.setOnClickPendingIntent(R.id.widget_play_pause,
            createBroadcastIntent(context, playing ? MediaPlaybackService.ACTION_PAUSE : MediaPlaybackService.ACTION_PLAY, 11));
        views.setOnClickPendingIntent(R.id.widget_next, createBroadcastIntent(context, MediaPlaybackService.ACTION_NEXT, 12));

        // Tap title/cover to open app
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent launchPending = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_cover, launchPending);
        views.setOnClickPendingIntent(R.id.widget_title, launchPending);

        manager.updateAppWidget(widgetId, views);
    }

    private PendingIntent createBroadcastIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, AudiobookWidgetProvider.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName widget = new ComponentName(context, AudiobookWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(widget);
        if (ids.length > 0) {
            AudiobookWidgetProvider provider = new AudiobookWidgetProvider();
            provider.onUpdate(context, manager, ids);
        }
    }
}
