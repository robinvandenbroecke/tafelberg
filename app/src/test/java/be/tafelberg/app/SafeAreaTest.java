package be.tafelberg.app;

import android.graphics.Insets;
import android.graphics.Rect;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;

import static org.junit.Assert.*;

/** Dispatch echte platform-insets naar de Activity, inclusief de oude WebView-route. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {21, 28, 35})
public class SafeAreaTest {
    private ActivityController<MainActivity> controller;
    private MainActivity activity;
    private FrameLayout content;
    private WebView web;

    @Before public void start() {
        controller = Robolectric.buildActivity(MainActivity.class).setup();
        activity = controller.get();
        content = (FrameLayout) ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
        web = (WebView) content.getChildAt(0);
    }

    @After public void stop() { controller.pause().stop().destroy(); }

    @SuppressWarnings("deprecation")
    private WindowInsets bars(int left, int top, int right, int bottom) {
        if (Build.VERSION.SDK_INT >= 30) {
            return new WindowInsets.Builder()
                    .setInsets(WindowInsets.Type.systemBars(), Insets.of(left, top, right, bottom))
                    .setVisible(WindowInsets.Type.systemBars(), true).build();
        }
        // De oude platformconstructor staat niet in de openbare compile-SDK 35.
        return ReflectionHelpers.callConstructor(WindowInsets.class,
                ReflectionHelpers.ClassParameter.from(Rect.class, new Rect(left, top, right, bottom)));
    }

    private void layout(int width, int height) {
        content.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        content.layout(0, 0, width, height);
    }

    @Test public void threeButtonNavigationIsOutsideWebViewWithoutDoublePadding() {
        content.dispatchApplyWindowInsets(bars(0, 24, 0, 48));
        content.dispatchApplyWindowInsets(bars(0, 24, 0, 48));
        layout(384, 824);
        assertEquals(24, web.getTop());
        assertEquals(776, web.getBottom());
        assertEquals(752, web.getHeight());
        assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_FULLSCREEN);
        assertEquals(0, activity.getWindow().getDecorView().getSystemUiVisibility()
                & (View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION));
    }

    @Test public void rotationAndNavigationModeReplaceAllFourInsets() {
        content.dispatchApplyWindowInsets(bars(0, 24, 0, 48));
        content.dispatchApplyWindowInsets(bars(32, 24, 48, 0));
        layout(824, 384);
        assertEquals(32, web.getLeft());
        assertEquals(776, web.getRight());
        assertEquals(384, web.getBottom());
        content.dispatchApplyWindowInsets(bars(0, 24, 0, 24));
        layout(384, 824);
        assertEquals(0, web.getLeft());
        assertEquals(800, web.getBottom());
    }

    @Test @Config(sdk = 35) public void keyboardAndCutoutUseLargestInsetAndAreConsumed() {
        WindowInsets keyboard = new WindowInsets.Builder(bars(0, 24, 0, 48))
                .setInsets(WindowInsets.Type.displayCutout(), Insets.of(32, 0, 0, 0))
                .setVisible(WindowInsets.Type.displayCutout(), true)
                .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, 300))
                .setVisible(WindowInsets.Type.ime(), true).build();
        assertTrue(content.dispatchApplyWindowInsets(keyboard).isConsumed());
        layout(384, 824);
        assertEquals(32, web.getLeft());
        assertEquals(524, web.getBottom());
        content.dispatchApplyWindowInsets(bars(0, 24, 0, 48));
        layout(384, 824);
        assertEquals(0, web.getLeft());
        assertEquals(776, web.getBottom());
    }
}
