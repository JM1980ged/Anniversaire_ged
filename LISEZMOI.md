# Anniversaires GED

Application Expo (React Native) qui :

1. charge un fichier GEDCOM (.ged) choisi sur le téléphone, sans l'envoyer nulle part ;
2. garde les personnes vivantes ayant une date de naissance complète (jour + mois) ;
3. programme une notification locale à 7 h chaque jour où il y a au moins un anniversaire,
   avec les noms et les âges.

## Règles de lecture du GEDCOM

- Décédée : présence d'un événement DEAT, BURI ou CREM.
- Sans décès mais née il y a plus de 110 ans : considérée comme décédée.
- Dates ignorées : approximatives ou incomplètes (ABT, EST, BEF, AFT, BET, année seule, mois seul).
- Date sans année : la personne est notifiée, avec « âge inconnu ».
- Né(e) un 29 février : fêté(e) le 28 février les années non bissextiles.
- Encodages gérés : UTF-8, UTF-16, ANSI/Latin-1.

## Réglages

Dans `lib/notifications.js` :
- `NOTIFY_HOUR` / `NOTIFY_MINUTE` : heure de la notification (7:00 par défaut) ;
- `DAYS_AHEAD` : nombre de jours programmés à l'avance (150).

Les notifications sont reprogrammées à chaque ouverture de l'application.
Une notification de rappel invite à la rouvrir environ 14 jours avant la fin de la période programmée.

## Sur Android

Après installation : autorisez les notifications, et si possible désactivez l'optimisation de batterie
pour l'application (Réglages > Applications > Anniversaires GED > Batterie > Sans restriction)
afin que la notification de 7 h arrive à l'heure.

`exemple.ged` est un petit fichier de test.
