package com.fobsmedia.tv;

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
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams lp = window.getAttributes();
                        // Real hardware screen backlight brightness (0.01f to 1.0f) for current player window
                        float safeBrightness = Math.max(0.01f, Math.min(1.0f, brightness));
                        lp.screenBrightness = safeBrightness;
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
        public int getAppVersionCode() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            } catch (Exception e) {
                return 12;
            }
        }

        @JavascriptInterface
        public String getAppVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "3.1.4";
            }
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

        @JavascriptInterface
        public void openBrowser(String targetUrl) {
            runOnUiThread(() -> {
                try {
                    String url = (targetUrl != null && !targetUrl.trim().isEmpty()) ? targetUrl : "https://fobs-apk-download.vercel.app/";
                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(browserIntent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void openUpdatePage(String url) {
            openBrowser(url);
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
            webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

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
