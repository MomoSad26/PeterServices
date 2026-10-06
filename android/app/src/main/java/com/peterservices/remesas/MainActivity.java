package com.peterservices.remesas;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;

/**
 * Contenedor nativo de la web de Remesas: la app corre en su propio WebView
 * con los archivos dentro de la APK (sin Chrome y sin internet).
 */
public class MainActivity extends Activity {

  private static final String HOST = "appassets.androidplatform.net";
  private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
  private static final int THEME_COLOR = Color.parseColor("#0F3D3E");
  private static final int REQ_PICK_FILE = 1;
  private static final int REQ_SAVE_FILE = 2;

  // Los <a download> con URL blob: no funcionan en WebView; este script los
  // intercepta y entrega el archivo a Java para guardarlo con "Guardar como".
  private static final String DOWNLOAD_PATCH =
      "(function(){"
          + "if(window.__apkPatched)return;window.__apkPatched=true;"
          + "var orig=HTMLAnchorElement.prototype.click;"
          + "HTMLAnchorElement.prototype.click=function(){"
          + "var href=this.href||'';"
          + "if(this.hasAttribute('download')&&href.indexOf('blob:')===0){"
          + "var name=this.getAttribute('download')||'archivo';"
          + "fetch(href).then(function(r){return r.blob();}).then(function(b){"
          + "var fr=new FileReader();"
          + "fr.onload=function(){var s=fr.result;"
          + "AndroidBridge.saveFile(name,b.type||'application/octet-stream',s.substring(s.indexOf(',')+1));};"
          + "fr.readAsDataURL(b);});"
          + "return;}"
          + "return orig.apply(this,arguments);};"
          + "})();";

  private WebView webView;
  private FrameLayout root;
  private ValueCallback<Uri[]> pendingFileCallback;
  private byte[] pendingSaveBytes;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);

    root = new FrameLayout(this);
    root.setBackgroundColor(THEME_COLOR);
    webView = new WebView(this);
    webView.setBackgroundColor(Color.parseColor("#F7F5F0"));
    root.addView(webView, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(root);

    WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), root);
    bars.setAppearanceLightStatusBars(false);
    bars.setAppearanceLightNavigationBars(false);

    // Deja la web entre la barra de estado, la de navegación y el teclado.
    ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
      Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars()
          | WindowInsetsCompat.Type.displayCutout());
      Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
      v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
      return WindowInsetsCompat.CONSUMED;
    });

    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);

    WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
        .setDomain(HOST)
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

    webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return assetLoader.shouldInterceptRequest(request.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (HOST.equals(uri.getHost())) return false;
        // Enlaces externos (WhatsApp, teléfono, web) se abren en su app.
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
          Toast.makeText(MainActivity.this, "No hay app para abrir este enlace", Toast.LENGTH_SHORT).show();
        }
        return true;
      }

      @Override
      public void onPageFinished(WebView view, String url) {
        view.evaluateJavascript(DOWNLOAD_PATCH, null);
      }
    });

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                       FileChooserParams params) {
        if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
        pendingFileCallback = callback;
        // "*/*" porque muchos exploradores no marcan los .json como application/json.
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*");
        try {
          startActivityForResult(Intent.createChooser(intent, "Elegir respaldo"), REQ_PICK_FILE);
        } catch (ActivityNotFoundException e) {
          pendingFileCallback = null;
          return false;
        }
        return true;
      }
    });

    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState);
    } else {
      webView.loadUrl(START_URL);
    }
  }

  private class Bridge {
    // La web avisa del color de su barra superior (Ajustes → Color principal)
    // para pintar igual la franja de la barra de estado.
    @JavascriptInterface
    public void setThemeColor(String hex) {
      runOnUiThread(() -> {
        try {
          root.setBackgroundColor(Color.parseColor(hex));
        } catch (IllegalArgumentException ignored) {
          // color inválido: se deja el actual
        }
      });
    }

    @JavascriptInterface
    public void saveFile(String name, String mime, String base64) {
      byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
      runOnUiThread(() -> {
        pendingSaveBytes = bytes;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mime)
            .putExtra(Intent.EXTRA_TITLE, name);
        try {
          startActivityForResult(intent, REQ_SAVE_FILE);
        } catch (ActivityNotFoundException e) {
          pendingSaveBytes = null;
          Toast.makeText(MainActivity.this, "No se pudo guardar el archivo", Toast.LENGTH_LONG).show();
        }
      });
    }
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == REQ_PICK_FILE) {
      if (pendingFileCallback == null) return;
      Uri[] result = null;
      if (resultCode == RESULT_OK && data != null && data.getData() != null) {
        result = new Uri[] {data.getData()};
      }
      pendingFileCallback.onReceiveValue(result);
      pendingFileCallback = null;
    } else if (requestCode == REQ_SAVE_FILE) {
      byte[] bytes = pendingSaveBytes;
      pendingSaveBytes = null;
      if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
      try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
        out.write(bytes);
        Toast.makeText(this, "Archivo guardado", Toast.LENGTH_SHORT).show();
      } catch (Exception e) {
        Toast.makeText(this, "Error al guardar: " + e.getMessage(), Toast.LENGTH_LONG).show();
      }
    }
  }

  @Override
  public void onBackPressed() {
    // El Atrás del teléfono vuelve a la sección anterior (#/clientes, #/historial...).
    if (webView.canGoBack()) {
      webView.goBack();
    } else {
      super.onBackPressed();
    }
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    webView.saveState(outState);
  }
}
