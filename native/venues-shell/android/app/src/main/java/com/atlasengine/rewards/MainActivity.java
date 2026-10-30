package com.atlasengine.rewards;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onPause() {
        super.onPause();
        // Flush WebView cookies to disk whenever the app is backgrounded —
        // otherwise a quick kill loses the Supabase session cookies.
        CookieManager.getInstance().flush();
    }
}