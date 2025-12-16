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
  showAvatar?: boolean
}

export function MessageBubble({ message, onReply, onEdit, onDelete, showAvatar = false }: MessageBubbleProps) {
  const { user } = useAuthStore()
  const isMe = user?.id === message.sender_id
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
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
    if (!contextMenu && !showDeleteConfirm) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
        setShowDeleteConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu, showDeleteConfirm])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleDelete = (deleteForAll: boolean) => {
    if (onDelete) {
      onDelete(message.id, deleteForAll)
      setContextMenu(null)
      setShowDeleteConfirm(false)
    }
  }

  // Don't show deleted messages
  if (message.deleted_at && !message.deleted_for_all) {
    return null
  }

  return (
    <div className={cn("flex w-full mb-2 group items-end gap-2 transition-all duration-300 ease-in-out", isMe ? "justify-end" : "justify-start")}>
      {/* Avatar for other user's messages - or empty space to align messages */}
      {!isMe && (
        <div className="w-8 h-8 shrink-0">
          {showAvatar && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-gray-200 dark:bg-gray-700">
              {message.sender?.avatar_url ? (
                <img src={message.sender.avatar_url} className="w-full h-full object-cover" alt={message.sender.full_name || message.sender.username || 'User'} />
              ) : (
                <span className="text-gray-600 dark:text-gray-300 font-semibold text-sm">
                  {(message.sender?.full_name?.[0] || message.sender?.username?.[0] || '?').toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      
      <div 
        onContextMenu={handleContextMenu}
        className={cn(
            "max-w-[70%] px-2.5 py-1.5 shadow-sm relative text-sm inline-flex items-end gap-1.5 transition-all duration-200 ease-out",
            message.deleted_at && message.deleted_for_all
                ? "opacity-50 italic"
                : "",
            isMe 
                ? "bg-[#E7F3FF] dark:bg-[#2b5278] text-black dark:text-white rounded-2xl rounded-tr-sm hover:shadow-md" 
                : "bg-white dark:bg-[#182533] text-black dark:text-white rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700 hover:shadow-md"
        )}
      >
        {/* Reply Preview */}
        {message.reply_to && (
          <div className={cn(
            "mb-1.5 pl-2 border-l-2 text-xs w-full",
            isMe ? "border-white/30 text-blue-100" : "border-gray-300 dark:border-gray-600 text-gray-500"
          )}>
            <div className="font-medium">{message.reply_to.sender?.full_name || message.reply_to.sender?.username?.replace(/^@+/, '') || 'User'}</div>
            <div className="truncate">{message.reply_to.content.substring(0, 50)}</div>
          </div>
        )}

        {/* Message Context Menu */}
        {contextMenu && !showDeleteConfirm && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {onReply && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onReply(message)
                  setContextMenu(null)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Reply className="w-4 h-4" />
                Ответить
              </button>
            )}
            {isMe && onEdit && !message.deleted_at && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(message)
                  setContextMenu(null)
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Редактировать
              </button>
            )}
            {isMe && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteConfirm(true)
                }}
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
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]"
            style={{ top: contextMenu?.y, left: contextMenu?.x }}
          >
            <div className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Удалить сообщение?</div>
            <div className="space-y-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(false)
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Удалить для меня
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(true)
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Удалить для всех
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteConfirm(false)
                  setContextMenu(null)
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
        
        {voiceAttachment ? (
            <div className="flex items-center gap-2 min-w-[180px]">
                <button 
                    onClick={togglePlay}
                    className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors",
                        isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-blue-100 hover:bg-blue-200 text-blue-600 dark:bg-gray-700 dark:text-blue-400"
                    )}
                >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
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
            <div className="text-sm break-words whitespace-pre-wrap font-object-sans">
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
        
        {/* Time and checkmarks inline */}
        <div className={cn("text-[11px] flex items-center gap-0.5 shrink-0", isMe ? "text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400")}>
            <span className="opacity-70 whitespace-nowrap">{format(new Date(message.created_at), 'HH:mm')}</span>
            {isMe && (
                <span className="flex items-center gap-0.5" title={message.read_at ? 'Прочитано' : 'Доставлено'}>
                    <Check className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                    {message.read_at && (
                        <Check className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                    )}
                </span>
            )}
        </div>
      </div>
    </div>
  )
}


