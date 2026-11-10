package com.fobsmedia.tv;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Download Manager for FOBS TV (MovieBox-Style Private Offline Storage).
 * Downloads videos directly to app-private external storage:
 *   Android/data/com.fobsmedia.tv/files/downloads/
 * with a .nomedia file so phone gallery is never polluted.
 * Supports byte-range resume, background downloading via Foreground Service,
 * and seamless dual subtitle (Bangla & English) storage.
 */
public class NativeDownloadManager {
    private static final String TAG = "NativeDownloadMgr";

    public interface DownloadListener {
        void onProgress(String id, int percent, long downloadedBytes, long totalBytes);
        void onComplete(String id, File file);
        void onError(String id, String error);
        void onPaused(String id);
        void onDeleted(String id);
    }

    private final Context context;
    private final ExecutorService executor;
    private final Handler mainHandler;
    private final Map<String, DownloadWorker> activeWorkers = new ConcurrentHashMap<>();
    private DownloadListener listener;
    private WebView boundWebView;

    public NativeDownloadManager(Context context) {
        this.context = context.getApplicationContext();
        this.executor = Executors.newFixedThreadPool(2); // Download 1-2 streams concurrently
        this.mainHandler = new Handler(Looper.getMainLooper());
        ensureDownloadsDirectory();
    }

    public void setListener(DownloadListener listener) {
        this.listener = listener;
    }

    public void bindWebView(WebView webView) {
        this.boundWebView = webView;
    }

    public File getDownloadsDir() {
        File dir = context.getExternalFilesDir("downloads");
        if (dir == null) {
            dir = new File(context.getFilesDir(), "downloads");
        }
        if (!dir.exists()) {
            dir.mkdirs();
        }
        // Ensure .nomedia exists to hide videos from gallery/Google Photos
        File noMedia = new File(dir, ".nomedia");
        if (!noMedia.exists()) {
            try {
                noMedia.createNewFile();
            } catch (Exception ignored) {}
        }
        return dir;
    }

    private void ensureDownloadsDirectory() {
        getDownloadsDir();
    }

    public boolean isFileReady(String id) {
        if (id == null || id.trim().isEmpty()) return false;
        String cleanId = sanitizeId(id);
        File file = new File(getDownloadsDir(), cleanId + ".mp4");
        return file.exists() && file.isFile() && file.length() > 102400; // >100KB
    }

    public long getFileSize(String id) {
        if (id == null) return 0;
        String cleanId = sanitizeId(id);
        File file = new File(getDownloadsDir(), cleanId + ".mp4");
        if (file.exists()) return file.length();
        File part = new File(getDownloadsDir(), cleanId + ".mp4.part");
        if (part.exists()) return part.length();
        return 0;
    }

