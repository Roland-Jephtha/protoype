import { AUDIO } from '../../config/audio';

/**
 * Procedural sound (Web Audio, no sound files): looping beds whose level the
 * game sets each frame (flight wind, heat-vision hum, breath, Nova charge,
 * ambience) and one-shot effects (punches, explosions, zaps, booms).
 * The context starts on the first user gesture, as browsers require.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops = new Map<string, { gain: GainNode; filter?: BiquadFilterNode; osc?: OscillatorNode }>();

  /** Creates or resumes the context (call from a user gesture). */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = AUDIO.master;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.buildLoops();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    else if (!paused && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private buildLoops() {
    const ctx = this.ctx!;
    const add = (name: string, type: BiquadFilterType, freq: number, q = 1, osc?: { type: OscillatorType; freq: number }) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master!);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      filter.connect(gain);
      let o: OscillatorNode | undefined;
      if (osc) {
        o = ctx.createOscillator();
        o.type = osc.type;
        o.frequency.value = osc.freq;
        o.connect(filter);
        o.start();
      } else {
        const n = this.noiseSource();
        n.connect(filter);
        n.start();
      }
      this.loops.set(name, { gain, filter, osc: o });
    };
    add('wind', 'bandpass', 400, 0.6);
    add('heat', 'lowpass', 1800, 2, { type: 'sawtooth', freq: 92 });
    add('heatHiss', 'highpass', 3000, 0.7);
    add('breath', 'bandpass', 900, 0.8);
    add('nova', 'lowpass', 2400, 3, { type: 'triangle', freq: 110 });
    add('ambience', 'lowpass', 500, 0.5);
    add('hum', 'lowpass', 300, 1, { type: 'sine', freq: 55 });
  }

  /** Sets a loop's level (0..1 of its configured maximum) and optional filter/pitch. */
  setLoop(name: keyof typeof AUDIO.loops, level: number, opts: { freq?: number; pitch?: number } = {}) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * AUDIO.loops[name], t, 0.08);
    if (opts.freq !== undefined && l.filter) l.filter.frequency.setTargetAtTime(opts.freq, t, 0.1);
    if (opts.pitch !== undefined && l.osc) l.osc.frequency.setTargetAtTime(opts.pitch, t, 0.05);
  }

  /** One-shot effects. `strength` 0..1 scales loudness. */
  play(kind: 'punch' | 'power' | 'explosion' | 'zap' | 'hurt' | 'boom' | 'throw' | 'freeze', strength = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(this.master);
    const vol = AUDIO.shots[kind] * Math.max(0.1, Math.min(1, strength));
    const env = (g: GainNode, attack: number, decay: number, peak: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const thump = (from: number, to: number, decay: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + decay);
      const g = ctx.createGain();
      env(g, 0.005, decay, vol);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
    };
    const burst = (type: BiquadFilterType, freq: number, decay: number, peak: number) => {
      const n = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + decay);
      const g = ctx.createGain();
      env(g, 0.004, decay, peak);
      n.connect(f).connect(g).connect(out);
      n.start(t);
      n.stop(t + decay + 0.05);
    };
    if (kind === 'punch') {
      thump(160, 50, 0.18);
      burst('bandpass', 2200, 0.06, vol * 0.6);
    } else if (kind === 'power') {
      thump(120, 35, 0.45);
      burst('lowpass', 1800, 0.35, vol * 0.8);
    } else if (kind === 'explosion') {
      burst('lowpass', 1400, 1.1, vol);
      thump(80, 30, 0.8);
    } else if (kind === 'boom') {
      thump(70, 20, 1.6);
      burst('lowpass', 900, 1.8, vol);
    } else if (kind === 'zap') {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.15);
      const g = ctx.createGain();
      env(g, 0.003, 0.15, vol);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.2);
    } else if (kind === 'hurt') {
      thump(220, 90, 0.2);
    } else if (kind === 'throw') {
      burst('bandpass', 700, 0.5, vol);
    } else if (kind === 'freeze') {
      burst('highpass', 5000, 0.4, vol);
    }
    setTimeout(() => out.disconnect(), 2500);
  }
}

export const audio = new AudioEngine();
