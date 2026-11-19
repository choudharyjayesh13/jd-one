"use client";
/**
 * JD — the genie of JD One. An orange orb floats in the corner of every
 * screen; tap it and JD rises out of it in a swirl of smoke and sparks, then
 * opens as a chat. Behind the scenes it is Claude (see api.ts / tools.ts),
 * working only within the signed-in person's own rights.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Check, Loader2, Mic, RotateCcw, X, AlertTriangle } from "lucide-react";
import { useAuth, useUser } from "@/core/auth/AuthProvider";
import { askJD, type ApiMessage, type Step } from "./api";

type Phase = "closed" | "summon" | "open" | "leaving";

interface ChatItem {
  role: "user" | "jd";
  text: string;
  steps?: Step[];
  error?: boolean;
}

const STORE_KEY = "jdone.jd.chat.v1";

function loadChat(): { items: ChatItem[]; history: ApiMessage[] } | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveChat(items: ChatItem[], history: ApiMessage[]) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ items: items.slice(-60), history: history.slice(-60) }));
  } catch {
    /* storage full or blocked: chat just isn't kept */
  }
}

function suggestionsFor(post: string | null): string[] {
  if (post)
    return ["Aaj ke arrivals aur pending payments batao", "Is mahine ka total expense kitna hua?", "Aaj kaun absent hai?", "Open tickets dikhao"];
  return ["Aaj mera kya kaam hai?", "Mujhe kal ki leave chahiye", "Guest request add karo", "Aaj ke arrivals kaun hain?"];
}

/* ---------------- The orb (also used as JD's avatar) ---------------- */

