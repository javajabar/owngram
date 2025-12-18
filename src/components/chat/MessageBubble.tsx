'use client'

import { Message } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Play, Pause, Check, CheckCheck, MoreVertical, Edit, Trash2, Reply, X, Paperclip, Share2, Copy, CheckCircle2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const REACTIONS = ['🍌', '❤️', '👍', '🔥', '😂', '😮', '😢', '👏']

interface MessageBubbleProps {
  message: Message
  onReply?: (message: Message) => void
  onEdit?: (message: Message) => void
  onDelete?: (messageId: string, deleteForAll: boolean) => void
  showAvatar?: boolean
  onImageClick?: (imageUrl: string) => void
  onAvatarClick?: (avatarUrl: string) => void
  onReaction?: (messageId: string, emoji: string) => void
  onForward?: (message: Message) => void
  onSelect?: (messageId: string) => void
  isSelected?: boolean
  isSelectionMode?: boolean
}

export function MessageBubble({ 
  message, 
  onReply, 
  onEdit, 
  onDelete, 
  showAvatar = false, 
  onImageClick, 
  onAvatarClick,
  onReaction,
  onForward,
  onSelect,
  isSelected = false,
  isSelectionMode = false
}: MessageBubbleProps) {
  const { user } = useAuthStore()
  const isMe = user?.id === message.sender_id
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
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

  // Recalculate menu position when context menu opens or window resizes
  useEffect(() => {
    if (!contextMenu) {
      setMenuPosition(null)
      return
    }
    
    const calculatePosition = () => {
      const menuWidth = 160 // min-w-[160px]
      const menuHeight = 150 // approximate height
      const padding = 10
      
      let x = contextMenu.x
      let y = contextMenu.y
      
      // Check right edge - flip to left side of cursor
      if (x + menuWidth + padding > window.innerWidth) {
        x = contextMenu.x - menuWidth
      }
      
      // Check left edge
      if (x < padding) {
        x = padding
      }
      
      // Check bottom edge - flip to top side of cursor
      if (y + menuHeight + padding > window.innerHeight) {
        y = contextMenu.y - menuHeight
      }
      
      // Check top edge
      if (y < padding) {
        y = padding
      }
      
      setMenuPosition({ x, y })
    }
    
    calculatePosition()
    
    // Recalculate on window resize
    window.addEventListener('resize', calculatePosition)
    return () => window.removeEventListener('resize', calculatePosition)
  }, [contextMenu])

  // Close menu when clicking outside
  useEffect(() => {
    if (!contextMenu && !showDeleteConfirm) return
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
        setShowDeleteConfirm(false)
        setMenuPosition(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu, showDeleteConfirm])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isSelectionMode) return

    // Calculate menu position with boundary checks
    const menuWidth = 200 // wider for reactions
    const menuHeight = 250 // approximate height
    const padding = 10
    
    let x = e.clientX
    let y = e.clientY
    
    if (x + menuWidth + padding > window.innerWidth) x = e.clientX - menuWidth
    if (x < padding) x = padding
    if (y + menuHeight + padding > window.innerHeight) y = e.clientY - menuHeight
    if (y < padding) y = padding
    
    setContextMenu({ x: e.clientX, y: e.clientY })
    setMenuPosition({ x, y })
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onReaction) {
      onReaction(message.id, '🍌')
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setContextMenu(null)
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
    <div 
      className={cn(
        "flex w-full mb-2 group items-end gap-2 transition-all duration-300 ease-in-out relative", 
        isMe ? "justify-end" : "justify-start",
        isSelected && "bg-blue-500/10"
      )}
      onClick={() => isSelectionMode && onSelect?.(message.id)}
    >
      {isSelectionMode && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            isSelected ? "bg-blue-500 border-blue-500" : "border-gray-400"
          )}>
            {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
          </div>
        </div>
      )}

      {/* Avatar for other user's messages - or empty space to align messages */}
      {!isMe && (
        <div className="w-8 h-8 shrink-0">
          {showAvatar && (
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => {
                if (message.sender?.avatar_url && onAvatarClick) {
                  onAvatarClick(message.sender.avatar_url)
                }
              }}
            >
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
        onDoubleClick={handleDoubleClick}
        className={cn(
            message.attachments?.some((a: any) => a.type === 'image')
                ? "max-w-[155px] px-0 py-0 shadow-sm relative text-sm inline-flex flex-col gap-1.5 transition-all duration-200 ease-out"
                : "max-w-[70%] px-2.5 py-1.5 shadow-sm relative text-sm inline-flex flex-col gap-1.5 transition-all duration-200 ease-out",
            message.deleted_at && message.deleted_for_all
                ? "opacity-50 italic"
                : "",
            isMe 
                ? "bg-[#E7F3FF] dark:bg-[#2b5278] text-black dark:text-white rounded-2xl rounded-tr-sm hover:shadow-md" 
                : "bg-white dark:bg-[#182533] text-black dark:text-white rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700 hover:shadow-md",
            isSelectionMode && "pointer-events-none"
        )}
      >
        {/* Forwarded Info */}
        {message.forwarded_from_id && (
          <div className={cn(
            "flex items-center gap-1.5 mb-1 opacity-80",
            isMe ? "text-blue-100" : "text-blue-500"
          )}>
            <Share2 className="w-3 h-3" />
            <span className="text-[10px] font-medium italic">
              Переслано от {message.forwarded_from?.full_name || 'пользователя'}
            </span>
          </div>
        )}

        <div className="flex items-end gap-1.5 w-full">
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
        {contextMenu && menuPosition && !showDeleteConfirm && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px] overflow-hidden"
            style={{ 
              top: `${menuPosition.y}px`,
              left: `${menuPosition.x}px`
            }}
          >
            {/* Reactions Grid */}
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-2 justify-between">
              {REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReaction?.(message.id, emoji); setContextMenu(null) }}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-1">
            {onReply && (
              <button
                onClick={(e) => { e.stopPropagation(); onReply(message); setContextMenu(null) }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <Reply className="w-4 h-4 opacity-70" />
                Ответить
              </button>
            )}
            <button
              onClick={handleCopy}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <Copy className="w-4 h-4 opacity-70" />
              Копировать
            </button>
            <button
              onClick={() => { onForward?.(message); setContextMenu(null) }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <Share2 className="w-4 h-4 opacity-70" />
              Переслать
            </button>
            <button
              onClick={() => { onSelect?.(message.id); setContextMenu(null) }}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 opacity-70" />
              Выделить
            </button>
            {isMe && onEdit && !message.deleted_at && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(message); setContextMenu(null) }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <Edit className="w-4 h-4 opacity-70" />
                Редактировать
              </button>
            )}
            {isMe && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
              >
                <Trash2 className="w-4 h-4 opacity-70" />
                Удалить
              </button>
            )}
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && menuPosition && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]"
            style={{ 
              top: `${menuPosition.y}px`,
              left: `${menuPosition.x}px`
            }}
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
        ) : message.attachments?.some((a: any) => a.type === 'image') ? (
            <div className="space-y-2">
                {message.attachments.filter((a: any) => a.type === 'image').map((attachment: any, idx: number) => (
                    <div
                        key={idx}
                        className="relative block rounded-lg overflow-hidden max-w-[155px] cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation()
                            if (onImageClick) {
                                onImageClick(attachment.url)
                            }
                        }}
                    >
                        <img 
                            src={attachment.url} 
                            alt={attachment.name || 'Image'} 
                            className="w-full h-auto object-cover hover:opacity-90 transition-opacity rounded-lg"
                        />
                        {/* Time overlay on image - always visible */}
                        <div className={cn(
                            "absolute bottom-1 right-1 px-1.5 py-0.5 rounded flex items-center gap-0.5",
                            "bg-black/50 backdrop-blur-sm text-white text-[8px]"
                        )}>
                            <span>{format(new Date(message.created_at), 'HH:mm')}</span>
                            {isMe && (
                                <span className="relative flex items-center">
                                    {message.delivered_at ? (
                                        message.read_at ? (
                                            <span className="relative inline-flex items-center">
                                                <Check className="w-2.5 h-2.5 text-white" />
                                                <Check className="w-2.5 h-2.5 text-white absolute left-1" />
                                            </span>
                                        ) : (
                                            <Check className="w-2.5 h-2.5 text-white" />
                                        )
                                    ) : (
                                        <span className="w-2.5 h-2.5 text-white/50">⏳</span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
                {message.content && message.content !== '📷 Фото' && (
                    <div className="text-sm break-words whitespace-pre-wrap font-object-sans">
                        {message.content}
                    </div>
                )}
            </div>
        ) : message.attachments?.some((a: any) => a.type === 'file') ? (
            <div className="space-y-2">
                {message.attachments.filter((a: any) => a.type === 'file').map((attachment: any, idx: number) => (
                    <a
                        key={idx}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                            isMe 
                                ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" 
                                : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                            isMe ? "bg-white/20" : "bg-blue-100 dark:bg-blue-900/30"
                        )}>
                            <Paperclip className={cn("w-5 h-5", isMe ? "text-white" : "text-blue-600 dark:text-blue-400")} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{attachment.name || 'Файл'}</div>
                            {attachment.size && (
                                <div className="text-xs opacity-70">
                                    {(attachment.size / 1024).toFixed(1)} KB
                                </div>
                            )}
                        </div>
                    </a>
                ))}
                {message.content && message.content !== `📎 ${message.attachments[0]?.name}` && (
                    <div className="text-sm break-words whitespace-pre-wrap font-object-sans">
                        {message.content}
                    </div>
                )}
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
        
        {/* Time and checkmarks inline - only show if not image */}
        {!message.attachments?.some((a: any) => a.type === 'image') && (
            <div className={cn("text-[8px] flex items-center gap-1 shrink-0 mt-auto pb-0.5", isMe ? "text-blue-600 dark:text-blue-300" : "text-gray-500 dark:text-gray-400")}>
            <span className="opacity-70 whitespace-nowrap">{format(new Date(message.created_at), 'HH:mm')}</span>
            {isMe && (
                    <span className="relative flex items-center" title={message.read_at ? 'Прочитано' : message.delivered_at ? 'Доставлено' : 'Отправляется...'}>
                    {message.delivered_at ? (
                            message.read_at ? (
                                // Two checkmarks like in Telegram - second one slightly offset
                                <span className="relative inline-flex items-center">
                                    <Check className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                                    <Check className="w-3 h-3 text-blue-500 dark:text-blue-400 absolute left-1.5" />
                                </span>
                            ) : (
                                // Single checkmark for delivered
                            <Check className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                            )
                    ) : (
                        <span className="w-3 h-3 text-gray-400">⏳</span>
                    )}
                </span>
            )}
        </div>
        )}
        </div>

        {/* Reactions Display */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={cn(
            "flex flex-wrap gap-1 mt-1",
            isMe ? "justify-end" : "justify-start"
          )}>
            {Object.entries(message.reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                onClick={(e) => { e.stopPropagation(); onReaction?.(message.id, emoji) }}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-all active:scale-90",
                  userIds.includes(user?.id || '') 
                    ? "bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400" 
                    : "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                )}
              >
                <span className={cn(emoji === '🍌' && "animate-bounce origin-bottom")}>{emoji}</span>
                {userIds.length > 1 && <span className="font-bold">{userIds.length}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


