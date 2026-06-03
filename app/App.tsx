import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { registerForPushToken } from "./src/notifications";
import { FocusGateApi } from "./src/api";

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [studentId, setStudentId] = useState("1");
  const [duration, setDuration] = useState("120");
  const [token, setToken] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [log, setLog] = useState<string>("Not connected.");

  const api = () => new FocusGateApi(baseUrl, Number(studentId));

  async function connect() {
    try {
      const t = await registerForPushToken();
      setToken(t);
      await api().registerPushToken(t);
      setLog("Connected. Urgent work messages will break through Focus.");
      void refreshStatus();
    } catch (e) {
      setLog(`Connect failed: ${(e as Error).message}`);
    }
  }

  async function refreshStatus() {
    try {
      const s = await api().status();
      setActive(!!s.active);
    } catch {
      /* ignore */
    }
  }

  async function start() {
    try {
      await api().startBlock(Number(duration) || 120);
      setActive(true);
      setLog(`Focus block started for ${duration} min. Stay reachable, not distractible.`);
    } catch (e) {
      setLog(`Start failed: ${(e as Error).message}`);
    }
  }

  async function stop() {
    try {
      const r = await api().stopBlock();
      setActive(false);
      setLog(r.digest);
      Alert.alert("Block ended", r.digest);
    } catch (e) {
      setLog(`Stop failed: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>FocusGate</Text>
      <Text style={styles.subtitle}>Stay reachable. Not distractible.</Text>

      <Text style={styles.label}>Backend URL</Text>
      <TextInput style={styles.input} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" />

      <Text style={styles.label}>Student ID</Text>
      <TextInput style={styles.input} value={studentId} onChangeText={setStudentId} keyboardType="number-pad" />

      <Pressable style={[styles.btn, styles.secondary]} onPress={connect}>
        <Text style={styles.btnText}>{token ? "Re-connect notifications" : "Connect notifications"}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.label}>Block length (minutes)</Text>
      <TextInput style={styles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" />

      {active ? (
        <Pressable style={[styles.btn, styles.stop]} onPress={stop}>
          <Text style={styles.btnText}>Stop block &amp; get digest</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.btn, styles.primary]} onPress={start}>
          <Text style={styles.btnText}>Start focus block</Text>
        </Pressable>
      )}

      <View style={[styles.statusPill, active ? styles.on : styles.off]}>
        <Text style={styles.statusText}>{active ? "● Focus block active" : "○ No active block"}</Text>
      </View>

      <Text style={styles.log}>{log}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 72, backgroundColor: "#0f1115", minHeight: "100%" },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#8a8f98", fontSize: 14, marginTop: 4, marginBottom: 24 },
  label: { color: "#8a8f98", fontSize: 13, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#1b1e24", color: "#e6e6e6", borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: "#2a2e36" },
  btn: { borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  primary: { backgroundColor: "#2563eb" },
  secondary: { backgroundColor: "#1b1e24", borderWidth: 1, borderColor: "#2a2e36" },
  stop: { backgroundColor: "#3a1414", borderWidth: 1, borderColor: "#5a1d1d" },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#1d1f25", marginVertical: 24 },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginTop: 20 },
  on: { backgroundColor: "#14361f" },
  off: { backgroundColor: "#2a2a2a" },
  statusText: { color: "#e6e6e6", fontSize: 13 },
  log: { color: "#9aa0aa", fontSize: 13, marginTop: 20, lineHeight: 19 },
});
