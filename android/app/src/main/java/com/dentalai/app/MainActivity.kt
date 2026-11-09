package com.dentalai.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.File

/**
 * Hosts the same app screens and clinical engine as the browser version.
 *
 * Files are served from the APK over https://appassets.androidplatform.net so the
 * page is a secure context (needed for SHA-256 photo integrity checks).
 * Photos are handed to the page exactly as the camera or gallery provides them:
 * nothing here crops, compresses or edits them.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var pendingCallback: ValueCallback<Array<Uri>>? = null
    private var cameraUri: Uri? = null

    private val pickPhoto = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val picked = result.data?.data
        val uris = when {
            result.resultCode != RESULT_OK -> null
            picked != null -> arrayOf(picked)
            cameraUri != null && (File(cacheDir, "captures/${cameraUri!!.lastPathSegment}").length() > 0) -> arrayOf(cameraUri!!)
            else -> null
        }
        pendingCallback?.onReceiveValue(uris)
        pendingCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    callback: ValueCallback<Array<Uri>>,
                    params: FileChooserParams,
                ): Boolean {
                    pendingCallback?.onReceiveValue(null)
                    pendingCallback = callback
                    pickPhoto.launch(photoChooser())
                    return true
                }
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) {
            // Photos from an earlier session are no longer referenced by the page.
            File(cacheDir, "captures").listFiles()?.forEach { it.delete() }
            webView.loadUrl("https://appassets.androidplatform.net/web/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    /** Lets the student take a new photo with the camera app or pick one from the gallery. */
    private fun photoChooser(): Intent {
        val dir = File(cacheDir, "captures").apply { mkdirs() }
        val file = File(dir, "photo_${System.currentTimeMillis()}.jpg")
        cameraUri = FileProvider.getUriForFile(this, "$packageName.photos", file)
        val camera = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        val gallery = Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
        return Intent.createChooser(gallery, getString(R.string.choose_photo))
            .putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
