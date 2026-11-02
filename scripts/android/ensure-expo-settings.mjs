import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const target = resolve(process.argv[2] ?? "mobile/android/settings.gradle");
const template = `pluginManagement {
  def reactNativeGradlePlugin = new File(
    providers.exec {
      workingDir(rootDir)
      commandLine("node", "--print", "require.resolve('@react-native/gradle-plugin/package.json', { paths: [require.resolve('react-native/package.json')] })")
    }.standardOutput.asText.get().trim()
  ).getParentFile().absolutePath
  includeBuild(reactNativeGradlePlugin)

  def expoPluginsPath = new File(
    providers.exec {
      workingDir(rootDir)
      commandLine("node", "--print", "require.resolve('expo-modules-autolinking/package.json', { paths: [require.resolve('expo/package.json')] })")
    }.standardOutput.asText.get().trim(),
    "../android/expo-gradle-plugin"
  ).absolutePath
  includeBuild(expoPluginsPath)
}

plugins {
  id("com.facebook.react.settings")
  id("expo-autolinking-settings")
}

extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  if (System.getenv('EXPO_USE_COMMUNITY_AUTOLINKING') == '1') {
    ex.autolinkLibrariesFromCommand()
  } else {
    ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)
  }
}

expoAutolinking.useExpoModules()
rootProject.name = "rea-mobile"
expoAutolinking.useExpoVersionCatalog()
include(":app")
includeBuild(expoAutolinking.reactNativeGradlePlugin)
`;
await writeFile(target, template, "utf8");

const gradlePropertiesPath = resolve(dirname(target), "gradle.properties");
let gradleProperties = await readFile(gradlePropertiesPath, "utf8");
if (/^reactNativeArchitectures=/m.test(gradleProperties)) {
  gradleProperties = gradleProperties.replace(
    /^reactNativeArchitectures=.*$/m,
    "reactNativeArchitectures=arm64-v8a",
  );
} else {
  gradleProperties += "\\nreactNativeArchitectures=arm64-v8a\\n";
}
await writeFile(gradlePropertiesPath, gradleProperties, "utf8");
console.log("Expo autolinking configured; Android ABI restricted to arm64-v8a.");
