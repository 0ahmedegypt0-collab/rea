import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from "react-native";
import { ReaMcpClient, type McpTool, type McpReply } from "./src/mcp";

const COLORS = {
  bg: "#080D18", panel: "#111B2B", panel2: "#17243A",
  gold: "#D8AE55", text: "#F4F1E8", muted: "#A5B0C2",
  green: "#62C995", red: "#F07878", line: "#2B3A51"
};

export default function App() {
  const [endpoint, setEndpoint] = useState("http://10.0.2.2:3000/mcp");
  const [client, setClient] = useState<ReaMcpClient | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selected, setSelected] = useState<McpTool | null>(null);
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("غير متصل");
  const [filter, setFilter] = useState("");

  const visibleTools = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return tools.filter(t => !q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q));
  }, [tools, filter]);

  async function connect() {
    setBusy(true); setOutput("");
    try {
      const next = new ReaMcpClient(endpoint.trim().replace(/\/$/, ""));
      await next.connect();
      const catalog = await next.listTools();
      setClient(next); setTools(catalog); setSelected(null);
      setStatus(`متصل · ${catalog.length} أداة متاحة`);
    } catch (e) {
      setStatus("فشل الاتصال");
      setOutput(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function runTool() {
    if (!client || !selected) return;
    setBusy(true); setOutput("");
    try {
      const parsed = JSON.parse(args || "{}") as Record<string, unknown>;
      const result: McpReply = await client.callTool(selected.name, parsed);
      setOutput(JSON.stringify(result.result ?? result, null, 2));
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  function chooseTool(tool: McpTool) {
    setSelected(tool);
    setArgs("{}");
    setOutput("");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoText}>R</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>REA MOBILE</Text>
            <Text style={styles.subBrand}>Reverse Engineer Anything</Text>
          </View>
          <View style={styles.live}><View style={[styles.dot, { backgroundColor: client ? COLORS.green : COLORS.red }]} /><Text style={styles.liveText}>{client ? "LIVE" : "OFFLINE"}</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>منصة الهندسة العكسية</Text>
          <Text style={styles.heroTitle}>كل أدوات REA في تطبيق واحد</Text>
          <Text style={styles.heroText}>اتصل بمحرك REA الأصلي، اعرض كتالوج MCP، وشغّل أدوات التحليل الحقيقية من واجهة Android.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الاتصال بمحرك REA</Text>
          <Text style={styles.hint}>عنوان خادم REA HTTP وينتهي بـ /mcp</Text>
          <TextInput value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.10:3000/mcp" placeholderTextColor="#718096" style={styles.input} />
          <TouchableOpacity style={styles.primaryButton} onPress={connect} disabled={busy}>
            {busy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.primaryText}>اتصال وتحميل جميع الأدوات</Text>}
          </TouchableOpacity>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.warning}>تنبيه أمان: خادم REA الأصلي يستخدم HTTP دون تسجيل دخول أو تشفير. لا تعرّضه للإنترنت العام؛ استخدم شبكة موثوقة أو نفقًا آمنًا.</Text>
        </View>

        <View style={styles.rowTitle}>
          <Text style={styles.sectionTitle}>كتالوج أدوات REA</Text>
          <Text style={styles.count}>{tools.length}</Text>
        </View>
        <TextInput value={filter} onChangeText={setFilter} placeholder="ابحث عن أداة أو وظيفة..." placeholderTextColor="#718096" style={styles.input} />
        {visibleTools.map(tool => (
          <TouchableOpacity key={tool.name} style={[styles.tool, selected?.name === tool.name && styles.toolSelected]} onPress={() => chooseTool(tool)}>
            <View style={styles.toolTop}><Text style={styles.toolName}>{tool.name}</Text><Text style={styles.chevron}>‹</Text></View>
            {!!tool.description && <Text style={styles.toolDescription} numberOfLines={2}>{tool.description}</Text>}
          </TouchableOpacity>
        ))}
        {!tools.length && <Text style={styles.empty}>اتصل بمحرك REA لعرض أدواته الأصلية هنا.</Text>}

        {selected && <View style={styles.card}>
          <Text style={styles.sectionTitle}>تشغيل الأداة</Text>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.hint}>أدخل معاملات الأداة بصيغة JSON وفق مخطط الإدخال الأصلي.</Text>
          <TextInput value={args} onChangeText={setArgs} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={[styles.input, styles.codeInput]} />
          <TouchableOpacity style={styles.primaryButton} onPress={runTool} disabled={busy || !client}>
            {busy ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.primaryText}>تنفيذ التحليل</Text>}
          </TouchableOpacity>
        </View>}

        {!!output && <View style={styles.card}>
          <Text style={styles.sectionTitle}>نتيجة التحليل</Text>
          <Text selectable style={styles.output}>{output}</Text>
        </View>}

        <Text style={styles.footer}>واجهة Android أولية متصلة ببروتوكول MCP الرسمي لمحرك REA · v0.1.0</Text>
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
  brand: { color: COLORS.text, fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  subBrand: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  hero: { backgroundColor: COLORS.panel2, borderColor: "#70582E", borderWidth: 1, borderRadius: 18, padding: 18, gap: 8 },
  heroEyebrow: { color: COLORS.gold, fontSize: 12, fontWeight: "700" },
  heroTitle: { color: COLORS.text, fontSize: 23, fontWeight: "900", textAlign: "right" },
  heroText: { color: COLORS.muted, fontSize: 13, lineHeight: 21, textAlign: "right" },
  card: { backgroundColor: COLORS.panel, borderColor: COLORS.line, borderWidth: 1, borderRadius: 16, padding: 15, gap: 10 },
  sectionTitle: { color: COLORS.gold, fontSize: 16, fontWeight: "800", textAlign: "right" },
  hint: { color: COLORS.muted, fontSize: 12, textAlign: "right", lineHeight: 18 },
  input: { backgroundColor: "#0A1321", borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, textAlign: "left", fontSize: 13 },
  primaryButton: { backgroundColor: COLORS.gold, borderRadius: 11, padding: 13, alignItems: "center", justifyContent: "center", minHeight: 46 },
  primaryText: { color: COLORS.bg, fontWeight: "900", fontSize: 14 },
  status: { color: COLORS.green, textAlign: "right", fontSize: 12 },
  warning: { color: "#E8BD79", fontSize: 11, lineHeight: 17, textAlign: "right" },
  rowTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  count: { color: COLORS.gold, fontWeight: "800" },
  tool: { backgroundColor: COLORS.panel, borderColor: COLORS.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  toolSelected: { borderColor: COLORS.gold, backgroundColor: COLORS.panel2 },
  toolTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toolName: { color: COLORS.text, fontWeight: "800", fontSize: 13, flex: 1, textAlign: "left" },
  chevron: { color: COLORS.gold, fontSize: 22 },
  toolDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: "right" },
  empty: { color: COLORS.muted, textAlign: "center", padding: 20 },
  selectedName: { color: COLORS.text, fontWeight: "800", textAlign: "left" },
  codeInput: { minHeight: 140, fontFamily: "monospace" },
  output: { color: "#D9E4F4", fontSize: 11, lineHeight: 17, fontFamily: "monospace", textAlign: "left" },
  footer: { color: "#718096", fontSize: 10, textAlign: "center", marginTop: 8 }
});