    public String getSubtitleContent(String id, String lang) {
        if (id == null) return "";
        String cleanId = sanitizeId(id);
        String subName = cleanId + "." + (lang != null ? lang.toLowerCase() : "bn") + ".vtt";
        File subFile = new File(getDownloadsDir(), subName);
        if (!subFile.exists()) {
            subName = cleanId + "." + (lang != null ? lang.toLowerCase() : "bn") + ".srt";
            subFile = new File(getDownloadsDir(), subName);
        }
        if (!subFile.exists() || !subFile.isFile()) return "";

        try (FileInputStream fis = new FileInputStream(subFile);
             BufferedReader reader = new BufferedReader(new InputStreamReader(fis, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            Log.w(TAG, "Error reading subtitle: " + e.getMessage());
            return "";
        }
    }

    public boolean saveSubtitle(String id, String lang, String vttText) {
        if (id == null || vttText == null || vttText.trim().isEmpty()) return false;
        String cleanId = sanitizeId(id);
        String subName = cleanId + "." + (lang != null ? lang.toLowerCase() : "bn") + ".vtt";
        File subFile = new File(getDownloadsDir(), subName);
        try (FileOutputStream fos = new FileOutputStream(subFile)) {
            fos.write(vttText.getBytes(StandardCharsets.UTF_8));
            fos.flush();
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Error saving subtitle: " + e.getMessage());
            return false;
        }
    }

    public void startDownload(String id, String url, String title, String poster, String quality,
                              int season, int episode, boolean isSeries, String bnSubUrl,
                              String enSubUrl, String metaJson) {
        if (id == null || url == null || url.trim().isEmpty()) return;
        String cleanId = sanitizeId(id);

        if (isFileReady(cleanId)) {
            notifyComplete(cleanId, new File(getDownloadsDir(), cleanId + ".mp4"));
            return;
        }

        DownloadWorker existing = activeWorkers.get(cleanId);
        if (existing != null && existing.isRunning()) {
            Log.i(TAG, "Download worker already active for: " + cleanId);
            return;
        }

        // Save metadata JSON
        saveMetadata(cleanId, title, poster, quality, season, episode, isSeries, url, metaJson);

        DownloadWorker worker = new DownloadWorker(cleanId, url, title, poster, quality,
                season, episode, isSeries, bnSubUrl, enSubUrl);
        activeWorkers.put(cleanId, worker);
        executor.execute(worker);
    }

    public void pauseDownload(String id) {
        if (id == null) return;
        String cleanId = sanitizeId(id);
        DownloadWorker worker = activeWorkers.remove(cleanId);
        if (worker != null) {
            worker.pause();
        }
        notifyPaused(cleanId);
    }

    public void resumeDownload(String id) {
        if (id == null) return;
        String cleanId = sanitizeId(id);
        if (isFileReady(cleanId)) {
            notifyComplete(cleanId, new File(getDownloadsDir(), cleanId + ".mp4"));
            return;
        }

        JSONObject meta = loadMetadata(cleanId);
        if (meta != null) {
            String url = meta.optString("url");
            String title = meta.optString("title");
            String poster = meta.optString("poster");
            String quality = meta.optString("quality", "480P");
            int season = meta.optInt("season", 0);
            int episode = meta.optInt("episode", 0);
            boolean isSeries = meta.optBoolean("isSeries", false);
            String bnSub = meta.optString("bnSubUrl", "");
            String enSub = meta.optString("enSubUrl", "");
            startDownload(cleanId, url, title, poster, quality, season, episode, isSeries, bnSub, enSub, meta.toString());
        }
    }

    public void deleteDownload(String id) {
        if (id == null) return;
        String cleanId = sanitizeId(id);
        pauseDownload(cleanId);

        File dir = getDownloadsDir();
        new File(dir, cleanId + ".mp4").delete();
        new File(dir, cleanId + ".mp4.part").delete();
        new File(dir, cleanId + ".bn.vtt").delete();
        new File(dir, cleanId + ".en.vtt").delete();
        new File(dir, cleanId + ".json").delete();

        notifyDeleted(cleanId);
    }

    public String listDownloadsJson() {
        JSONArray array = new JSONArray();
        File dir = getDownloadsDir();
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isFile() && f.getName().endsWith(".json")) {
                    String cleanId = f.getName().replace(".json", "");
                    JSONObject meta = loadMetadata(cleanId);
                    if (meta != null) {
                        boolean ready = isFileReady(cleanId);
                        try {
                            meta.put("isReady", ready);
                            meta.put("fileSizeBytes", getFileSize(cleanId));
                            meta.put("hasBnSub", new File(dir, cleanId + ".bn.vtt").exists());
                            meta.put("hasEnSub", new File(dir, cleanId + ".en.vtt").exists());
                        } catch (Exception ignored) {}
                        array.put(meta);
                    }
                }
            }
        }
        return array.toString();
    }

    public boolean hasActiveDownloads() {
        for (DownloadWorker worker : activeWorkers.values()) {
            if (worker != null && worker.isRunning()) {
                return true;
            }
        }
        return false;
    }

    private void saveMetadata(String id, String title, String poster, String quality,
                              int season, int episode, boolean isSeries, String url, String metaJson) {
        try {
            JSONObject json;
            if (metaJson != null && !metaJson.trim().isEmpty()) {
                try {
                    json = new JSONObject(metaJson);
                } catch (Exception e) {
                    json = new JSONObject();
                }
            } else {
                json = new JSONObject();
            }
            json.put("id", id);
            json.put("title", title);
            json.put("poster", poster);
            json.put("quality", quality);
            json.put("season", season);
            json.put("episode", episode);
            json.put("isSeries", isSeries);
            json.put("url", url);
            json.put("savedAt", System.currentTimeMillis());

            File metaFile = new File(getDownloadsDir(), id + ".json");
            try (FileOutputStream fos = new FileOutputStream(metaFile)) {
                fos.write(json.toString().getBytes(StandardCharsets.UTF_8));
                fos.flush();
            }
        } catch (Exception e) {
            Log.w(TAG, "Error saving meta: " + e.getMessage());
        }
    }

    private JSONObject loadMetadata(String id) {
        File metaFile = new File(getDownloadsDir(), id + ".json");
        if (!metaFile.exists() || !metaFile.isFile()) return null;
        try (FileInputStream fis = new FileInputStream(metaFile);
             BufferedReader reader = new BufferedReader(new InputStreamReader(fis, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private String sanitizeId(String raw) {
        return raw.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    // Callbacks to Java listener and JavaScript WebView
    private void notifyProgress(String id, int percent, long downloadedBytes, long totalBytes) {
        DownloadForegroundService.updateNotificationProgress(context, "FOBS TV Download", percent);
        mainHandler.post(() -> {
            if (listener != null) {
                listener.onProgress(id, percent, downloadedBytes, totalBytes);
            }
            if (boundWebView != null) {
                String js = "if (typeof window.onNativeDownloadProgress === 'function') { " +
                        "window.onNativeDownloadProgress('" + id + "', " + percent + ", " + downloadedBytes + ", " + totalBytes + "); }";
                boundWebView.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyComplete(String id, File file) {
        DownloadForegroundService.updateNotificationProgress(context, "FOBS TV Download", 100);
        mainHandler.post(() -> {
            if (listener != null) {
                listener.onComplete(id, file);
            }
            if (boundWebView != null) {
                String js = "if (typeof window.onNativeDownloadComplete === 'function') { " +
                        "window.onNativeDownloadComplete('" + id + "'); }";
                boundWebView.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyError(String id, String error) {
        mainHandler.post(() -> {
            if (listener != null) {
                listener.onError(id, error);
            }
            if (boundWebView != null) {
                String js = "if (typeof window.onNativeDownloadError === 'function') { " +
                        "window.onNativeDownloadError('" + id + "', '" + error.replace("'", "\\'") + "'); }";
                boundWebView.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyPaused(String id) {
        mainHandler.post(() -> {
            if (listener != null) {
                listener.onPaused(id);
            }
            if (boundWebView != null) {
                String js = "if (typeof window.onNativeDownloadPaused === 'function') { " +
                        "window.onNativeDownloadPaused('" + id + "'); }";
                boundWebView.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyDeleted(String id) {
        mainHandler.post(() -> {
            if (listener != null) {
                listener.onDeleted(id);
            }
            if (boundWebView != null) {
                String js = "if (typeof window.onNativeDownloadDeleted === 'function') { " +
                        "window.onNativeDownloadDeleted('" + id + "'); }";
                boundWebView.evaluateJavascript(js, null);
            }
        });
    }

    /**
     * Background Download Worker handling HTTP streaming and byte-range resuming.
     */
    private class DownloadWorker implements Runnable {
        private final String id;
        private final String downloadUrl;
        private final String title;
        private final String poster;
        private final String quality;
        private final int season;
        private final int episode;
        private final boolean isSeries;
        private final String bnSubUrl;
        private final String enSubUrl;

        private volatile boolean isPaused = false;
        private volatile boolean isRunning = false;

        public DownloadWorker(String id, String downloadUrl, String title, String poster,
                              String quality, int season, int episode, boolean isSeries,
                              String bnSubUrl, String enSubUrl) {
            this.id = id;
            this.downloadUrl = downloadUrl;
            this.title = title;
            this.poster = poster;
            this.quality = quality;
            this.season = season;
            this.episode = episode;
            this.isSeries = isSeries;
            this.bnSubUrl = bnSubUrl;
            this.enSubUrl = enSubUrl;
        }

        public boolean isRunning() {
            return isRunning;
        }

        public void pause() {
            isPaused = true;
            isRunning = false;
        }

        @Override
        public void run() {
            isRunning = true;
            isPaused = false;

            File dir = getDownloadsDir();
            File targetFile = new File(dir, id + ".mp4");
            File partFile = new File(dir, id + ".mp4.part");

            RandomAccessFile raf = null;
            InputStream in = null;
            HttpURLConnection conn = null;

            try {
                long existingBytes = partFile.exists() ? partFile.length() : 0;

                URL targetUrl = new URL(downloadUrl);
                conn = openConnectionWithRedirects(targetUrl, existingBytes);

                int responseCode = conn.getResponseCode();
                boolean isPartial = (responseCode == 206);

                if (responseCode == 416) {
                    // Range not satisfiable -> restart from byte 0
                    partFile.delete();
                    existingBytes = 0;
                    conn.disconnect();
                    conn = openConnectionWithRedirects(targetUrl, 0);
                    responseCode = conn.getResponseCode();
                    isPartial = (responseCode == 206);
                }

                if (responseCode != 200 && responseCode != 206) {
                    throw new Exception("HTTP error status: " + responseCode);
                }

                if (responseCode == 200 && existingBytes > 0) {
                    // Server sent full file from 0 -> reset part file
                    partFile.delete();
                    existingBytes = 0;
                }

                long totalBytes = 0;
                String contentRange = conn.getHeaderField("Content-Range");
                if (contentRange != null && contentRange.contains("/")) {
                    try {
                        String totalStr = contentRange.substring(contentRange.lastIndexOf('/') + 1).trim();
                        totalBytes = Long.parseLong(totalStr);
                    } catch (Exception ignored) {}
                }

                if (totalBytes <= 0) {
                    long len = conn.getContentLengthLong();
                    totalBytes = len > 0 ? (existingBytes + len) : 0;
                }

                raf = new RandomAccessFile(partFile, "rw");
                raf.seek(existingBytes);

                in = conn.getInputStream();
                byte[] buffer = new byte[65536]; // 64KB buffer
                long downloaded = existingBytes;
                long lastProgressTime = 0;
                int lastPercent = -1;

                int read;
                while (isRunning && !isPaused && (read = in.read(buffer)) != -1) {
                    raf.write(buffer, 0, read);
                    downloaded += read;

                    long now = System.currentTimeMillis();
                    if (now - lastProgressTime > 400) {
                        lastProgressTime = now;
                        int percent = (totalBytes > 0) ? (int) Math.min(99, (downloaded * 100L) / totalBytes) : 1;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            notifyProgress(id, percent, downloaded, totalBytes);
                        }
                    }
                }

                if (isPaused) {
                    notifyPaused(id);
                    return;
                }

                // Verify download completion
                if (totalBytes > 0 && downloaded < (totalBytes * 0.98)) {
                    throw new Exception("Incomplete download: received " + downloaded + " of " + totalBytes + " bytes");
                }
                if (downloaded < 102400) {
                    throw new Exception("File too small (" + downloaded + " bytes)");
                }

                // Close files before rename
                raf.close();
                raf = null;

                if (partFile.renameTo(targetFile)) {
                    // Download Subtitles in background
                    fetchAndSaveSubtitles(id, bnSubUrl, enSubUrl);

                    notifyProgress(id, 100, downloaded, downloaded);
                    notifyComplete(id, targetFile);
                } else {
                    throw new Exception("Failed to rename .part file to .mp4");
                }

            } catch (Exception e) {
                if (!isPaused) {
                    Log.e(TAG, "Download error for " + id + ": " + e.getMessage());
                    notifyError(id, e.getMessage() != null ? e.getMessage() : "Network error");
                }
            } finally {
                isRunning = false;
                activeWorkers.remove(id);
                try {
                    if (raf != null) raf.close();
                } catch (Exception ignored) {}
                try {
                    if (in != null) in.close();
                } catch (Exception ignored) {}
                try {
                    if (conn != null) conn.disconnect();
                } catch (Exception ignored) {}
            }
        }

        private HttpURLConnection openConnectionWithRedirects(URL url, long existingBytes) throws Exception {
            HttpURLConnection conn = null;
            URL curUrl = url;
            int redirects = 0;

            while (redirects < 6) {
                conn = (HttpURLConnection) curUrl.openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
                conn.setRequestProperty("Accept", "video/mp4, video/*;q=0.9, */*;q=0.8");

                if (existingBytes > 0) {
                    conn.setRequestProperty("Range", "bytes=" + existingBytes + "-");
                }

                conn.connect();
                int status = conn.getResponseCode();

                if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == 307 || status == 308) {
                    String location = conn.getHeaderField("Location");
                    if (location != null && !location.isEmpty()) {
                        conn.disconnect();
                        curUrl = new URL(curUrl, location);
                        redirects++;
                        continue;
                    }
                }
                return conn;
            }
            throw new Exception("Too many redirects");
        }

        private void fetchAndSaveSubtitles(String id, String bnUrl, String enUrl) {
            if (bnUrl != null && !bnUrl.trim().isEmpty()) {
                downloadTextFile(bnUrl, new File(getDownloadsDir(), id + ".bn.vtt"));
            }
            if (enUrl != null && !enUrl.trim().isEmpty()) {
                downloadTextFile(enUrl, new File(getDownloadsDir(), id + ".en.vtt"));
            }
        }

        private void downloadTextFile(String urlStr, File destFile) {
            try {
                URL u = new URL(urlStr);
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                c.setRequestProperty("User-Agent", "FOBS-TV-SubDownloader");
                c.connect();
                if (c.getResponseCode() == 200) {
                    try (InputStream is = c.getInputStream();
                         FileOutputStream fos = new FileOutputStream(destFile)) {
                        byte[] buf = new byte[4096];
                        int r;
                        while ((r = is.read(buf)) != -1) {
                            fos.write(buf, 0, r);
                        }
                        fos.flush();
                    }
                }
                c.disconnect();
            } catch (Exception ignored) {}
        }
    }
}
