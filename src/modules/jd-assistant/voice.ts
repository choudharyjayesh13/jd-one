/**
 * Voice typing for JD.
 *  - In the JD One Android app (Capacitor WebView) the browser's speech API does
 *    not work, so we use Android's own speech recogniser through the
 *    @capacitor-community/speech-recognition plugin (shows Google's mic popup).
 *  - In a normal browser (Chrome, Safari) we use the Web Speech API.
 * Either way the result is plain text, or a clear error message.
 */

type NativeSpeech = {
  available(): Promise<{ available: boolean }>;
  checkPermissions(): Promise<{ speechRecognition: string }>;
  requestPermissions(): Promise<{ speechRecognition: string }>;
  start(o: { language?: string; maxResults?: number; prompt?: string; partialResults?: boolean; popup?: boolean }): Promise<{ matches?: string[] }>;
};

type Cap = { isNativePlatform?: () => boolean; registerPlugin?: (n: string) => unknown; Plugins?: Record<string, unknown> };

function native(): NativeSpeech | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: Cap }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const p = (cap.Plugins?.SpeechRecognition as NativeSpeech | undefined) ?? (cap.registerPlugin?.("SpeechRecognition") as NativeSpeech | undefined);
  return p ?? null;
}

const inAndroidApp = () => {
  if (typeof window === "undefined") return false;
  return !!(window as unknown as { Capacitor?: Cap }).Capacitor?.isNativePlatform?.() || /JDOneAndroid/.test(navigator.userAgent);
};

type WebRec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
function webCtor(): (new () => WebRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether to show the mic button at all. */
export function voiceSupported(): boolean {
  return !!native() || !!webCtor() || inAndroidApp();
}

const WEB_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission is blocked. Allow the microphone for this site in the browser settings, then try again.",
  "service-not-allowed": "Voice typing is not available in this browser. Please open JD One in Chrome, or type.",
  "no-speech": "I didn't hear anything. Tap the mic and speak again.",
  "audio-capture": "No microphone found on this device.",
  network: "Voice typing needs internet. Check the connection and try again.",
};

/** Listen once and return what was said. Throws an Error with a message for the person. */
export async function listenOnce(lang = "hi-IN"): Promise<string> {
  const n = native();
  if (n) {
    try {
      const { available } = await n.available();
      if (!available) throw new Error("Voice typing is not available on this phone (Google voice typing is missing or turned off).");
      let perm = (await n.checkPermissions()).speechRecognition;
      if (perm !== "granted") perm = (await n.requestPermissions()).speechRecognition;
      if (perm !== "granted") throw new Error("Microphone permission was not given. Allow it in Settings → Apps → JD One → Permissions.");
      const res = await n.start({ language: lang, maxResults: 1, prompt: "Boliye…", partialResults: false, popup: true });
      return (res.matches?.[0] ?? "").trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Closing Google's popup without speaking is not an error worth showing.
      if (/no match|cancel/i.test(msg)) return "";
      throw new Error(msg);
    }
  }
  if (inAndroidApp()) throw new Error("Voice typing needs the latest JD One app. Please update the app (Downloads → JD One for Android), or type for now.");

  const Ctor = webCtor();
  if (!Ctor) throw new Error("Voice typing is not available in this browser. Please use Chrome, or type.");
  return new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let text = "";
    let failed = false;
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    rec.onerror = (e) => {
      failed = true;
      if (e.error === "aborted") resolve(text);
      else reject(new Error(WEB_ERRORS[e.error] ?? `Voice typing stopped (${e.error}). Please try again or type.`));
    };
    rec.onend = () => {
      if (!failed) resolve(text);
    };
    try {
      rec.start();
    } catch {
      reject(new Error("Could not start the microphone. Please try again."));
    }
  });
}
