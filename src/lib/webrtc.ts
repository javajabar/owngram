import { supabase } from './supabase'

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end' | 'call-join'
  from: string
  to: string
  data?: any
  timestamp: string
}

export class WebRTCHandler {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private remoteStreams: Map<string, MediaStream> = new Map()
  private iceCandidateQueues: Map<string, RTCIceCandidateInit[]> = new Map()
  private channel: any = null
  private userId: string
  private chatId: string
  private onRemoteStreamAdded: (userId: string, stream: MediaStream) => void
  private onRemoteStreamRemoved: (userId: string) => void
  private onCallEnd: () => void

  constructor(
    userId: string,
    chatId: string,
    onRemoteStreamAdded: (userId: string, stream: MediaStream) => void,
    onRemoteStreamRemoved: (userId: string) => void,
    onCallEnd: () => void
  ) {
    this.userId = userId
    this.chatId = chatId
    this.onRemoteStreamAdded = onRemoteStreamAdded
    this.onRemoteStreamRemoved = onRemoteStreamRemoved
    this.onCallEnd = onCallEnd
  }

  async initialize() {
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

      // Subscribe to signals and presence
      this.subscribeToSignals()

      return this.localStream
    } catch (error) {
      console.error('Error initializing WebRTC:', error)
      throw error
    }
  }

  private createPeerConnection(otherUserId: string, isInitiator: boolean) {
    if (this.peerConnections.has(otherUserId)) {
      console.log('📡 Peer connection already exists for:', otherUserId)
      return this.peerConnections.get(otherUserId)!
    }

    console.log('📡 Creating peer connection for:', otherUserId, 'isInitiator:', isInitiator)

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.voiparound.com' },
        { urls: 'stun:stun.voipbuster.com' },
      ],
    })

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!)
      })
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        console.log('📥 Remote track received from:', otherUserId, event.track.kind)
        const remoteStream = event.streams[0]
        
        // Ensure audio tracks are enabled
        if (event.track.kind === 'audio') {
          event.track.enabled = true
        }

        if (!this.remoteStreams.has(otherUserId)) {
          this.remoteStreams.set(otherUserId, remoteStream)
          this.onRemoteStreamAdded(otherUserId, remoteStream)
        }
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          from: this.userId,
          to: otherUserId,
          data: event.candidate,
          timestamp: new Date().toISOString(),
        })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`📡 Connection state with ${otherUserId}:`, pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(otherUserId)
      }
    }

    this.peerConnections.set(otherUserId, pc)

    // Create offer if initiator
    if (isInitiator) {
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          this.sendSignal({
            type: 'offer',
            from: this.userId,
            to: otherUserId,
            data: offer,
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          console.error('Error creating offer:', error)
        }
      }, 500) // Small delay to ensure tracks are added
    }

    return pc
  }

  private removePeer(userId: string) {
    console.log('🧹 Removing peer:', userId)
    const pc = this.peerConnections.get(userId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(userId)
    }
    if (this.remoteStreams.has(userId)) {
      this.remoteStreams.delete(userId)
      this.onRemoteStreamRemoved(userId)
    }
  }

  private subscribeToSignals() {
    this.channel = supabase
      .channel(`webrtc-${this.chatId}`)
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const signal = payload as CallSignal
        if (signal.to !== this.userId) return

        console.log('🔊 [WebRTC 2.0] Received broadcast signal:', signal.type, 'from:', signal.from)
        
        const fromUserId = signal.from
        const signalData = signal.data

        switch (signal.type) {
          case 'offer':
            const pcOffer = this.createPeerConnection(fromUserId, false)
            await pcOffer.setRemoteDescription(new RTCSessionDescription(signalData))
            
            const offerQueue = this.iceCandidateQueues.get(fromUserId) || []
            while (offerQueue.length > 0) {
              const cand = offerQueue.shift()
              if (cand) await pcOffer.addIceCandidate(new RTCIceCandidate(cand))
            }
            this.iceCandidateQueues.delete(fromUserId)

            const answer = await pcOffer.createAnswer()
            await pcOffer.setLocalDescription(answer)
            this.sendSignal({
              type: 'answer',
              from: this.userId,
              to: fromUserId,
              data: answer,
              timestamp: new Date().toISOString(),
            })
            break

          case 'answer':
            const pcAnswer = this.peerConnections.get(fromUserId)
            if (pcAnswer) {
              await pcAnswer.setRemoteDescription(new RTCSessionDescription(signalData))
              
              const answerQueue = this.iceCandidateQueues.get(fromUserId) || []
              while (answerQueue.length > 0) {
                const cand = answerQueue.shift()
                if (cand) await pcAnswer.addIceCandidate(new RTCIceCandidate(cand))
              }
              this.iceCandidateQueues.delete(fromUserId)
            }
            break

          case 'ice-candidate':
            const pcIce = this.peerConnections.get(fromUserId)
            if (pcIce && pcIce.remoteDescription) {
              await pcIce.addIceCandidate(new RTCIceCandidate(signalData))
            } else {
              if (!this.iceCandidateQueues.has(fromUserId)) {
                this.iceCandidateQueues.set(fromUserId, [])
              }
              this.iceCandidateQueues.get(fromUserId)!.push(signalData)
            }
            break
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `chat_id=eq.${this.chatId}`,
        },
        async (payload) => {
          const signal = payload.new as any
          
          // Only process signals for us
          if (signal.to_user_id !== this.userId) return

          // Ignore technical signals if they come from DB (WebRTC 2.0 uses Broadcast)
          const isTechnical = ['offer', 'answer', 'ice-candidate'].includes(signal.signal_type)
          if (isTechnical) {
            console.log('⏭️ [WebRTC 2.0] Ignoring technical signal from DB:', signal.signal_type)
            return
          }

          console.log('🔊 WebRTCHandler received session signal:', signal.signal_type, 'from:', signal.from_user_id)

          const fromUserId = signal.from_user_id
          const signalData = signal.signal_data

          switch (signal.signal_type) {
            case 'offer':
              const pcOffer = this.createPeerConnection(fromUserId, false)
              await pcOffer.setRemoteDescription(new RTCSessionDescription(signalData))
              
              // Process queued candidates
              const offerQueue = this.iceCandidateQueues.get(fromUserId) || []
              while (offerQueue.length > 0) {
                const cand = offerQueue.shift()
                if (cand) await pcOffer.addIceCandidate(new RTCIceCandidate(cand))
              }
              this.iceCandidateQueues.delete(fromUserId)

              const answer = await pcOffer.createAnswer()
              await pcOffer.setLocalDescription(answer)
              this.sendSignal({
                type: 'answer',
                from: this.userId,
                to: fromUserId,
                data: answer,
                timestamp: new Date().toISOString(),
              })
              break

            case 'answer':
              const pcAnswer = this.peerConnections.get(fromUserId)
              if (pcAnswer) {
                await pcAnswer.setRemoteDescription(new RTCSessionDescription(signalData))
                
                // Process queued candidates
                const answerQueue = this.iceCandidateQueues.get(fromUserId) || []
                while (answerQueue.length > 0) {
                  const cand = answerQueue.shift()
                  if (cand) await pcAnswer.addIceCandidate(new RTCIceCandidate(cand))
                }
                this.iceCandidateQueues.delete(fromUserId)
              }
              break

            case 'ice-candidate':
              const pcIce = this.peerConnections.get(fromUserId)
              if (pcIce && pcIce.remoteDescription) {
                await pcIce.addIceCandidate(new RTCIceCandidate(signalData))
              } else {
                // Queue candidate if remote description not set yet
                if (!this.iceCandidateQueues.has(fromUserId)) {
                  this.iceCandidateQueues.set(fromUserId, [])
                }
                this.iceCandidateQueues.get(fromUserId)!.push(signalData)
              }
              break

            case 'call-end':
              this.removePeer(fromUserId)
              break
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState()
        console.log('📡 Presence sync:', state)
        this.handlePresence(state)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('📡 Presence join:', newPresences)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('📡 Presence leave:', leftPresences)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to WebRTC channel')
          await this.channel.track({
            user_id: this.userId,
            joined_at: new Date().toISOString(),
          })
        }
      })
  }

  private handlePresence(state: any) {
    const participants = Object.values(state).flat() as any[]
    participants.forEach((p) => {
      if (p.user_id !== this.userId && !this.peerConnections.has(p.user_id)) {
        // Simple rule: ID comparison to determine initiator
        // The user with smaller ID (alphabetically) initiates the offer
        if (this.userId < p.user_id) {
          this.createPeerConnection(p.user_id, true)
        }
      }
    })
  }

  private async sendSignal(signal: CallSignal) {
    try {
      // Use Broadcast for technical signals (offer, answer, ice-candidate)
      // and Database for session signals (call-request, call-accept, etc.)
      const isTechnical = ['offer', 'answer', 'ice-candidate'].includes(signal.type)

      if (isTechnical && this.channel) {
        console.log('📡 [WebRTC 2.0] Sending broadcast signal:', signal.type)
        await this.channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            ...signal,
            from: this.userId,
            to: signal.to
          }
        })
      } else {
        // Fallback or session signals go to DB
        await supabase.from('call_signals').insert({
          chat_id: this.chatId,
          from_user_id: signal.from,
          to_user_id: signal.to,
          signal_type: signal.type,
          signal_data: signal.data || null,
          created_at: signal.timestamp,
        })
      }
    } catch (error) {
      console.error('Error sending signal:', error)
    }
  }

  toggleMute() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
    }
  }

  toggleVideo() {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
    }
  }

  async endCall() {
    console.log('📞 Ending call...')
    
    // Notify others
    for (const otherUserId of this.peerConnections.keys()) {
      await this.sendSignal({
        type: 'call-end',
        from: this.userId,
        to: otherUserId,
        timestamp: new Date().toISOString(),
      })
    }

    // Cleanup all peers
    for (const userId of Array.from(this.peerConnections.keys())) {
      this.removePeer(userId)
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
    }

    if (this.channel) {
      await supabase.removeChannel(this.channel)
    }

    this.onCallEnd()
  }

  getLocalStream() {
    return this.localStream
  }

  getRemoteStreams() {
    return this.remoteStreams
  }
}
