/**
 * 사실적인 종소리를 Web Audio API로 합성.
 * 실제 종(bell)의 물리 특성을 반영:
 *  - Strike transient (타격 순간 고역 노이즈) — 부드럽게
 *  - Inharmonic partials (Hum, Prime, Tierce, Quint, Nominal 등) — 긴 감쇠
 *  - Slight pitch bend (타격 직후 미세한 주파수 변화 — 실제 종의 특성)
 *  - FM synthesis로 금속성 body 추가
 *  - Convolution reverb 긴 공명 tail (약 3.5초 — 기존 대비 25%↑)
 *
 * `playBellSound(volume, rings)` — rings 수 만큼 간격두고 반복 타격.
 */

function createReverbIR(ctx: AudioContext, duration = 3.5, decay = 3.2): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.floor(sampleRate * duration)
  const buffer = ctx.createBuffer(2, length, sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      // 초기 짧은 early reflection + 긴 지수 감쇠 tail
      const t = i / length
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
  }
  return buffer
}

/** 단일 타격(strike) 한 번 — 내부용. 여러 번 울리려면 `playBellSound` 사용. */
function scheduleStrike(ctx: AudioContext, masterBus: GainNode, startTime: number, amplitude = 1): void {
  const now = startTime

  // 리버브 · 드라이 체인 — strike 마다 신선한 경로.
  const convolver = ctx.createConvolver()
  convolver.buffer = createReverbIR(ctx, 3.5, 3.2)
  const wet = ctx.createGain()
  wet.gain.value = 0.55 * amplitude
  convolver.connect(wet)
  wet.connect(masterBus)

  const reverbSend = ctx.createGain()
  reverbSend.gain.value = 1
  reverbSend.connect(convolver)

  const dry = ctx.createGain()
  dry.gain.value = 0.8 * amplitude
  dry.connect(masterBus)

  const busses = [dry, reverbSend]
  const connectToAll = (node: AudioNode): void => {
    for (const b of busses) node.connect(b)
  }

  // ─── 1) Strike transient — 부드러운 타격감 (고역 노이즈 짧게) ───
  const noiseLen = Math.floor(ctx.sampleRate * 0.018)
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
  const nd = noiseBuf.getChannelData(0)
  for (let i = 0; i < noiseLen; i++) {
    // exponential falloff — 더 부드러움
    nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2)
  }
  const noiseSrc = ctx.createBufferSource()
  noiseSrc.buffer = noiseBuf
  const noiseHP = ctx.createBiquadFilter()
  noiseHP.type = 'bandpass'
  noiseHP.frequency.value = 3200
  noiseHP.Q.value = 1.6
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.22 * amplitude, now) // 기존 0.35 → 0.22 (부드럽게)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
  noiseSrc.connect(noiseHP)
  noiseHP.connect(noiseGain)
  connectToAll(noiseGain)
  noiseSrc.start(now)

  // ─── 2) Inharmonic partials — 종 고유 배음. 감쇠 시간 25%↑. ───
  // C5 = 523.25Hz 기준. 실제 교회종처럼 Hum(저음) 가장 길게 유지.
  const fund = 523.25
  const partials = [
    // freq ratio, decay sec, peak amp
    { r: 0.5,  d: 5.0, a: 0.36 }, // Hum — 가장 길게, 음 정체성
    { r: 1.0,  d: 3.5, a: 0.46 }, // Prime (Strike note)
    { r: 1.19, d: 2.8, a: 0.28 }, // Tierce (minor third) — 1.2 → 1.19 (인하모닉 강화)
    { r: 1.5,  d: 2.5, a: 0.24 }, // Quint (perfect fifth)
    { r: 2.0,  d: 1.8, a: 0.22 }, // Nominal (octave above strike)
    { r: 2.38, d: 1.3, a: 0.13 }, // Upper minor third — 2.4 → 2.38
    { r: 3.01, d: 1.0, a: 0.10 }, // Upper fifth
    { r: 4.12, d: 0.75, a: 0.07 }, // Bright sparkle
    { r: 5.42, d: 0.5, a: 0.045 },
    { r: 6.85, d: 0.35, a: 0.03 }, // 최상역 추가 — 고역 반짝임
  ]
  for (const p of partials) {
    const baseFreq = fund * p.r
    // 각 partial마다 detune된 두 오실레이터로 beating(울림) 생성
    for (const detune of [-1.8, 1.8]) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(baseFreq + detune, now)
      // Pitch bend — 실제 종처럼 타격 직후 미세한 주파수 변화 (아주 살짝 내려감)
      if (p.r <= 2.0) {
        osc.frequency.linearRampToValueAtTime(baseFreq + detune - baseFreq * 0.0015, now + 0.25)
      }
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, now)
      g.gain.linearRampToValueAtTime(p.a * 0.5 * amplitude, now + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.d)
      osc.connect(g)
      connectToAll(g)
      osc.start(now)
      osc.stop(now + p.d + 0.05)
    }
  }

  // ─── 3) FM synthesis layer — 금속성 body ───
  const car = ctx.createOscillator()
  const mod = ctx.createOscillator()
  const modDepth = ctx.createGain()
  car.type = 'sine'
  mod.type = 'sine'
  car.frequency.value = fund
  mod.frequency.value = fund * 3.5
  modDepth.gain.setValueAtTime(fund * 8.5, now)
  modDepth.gain.exponentialRampToValueAtTime(0.5, now + 0.7)
  mod.connect(modDepth)
  modDepth.connect(car.frequency)
  const fmGain = ctx.createGain()
  fmGain.gain.setValueAtTime(0, now)
  fmGain.gain.linearRampToValueAtTime(0.22 * amplitude, now + 0.004)
  fmGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8)
  car.connect(fmGain)
  connectToAll(fmGain)
  car.start(now)
  mod.start(now)
  car.stop(now + 3.0)
  mod.stop(now + 3.0)
}

/**
 * 종소리 재생. rings 수만큼 반복 타격(교회종 2~4번 타종 느낌).
 * 각 타격은 ~700ms 간격. 뒤로 갈수록 볼륨 살짝 감소(자연스러움).
 */
export function playBellSound(volume = 0.35, rings = 3): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === 'suspended') { ctx.resume().catch(() => { /* noop */ }) }

    // 마스터 체인
    const master = ctx.createGain()
    master.gain.value = volume
    master.connect(ctx.destination)

    // 고역 살짝 부드럽게
    const hiShelf = ctx.createBiquadFilter()
    hiShelf.type = 'highshelf'
    hiShelf.frequency.value = 6000
    hiShelf.gain.value = -3
    hiShelf.connect(master)

    const startBase = ctx.currentTime + 0.02
    const interval = 0.7 // 각 타격 간격(초)
    for (let i = 0; i < rings; i++) {
      // 뒤로 갈수록 amplitude 감소 — 자연스러운 페이드.
      const amp = Math.pow(0.85, i)
      scheduleStrike(ctx, hiShelf, startBase + i * interval, amp)
    }

    // 모든 타격 + 잔향이 끝날 때까지 context 유지
    const total = (rings - 1) * interval + 5.2
    setTimeout(() => { ctx.close().catch(() => { /* noop */ }) }, total * 1000)
  } catch {
    /* Audio context 생성 실패 시 무음 */
  }
}
