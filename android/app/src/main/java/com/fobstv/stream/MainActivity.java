package com.fobstv.stream;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
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
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Environment;
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

    private class FullscreenWebChromeClient extends BridgeWebChromeClient {
        public FullscreenWebChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (callback != null) {
                try {
                    callback.onCustomViewHidden();
                } catch (Exception ignored) {}
            }

            runOnUiThread(() -> {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                hideSystemUI();
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() { if (typeof window.enterFullscreenMode === 'function') window.enterFullscreenMode({ skipRotate: true }); })();",
                        null
                    );
                }
            });
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

    private static class LimitedInputStream extends java.io.InputStream {
        private final java.io.InputStream in;
        private final long limit;
        private long bytesRead = 0;

        public LimitedInputStream(java.io.InputStream in, long limit) {
            this.in = in;
            this.limit = limit;
        }

        @Override
        public int read() throws java.io.IOException {
            if (limit >= 0 && bytesRead >= limit) {
                return -1;
            }
            int result = in.read();
            if (result != -1) {
                bytesRead++;
            }
            return result;
        }

        @Override
        public int read(byte[] b, int off, int len) throws java.io.IOException {
            if (limit >= 0 && bytesRead >= limit) {
                return -1;
            }
            if (limit >= 0 && bytesRead + len > limit) {
                len = (int) (limit - bytesRead);
            }
            if (len <= 0) {
                return -1;
            }
            int count = in.read(b, off, len);
            if (count > 0) {
                bytesRead += count;
            }
            return count;
        }

        @Override
        public long skip(long n) throws java.io.IOException {
            if (n <= 0) return 0;
            long toSkip = n;
            if (limit >= 0 && bytesRead + toSkip > limit) {
                toSkip = limit - bytesRead;
            }
            if (toSkip <= 0) return 0;
            long actual = in.skip(toSkip);
            if (actual > 0) {
                bytesRead += actual;
            }
            return actual;
        }

        @Override
        public int available() throws java.io.IOException {
            if (limit >= 0 && bytesRead >= limit) {
                return 0;
            }
            int avail = in.available();
            if (limit >= 0) {
                long remaining = limit - bytesRead;
                return (int) Math.min(avail, Math.max(0, remaining));
            }
            return avail;
        }

        @Override
        public void close() throws java.io.IOException {
            in.close();
        }
    }

    private class CustomBridgeWebViewClient extends BridgeWebViewClient {
        public CustomBridgeWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                String host = request.getUrl().getHost();
                if (host != null && (
                    host.contains("hakunaymatata.com") || 
                    host.contains("bcdnxw") || 
                    host.contains("haildrop") || 
                    host.contains("fogtwist") || 
                    host.contains("sunburst") || 
                    host.contains("stormshade")
                )) {
                    try {
                        URL currentUrl = new URL(request.getUrl().toString());
                        HttpURLConnection conn = null;
                        int redirects = 0;
                        int statusCode = 200;

                        while (redirects < 5) {
                            conn = (HttpURLConnection) currentUrl.openConnection();
                            conn.setInstanceFollowRedirects(false);
                            conn.setRequestMethod(request.getMethod());
                            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
                            conn.setRequestProperty("Referer", "https://movieboxapp.in/");

                            Map<String, String> reqHeaders = request.getRequestHeaders();
                            if (reqHeaders != null) {
                                for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                    String k = entry.getKey();
                                    if (k != null && !"Referer".equalsIgnoreCase(k) && !"User-Agent".equalsIgnoreCase(k) && !"Host".equalsIgnoreCase(k)) {
                                        conn.setRequestProperty(k, entry.getValue());
                                    }
                                }
                            }

                            conn.setConnectTimeout(12000);
                            conn.setReadTimeout(18000);
                            conn.connect();

                            statusCode = conn.getResponseCode();
                            if (statusCode == 301 || statusCode == 302 || statusCode == 303 || statusCode == 307 || statusCode == 308) {
                                String location = conn.getHeaderField("Location");
                                if (location != null && !location.trim().isEmpty()) {
                                    currentUrl = new URL(currentUrl, location);
                                    conn.disconnect();
                                    redirects++;
                                    continue;
                                }
                            }
                            break;
                        }

                        if (conn == null) {
                            return super.shouldInterceptRequest(view, request);
                        }

                        String reason = conn.getResponseMessage();
                        if (reason == null || reason.trim().isEmpty()) {
                            reason = (statusCode == 206) ? "Partial Content" : "OK";
                        }

                        long contentLength = -1;
                        String clStr = conn.getHeaderField("Content-Length");
                        if (clStr != null) {
                            try {
                                contentLength = Long.parseLong(clStr.trim());
                            } catch (Exception ignored) {}
                        }

                        // Collect and sanitize response headers, strictly avoiding duplicate keys (which crash Chromium media pipeline)
                        Map<String, String> resHeaders = new HashMap<>();
                        for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                            String key = header.getKey();
                            if (key != null && !header.getValue().isEmpty()) {
                                String lk = key.toLowerCase();
                                // Exclude hop-by-hop and headers we will explicitly canonicalize
                                if (lk.equals("connection") || lk.equals("keep-alive") || lk.equals("transfer-encoding") ||
                                    lk.equals("content-length") || lk.equals("content-range") || lk.equals("accept-ranges") ||
                                    lk.startsWith("access-control-")) {
                                    continue;
                                }
                                resHeaders.put(key, header.getValue().get(0));
                            }
                        }

                        // Add standardized CORS and Range headers
                        resHeaders.put("Access-Control-Allow-Origin", "*");
                        resHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        resHeaders.put("Access-Control-Allow-Headers", "*");
                        resHeaders.put("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
                        resHeaders.put("Accept-Ranges", "bytes");

                        String contentRange = conn.getHeaderField("Content-Range");
                        if (contentRange != null && !contentRange.trim().isEmpty()) {
                            resHeaders.put("Content-Range", contentRange);
                        }
                        if (clStr != null && !clStr.trim().isEmpty()) {
                            resHeaders.put("Content-Length", clStr);
                        }

                        String mimeType = conn.getContentType();
                        if (mimeType == null || mimeType.contains("octet-stream") || mimeType.trim().isEmpty()) {
                            mimeType = "video/mp4";
                        } else if (mimeType.contains(";")) {
                            mimeType = mimeType.split(";")[0].trim();
                        }

                        InputStream is = (statusCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
                        if (contentLength > 0 && statusCode == 206) {
                            is = new LimitedInputStream(new java.io.BufferedInputStream(is, 65536), contentLength);
                        } else {
                            is = new java.io.BufferedInputStream(is, 65536);
                        }
                        return new WebResourceResponse(mimeType, null, statusCode, reason, resHeaders, is);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }
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
        public void setWindowBrightness(float brightness) {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    if (window != null) {
                        WindowManager.LayoutParams lp = window.getAttributes();
                        if (brightness < 0) {
                            lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                        } else {
                            lp.screenBrightness = Math.max(0.01f, Math.min(1.0f, brightness));
                        }
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
        public void setAudioBoost(int boostPercent) {
            runOnUiThread(() -> {
                try {
                    AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                    if (am != null) {
                        int maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                        // Scale 0 to 100% cleanly across hardware steps; >=100% sets to maxVol
                        int vol = Math.max(0, Math.min(maxVol, Math.round((Math.min(100, boostPercent) / 100.0f) * maxVol)));
                        am.setStreamVolume(AudioManager.STREAM_MUSIC, vol, 0);
                    }
                } catch (Exception ignored) {}
            });
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
    }

    private File pendingInstallApk = null;

    @Override
    public void onResume() {
        super.onResume();
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
        super.onCreate(savedInstanceState);
        
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
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Force hardware layer on WebView for video rendering on Samsung/Galaxy devices
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);

                // Set standard mobile Chrome User-Agent to avoid WebView bot/embed blocks on video CDNs
                String defaultUa = settings.getUserAgentString();
                if (defaultUa != null) {
                    String cleanUa = defaultUa.replace("; wv", "").replace("Version/4.0 ", "");
                    settings.setUserAgentString(cleanUa);
                }

                // Add Javascript interface for landscape/portrait orientation control & immersive fullscreen
                webView.addJavascriptInterface(new WebAppInterface(), "AndroidApp");

                // Set our custom WebChromeClient for true native HTML5 video fullscreen support
                if (customChromeClient == null) {
                    customChromeClient = new FullscreenWebChromeClient(getBridge());
                }
                webView.setWebChromeClient(customChromeClient);

                // Set our custom BridgeWebViewClient to intercept MovieBox streams with required Referer header
                webView.setWebViewClient(new CustomBridgeWebViewClient(getBridge()));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
    }
}
