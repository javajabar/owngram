'use client'

import { useEffect, useState } from 'react'
import { FileText, File, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocumentPreviewProps {
  url: string
  fileName: string
  mimeType?: string
  isMe?: boolean
}

export function DocumentPreview({ url, fileName, mimeType, isMe = false }: DocumentPreviewProps) {
  const [previewPages, setPreviewPages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const generatePreview = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Check file type
        const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc')
        const isPptx = fileName.endsWith('.pptx') || fileName.endsWith('.ppt')
        const isPdf = fileName.endsWith('.pdf')

        if (isPdf) {
          // For PDF, use iframe with Google Docs Viewer
          setPreviewPages([url])
          setIsLoading(false)
          return
        }

        if (isDocx) {
          // For DOCX, fetch and convert using mammoth
          try {
            const response = await fetch(url, {
              mode: 'cors',
              credentials: 'omit'
            })
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`)
            }
            
            const arrayBuffer = await response.arrayBuffer()
            
            // Dynamic import to avoid SSR issues
            const mammoth = await import('mammoth')
            const result = await mammoth.convertToHtml({ arrayBuffer })
          
          // Split HTML into pages (approximate - by paragraphs)
          const htmlContent = result.value
          const parser = new DOMParser()
          const doc = parser.parseFromString(htmlContent, 'text/html')
          const paragraphs = doc.querySelectorAll('p')
          
          // Create preview pages (2-3 pages)
          const pages: string[] = []
          let currentPage = ''
          let pageCount = 0
          const maxPages = 3
          const paragraphsPerPage = Math.max(5, Math.ceil(paragraphs.length / maxPages))

          paragraphs.forEach((p, idx) => {
            if (pageCount >= maxPages) return
            
            currentPage += p.outerHTML
            
            if ((idx + 1) % paragraphsPerPage === 0 || idx === paragraphs.length - 1) {
              pages.push(`<div style="padding: 20px; background: white; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${currentPage}</div>`)
              currentPage = ''
              pageCount++
            }
          })

          if (pages.length === 0 && htmlContent) {
            // If no paragraphs, show first part of content
            const preview = htmlContent.substring(0, 2000)
            pages.push(`<div style="padding: 20px; background: white; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${preview}</div>`)
          }

          setPreviewPages(pages)
          setIsLoading(false)
          } catch (fetchError: any) {
            console.error('Error fetching DOCX file:', fetchError)
            // Fallback: use Office Online Viewer
            setPreviewPages([`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`])
            setIsLoading(false)
          }
        } else if (isPptx) {
          // For PPTX, use Office Online Viewer
          // We'll show a preview using iframe
          setPreviewPages([`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`])
          setIsLoading(false)
        } else {
          // For other files, show file icon
          setIsLoading(false)
        }
      } catch (err: any) {
        console.error('Error generating document preview:', err)
        setError(err.message || 'Не удалось загрузить превью')
        setIsLoading(false)
      }
    }

    generatePreview()
  }, [url, fileName])

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center justify-center p-8 rounded-lg",
        isMe ? "bg-white/10" : "bg-gray-100 dark:bg-gray-800"
      )}>
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Загрузка превью...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn(
        "flex items-center gap-3 p-4 rounded-lg border",
        isMe 
          ? "bg-white/10 border-white/20 text-white" 
          : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}>
        <File className={cn("w-5 h-5 shrink-0", isMe ? "text-white" : "text-gray-600 dark:text-gray-400")} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{fileName}</div>
          <div className="text-xs opacity-70">{error}</div>
        </div>
      </div>
    )
  }

  const isPdf = fileName.endsWith('.pdf')
  const isPptx = fileName.endsWith('.pptx') || fileName.endsWith('.ppt')

  if (isPdf || isPptx) {
    // Use iframe for PDF and PPTX
    return (
      <div className="space-y-2">
        <div className={cn(
          "rounded-lg overflow-hidden border",
          isMe ? "border-white/20" : "border-gray-200 dark:border-gray-700"
        )}>
          <iframe
            src={previewPages[0]}
            className="w-full h-[400px] border-0"
            title={`Preview of ${fileName}`}
          />
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ease-in-out hover:scale-[1.02]",
            isMe 
              ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" 
              : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
          )}
        >
          <FileText className={cn("w-5 h-5 shrink-0", isMe ? "text-white" : "text-blue-600 dark:text-blue-400")} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{fileName}</div>
            <div className="text-xs opacity-70">Открыть в новой вкладке</div>
          </div>
        </a>
      </div>
    )
  }

  // For DOCX, show HTML preview
  if (previewPages.length > 0) {
    return (
      <div className="space-y-2">
        <div className={cn(
          "rounded-lg overflow-hidden border max-h-[500px] overflow-y-auto",
          isMe ? "border-white/20 bg-white/5" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        )}>
          <div 
            className="p-4"
            dangerouslySetInnerHTML={{ __html: previewPages.slice(0, 3).join('') }}
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '14px',
              lineHeight: '1.6',
              color: isMe ? 'white' : 'inherit'
            }}
          />
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ease-in-out hover:scale-[1.02]",
            isMe 
              ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" 
              : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
          )}
        >
          <FileText className={cn("w-5 h-5 shrink-0", isMe ? "text-white" : "text-blue-600 dark:text-blue-400")} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{fileName}</div>
            <div className="text-xs opacity-70">Открыть полный документ</div>
          </div>
        </a>
      </div>
    )
  }

  // Fallback: show file icon
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all duration-300 ease-in-out hover:scale-[1.02]",
        isMe 
          ? "bg-white/10 border-white/20 hover:bg-white/20 text-white" 
          : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
      )}
    >
      <File className={cn("w-5 h-5 shrink-0", isMe ? "text-white" : "text-blue-600 dark:text-blue-400")} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{fileName}</div>
        <div className="text-xs opacity-70">Открыть файл</div>
      </div>
    </a>
  )
}

