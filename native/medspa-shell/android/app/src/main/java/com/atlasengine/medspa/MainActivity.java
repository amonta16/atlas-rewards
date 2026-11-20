package com.atlasengine.medspa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String HOST = "med.atlas-engine.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        // Cold start from a clinic link / QR: open that page instead of "/".
        openAppLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App already running and a med.atlas-engine.app link was tapped.
        openAppLink(intent);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Flush webview cookies to disk when the app is backgrounded, otherwise a
        // quick kill loses the sign-in session and the remembered clinic (ms_clinic).
        CookieManager.getInstance().flush();
    }

    private void openAppLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost())) return;
        if (getBridge() == null) return;
        final WebView web = getBridge().getWebView();
        final String url = uri.toString();
        web.post(() -> web.loadUrl(url));
    }

    /** Android 8+: pushes need a channel. FCM uses this one (manifest default). */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel("clinic_updates") != null) return;
        NotificationChannel ch = new NotificationChannel(
            "clinic_updates", "Rewards and offers", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Rewards unlocked, new offers and visit reminders from your clinic");
        nm.createNotificationChannel(ch);
    }
}
