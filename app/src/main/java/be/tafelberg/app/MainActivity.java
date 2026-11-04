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
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
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
        int background = eink ? Color.WHITE : Color.rgb(0xEA, 0xF2, 0xF8);
        configureSystemBars(background);
        FrameLayout content = new FrameLayout(this);
        content.setBackgroundColor(background);
        installSafeInsets(content);
        web = new WebView(this);
        web.setBackgroundColor(background);
        content.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(content);
        content.requestApplyInsets();

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

    /** Ook bij verplichte edge-to-edge (Android 15+) blijven de systeembalken zichtbaar. */
    @SuppressWarnings("deprecation")
    private void configureSystemBars(int background) {
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Build.VERSION.SDK_INT >= 23 ? background : Color.rgb(0x1F, 0x2A, 0x44));
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? background : Color.rgb(0x1F, 0x2A, 0x44));
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.show(WindowInsets.Type.systemBars());
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light, light);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (Build.VERSION.SDK_INT >= 23) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    /** Eén native eigenaar voor de veilige ruimte; de WebView krijgt alleen het bruikbare vlak. */
    @SuppressWarnings("deprecation")
    static void installSafeInsets(View content) {
        content.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                int left, top, right, bottom;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                            | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    android.graphics.Insets stable = insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars());
                    left = Math.max(safe.left, stable.left); top = Math.max(safe.top, stable.top);
                    right = Math.max(safe.right, stable.right); bottom = Math.max(safe.bottom, stable.bottom);
                } else {
                    left = Math.max(insets.getSystemWindowInsetLeft(), insets.getStableInsetLeft());
                    top = Math.max(insets.getSystemWindowInsetTop(), insets.getStableInsetTop());
                    right = Math.max(insets.getSystemWindowInsetRight(), insets.getStableInsetRight());
                    bottom = Math.max(insets.getSystemWindowInsetBottom(), insets.getStableInsetBottom());
                    if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                        left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                        top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                        right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                        bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
                    }
                }
                // Absolute maten, niet optellen: herhaalde dispatches mogen geen extra rand geven.
                view.setPadding(left, top, right, bottom);
                if (Build.VERSION.SDK_INT >= 30) return WindowInsets.CONSUMED;
                WindowInsets consumed = insets.consumeSystemWindowInsets().consumeStableInsets();
                return Build.VERSION.SDK_INT >= 28 ? consumed.consumeDisplayCutout() : consumed;
            }
        });
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

    /** Alleen het meegeleverde Supabase-functieadres mag verzoeken ontvangen.
     * Externe WebView-navigatie en universele file://-toegang blijven geblokkeerd. */
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
            if (body == null || body.length() > 120000 || endpoint.isEmpty() || !endpoint.equals(url)
                || !endpoint.matches("https://[a-z0-9-]+\\.supabase\\.co/functions/v1/tafelberg")) {
                reply(id, "{\"ok\":false,\"message\":\"Online bewaren is niet beschikbaar.\"}"); return;
            }
            if (syncExecutor.isShutdown()) return;
            syncExecutor.execute(new Runnable() {
                @Override public void run() {
                    String result;
                    try {
                        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
                        try {
                            conn.setConnectTimeout(15000); conn.setReadTimeout(25000);
                            conn.setInstanceFollowRedirects(false); conn.setRequestMethod("POST");
                            conn.setDoOutput(true); conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                            conn.setFixedLengthStreamingMode(bytes.length);
                            try (java.io.OutputStream out = conn.getOutputStream()) { out.write(bytes); }
                            int status = conn.getResponseCode();
                            if (status >= 300 && status < 400) throw new IllegalStateException("Omleiding geweigerd");
                            InputStream response = status < 400 ? conn.getInputStream() : conn.getErrorStream();
                            if (response == null) throw new IllegalStateException("Geen antwoord");
                            StringBuilder text = new StringBuilder();
                            try (BufferedReader reader = new BufferedReader(new InputStreamReader(response, StandardCharsets.UTF_8))) {
                                char[] part = new char[4096]; int length;
                                while ((length = reader.read(part)) != -1) {
                                    text.append(part, 0, length);
                                    if (text.length() > 200000) throw new IllegalStateException("Antwoord te groot");
                                }
                            }
                            result = new JSONObject(text.toString()).toString();
                        } finally { conn.disconnect(); }
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
