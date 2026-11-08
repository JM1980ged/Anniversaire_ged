import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { birthdaysOn, ageText } from './gedcom';

// Heure d'envoi de la notification quotidienne
export const NOTIFY_HOUR = 7;
export const NOTIFY_MINUTE = 0;
// Nombre de jours programmés à l'avance (renouvelé à chaque ouverture de l'app)
export const DAYS_AHEAD = 150;

const CHANNEL_ID = 'anniversaires';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureSetup() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Anniversaires',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  return status === 'granted';
}

function buildContent(list) {
  const title =
    list.length === 1 ? '🎂 Anniversaire aujourd’hui' : `🎂 ${list.length} anniversaires aujourd’hui`;
  const body = list.map((p) => `${p.name} — ${ageText(p.age)}`).join('\n');
  return { title, body };
}

// Programme une notification à 7 h pour chaque jour où il y a au moins un
// anniversaire, sur les DAYS_AHEAD prochains jours. Le contenu (noms + âges)
// est calculé à l'avance pour chaque date.
export async function scheduleAll(people) {
  const granted = await ensureSetup();
  if (!granted) return { ok: false, count: 0 };

  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = new Date();
  let count = 0;
  for (let i = 0; i <= DAYS_AHEAD; i += 1) {
    const when = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + i, NOTIFY_HOUR, NOTIFY_MINUTE, 0, 0
    );
    if (when <= now) continue;
    const list = birthdaysOn(people, when);
    if (!list.length) continue;
    await Notifications.scheduleNotificationAsync({
      content: buildContent(list),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
    count += 1;
  }

  // Rappel pour rouvrir l'app avant la fin de la période programmée
  const reminder = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD - 14, NOTIFY_HOUR, NOTIFY_MINUTE + 5, 0, 0
  );
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Anniversaires GED',
      body: 'Ouvrez l’application pour actualiser les rappels d’anniversaires.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder,
      channelId: CHANNEL_ID,
    },
  });

  return { ok: true, count };
}

// Notification de test, envoyée 10 secondes plus tard
export async function sendTest(people) {
  const granted = await ensureSetup();
  if (!granted) return false;
  const list = birthdaysOn(people, new Date());
  const content = list.length
    ? buildContent(list)
    : { title: '🎂 Test de notification', body: 'Aucun anniversaire aujourd’hui : la notification de 7 h apparaîtra les jours concernés.' };
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      repeats: false,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}
