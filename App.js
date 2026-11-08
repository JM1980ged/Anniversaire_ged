import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { parseGedcom, birthdaysOn, upcomingBirthdays, ageText, packPeople, unpackPeople } from './lib/gedcom';
import { readGedFile } from './lib/readFile';
import { scheduleAll, sendTest, NOTIFY_HOUR } from './lib/notifications';

const K_PEOPLE = 'ged.people.v1';
const K_META = 'ged.meta.v1';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtDate = (d) => `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;

export default function App() {
  const [people, setPeople] = useState([]);
  const [meta, setMeta] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const reschedule = useCallback(async (list) => {
    try {
      const r = await scheduleAll(list);
      if (!r.ok) {
        setScheduled(null);
        setNotice('Les notifications ne sont pas autorisées. Activez-les dans les réglages Android de l’application.');
      } else {
        setScheduled(r.count);
        setNotice('');
      }
    } catch (e) {
      setNotice(`Programmation impossible : ${e.message}`);
    }
  }, []);

  // Au démarrage : recharge les données enregistrées et reprogramme les notifications
  useEffect(() => {
    (async () => {
      try {
        const [[, rawPeople], [, rawMeta]] = await AsyncStorage.multiGet([K_PEOPLE, K_META]);
        if (rawPeople) {
          const list = unpackPeople(JSON.parse(rawPeople));
          setPeople(list);
          setMeta(rawMeta ? JSON.parse(rawMeta) : null);
          await reschedule(list);
        }
      } catch (e) {
        setNotice(`Lecture des données impossible : ${e.message}`);
      }
    })();
  }, [reschedule]);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || !res.assets.length) return;
      setBusy(true);
      setNotice('');
      const asset = res.assets[0];
      const text = await readGedFile(asset.uri);
      const { people: list, stats } = parseGedcom(text);
      if (stats.total === 0) {
        Alert.alert('Fichier non reconnu', 'Ce fichier ne contient aucune personne au format GEDCOM (.ged).');
        return;
      }
      const newMeta = { fileName: asset.name, loadedAt: Date.now(), ...stats };
      await AsyncStorage.multiSet([
        [K_PEOPLE, JSON.stringify(packPeople(list))],
        [K_META, JSON.stringify(newMeta)],
      ]);
      setPeople(list);
      setMeta(newMeta);
      await reschedule(list);
    } catch (e) {
      Alert.alert('Erreur', `Impossible de lire le fichier : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    try {
      const ok = await sendTest(people);
      Alert.alert(
        ok ? 'Test programmé' : 'Notifications refusées',
        ok ? 'Une notification arrive dans 10 secondes. Vous pouvez verrouiller l’écran.' : 'Autorisez les notifications dans les réglages Android.'
      );
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const today = new Date();
  const todayList = useMemo(() => birthdaysOn(people, today), [people, today.toDateString()]);
  const upcoming = useMemo(() => upcomingBirthdays(people, today, 30, 15), [people, today.toDateString()]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🎂 Anniversaires</Text>
        <Text style={styles.subtitle}>
          Notification chaque jour à {NOTIFY_HOUR} h avec les personnes vivantes qui fêtent leur anniversaire.
        </Text>

        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={pickFile} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{meta ? 'Changer de fichier GEDCOM' : 'Choisir un fichier GEDCOM (.ged)'}</Text>
          )}
        </Pressable>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {meta ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{meta.fileName}</Text>
            <Text style={styles.line}>{meta.total} personnes dans le fichier</Text>
            <Text style={styles.line}>{meta.living} vivantes avec une date de naissance complète</Text>
            <Text style={styles.lineMuted}>
              Ignorées : {meta.dead} décédées, {meta.noBirth} sans date de naissance complète
              {meta.tooOld ? `, ${meta.tooOld} nées il y a plus de 110 ans` : ''}
            </Text>
            {scheduled !== null ? (
              <Text style={styles.lineOk}>
                {scheduled} notification{scheduled > 1 ? 's' : ''} programmée{scheduled > 1 ? 's' : ''} (150 prochains jours)
              </Text>
            ) : null}
          </View>
        ) : null}

        {meta ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Aujourd’hui · {fmtDate(today)}</Text>
            {todayList.length ? (
              todayList.map((p, i) => (
                <View key={`${p.name}-${i}`} style={styles.row}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.age}>{ageText(p.age)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.lineMuted}>Aucun anniversaire aujourd’hui.</Text>
            )}
          </View>
        ) : null}

        {meta && upcoming.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>À venir (30 jours)</Text>
            {upcoming.map((p, i) => (
              <View key={`${p.name}-${i}`} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.lineMuted}>{fmtDate(p.date)}</Text>
                </View>
                <Text style={styles.age}>{ageText(p.age)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {meta ? (
          <View style={styles.actions}>
            <Pressable style={styles.buttonSecondary} onPress={onTest}>
              <Text style={styles.buttonSecondaryText}>Tester la notification (10 s)</Text>
            </Pressable>
            <Pressable style={styles.buttonSecondary} onPress={() => reschedule(people)}>
              <Text style={styles.buttonSecondaryText}>Reprogrammer les notifications</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.footer}>
          Le fichier est lu uniquement sur cet appareil. Ouvrez l’application de temps en temps pour renouveler la
          programmation des notifications.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F0' },
  content: { padding: 20, paddingTop: Platform.OS === 'android' ? 56 : 64, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: '800', color: '#7C2D12' },
  subtitle: { fontSize: 15, color: '#78716C', marginTop: 6, marginBottom: 20, lineHeight: 21 },
  button: { backgroundColor: '#C2410C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonSecondary: {
    borderWidth: 1.5, borderColor: '#C2410C', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  buttonSecondaryText: { color: '#C2410C', fontSize: 15, fontWeight: '600' },
  actions: { marginTop: 4 },
  notice: { marginTop: 14, color: '#B91C1C', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#F3E3D3' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#292524', marginBottom: 8 },
  line: { fontSize: 15, color: '#44403C', marginTop: 2 },
  lineMuted: { fontSize: 13, color: '#78716C', marginTop: 4 },
  lineOk: { fontSize: 14, color: '#15803D', marginTop: 8, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F5EFE8' },
  name: { fontSize: 16, color: '#292524', fontWeight: '600', flexShrink: 1, paddingRight: 8 },
  age: { fontSize: 15, color: '#C2410C', fontWeight: '700' },
  footer: { marginTop: 24, fontSize: 12, color: '#A8A29E', lineHeight: 18, textAlign: 'center' },
});
