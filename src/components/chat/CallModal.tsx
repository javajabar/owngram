'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
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
  remoteStreams: Map<string, MediaStream>
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
  remoteStreams,
  isMuted,
  isVideoEnabled,
  onToggleMute,
  onToggleVideo,
  callStartTime,
}: CallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const [remoteUserProfiles, setRemoteUserProfiles] = useState<Map<string, Profile>>(new Map())
  const [callDuration, setCallDuration] = useState<string>('00:00')

  // Refs for remote audio elements (to handle autoplay)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Fetch profiles for all remote participants
  useEffect(() => {
    const fetchProfiles = async () => {
      const newUserIds = Array.from(remoteStreams.keys()).filter(id => !remoteUserProfiles.has(id))
      if (newUserIds.length === 0) return

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', newUserIds)

      if (data) {
        setRemoteUserProfiles(prev => {
          const next = new Map(prev)
          data.forEach(p => next.set(p.id, p as Profile))
          return next
        })
      }
    }

    fetchProfiles()
  }, [remoteStreams])

  // Handle local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Handle remote audio streams (required for autoplay policy)
  useEffect(() => {
    if (!isIncoming && callStartTime) {
      remoteStreams.forEach((stream, userId) => {
        const audioEl = audioRefs.current.get(userId)
        if (audioEl && audioEl.srcObject !== stream) {
          audioEl.srcObject = stream
          audioEl.volume = 1.0
          audioEl.muted = false
          // Prevent play() interruption errors
          audioEl.play().catch(err => {
            // Ignore "play() request was interrupted" errors
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              console.log(`⚠️ Audio autoplay blocked for user ${userId}:`, err)
            }
          })
        }
      })
    }
  }, [remoteStreams, isIncoming, callStartTime])

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

  const remoteParticipants = Array.from(remoteStreams.entries())
  const participantCount = remoteParticipants.length

  // Determine grid layout based on participant count
  const getGridClass = () => {
    if (participantCount <= 1) return 'grid-cols-1'
    if (participantCount <= 2) return 'grid-cols-1 md:grid-cols-2'
    if (participantCount <= 4) return 'grid-cols-2'
    return 'grid-cols-2 md:grid-cols-3'
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col">
      {/* Remote participants grid */}
      <div className={`flex-1 grid ${getGridClass()} gap-2 p-4 overflow-auto`}>
        {participantCount === 0 ? (
          <div className="flex items-center justify-center h-full w-full">
            <div className="text-center">
              <div className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-4 border-2 border-blue-500/20">
                {otherUser?.avatar_url ? (
                  <img src={otherUser.avatar_url} alt="User" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-white text-4xl font-bold">
                    {(otherUser?.full_name?.[0] || otherUser?.username?.[0] || '?').toUpperCase()}
                  </span>
                )}
              </div>
              <h3 className="text-white text-xl font-semibold mb-1">
                {otherUser?.full_name || otherUser?.username?.replace(/^@+/, '') || 'User'}
              </h3>
              <p className="text-blue-400 animate-pulse">
                {isIncoming ? 'Входящий звонок...' : 'Ожидание ответа...'}
              </p>
            </div>
          </div>
        ) : (
          remoteParticipants.map(([userId, stream]) => {
            const profile = remoteUserProfiles.get(userId)
            return (
              <div key={userId} className="relative bg-gray-900 rounded-2xl overflow-hidden group">
                <VideoElement stream={stream} />
                <audio
                  ref={el => { if (el) audioRefs.current.set(userId, el) }}
                  autoPlay
                  playsInline
                  className="hidden"
                />
                <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-white text-sm font-medium">
                    {profile?.full_name || profile?.username?.replace(/^@+/, '') || 'User'}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Local Video (Floating) */}
      {localStream && isVideoEnabled && (
        <div className="absolute top-6 right-6 w-40 md:w-56 aspect-[3/4] rounded-2xl overflow-hidden bg-gray-800 border-2 border-white/10 shadow-2xl z-50">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white font-medium">
            Вы
          </div>
        </div>
      )}

      {/* Header with timer */}
      {callStartTime && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-mono font-medium">{callDuration}</span>
          </div>
        </div>
      )}

      {/* Controls Footer */}
      <div className="p-8 flex items-center justify-center gap-6 z-50">
        {isIncoming ? (
          <>
            <button
              onClick={onReject}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xl"
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>
            {onAccept && (
              <button
                onClick={onAccept}
                className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-xl animate-bounce"
              >
                <Phone className="w-8 h-8 text-white" />
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-4 bg-gray-800/50 backdrop-blur-xl p-4 rounded-3xl border border-white/5">
            <button
              onClick={onToggleVideo}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                isVideoEnabled ? 'bg-gray-700/50 hover:bg-gray-600/50 text-white' : 'bg-red-500/80 text-white'
              }`}
            >
              {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </button>
            <button
              onClick={onToggleMute}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                !isMuted ? 'bg-gray-700/50 hover:bg-gray-600/50 text-white' : 'bg-red-500/80 text-white'
              }`}
            >
              {!isMuted ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
            </button>
            <div className="w-px h-10 bg-white/10 mx-2" />
            <button
              onClick={onReject}
              className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all hover:scale-105 active:scale-95 text-white shadow-lg shadow-red-500/20"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-component for individual video streams to handle their own refs
function VideoElement({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      // Prevent play() interruption errors
      if (videoRef.current) {
        const playPromise = videoRef.current.play()
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            // Ignore "play() request was interrupted" errors
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
              console.error('Video play error:', err)
            }
          })
        }
      }
    }
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  )
}

