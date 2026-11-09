plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dentalai.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dentalai.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The app screens and clinical engine are the same files as the browser
    // version (../web), copied in at build time so both always match.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webAssets"))
}

val copyWebApp by tasks.registering(Sync::class) {
    from(rootProject.file("../web")) {
        include("index.html", "app.js", "styles.css", "engine/**", "reference/**")
    }
    into(layout.buildDirectory.dir("generated/webAssets/web"))
}
tasks.named("preBuild") { dependsOn(copyWebApp) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
