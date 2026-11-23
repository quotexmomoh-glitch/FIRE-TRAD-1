# Quotex Signals (Android) – script v6.2 dans une WebView

## Obtenir l'APK sans rien installer (GitHub Actions)
1. Créez un dépôt GitHub (privé conseillé) et envoyez-y tout ce dossier
   (web : « Add file > Upload files », en gardant le dossier `.github`).
2. Onglet **Actions** > « Build APK » > **Run workflow** (ou il se lance au push).
3. Quand c'est vert : ouvrez l'exécution > **Artifacts** > `QuotexSignals-apk` > téléchargez le ZIP, extrayez `app-debug.apk`.
4. Sur le téléphone : ouvrez l'APK, autorisez « Installer des applications inconnues ».

## Ou avec Android Studio
Ouvrir le dossier > Build > Build APK(s). Fichier : `app/build/outputs/apk/debug/app-debug.apk`.

## Utilisation
- L'app ouvre https://quotex.com/en/demo-trade ; le script est injecté avant le chargement de la page.
- Configurez Telegram dans la console du script ou en modifiant `app/src/main/assets/quotex_signals.js`
  (champs `tgToken` / `tgChatId`, puis recompiler).
- Pour changer le script : remplacez `app/src/main/assets/quotex_signals.js` et recompilez.
- Le clic automatique reste limité à l'URL contenant « demo » (`demoOnly = true`).
