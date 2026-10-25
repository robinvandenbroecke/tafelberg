package be.tafelberg.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;
import java.net.URL;
import java.net.HttpURLConnection;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import org.json.JSONObject;

/**
 * Toont het spel (assets/www) schermvullend in een WebView.
 * Op een Boox start het spel meteen in e-inkweergave.
 */
public class MainActivity extends Activity {

    private static final String START = "file:///android_asset/www/index.html";
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private final ExecutorService syncExecutor = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        boolean eink = isEinkDevice();
        web = new WebView(this);
        web.setBackgroundColor(eink ? Color.WHITE : Color.rgb(0xEA, 0xF2, 0xF8));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(true); // lettertypen uit de eigen assets
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                return true;
            }
        });

        web.addJavascriptInterface(new Store(getSharedPreferences("tafelberg", MODE_PRIVATE)), "AndroidStore");
        startSpeech();
        web.addJavascriptInterface(new Speech(), "AndroidSpeech");
        web.addJavascriptInterface(new Sync(), "AndroidSync");
        web.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Het spel blijft binnen zijn eigen bestanden.
                return url == null || !url.startsWith("file:///android_asset/");
            }
        });

        web.loadUrl(eink ? START + "?eink=1" : START);
    }

    /** Spraak voor Mo: Vlaams als dat kan, anders Nederlands, anders zwijgt Mo. */
    private void startSpeech() {
        try {
            tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (status != TextToSpeech.SUCCESS || tts == null) return;
                    int r = tts.setLanguage(new Locale("nl", "BE"));
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                        r = tts.setLanguage(new Locale("nl", "NL"));
                    }
                    ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
                    if (ttsReady) tts.setSpeechRate(0.95f);
                }
            });
        } catch (RuntimeException e) {
            tts = null;
        }
    }

    private static boolean isEinkDevice() {
        String id = (Build.MANUFACTURER + " " + Build.BRAND + " " + Build.MODEL).toLowerCase(Locale.ROOT);
        return id.contains("onyx") || id.contains("boox");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** De terugknop gaat eerst terug binnen het spel; pas op het startscherm sluit de app. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.tbBack && window.tbBack()) ? 'ja' : 'nee'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("ja")) {
                    MainActivity.super.onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onPause() {
        if (tts != null) tts.stop();
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        syncExecutor.shutdownNow();
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Laat het spel Mo's zinnen voorlezen. Oproepen komen van een andere thread. */
    final class Speech {
        @JavascriptInterface
        public void speak(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (tts != null && ttsReady && text != null) {
                        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mo");
                    }
                }
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (tts != null) tts.stop();
                }
            });
        }

        @JavascriptInterface
        public boolean ready() {
            return ttsReady;
        }
    }

    /** Alleen de meegeleverde Apps Script-dienst kan voortgang ontvangen.
     * Geen externe iframe of ruimere file://-toegang nodig. */
    final class Sync {
        private final String endpoint;
        Sync() {
            String result = "";
            try (InputStream in = getAssets().open("www/js/cloud-config.js")) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder source = new StringBuilder(); String line;
                while ((line = reader.readLine()) != null) source.append(line);
                Matcher match = Pattern.compile("TB_CLOUD_URL\\s*=\\s*'([^']*)'").matcher(source.toString());
                if (match.find()) result = match.group(1);
            } catch (Exception ignored) { }
            endpoint = result;
        }
        @JavascriptInterface
        public void request(final String url, final String id, final String body) {
            if (id == null || !id.matches("r[0-9]{1,12}")) return;
            if (body == null || body.length() > 100000 || endpoint.isEmpty() || !endpoint.equals(url)) {
                reply(id, "{\"ok\":false,\"message\":\"Online bewaren is niet beschikbaar.\"}"); return;
            }
            if (syncExecutor.isShutdown()) return;
            syncExecutor.execute(new Runnable() {
                @Override public void run() {
                    String result;
                    try {
                        URL current = new URL(endpoint); String method = "POST";
                        result = null;
                        for (int hop = 0; hop < 6; hop++) {
                            String host = current.getHost();
                            if (!"https".equals(current.getProtocol()) || current.getUserInfo() != null
                                || (current.getPort() != -1 && current.getPort() != 443)
                                || !("script.google.com".equals(host) || "script.googleusercontent.com".equals(host))) {
                                throw new IllegalStateException("Onverwachte server");
                            }
                            HttpURLConnection conn = (HttpURLConnection) current.openConnection();
                            try {
                                conn.setConnectTimeout(15000); conn.setReadTimeout(45000);
                                conn.setInstanceFollowRedirects(false); conn.setRequestMethod(method);
                                if ("POST".equals(method)) {
                                    conn.setDoOutput(true); conn.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
                                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                                    conn.setFixedLengthStreamingMode(bytes.length);
                                    try (java.io.OutputStream out = conn.getOutputStream()) { out.write(bytes); }
                                }
                                int status = conn.getResponseCode();
                                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                                    current = new URL(current, conn.getHeaderField("Location"));
                                    if (status == 301 || status == 302 || status == 303) method = "GET";
                                    continue;
                                }
                                if (status != 200) throw new IllegalStateException("Niet beschikbaar");
                                StringBuilder text = new StringBuilder();
                                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                                    char[] part = new char[4096]; int length;
                                    while ((length = reader.read(part)) != -1) {
                                        text.append(part, 0, length);
                                        if (text.length() > 200000) throw new IllegalStateException("Antwoord te groot");
                                    }
                                }
                                result = new JSONObject(text.toString()).toString(); break;
                            } finally { conn.disconnect(); }
                        }
                        if (result == null) throw new IllegalStateException("Te veel omleidingen");
                    } catch (Exception ignored) {
                        result = "{\"ok\":false,\"message\":\"Geen verbinding. Je voortgang blijft op dit toestel.\"}";
                    }
                    reply(id, result);
                }
            });
        }
        private void reply(final String id, final String json) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (web != null) web.evaluateJavascript("window.TBCloud && window.TBCloud.nativeReply("
                        + JSONObject.quote(id) + "," + json + ");", null);
                }
            });
        }
    }

    /** Bewaart de voortgang ook buiten de WebView, in de gewone app-instellingen. */
    static final class Store {
        private final SharedPreferences prefs;

        Store(SharedPreferences prefs) {
            this.prefs = prefs;
        }

        @JavascriptInterface
        public String get() {
            return prefs.getString("state", null);
        }

        @JavascriptInterface
        public void set(String json) {
            prefs.edit().putString("state", json).apply();
        }
    }
}
