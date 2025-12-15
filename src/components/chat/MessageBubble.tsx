'use client'

import { Message } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Play, Pause, Check, CheckCheck, MoreVertical, Edit, Trash2, Reply, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface MessageBubbleProps {
  message: Message
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  onDelete?: (messageId: string, deleteForAll: boolean) => void
}

export function MessageBubble({ message, onReply, onEdit, onDelete }: MessageBubbleProps) {
  const { user } = useAuthStore()
  const isMe = user?.id === message.sender_id
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
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

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu && !showDeleteConfirm) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
        setShowDeleteConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu, showDeleteConfirm])

  const handleDelete = (deleteForAll: boolean) => {
    if (onDelete) {
      onDelete(message.id, deleteForAll)
      setShowMenu(false)
      setShowDeleteConfirm(false)
    }
  }

  // Don't show deleted messages
  if (message.deleted_at && !message.deleted_for_all) {
    return null
  }

  return (
    <div className={cn("flex w-full mb-4 group", isMe ? "justify-end" : "justify-start")}>
      <div 
        className={cn(
            "max-w-[70%] rounded-2xl px-4 py-2 shadow-sm relative",
            message.deleted_at && message.deleted_for_all
                ? "opacity-50"
                : "",
            isMe 
                ? "bg-blue-600 text-white rounded-br-none" 
                : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-gray-700"
        )}
      >
        {/* Reply Preview */}
        {message.reply_to && (
          <div className={cn(
            "mb-2 pl-3 border-l-2 text-xs",
            isMe ? "border-white/30 text-blue-100" : "border-gray-300 dark:border-gray-600 text-gray-500"
          )}>
            <div className="font-medium">{message.reply_to.sender?.username || message.reply_to.sender?.full_name || 'User'}</div>
            <div className="truncate">{message.reply_to.content.substring(0, 50)}</div>
          </div>
        )}

        {!isMe && message.sender && (
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                {message.sender.full_name || message.sender.username || 'User'}
            </div>
        )}

        {/* Message Menu Button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={cn(
            "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-black/10",
            isMe ? "left-2" : "right-2"
          )}
        >
          <MoreVertical className={cn("w-4 h-4", isMe ? "text-white" : "text-gray-400")} />
        </button>

        {/* Message Menu */}
        {showMenu && !showDeleteConfirm && (
          <div
            ref={menuRef}
            className={cn(
              "absolute z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[150px]",
              isMe ? "right-0 top-8" : "left-0 top-8"
            )}
          >
            {onReply && (
              <button
                onClick={() => {
                  onReply(message)
                  setShowMenu(false)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Reply className="w-4 h-4" />
                Ответить
              </button>
            )}
            {isMe && onEdit && !message.deleted_at && (
              <button
                onClick={() => {
                  onEdit(message)
                  setShowMenu(false)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Редактировать
              </button>
            )}
            {isMe && onDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Удалить
              </button>
            )}
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div
            ref={menuRef}
            className={cn(
              "absolute z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]",
              isMe ? "right-0 top-8" : "left-0 top-8"
            )}
          >
            <div className="text-sm font-medium mb-2">Удалить сообщение?</div>
            <div className="space-y-1">
              <button
                onClick={() => handleDelete(false)}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Удалить для меня
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Удалить для всех
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setShowMenu(false)
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Отмена
              </button>
            </div>
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
                {message.deleted_at && message.deleted_for_all ? (
                  <span className="italic opacity-70">Сообщение удалено</span>
                ) : (
                  message.content
                )}
                {message.updated_at && message.updated_at !== message.created_at && (
                  <span className="text-[10px] opacity-50 ml-1">(изменено)</span>
                )}
            </div>
        )}
        
        <div className={cn("text-[10px] mt-1 flex items-center justify-end gap-1 opacity-70", isMe ? "text-blue-100" : "text-gray-400")}>
            <span>{format(new Date(message.created_at), 'HH:mm')}</span>
            {isMe && (
                <span className="flex items-center" title={message.read_at ? 'Прочитано' : 'Отправлено'}>
                    {message.read_at ? (
                        <CheckCheck className="w-3 h-3 text-blue-300" />
                    ) : (
                        <Check className="w-3 h-3" />
                    )}
                </span>
            )}
            {!isMe && message.read_at && (
                <span className="text-[9px] opacity-50">✓ Прочитано</span>
            )}
        </div>
      </div>
    </div>
  )
}


