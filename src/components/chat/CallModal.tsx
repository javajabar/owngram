'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react'
import { Profile } from '@/types'

interface CallModalProps {
  isOpen: boolean
  isIncoming: boolean
  otherUser: Profile | null
  onClose: () => void
  onAccept?: () => void
  onReject: () => void
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isVideoEnabled: boolean
  onToggleMute: () => void
  onToggleVideo: () => void
  callStartTime: number | null
}

export function CallModal({
  isOpen,
  isIncoming,
  otherUser,
  onClose,
  onAccept,
  onReject,
  localStream,
  remoteStream,
  isMuted,
  isVideoEnabled,
  onToggleMute,
  onToggleVideo,
  callStartTime,
}: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const [callDuration, setCallDuration] = useState<string>('00:00')

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteStream) {
      // Handle video
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream
        remoteVideoRef.current.play().catch(err => {
          console.error('Error playing remote video:', err)
        })
      }
      
      // Handle audio separately (required for autoplay policy)
      if (remoteAudioRef.current) {
        // Create audio-only stream from remote stream
        const audioTracks = remoteStream.getAudioTracks()
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream(audioTracks)
          remoteAudioRef.current.srcObject = audioStream
          remoteAudioRef.current.volume = 1.0
          remoteAudioRef.current.muted = false
          
          // Try to play audio (will work after user gesture)
          // If call is already active (not incoming), try to play immediately
          if (!isIncoming && callStartTime) {
            remoteAudioRef.current.play().catch(err => {
              console.log('⚠️ Audio autoplay blocked:', err)
            })
          }
        }
      }
    }
  }, [remoteStream, isIncoming, callStartTime])

  // Timer for call duration
  useEffect(() => {
    if (!callStartTime) {
      setCallDuration('00:00')
      return
    }

    const updateTimer = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - callStartTime) / 1000) // seconds
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      setCallDuration(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
    }

    // Update immediately
    updateTimer()

    // Update every second
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [callStartTime])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center">
      {/* Hidden audio element for remote audio stream */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        className="hidden"
      />
      
      <div className="relative w-full h-full flex flex-col">
        {/* Remote Video */}
        <div className="flex-1 relative bg-gray-900">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-32 h-32 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                  {otherUser?.avatar_url ? (
                    <img
                      src={otherUser.avatar_url}
                      alt={otherUser.full_name || 'User'}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-4xl font-bold">
                      {(otherUser?.full_name?.[0] || otherUser?.username?.[0] || '?').toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className="text-white text-xl font-semibold mb-1">
                  {otherUser?.full_name || otherUser?.username?.replace(/^@+/, '') || 'User'}
                </h3>
                {callStartTime ? (
                  <p className="text-white text-lg font-medium">{callDuration}</p>
                ) : isIncoming ? (
                  <p className="text-gray-400">Входящий звонок...</p>
                ) : (
                  <p className="text-gray-400">Звонок...</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Local Video (Picture-in-Picture) */}
        {localStream && isVideoEnabled && (
          <div className="absolute top-4 right-4 w-48 h-64 rounded-lg overflow-hidden bg-gray-800 border-2 border-white/20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
          {isIncoming ? (
            <>
              <button
                onClick={onReject}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>
              {onAccept && (
                <button
                  onClick={async () => {
                    // User gesture - now we can play audio
                    if (remoteAudioRef.current) {
                      try {
                        await remoteAudioRef.current.play()
                        console.log('✅ Audio playback started after user gesture')
                      } catch (err) {
                        console.error('❌ Error playing audio after user gesture:', err)
                      }
                    }
                    onAccept()
                  }}
                  className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg"
                >
                  <Phone className="w-8 h-8 text-white" />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={onToggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors shadow-lg ${
                  isVideoEnabled
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {isVideoEnabled ? (
                  <Video className="w-6 h-6 text-white" />
                ) : (
                  <VideoOff className="w-6 h-6 text-white" />
                )}
              </button>
              <button
                onClick={onToggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors shadow-lg ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {isMuted ? (
                  <MicOff className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-white" />
                )}
              </button>
              <button
                onClick={onReject}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

