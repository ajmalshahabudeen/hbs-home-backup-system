import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

fun envOrProp(props: Properties, propName: String, envName: String): String? {
    val fromEnv = System.getenv(envName)?.trim()
    if (!fromEnv.isNullOrEmpty()) return fromEnv
    val fromFile = props.getProperty(propName)?.trim()
    return fromFile?.takeIf { it.isNotEmpty() }
}

val keyProperties = Properties()
val keyPropertiesFile = rootProject.file("key.properties")
if (keyPropertiesFile.isFile) {
    keyProperties.load(FileInputStream(keyPropertiesFile))
}

android {
    namespace = "com.hbs.hbs_app_flutter"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "27.1.12297006"

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.hbs.hbs_app_flutter"
        minSdk = 28
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    val uploadStorePath = envOrProp(keyProperties, "storeFile", "HBS_UPLOAD_STORE_FILE")
    val uploadStorePassword = envOrProp(keyProperties, "storePassword", "HBS_UPLOAD_STORE_PASSWORD")
    val uploadKeyAlias = envOrProp(keyProperties, "keyAlias", "HBS_UPLOAD_KEY_ALIAS")
    val uploadKeyPassword = envOrProp(keyProperties, "keyPassword", "HBS_UPLOAD_KEY_PASSWORD")
    val uploadStoreFile = uploadStorePath?.let { rootProject.file(it) }?.takeIf { it.isFile }
    val hasReleaseKey =
        uploadStoreFile != null &&
            !uploadStorePassword.isNullOrEmpty() &&
            !uploadKeyAlias.isNullOrEmpty() &&
            !uploadKeyPassword.isNullOrEmpty()

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = uploadStoreFile
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // GitHub releases MUST use the persistent upload keystore.
            // Local `flutter run --release` still falls back to debug if key.properties is missing.
            signingConfig =
                signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
