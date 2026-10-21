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
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

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

                // Add Javascript interface for landscape/portrait orientation control & immersive fullscreen
                webView.addJavascriptInterface(new WebAppInterface(), "AndroidApp");

                // Set our custom WebChromeClient for true native HTML5 video fullscreen support
                if (customChromeClient == null) {
                    customChromeClient = new FullscreenWebChromeClient(getBridge());
                }
                webView.setWebChromeClient(customChromeClient);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
