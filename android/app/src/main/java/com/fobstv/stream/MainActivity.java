package com.fobstv.stream;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import androidx.core.app.NotificationCompat;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Environment;
import android.os.PowerManager;
import android.webkit.CookieManager;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback backPressedCallback;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private FrameLayout fullscreenContainer;
    private FullscreenWebChromeClient customChromeClient;

    private PowerManager.WakeLock downloadWakeLock = null;
    private boolean isDownloadActive = false;
    private static final String DL_CHANNEL_ID = "fobs_download_channel";
    private static final int DL_NOTIFICATION_ID = 9988;

    private void showDownloadNotification(String title) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    DL_CHANNEL_ID,
                    "FOBS TV Downloads",
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Background download in progress");
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }

            Intent openIntent = new Intent(this, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                this, 0, openIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, DL_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("FOBS TV • Downloading Offline")
                .setContentText(title != null && !title.trim().isEmpty() ? title.trim() : "Offline video download in progress...")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pi);

            nm.notify(DL_NOTIFICATION_ID, builder.build());
        } catch (Exception ignored) {}
    }

    private void cancelDownloadNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(DL_NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        // If an offline download is active, resume WebView so streaming reader and timers NEVER pause!
        if (isDownloadActive) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } else {
            // Restore window screen brightness back to system default when app is minimized or paused
            try {
                Window window = getWindow();
                if (window != null) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                    window.setAttributes(lp);
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Keep WebView and timers running while screen is turned off by power button
        if (isDownloadActive) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        }
    }

    private class FullscreenWebChromeClient extends BridgeWebChromeClient {
        public FullscreenWebChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.evaluateJavascript(
                    "(function() { return (typeof window.isMainPlayerActive === 'function' && window.isMainPlayerActive()); })();",
                    result -> {
                        boolean isPlayerActive = "true".equalsIgnoreCase(String.valueOf(result).replace("\"", "").trim());
                        if (isPlayerActive) {
                            if (callback != null) {
                                try {
                                    callback.onCustomViewHidden();
                                } catch (Exception ignored) {}
                            }
                            runOnUiThread(() -> {
                                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                                hideSystemUI();
                                webView.evaluateJavascript(
                                    "(function() { if (typeof window.enterFullscreenMode === 'function') window.enterFullscreenMode({ skipRotate: true }); })();",
                                    null
                                );
                            });
                        }
                    }
                );
            }
        }

        @Override
        public void onHideCustomView() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                showSystemUI();
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() { if (typeof window.exitFullscreenMode === 'function') window.exitFullscreenMode({ skipRotate: true }); })();",
                        null
                    );
                }
            });
        }
    }

    private class CustomBridgeWebViewClient extends BridgeWebViewClient {
        public CustomBridgeWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return super.shouldInterceptRequest(view, request);
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void setLandscape() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                hideSystemUI();
            });
        }

        @JavascriptInterface
        public void setPortrait() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                showSystemUI();
            });
        }

        @JavascriptInterface
        public void setAuto() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                showSystemUI();
            });
        }

        @JavascriptInterface
        public void enterFullscreen() {
            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                hideSystemUI();
            });
        }

        @JavascriptInterface
        public void exitFullscreen() {
            runOnUiThread(() -> {
                if (customChromeClient != null && customView != null) {
                    customChromeClient.onHideCustomView();
                } else {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    showSystemUI();
                }
            });
        }

        @JavascriptInterface
        public boolean isCustomViewActive() {
            return customView != null;
        }

        @JavascriptInterface
        public void setSystemBarColors(String statusBarColor, String navBarColor) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    try {
                        Window window = getWindow();
                        if (window != null) {
                            if (statusBarColor != null && !statusBarColor.trim().isEmpty()) {
                                window.setStatusBarColor(Color.parseColor(statusBarColor.trim()));
                            }
                            if (navBarColor != null && !navBarColor.trim().isEmpty()) {
                                window.setNavigationBarColor(Color.parseColor(navBarColor.trim()));
                            }
                        }
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void setWindowBrightness(float brightness) {
            // Keep window brightness strictly at BRIGHTNESS_OVERRIDE_NONE so the phone backlight
            // and the rest of the app/system UI are NEVER modified.
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams lp = window.getAttributes();
                        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                        window.setAttributes(lp);
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void resetWindowBrightness() {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams lp = window.getAttributes();
                        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                        window.setAttributes(lp);
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public void setDeviceVolume(float volumeRatio) {
            runOnUiThread(() -> {
                try {
                    AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                    if (am != null) {
                        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                        float safeRatio = Math.max(0.0f, Math.min(1.0f, volumeRatio));
                        int target = Math.round(safeRatio * max);
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
                    }
                } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public float getDeviceVolume() {
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int current = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                    return max > 0 ? ((float) current / (float) max) : 0.5f;
                }
            } catch (Exception ignored) {}
            return 0.5f;
        }

        @JavascriptInterface
        public int getNavigationBarHeight() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
                    if (insets != null) {
                        int bottom = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                        float density = getResources().getDisplayMetrics().density;
                        return (int) (bottom / (density > 0 ? density : 1.0f));
                    }
                }
                int resourceId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
                if (resourceId > 0) {
                    int heightPx = getResources().getDimensionPixelSize(resourceId);
                    float density = getResources().getDisplayMetrics().density;
                    return (int) (heightPx / (density > 0 ? density : 1.0f));
                }
            } catch (Exception ignored) {}
            return 0;
        }

        @JavascriptInterface
        public void setAudioBoost(int boostPercent) {
            // Handled cleanly via HTML5 video volume to avoid hardware audio conflicts
        }

        @JavascriptInterface
        public void saveUserSession(String userJson) {
            try {
                if (userJson != null) {
                    SharedPreferences prefs = getSharedPreferences("fobs_app_prefs", Context.MODE_PRIVATE);
                    prefs.edit().putString("fobs_user", userJson).apply();
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public String getUserSession() {
            try {
                SharedPreferences prefs = getSharedPreferences("fobs_app_prefs", Context.MODE_PRIVATE);
                return prefs.getString("fobs_user", "");
            } catch (Exception ignored) {}
            return "";
        }

        @JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> {
                try {
                    if (url != null && !url.trim().isEmpty()) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url.trim()));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void downloadFile(String downloadUrl, String filename) {
            runOnUiThread(() -> {
                try {
                    if (downloadUrl == null || downloadUrl.trim().isEmpty()) return;
                    String safeName = (filename != null && !filename.trim().isEmpty()) ? filename.trim() : "video.mp4";
                    if (!safeName.toLowerCase().endsWith(".mp4")) {
                        safeName += ".mp4";
                    }

                    android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        Uri downloadUri = Uri.parse(downloadUrl.trim());
                        android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(downloadUri);
                        request.setTitle(safeName);
                        request.setDescription("FOBS TV Video Download");
                        request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName);
                        request.setAllowedOverMetered(true);
                        request.setAllowedOverRoaming(true);
                        dm.enqueue(request);

                        Toast.makeText(MainActivity.this, "Downloading " + safeName + " ... Check notification bar 📥", Toast.LENGTH_LONG).show();
                    } else {
                        openExternalUrl(downloadUrl);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    openExternalUrl(downloadUrl);
                }
            });
        }

        @JavascriptInterface
        public void shareText(String title, String text) {
            runOnUiThread(() -> {
                try {
                    Intent sendIntent = new Intent();
                    sendIntent.setAction(Intent.ACTION_SEND);
                    if (title != null && !title.trim().isEmpty()) {
                        sendIntent.putExtra(Intent.EXTRA_TITLE, title.trim());
                        sendIntent.putExtra(Intent.EXTRA_SUBJECT, title.trim());
                    }
                    sendIntent.putExtra(Intent.EXTRA_TEXT, text != null ? text.trim() : "");
                    sendIntent.setType("text/plain");
                    Intent shareIntent = Intent.createChooser(sendIntent, "Share with");
                    shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(shareIntent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();

        @JavascriptInterface
        public void downloadAndInstallApk(String downloadUrl) {
            if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
                runOnUiThread(() -> {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView != null) {
                        webView.evaluateJavascript("if (typeof window.onNativeApkDownloadError === 'function') window.onNativeApkDownloadError('Invalid download URL');", null);
                    }
                });
                return;
            }

            updateExecutor.execute(() -> {
                InputStream input = null;
                FileOutputStream output = null;
                HttpURLConnection connection = null;
                try {
                    URL url = new URL(downloadUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") FOBS-TV-App");
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(30000);
                    connection.connect();

                    int status = connection.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == 307 || status == 308) {
                        String newUrl = connection.getHeaderField("Location");
                        if (newUrl != null && !newUrl.isEmpty()) {
                            connection.disconnect();
                            url = new URL(newUrl);
                            connection = (HttpURLConnection) url.openConnection();
                            connection.setInstanceFollowRedirects(true);
                            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") FOBS-TV-App");
                            connection.connect();
                        }
                    }

                    int fileLength = connection.getContentLength();
                    input = connection.getInputStream();

                    File storageDir = getExternalCacheDir();
                    if (storageDir == null) {
                        storageDir = getCacheDir();
                    }
                    File apkFile = new File(storageDir, "fobs_tv_update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    output = new FileOutputStream(apkFile);
                    byte[] data = new byte[16384];
                    long total = 0;
                    int count;
                    long lastUpdate = 0;

                    while ((count = input.read(data)) != -1) {
                        total += count;
                        output.write(data, 0, count);

                        long now = System.currentTimeMillis();
                        if (now - lastUpdate > 150) {
                            lastUpdate = now;
                            final int progress = fileLength > 0 ? (int) ((total * 100) / fileLength) : -1;
                            final long finalTotal = total;
                            final long finalLength = fileLength;
                            runOnUiThread(() -> {
                                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                                if (webView != null) {
                                    webView.evaluateJavascript(
                                        String.format(java.util.Locale.US, "if (typeof window.onNativeApkDownloadProgress === 'function') window.onNativeApkDownloadProgress(%d, %d, %d);", progress, finalTotal, finalLength),
                                        null
                                    );
                                }
                            });
                        }
                    }

                    output.flush();

                    final long finalTotal = total;
                    final long finalLength = fileLength > 0 ? fileLength : total;
                    runOnUiThread(() -> {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                        if (webView != null) {
                            webView.evaluateJavascript(
                                String.format(java.util.Locale.US, "if (typeof window.onNativeApkDownloadProgress === 'function') window.onNativeApkDownloadProgress(100, %d, %d); if (typeof window.onNativeApkDownloadComplete === 'function') window.onNativeApkDownloadComplete();", finalTotal, finalLength),
                                null
                            );
                        }
                        installDownloadedApk(apkFile);
                    });

                } catch (Exception e) {
                    final String errorMsg = e.getMessage() != null ? e.getMessage() : "Download error";
                    runOnUiThread(() -> {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                        if (webView != null) {
                            webView.evaluateJavascript(
                                String.format("if (typeof window.onNativeApkDownloadError === 'function') window.onNativeApkDownloadError('%s');", errorMsg.replace("'", "\\'")),
                                null
                            );
                        }
                    });
                } finally {
                    try { if (output != null) output.close(); } catch (Exception ignored) {}
                    try { if (input != null) input.close(); } catch (Exception ignored) {}
                    if (connection != null) connection.disconnect();
                }
            });
        }

        @JavascriptInterface
        public void installDownloadedApkNow() {
            runOnUiThread(() -> {
                File storageDir = getExternalCacheDir();
                if (storageDir == null) storageDir = getCacheDir();
                File apkFile = new File(storageDir, "fobs_tv_update.apk");
                if (apkFile.exists()) {
                    installDownloadedApk(apkFile);
                } else if (pendingInstallApk != null && pendingInstallApk.exists()) {
                    installDownloadedApk(pendingInstallApk);
                }
            });
        }

        @JavascriptInterface
        public void acquireWakeLock() {
            acquireWakeLock("FOBS TV Video");
        }

        @JavascriptInterface
        public void acquireWakeLock(String title) {
            runOnUiThread(() -> {
                try {
                    isDownloadActive = true;
                    // Start official Android Foreground Service for guaranteed background/screen-off network execution
                    Intent serviceIntent = new Intent(MainActivity.this, DownloadForegroundService.class);
                    serviceIntent.setAction(DownloadForegroundService.ACTION_START);
                    serviceIntent.putExtra(DownloadForegroundService.EXTRA_TITLE, title);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(serviceIntent);
                    } else {
                        startService(serviceIntent);
                    }

                    if (downloadWakeLock == null) {
                        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            downloadWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FobsTV:DownloadWakeLock");
                            downloadWakeLock.setReferenceCounted(false);
                            downloadWakeLock.acquire(180 * 60 * 1000L); // 3 hours safety limit
                        }
                    } else if (!downloadWakeLock.isHeld()) {
                        downloadWakeLock.acquire(180 * 60 * 1000L);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void releaseWakeLock() {
            runOnUiThread(() -> {
                try {
                    isDownloadActive = false;
                    // Stop Foreground Service
                    Intent serviceIntent = new Intent(MainActivity.this, DownloadForegroundService.class);
                    serviceIntent.setAction(DownloadForegroundService.ACTION_STOP);
                    startService(serviceIntent);

                    if (downloadWakeLock != null && downloadWakeLock.isHeld()) {
                        downloadWakeLock.release();
                    }
                    downloadWakeLock = null;
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }

    private File pendingInstallApk = null;

    @Override
    public void onResume() {
        super.onResume();
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
        if (pendingInstallApk != null && pendingInstallApk.exists()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                File apkToInstall = pendingInstallApk;
                pendingInstallApk = null;
                installDownloadedApk(apkToInstall);
            }
        }
    }

    public void installDownloadedApk(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) {
                Toast.makeText(this, "Downloaded APK not found", Toast.LENGTH_SHORT).show();
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    pendingInstallApk = apkFile;
                    Toast.makeText(this, "Please allow unknown apps permission to update FOBS TV", Toast.LENGTH_LONG).show();
                    Intent settingsIntent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(settingsIntent);
                    return;
                }
            }
            pendingInstallApk = null;

            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    apkFile
                );
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
            Toast.makeText(this, "Failed to start installer: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    public void hideSystemUI() {
        Window window = getWindow();
        if (window == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
            );
        }
    }

    public void showSystemUI() {
        Window window = getWindow();
        if (window == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            View decorView = window.getDecorView();
            decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            int orientation = getRequestedOrientation();
            if (orientation == ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE ||
                orientation == ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE ||
                customView != null) {
                hideSystemUI();
            }
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                if (newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE) {
                    hideSystemUI();
                    webView.evaluateJavascript(
                        "(function() { if (typeof window.onOrientationChanged === 'function') window.onOrientationChanged('landscape'); })();",
                        null
                    );
                } else if (newConfig.orientation == Configuration.ORIENTATION_PORTRAIT) {
                    if (customView == null) {
                        showSystemUI();
                    }
                    webView.evaluateJavascript(
                        "(function() { if (typeof window.onOrientationChanged === 'function') window.onOrientationChanged('portrait'); })();",
                        null
                    );
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Optimize HTTP connection pooling for ultra-fast video chunk streaming
        try {
            System.setProperty("http.keepAlive", "true");
            System.setProperty("http.maxConnections", "20");
        } catch (Exception ignored) {}

        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        
        // Match status and navigation bar color with intro video background seamlessly (#020C1C)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                getWindow().setStatusBarColor(Color.parseColor("#020C1C"));
                getWindow().setNavigationBarColor(Color.parseColor("#020C1C"));
            } catch (Exception ignored) {}
        }

        // Lock window and webview background to #020C1C to eliminate all white flashes on cold start
        try {
            getWindow().setBackgroundDrawable(new ColorDrawable(Color.parseColor("#020C1C")));
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.setBackgroundColor(Color.parseColor("#020C1C"));
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {}
        
        // Force hardware acceleration at window level
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );

        // Allow window to draw across camera cutout / notch edges in landscape
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = 
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Handle Android swipe back gesture & system back button
        backPressedCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (customView != null && customChromeClient != null) {
                    customChromeClient.onHideCustomView();
                    return;
                }

                WebView targetWebView = null;
                try {
                    if (getBridge() != null) {
                        targetWebView = getBridge().getWebView();
                    }
                } catch (Exception ignored) {}

                if (targetWebView != null) {
                    final WebView webView = targetWebView;
                    webView.evaluateJavascript(
                        "(function() { return (typeof window.handleAndroidBack === 'function') ? window.handleAndroidBack() : false; })();",
                        value -> {
                            if ("true".equals(value) || "\"true\"".equals(value)) {
                                // Handled inside web app
                            } else if (webView.canGoBack()) {
                                webView.goBack();
                            } else {
                                finish();
                            }
                        }
                    );
                } else {
                    finish();
                }
            }
        };

        getOnBackPressedDispatcher().addCallback(this, backPressedCallback);

        // Dispatch navigation bar insets to web app once registered in onCreate
        getWindow().getDecorView().setOnApplyWindowInsetsListener((v, insets) -> {
            int bottomPx = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                bottomPx = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
            } else {
                bottomPx = insets.getSystemWindowInsetBottom();
            }
            float density = getResources().getDisplayMetrics().density;
            final int bottomDp = (int) (bottomPx / (density > 0 ? density : 1.0f));
            v.post(() -> {
                try {
                    WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                    if (wv != null && bottomDp >= 0) {
                        wv.evaluateJavascript(
                            "(function() { if (typeof window.applyNavigationBarInset === 'function') window.applyNavigationBarInset(" + bottomDp + "); })();",
                            null
                        );
                    }
                } catch (Exception ignored) {}
            });
            return insets;
        });

        configureWebViewIfNeeded();
    }

    private boolean isWebViewConfigured = false;

    private void configureWebViewIfNeeded() {
        if (isWebViewConfigured) return;
        try {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;

            // Maintain direct hardware compositor without offscreen buffering
            WebSettings settings = webView.getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            try {
                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(true);
                cookieManager.setAcceptThirdPartyCookies(webView, true);
            } catch (Exception ignored) {}

            String defaultUa = settings.getUserAgentString();
            if (defaultUa != null) {
                String cleanUa = defaultUa.replace("; wv", "").replace("Version/4.0 ", "");
                settings.setUserAgentString(cleanUa);
            }

            webView.addJavascriptInterface(new WebAppInterface(), "AndroidApp");

            webView.setDownloadListener((downloadUrl, userAgent, contentDisposition, mimetype, contentLength) -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception err) {
                    err.printStackTrace();
                }
            });

            isWebViewConfigured = true;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebViewIfNeeded();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }
}
