package com.fobsmedia.tv;

import android.content.Context;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * High-performance, lightweight embedded HTTP server for local video streaming.
 * Binds strictly to 127.0.0.1 (localhost) on port 8989 (or dynamic next port).
 * Provides full HTTP 206 Partial Content (Byte Range) support via RandomAccessFile,
 * allowing instant, zero-latency seeking/scrubbing in HTML5 video with 0 memory overhead.
 */
public class LocalStreamServer {
    private static final String TAG = "LocalStreamServer";
    public static final int DEFAULT_PORT = 8989;

    private final Context context;
    private ServerSocket serverSocket;
    private ExecutorService threadPool;
    private volatile boolean isRunning = false;
    private int activePort = DEFAULT_PORT;

    public LocalStreamServer(Context context) {
        this.context = context.getApplicationContext();
    }

    public synchronized void start() {
        if (isRunning) return;

        threadPool = Executors.newCachedThreadPool();
        isRunning = true;

        new Thread(() -> {
            int port = DEFAULT_PORT;
            int maxAttempts = 10;
            while (isRunning && maxAttempts > 0) {
                try {
                    // Bind strictly to 127.0.0.1 for local app security
                    serverSocket = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"));
                    activePort = port;
                    Log.i(TAG, "LocalStreamServer started successfully on port " + activePort);
                    break;
                } catch (Exception e) {
                    port++;
                    maxAttempts--;
                }
            }

            if (serverSocket == null || !serverSocket.isBound()) {
                Log.e(TAG, "Failed to bind LocalStreamServer to any local port");
                isRunning = false;
                return;
            }

            while (isRunning && !serverSocket.isClosed()) {
                try {
                    Socket clientSocket = serverSocket.accept();
                    clientSocket.setTcpNoDelay(true);
                    clientSocket.setSoTimeout(30000);
                    if (threadPool != null && !threadPool.isShutdown()) {
                        threadPool.execute(() -> handleClient(clientSocket));
                    }
                } catch (SocketException se) {
                    // Server socket closed
                    break;
                } catch (Exception e) {
                    if (isRunning) {
                        Log.w(TAG, "Accept error: " + e.getMessage());
                    }
                }
            }
        }, "LocalStreamServer-Listener").start();
    }

    public synchronized void stop() {
        isRunning = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (Exception ignored) {}

        if (threadPool != null) {
            try {
                threadPool.shutdownNow();
            } catch (Exception ignored) {}
            threadPool = null;
        }
    }

    public int getPort() {
        return activePort;
    }

    public boolean isRunning() {
        return isRunning && serverSocket != null && serverSocket.isBound();
    }

