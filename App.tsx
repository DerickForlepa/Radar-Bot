import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addUserRadar, clearUserRadars, counts, downloadOsmRadars } from './src/radars';
import {
  Status,
  configureAudio,
  currentFix,
  isTracking,
  speak,
  startTracking,
  stopTracking,
  subscribe,
} from './src/tracker';

function Button({
  label,
  onPress,
  kind = 'default',
}: {
  label: string;
  onPress: () => void;
  kind?: 'default' | 'primary' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' && styles.btnPrimary,
        kind === 'danger' && styles.btnDanger,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.btnText, kind !== 'default' && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [n, setN] = useState({ osm: 0, user: 0 });
  const [busy, setBusy] = useState(false);

  const refreshCounts = useCallback(async () => setN(await counts()), []);

  useEffect(() => {
    isTracking().then(setActive);
    counts().then(setN);
    return subscribe(setStatus);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    try {
      setBusy(true);
      await fn();
    } catch (e: any) {
      Alert.alert('Ops', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = () =>
    run(async () => {
      if (active) {
        await stopTracking();
        setActive(false);
      } else {
        await startTracking();
        setActive(true);
      }
    });

  const download = () =>
    run(async () => {
      const fix = await currentFix();
      const total = await downloadOsmRadars(fix.coords.latitude, fix.coords.longitude, 30000);
      await refreshCounts();
      Alert.alert('Radares baixados', `${total} radares do OpenStreetMap em até 30 km daqui.`);
    });

  const markHere = () =>
    run(async () => {
      const fix = await currentFix();
      const h = fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading : undefined;
      await addUserRadar(fix.coords.latitude, fix.coords.longitude, h);
      await refreshCounts();
      Alert.alert(
        'Radar marcado',
        h === undefined
          ? 'Salvo sem sentido (o GPS ainda não sabe seu rumo). Vale marcar em movimento.'
          : 'Salvo com o sentido em que você está indo.',
      );
    });

  const testVoice = () =>
    run(async () => {
      await configureAudio();
      speak('Radar à frente, 400 metros, limite 60');
    });

  const clearMine = () =>
    Alert.alert('Apagar seus radares?', 'Remove só os que você marcou à mão.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await clearUserRadars();
          await refreshCounts();
        },
      },
    ]);

  const near = status?.nearest;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Radar</Text>
        <Text style={styles.sub}>
          {active ? 'Ativo — pode abrir o Waze/Maps e apagar a tela' : 'Parado'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.big}>{status ? Math.round(status.speedKmh) : '--'}</Text>
          <Text style={styles.label}>km/h</Text>
          <Text style={styles.line}>
            Rumo: {status && status.heading >= 0 ? `${Math.round(status.heading)}°` : '--'}
          </Text>
        </View>

        <View style={[styles.card, near && styles.cardAlert]}>
          <Text style={styles.label}>Radar à frente</Text>
          <Text style={styles.big}>{near ? `${Math.round(near.dist)} m` : 'nenhum'}</Text>
          {near?.maxspeed ? <Text style={styles.line}>Limite {near.maxspeed} km/h</Text> : null}
          {status?.lastAlert ? <Text style={styles.line}>Último aviso: {status.lastAlert}</Text> : null}
        </View>

        <Button
          label={active ? 'Parar' : 'Iniciar'}
          kind={active ? 'danger' : 'primary'}
          onPress={toggle}
        />
        <Button label="Baixar radares da região (30 km)" onPress={download} />
        <Button label="Marcar radar aqui" onPress={markHere} />
        <Button label="Testar voz" onPress={testVoice} />
        <Button label="Apagar meus radares" onPress={clearMine} />

        <Text style={styles.foot}>
          Base: {n.osm} do OpenStreetMap + {n.user} marcados por você{busy ? ' · aguarde…' : ''}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1115' },
  container: { padding: 20, gap: 12 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  sub: { color: '#9aa3b2', fontSize: 14, marginBottom: 4 },
  card: { backgroundColor: '#1a1e26', borderRadius: 16, padding: 18 },
  cardAlert: { backgroundColor: '#5a1f1f' },
  big: { color: '#fff', fontSize: 44, fontWeight: '700' },
  label: { color: '#9aa3b2', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  line: { color: '#d7dce5', fontSize: 15, marginTop: 4 },
  btn: { backgroundColor: '#262b36', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#2563eb' },
  btnDanger: { backgroundColor: '#dc2626' },
  btnText: { color: '#e6e9ef', fontSize: 16, fontWeight: '600' },
  foot: { color: '#6b7484', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
