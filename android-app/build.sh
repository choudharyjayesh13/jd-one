#!/usr/bin/env bash
# Builds the JD One Android app (APK). Run from android-app/ (GitHub Actions does this).
set -euo pipefail

npm install --no-audit --no-fund --legacy-peer-deps
echo "Versions:"; npm ls --depth=0 || true

npx cap add android

MAN=android/app/src/main/AndroidManifest.xml
# Location (duty location + attendance), camera (selfie), notification for the location service.
sed -i 's#</manifest>#    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>#' "$MAN"

STR=android/app/src/main/res/values/strings.xml
sed -i 's#</resources>#    <string name="capacitor_background_geolocation_notification_channel_name">Duty location</string>\n</resources>#' "$STR"

# App icon: the JD Group logo.
for d in android/app/src/main/res/mipmap-*; do
  [ -d "$d" ] || continue
  rm -f "$d"/ic_launcher*
  for n in ic_launcher ic_launcher_round ic_launcher_foreground; do cp ../public/icons/icon-512.png "$d/$n.png"; done
done
rm -rf android/app/src/main/res/mipmap-anydpi-v26

# Each build gets a higher version so it installs over the previous one.
RUN="${GITHUB_RUN_NUMBER:-1}"
sed -i -E "s/versionCode [0-9]+/versionCode ${RUN}/; s/versionName \"[^\"]*\"/versionName \"1.${RUN}\"/" android/app/build.gradle

# Signing key kept in the Actions cache (never in the repo), so every APK installs over the last.
KS="${JDONE_KEYSTORE:-$HOME/jdone-keystore/jdone.jks}"
mkdir -p "$(dirname "$KS")"
if [ ! -f "$KS" ]; then
  echo "Creating a new signing key"
  keytool -genkeypair -keystore "$KS" -alias jdone -storepass jdone-key -keypass jdone-key -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=JD One, O=JD Group, L=Udaipur, C=IN"
else
  echo "Using the saved signing key"
fi
python3 - "$KS" <<'PY'
import sys, re
ks = sys.argv[1]
p = "android/app/build.gradle"
s = open(p).read()
block = 'signingConfigs {\n        debug {\n            storeFile file("%s")\n            storePassword "jdone-key"\n            keyAlias "jdone"\n            keyPassword "jdone-key"\n        }\n    }\n    ' % ks
s = s.replace("android {\n", "android {\n    " + block, 1)
open(p, "w").write(s)
PY
grep -n "signingConfigs" -A6 android/app/build.gradle

npx cap sync android

cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon --stacktrace
cp app/build/outputs/apk/debug/app-debug.apk ../jd-one.apk
ls -la ../jd-one.apk
