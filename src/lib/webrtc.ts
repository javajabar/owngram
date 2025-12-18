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
      
      // Log all tracks
      const audioTracks = this.localStream.getAudioTracks()
      const videoTracks = this.localStream.getVideoTracks()
      console.log('🎤 Audio tracks received:', audioTracks.length, audioTracks.map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })))
      console.log('📹 Video tracks received:', videoTracks.length, videoTracks.map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })))
      
      // Ensure audio tracks are enabled
      audioTracks.forEach(track => {
        track.enabled = true
        console.log('🎤 Audio track enabled:', track.label, track.enabled, track.readyState)
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

      // Add local stream tracks (BOTH audio and video)
      const allTracks = this.localStream.getTracks()
      console.log('📡 Adding tracks to PeerConnection:', allTracks.length, 'tracks')
      allTracks.forEach((track) => {
        if (this.peerConnection) {
          const sender = this.peerConnection.addTrack(track, this.localStream!)
          console.log(`✅ Added ${track.kind} track:`, track.label, 'sender:', sender)
        }
      })
      
      // Verify tracks were added
      const senders = this.peerConnection.getSenders()
      console.log('📊 PeerConnection senders:', senders.length, senders.map(s => ({
        track: s.track?.kind || 'null',
        label: s.track?.label || 'null'
      })))

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('📥 Remote track received:', event.track.kind, event.track.label, event.track.readyState)
        
        // Handle each track individually
        if (event.track.kind === 'audio') {
          console.log('🎵 Audio track received:', event.track.label, event.track.readyState)
          // Ensure audio track is enabled
          event.track.enabled = true
        } else if (event.track.kind === 'video') {
          console.log('📹 Video track received:', event.track.label, event.track.readyState)
        }
        
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0]
          
          // Log all remote tracks
          const remoteAudioTracks = this.remoteStream.getAudioTracks()
          const remoteVideoTracks = this.remoteStream.getVideoTracks()
          console.log('🔊 Remote audio tracks:', remoteAudioTracks.length, remoteAudioTracks.map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })))
          console.log('📹 Remote video tracks:', remoteVideoTracks.length, remoteVideoTracks.map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })))
          
          // Ensure audio tracks are enabled
          remoteAudioTracks.forEach(track => {
            track.enabled = true
            console.log('🔊 Remote audio track enabled:', track.label, track.enabled, track.readyState)
          })
          
          // Notify about remote stream (will be handled by CallModal)
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
        
        // Log SDP to verify audio is included
        console.log('📝 Offer SDP:', offer.sdp)
        const hasAudio = offer.sdp?.includes('m=audio') || offer.sdp?.includes('audio')
        const hasVideo = offer.sdp?.includes('m=video') || offer.sdp?.includes('video')
        console.log('🎵 Offer contains audio:', hasAudio)
        console.log('📹 Offer contains video:', hasVideo)
        
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
          
          // Log offer SDP to verify audio
          console.log('📝 Received offer SDP:', signal.data.sdp)
          const offerHasAudio = signal.data.sdp?.includes('m=audio') || signal.data.sdp?.includes('audio')
          console.log('🎵 Offer contains audio:', offerHasAudio)
          
          const answer = await this.peerConnection.createAnswer()
          
          // Log answer SDP to verify audio
          console.log('📝 Answer SDP:', answer.sdp)
          const answerHasAudio = answer.sdp?.includes('m=audio') || answer.sdp?.includes('audio')
          console.log('🎵 Answer contains audio:', answerHasAudio)
          
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

