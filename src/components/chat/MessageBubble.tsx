'use client'

import { Message } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Play, Pause, Check, CheckCheck } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export function MessageBubble({ message }: { message: Message }) {
  const { user } = useAuthStore()
  const isMe = user?.id === message.sender_id
  
  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const voiceAttachment = message.attachments?.find((a: any) => a.type === 'voice')

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateProgress = () => {
        if (audio.duration) {
            setProgress((audio.currentTime / audio.duration) * 100)
        }
    }

    const onLoadedMetadata = () => {
        setDuration(audio.duration)
    }

    const onEnded = () => {
        setIsPlaying(false)
        setProgress(0)
    }

    audio.addEventListener('timeupdate', updateProgress)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)

    return () => {
        audio.removeEventListener('timeupdate', updateProgress)
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
        audio.pause()
    } else {
        audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={cn("flex w-full mb-4", isMe ? "justify-end" : "justify-start")}>
      <div 
        className={cn(
            "max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative",
            isMe 
                ? "bg-blue-600 text-white rounded-br-none" 
                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-gray-700"
        )}
      >
        {!isMe && message.sender && (
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                {message.sender.full_name || message.sender.username || 'User'}
            </div>
        )}
        
        {voiceAttachment ? (
            <div className="flex items-center gap-3 min-w-[180px] py-1">
                <button 
                    onClick={togglePlay}
                    className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                        isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-blue-100 hover:bg-blue-200 text-blue-600 dark:bg-gray-700 dark:text-blue-400"
                    )}
                >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                </button>
                <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full transition-all duration-100", isMe ? "bg-white/70" : "bg-blue-500")} 
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className={cn("text-[10px] font-mono w-8 text-right", isMe ? "text-blue-100" : "text-gray-500")}>
                    {formatDuration(duration || 0)}
                </div>
                <audio ref={audioRef} src={voiceAttachment.url} className="hidden" preload="metadata" />
            </div>
        ) : (
            <div className="text-sm md:text-base break-words whitespace-pre-wrap font-object-sans">
                {message.content}
            </div>
        )}
        
        <div className={cn("text-[10px] mt-1 flex items-center justify-end gap-1 opacity-70", isMe ? "text-blue-100" : "text-gray-400")}>
            <span>{format(new Date(message.created_at), 'HH:mm')}</span>
            {isMe && (
                message.read_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
            )}
        </div>
      </div>
    </div>
  )
}


