package com.audiobooks.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Foreground service for audio playback with media notification.
 * Provides notification-area and lock-screen media controls on Android.
 * Acquires CPU WakeLock and audio focus to prevent OS from stopping playback.
 */
public class MediaPlaybackService extends Service {
    private static final String TAG = "MediaPlaybackService";
    private static final String CHANNEL_ID = "audiobook_playback";
    private static final int NOTIFICATION_ID = 1;

    public static final String ACTION_PLAY = "com.audiobooks.player.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.audiobooks.player.ACTION_PAUSE";
    public static final String ACTION_PREV = "com.audiobooks.player.ACTION_PREV";
    public static final String ACTION_NEXT = "com.audiobooks.player.ACTION_NEXT";
    public static final String ACTION_STOP = "com.audiobooks.player.ACTION_STOP";

    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock cpuWakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean isPlaying = false;
    private String currentTitle = "Audiobook Player";
    private String currentArtist = "";
    private String currentAlbum = "";
    private Bitmap currentArtwork = null;
    private long currentPosition = 0;
    private long currentDuration = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        acquireCpuWakeLock();
        requestAudioFocus();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Audiobook Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for audiobook playback");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "AudiobookPlayer");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                dispatchToPlugin("play");
            }

            @Override
            public void onPause() {
                dispatchToPlugin("pause");
            }

            @Override
            public void onSkipToPrevious() {
                dispatchToPlugin("previous");
            }

            @Override
            public void onSkipToNext() {
                dispatchToPlugin("next");
            }

            @Override
            public void onStop() {
                dispatchToPlugin("stop");
            }

            @Override
            public void onSeekTo(long pos) {
                // Handled in WebView via JS
            }
        });
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String command = intent.getStringExtra("command");
            if ("updateMetadata".equals(command)) {
                updateMetadata(
                    intent.getStringExtra("title"),
                    intent.getStringExtra("artist"),
                    intent.getStringExtra("album"),
                    intent.getStringExtra("artUrl")
                );
            } else if ("updatePlaybackState".equals(command)) {
                updatePlaybackState(
                    intent.getBooleanExtra("isPlaying", false),
                    intent.getLongExtra("position", 0),
                    intent.getLongExtra("duration", 0)
                );
            } else if (intent.getAction() != null) {
                handleAction(intent.getAction());
            }
        }
        startForeground(NOTIFICATION_ID, buildNotification());
        return START_STICKY;
    }

    private void handleAction(String action) {
        switch (action) {
            case ACTION_PLAY:
                dispatchToPlugin("play");
                break;
            case ACTION_PAUSE:
                dispatchToPlugin("pause");
                break;
            case ACTION_PREV:
                dispatchToPlugin("previous");
                break;
            case ACTION_NEXT:
                dispatchToPlugin("next");
                break;
            case ACTION_STOP:
                dispatchToPlugin("stop");
                stopSelf();
                break;
        }
    }

    /** Dispatch a media action directly to the Capacitor plugin (avoids unreliable broadcasts) */
    private void dispatchToPlugin(String action) {
        if (MediaControlsPlugin.instance != null) {
            MediaControlsPlugin.instance.dispatchMediaAction(action);
        }
    }

    public void updateMetadata(String title, String artist, String album, String artUrl) {
        this.currentTitle = title != null ? title : "Audiobook Player";
        this.currentArtist = artist != null ? artist : "";
        this.currentAlbum = album != null ? album : "";

        // Load artwork in background
        if (artUrl != null && !artUrl.isEmpty()) {
            new Thread(() -> {
                try {
                    URL url = new URL(artUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setDoInput(true);
                    conn.connect();
                    InputStream input = conn.getInputStream();
                    currentArtwork = BitmapFactory.decodeStream(input);
                    input.close();
                    updateMediaSessionMetadata();
                    updateNotification();
                } catch (Exception e) {
                    Log.w(TAG, "Failed to load artwork", e);
                }
            }).start();
        }

        updateMediaSessionMetadata();
        updateNotification();
    }

    public void updatePlaybackState(boolean playing, long positionMs, long durationMs) {
        this.isPlaying = playing;
        this.currentPosition = positionMs;
        this.currentDuration = durationMs;

        // Update metadata with current duration so Android shows the seekbar
        updateMediaSessionMetadata();

        int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY |
                PlaybackStateCompat.ACTION_PAUSE |
                PlaybackStateCompat.ACTION_PLAY_PAUSE |
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                PlaybackStateCompat.ACTION_SEEK_TO |
                PlaybackStateCompat.ACTION_STOP
            )
            .setState(state, positionMs, playing ? 1.0f : 0f);

        mediaSession.setPlaybackState(stateBuilder.build());
        updateNotification();
    }

    private void updateMediaSessionMetadata() {
        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDuration);

        if (currentArtwork != null) {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtwork);
        }

        mediaSession.setMetadata(builder.build());
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Action intents
        PendingIntent prevIntent = createActionIntent(ACTION_PREV, 1);
        PendingIntent playPauseIntent = createActionIntent(
            isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2
        );
        PendingIntent nextIntent = createActionIntent(ACTION_NEXT, 3);

        int playPauseIcon = isPlaying ? R.drawable.ic_media_pause : R.drawable.ic_media_play;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .setShowWhen(false)
            .addAction(R.drawable.ic_media_previous, "Previous", prevIntent)
            .addAction(playPauseIcon, isPlaying ? "Pause" : "Play", playPauseIntent)
            .addAction(R.drawable.ic_media_next, "Next", nextIntent)
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2)
            );

        if (currentArtwork != null) {
            builder.setLargeIcon(currentArtwork);
        }

        return builder.build();
    }

    private PendingIntent createActionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaPlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void updateNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
        // Also update home screen widget
        updateWidget();
    }

    private void updateWidget() {
        Intent widgetIntent = new Intent("com.audiobooks.player.UPDATE_WIDGET");
        widgetIntent.setClass(this, AudiobookWidgetProvider.class);
        widgetIntent.putExtra("title", currentTitle);
        widgetIntent.putExtra("artist", currentArtist);
        widgetIntent.putExtra("isPlaying", isPlaying);
        sendBroadcast(widgetIntent);
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        releaseCpuWakeLock();
        abandonAudioFocus();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Acquire a PARTIAL_WAKE_LOCK to keep the CPU running during background playback.
     * Without this, Android Doze mode will throttle/suspend the process,
     * causing audio to pause even with a foreground service.
     */
    private void acquireCpuWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "audiobook:playback");
            cpuWakeLock.setReferenceCounted(false);
            cpuWakeLock.acquire();
            Log.d(TAG, "CPU WakeLock acquired");
        }
    }

    private void releaseCpuWakeLock() {
        if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
            cpuWakeLock.release();
            Log.d(TAG, "CPU WakeLock released");
        }
    }

    /**
     * Request audio focus so other apps know we're playing audio.
     * Handles focus changes (e.g., phone call, notification sound).
     */
    private void requestAudioFocus() {
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (audioManager == null) return;

        AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
            switch (focusChange) {
                case AudioManager.AUDIOFOCUS_LOSS:
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    // Another app took audio focus — pause
                    dispatchToPlugin("pause");
                    break;
                case AudioManager.AUDIOFOCUS_GAIN:
                    // Regained focus — resume
                    dispatchToPlugin("play");
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    // Short interruption (notification sound) — keep playing at lower volume
                    break;
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build())
                .setOnAudioFocusChangeListener(focusListener)
                .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(focusListener,
                AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        Log.d(TAG, "Audio focus requested");
    }

    private void abandonAudioFocus() {
        if (audioManager != null && audioFocusRequest != null
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        }
    }
}
