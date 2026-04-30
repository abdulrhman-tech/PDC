/* Synthesised page-flip sound effect for the flipbook reader.

   We deliberately avoid bundling an .mp3/.wav asset:
   - no extra network request on first paint
   - no licensing concerns
   - identical output across browsers (Web Audio is everywhere)

   The sound is a short burst of low-passed white noise with a quick
   attack and exponential decay — a reasonable approximation of paper
   rustling. A subtle low sine "thump" underneath gives the flip a
   bit of body. Total duration ~220 ms, peak gain ~0.18 so it stays
   quiet enough to hear on top of music or videos. */

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
        audioCtx = new Ctor();
        return audioCtx;
    } catch {
        return null;
    }
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.3); // 300 ms of noise source material
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buf;
    return buf;
}

export function playPageFlipSound(): void {
    const ctx = getCtx();
    if (!ctx) return;

    // Browsers require a user gesture before the first sound; resume()
    // is a no-op once the context is already running.
    if (ctx.state === "suspended") {
        ctx.resume().catch(() => { /* ignore */ });
    }

    const now = ctx.currentTime;
    const duration = 0.22;

    // ── Layer 1: filtered white noise (paper rustle) ──
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(2400, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(900, now + duration);
    noiseFilter.Q.value = 0.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);

    // ── Layer 2: short low-frequency thump for body ──
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(160, now);
    thump.frequency.exponentialRampToValueAtTime(70, now + 0.12);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);

    thump.start(now);
    thump.stop(now + 0.14);
}