    private void handleClient(Socket socket) {
        try (InputStream in = socket.getInputStream();
             OutputStream out = new BufferedOutputStream(socket.getOutputStream())) {

            BufferedReader reader = new BufferedReader(new InputStreamReader(in));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.trim().isEmpty()) {
                return;
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;

            String method = parts[0].toUpperCase();
            String rawPath = parts[1];

            // Read request headers
            Map<String, String> headers = new HashMap<>();
            String headerLine;
            while ((headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
                int colonIdx = headerLine.indexOf(':');
                if (colonIdx != -1) {
                    String name = headerLine.substring(0, colonIdx).trim().toLowerCase();
                    String val = headerLine.substring(colonIdx + 1).trim();
                    headers.put(name, val);
                }
            }

            // Handle CORS preflight OPTIONS
            if ("OPTIONS".equals(method)) {
                sendCorsHeaders(out, 200, "OK");
                out.write("Content-Length: 0\r\n\r\n".getBytes());
                out.flush();
                return;
            }

            // Health ping
            if ("/ping".equals(rawPath) || "/status".equals(rawPath)) {
                sendCorsHeaders(out, 200, "OK");
                byte[] body = "OK".getBytes();
                out.write(("Content-Type: text/plain\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes());
                out.write(body);
                out.flush();
                return;
            }

            // Parse file request path: e.g. /downloads/{filename}
            String decodedPath = URLDecoder.decode(rawPath, "UTF-8");
            if (decodedPath.contains("?")) {
                decodedPath = decodedPath.substring(0, decodedPath.indexOf("?"));
            }

            File targetFile = resolveTargetFile(decodedPath);
            if (targetFile == null || !targetFile.exists() || !targetFile.isFile()) {
                sendCorsHeaders(out, 404, "Not Found");
                byte[] msg = "File Not Found".getBytes();
                out.write(("Content-Type: text/plain\r\nContent-Length: " + msg.length + "\r\n\r\n").getBytes());
                out.write(msg);
                out.flush();
                return;
            }

            long fileLength = targetFile.length();
            String contentType = getContentType(targetFile.getName());

            // Handle Subtitles (.vtt / .srt)
            if (targetFile.getName().toLowerCase().endsWith(".vtt") || targetFile.getName().toLowerCase().endsWith(".srt")) {
                sendCorsHeaders(out, 200, "OK");
                out.write(("Content-Type: " + contentType + "\r\n").getBytes());
                out.write(("Content-Length: " + fileLength + "\r\n\r\n").getBytes());
                if (!"HEAD".equals(method)) {
                    try (FileInputStream fis = new FileInputStream(targetFile)) {
                        byte[] buf = new byte[8192];
                        int read;
                        while ((read = fis.read(buf)) != -1) {
                            out.write(buf, 0, read);
                        }
                    }
                }
                out.flush();
                return;
            }

            // Handle Video with full Range request support
            String rangeHeader = headers.get("range");
            long start = 0;
            long end = fileLength - 1;
            boolean isPartial = false;

            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String rangeSpec = rangeHeader.substring(6).trim();
                int dashIdx = rangeSpec.indexOf('-');
                if (dashIdx != -1) {
                    try {
                        String startStr = rangeSpec.substring(0, dashIdx).trim();
                        String endStr = rangeSpec.substring(dashIdx + 1).trim();

                        if (!startStr.isEmpty()) {
                            start = Long.parseLong(startStr);
                        }
                        if (!endStr.isEmpty()) {
                            end = Long.parseLong(endStr);
                        }
                        isPartial = true;
                    } catch (NumberFormatException ignored) {}
                }
            }

            if (start > end || start >= fileLength) {
                // 416 Range Not Satisfiable
                sendCorsHeaders(out, 416, "Range Not Satisfiable");
                out.write(("Content-Range: bytes */" + fileLength + "\r\n").getBytes());
                out.write("Content-Length: 0\r\n\r\n".getBytes());
                out.flush();
                return;
            }

            if (end >= fileLength) {
                end = fileLength - 1;
            }

            long contentLength = end - start + 1;

            if (isPartial) {
                sendCorsHeaders(out, 206, "Partial Content");
                out.write(("Content-Range: bytes " + start + "-" + end + "/" + fileLength + "\r\n").getBytes());
            } else {
                sendCorsHeaders(out, 200, "OK");
            }

            out.write(("Content-Type: " + contentType + "\r\n").getBytes());
            out.write(("Content-Length: " + contentLength + "\r\n").getBytes());
            out.write("Accept-Ranges: bytes\r\n".getBytes());
            out.write("Connection: keep-alive\r\n\r\n".getBytes());
            out.flush();

            if ("HEAD".equals(method)) {
                return;
            }

            // Stream byte range via RandomAccessFile with fast 64KB buffer
            try (RandomAccessFile raf = new RandomAccessFile(targetFile, "r")) {
                raf.seek(start);
                byte[] buffer = new byte[65536]; // 64KB chunk buffer
                long bytesRemaining = contentLength;

                while (bytesRemaining > 0 && isRunning) {
                    int toRead = (int) Math.min(buffer.length, bytesRemaining);
                    int bytesRead = raf.read(buffer, 0, toRead);
                    if (bytesRead == -1) break;

                    out.write(buffer, 0, bytesRead);
                    bytesRemaining -= bytesRead;
                }
                out.flush();
            }

        } catch (SocketException se) {
            // Normal client seeking disconnect (browser closed previous range to jump to new position)
        } catch (IOException ioe) {
            // Connection closed by client
        } catch (Exception e) {
            Log.w(TAG, "Request handling error: " + e.getMessage());
        } finally {
            try {
                socket.close();
            } catch (Exception ignored) {}
        }
    }

    private void sendCorsHeaders(OutputStream out, int statusCode, String statusText) throws IOException {
        out.write(("HTTP/1.1 " + statusCode + " " + statusText + "\r\n").getBytes());
        out.write("Access-Control-Allow-Origin: *\r\n".getBytes());
        out.write("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n".getBytes());
        out.write("Access-Control-Allow-Headers: Range, Accept, Origin, Content-Type\r\n".getBytes());
        out.write("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges\r\n".getBytes());
        out.write("Server: FOBS-LocalStream/2.0\r\n".getBytes());
    }

    private File resolveTargetFile(String path) {
        if (path == null) return null;

        // Path formats: /downloads/{filename} or /{filename}
        String filename = path;
        if (filename.startsWith("/downloads/")) {
            filename = filename.substring("/downloads/".length());
        } else if (filename.startsWith("/")) {
            filename = filename.substring(1);
        }

        // Prevent directory traversal
        filename = filename.replace("..", "").replace("/", "").replace("\\", "");
        if (filename.isEmpty()) return null;

        // Check external files dir first
        File externalDir = context.getExternalFilesDir("downloads");
        if (externalDir != null) {
            File f = new File(externalDir, filename);
            if (f.exists()) return f;
        }

        // Check internal files dir fallback
        File internalDir = new File(context.getFilesDir(), "downloads");
        if (internalDir.exists()) {
            File f = new File(internalDir, filename);
            if (f.exists()) return f;
        }

        // Return external target even if not yet created (for existence checks)
        return (externalDir != null) ? new File(externalDir, filename) : new File(internalDir, filename);
    }

    private String getContentType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
        if (lower.endsWith(".mkv")) return "video/x-matroska";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
        if (lower.endsWith(".srt")) return "text/plain; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        return "application/octet-stream";
    }
}

