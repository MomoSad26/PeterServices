plugins {
  id("com.android.application")
}

android {
  namespace = "com.peterservices.remesas"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.peterservices.remesas"
    minSdk = 24
    targetSdk = 35
    // Cada compilación en GitHub Actions sube el número de versión para que
    // la APK nueva se instale encima de la anterior sin perder los datos.
    versionCode = 100 + (System.getenv("GITHUB_RUN_NUMBER") ?: "0").toInt()
    // Igual que la etiqueta de la release (v1.0.<versionCode>): la app la
    // compara con GitHub para avisar de versiones nuevas.
    versionName = "1.0.${100 + (System.getenv("GITHUB_RUN_NUMBER") ?: "0").toInt()}"
  }

  // Firma fija: si cambiara entre compilaciones, Android rechazaría la
  // actualización y habría que desinstalar (borrando los datos).
  signingConfigs {
    create("remesas") {
      storeFile = file("${rootDir}/remesas.keystore")
      storePassword = "remesas123"
      keyAlias = "remesas"
      keyPassword = "remesas123"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("remesas")
    }
    debug { signingConfig = signingConfigs.getByName("remesas") }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation("androidx.core:core:1.13.1")
  implementation("androidx.webkit:webkit:1.12.1")
}

// La web (index.html, app.js, ...) se descarga del repo de PeterServices
// antes de compilar; sin ella la APK abriría en blanco.
tasks.named("preBuild") {
  doFirst {
    if (!file("src/main/assets/www/index.html").exists()) {
      throw GradleException("Falta app/src/main/assets/www/index.html. Ejecuta ./sync-web.sh primero.")
    }
  }
}
