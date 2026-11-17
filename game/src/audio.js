// Sound: every effect is synthesised with WebAudio — noise bursts, filtered
// sweeps and short oscillators. No audio files, no network, nothing to load.
// One job: play(name, options) with a master gain and a mute toggle.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise({ dur, type = 'lowpass', freq = 1200, gain = 0.5, at = 0, q = 0.8 }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone({ freq, endFreq = null, dur, type = 'sine', gain = 0.3, at = 0 }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const SHOTS = {
    pistol: () => { noise({ dur: 0.09, freq: 2400, gain: 0.5 }); tone({ freq: 190, endFreq: 70, dur: 0.08, type: 'square', gain: 0.22 }); },
    smg: () => { noise({ dur: 0.07, freq: 3000, gain: 0.42 }); tone({ freq: 230, endFreq: 90, dur: 0.06, type: 'square', gain: 0.18 }); },
    rifle: () => { noise({ dur: 0.12, freq: 1800, gain: 0.55 }); tone({ freq: 150, endFreq: 55, dur: 0.1, type: 'square', gain: 0.28 }); },
    marksman: () => { noise({ dur: 0.28, freq: 1100, gain: 0.7 }); tone({ freq: 120, endFreq: 40, dur: 0.24, type: 'square', gain: 0.32 }); },
    distant: () => { noise({ dur: 0.14, freq: 900, gain: 0.16 }); },
    enemy: () => { noise({ dur: 0.1, freq: 1500, gain: 0.12 }); },
  };

  function play(name, options = {}) {
    if (!ensure() || muted) return;
    switch (name) {
      case 'shot': {
        const kind = options.kind || 'rifle';
        (SHOTS[kind] || SHOTS.rifle)();
        break;
      }
      case 'distant-shot': SHOTS.distant(); break;
      case 'enemy-shot': SHOTS.enemy(); break;
      case 'dry': tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.12 }); break;
      case 'reload': {
        tone({ freq: 700, dur: 0.04, type: 'square', gain: 0.14 });
        tone({ freq: 500, dur: 0.04, type: 'square', gain: 0.14, at: 0.18 });
        tone({ freq: 900, dur: 0.05, type: 'square', gain: 0.16, at: 0.42 });
        break;
      }
      case 'hit': tone({ freq: 1800, dur: 0.05, type: 'sine', gain: 0.25 }); break;
      case 'kill': {
        tone({ freq: 1400, dur: 0.06, type: 'sine', gain: 0.25 });
        tone({ freq: 2100, dur: 0.09, type: 'sine', gain: 0.25, at: 0.07 });
        break;
      }
      case 'hurt': {
        noise({ dur: 0.12, freq: 500, gain: 0.3 });
        tone({ freq: 110, endFreq: 70, dur: 0.14, type: 'sawtooth', gain: 0.2 });
        break;
      }
      case 'step': noise({ dur: 0.05, freq: 400, gain: 0.05 }); break;
      case 'plant-beep': tone({ freq: 1100, dur: 0.09, type: 'square', gain: 0.2 }); break;
      case 'plant-done': {
        tone({ freq: 880, dur: 0.12, type: 'square', gain: 0.2 });
        tone({ freq: 1320, dur: 0.18, type: 'square', gain: 0.2, at: 0.12 });
        break;
      }
      case 'defuse-beep': tone({ freq: 1500, dur: 0.07, type: 'square', gain: 0.18 }); break;
      case 'explosion': {
        noise({ dur: 0.9, freq: 300, gain: 0.9 });
        tone({ freq: 90, endFreq: 30, dur: 0.8, type: 'sine', gain: 0.6 });
        break;
      }
      case 'round-win': {
        tone({ freq: 523, dur: 0.16, type: 'triangle', gain: 0.3 });
        tone({ freq: 659, dur: 0.16, type: 'triangle', gain: 0.3, at: 0.14 });
        tone({ freq: 784, dur: 0.3, type: 'triangle', gain: 0.3, at: 0.28 });
        break;
      }
      case 'round-lose': {
        tone({ freq: 392, dur: 0.18, type: 'triangle', gain: 0.3 });
        tone({ freq: 330, dur: 0.18, type: 'triangle', gain: 0.3, at: 0.16 });
        tone({ freq: 262, dur: 0.34, type: 'triangle', gain: 0.3, at: 0.32 });
        break;
      }
      case 'buy': tone({ freq: 1000, dur: 0.06, type: 'sine', gain: 0.2 }); break;
      case 'denied': tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.18 }); break;
      case 'click': tone({ freq: 800, dur: 0.04, type: 'sine', gain: 0.15 }); break;
      case 'throw': noise({ dur: 0.08, freq: 2000, gain: 0.2, type: 'bandpass' }); break;
      case 'flash': {
        noise({ dur: 0.4, freq: 6000, gain: 0.5, type: 'highpass' });
        tone({ freq: 2400, endFreq: 300, dur: 0.35, type: 'sine', gain: 0.25 });
        break;
      }
      default: break;
    }
  }

  return {
    play,
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
  };
}
