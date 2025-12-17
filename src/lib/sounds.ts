// Sound effects utility - iPhone-like but unique sounds

class SoundManager {
  private audioContext: AudioContext | null = null

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return this.audioContext
  }

  // Play a pleasant tone
  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3): void {
    try {
      const ctx = this.getAudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = frequency
      oscillator.type = type

      // Smooth volume envelope
      const now = ctx.currentTime
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)

      oscillator.start(now)
      oscillator.stop(now + duration)
    } catch (error) {
      // Silently fail if audio context is not available
      console.debug('Audio playback failed:', error)
    }
  }

  // Play a chord (multiple frequencies)
  private playChord(frequencies: number[], duration: number, type: OscillatorType = 'sine', volume: number = 0.25): void {
    try {
      const ctx = this.getAudioContext()
      const gainNode = ctx.createGain()
      gainNode.connect(ctx.destination)

      const now = ctx.currentTime
      gainNode.gain.setValueAtTime(0, now)
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)

      frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator()
        oscillator.connect(gainNode)
        oscillator.frequency.value = freq
        oscillator.type = type
        oscillator.start(now + index * 0.01) // Slight stagger for richness
        oscillator.stop(now + duration)
      })
    } catch (error) {
      console.debug('Audio playback failed:', error)
    }
  }

  // Message sent sound - pleasant upward tone
  playMessageSent(): void {
    // Two-tone ascending melody
    this.playTone(440, 0.08, 'sine', 0.2) // A4
    setTimeout(() => {
      this.playTone(523.25, 0.1, 'sine', 0.2) // C5
    }, 80)
  }

  // Message received sound - gentle notification
  playMessageReceived(): void {
    // Soft descending chord
    this.playChord([523.25, 659.25, 783.99], 0.15, 'sine', 0.18) // C5, E5, G5
  }

  // Voice recording start sound - subtle click with tone
  playRecordingStart(): void {
    // Quick, subtle sound
    this.playTone(330, 0.05, 'sine', 0.15) // E4
    setTimeout(() => {
      this.playTone(392, 0.06, 'sine', 0.12) // G4
    }, 50)
  }

  // Optional: Stop recording sound
  playRecordingStop(): void {
    // Gentle downward tone
    this.playTone(392, 0.08, 'sine', 0.15) // G4
    setTimeout(() => {
      this.playTone(330, 0.1, 'sine', 0.12) // E4
    }, 80)
  }
}

// Export singleton instance
export const soundManager = new SoundManager()

