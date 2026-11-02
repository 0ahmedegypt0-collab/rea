package expo.modules.rearuntime

import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class ReaRuntimeModule : Module() {
  private val archiveName = "rea-runtime-arm64.tar.gz"
  private val checksumName = "rea-runtime-arm64.sha256"

  private fun appFilesDirectory(): File {
    val context = appContext.reactContext
      ?: throw IllegalStateException("Android application context is unavailable")
    return context.filesDir
  }

  private fun runtimePrefix(): File = File(appFilesDirectory(), "usr")

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun isSymbolicLink(file: File): Boolean = try {
    (Os.lstat(file.absolutePath).st_mode and OsConstants.S_IFMT) == OsConstants.S_IFLNK
  } catch (_: Exception) {
    false
  }

  private fun removeRecursively(file: File) {
    if (file.isDirectory && !isSymbolicLink(file)) {
      file.listFiles()?.forEach { removeRecursively(it) }
    }
    file.delete()
  }

  private fun extractRuntime(archive: File, staging: File) {
    val stagingRoot = staging.canonicalFile
    val stagingPrefix = File(staging, "usr")
    staging.mkdirs()

    TarArchiveInputStream(
      GzipCompressorInputStream(BufferedInputStream(FileInputStream(archive))),
    ).use { tar ->
      while (true) {
        val entry = tar.nextTarEntry ?: break
        val name = entry.name.removePrefix("./")
        if (name.isBlank() || name.startsWith("/") || name.split('/').any { it == ".." }) {
          throw IllegalStateException("Unsafe path in embedded runtime archive: ${entry.name}")
        }

        val output = File(staging, name)
        val outputPath = output.canonicalPath
        if (outputPath != stagingRoot.path && !outputPath.startsWith(stagingRoot.path + File.separator)) {
          throw IllegalStateException("Runtime archive path escaped the private staging directory")
        }

        when {
          entry.isDirectory -> output.mkdirs()
          entry.isSymbolicLink -> {
            output.parentFile?.mkdirs()
            if (output.exists() || isSymbolicLink(output)) output.delete()
            val linkTarget = entry.linkName
            val resolvedLink = if (linkTarget.startsWith("/")) {
              File(linkTarget).canonicalPath
            } else {
              File(output.parentFile, linkTarget).canonicalPath
            }
            val allowedLinkRoot = if (linkTarget.startsWith("/")) {
              runtimePrefix().canonicalPath
            } else {
              stagingPrefix.canonicalPath
            }
            if (resolvedLink != allowedLinkRoot && !resolvedLink.startsWith(allowedLinkRoot + File.separator)) {
              throw IllegalStateException("Runtime symlink escaped its private prefix: $linkTarget")
            }
            Os.symlink(linkTarget, output.absolutePath)
          }
          entry.isLink -> {
            output.parentFile?.mkdirs()
            if (entry.linkName.startsWith("/")) {
              throw IllegalStateException("Absolute hard links are not supported in the runtime archive")
            }
            val source = File(staging, entry.linkName).canonicalFile
            if (source.path != stagingRoot.path && !source.path.startsWith(stagingRoot.path + File.separator)) {
              throw IllegalStateException("Runtime hard link escaped staging directory")
            }
            Os.link(source.absolutePath, output.absolutePath)
          }
          entry.isFile -> {
            output.parentFile?.mkdirs()
            FileOutputStream(output).use { destination -> tar.copyTo(destination) }
            Os.chmod(output.absolutePath, entry.mode.toInt() and 0x1ff)
          }
          else -> throw IllegalStateException("Unsupported runtime archive entry type: ${entry.name}")
        }
      }
    }

    if (!File(stagingPrefix, "bin/node").isFile) {
      throw IllegalStateException("The embedded archive does not contain usr/bin/node")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ReaRuntime")

    AsyncFunction("inspect") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val prefix = runtimePrefix()
      val node = File(prefix, "bin/node")
      val assets = context.assets.list("")?.toSet() ?: emptySet()
      mapOf(
        "available" to (node.isFile && node.canExecute()),
        "bundledAssetPresent" to (archiveName in assets && checksumName in assets),
        "nodePath" to node.absolutePath,
        "prefixPath" to prefix.absolutePath,
        "appPrivateDirectory" to context.filesDir.absolutePath,
        "architecture" to System.getProperty("os.arch"),
      )
    }

    AsyncFunction("installBundledRuntime") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val assets = context.assets.list("")?.toSet() ?: emptySet()
      if (archiveName !in assets || checksumName !in assets) {
        throw IllegalStateException("The app does not contain the embedded Node runtime assets")
      }

      val archive = File(context.cacheDir, archiveName)
      context.assets.open(archiveName).use { input ->
        FileOutputStream(archive).use { output -> input.copyTo(output) }
      }
      val expected = context.assets.open(checksumName).bufferedReader().use { it.readText() }
        .trim().substringBefore(' ')
      val actual = sha256(archive)
      if (!expected.matches(Regex("^[0-9a-f]{64}$")) || expected != actual) {
        archive.delete()
        throw IllegalStateException("Embedded Node runtime checksum verification failed")
      }

      val staging = File(context.filesDir, "rea-runtime-staging")
      val backup = File(context.filesDir, "rea-runtime-backup")
      removeRecursively(staging)
      removeRecursively(backup)
      try {
        extractRuntime(archive, staging)
        val current = runtimePrefix()
        if (current.exists() && !current.renameTo(backup)) {
          throw IllegalStateException("Could not move the previous private runtime aside")
        }
        val stagedPrefix = File(staging, "usr")
        if (!stagedPrefix.renameTo(current)) {
          if (backup.exists()) backup.renameTo(current)
          throw IllegalStateException("Could not activate the new private Node runtime")
        }
        removeRecursively(backup)
        File(context.filesDir, ".rea-runtime-sha256").writeText(actual)
      } finally {
        removeRecursively(staging)
        archive.delete()
      }

      mapOf(
        "installed" to true,
        "sha256" to actual,
        "prefixPath" to runtimePrefix().absolutePath,
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
      val match = Regex("^v(\\d+)\\.(\\d+)\\.(\\d+)$").matchEntire(output)
        ?: throw IllegalStateException("Unexpected Node version output: $output")
      val major = match.groupValues[1].toInt()
      val minor = match.groupValues[2].toInt()
      val patch = match.groupValues[3].toInt()
      val supported = when (major) {
        22 -> minor > 23 || (minor == 23 && patch >= 4)
        24 -> minor > 22 || (minor == 22 && patch >= 1)
        26 -> minor > 12 || (minor == 12 && patch >= 1)
        else -> major > 26
      }
      if (!supported) throw IllegalStateException("Node $output does not satisfy REA's engine requirement")
      mapOf(
        "version" to output,
        "exitCode" to child.exitValue(),
        "nodePath" to node.absolutePath,
      )
    }
  }
}
