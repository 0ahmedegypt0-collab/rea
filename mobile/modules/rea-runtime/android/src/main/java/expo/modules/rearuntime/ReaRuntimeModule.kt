package expo.modules.rearuntime

import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import java.io.BufferedInputStream
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ReaRuntimeModule : Module() {
  private val runtimeArchiveName = "rea-runtime-arm64.tar.gz"
  private val runtimeChecksumName = "rea-runtime-arm64.sha256"
  private val engineArchiveName = "rea-engine-js.tar.gz"
  private val engineChecksumName = "rea-engine-js.sha256"
  private val mcpLock = Any()
  private val mcpErrors = ArrayDeque<String>()
  @Volatile private var mcpProcess: Process? = null
  private var mcpReader: BufferedReader? = null
  private var mcpWriter: BufferedWriter? = null
  private var mcpRequestId = 0
  private var mcpInitializeResult: String? = null

  private fun appFilesDirectory(): File {
    val context = appContext.reactContext
      ?: throw IllegalStateException("Android application context is unavailable")
    return context.filesDir
  }

  private fun runtimePrefix(): File = File(appFilesDirectory(), "usr")
  private fun engineDirectory(): File = File(appFilesDirectory(), "rea-engine")

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

  private fun extractArchive(
    archive: File,
    staging: File,
    archiveRootName: String,
    requiredRelativePath: String,
    finalRoot: File,
  ) {
    val stagingRoot = staging.canonicalFile
    val extractedRoot = File(staging, archiveRootName)
    staging.mkdirs()

    TarArchiveInputStream(
      GzipCompressorInputStream(BufferedInputStream(FileInputStream(archive))),
    ).use { tar ->
      while (true) {
        val entry = tar.nextTarEntry ?: break
        val name = entry.name.removePrefix("./")
        if (name.isBlank() || name.startsWith("/") || name.split('/').any { it == ".." }) {
          throw IllegalStateException("Unsafe path in embedded archive: ${entry.name}")
        }

        val output = File(staging, name)
        val outputPath = output.canonicalPath
        if (outputPath != stagingRoot.path && !outputPath.startsWith(stagingRoot.path + File.separator)) {
          throw IllegalStateException("Archive path escaped the app-private staging directory")
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
              finalRoot.canonicalPath
            } else {
              extractedRoot.canonicalPath
            }
            if (resolvedLink != allowedLinkRoot && !resolvedLink.startsWith(allowedLinkRoot + File.separator)) {
              throw IllegalStateException("Archive symlink escaped its private root: $linkTarget")
            }
            Os.symlink(linkTarget, output.absolutePath)
          }
          entry.isLink -> {
            output.parentFile?.mkdirs()
            if (entry.linkName.startsWith("/")) {
              throw IllegalStateException("Absolute hard links are not supported in bundled archives")
            }
            val source = File(staging, entry.linkName).canonicalFile
            if (source.path != stagingRoot.path && !source.path.startsWith(stagingRoot.path + File.separator)) {
              throw IllegalStateException("Archive hard link escaped staging directory")
            }
            Os.link(source.absolutePath, output.absolutePath)
          }
          entry.isFile -> {
            output.parentFile?.mkdirs()
            FileOutputStream(output).use { destination -> tar.copyTo(destination) }
            Os.chmod(output.absolutePath, entry.mode.toInt() and 0x1ff)
          }
          else -> throw IllegalStateException("Unsupported archive entry type: ${entry.name}")
        }
      }
    }

    if (!File(extractedRoot, requiredRelativePath).isFile) {
      throw IllegalStateException("Bundled archive is missing $archiveRootName/$requiredRelativePath")
    }
  }

  private fun installArchive(
    archiveName: String,
    checksumName: String,
    archiveRootName: String,
    requiredRelativePath: String,
    destination: File,
    stagingName: String,
    backupName: String,
    markerName: String,
  ): Map<String, Any> {
    val context = appContext.reactContext
      ?: throw IllegalStateException("Android application context is unavailable")
    val assets = context.assets.list("")?.toSet() ?: emptySet()
    if (archiveName !in assets || checksumName !in assets) {
      throw IllegalStateException("The APK does not contain $archiveName and $checksumName")
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
      throw IllegalStateException("Checksum verification failed for $archiveName")
    }

    val staging = File(context.filesDir, stagingName)
    val backup = File(context.filesDir, backupName)
    removeRecursively(staging)
    removeRecursively(backup)
    try {
      extractArchive(archive, staging, archiveRootName, requiredRelativePath, destination)
      if (destination.exists() && !destination.renameTo(backup)) {
        throw IllegalStateException("Could not move the previous private installation aside")
      }
      val stagedRoot = File(staging, archiveRootName)
      if (!stagedRoot.renameTo(destination)) {
        if (backup.exists()) backup.renameTo(destination)
        throw IllegalStateException("Could not activate the new app-private installation")
      }
      removeRecursively(backup)
      File(context.filesDir, markerName).writeText(actual)
    } finally {
      removeRecursively(staging)
      archive.delete()
    }

    mapOf(
      "installed" to true,
      "sha256" to actual,
      "directory" to destination.absolutePath,
    )
  }

  private fun mcpEnvironment(prefix: File, files: File): MutableMap<String, String> {
    val home = File(files, "home").apply { mkdirs() }
    val temp = File(files, "tmp").apply { mkdirs() }
    val config = File(files, "config").apply { mkdirs() }
    val cache = File(files, "cache").apply { mkdirs() }
    val state = File(files, "state").apply { mkdirs() }
    return mutableMapOf(
      "PREFIX" to prefix.absolutePath,
      "TERMUX_PREFIX" to prefix.absolutePath,
      "HOME" to home.absolutePath,
      "TMPDIR" to temp.absolutePath,
      "XDG_CONFIG_HOME" to config.absolutePath,
      "XDG_CACHE_HOME" to cache.absolutePath,
      "XDG_STATE_HOME" to state.absolutePath,
      "PATH" to "\${File(prefix, "bin").absolutePath}:/system/bin:/system/xbin",
      "LD_LIBRARY_PATH" to File(prefix, "lib").absolutePath,
      "REA_MCP_INPUT_SCHEMA_PROFILE" to "full",
      "REA_MCP_OUTPUT_SCHEMA_PROFILE" to "full",
    )
  }

  private fun mcpRequestInternal(method: String, params: JSONObject): JSONObject {
    val writer = mcpWriter ?: throw IllegalStateException("REA MCP process is not running")
    val reader = mcpReader ?: throw IllegalStateException("REA MCP process is not running")
    val id = ++mcpRequestId
    val request = JSONObject()
      .put("jsonrpc", "2.0")
      .put("id", id)
      .put("method", method)
      .put("params", params)
    writer.write(request.toString())
    writer.newLine()
    writer.flush()

    while (true) {
      val line = reader.readLine()
        ?: throw IllegalStateException("REA MCP process closed its output stream: \${mcpErrors.joinToString("\n")}")
      if (line.isBlank()) continue
      val message = try {
        JSONObject(line)
      } catch (_: Exception) {
        continue
      }
      if (message.opt("id")?.toString() == id.toString()) {
        if (message.has("error")) {
          throw IllegalStateException("REA MCP request failed: \${message.optJSONObject("error")}")
        }
        return message
      }
    }
  }

  private fun mcpNotificationInternal(method: String, params: JSONObject) {
    val writer = mcpWriter ?: throw IllegalStateException("REA MCP process is not running")
    val notification = JSONObject()
      .put("jsonrpc", "2.0")
      .put("method", method)
      .put("params", params)
    writer.write(notification.toString())
    writer.newLine()
    writer.flush()
  }

  private fun startMcpInternal(): String = synchronized(mcpLock) {
    val current = mcpProcess
    if (current != null && current.isAlive) {
      return@synchronized mcpInitializeResult ?: JSONObject().put("ready", true).toString()
    }

    stopMcpInternal()
    val files = appFilesDirectory()
    val prefix = runtimePrefix()
    val node = File(prefix, "bin/node")
    val engine = engineDirectory()
    val workspace = File(files, "Documents/rea-workspace").apply { mkdirs() }
    val entry = File(engine, "scripts/rea.mjs")
    if (!node.isFile || !node.canExecute()) {
      throw IllegalStateException("The embedded Android Node runtime is not installed")
    }
    if (!entry.isFile) throw IllegalStateException("The compiled REA engine is not installed")

    val child = ProcessBuilder(node.absolutePath, entry.absolutePath, "mcp")
      .directory(workspace)
      .redirectErrorStream(false)
    child.environment().putAll(mcpEnvironment(prefix, files))
    val process = child.start()
    mcpProcess = process
    mcpReader = BufferedReader(InputStreamReader(process.inputStream, Charsets.UTF_8))
    mcpWriter = BufferedWriter(OutputStreamWriter(process.outputStream, Charsets.UTF_8))
    synchronized(mcpErrors) { mcpErrors.clear() }
    Thread({
      try {
        process.errorStream.bufferedReader().useLines { lines ->
          lines.forEach { line ->
            synchronized(mcpErrors) {
              if (mcpErrors.size >= 40) mcpErrors.removeFirst()
              mcpErrors.addLast(line.take(1000))
            }
          }
        }
      } catch (_: Exception) {
      }
    }, "rea-mcp-stderr").apply {
      isDaemon = true
      start()
    }

    val params = JSONObject()
      .put("protocolVersion", "2025-03-26")
      .put("capabilities", JSONObject())
      .put("clientInfo", JSONObject().put("name", "rea-android").put("version", "1.0.0"))
    val response = try {
      mcpRequestInternal("initialize", params)
    } catch (cause: Exception) {
      stopMcpInternal()
      throw IllegalStateException("Could not initialize the local REA MCP process: \${cause.message}", cause)
    }
    val result = response.optJSONObject("result")
      ?: throw IllegalStateException("REA MCP initialize response did not contain a result")
    mcpNotificationInternal("notifications/initialized", JSONObject())
    mcpInitializeResult = result.toString()
    mcpInitializeResult!!
  }

  private fun listMcpToolsInternal(): String = synchronized(mcpLock) {
    if (mcpProcess?.isAlive != true) startMcpInternal()
    val allTools = JSONArray()
    var cursor: String? = null
    do {
      val params = JSONObject()
      if (cursor != null) params.put("cursor", cursor)
      val result = mcpRequestInternal("tools/list", params).optJSONObject("result")
        ?: throw IllegalStateException("REA MCP tools/list response did not contain a result")
      val batch = result.optJSONArray("tools") ?: JSONArray()
      for (index in 0 until batch.length()) allTools.put(batch.get(index))
      cursor = if (result.has("nextCursor") && !result.isNull("nextCursor")) result.getString("nextCursor").takeIf { it.isNotBlank() } else null
    } while (cursor != null)
    JSONObject().put("tools", allTools).toString()
  }

  private fun callMcpToolInternal(name: String, argumentsJson: String): String = synchronized(mcpLock) {
    if (mcpProcess?.isAlive != true) startMcpInternal()
    val arguments = try {
      JSONObject(argumentsJson)
    } catch (cause: Exception) {
      throw IllegalArgumentException("Tool arguments must be a JSON object", cause)
    }
    val params = JSONObject().put("name", name).put("arguments", arguments)
    val result = mcpRequestInternal("tools/call", params).optJSONObject("result")
      ?: throw IllegalStateException("REA MCP tools/call response did not contain a result")
    result.toString()
  }

  private fun stopMcpInternal() {
    try {
      mcpWriter?.close()
    } catch (_: Exception) {
    }
    try {
      mcpReader?.close()
    } catch (_: Exception) {
    }
    val process = mcpProcess
    if (process != null) {
      try {
        if (!process.waitFor(2, TimeUnit.SECONDS)) {
          process.destroy()
          if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
        }
      } catch (_: Exception) {
        process.destroyForcibly()
      }
    }
    mcpProcess = null
    mcpReader = null
    mcpWriter = null
    mcpInitializeResult = null
  }

  override fun definition() = ModuleDefinition {
    Name("ReaRuntime")

    AsyncFunction("inspect") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("Android application context is unavailable")
      val node = File(runtimePrefix(), "bin/node")
      val engineEntry = File(engineDirectory(), "scripts/rea.mjs")
      val assets = context.assets.list("")?.toSet() ?: emptySet()
      mapOf(
        "available" to (node.isFile && node.canExecute()),
        "bundledAssetPresent" to (runtimeArchiveName in assets && runtimeChecksumName in assets),
        "engineAvailable" to engineEntry.isFile,
        "engineAssetPresent" to (engineArchiveName in assets && engineChecksumName in assets),
        "nodePath" to node.absolutePath,
        "prefixPath" to runtimePrefix().absolutePath,
        "enginePath" to engineDirectory().absolutePath,
        "appPrivateDirectory" to context.filesDir.absolutePath,
        "architecture" to System.getProperty("os.arch"),
      )
    }

    AsyncFunction("installBundledRuntime") {
      installArchive(
        runtimeArchiveName,
        runtimeChecksumName,
        "usr",
        "bin/node",
        runtimePrefix(),
        "rea-runtime-staging",
        "rea-runtime-backup",
        ".rea-runtime-sha256",
      )
    }

    AsyncFunction("installBundledEngine") {
      installArchive(
        engineArchiveName,
        engineChecksumName,
        "package",
        "scripts/rea.mjs",
        engineDirectory(),
        "rea-engine-staging",
        "rea-engine-backup",
        ".rea-engine-sha256",
      )
    }

    AsyncFunction("readCatalog") {
      val catalog = File(engineDirectory(), "dist/mcp-catalog-full.json")
      if (!catalog.isFile) throw IllegalStateException("The full REA MCP tool catalog is not installed")
      catalog.readText()
    }

    AsyncFunction("startMcp") {
      startMcpInternal()
    }

    AsyncFunction("listTools") {
      listMcpToolsInternal()
    }

    AsyncFunction("callTool") { name: String, argumentsJson: String ->
      callMcpToolInternal(name, argumentsJson)
    }

    AsyncFunction("stopMcp") {
      synchronized(mcpLock) { stopMcpInternal() }
      true
    }

    AsyncFunction("cancelMcp") {
      val process = mcpProcess
      if (process != null && process.isAlive) {
        process.destroy()
        if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
      }
      true
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
      val process = ProcessBuilder(node.absolutePath, "--version")
        .directory(contextFiles)
        .redirectErrorStream(true)
      process.environment().apply {
        put("PREFIX", prefix.absolutePath)
        put("HOME", home.absolutePath)
        put("TMPDIR", temp.absolutePath)
        put("PATH", "${File(prefix, "bin").absolutePath}:/system/bin:/system/xbin")
        put("LD_LIBRARY_PATH", File(prefix, "lib").absolutePath)
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
