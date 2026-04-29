/**
 * 학교 교시 벨 (수업 시작/종료) — Web Audio API 합성.
 *
 * 시작종·종료종 모두 동일 멜로디:
 *   C5 E5 G5 B5 C6 D6 C6 B5 G5 E5 D5 C5 (12음, 상승→정점→우아한 하강)
 *
 * (이전엔 종료종이 Westminster Chimes 였으나, 교사 요청에 따라 시작·종료 종소리를 통일.
 *  시각적 구분은 ClockWidget 의 "수업 시작 / 수업 끝" 오버레이가 담당.)
 *
 * 각 음: fundamental + 옥타브 배음 + bell envelope (fast attack / exp decay)
 * convolution reverb 2.5초 IR로 교회 공명 질감. 총 지속 시간 약 8초.
 */

type BellMode = 'start' | 'end'

// C major — 상승 → 정점(C6/D6) → 하강으로 완결된 arc. 시작·종료 공통 사용.
const UNIFIED_MELODY: readonly number[] = [
  523.25,  // C5
  659.25,  // E5
  783.99,  // G5
  987.77,  // B5
  1046.50, // C6
  1174.66, // D6
  1046.50, // C6
  987.77,  // B5
  783.99,  // G5
  659.25,  // E5
  587.33,  // D5
  523.25,  // C5
]

const MELODIES: Record<BellMode, readonly number[]> = {
  start: UNIFIED_MELODY,
  end: UNIFIED_MELODY,
}

export function playSchoolBell(mode: BellMode): void {
  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ })
    const t0 = ctx.currentTime

    const melody = MELODIES[mode]
    // 시작/종료 공통 타이밍 — 시작 종 기준(상승·하강 arc 에 맞는 템포).
    const noteGap = 0.52
    const noteDur = 0.75
    const tailExtra = 2.5

    // ── 마스터 체인 ──
    const master = ctx.createGain()
    master.gain.value = 0.60  // 전체 볼륨 업 (기존 0.32 → 0.60, 약 +5.5dB)
    master.connect(ctx.destination)

    // ── Convolution reverb (procedural IR 2.5초) ──
    const sr = ctx.sampleRate
    const irLen = Math.floor(sr * 2.5)
    const irBuf = ctx.createBuffer(2, irLen, sr)
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch)
      for (let i = 0; i < irLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2)
      }
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = irBuf
    const wet = ctx.createGain()
    wet.gain.value = 0.38
    convolver.connect(wet)
    wet.connect(master)

    // 부드러운 고역 shelf cut (너무 쨍하지 않게)
    const hiShelf = ctx.createBiquadFilter()
    hiShelf.type = 'highshelf'
    hiShelf.frequency.value = 5000
    hiShelf.gain.value = -2
    hiShelf.connect(master)

    // ── 단일 음 재생 (fundamental + 옥타브 배음) ──
    const playNote = (freq: number, delay: number, dur: number, vol: number) => {
      // fundamental
      const f = ctx.createOscillator()
      f.type = 'sine'
      f.frequency.value = freq
      const fg = ctx.createGain()
      fg.gain.setValueAtTime(0, t0 + delay)
      fg.gain.linearRampToValueAtTime(vol, t0 + delay + 0.008)
      fg.gain.exponentialRampToValueAtTime(0.0003, t0 + delay + dur)
      f.connect(fg)
      fg.connect(hiShelf)
      fg.connect(convolver)
      f.start(t0 + delay)
      f.stop(t0 + delay + dur + 0.05)

      // 옥타브 배음 — bell 질감
      const h = ctx.createOscillator()
      h.type = 'sine'
      h.frequency.value = freq * 2
      const hg = ctx.createGain()
      hg.gain.setValueAtTime(0, t0 + delay)
      hg.gain.linearRampToValueAtTime(vol * 0.28, t0 + delay + 0.006)
      hg.gain.exponentialRampToValueAtTime(0.0003, t0 + delay + dur * 0.6)
      h.connect(hg)
      hg.connect(hiShelf)
      hg.connect(convolver)
      h.start(t0 + delay)
      h.stop(t0 + delay + dur + 0.05)

      // 3번째 부분음 (살짝의 sparkle)
      const s = ctx.createOscillator()
      s.type = 'sine'
      s.frequency.value = freq * 3
      const sg = ctx.createGain()
      sg.gain.setValueAtTime(0, t0 + delay)
      sg.gain.linearRampToValueAtTime(vol * 0.08, t0 + delay + 0.005)
      sg.gain.exponentialRampToValueAtTime(0.0002, t0 + delay + dur * 0.3)
      s.connect(sg)
      sg.connect(hiShelf)
      s.start(t0 + delay)
      s.stop(t0 + delay + dur * 0.4)
    }

    melody.forEach((freq, i) => {
      const isLast = i === melody.length - 1
      const dur = isLast ? noteDur + tailExtra : noteDur
      // 볼륨에 미묘한 다이내믹 (첫 음과 마지막 음이 살짝 더 크게)
      let vol = 0.55
      if (i === 0) vol = 0.58
      else if (isLast) vol = 0.60
      else if (i < melody.length / 2) vol = 0.55
      else vol = 0.50
      playNote(freq, i * noteGap, dur, vol)
    })

    const totalLife = (melody.length - 1) * noteGap + noteDur + tailExtra + 0.5
    setTimeout(() => ctx.close().catch(() => { /* noop */ }), totalLife * 1000)
  } catch { /* noop */ }
}
