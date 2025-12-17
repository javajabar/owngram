import { supabase } from './supabase'

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end'
  from: string
  to: string
  data?: any
  timestamp: string
}

export class WebRTCHandler {
  private peerConnection: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private channel: any = null
  private userId: string
  private otherUserId: string
  private chatId: string
  private onRemoteStream: (stream: MediaStream) => void
  private onCallEnd: () => void

  constructor(
    userId: string,
    otherUserId: string,
    chatId: string,
    onRemoteStream: (stream: MediaStream) => void,
    onCallEnd: () => void
  ) {
    this.userId = userId
    this.otherUserId = otherUserId
    this.chatId = chatId
    this.onRemoteStream = onRemoteStream
    this.onCallEnd = onCallEnd
  }

  async initialize(isInitiator: boolean) {
    try {
      // Get user media with explicit audio constraints
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      
      // Ensure audio tracks are enabled
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true
        console.log('🎤 Audio track enabled:', track.label, track.enabled)
      })

      // Create peer connection with multiple STUN/TURN servers for better connectivity
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          // Alternative STUN servers (work without VPN)
          { urls: 'stun:stun.stunprotocol.org:3478' },
          { urls: 'stun:stun.voiparound.com' },
          { urls: 'stun:stun.voipbuster.com' },
        ],
      })

      // Add local stream tracks
      this.localStream.getTracks().forEach((track) => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream!)
        }
      })

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0]
          // Ensure audio tracks are enabled
          this.remoteStream.getAudioTracks().forEach(track => {
            track.enabled = true
            console.log('🔊 Remote audio track enabled:', track.label, track.enabled)
          })
          this.onRemoteStream(this.remoteStream)
        }
      }

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({
            type: 'ice-candidate',
            from: this.userId,
            to: this.otherUserId,
            data: event.candidate,
            timestamp: new Date().toISOString(),
          })
        }
      }

      // Handle connection state changes
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection?.connectionState === 'disconnected' || 
            this.peerConnection?.connectionState === 'failed') {
          this.endCall()
        }
      }

      // Subscribe to signals
      this.subscribeToSignals()

      // Create offer if initiator
      if (isInitiator) {
        const offer = await this.peerConnection.createOffer()
        await this.peerConnection.setLocalDescription(offer)
        this.sendSignal({
          type: 'offer',
          from: this.userId,
          to: this.otherUserId,
          data: offer,
          timestamp: new Date().toISOString(),
        })
      }

      return this.localStream
    } catch (error) {
      console.error('Error initializing WebRTC:', error)
      throw error
    }
  }

  private subscribeToSignals() {
    // Subscribe to Supabase Realtime for call signals
    // Use unique channel name to avoid conflicts
    this.channel = supabase
      .channel(`webrtc-${this.chatId}-${this.userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_signals',
          filter: `chat_id=eq.${this.chatId}`,
        },
        (payload) => {
          const signal = payload.new as any
          console.log('🔊 WebRTCHandler received signal:', {
            type: signal.signal_type,
            from: signal.from_user_id,
            to: signal.to_user_id,
            myId: this.userId,
            otherId: this.otherUserId,
            isForMe: signal.from_user_id === this.otherUserId && signal.to_user_id === this.userId
          })
          
          // Only process signals from other user to us (for WebRTC: offer, answer, ice-candidate)
          if (signal.from_user_id === this.otherUserId && signal.to_user_id === this.userId) {
            console.log('✅ WebRTC signal is for me, processing...')
            this.handleSignal({
              type: signal.signal_type,
              from: signal.from_user_id,
              to: signal.to_user_id,
              data: signal.signal_data,
              timestamp: signal.created_at,
            })
          } else {
            console.log('⏭️ WebRTC signal not for me, ignoring')
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 WebRTCHandler subscription status:', status)
      })
  }

  private async handleSignal(signal: CallSignal) {
    if (!this.peerConnection) return

    try {
      switch (signal.type) {
        case 'offer':
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data))
          const answer = await this.peerConnection.createAnswer()
          await this.peerConnection.setLocalDescription(answer)
          this.sendSignal({
            type: 'answer',
            from: this.userId,
            to: this.otherUserId,
            data: answer,
            timestamp: new Date().toISOString(),
          })
          break

        case 'answer':
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.data))
          break

        case 'ice-candidate':
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.data))
          break

        case 'call-reject':
        case 'call-end':
          this.endCall()
          break
      }
    } catch (error) {
      console.error('Error handling signal:', error)
    }
  }

  private async sendSignal(signal: CallSignal) {
    try {
      // Store signal in database for realtime delivery
      const { error } = await supabase.from('call_signals').insert({
        chat_id: this.chatId,
        from_user_id: signal.from,
        to_user_id: signal.to,
        signal_type: signal.type,
        signal_data: signal.data || null,
        created_at: signal.timestamp,
      })

      if (error) {
        console.error('Error sending signal:', error)
      }
    } catch (error) {
      console.error('Error sending signal:', error)
    }
  }

  async toggleMute() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
    }
  }

  async toggleVideo() {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
    }
  }

  async endCall() {
    // Send end signal
    if (this.otherUserId) {
      await this.sendSignal({
        type: 'call-end',
        from: this.userId,
        to: this.otherUserId,
        timestamp: new Date().toISOString(),
      })
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close()
    }

    // Unsubscribe from channel
    if (this.channel) {
      await supabase.removeChannel(this.channel)
    }

    this.onCallEnd()
  }

  getLocalStream() {
    return this.localStream
  }

  getRemoteStream() {
    return this.remoteStream
  }
}

