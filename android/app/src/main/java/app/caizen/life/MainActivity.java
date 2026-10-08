package app.caizen.life;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CaizenNativePlugin.class);
        if ("true".equals(getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            .getString("privacy-screen-enabled", "false"))) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        super.onCreate(savedInstanceState);
    }
}
