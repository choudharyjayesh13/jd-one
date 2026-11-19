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
          <linearGradient id="jdg-core" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59a4a" />
            <stop offset="100%" stopColor="#c8560c" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#jdg-core)" />
        <circle cx="50" cy="50" r="42.5" fill="none" stroke="#fbe3c4" strokeOpacity=".55" strokeWidth="1" />
        <g className="jd-ring">
          <circle cx="50" cy="50" r="42.5" fill="none" stroke="#fff6ea" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="22 245" />
        </g>
        <text x="50" y="61" textAnchor="middle" fontSize="31" fill="#fffaf2" fontFamily="'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif" fontWeight="600" letterSpacing="1.5">
          JD
        </text>
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
          <Orb size={58} />
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
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="jd-burst" style={{ "--a": `${i * 60}deg`, animationDelay: "560ms" } as CSSProperties} />
            ))}
            <div className="jd-summon-orb">
              <Orb size={84} busy />
            </div>
          </div>
          <div className="jd-summon-hello">
            {user.post ? "Yes sir, my lord." : `At your service, ${first}.`}
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
                <span className="jd-a-serif text-[19px] tracking-[0.08em]">JD</span>
              </div>
              <div className="truncate text-[11.5px] text-white/80">{busy ? "Working on it…" : "Your assistant · always on"}</div>
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
                <p className="jd-a-serif mt-5 text-[22px] font-semibold leading-tight text-[#17140f]">{user.post ? "Yes sir, my lord." : `Yes, ${first}.`}</p>
                <p className="mt-1 text-[14px] text-[#6b6255]">What shall I do for you today?</p>
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
                            <em>Thinking</em>
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
              placeholder={listening ? "Listening…" : "Ask JD anything"}
              disabled={mode === "local" || !!ask}
              className="jd-input"
            />
            {canListen && (
              <button type="button" onClick={listen} className={`jd-mic ${listening ? "on" : ""}`} aria-label="Speak">
                <Mic className="h-[19px] w-[19px]" strokeWidth={1.75} />
              </button>
            )}
            <button type="submit" disabled={!text.trim() || busy || mode === "local"} className="jd-send" aria-label="Send">
              <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const CSS = `
.jd-a-serif{font-family:'Cormorant Garamond','Playfair Display',Georgia,'Times New Roman',serif}
.jd-orb{display:inline-flex;flex-shrink:0;border-radius:9999px;box-shadow:0 4px 14px rgba(200,86,12,.28)}
.jd-orb .jd-ring{transform-origin:50px 50px;opacity:0}
.jd-orb-busy .jd-ring{opacity:1;animation:jd-spin 1.3s linear infinite}

.jd-fab{position:fixed;right:16px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:45;display:flex;align-items:center;justify-content:center;border-radius:9999px;transition:transform .2s;-webkit-tap-highlight-color:transparent}
@media (min-width:1024px){.jd-fab{right:28px;bottom:28px}}
.jd-fab:hover{transform:translateY(-2px)}
.jd-fab:active{transform:scale(.95)}
.jd-fab::before{content:"";position:absolute;inset:-5px;border-radius:9999px;border:1px solid rgba(200,86,12,.35);animation:jd-halo 3.2s ease-out infinite}
.jd-fab-tip{position:absolute;right:68px;white-space:nowrap;background:#17140f;color:#fff;font-size:12px;font-weight:500;padding:6px 11px;border-radius:9999px;opacity:0;transform:translateX(6px);transition:.2s;pointer-events:none}
.jd-fab:hover .jd-fab-tip{opacity:1;transform:none}

.jd-summon{position:fixed;inset:0;z-index:60;pointer-events:none}
.jd-veil{position:absolute;inset:0;background:rgba(23,20,15,.42);backdrop-filter:blur(3px);animation:jd-fade-in .35s ease-out both}
.jd-summon-at{position:absolute;right:45px;bottom:calc(105px + env(safe-area-inset-bottom));width:0;height:0;animation:jd-rise 1.05s cubic-bezier(.5,0,.2,1) both}
@media (min-width:1024px){.jd-summon-at{right:57px;bottom:57px}}
.jd-spiral{position:absolute;left:-130px;top:-130px;stroke-dasharray:900;stroke-dashoffset:900;opacity:.75;animation:jd-draw .9s ease-out forwards,jd-spin 1.6s linear infinite}
.jd-summon-orb{position:absolute;left:-42px;top:-42px;animation:jd-whirl 1.05s cubic-bezier(.4,0,.2,1) both}
.jd-burst{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:9999px;background:#fbe3c4;opacity:0;animation:jd-burst .5s ease-out both}
.jd-summon-hello{position:absolute;left:50%;bottom:46%;transform:translateX(-50%);color:#fffaf2;font-family:'Cormorant Garamond','Playfair Display',Georgia,serif;font-size:28px;font-weight:600;letter-spacing:.02em;white-space:nowrap;animation:jd-hello 1.05s ease-out both}

.jd-panel{position:fixed;z-index:60;inset:8px;top:max(8px,env(safe-area-inset-top));bottom:max(8px,env(safe-area-inset-bottom));display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:#fffdf9;box-shadow:0 24px 70px rgba(23,20,15,.28),0 0 0 1px rgba(23,20,15,.06);transform-origin:calc(100% - 40px) calc(100% - 60px)}
@media (min-width:640px){.jd-panel{inset:auto;right:24px;bottom:24px;width:400px;height:min(640px,calc(100vh - 48px))}}
.jd-in{animation:jd-open .42s cubic-bezier(.2,.9,.25,1.1) both}
.jd-out{animation:jd-close .28s ease-in both}
.jd-head{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;background:#17140f;border-bottom:1px solid rgba(201,162,75,.35)}
.jd-icon{display:flex;height:38px;width:38px;align-items:center;justify-content:center;border-radius:9999px;color:rgba(255,255,255,.8)}
.jd-icon:hover{background:rgba(255,255,255,.1);color:#fff}
.jd-body{flex:1;overflow-y:auto;padding:18px 14px;display:flex;flex-direction:column;gap:14px}
.jd-empty{margin:auto 0;display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 6px}
.jd-chip{border:1px solid #e7e1d5;background:#fff;color:#3a332a;font-size:12.5px;padding:7px 12px;border-radius:9999px;transition:.15s}
.jd-chip:hover{border-color:#c8560c;color:#c8560c}
.jd-me{max-width:82%;background:#f3eee6;color:#17140f;border-radius:18px 18px 4px 18px;padding:9px 13px;font-size:14px;line-height:1.45;white-space:pre-wrap;animation:jd-pop .25s ease-out both}
.jd-them{padding:2px 2px;font-size:14px;line-height:1.55;color:#17140f;animation:jd-pop .25s ease-out both}
.jd-err{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:12px;padding:9px 12px}
.jd-step{display:flex;align-items:center;gap:6px;font-size:12px;color:#8a7d6b;width:fit-content;max-width:100%;animation:jd-pop .2s ease-out both}
.jd-step.running{color:#c8560c}
.jd-step.done svg{color:#15803d}
.jd-step.failed{color:#b45309}
.jd-thinking{display:flex;align-items:center;gap:4px;padding:8px 2px}
.jd-thinking span{height:6px;width:6px;border-radius:9999px;background:#c8560c;animation:jd-dot 1s ease-in-out infinite}
.jd-thinking span:nth-child(2){animation-delay:.15s}.jd-thinking span:nth-child(3){animation-delay:.3s}
.jd-thinking em{margin-left:6px;font-style:normal;font-size:12px;color:#9a8a75}
.jd-confirm{border:1px solid #fed7aa;background:#fff7ed;border-radius:16px;padding:12px 14px;animation:jd-pop .25s ease-out both}
.jd-foot{margin:10px;display:flex;align-items:flex-end;gap:4px;padding:6px 6px 6px 14px;border:1px solid #e7e1d5;border-radius:24px;background:#fff;box-shadow:0 1px 3px rgba(23,20,15,.05)}
.jd-foot:focus-within{border-color:#cfc6b6}
.jd-input{flex:1;resize:none;max-height:120px;min-height:36px;border:0;padding:8px 0;font-size:15px;outline:none;background:transparent}
.jd-mic,.jd-send{display:flex;height:36px;width:36px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9999px;transition:.15s}
.jd-mic{color:#6b6255}
.jd-mic:hover{background:#f3eee6;color:#17140f}
.jd-mic.on{color:#c8560c;background:#fdf0e4}
.jd-send{color:#fff;background:#c8560c}
.jd-send:disabled{background:#e7e1d5;color:#fff}

@keyframes jd-spin{to{transform:rotate(360deg)}}
@keyframes jd-halo{0%{opacity:.9;transform:scale(1)}80%,100%{opacity:0;transform:scale(1.35)}}
@keyframes jd-fade-in{from{opacity:0}}
@keyframes jd-draw{to{stroke-dashoffset:0}}
@keyframes jd-rise{0%{transform:translate(0,0)}100%{transform:translate(-20px,-80px)}}
@keyframes jd-whirl{0%{transform:scale(.7) rotate(0)}50%{transform:scale(1.4) rotate(360deg)}100%{transform:scale(2.2) rotate(380deg);opacity:0}}
@keyframes jd-burst{0%{opacity:1;transform:rotate(var(--a)) translateX(0)}100%{opacity:0;transform:rotate(var(--a)) translateX(90px)}}
@keyframes jd-hello{0%,30%{opacity:0;transform:translate(-50%,10px)}55%,85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}
@keyframes jd-open{0%{opacity:0;transform:scale(.2)}60%{opacity:1}100%{transform:none}}
@keyframes jd-close{to{opacity:0;transform:scale(.25)}}
@keyframes jd-pop{from{opacity:0;transform:translateY(5px)}}
@keyframes jd-dot{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-4px);opacity:1}}
@media (prefers-reduced-motion:reduce){.jd-orb *,.jd-fab::before{animation:none!important}}
`;
