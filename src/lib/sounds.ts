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

  // Incoming call sound - ringing tone
  playIncomingCall(): void {
    // Ringing pattern - two tones repeating
    this.playTone(523.25, 0.2, 'sine', 0.25) // C5
    setTimeout(() => {
      this.playTone(659.25, 0.2, 'sine', 0.25) // E5
    }, 200)
  }

  // Call answered sound - pleasant confirmation
  playCallAnswered(): void {
    // Upward chord confirming connection
    this.playChord([523.25, 659.25, 783.99], 0.2, 'sine', 0.22) // C5, E5, G5
  }

  // Call ended sound - gentle ending tone
  playCallEnded(): void {
    // Downward tone indicating call end
    this.playTone(659.25, 0.15, 'sine', 0.2) // E5
    setTimeout(() => {
      this.playTone(523.25, 0.2, 'sine', 0.18) // C5
    }, 150)
  }

  // Call ringing sound - repeating pattern (like phone ringing)
  private ringingInterval: NodeJS.Timeout | null = null

  startCallRinging(): void {
    // Stop any existing ringing
    this.stopCallRinging()
    
    // Play immediately
    this.playIncomingCall()
    
    // Then repeat every 3 seconds
    this.ringingInterval = setInterval(() => {
      this.playIncomingCall()
    }, 3000)
  }

  stopCallRinging(): void {
    if (this.ringingInterval) {
      clearInterval(this.ringingInterval)
      this.ringingInterval = null
    }
  }
}

// Export singleton instance
export const soundManager = new SoundManager()

