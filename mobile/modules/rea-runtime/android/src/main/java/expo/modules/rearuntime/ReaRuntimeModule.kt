package expo.modules.rearuntime

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.TimeUnit

class ReaRuntimeModule : Module() {
  private fun appFilesDirectory(): File {
    val context = appContext.reactContext
      ?: throw IllegalStateException("Android application context is unavailable")
    return context.filesDir
  }

  private fun runtimePrefix(): File = File(appFilesDirectory(), "usr")

  override fun definition() = ModuleDefinition {
    Name("ReaRuntime")

    AsyncFunction("inspect") {
      val prefix = runtimePrefix()
      val node = File(prefix, "bin/node")
      mapOf(
        "available" to (node.isFile && node.canExecute()),
        "nodePath" to node.absolutePath,
        "prefixPath" to prefix.absolutePath,
        "appPrivateDirectory" to appFilesDirectory().absolutePath,
        "architecture" to System.getProperty("os.arch"),
      )
    }

    AsyncFunction("runVersion") {
      val contextFiles = appFilesDirectory()
      val prefix = runtimePrefix()
      val node = File(prefix, "bin/node")
      if (!node.isFile || !node.canExecute()) {
        throw IllegalStateException("The embedded Android Node runtime is not installed")
      }

      val home = File(contextFiles, "home").apply { mkdirs() }
      val temp = File(contextFiles, "tmp").apply { mkdirs() }
      val libraryDirectory = File(prefix, "lib")
      val process = ProcessBuilder(node.absolutePath, "--version")
        .directory(contextFiles)
        .redirectErrorStream(true)
      process.environment().apply {
        put("PREFIX", prefix.absolutePath)
        put("HOME", home.absolutePath)
        put("TMPDIR", temp.absolutePath)
        put("PATH", "${File(prefix, "bin").absolutePath}:/system/bin:/system/xbin")
        put("LD_LIBRARY_PATH", libraryDirectory.absolutePath)
      }

      val child = process.start()
      if (!child.waitFor(20, TimeUnit.SECONDS)) {
        child.destroyForcibly()
        throw IllegalStateException("Embedded Node did not exit within 20 seconds")
      }
      val output = child.inputStream.bufferedReader().use { it.readText() }.trim()
      if (child.exitValue() != 0) {
        throw IllegalStateException("Embedded Node failed (exit ${child.exitValue()}): $output")
      }
      mapOf(
        "version" to output,
        "exitCode" to child.exitValue(),
        "nodePath" to node.absolutePath,
      )
    }
  }
}
