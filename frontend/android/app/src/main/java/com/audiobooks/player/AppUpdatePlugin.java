package com.audiobooks.player;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Capacitor plugin for triggering APK installation.
 * Used by the in-app auto-update feature.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String TAG = "AppUpdatePlugin";

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("path");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("File path is required");
            return;
        }

        try {
            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("APK file not found: " + filePath);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Android 7+ requires FileProvider for file URIs
                apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
                );
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Failed to install APK", e);
            call.reject("Failed to install APK: " + e.getMessage());
        }
    }
}
