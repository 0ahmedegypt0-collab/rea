import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import ReaRuntime from "./modules/rea-runtime/src";

const COLORS = {
  bg: "#080D18", panel: "#111B2B", panel2: "#17243A", gold: "#D8AE55",
  text: "#F4F1E8", muted: "#A5B0C2", green: "#62C995", red: "#F07878", line: "#2B3A51",
};
type ImportedTarget = { name: string; uri: string; path: string; size: number };
type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown> };
const workspace = new Directory(Paths.document, "rea-workspace", "targets");

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "حجم غير معروف";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

export default function App() {
  const [targets, setTargets] = useState<ImportedTarget[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("مساحة العمل المحلية جاهزة");
  const [engineStatus, setEngineStatus] = useState("جارٍ فحص محرك Android المحلي...");
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [toolSearch, setToolSearch] = useState("");
  const [toolArguments, setToolArguments] = useState("{}");
  const [toolResult, setToolResult] = useState("");
  const [toolBusy, setToolBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshWorkspace = useCallback(() => {
    try {
      workspace.create({ idempotent: true, intermediates: true });
      const files = workspace.list().filter((entry): entry is File => entry instanceof File);
      setTargets(files.map((file) => ({
        name: file.name, uri: file.uri, path: decodeURIComponent(file.uri.replace(/^file:\/\//, "")), size: file.size ?? 0,
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    refreshWorkspace();
    let active = true;
    ReaRuntime.inspect()
      .then(async (inspection) => {
        if (!active) return;
        if (!inspection.available && inspection.bundledAssetPresent) {
          setEngineStatus("جارٍ تثبيت محرك Node 24 المضمّن...");
          await ReaRuntime.installBundledRuntime();
        }
        let current = await ReaRuntime.inspect();
        if (!current.available) {
          setEngineStatus("محرك Node 24 غير مضمّن في هذه النسخة بعد");
          return;
        }
        if (!current.engineAvailable && current.engineAssetPresent) {
          setEngineStatus("جارٍ تثبيت محرك REA وكتالوج الأدوات...");
          await ReaRuntime.installBundledEngine();
          current = await ReaRuntime.inspect();
        }
        const runtime = await ReaRuntime.runVersion();
        if (active && current.engineAvailable) {
          const catalog = JSON.parse(await ReaRuntime.readCatalog());
          await ReaRuntime.startMcp();
          const listing = JSON.parse(await ReaRuntime.listTools()) as { tools: McpTool[] };
          if (!active) return;
          setTools(listing.tools ?? []);
          setSelectedTool(listing.tools?.[0] ?? null);
          if (listing.tools?.some((tool) => tool.name === "inspect_analysis_settings")) {
            const diagnostic = JSON.parse(
              await ReaRuntime.callTool("inspect_analysis_settings", "{}"),
            ) as { isError?: boolean };
            if (diagnostic.isError) throw new Error("اختبار استدعاء أدوات REA المحلي فشل");
          }
          if (!active) return;
          setEngineStatus("محرك REA يعمل محليًا على " + runtime.version + " — " + (listing.tools?.length ?? catalog.tools.length) + " أداة");
        } else if (active) {
          setEngineStatus("محرك Node يعمل محليًا، وحزمة REA لم تُضمّن بعد");
        }
      })
      .catch((cause) => {
        if (active) setEngineStatus(
          cause instanceof Error ? "تعذر فحص المحرك: " + cause.message : String(cause),
        );
      });
    return () => { active = false; };
  }, [refreshWorkspace]);


  async function executeTool() {
    if (!selectedTool) return;
    setToolBusy(true);
    setToolResult("");
    try {
      const parsed = JSON.parse(toolArguments);
      const result = await ReaRuntime.callTool(selectedTool.name, JSON.stringify(parsed));
      setToolResult(JSON.stringify(JSON.parse(result), null, 2));
    } catch (cause) {
      setToolResult(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setToolBusy(false);
    }
  }

  async function importTargets() {
    setBusy(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", multiple: true, copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      workspace.create({ idempotent: true, intermediates: true });
      let imported = 0;
      for (const [index, asset] of result.assets.entries()) {
        const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "target.bin";
        const destination = new File(workspace, `${Date.now()}-${index}-${safeName}`);
        await new File(asset.uri).copy(destination);
        imported += 1;
      }
      refreshWorkspace();
      setStatus(`تم استيراد ${imported} ملف محليًا داخل مساحة REA`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("تعذر استيراد الملفات");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoText}>R</Text></View>
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>REA ANDROID</Text>
            <Text style={styles.subBrand}>Reverse Engineer Anything</Text>
          </View>
          <View style={styles.localBadge}><View style={styles.localDot} /><Text style={styles.localText}>LOCAL</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>منصة الهندسة العكسية</Text>
          <Text style={styles.heroTitle}>محرك REA على هاتفك</Text>
          <Text style={styles.heroText}>
            النسخة المستهدفة تعمل محليًا على Android، وتحتفظ بملفات التحليل داخل مساحة التطبيق.
            لن تحتاج إلى إدخال IP أو الاتصال بموقع خارجي لتشغيل المحرك بعد اكتمال دمجه.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.statusRow}><View style={styles.pendingDot} /><Text style={styles.sectionTitle}>حالة محرك التحليل</Text></View>
          <Text style={styles.pendingTitle}>تشغيل محرك REA المحلي</Text>
          <Text style={styles.bodyText}>
            التطبيق يجهّز Node 24 ومحرك REA وكتالوج الأدوات داخل مساحة Android الخاصة به.
            أدوات التحليل تُعرض من الكتالوج الأصلي، وتظل إمكانات كل أداة مرتبطة بتوافقها واختبارها على Android.
          </Text>
          <Text style={styles.hint}>{engineStatus}</Text>
          <Text style={styles.hint}>{status}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>ملفات التحليل المحلية</Text><Text style={styles.count}>{targets.length}</Text></View>
          <Text style={styles.bodyText}>
            استورد ملفات APK أو DEX أو ELF أو PE أو ملفات أخرى. تُنسخ الملفات إلى مساحة التطبيق الخاصة،
            ولا يتم إرسالها إلى خادم.
          </Text>
          <TouchableOpacity style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={importTargets} disabled={busy} activeOpacity={0.82}>
            {busy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.primaryText}>اختيار ملفات من الهاتف</Text>}
          </TouchableOpacity>
          {targets.length === 0 ? <Text style={styles.empty}>لم تتم إضافة ملفات بعد</Text> : targets.map((target) => (
            <View key={target.uri} style={styles.fileRow}>
              <View style={styles.fileIcon}><Text style={styles.fileIconText}>BIN</Text></View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{target.name}</Text>
                <Text style={styles.fileSize}>{formatBytes(target.size)}</Text>
                <Text selectable style={styles.filePath}>{target.path}</Text>
              </View>
              <View style={styles.savedMark}><Text style={styles.savedMarkText}>محلي</Text></View>
            </View>
          ))}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.count}>{tools.length}</Text>
            <Text style={styles.sectionTitle}>أدوات REA المحلية</Text>
          </View>
          <Text style={styles.bodyText}>
            الأدوات تأتي من كتالوج REA الأصلي وتُنفّذ عبر محرك محلي داخل التطبيق، دون عنوان IP أو خادم خارجي.
          </Text>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={() => ReaRuntime.cancelMcp().then(() => setEngineStatus("تم إيقاف/إلغاء محرك MCP المحلي"))}
          >
            <Text style={styles.stopText}>إيقاف أو إلغاء التحليل</Text>
          </TouchableOpacity>

          <TextInput
            value={toolSearch}
            onChangeText={setToolSearch}
            placeholder="ابحث باسم الأداة أو وصفها"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {tools.length === 0 ? (
            <Text style={styles.empty}>كتالوج الأدوات سيظهر بعد تثبيت محرك REA وتشغيله</Text>
          ) : (
            <ScrollView style={styles.toolList} nestedScrollEnabled>
              {tools.filter((tool) => (tool.name + " " + (tool.description ?? "")).toLowerCase().includes(toolSearch.toLowerCase())).slice(0, 80).map((tool) => (
                <TouchableOpacity
                  key={tool.name}
                  style={[styles.toolItem, selectedTool?.name === tool.name && styles.toolItemActive]}
                  onPress={() => { setSelectedTool(tool); setToolArguments("{}"); setToolResult(""); }}
                >
                  <Text style={styles.toolName}>{tool.name}</Text>
                  {!!tool.description && <Text style={styles.toolDescription} numberOfLines={2}>{tool.description}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {selectedTool && (
            <>
              <Text style={styles.selectedTool}>الأداة المحددة: {selectedTool.name}</Text>
              {!!selectedTool.inputSchema && <Text selectable style={styles.schemaText}>{JSON.stringify(selectedTool.inputSchema, null, 2)}</Text>}
              <TextInput
                value={toolArguments}
                onChangeText={setToolArguments}
                placeholder='{"key":"value"}'
                placeholderTextColor={COLORS.muted}
                style={styles.jsonInput}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.primaryButton, toolBusy && styles.buttonDisabled]}
                onPress={executeTool}
                disabled={toolBusy}
              >
                {toolBusy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.primaryText}>تنفيذ الأداة محليًا</Text>}
              </TouchableOpacity>
              {!!toolResult && <Text selectable style={styles.toolResult}>{toolResult}</Text>}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>خطة التوافق</Text>
          <View style={styles.planRow}><Text style={styles.planState}>تم</Text><Text style={styles.planText}>إلغاء الاعتماد على IP والخوادم الخارجية</Text></View>
          <View style={styles.planRow}><Text style={styles.planState}>قيد العمل</Text><Text style={styles.planText}>تضمين Node 24 ومحرك REA وكتالوج الأدوات</Text></View>
          <View style={styles.planRow}><Text style={styles.planState}>التالي</Text><Text style={styles.planText}>تكييف الأدوات حسب Android واختبار كل مجموعة</Text></View>
        </View>
        <Text style={styles.footer}>ملفاتك محفوظة داخل مساحة التطبيق الخاصة · لا يوجد اتصال بخادم خارجي</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 18, paddingBottom: 42, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.gold, alignItems: "center", justifyContent: "center" },
  logoText: { color: COLORS.bg, fontSize: 30, fontWeight: "900" },
  headerCopy: { flex: 1 },
  brand: { color: COLORS.text, fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  subBrand: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  localBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderColor: "#397B60", borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  localDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  localText: { color: COLORS.green, fontSize: 10, fontWeight: "900" },
  hero: { backgroundColor: COLORS.panel2, borderColor: "#70582E", borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  heroEyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: "700", textAlign: "right" },
  heroTitle: { color: COLORS.text, fontSize: 24, fontWeight: "900", textAlign: "right" },
  heroText: { color: COLORS.muted, fontSize: 13, lineHeight: 22, textAlign: "right" },
  card: { backgroundColor: COLORS.panel, borderColor: COLORS.line, borderWidth: 1, borderRadius: 16, padding: 15, gap: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  sectionTitle: { color: COLORS.gold, fontSize: 16, fontWeight: "800", textAlign: "right" },
  pendingTitle: { color: COLORS.text, fontSize: 15, fontWeight: "800", textAlign: "right" },
  bodyText: { color: COLORS.muted, fontSize: 12, lineHeight: 20, textAlign: "right" },
  hint: { color: COLORS.green, fontSize: 11, textAlign: "right" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  count: { color: COLORS.gold, fontWeight: "900", fontSize: 15 },
  primaryButton: { backgroundColor: COLORS.gold, borderRadius: 11, padding: 13, alignItems: "center", justifyContent: "center", minHeight: 46 },
  buttonDisabled: { opacity: 0.65 },
  primaryText: { color: COLORS.bg, fontWeight: "900", fontSize: 14 },
  empty: { color: COLORS.muted, textAlign: "center", padding: 14, fontSize: 12 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#0A1321", borderColor: COLORS.line, borderWidth: 1, borderRadius: 11, padding: 10 },
  fileIcon: { width: 38, height: 38, borderRadius: 9, backgroundColor: "#24344B", alignItems: "center", justifyContent: "center" },
  fileIconText: { color: COLORS.gold, fontSize: 10, fontWeight: "900" },
  fileInfo: { flex: 1, gap: 3 },
  fileName: { color: COLORS.text, fontSize: 12, fontWeight: "700", textAlign: "left" },
  fileSize: { color: COLORS.muted, fontSize: 10, textAlign: "left" },
  filePath: { color: "#8797AE", fontSize: 8, textAlign: "left" },
  savedMark: { borderColor: "#397B60", borderWidth: 1, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  savedMarkText: { color: COLORS.green, fontSize: 10, fontWeight: "700" },
  error: { color: COLORS.red, fontSize: 11, textAlign: "left" },
  searchInput: { backgroundColor: "#0A1321", borderColor: COLORS.line, borderWidth: 1, borderRadius: 10, color: COLORS.text, padding: 11, textAlign: "right" },
  toolList: { maxHeight: 260, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10 },
  toolItem: { padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line, gap: 4 },
  toolItemActive: { backgroundColor: "#26344A", borderLeftWidth: 3, borderLeftColor: COLORS.gold },
  toolName: { color: COLORS.gold, fontSize: 12, fontWeight: "800", textAlign: "left" },
  toolDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "left" },
  selectedTool: { color: COLORS.text, fontSize: 12, fontWeight: "800", textAlign: "left" },
  schemaText: { color: COLORS.muted, backgroundColor: "#0A1321", borderRadius: 8, padding: 10, fontSize: 9, lineHeight: 14, fontFamily: "monospace", textAlign: "left" },
  jsonInput: { minHeight: 110, maxHeight: 220, backgroundColor: "#070C14", borderColor: COLORS.line, borderWidth: 1, borderRadius: 10, color: COLORS.text, padding: 12, fontFamily: "monospace", textAlignVertical: "top" },
  toolResult: { color: "#D7E3F4", backgroundColor: "#070C14", borderRadius: 10, padding: 12, fontSize: 10, lineHeight: 16, fontFamily: "monospace", textAlign: "left" },
  stopButton: { borderColor: COLORS.red, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  stopText: { color: COLORS.red, fontSize: 11, fontWeight: "800" },
  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomColor: COLORS.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9, gap: 10 },
  planState: { color: COLORS.gold, fontSize: 10, fontWeight: "800" },
  planText: { flex: 1, color: COLORS.text, fontSize: 12, textAlign: "right" },
  footer: { color: "#718096", fontSize: 10, textAlign: "center", marginTop: 8 },
});