function Orb({ size = 64, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <span className={`jd-orb ${busy ? "jd-orb-busy" : ""}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id="jdg-core" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffe2b8" />
            <stop offset="35%" stopColor="#ffa24a" />
            <stop offset="75%" stopColor="#ee6f12" />
            <stop offset="100%" stopColor="#b54500" />
          </radialGradient>
          <linearGradient id="jdg-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffd28a" />
            <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <g className="jd-ring">
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#jdg-ring)" strokeWidth="2" strokeDasharray="10 7" />
        </g>
        <g className="jd-ring2">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#ffd9a8" strokeOpacity=".55" strokeWidth="1" strokeDasharray="2 9" />
        </g>
        <circle cx="50" cy="50" r="33" fill="url(#jdg-core)" />
        <ellipse cx="40" cy="36" rx="12" ry="7" fill="#fff" opacity=".35" />
        <text x="50" y="58" textAnchor="middle" fontSize="23" fontWeight="800" fill="#fff" fontFamily="-apple-system, Segoe UI, Roboto, sans-serif" letterSpacing="1">
          JD
        </text>
        <circle className="jd-spark s1" cx="86" cy="22" r="2.4" fill="#ffd28a" />
        <circle className="jd-spark s2" cx="14" cy="70" r="1.8" fill="#fff1dc" />
        <circle className="jd-spark s3" cx="80" cy="84" r="1.6" fill="#ffb066" />
      </svg>
    </span>
  );
}

/* ---------------- Tiny formatter: **bold**, lists, line breaks ---------------- */

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
  );
}
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((l, i) => {
        const bullet = /^\s*[-•*]\s+/.test(l);
        const t = l.replace(/^\s*[-•*]\s+/, "").replace(/^#+\s*/, "");
        if (!t.trim()) return <div key={i} className="h-2" />;
        return (
          <div key={i} className={bullet ? "flex gap-2 pl-1" : ""}>
            {bullet && <span className="text-[#ee6f12]">•</span>}
            <span>{inline(t)}</span>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Main component ---------------- */

export function JdAssistant({ property }: { property: string }) {
  const user = useUser();
  const { mode } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("closed");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<ApiMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [ask, setAsk] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = loadChat();
    if (saved) {
      setItems(saved.items);
      setHistory(saved.history);
    }
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items, busy, ask]);

  const open = useCallback(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("open");
      return;
    }
    setPhase("summon");
    window.setTimeout(() => setPhase("open"), 1050);
  }, []);

  const close = useCallback(() => {
    setPhase("leaving");
    window.setTimeout(() => setPhase("closed"), 320);
  }, []);

  useEffect(() => {
    if (phase === "open") window.setTimeout(() => input.current?.focus(), 350);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && phase === "open" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  const send = async (raw?: string) => {
    const msg = (raw ?? text).trim();
    if (!msg || busy) return;
    setText("");
    const jdIndex = items.length + 1;
    const nextItems: ChatItem[] = [...items, { role: "user", text: msg }, { role: "jd", text: "", steps: [] }];
    setItems(nextItems);
    setBusy(true);
    const onStep = (s: Step) =>
      setItems((cur) => {
        const copy = [...cur];
        const it = copy[jdIndex];
        if (!it) return cur;
        const steps = [...(it.steps ?? [])];
        const at = steps.findIndex((x) => x.id === s.id);
        if (at >= 0) steps[at] = s;
        else steps.push(s);
        copy[jdIndex] = { ...it, steps };
        return copy;
      });
    try {
      const res = await askJD(
        [...history, { role: "user", content: msg }],
        {
          user,
          property,
          path: pathname,
          navigate: (p) => router.push(p),
          confirm: (message) => new Promise<boolean>((resolve) => setAsk({ message, resolve })),
        },
        onStep,
      );
      setHistory(res.history);
      setItems((cur) => {
        const copy = [...cur];
        copy[jdIndex] = { ...copy[jdIndex], text: res.reply || "Done." };
        saveChat(copy, res.history);
        return copy;
      });
    } catch (e) {
      setItems((cur) => {
        const copy = [...cur];
        copy[jdIndex] = { ...copy[jdIndex], text: e instanceof Error ? e.message : "Something went wrong.", error: true };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  const reset = () => {
    setItems([]);
    setHistory([]);
    saveChat([], []);
  };

  const listen = () => {
    type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start: () => void };
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "hi-IN";
    rec.interimResults = false;
    rec.onresult = (e) => setText((t) => (t ? t + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const canListen = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const first = user.name.split(" ")[0];

  return (
    <>
      <style>{CSS}</style>

      {/* Floating genie */}
      {phase === "closed" && (
        <button type="button" onClick={open} className="jd-fab print:hidden" aria-label="Open JD assistant">
          <span className="jd-smoke" aria-hidden>
            <svg viewBox="0 0 40 60" width="34" height="50">
              <path d="M20 2 C 34 14, 6 22, 20 34 S 30 50, 14 58" fill="none" stroke="url(#jdg-tail)" strokeWidth="7" strokeLinecap="round" />
              <defs>
                <linearGradient id="jdg-tail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff9a3d" stopOpacity=".85" />
                  <stop offset="100%" stopColor="#ff9a3d" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <Orb size={62} />
          <span className="jd-fab-tip">Ask JD</span>
        </button>
      )}

      {/* Summon: smoke spiral + spinning orb + sparks */}
      {phase === "summon" && (
        <div className="jd-summon print:hidden" aria-hidden>
          <div className="jd-veil" />
          <div className="jd-summon-at">
            <svg className="jd-spiral" viewBox="0 0 200 200" width="260" height="260">
              <path
                d="M100 100 m0 -6 a6 6 0 1 1 -1 0 M100 100 C 130 90 128 60 100 58 C 62 56 58 104 86 124 C 120 148 160 120 156 82 C 150 30 80 18 52 52 C 22 90 40 160 104 168 C 160 174 190 120 182 80"
                fill="none"
                stroke="#ff9a3d"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="jd-burst" style={{ "--a": `${i * 36}deg`, animationDelay: `${520 + (i % 3) * 40}ms` } as CSSProperties} />
            ))}
            <div className="jd-summon-orb">
              <Orb size={84} busy />
            </div>
          </div>
          <div className="jd-summon-hello">
            Namaste {first}, <b>JD</b> haazir hai ✨
          </div>
        </div>
      )}

      {/* Chat */}
      {(phase === "open" || phase === "leaving") && (
        <div className={`jd-panel print:hidden ${phase === "leaving" ? "jd-out" : "jd-in"}`} role="dialog" aria-label="JD assistant">
          <header className="jd-head">
            <Orb size={42} busy={busy} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[16px] font-semibold text-white">
                JD <span className="rounded-full bg-white/15 px-2 py-[1px] text-[10px] font-medium uppercase tracking-[0.14em]">AI</span>
              </div>
              <div className="truncate text-[11.5px] text-white/80">{busy ? "Kaam chal raha hai…" : user.post ? "Full access · always on" : "Your JD One assistant · always on"}</div>
            </div>
            {items.length > 0 && (
              <button type="button" onClick={reset} className="jd-icon" aria-label="New chat" title="New chat">
                <RotateCcw className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="button" onClick={close} className="jd-icon" aria-label="Close JD">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={scroller} className="jd-body">
            {mode === "local" ? (
              <div className="jd-empty">
                <Orb size={72} />
                <p className="mt-4 text-sm text-[#6b6255]">JD works when JD One is connected to the shared database. This device is in local mode.</p>
              </div>
            ) : items.length === 0 ? (
              <div className="jd-empty">
                <Orb size={76} />
                <p className="mt-4 text-[17px] font-semibold text-[#17140f]">Hukum {first}, kya kaam hai?</p>
                <p className="mt-1 max-w-[280px] text-[13px] text-[#6b6255]">
                  Entries, records, reports, leave, guests — bas likhiye ya boliye. Main sirf wahi karunga jo aapke login ko allowed hai.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {suggestionsFor(user.post).map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="jd-chip">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              items.map((it, i) =>
                it.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="jd-me">{it.text}</div>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-2">
                    <Orb size={28} busy={busy && i === items.length - 1} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {!!it.steps?.length && (
                        <div className="flex flex-col gap-1">
                          {it.steps.map((s) => (
                            <div key={s.id} className={`jd-step ${s.state}`}>
                              {s.state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.state === "done" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                              <span className="truncate">{s.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {it.text ? (
                        <div className={`jd-them ${it.error ? "jd-err" : ""}`}>
                          <Rich text={it.text} />
                        </div>
                      ) : (
                        busy &&
                        i === items.length - 1 && (
                          <div className="jd-thinking">
                            <span />
                            <span />
                            <span />
                            <em>JD soch raha hai</em>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ),
              )
            )}

            {ask && (
              <div className="jd-confirm">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#9a3412]">
                  <AlertTriangle className="h-4 w-4" /> Confirm
                </div>
                <p className="mt-1 whitespace-pre-line text-[13.5px] text-[#17140f]">{ask.message}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => answer(true)} className="rounded-lg bg-[#b91c1c] px-4 py-2 text-[13px] font-semibold text-white">
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => answer(false)} className="rounded-lg border border-[#e7e1d5] px-4 py-2 text-[13px]">
                    No
                  </button>
                </div>
              </div>
            )}
          </div>

          <form
            className="jd-foot"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              ref={input}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={listening ? "Bol rahe hain… sun raha hoon" : "JD se kahiye…"}
              disabled={mode === "local" || !!ask}
              className="jd-input"
            />
            {canListen && (
              <button type="button" onClick={listen} className={`jd-mic ${listening ? "on" : ""}`} aria-label="Speak">
                <Mic className="h-[18px] w-[18px]" />
              </button>
            )}
            <button type="submit" disabled={!text.trim() || busy || mode === "local"} className="jd-send" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const CSS = `
.jd-orb{display:inline-flex;flex-shrink:0;border-radius:9999px;filter:drop-shadow(0 6px 18px rgba(238,111,18,.45))}
.jd-orb .jd-ring{transform-origin:50px 50px;animation:jd-spin 9s linear infinite}
.jd-orb .jd-ring2{transform-origin:50px 50px;animation:jd-spin 14s linear infinite reverse}
.jd-orb-busy .jd-ring{animation-duration:1.4s}
.jd-orb-busy .jd-ring2{animation-duration:2.2s}
.jd-orb-busy{animation:jd-pulse 1.2s ease-in-out infinite}
.jd-spark{animation:jd-twinkle 2.4s ease-in-out infinite}
.jd-spark.s2{animation-delay:.8s}.jd-spark.s3{animation-delay:1.5s}

.jd-fab{position:fixed;right:16px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:45;display:flex;align-items:center;justify-content:center;border-radius:9999px;animation:jd-bob 3.2s ease-in-out infinite;-webkit-tap-highlight-color:transparent}
@media (min-width:1024px){.jd-fab{right:28px;bottom:28px}}
.jd-fab:active{transform:scale(.94)}
.jd-fab::before{content:"";position:absolute;inset:-6px;border-radius:9999px;background:radial-gradient(circle,rgba(255,138,40,.35),transparent 70%);animation:jd-glow 2.6s ease-in-out infinite}
.jd-smoke{position:absolute;bottom:-34px;right:6px;opacity:.9;animation:jd-sway 2.6s ease-in-out infinite;transform-origin:top center}
.jd-fab-tip{position:absolute;right:72px;white-space:nowrap;background:#17140f;color:#fff;font-size:12px;font-weight:600;padding:6px 11px;border-radius:9999px;opacity:0;transform:translateX(6px);transition:.2s;pointer-events:none}
.jd-fab:hover .jd-fab-tip{opacity:1;transform:none}

.jd-summon{position:fixed;inset:0;z-index:60;pointer-events:none}
.jd-veil{position:absolute;inset:0;background:radial-gradient(circle at calc(100% - 50px) calc(100% - 110px),rgba(255,140,40,.28),rgba(23,20,15,.55) 60%);animation:jd-fade-in .35s ease-out both}
.jd-summon-at{position:absolute;right:47px;bottom:calc(107px + env(safe-area-inset-bottom));width:0;height:0;animation:jd-rise 1.05s cubic-bezier(.5,0,.2,1) both}
@media (min-width:1024px){.jd-summon-at{right:59px;bottom:59px}}
.jd-spiral{position:absolute;left:-130px;top:-130px;stroke-dasharray:900;stroke-dashoffset:900;filter:drop-shadow(0 0 10px rgba(255,140,40,.8));animation:jd-draw 0.9s ease-out forwards,jd-spin 1.1s linear infinite;opacity:.9}
.jd-summon-orb{position:absolute;left:-42px;top:-42px;animation:jd-whirl 1.05s cubic-bezier(.4,0,.2,1) both}
.jd-burst{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:9999px;background:#ffd28a;box-shadow:0 0 12px #ffb066;opacity:0;animation:jd-burst .55s ease-out both}
.jd-summon-hello{position:absolute;left:50%;bottom:calc(46% );transform:translateX(-50%);color:#fff;font-size:20px;text-shadow:0 2px 14px rgba(0,0,0,.4);white-space:nowrap;animation:jd-hello 1.05s ease-out both}

.jd-panel{position:fixed;z-index:60;inset:8px;top:max(8px,env(safe-area-inset-top));bottom:max(8px,env(safe-area-inset-bottom));display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:#fffdf9;box-shadow:0 30px 80px rgba(23,20,15,.35),0 0 0 1px rgba(238,111,18,.25);transform-origin:calc(100% - 40px) calc(100% - 60px)}
@media (min-width:640px){.jd-panel{inset:auto;right:24px;bottom:24px;width:410px;height:min(660px,calc(100vh - 48px))}}
.jd-in{animation:jd-open .45s cubic-bezier(.2,.9,.25,1.15) both}
.jd-out{animation:jd-close .3s ease-in both}
.jd-head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;background:linear-gradient(120deg,#ff8a2b,#e2600c 55%,#b84a06);position:relative;overflow:hidden}
.jd-head::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.22) 50%,transparent 70%);transform:translateX(-100%);animation:jd-sheen 4.5s ease-in-out infinite}
.jd-icon{position:relative;z-index:1;display:flex;height:38px;width:38px;align-items:center;justify-content:center;border-radius:9999px;color:#fff}
.jd-icon:hover{background:rgba(255,255,255,.16)}
.jd-body{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:14px;background:radial-gradient(circle at 100% 0,rgba(255,154,61,.08),transparent 40%)}
.jd-empty{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 6px}
.jd-chip{border:1px solid rgba(238,111,18,.35);background:#fff;color:#9a3d06;font-size:12.5px;padding:7px 12px;border-radius:9999px;transition:.15s}
.jd-chip:hover{background:#fff3e6}
.jd-me{max-width:82%;background:#17140f;color:#fff;border-radius:18px 18px 4px 18px;padding:9px 13px;font-size:14px;line-height:1.45;white-space:pre-wrap;animation:jd-pop .25s ease-out both}
.jd-them{background:#fff;border:1px solid #efe6d8;border-radius:4px 18px 18px 18px;padding:10px 13px;font-size:14px;line-height:1.5;color:#17140f;animation:jd-pop .25s ease-out both}
.jd-err{border-color:#fecaca;background:#fef2f2;color:#991b1b}
.jd-step{display:flex;align-items:center;gap:6px;font-size:12px;color:#7a6a55;background:#fbf6ee;border:1px solid #f0e4d2;border-radius:9999px;padding:4px 10px;width:fit-content;max-width:100%;animation:jd-pop .2s ease-out both}
.jd-step.running{color:#c2560a;border-color:#fdd9b5;background:linear-gradient(90deg,#fff7ef,#ffe9d4,#fff7ef);background-size:200% 100%;animation:jd-shimmer 1.2s linear infinite}
.jd-step.done svg{color:#15803d}
.jd-step.failed{color:#b45309}
.jd-thinking{display:flex;align-items:center;gap:4px;padding:10px 4px}
.jd-thinking span{height:7px;width:7px;border-radius:9999px;background:#ee6f12;animation:jd-dot 1s ease-in-out infinite}
.jd-thinking span:nth-child(2){animation-delay:.15s}.jd-thinking span:nth-child(3){animation-delay:.3s}
.jd-thinking em{margin-left:6px;font-style:normal;font-size:12px;color:#9a8a75}
.jd-confirm{border:1px solid #fed7aa;background:#fff7ed;border-radius:16px;padding:12px 14px;animation:jd-pop .25s ease-out both}
.jd-foot{display:flex;align-items:flex-end;gap:8px;padding:10px;border-top:1px solid #efe6d8;background:#fff}
.jd-input{flex:1;resize:none;max-height:120px;min-height:44px;border:1px solid #e7e1d5;border-radius:22px;padding:11px 15px;font-size:15px;outline:none;background:#fffdf9}
.jd-input:focus{border-color:#ee8122;box-shadow:0 0 0 3px rgba(238,129,34,.15)}
.jd-mic,.jd-send{display:flex;height:44px;width:44px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9999px}
.jd-mic{color:#6b6255;border:1px solid #e7e1d5}
.jd-mic.on{color:#fff;background:#dc2626;border-color:#dc2626;animation:jd-pulse 1s infinite}
.jd-send{color:#fff;background:linear-gradient(135deg,#ff9a3d,#e2600c);box-shadow:0 6px 16px rgba(226,96,12,.35)}
.jd-send:disabled{opacity:.4;box-shadow:none}

@keyframes jd-spin{to{transform:rotate(360deg)}}
@keyframes jd-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes jd-twinkle{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes jd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes jd-glow{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
@keyframes jd-sway{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}
@keyframes jd-fade-in{from{opacity:0}}
@keyframes jd-draw{to{stroke-dashoffset:0}}
@keyframes jd-rise{0%{transform:translate(0,0)}55%{transform:translate(-18px,-60px)}100%{transform:translate(-20px,-80px)}}
@keyframes jd-whirl{0%{transform:scale(.7) rotate(0)}45%{transform:scale(1.5) rotate(540deg)}75%{transform:scale(1.25) rotate(720deg)}100%{transform:scale(2.6) rotate(760deg);opacity:0}}
@keyframes jd-burst{0%{opacity:1;transform:rotate(var(--a)) translateX(0) scale(1)}100%{opacity:0;transform:rotate(var(--a)) translateX(120px) scale(.3)}}
@keyframes jd-hello{0%,30%{opacity:0;transform:translate(-50%,12px)}55%,85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}
@keyframes jd-open{0%{opacity:0;transform:scale(.15) rotate(-12deg)}60%{opacity:1}100%{transform:none}}
@keyframes jd-close{to{opacity:0;transform:scale(.2) rotate(10deg)}}
@keyframes jd-sheen{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
@keyframes jd-pop{from{opacity:0;transform:translateY(6px) scale(.98)}}
@keyframes jd-shimmer{to{background-position:-200% 0}}
@keyframes jd-dot{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-5px);opacity:1}}
@media (prefers-reduced-motion:reduce){.jd-orb *,.jd-fab,.jd-fab::before,.jd-smoke,.jd-head::after{animation:none!important}}
`;
