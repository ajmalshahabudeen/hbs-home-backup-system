allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

subprojects {
    val applySubprojectConfig: (Project) -> Unit = { p ->
        val android = p.extensions.findByName("android")
        if (android != null) {
            try {
                val setNdkVersion = android.javaClass.getMethod("setNdkVersion", String::class.java)
                setNdkVersion.invoke(android, "27.1.12297006")
            } catch (_: Throwable) {
            }
            try {
                val setCompileSdkVersion = android.javaClass.getMethod("setCompileSdkVersion", Int::class.javaPrimitiveType)
                setCompileSdkVersion.invoke(android, 36)
            } catch (_: Throwable) {
                try {
                    val setCompileSdk = android.javaClass.getMethod("setCompileSdk", java.lang.Integer::class.java)
                    setCompileSdk.invoke(android, 36)
                } catch (_: Throwable) {
                    try {
                        val setCompileSdkVersionStr = android.javaClass.getMethod("setCompileSdkVersion", String::class.java)
                        setCompileSdkVersionStr.invoke(android, "android-36")
                    } catch (_: Throwable) {
                    }
                }
            }
        }
    }
    if (project.state.executed) {
        applySubprojectConfig(project)
    } else {
        project.afterEvaluate {
            applySubprojectConfig(project)
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
