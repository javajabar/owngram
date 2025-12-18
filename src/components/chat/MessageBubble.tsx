'use client'

import { Message, Profile } from '@/types'
import { useAuthStore } from '@/store/useAuthStore'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Play, Pause, Check, CheckCheck, MoreVertical, Edit, Trash2, Reply, X, Paperclip, Share2, Copy, CheckCircle2, Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { profileCache } from '@/lib/cache'
import { REACTIONS_LIST } from '@/lib/constants'

const ReactorAvatar = ({ userId }: { userId: string }) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  
  useEffect(() => {
    const fetchProfile = async () => {
      const profile = await profileCache.fetch(userId, supabase)
      if (profile) setAvatarUrl(profile.avatar_url)
    }
    fetchProfile()
  }, [userId])

  if (!avatarUrl) return (
    <div className="w-4 h-4 rounded-full bg-black/20 dark:bg-white/20 flex items-center justify-center shrink-0">
      <span className="text-[6px] text-white font-bold">?</span>
    </div>
  )
  return <img src={avatarUrl} className="w-4 h-4 rounded-full object-cover shrink-0 border border-white/10" alt="" />
}

// Format call duration
function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs} сек`
  return `${mins} мин ${secs} сек`
}

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
  onUserClick?: (userId: string) => void
  isSelected?: boolean
  isSelectionMode?: boolean
  currentUserProfile?: Profile | null
}

const SystemMessage = ({ message, onUserClick }: { message: Message, onUserClick?: (userId: string) => void }) => {
  const isPhotoChange = message.content.includes('поменял(-а) фото группы')
  const photoUrl = message.attachments?.find((a: any) => a.type === 'image')?.url

  return (
    <div className="flex flex-col items-center justify-center w-full my-4 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">
      <div className="bg-black/20 dark:bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-sm">
        {isPhotoChange && photoUrl && (
          <div className="w-6 h-6 rounded-full overflow-hidden border border-white/20 shrink-0">
            <img src={photoUrl} className="w-full h-full object-cover" alt="" />
          </div>
        )}
        <span className="text-[13px] font-bold text-white dark:text-gray-200 drop-shadow-sm select-none">
          {message.content}
        </span>
      </div>
    </div>
  )
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
  onUserClick,
  isSelected = false,
  isSelectionMode = false,
  currentUserProfile
}: MessageBubbleProps) {
  if (message.type === 'system') {
    return <SystemMessage message={message} onUserClick={onUserClick} />
  }

  const { user } = useAuthStore()
  const isMe = user?.id === message.sender_id
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggeredRef = useRef<boolean>(false)
  
  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [showAllReactions, setShowAllReactions] = useState(false)
  const reactionEntries = Object.entries(message.reactions || {}).filter(
    ([, userIds]) => Array.isArray(userIds) && userIds.length > 0
  )
  const hasReactions = reactionEntries.length > 0
  
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

  // Close menu when clicking/touching outside
  useEffect(() => {
    if (!contextMenu && !showDeleteConfirm) return
    
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
        setShowDeleteConfirm(false)
        setMenuPosition(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [contextMenu, showDeleteConfirm])

  const openContextMenu = (x: number, y: number) => {
    if (isSelectionMode) return

    // Calculate menu position with boundary checks
    const menuWidth = 200 // wider for reactions
    const menuHeight = 250 // approximate height
    const padding = 10
    
    let menuX = x
    let menuY = y
    
    if (menuX + menuWidth + padding > window.innerWidth) menuX = x - menuWidth
    if (menuX < padding) menuX = padding
    if (menuY + menuHeight + padding > window.innerHeight) menuY = y - menuHeight
    if (menuY < padding) menuY = padding
    
    setContextMenu({ x, y })
    setMenuPosition({ x: menuX, y: menuY })
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openContextMenu(e.clientX, e.clientY)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSelectionMode) return
    
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    longPressTriggeredRef.current = false
    
    // Start long press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      if (touchStartPosRef.current) {
        e.preventDefault()
        e.stopPropagation()
        longPressTriggeredRef.current = true
        openContextMenu(touchStartPosRef.current.x, touchStartPosRef.current.y)
        // Haptic feedback on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate(50)
        }
      }
    }, 500)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear long press timer if user lifts finger before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    
    // Prevent other interactions if long press was triggered
    if (longPressTriggeredRef.current) {
      e.preventDefault()
      e.stopPropagation()
      // Reset after a short delay
      setTimeout(() => {
        longPressTriggeredRef.current = false
      }, 100)
    }
    
    touchStartPosRef.current = null
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long press if user moves finger too much
    if (touchStartPosRef.current && longPressTimerRef.current) {
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)
      
      // If moved more than 10px, cancel long press
      if (deltaX > 10 || deltaY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current)
          longPressTimerRef.current = null
        }
        touchStartPosRef.current = null
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onReaction) {
      onReaction(message.id, currentUserProfile?.default_reaction || '❤️')
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
        "flex w-full mb-2 group items-end gap-2 transition-all duration-500 ease-in-out relative", 
        isMe ? "justify-end" : "justify-start",
        isSelected && "bg-blue-500/10"
      )}
      onClick={() => isSelectionMode && onSelect?.(message.id)}
    >
      {isSelectionMode && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ease-in-out",
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
              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer hover:opacity-90 transition-all duration-300 ease-in-out hover:scale-110"
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onDoubleClick={handleDoubleClick}
        className={cn(
            message.attachments?.some((a: any) => a.type === 'image')
                ? "max-w-[155px] px-0 py-0 shadow-sm relative text-sm inline-flex flex-col gap-0 transition-all duration-500 ease-in-out"
                : "max-w-[70%] px-2.5 py-1.5 shadow-sm relative text-sm inline-flex flex-col gap-0 transition-all duration-500 ease-in-out",
            hasReactions && !message.attachments?.some((a: any) => a.type === 'image') && message.type !== 'call'
                ? "min-w-[120px]" 
                : "",
            message.deleted_at && message.deleted_for_all
                ? "opacity-50 italic"
                : "",
            isMe 
                ? "bg-[#E7F3FF] dark:bg-[#2b5278] text-black dark:text-white rounded-2xl rounded-tr-sm hover:shadow-md" 
                : "bg-white dark:bg-[#182533] text-black dark:text-white rounded-2xl rounded-tl-sm border border-gray-200 dark:border-gray-700 hover:shadow-md",
            isSelectionMode && "pointer-events-none",
            "select-none"
        )}
      >
        {/* Forwarded Info */}
        {message.forwarded_from_id && message.type !== 'call' && (
          <div 
            className={cn(
              "flex items-center gap-1.5 mb-1.5 opacity-90 cursor-pointer hover:opacity-100 transition-all duration-300 ease-in-out p-1.5 pb-0 hover:scale-105",
              isMe ? "text-blue-100" : "text-blue-500"
            )}
            onClick={(e) => {
              e.stopPropagation()
              if (onUserClick && message.forwarded_from_id) {
                onUserClick(message.forwarded_from_id)
              }
            }}
          >
            <Reply className="w-3.5 h-3.5 rotate-180 scale-y-[-1]" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium italic whitespace-nowrap">
                Переслано от
              </span>
              <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full border border-black/5 dark:border-white/5">
                <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 border border-white/20">
                  {message.forwarded_from?.avatar_url ? (
                    <img src={message.forwarded_from.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-blue-500 flex items-center justify-center text-[7px] text-white font-bold">
                      {(message.forwarded_from?.full_name?.[0] || 'U').toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-bold truncate max-w-[120px]">
                  {message.forwarded_from?.full_name || 'Пользователя'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Reply Preview */}
        {message.reply_to && !message.deleted_at && message.type !== 'call' && (
          <div className={cn(
            "mb-1.5 mx-1.5 mt-1.5 pl-2 border-l-2 text-xs",
            isMe ? "border-white/30 text-blue-100" : "border-gray-300 dark:border-gray-600 text-gray-500"
          )}>
            <div className="font-medium">{message.reply_to.sender?.full_name || message.reply_to.sender?.username?.replace(/^@+/, '') || 'User'}</div>
            <div className="truncate opacity-80">{message.reply_to.content.substring(0, 50)}</div>
          </div>
        )}

        <div className="px-1.5 py-0.5">
          {voiceAttachment ? (
              <div className="flex items-center gap-2 min-w-[180px]">
                  <button 
                      onClick={togglePlay}
                      className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ease-in-out hover:scale-110 active:scale-95",
                          isMe ? "bg-white/20 hover:bg-white/30 text-white" : "bg-blue-100 hover:bg-blue-200 text-blue-600 dark:bg-gray-700 dark:text-blue-400"
                      )}
                  >
                      {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                  </button>
                  <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                          className={cn("h-full transition-all duration-300 ease-in-out", isMe ? "bg-white/70" : "bg-blue-500")} 
                          style={{ width: `${progress}%` }}
                      />
                  </div>
                  <div className={cn("text-[10px] font-mono w-8 text-right", isMe ? "text-blue-100" : "text-gray-500")}>
                      {formatDuration(duration || 0)}
                  </div>
                  <audio ref={audioRef} src={voiceAttachment.url} className="hidden" preload="metadata" />
              </div>
          ) : message.type === 'call' ? (
              <div className="flex items-center gap-3 py-1 min-w-[180px]">
                  <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                      message.call_info?.status === 'missed' ? "bg-red-100 dark:bg-red-900/30 text-red-500" : "bg-blue-100 dark:bg-blue-900/30 text-blue-500"
                  )}>
                      {message.call_info?.status === 'missed' ? (
                          <PhoneMissed className="w-5 h-5" />
                      ) : message.call_info?.status === 'rejected' ? (
                          <PhoneOff className="w-5 h-5" />
                      ) : (
                          <Phone className="w-5 h-5" />
                      )}
                  </div>
                  <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-bold dark:text-white">
                          {message.call_info?.status === 'missed' ? 'Пропущенный звонок' :
                           message.call_info?.status === 'rejected' ? 'Отклоненный звонок' :
                           message.call_info?.status === 'cancelled' ? 'Отмененный звонок' :
                           'Звонок завершен'}
                      </div>
                      {message.call_info?.duration ? (
                          <div className="text-xs opacity-70">
                              Длительность: {formatCallDuration(message.call_info.duration)}
                          </div>
                      ) : (
                          <div className="text-xs opacity-70">
                              {message.created_at ? format(new Date(message.created_at), 'HH:mm') : ''}
                          </div>
                      )}
                  </div>
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
                              className="w-full h-auto object-cover hover:opacity-90 transition-all duration-300 ease-in-out rounded-lg hover:scale-[1.02]"
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
                      <div className="text-[15px] break-words whitespace-pre-wrap font-object-sans">
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
                              "flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ease-in-out hover:scale-[1.02]",
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
                              <div className="font-[15px] truncate">{attachment.name || 'Файл'}</div>
                              {attachment.size && (
                                  <div className="text-xs opacity-70">
                                      {(attachment.size / 1024).toFixed(1)} KB
                                  </div>
                              )}
                          </div>
                      </a>
                  ))}
                  {message.content && message.content !== `📎 ${message.attachments[0]?.name}` && (
                      <div className="text-[15px] break-words whitespace-pre-wrap font-object-sans">
                          {message.content}
                      </div>
                  )}
              </div>
          ) : (
              <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap font-object-sans">
                  {message.deleted_at && message.deleted_for_all ? (
                    <span className="italic opacity-70">Сообщение удалено</span>
                  ) : (
                    message.content
                  )}
                  {message.updated_at && message.updated_at !== message.created_at && (
                    <span className="text-[11px] opacity-50 ml-1.5">(изменено)</span>
                  )}
              </div>
          )}
        </div>

        {/* Footer with Reactions and Time - inline */}
        {message.type !== 'call' && !message.attachments?.some((a: any) => a.type === 'image') && (
          <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5 mt-0.5">
            {/* Reactions on the left */}
            {hasReactions ? (
              <div className="flex flex-wrap gap-1">
                {reactionEntries.slice(0, showAllReactions ? undefined : 5).map(([emoji, userIds]) => (
                  <button
                    key={emoji}
                    onClick={(e) => { e.stopPropagation(); onReaction?.(message.id, emoji) }}
                    className={cn(
                      "flex items-center gap-1 pl-1 pr-1 py-0.5 rounded-full text-[13px] transition-all duration-300 ease-in-out active:scale-90 hover:scale-105 animate-in zoom-in duration-500 ease-out-back",
                      "bg-black/10 dark:bg-white/10 border border-transparent shadow-sm hover:bg-black/20 dark:hover:bg-white/20",
                      userIds.includes(user?.id || '') 
                        ? "bg-blue-500/20 border border-blue-500/30" 
                        : ""
                    )}
                  >
                    <span className={cn(
                    (emoji === '🍌' || emoji === currentUserProfile?.default_reaction) && "animate-bounce origin-bottom inline-block", 
                    "transition-transform duration-300 ease-in-out"
                    )}>{emoji}</span>
                    
                    {userIds.length === 1 ? (
                      <ReactorAvatar userId={userIds[0]} />
                    ) : (
                      <span className="text-[10px] font-bold ml-0.5 opacity-80">{userIds.length}</span>
                    )}
                  </button>
                ))}
                
                {reactionEntries.length > 5 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAllReactions(!showAllReactions) }}
                    className="flex items-center justify-center w-6 h-6 rounded-full bg-black/10 dark:bg-white/10 text-gray-500 hover:bg-black/20 dark:hover:bg-white/20 transition-all duration-300 ease-in-out shadow-sm hover:scale-110 active:scale-95"
                  >
                    <MoreVertical className={cn("w-3 h-3 transition-transform duration-300", showAllReactions ? "rotate-90" : "rotate-0")} />
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            {/* Time on the right */}
            <div className={cn(
              "text-[10px] flex items-center gap-0.5 shrink-0 ml-auto",
              isMe ? "text-blue-600/70 dark:text-blue-300/70" : "text-gray-500/70 dark:text-gray-400/70"
            )}>
              <span className="whitespace-nowrap">{format(new Date(message.created_at), 'HH:mm')}</span>
              {isMe && (
                <span className="relative inline-flex items-center" title={message.read_at ? 'Прочитано' : message.delivered_at ? 'Доставлено' : 'Отправляется...'}>
                  {message.delivered_at ? (
                    message.read_at ? (
                      <span className="relative inline-flex items-center">
                        <Check className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                        <Check className="w-3 h-3 text-blue-500 dark:text-blue-400 absolute left-1" />
                      </span>
                    ) : (
                      <Check className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                    )
                  ) : (
                    <span className="w-3 h-3 text-gray-400">⏳</span>
                  )}
                </span>
              )}
            </div>
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
              {REACTIONS_LIST.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReaction?.(message.id, emoji); setContextMenu(null) }}
                  className="w-8 h-8 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-300 ease-in-out hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-1">
            {onReply && (
              <button
                onClick={(e) => { e.stopPropagation(); onReply(message); setContextMenu(null) }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-95"
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
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-95"
              >
                <Edit className="w-4 h-4 opacity-70" />
                Редактировать
              </button>
            )}
            {isMe && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true) }}
                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 transition-all duration-300 ease-in-out hover:scale-[1.02] active:scale-95"
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
      </div>
    </div>
  )
}


