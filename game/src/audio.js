// All sound is synthesised with WebAudio: no audio files, no network. A tiny
// generative music loop (bass pulse + pentatonic arpeggio, A minor) runs under
// short effects for shooting, hits, pickups, level-ups, dashes and boss events.
// Audio starts only after the first user gesture, as browsers require.
export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let nextNote = 0;
  let step = 0;

  // A minor pentatonic, two octaves up from A3.
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 784];
  const BASS = [55, 55, 65.41, 49];

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!context || muted) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function scheduleMusic() {
    if (!context || muted) return;
    const spb = 60 / 112 / 2; // eighth notes at 112 BPM
    while (nextNote < context.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % 4;
      const beat = step % 8;
      if (beat === 0) {
        const f = BASS[bar];
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.5, nextNote);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNote + spb * 1.9);
        osc.connect(gain); gain.connect(musicGain);
        osc.start(nextNote); osc.stop(nextNote + spb * 2);
      }
      if (beat % 2 === 0) {
        const idx = (step * 7 + bar * 3) % SCALE.length;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = SCALE[idx];
        gain.gain.setValueAtTime(0.22, nextNote);
        gain.gain.exponentialRampToValueAtTime(0.001, nextNote + spb * 1.4);
        osc.connect(gain); gain.connect(musicGain);
        osc.start(nextNote); osc.stop(nextNote + spb * 1.5);
      }
      nextNote += spb;
      step += 1;
    }
  }

  return {
    get muted() { return muted; },
    /** Call from any user gesture; starts the context and the music loop. */
    unlock() {
      if (!ensure()) return;
      if (musicTimer === null) {
        nextNote = context.currentTime + 0.1;
        musicTimer = window.setInterval(scheduleMusic, 120);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() { tone(880 + Math.random() * 120, 0.07, 'square', 0.05, 0, 520); },
    hit() { tone(180, 0.06, 'sawtooth', 0.08, 0, 90); },
    kill() { tone(320, 0.12, 'triangle', 0.12, 0, 60); },
    pickup() { tone(660 + Math.random() * 80, 0.09, 'sine', 0.10, 0, 1320); },
    dash() { tone(300, 0.14, 'sine', 0.10, 0, 900); },
    hurt() { tone(140, 0.22, 'sawtooth', 0.16, 0, 55); },
    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, i * 0.07));
    },
    boss() {
      tone(98, 0.7, 'sawtooth', 0.18, 0, 49);
      tone(147, 0.7, 'sawtooth', 0.12, 0.05, 73);
    },
    victory() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.11));
    },
    gameOver() {
      [392, 329.63, 261.63, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.13, i * 0.14));
    },
  };
}
