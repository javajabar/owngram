'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw, Check } from 'lucide-react'

interface ImageCropperProps {
  imageUrl: string
  onCrop: (croppedBlob: Blob) => void
  onCancel: () => void
}

export function ImageCropper({ imageUrl, onCrop, onCancel }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isLoading, setIsLoading] = useState(true)

  const CANVAS_SIZE = 280 // Size of the crop area

  // Load image
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      setImage(img)
      setIsLoading(false)
      
      // Calculate initial scale to fit image
      const minDimension = Math.min(img.width, img.height)
      const initialScale = CANVAS_SIZE / minDimension
      setScale(initialScale * 1.2) // Start slightly zoomed in
      
      // Center the image
      setPosition({
        x: (CANVAS_SIZE - img.width * initialScale * 1.2) / 2,
        y: (CANVAS_SIZE - img.height * initialScale * 1.2) / 2
      })
    }
    img.onerror = () => {
      setIsLoading(false)
      alert('Ошибка загрузки изображения')
      onCancel()
    }
    img.src = imageUrl
  }, [imageUrl, onCancel])

  // Draw image on canvas
  const drawImage = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !image) return

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw image
    ctx.save()
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    const scaledWidth = image.width * scale
    const scaledHeight = image.height * scale
    
    ctx.drawImage(
      image,
      position.x,
      position.y,
      scaledWidth,
      scaledHeight
    )
    ctx.restore()

    // Draw circle border
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 2, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 4
    ctx.stroke()
  }, [image, scale, position])

  useEffect(() => {
    drawImage()
  }, [drawImage])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return
    e.preventDefault()
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Zoom
  const handleZoom = (delta: number) => {
    const newScale = Math.max(0.1, Math.min(5, scale + delta))
    
    // Adjust position to zoom towards center
    const scaleRatio = newScale / scale
    const centerX = CANVAS_SIZE / 2
    const centerY = CANVAS_SIZE / 2
    
    setPosition(prev => ({
      x: centerX - (centerX - prev.x) * scaleRatio,
      y: centerY - (centerY - prev.y) * scaleRatio
    }))
    
    setScale(newScale)
  }

  // Reset
  const handleReset = () => {
    if (!image) return
    const minDimension = Math.min(image.width, image.height)
    const initialScale = CANVAS_SIZE / minDimension
    setScale(initialScale * 1.2)
    setPosition({
      x: (CANVAS_SIZE - image.width * initialScale * 1.2) / 2,
      y: (CANVAS_SIZE - image.height * initialScale * 1.2) / 2
    })
  }

  // Crop and export
  const handleCrop = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Create output canvas at desired size
    const outputCanvas = document.createElement('canvas')
    const outputSize = 256 // Output size
    outputCanvas.width = outputSize
    outputCanvas.height = outputSize
    const ctx = outputCanvas.getContext('2d')
    if (!ctx) return

    // Draw circular crop
    ctx.beginPath()
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    // Scale the canvas content to output size
    ctx.drawImage(canvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 0, 0, outputSize, outputSize)

    // Convert to blob
    outputCanvas.toBlob((blob) => {
      if (blob) {
        onCrop(blob)
      }
    }, 'image/png', 0.9)
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    handleZoom(delta)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Редактировать фото</h3>
          <button 
            onClick={onCancel}
            className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="w-[280px] h-[280px] mx-auto flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Canvas */}
            <div 
              className="relative mx-auto mb-4 cursor-move"
              style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
                className="rounded-full bg-gray-800"
                style={{ touchAction: 'none' }}
              />
              <div className="absolute inset-0 rounded-full border-4 border-dashed border-white/20 pointer-events-none" />
            </div>

            <p className="text-center text-gray-400 text-sm mb-4">
              Перетащите для позиционирования
            </p>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <button
                onClick={() => handleZoom(-0.2)}
                className="p-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors"
                title="Уменьшить"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={scale}
                onChange={(e) => {
                  const newScale = parseFloat(e.target.value)
                  const scaleRatio = newScale / scale
                  const centerX = CANVAS_SIZE / 2
                  const centerY = CANVAS_SIZE / 2
                  setPosition(prev => ({
                    x: centerX - (centerX - prev.x) * scaleRatio,
                    y: centerY - (centerY - prev.y) * scaleRatio
                  }))
                  setScale(newScale)
                }}
                className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              
              <button
                onClick={() => handleZoom(0.2)}
                className="p-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors"
                title="Увеличить"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              
              <button
                onClick={handleReset}
                className="p-3 bg-gray-800 hover:bg-gray-700 rounded-full text-white transition-colors ml-2"
                title="Сбросить"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCrop}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Применить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

