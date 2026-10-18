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

/**
 * Toont het spel (assets/www) schermvullend in een WebView.
 * Op een Boox start het spel meteen in e-inkweergave.
 */
public class MainActivity extends Activity {

    private static final String START = "file:///android_asset/www/index.html";
    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;

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
