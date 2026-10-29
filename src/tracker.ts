import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { AlertEngine, AlertEvent } from './engine';
import { getRadars } from './radars';

export const TASK_NAME = 'radar-location-task';

export type Status = {
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number;
  nearest?: { dist: number; maxspeed?: number };
  lastAlert?: string;
  ts: number;
};

const engine = new AlertEngine();
const listeners = new Set<(s: Status) => void>();
let lastAlert: string | undefined;
let lastStatus: Status | null = null;

export function subscribe(cb: (s: Status) => void): () => void {
  listeners.add(cb);
  if (lastStatus) cb(lastStatus);
  return () => {
    listeners.delete(cb);
  };
}

export function getLastStatus(): Status | null {
  return lastStatus;
}

/** Fala por cima de música/Waze, abaixando o volume deles durante o aviso. */
export async function configureAudio() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'duckOthers',
    allowsRecording: false,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  });
}

export function speak(text: string, urgent = false) {
  if (urgent) Speech.stop();
  Speech.speak(text, { language: 'pt-BR', rate: 1.05 });
}

function announce(ev: AlertEvent) {
  lastAlert = `${ev.text} (${Math.round(ev.dist)} m)`;
  speak(ev.text, ev.kind !== 'approach');
}

export async function processLocation(loc: Location.LocationObject) {
  const c = loc.coords;
  const speedMps = c.speed != null && c.speed > 0 ? c.speed : 0;
  const heading = c.heading != null && c.heading >= 0 ? c.heading : -1;
  const radars = await getRadars();

  const { ahead, events } = engine.update(radars, {
    lat: c.latitude,
    lon: c.longitude,
    heading,
    speedMps,
  });

  // fala só o evento mais urgente de cada leitura, para não atropelar avisos
  if (events.length > 0) {
    const pick =
      events.find((e) => e.kind === 'close') ??
      events.find((e) => e.kind === 'approach') ??
      events[0];
    announce(pick);
  }

  lastStatus = {
    lat: c.latitude,
    lon: c.longitude,
    speedKmh: speedMps * 3.6,
    heading,
    nearest: ahead[0] ? { dist: ahead[0].dist, maxspeed: ahead[0].radar.maxspeed } : undefined,
    lastAlert,
    ts: loc.timestamp,
  };
  listeners.forEach((l) => l(lastStatus!));
}

// Precisa ser definida no escopo global do módulo (importado em index.ts)
TaskManager.defineTask(TASK_NAME, async ({ data, error }: any) => {
  if (error) return;
  const locations: Location.LocationObject[] | undefined = data?.locations;
  if (!locations?.length) return;
  for (const loc of locations) {
    await processLocation(loc);
  }
});

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TASK_NAME);
}

export async function startTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Permissão de localização negada.');
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    throw new Error('Para funcionar com a tela apagada, escolha "Sempre" na permissão de localização.');
  }
  await configureAudio();
  engine.reset();
  lastAlert = undefined;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 5,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Radar ativo',
      notificationBody: 'Monitorando radares à frente',
    },
  });
}

export async function stopTracking() {
  if (await isTracking()) await Location.stopLocationUpdatesAsync(TASK_NAME);
  Speech.stop();
}

export async function currentFix(): Promise<Location.LocationObject> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Permissão de localização negada.');
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
}
