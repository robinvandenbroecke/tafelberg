plugins {
    id("com.android.application")
}

// De vaste signeersleutel komt in GitHub Actions uit de repo-secrets.
// Zonder sleutel (bv. een lokale build) wordt de release met de debugsleutel ondertekend.
val keystorePath: String? = System.getenv("TAFELBERG_KEYSTORE")
val hasReleaseKey = keystorePath != null && file(keystorePath).exists()

android {
    namespace = "be.tafelberg.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "be.tafelberg.app"
        // Laag gehouden voor oudere Boox-toestellen (Android 6) en de Galaxy Tab S3 (Android 7 tot 9).
        minSdk = 21
        targetSdk = 35
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "1.0"
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKey) {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("TAFELBERG_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("TAFELBERG_KEY_ALIAS")
                keyPassword = System.getenv("TAFELBERG_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
