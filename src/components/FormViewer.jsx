import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import {
  Pen, Eraser, Undo2, Trash2, Save, CheckCircle, Loader,
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X, Lock, Maximize2, Type, Download, ClipboardList, Hand
} from 'lucide-react'
import { api, SERVER_URL } from '../api'
import { useAuth } from '../context/AuthContext'
import RecordsPanel, { arrangeRecords } from './RecordsPanel'
import { LAYOUT_VERSION, analyzeTemplate, buildPatientValues, planAutoFill, preloadImage, loadImage, getLoadedImage, logoFromBanner } from '../utils/formLayout'

// ─── Ink Canvas ──────────────────────────────────────────────────────────────
// InkCanvas — canErase controls whether eraser/undo/clear tools are available
const InkCanvas = forwardRef(function InkCanvas({ formId, initialAnnotations, externalAnnotations, pdfPage, viewportSize, onSave, canErase, allowDrawing = true, scale = 1, onSwipeLeft, onSwipeRight, onDirtyChange, onPinchZoom }, ref) {
  const canvasRef = useRef(null)
  const protectedCanvasRef = useRef(null) // Separate layer for auto-filled patient data — immune to eraser
  const protectedCtxRef = useRef(null)
  const [tool, setTool] = useState(allowDrawing ? 'pen' : 'type')
  const [color, setColor] = useState('#1a1a2e')
  const [lineWidth, setLineWidth] = useState(2.5)
  const [strokes, setStrokes] = useState(initialAnnotations || [])
  const [currentStroke, setCurrentStroke] = useState(null)
  const currentStrokeRef = useRef(null) // Sync ref — always current, never stale in event handlers
  const activePointerType = useRef(null) // Track which pointer type is drawing (for palm rejection)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false) // true only after a REAL edit on this page
  const isDrawing = useRef(false)
  const lastPoint = useRef(null)
  const startPoint = useRef(null) // for swipe detection
  const ctxRef = useRef(null)
  const [activeText, setActiveText] = useState(null) // {x, y, content}
  const textInputRef = useRef(null)
  const scrollContainerRef = useRef(null) // ref for pinch-to-zoom touch listeners

  // Notify parent whenever this page picks up an edit that hasn't reached the server yet.
  // (Not tied to `saved` — that flag is just the toolbar's "Saved!" UI blip.)
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(hasChanges)
  }, [hasChanges, onDirtyChange])

  // ── Pinch-to-zoom: non-passive touch listeners on the scroll container ────────
  // Must use addEventListener (not JSX) so we can call preventDefault() in touchmove.
  // While the fingers move, the page is only CSS-transformed (cheap, smooth); the real
  // re-render at the new scale happens once, when the pinch ends.
  const pageWrapRef = useRef(null)
  const pinchRef = useRef(null)          // active pinch: { startDist, ox, oy, startMid, ratio, mid }
  const pendingAnchorRef = useRef(null)  // keep the pinched point under the fingers after re-render
  const touchPointersRef = useRef(new Set())
  const multiTouchRef = useRef(false)    // a 2nd finger touched — suppress drawing and swipes until all lift
  const onPinchZoomRef = useRef(onPinchZoom)
  onPinchZoomRef.current = onPinchZoom

  // Drop any half-drawn stroke (e.g. the line the first finger started before the second landed)
  const cancelStroke = useCallback(() => {
    if (!isDrawing.current && !currentStrokeRef.current) return
    isDrawing.current = false
    currentStrokeRef.current = null
    activePointerType.current = null
    lastPoint.current = null
    startPoint.current = null
    setCurrentStroke(null)
    setStrokes(prev => prev.slice()) // triggers a full redraw, wiping the partial line
  }, [])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el || !onPinchZoomRef.current) return

    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const midpoint = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })

    const onTouchStart = (e) => {
      if (e.touches.length !== 2 || !pageWrapRef.current) return
      multiTouchRef.current = true
      cancelStroke()
      const rect = pageWrapRef.current.getBoundingClientRect()
      const mid = midpoint(e.touches)
      pinchRef.current = {
        startDist: dist(e.touches), ratio: 1, startMid: mid, mid,
        ox: mid.x - rect.left, oy: mid.y - rect.top, w: rect.width, h: rect.height,
      }
      pageWrapRef.current.style.transformOrigin = `${pinchRef.current.ox}px ${pinchRef.current.oy}px`
      pageWrapRef.current.style.willChange = 'transform'
    }

    const onTouchMove = (e) => {
      const pinch = pinchRef.current
      if (!pinch || e.touches.length !== 2) return
      // Stop browser from doing its own pinch-zoom / scroll during our gesture
      e.preventDefault()
      const d = dist(e.touches)
      if (!(d > 0 && pinch.startDist > 0)) return
      pinch.ratio = d / pinch.startDist
      pinch.mid = midpoint(e.touches)
      const tx = pinch.mid.x - pinch.startMid.x
      const ty = pinch.mid.y - pinch.startMid.y
      pageWrapRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${pinch.ratio})`
    }

    const endPinch = () => {
      const pinch = pinchRef.current
      pinchRef.current = null
      if (pageWrapRef.current) {
        pageWrapRef.current.style.transform = ''
        pageWrapRef.current.style.willChange = ''
      }
      if (!pinch || Math.abs(pinch.ratio - 1) < 0.02) return
      const cRect = el.getBoundingClientRect()
      pendingAnchorRef.current = {
        fx: pinch.ox / pinch.w, fy: pinch.oy / pinch.h,  // pinched point as a page fraction
        cx: pinch.mid.x - cRect.left, cy: pinch.mid.y - cRect.top, // where the fingers ended
      }
      onPinchZoomRef.current?.(pinch.ratio)
    }

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) endPinch()
      if (e.touches.length === 0) {
        multiTouchRef.current = false
        touchPointersRef.current.clear()
      }
    }

    el.addEventListener('touchstart',  onTouchStart, { passive: true })
    el.addEventListener('touchmove',   onTouchMove,  { passive: false }) // passive:false so preventDefault works
    el.addEventListener('touchend',    onTouchEnd,   { passive: true })
    el.addEventListener('touchcancel', onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [cancelStroke])

  // After the page re-renders at the pinched scale, scroll so the point that was
  // between the fingers is back under them.
  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current
    const el = scrollContainerRef.current
    const wrap = pageWrapRef.current
    if (!anchor || !viewportSize || !el || !wrap) return
    pendingAnchorRef.current = null
    const cRect = el.getBoundingClientRect()
    const wRect = wrap.getBoundingClientRect()
    el.scrollLeft += (wRect.left + anchor.fx * wRect.width) - (cRect.left + anchor.cx)
    el.scrollTop  += (wRect.top  + anchor.fy * wRect.height) - (cRect.top + anchor.cy)
  }, [viewportSize])

  // When parent injects auto-fill annotations, MERGE them (don't replace user strokes).
  // Deliberately does NOT set hasChanges — auto-fill regenerates itself from patientData
  // every time the form is opened, so it's not "work you'd lose" and shouldn't trigger
  // the save-before-leaving prompt on its own (only real pen/text edits should).
  useEffect(() => {
    if (externalAnnotations && externalAnnotations.length > 0) {
      setStrokes(prev => {
        const userStrokes = prev.filter(s => !s._autofilled)
        return [...userStrokes, ...externalAnnotations]
      })
      setSaved(false)
    }
  }, [externalAnnotations])

  const commitText = useCallback(() => {
    if (!activeText || !activeText.content.trim()) {
      setActiveText(null)
      return
    }
    const newTextAnnotation = {
      type: 'text',
      content: activeText.content,
      x: activeText.canvasX,
      y: activeText.canvasY,
      color: color,
      lineWidth: lineWidth,
    }
    setStrokes(prev => [...prev, newTextAnnotation])
    setSaved(false)
    setHasChanges(true)
    setActiveText(null)
  }, [activeText, color, lineWidth])

  // Bulletproof focus resolution: Wait for native mouseup/click to finish,
  // then forcefully focus the active text area. 
  useEffect(() => {
    if (activeText && textInputRef.current && document.activeElement !== textInputRef.current) {
      const timer = setTimeout(() => {
        if (textInputRef.current) {
          textInputRef.current.focus()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [activeText])

  // ── Redraw user strokes only (NEVER draws _autofilled — those live on protectedCanvas) ──
  // All stroke points are stored with xFrac/yFrac (0..1) so they render correctly
  // at ANY zoom level without distortion.
  const redrawAll = useCallback((ctx, strokeList) => {
    if (!ctx || !canvasRef.current) return
    const vw = viewportSize?.width || canvasRef.current.width
    const vh = viewportSize?.height || canvasRef.current.height
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    for (const stroke of strokeList) {
      // Auto-filled patient details are rendered on the protected canvas — never touch them here
      if (stroke._autofilled) continue
      if (stroke.type === 'text') {
        ctx.save()
        ctx.fillStyle = stroke.color || '#1a1a2e'
        const fontSize = (stroke.lineWidth || 2.7) * 6 * scale
        ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", sans-serif`
        ctx.textBaseline = stroke._baselineY ? 'alphabetic' : 'top'
        const px = stroke.xFrac != null ? stroke.xFrac * vw : stroke.x
        const py = stroke.yFrac != null ? stroke.yFrac * vh : stroke.y
        const lines = String(stroke.content || '').split('\n')
        lines.forEach((line, i) => ctx.fillText(line, px, py + (i * fontSize * 1.25)))
        ctx.restore()
        continue
      }
      if (!stroke.points || stroke.points.length < 2) continue
      ctx.save()
      // Resolve stroke width: scale the stored base width by current viewport
      // relative to the viewport at which the stroke was originally drawn.
      const storedVW = stroke.refVW || vw
      const widthScale = vw / storedVW
      const resolvedWidth = (stroke.width || 2.5) * widthScale
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
        ctx.lineWidth = resolvedWidth * 4
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = stroke.color || '#1a1a2e'
        ctx.lineWidth = resolvedWidth
        ctx.globalAlpha = 1
      }
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // Points are stored as fractions — resolve to current viewport coordinates
      const getX = (p) => (p.xFrac != null ? p.xFrac * vw : p.x)
      const getY = (p) => (p.yFrac != null ? p.yFrac * vh : p.y)
      ctx.beginPath()
      ctx.moveTo(getX(stroke.points[0]), getY(stroke.points[0]))
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]
        const curr = stroke.points[i]
        const cx = (getX(prev) + getX(curr)) / 2
        const cy = (getY(prev) + getY(curr)) / 2
        ctx.quadraticCurveTo(getX(prev), getY(prev), cx, cy)
      }
      ctx.stroke()
      ctx.restore()
    }
  }, [viewportSize, scale])

  // ── Redraw ONLY auto-filled annotations onto the protected canvas ────────────
  // This canvas sits above the ink canvas with pointer-events:none.
  // The eraser (destination-out on the ink canvas) can NEVER reach it.
  const redrawProtected = useCallback((ctx, strokeList) => {
    if (!ctx || !protectedCanvasRef.current) return
    ctx.clearRect(0, 0, protectedCanvasRef.current.width, protectedCanvasRef.current.height)
    for (const stroke of strokeList) {
      if (!stroke._autofilled) continue
      if (stroke.type === 'image') {
        const img = getLoadedImage(stroke.src)
        const vw = viewportSize?.width || 1
        const vh = viewportSize?.height || 1
        if (img) ctx.drawImage(img, stroke.xFrac * vw, stroke.yFrac * vh, stroke.wFrac * vw, stroke.hFrac * vh)
        continue
      }
      if (stroke.type === 'ellipse') { // circled choice, e.g. gender
        const vw = viewportSize?.width || 1
        const vh = viewportSize?.height || 1
        drawEllipse(ctx, stroke, vw, vh, scale)
        continue
      }
      if (stroke.type !== 'text') continue
      ctx.save()
      ctx.fillStyle = stroke.color || '#1a1a2e'
      const fontSize = (stroke.lineWidth || 2.7) * 6 * scale
      ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", sans-serif`
      ctx.textBaseline = stroke._baselineY ? 'alphabetic' : 'top'
      const vw = viewportSize?.width || 1
      const vh = viewportSize?.height || 1
      const px = stroke.xFrac != null ? stroke.xFrac * vw : stroke.x
      const py = stroke.yFrac != null ? stroke.yFrac * vh : stroke.y
      const lines = String(stroke.content || '').split('\n')
      const rightBoundary = stroke._maxXFrac != null ? stroke._maxXFrac * vw : vw
      const maxW = Math.max(20, rightBoundary - px - 4)
      lines.forEach((line, i) => ctx.fillText(line, px, py + (i * fontSize * 1.25), maxW))
      ctx.restore()
    }
  }, [viewportSize, scale])

  const dpr = useRef(window.devicePixelRatio || 1)

  // ── Size both canvases and redraw after PDF renders ─────────────────────────
  //    viewportSize comes from FormViewer after pdfPage.render() completes.
  //    Ink canvas: user strokes only. Protected canvas: auto-filled text only.
  useEffect(() => {
    if (!viewportSize || !canvasRef.current) return
    const ratio = window.devicePixelRatio || 1
    dpr.current = ratio

    // ── Ink canvas (user strokes + eraser) ──
    const canvas = canvasRef.current
    canvas.width = Math.floor(viewportSize.width * ratio)
    canvas.height = Math.floor(viewportSize.height * ratio)
    canvas.style.width = `${viewportSize.width}px`
    canvas.style.height = `${viewportSize.height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
    redrawAll(ctx, strokes)

    // ── Protected canvas (auto-filled patient details — eraser cannot reach this) ──
    if (protectedCanvasRef.current) {
      const pCanvas = protectedCanvasRef.current
      pCanvas.width = Math.floor(viewportSize.width * ratio)
      pCanvas.height = Math.floor(viewportSize.height * ratio)
      pCanvas.style.width = `${viewportSize.width}px`
      pCanvas.style.height = `${viewportSize.height}px`
      const pCtx = pCanvas.getContext('2d')
      pCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
      protectedCtxRef.current = pCtx
      redrawProtected(pCtx, strokes)
    }
  }, [viewportSize, strokes, redrawAll, redrawProtected])

  const onPointerDown = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Two fingers = pinch, not drawing. Pointer events fire before touchstart,
    // so detect it here too and discard the stroke the first finger began.
    if (e.pointerType === 'touch') {
      touchPointersRef.current.add(e.pointerId)
      if (touchPointersRef.current.size > 1) multiTouchRef.current = true
    }
    if (multiTouchRef.current) {
      cancelStroke()
      return
    }

    // Palm rejection: if a pen stroke is active, ignore touch (palm) events
    if (activePointerType.current === 'pen' && e.pointerType === 'touch') {
      e.preventDefault()
      return
    }

    const rect = canvas.getBoundingClientRect()
    // Guard: ensure viewportSize is ready
    if (!viewportSize) return

    // Map DOM coordinates back to fixed viewport units (independent of DPI)
    const canvasX = (e.clientX - rect.left) * (viewportSize.width / rect.width)
    const canvasY = (e.clientY - rect.top) * (viewportSize.height / rect.height)
    // Store fractions immediately — these remain stable across any zoom level change
    const xFrac = canvasX / viewportSize.width
    const yFrac = canvasY / viewportSize.height

    if (tool === 'hand') {
      // Hand tool allows for swiping/scrolling bubbling
      startPoint.current = { x: e.clientX, y: e.clientY, time: Date.now() }
      return
    }

    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    isDrawing.current = true
    activePointerType.current = e.pointerType
    lastPoint.current = { x: canvasX, y: canvasY }
    startPoint.current = { x: e.clientX, y: e.clientY, time: Date.now() }
    
    // Stylus: use real pressure for WIDTH only (not opacity).
    // Opacity-based pressure is NOT used because the single-path redraw on save
    // cannot reproduce the compounding-alpha effect of live segment-by-segment drawing,
    // making saved strokes look faded. Width-only pressure gives consistent dark ink.
    const isStylus = e.pointerType === 'pen'
    const pressure = isStylus && e.pressure > 0 ? e.pressure : 1
    const width    = tool === 'eraser' ? lineWidth * 6 : lineWidth * (isStylus ? (0.5 + pressure * 1.5) : 1)
    const opacity  = 1  // always full opacity — matches how strokes look after redraw
    // Points include both pixel coords (for live drawing) and fractions (for zoom-stable redraw)
    const newStroke = {
      tool, color, width, opacity,
      refVW: viewportSize.width, // viewport width when stroke was started — used to scale width on redraw
      points: [{ x: canvasX, y: canvasY, xFrac, yFrac }]
    }
    currentStrokeRef.current = newStroke  // Set ref synchronously — available immediately in move events
    setCurrentStroke(newStroke)
  }, [tool, color, lineWidth, activeText, commitText, viewportSize, cancelStroke])

  const onPointerMove = useCallback((e) => {
    // Use ref (not state) — state is async and may not have updated yet for fast stylus moves
    if (!isDrawing.current || !currentStrokeRef.current) return
    // Palm rejection: ignore touch events while pen is drawing
    if (activePointerType.current === 'pen' && e.pointerType === 'touch') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    // Guard: ensure viewportSize is ready
    if (!viewportSize) return

    const px = (e.clientX - rect.left) * (viewportSize.width / rect.width)
    const py = (e.clientY - rect.top) * (viewportSize.height / rect.height)
    // Fractions — zoom-stable representation of this point
    const xFrac = px / viewportSize.width
    const yFrac = py / viewportSize.height
    const canvasPos = { x: px, y: py, xFrac, yFrac }

    // Stylus: pressure-sensitive WIDTH only. Mouse: fixed width. Both always full opacity.
    const isStylus = e.pointerType === 'pen'
    const pressure = isStylus && e.pressure > 0 ? e.pressure : 1
    const width    = tool === 'eraser' ? lineWidth * 6 : lineWidth * (isStylus ? (0.5 + pressure * 1.5) : 1)
    const ctx = ctxRef.current
    if (ctx && lastPoint.current) {
      ctx.save()
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.lineWidth = width
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.globalAlpha = 1  // always full opacity — matches redraw behaviour
      }
      ctx.beginPath()
      const prev = lastPoint.current
      ctx.moveTo(prev.x, prev.y)
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + px) / 2, (prev.y + py) / 2)
      ctx.stroke()
      ctx.restore()
    }
    lastPoint.current = canvasPos
    // Update the ref synchronously (for the next move event)
    currentStrokeRef.current = { ...currentStrokeRef.current, points: [...currentStrokeRef.current.points, canvasPos] }
    setCurrentStroke(prev => prev ? { ...prev, points: [...prev.points, canvasPos] } : prev)
  }, [isDrawing, tool, color, lineWidth, viewportSize])

  const onPointerUp = useCallback((e) => {
    if (e.pointerType === 'touch') touchPointersRef.current.delete(e.pointerId)
    if (multiTouchRef.current) return // end of a pinch — not a swipe or a stroke
    // Palm rejection: only process pointer-up for the active drawing pointer type
    if (activePointerType.current && e.pointerType !== activePointerType.current) return

    if (startPoint.current) {
      const dx = e.clientX - startPoint.current.x
      const dy = e.clientY - startPoint.current.y
      const dt = Date.now() - startPoint.current.time
      // Flick detection: fast, horizontal, significant
      if (Math.abs(dx) > 100 && Math.abs(dy) < 80 && dt < 300) {
        if (dx < 0 && onSwipeLeft) onSwipeLeft()
        else if (dx > 0 && onSwipeRight) onSwipeRight()
        // If we detected a swipe, clear any accidental tiny stroke
        isDrawing.current = false
        currentStrokeRef.current = null
        setCurrentStroke(null)
        activePointerType.current = null
        startPoint.current = null
        return
      }
    }

    // Use ref (not state) — guarantees we always have the latest stroke data
    const finishedStroke = currentStrokeRef.current
    if (!isDrawing.current || !finishedStroke) return
    isDrawing.current = false
    activePointerType.current = null
    if (finishedStroke.points.length > 1) {
      setStrokes(prev => [...prev, finishedStroke])
      setSaved(false)
      setHasChanges(true)
    }
    currentStrokeRef.current = null
    setCurrentStroke(null)
    lastPoint.current = null
    startPoint.current = null
  }, [isDrawing, onSwipeLeft, onSwipeRight])

  const handleUndo = () => {
    setStrokes(prev => {
      // Find the last user-added stroke (skip _autofilled) and remove only that one
      let lastUserIdx = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (!prev[i]._autofilled) { lastUserIdx = i; break }
      }
      if (lastUserIdx === -1) return prev // nothing to undo
      const next = [...prev.slice(0, lastUserIdx), ...prev.slice(lastUserIdx + 1)]
      redrawAll(ctxRef.current, next)
      return next
    })
    setSaved(false)
    setHasChanges(true)
  }

  const handleClear = () => {
    if (!window.confirm('Clear all annotations on this page?')) return
    setStrokes(prev => {
      // Keep auto-filled patient data — only wipe user strokes from the ink canvas
      const protected_ = prev.filter(s => s._autofilled)
      const ctx = ctxRef.current
      if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      // Protected canvas already holds these — no need to redraw them here
      return protected_
    })
    setSaved(false)
    setHasChanges(true)
  }

  // Commits any in-progress typed text box into `strokes`, then normalizes every
  // stroke to fractions (xFrac/yFrac) so positioning is stable at any zoom level.
  // Used both by the real save-to-server and by the local (unsaved) page-flip snapshot.
  const collectStrokes = useCallback(() => {
    let finalStrokes = strokes
    const canvas = canvasRef.current
    if (activeText && activeText.content.trim() && canvas) {
      const newText = {
        type: 'text',
        content: activeText.content,
        x: activeText.canvasX,
        y: activeText.canvasY,
        xFrac: activeText.canvasX / canvas.width,
        yFrac: activeText.canvasY / canvas.height,
        color: color,
        lineWidth: lineWidth,
      }
      finalStrokes = [...finalStrokes, newText]
      setStrokes(finalStrokes)
      setActiveText(null)
    }

    const width = viewportSize?.width || 1
    const height = viewportSize?.height || 1

    return finalStrokes.map(s => {
      if (s.xFrac != null) return { ...s, refScale: scale } // Already normalized (auto-fill or prior draw)
      const res = { ...s, refScale: scale } // Store the screen-scale used when created
      if (s.type === 'text') {
        res.xFrac = s.x / width
        res.yFrac = s.y / height
      } else if (s.points) {
        // Ensure every point has fractions (they should already, but guard for legacy data)
        res.points = s.points.map(p => ({
          x: p.x, y: p.y,
          xFrac: p.xFrac ?? (p.x / width),
          yFrac: p.yFrac ?? (p.y / height)
        }))
      }
      return res
    })
  }, [strokes, activeText, color, lineWidth, viewportSize, scale])

  const handleSave = async () => {
    const normalized = collectStrokes()
    setSaving(true)
    try {
      await onSave(normalized, 'in-progress')
      setSaved(true)
      setHasChanges(false)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) { alert('Save failed: ' + e.message) } finally { setSaving(false) }
  }

  // Expose imperative methods to the parent (FormViewer):
  //  - save(): the real save-to-server (used by the toolbar Save button and the confirm dialog)
  //  - getLocalAnnotations(): a snapshot of current strokes WITHOUT hitting the API — used when
  //    flipping to another page of the same form, so in-progress work is carried over in memory
  //    instead of being lost (and instead of nagging the user for every single page turn).
  useImperativeHandle(ref, () => ({ save: handleSave, getLocalAnnotations: collectStrokes }), [handleSave, collectStrokes])

  const COLORS = ['#1a1a2e', '#dc2626', '#2563eb', '#059669', '#b45309', '#7c3aed', '#0891b2']
  const WIDTHS = [1.5, 2.5, 4, 7]

  // Toolbar
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sticky toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', background: '#fff', borderBottom: '1px solid var(--gray-100)', flexWrap: 'wrap', flexShrink: 0 }}>

        <div style={{ display: 'flex', background: 'var(--gray-100)', borderRadius: 8, padding: '0.25rem' }}>
          <button onClick={() => setTool('hand')} title="Hand Tool (Slide/Scroll)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: tool === 'hand' ? '#fff' : 'transparent', color: tool === 'hand' ? 'var(--primary-600)' : 'var(--gray-500)', boxShadow: tool === 'hand' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', transition: 'all 150ms' }}>
            <Hand size={15} />
          </button>
          {allowDrawing && (
            <button onClick={() => setTool('pen')} title="Pen Tool" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: tool === 'pen' ? '#fff' : 'transparent', color: tool === 'pen' ? 'var(--primary-600)' : 'var(--gray-500)', boxShadow: tool === 'pen' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', transition: 'all 150ms' }}>
              <Pen size={15} />
            </button>
          )}
          <button onClick={() => setTool('type')} title="Text Tool (Word-like typing)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer', background: tool === 'type' ? '#fff' : 'transparent', color: tool === 'type' ? 'var(--primary-600)' : 'var(--gray-500)', boxShadow: tool === 'type' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none', transition: 'all 150ms' }}>
            <Type size={16} />
          </button>
          {allowDrawing && (
            <button
              onClick={() => canErase && setTool('eraser')}
              title={canErase ? 'Eraser Tool' : 'Eraser locked — form has been saved. Admins can always erase.'}
              disabled={!canErase}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                width: canErase ? 36 : 54, height: 32, borderRadius: 6, border: 'none',
                cursor: canErase ? 'pointer' : 'not-allowed',
                background: tool === 'eraser' ? '#fff' : 'transparent',
                color: canErase ? (tool === 'eraser' ? 'var(--primary-600)' : 'var(--gray-500)') : 'var(--gray-300)',
                boxShadow: tool === 'eraser' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 150ms', opacity: canErase ? 1 : 0.6,
              }}
            >
              <Eraser size={15} />
              {!canErase && <Lock size={10} />}
            </button>
          )}
        </div>
        {/* Colors (pen only) */}
        {tool === 'pen' && (
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: color === c ? `3px solid ${c}` : 'none', outlineOffset: 2, transition: 'all 150ms', transform: color === c ? 'scale(1.3)' : 'scale(1)' }} />
            ))}
          </div>
        )}
        {/* Widths */}
        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', marginLeft: '0.25rem' }}>
          {WIDTHS.map(w => (
            <button key={w} onClick={() => setLineWidth(w)} style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px solid', borderColor: lineWidth === w ? 'var(--primary-500)' : 'var(--gray-200)', background: lineWidth === w ? 'var(--primary-50)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: Math.min(w * 3.5, 20), height: Math.min(w * 3.5, 20) / w * 1.5, background: tool === 'pen' ? color : '#94a3b8', borderRadius: 99 }} />
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleUndo}
            disabled={!canErase || strokes.length === 0}
            title={!canErase ? 'Locked after save' : 'Undo last stroke'}
            style={{ opacity: canErase ? 1 : 0.4 }}
          >
            <Undo2 size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleClear}
            disabled={!canErase || strokes.length === 0}
            title={!canErase ? 'Locked after save' : 'Clear all strokes'}
            style={{ opacity: canErase ? 1 : 0.4 }}
          >
            <Trash2 size={14} />
          </button>
          <button className={`btn btn-sm ${saved ? 'btn-teal' : 'btn-primary'}`} onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="spin" /> : saved ? <CheckCircle size={13} /> : <Save size={13} />}
            {saving ? ' Saving...' : saved ? ' Saved!' : ' Save'}
          </button>
        </div>
      </div>

      {/* Canvas area — scrollable, PDF centered via margin:auto (alignItems:center breaks scroll) */}
      <div 
        ref={scrollContainerRef}
        className="pdf-scroll-container"
        style={{ 
          overflowX: 'auto', 
          overflowY: 'auto', 
          background: '#1e293b', 
          display: 'flex', 
          flex: 1, 
          alignItems: 'flex-start',
          scrollbarWidth: 'auto',
          scrollbarColor: 'rgba(99, 102, 241, 0.75) rgba(30, 41, 59, 0.4)',
          touchAction: 'pan-x pan-y',  // 1-finger → native scroll (both axes when zoomed in); 2-finger pinch → our handler
        }}
      >
        <div ref={pageWrapRef} style={{ position: 'relative', display: 'inline-block', lineHeight: 0, margin: 'auto' }}>
          {/* PDF layer */}
          <canvas id={`pdf-canvas-${pdfPage}`} style={{ display: 'block' }} />
          {/* Ink layer — user strokes + eraser. Auto-filled text is NOT rendered here. */}
          <canvas
            ref={canvasRef}
            onPointerDown={tool !== 'type' ? onPointerDown : undefined}
            onPointerMove={tool !== 'type' ? onPointerMove : undefined}
            onPointerUp={tool !== 'type' ? onPointerUp : undefined}
            onPointerCancel={tool !== 'type' ? onPointerUp : undefined}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: tool === 'hand' ? 'auto' : 'none',
              pointerEvents: tool === 'type' ? 'none' : 'auto',
            }}
          />
          {/* Protected canvas — auto-filled patient details rendered here.
               pointer-events:none means it never intercepts any input.
               zIndex:5 keeps it visually above the ink canvas so it's always visible.
               The eraser uses destination-out only on the ink canvas and can NEVER
               affect pixels on this separate element. */}
          <canvas
            ref={protectedCanvasRef}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />

          {/* Transparent click-capture layer for type tool — sits above canvas */}
          {tool === 'type' && !activeText && (
            <div
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                cursor: 'text', zIndex: 10, background: 'transparent',
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const domX = e.clientX - rect.left
                const domY = e.clientY - rect.top
                const canvas = canvasRef.current
                const canvasX = canvas ? domX * (canvas.width / rect.width) : domX
                const canvasY = canvas ? domY * (canvas.height / rect.height) : domY
                setActiveText({ domX, domY, canvasX, canvasY, content: '' })
              }}
            />
          )}

          {/* Floating Text Input — positioned at click location */}
          {activeText && (
            <div
              style={{
                position: 'absolute',
                top: activeText.domY,
                left: activeText.domX,
                zIndex: 1000,
              }}
            >
              <textarea
                ref={textInputRef}
                value={activeText.content}
                autoFocus
                onChange={e => setActiveText(prev => prev ? { ...prev, content: e.target.value } : prev)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { commitText(); e.preventDefault() }
                }}
                onBlur={() => {
                  // Small delay so clicking elsewhere on the PDF creates a NEW box
                  // rather than committing immediately and eating the next click
                  setTimeout(() => commitText(), 100)
                }}
                placeholder="Type here..."
                style={{
                  background: 'rgba(255,255,255,0.97)',
                  border: `2px solid ${color}`,
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: color,
                  font: `400 15px "Segoe UI", "Inter", sans-serif`,
                  minWidth: '200px',
                  minHeight: '44px',
                  outline: 'none',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                  display: 'block',
                  margin: 0,
                  resize: 'both',
                  lineHeight: 1.5,
                }}
              />
              <div style={{
                fontSize: '0.65rem', color: '#6b7280', marginTop: 4,
                textAlign: 'right', userSelect: 'none',
              }}>
                Click elsewhere or press Esc to place
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}) // ─── end InkCanvas ───────────────────────────────────────────────────────────

// Circled choice (auto-fill), in fractions of the page; lineWidth is in PDF points
function drawEllipse(ctx, stroke, w, h, pxPerPt) {
  ctx.save()
  ctx.strokeStyle = stroke.color || '#1a1a2e'
  ctx.lineWidth = (stroke.lineWidth || 1) * pxPerPt
  ctx.beginPath()
  ctx.ellipse(stroke.xFrac * w, stroke.yFrac * h, stroke.rxFrac * w, stroke.ryFrac * h, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// ─── Unsaved drafts across forms ─────────────────────────────────────────────
// Parents remount FormViewer for every form (key={form.id}), so work that hasn't been
// saved to the server is parked here while the user moves between forms, and only
// saved (or discarded) when they leave the viewer.
const formDrafts = new Map()      // formId -> { form, annotations }
let switchingToFormId = null      // set just before switching forms, so the next mount keeps the drafts
let reopenRecordsPanel = false     // after adding a copy from the Records panel, show the panel again on the new form
let recordsSort = 'assigned'      // Records panel sort, kept while moving between forms

// ─── Patient Info Sidebar ─────────────────────────────────────────────────────
function PatientInfoSidebar({ patientData, onClose, onStampField }) {
  const p = patientData
  const fields = [
    { label: 'Patient Name',      value: p.name || '' },
    { label: 'Age / Gender',      value: [p.age ? `${p.age} yrs` : '', p.gender || ''].filter(Boolean).join(' / ') },
    { label: 'Reg No / ID',       value: p.id || '' },
    { label: 'Date of Admission', value: p.admitted_at ? new Date(p.admitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '' },
    { label: 'Phone Number',      value: p.phone || '' },
    { label: 'Consultant',        value: p.doctor_name ? `Dr. ${p.doctor_name}` : '' },
    { label: 'Department',        value: p.department || '' },
    { label: 'Blood Group',       value: p.blood_group || '' },
    { label: 'Admission Type',    value: p.admission_type || '' },
    { label: 'Status',            value: p.status || '' },
  ].filter(f => f.value)

  const [copied, setCopied] = useState(null)
  const copyField = (val, idx) => {
    navigator.clipboard.writeText(val).catch(() => {})
    setCopied(idx)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div style={{
      width: 310, background: '#1e293b', borderLeft: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.04em' }}>📋 PATIENT DETAILS</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0 }}>✕</button>
      </div>
      {/* Avatar + name */}
      <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: '1.1rem', flexShrink: 0 }}>
          {(p.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem' }}>{p.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>{p.id}</div>
        </div>
      </div>
      {/* Fields */}
      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.6rem 0.75rem', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{f.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.95rem', color: '#fff', fontWeight: 600, wordBreak: 'break-word' }}>{f.value}</div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={() => copyField(f.value, i)}
                  title="Copy to clipboard"
                  style={{ background: copied === i ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 5, padding: '0.2rem 0.4rem', color: copied === i ? '#10b981' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                >{copied === i ? '✓ Copied' : '📋'}</button>
                <button
                  onClick={() => onStampField(f.value)}
                  title="Click where you want to place this text on the PDF"
                  style={{ background: 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 5, padding: '0.2rem 0.4rem', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                >📌</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5 }}>
          📋 Copy • 📌 Click to place on PDF
        </div>
      </div>
    </div>
  )
}

export default function FormViewer({ formInstance, allForms = [], patientData, onClose, onAnnotationsSaved, onSwitchForm, onAddForm }) {
  const [pdfDoc, setPdfDoc] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [fitScale, setFitScale] = useState(1.0)
  const [loadingPdf, setLoadingPdf] = useState(true)
  const [pdfError, setPdfError] = useState(null)
  const containerRef = useRef(null)
  const [annotations, setAnnotations] = useState([])
  // A fresh open of the viewer (not a switch from another form) starts with no drafts.
  // Lazy useState init so StrictMode's double render sees the same decision.
  useState(() => {
    if (switchingToFormId !== formInstance.id) formDrafts.clear()
    switchingToFormId = null
    return null
  })
  const [viewportSize, setViewportSize] = useState(null)
  const [showInfoPanel, setShowInfoPanel] = useState(!!patientData && !allForms.length)
  const [showFormsQueue, setShowFormsQueue] = useState(() => reopenRecordsPanel) // Records panel — hidden by default, PDF fills screen
  useEffect(() => { reopenRecordsPanel = false }, [])
  const [pendingStamp, setPendingStamp] = useState(null)
  const inkCanvasRef = useRef(null)
  const fullScreenRef = useRef(null)
  const scaledForDocRef = useRef(null) // tracks which pdfDoc was used to compute current scale
  const needsFitRef = useRef(true)      // recompute fit-to-screen scale on next page-1 render
  const [transitioning, setTransitioning] = useState(false)
  const [slideDir, setSlideDir] = useState(null) // 'left' | 'right' | null
  const swipeRef = useRef({ x: 0, y: 0, time: 0, multi: false })
  const activePointersRef = useRef(new Set())
  const lastWheelRef = useRef(0)
  const [autoFilled, setAutoFilled] = useState(false)
  const autoFilledRef = useRef(false)
  const autoFilledPagesRef = useRef(new Set())
  // Save-before-navigate dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [pendingNavDir, setPendingNavDir] = useState(null)
  const [pendingNavAction, setPendingNavAction] = useState(null)
  const [dialogSaving, setDialogSaving] = useState(false)
  const [pageDirty, setPageDirty] = useState(false) // true when the CURRENT page's InkCanvas has unsaved edits
  const hasUnsavedRef = useRef(false) // true when ANY page in this form instance has edits not yet pushed to the server


  // Sync state whenever formInstance.id changes.
  // NOTE: do NOT reset pdfDoc here — if two forms share the same PDF file,
  // pdfUrl won't change so the PDF loader won't re-fire, leaving pdfDoc=null forever.
  // Resetting page/scale is enough to re-trigger the render effect.
  useEffect(() => {
    if (!formInstance) return
    const draft = formDrafts.get(formInstance.id)
    setAnnotations(draft ? draft.annotations : Array.isArray(formInstance.annotations) ? formInstance.annotations : [])
    setPage(1)
    setViewportSize(null)
    setScale(1.0)
    needsFitRef.current = true
    autoFilledRef.current = false
    autoFilledPagesRef.current = new Set()
    setAutoFilled(false)
    setPageDirty(false)
    hasUnsavedRef.current = !!draft
  }, [formInstance.id])

  // Bubble a dirty CURRENT page up to the form-level "has unsaved work somewhere" flag.
  // This persists across page flips within the same form (reset only on formInstance.id
  // change above, or right after a real save to the server).
  useEffect(() => {
    if (pageDirty) hasUnsavedRef.current = true
  }, [pageDirty])

  // ── Read admin flag from auth context ────────────────────────────────────
  const { isAdmin } = useAuth()

  // canErase rule:
  //   - Admin: always can erase
  //   - Non-admin: can erase ONLY while the form has no saved annotations yet
  //     (i.e. blank/fresh form). Once saved data exists, eraser is locked.
  //     `annotations` is live state — updates after every Save, so this
  //     correctly locks the eraser the moment a non-admin saves for the first time.
  const canErase = isAdmin || annotations.length === 0


  const pdfUrl = `${SERVER_URL}${formInstance.file_path}`

  // ── Load PDF.js ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let loadingTask = null   // PDF.js loading task (can be aborted)
    let loadedDoc = null     // track the document so we can destroy it if cancelled
    setLoadingPdf(true)
    setScale(1.0)            // force scale recomputation when a new PDF file loads
    needsFitRef.current = true
    setPdfError(null)
    import('pdfjs-dist').then(async (pdfjsLib) => {
      if (cancelled) return
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
      ).toString()
      try {
        loadingTask = pdfjsLib.getDocument(pdfUrl)
        const doc = await loadingTask.promise
        loadedDoc = doc
        if (cancelled) { doc.destroy(); return }  // destroy if no longer needed
        setPdfDoc(doc)
        setTotalPages(doc.numPages)
      } catch (e) {
        if (!cancelled) setPdfError('Could not load PDF: ' + e.message)
      } finally {
        if (!cancelled) setLoadingPdf(false)
      }
    })
    return () => {
      cancelled = true
      // Abort the in-progress network/worker load so the PDF.js worker
      // doesn't accumulate orphaned operations and corrupt later loads.
      if (loadingTask) loadingTask.destroy().catch(() => {})
      if (loadedDoc)   loadedDoc.destroy().catch(() => {})
    }
  }, [pdfUrl])

  // ── Render current page ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    let activeRenderTask = null  // track so we can cancel it in cleanup
    setViewportSize(null) // hide ink canvas while PDF re-renders

    pdfDoc.getPage(page).then(pdfPage => {
      if (cancelled) return

      // Use window dimensions for reliable measurement (clientWidth/Height can be 0
      // in flex containers at render time). Subtract fixed toolbar heights:
      //   top bar ~48px + annotation toolbar ~52px = ~100px total UI chrome.
      let renderScale = scale
      if (page === 1) {
        const naturalViewport = pdfPage.getViewport({ scale: 1 })
        const availW = window.innerWidth
        const availH = window.innerHeight - 100   // subtract toolbar chrome
        const scaleByWidth  = availW / naturalViewport.width
        const scaleByHeight = availH / naturalViewport.height
        const computed = Math.max(0.4, Math.min(3, Math.min(scaleByWidth, scaleByHeight) * 0.97))
        // Recompute if: first load (scale===1.0) OR pdfDoc changed (new PDF with different dims)
        if (needsFitRef.current || scaledForDocRef.current !== pdfDoc) {
          needsFitRef.current = false
          scaledForDocRef.current = pdfDoc
          renderScale = computed
          setFitScale(computed)
          setScale(computed)
          return // will re-run with new scale
        }
        setFitScale(computed)
      }

      const viewport = pdfPage.getViewport({ scale: renderScale })
      const pdfCanvas = document.getElementById(`pdf-canvas-${page}`)
      if (!pdfCanvas) return

      pdfCanvas.width = viewport.width
      pdfCanvas.height = viewport.height

      activeRenderTask = pdfPage.render({ canvasContext: pdfCanvas.getContext('2d'), viewport })
      activeRenderTask.promise.then(async () => {
        if (cancelled) return
        setViewportSize({ width: viewport.width, height: viewport.height })
        }).catch((err) => {
          // RenderingCancelledException is expected on cleanup — ignore it silently.
          // Any other error should log for debugging.
          if (!cancelled && err?.name !== 'RenderingCancelledException') {
            console.warn('[FormViewer] PDF render error:', err)
          }
        })
      }).catch((err) => {
        if (!cancelled) console.warn('[FormViewer] getPage error:', err)
      })
    return () => {
      cancelled = true
      // Cancel the in-progress render so the PDF.js worker doesn't stay busy
      // with stale work after a page/form/scale switch.
      if (activeRenderTask) activeRenderTask.cancel()
    }
  }, [pdfDoc, page, scale])

  // ── Template layout (where blanks / empty areas are) ──────────────────────
  // Scanned once per template and stored on the server; templates uploaded before the
  // scanner existed (or scanned by an older version) are scanned here on first open.
  const [layout, setLayout] = useState(null)
  const [scanProgress, setScanProgress] = useState(null) // { page, pages } during a first-open scan
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    const stored = formInstance.layout
    if (stored?.version === LAYOUT_VERSION && stored.pages?.length === pdfDoc.numPages) {
      setLayout(stored)
      return
    }
    setLayout(null)
    analyzeTemplate(pdfDoc, { onProgress: p => { if (!cancelled) setScanProgress(p) } }).then(result => {
      if (cancelled) return
      setScanProgress(null)
      setLayout(result)
      if (formInstance.template_id) {
        api.saveFormTemplateLayout(formInstance.template_id, { layout: result, page_count: pdfDoc.numPages })
          .catch(err => console.warn('[AutoFill] could not store template layout', err))
      }
    })
    return () => { cancelled = true }
  }, [pdfDoc, formInstance.template_id])

  // ── Hospital logo (Settings → report logo) ─────────────────────────────────
  // undefined = still loading, null = none. Auto-fill waits for this so the logo's
  // shape is known before the page is planned.
  const [logo, setLogo] = useState(undefined)
  useEffect(() => {
    let cancelled = false
    api.getHospital()
      .then(async h => {
        const src = h?.report_logo ? `${SERVER_URL}${h.report_logo}` : h?.logo || null
        if (src) {
          const img = await preloadImage(src)
          return { src, w: img.naturalWidth, h: img.naturalHeight }
        }
        // No logo uploaded — take the logo from the left of the report header banner
        if (!h?.report_header_image) return null
        const cut = logoFromBanner(await loadImage(`${SERVER_URL}${h.report_header_image}`))
        if (!cut) return null
        await preloadImage(cut.src)
        return cut
      })
      .catch(() => null)
      .then(l => { if (!cancelled) setLogo(l && l.w > 0 && l.h > 0 ? l : null) })
    return () => { cancelled = true }
  }, [])

  // ── Auto-fill: patient details + logo for each page, once per page per session ──
  // Only previously auto-filled entries are replaced — user strokes are kept,
  // so stale details saved by older layouts get refreshed too.
  useEffect(() => {
    if (!patientData || !layout || logo === undefined || !viewportSize) return
    if (autoFilledPagesRef.current.has(page)) return
    const layoutPage = layout.pages[page - 1]
    autoFilledPagesRef.current.add(page)
    if (!layoutPage) return
    const autoAnns = planAutoFill(layoutPage, page, buildPatientValues(patientData), logo)
    if (!autoAnns.length) return
    setAnnotations(prev => [...prev.filter(a => !(a._autofilled && a.page === page)), ...autoAnns])
    autoFilledRef.current = true
    setAutoFilled(true)
  }, [patientData, layout, logo, viewportSize, page])

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async (strokes, status) => {
    // Merge this page's new strokes with other pages' saved strokes
    const otherPages = annotations.filter(s => s.page !== page)
    const thisPage = strokes.map(s => ({ ...s, page }))
    const merged = [...otherPages, ...thisPage]

    let updated;
    if (formInstance.type === 'discharge') {
      updated = await api.saveDischargeSummaryAnnotations(formInstance.id, { annotations: merged, status, filled_by: formInstance.filled_by || '' })
    } else {
      updated = await api.savePatientFormAnnotations(formInstance.id, { annotations: merged, status, filled_by: formInstance.filled_by || '' })
    }

    const saved = Array.isArray(updated.annotations) ? updated.annotations : merged
    setAnnotations(saved)
    formDrafts.delete(formInstance.id)
    hasUnsavedRef.current = false
    if (onAnnotationsSaved) onAnnotationsSaved(saved, updated.status || status, formInstance.id)
    return updated
  }

  // ── Navigation (Page & Form) ─────────────────────────────────────────────
  // Run the actual slide animation + action
  // navLockRef is set synchronously: one swipe is seen by both InkCanvas and the container,
  // and both fire in the same event — before the `transitioning` state update lands.
  // Without the ref, the second call flips again and a page gets skipped.
  const navLockRef = useRef(false)
  const executeNavigate = useCallback((dir, action) => {
    if (navLockRef.current) return
    navLockRef.current = true
    setSlideDir(dir)
    setTransitioning(true)
    setTimeout(() => {
      action()
      setSlideDir(dir === 'left' ? 'in-right' : 'in-left')
      setTimeout(() => {
        setSlideDir(null)
        setTransitioning(false)
        navLockRef.current = false
      }, 280)
    }, 220)
  }, [])

  // Snapshot the CURRENT page's in-progress strokes into `annotations` state — in memory
  // only, no API call — so they aren't lost when InkCanvas remounts for the new page, and
  // so a later real Save (toolbar button, or the switch/close dialog) picks them up too.
  const commitCurrentPageLocally = useCallback(() => {
    if (!pageDirty) return
    const local = inkCanvasRef.current?.getLocalAnnotations?.()
    if (!local) return
    setAnnotations(prev => {
      const others = prev.filter(s => s.page !== page)
      return [...others, ...local.map(s => ({ ...s, page }))]
    })
  }, [pageDirty, page])

  // Page-to-page flip WITHIN the same form: never nag — just carry the work forward locally.
  const flipPage = useCallback((dir, action) => {
    if (transitioning || navLockRef.current) return
    commitCurrentPageLocally()
    executeNavigate(dir, action)
  }, [transitioning, commitCurrentPageLocally, executeNavigate])

  // This form's full annotation set including the current page's unsaved strokes (no API call)
  const snapshotCurrentForm = useCallback(() => {
    const local = pageDirty ? inkCanvasRef.current?.getLocalAnnotations?.() : null
    if (!local) return annotations
    return [...annotations.filter(s => s.page !== page), ...local.map(s => ({ ...s, page }))]
  }, [pageDirty, annotations, page])

  const hasAnyUnsaved = useCallback(() =>
    pageDirty || hasUnsavedRef.current || [...formDrafts.keys()].some(id => id !== formInstance.id)
  , [pageDirty, formInstance.id])

  // Switching FORM inside the viewer: park unsaved work in memory and move on without asking.
  // Only leaving the viewer (requestClose) asks to save.
  const requestFormSwitch = useCallback((dir, action, targetId) => {
    if (transitioning || navLockRef.current) return
    if (pageDirty || hasUnsavedRef.current) {
      formDrafts.set(formInstance.id, { form: formInstance, annotations: snapshotCurrentForm() })
    }
    executeNavigate(dir, () => {
      switchingToFormId = targetId
      action()
    })
  }, [transitioning, pageDirty, formInstance, snapshotCurrentForm, executeNavigate])

  // From the Records panel: open another of the patient's forms, or add a new one and open it
  const switchToForm = useCallback((f) => {
    setShowFormsQueue(false)
    requestFormSwitch('left', () => onSwitchForm(f), f.id)
  }, [requestFormSwitch, onSwitchForm])

  const addFormFromPanel = useCallback(async (template, { keepPanelOpen = false } = {}) => {
    const created = await onAddForm(template) // parent creates it and adds it to allForms
    reopenRecordsPanel = keepPanelOpen
    switchToForm(created)
  }, [onAddForm, switchToForm])

  // Add Records with several forms ticked: create them in order, then open the first one.
  // Returns the names that failed (the rest were added).
  const addFormsFromPanel = useCallback(async (templates) => {
    const created = [], failed = []
    for (const t of templates) {
      try { created.push(await onAddForm(t)) } catch (e) { failed.push(`${t.name}: ${e.message}`) }
    }
    if (created.length) {
      reopenRecordsPanel = true
      switchToForm(created[0])
    }
    return failed
  }, [onAddForm, switchToForm])

  const requestClose = useCallback(() => {
    if (hasAnyUnsaved()) {
      setPendingNavDir(null)
      setPendingNavAction(() => onClose)
      setShowSaveDialog(true)
      return
    }
    onClose()
  }, [hasAnyUnsaved, onClose])

  // Closing/reloading the browser tab can't run our save dialog — at least warn.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasAnyUnsaved()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasAnyUnsaved])

  // Next / previous form follows the Records panel's order (record sets, then date added or name)
  const [sort, setSort] = useState(() => recordsSort)
  const changeSort = useCallback((key) => { recordsSort = key; setSort(key) }, [])
  const navForms = useMemo(() => [...arrangeRecords(allForms, sort).groups.values()].flat(), [allForms, sort])
  const formIdx = navForms.findIndex(f => f.id === formInstance.id)
  const hasNextForm = !!onSwitchForm && formIdx !== -1 && formIdx < navForms.length - 1
  const hasPrevForm = !!onSwitchForm && formIdx > 0
  const canGoNext = page < totalPages || hasNextForm
  const canGoPrev = page > 1 || hasPrevForm

  // Past the last page → next form (page 1); before page 1 → previous form.
  const goToNext = useCallback(() => {
    if (page < totalPages) flipPage('left', () => setPage(p => Math.min(totalPages, p + 1)))
    else if (hasNextForm) requestFormSwitch('left', () => onSwitchForm(navForms[formIdx + 1]), navForms[formIdx + 1].id)
  }, [page, totalPages, hasNextForm, navForms, formIdx, onSwitchForm, flipPage, requestFormSwitch])

  const goToPrev = useCallback(() => {
    if (page > 1) flipPage('right', () => setPage(p => Math.max(1, p - 1)))
    else if (hasPrevForm) requestFormSwitch('right', () => onSwitchForm(navForms[formIdx - 1]), navForms[formIdx - 1].id)
  }, [page, hasPrevForm, navForms, formIdx, onSwitchForm, flipPage, requestFormSwitch])

  // ── Swipe Detection ────────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    // Only track swipe for touch/pen that isn't a long press
    activePointersRef.current.add(e.pointerId)
    if (activePointersRef.current.size > 1) swipeRef.current.multi = true
    else swipeRef.current = { x: e.clientX, y: e.clientY, time: Date.now(), multi: false }
  }
  const onPointerUp = (e) => {
    activePointersRef.current.delete(e.pointerId)
    if (swipeRef.current.multi) return // pinch gesture, not a swipe
    const dx = e.clientX - swipeRef.current.x
    const dy = e.clientY - swipeRef.current.y
    const dt = Date.now() - swipeRef.current.time
    // Threshold: horizontal move > 140px, fast duration, mostly horizontal
    if (Math.abs(dx) > 140 && Math.abs(dy) < 90 && dt < 400) {
      if (dx < 0) goToNext()
      else goToPrev()
    }
  }

  // ── Download PDF with annotations baked in ───────────────────────────────
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!pdfDoc) return
    setDownloading(true)
    try {
      const { PDFDocument, rgb } = await import('pdf-lib')
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
      ).toString()

      // Re-load the raw PDF bytes so pdf-lib can embed pages
      const pdfBytes = await fetch(pdfUrl).then(r => r.arrayBuffer())
      const pdfLibDoc = await PDFDocument.load(pdfBytes)
      const pdfLibPages = pdfLibDoc.getPages()

      // For each page, render PDF + annotations to an offscreen canvas,
      // then embed as a hi-res PNG image stamp on the pdf-lib page
      const DOWNLOAD_SCALE = 2  // 2x = ~144dpi — crisp on screen + print

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pdfPage = await pdfDoc.getPage(pageNum)
        const viewport = pdfPage.getViewport({ scale: DOWNLOAD_SCALE })

        // Off-screen canvas to render PDF page
        const offCanvas = document.createElement('canvas')
        offCanvas.width = viewport.width
        offCanvas.height = viewport.height
        const ctx = offCanvas.getContext('2d')
        await pdfPage.render({ canvasContext: ctx, viewport }).promise

        // Draw annotations for this page
        const pageAnns = annotations.filter(s => s.page === pageNum)
        for (const stroke of pageAnns) {
          // DOWNLOAD_SCALE = 2. Screen-scale used when drawing = refScale (usually ~1.2)
          // Ratio ensures a 2px stroke on screen looks like a 2px equivalent on the Hi-Res PDF.
          const refScale = stroke.refScale || (stroke.xFrac != null ? 1 : 1.2 /* fallback */)
          const scaleRatio = DOWNLOAD_SCALE / refScale

          if (stroke.type === 'ellipse') {
            drawEllipse(ctx, stroke, offCanvas.width, offCanvas.height, DOWNLOAD_SCALE)
          } else if (stroke.type === 'image') {
            try {
              const img = await loadImage(stroke.src)
              ctx.drawImage(img, stroke.xFrac * offCanvas.width, stroke.yFrac * offCanvas.height,
                stroke.wFrac * offCanvas.width, stroke.hFrac * offCanvas.height)
            } catch (err) { console.warn('[Download] logo skipped', err) }
          } else if (stroke.type === 'text') {
            ctx.save()
            ctx.fillStyle = stroke.color || '#1a1a2e'
            // Scaled font size relative to high-res download
            const baseFontSize = (stroke.lineWidth || 2.7) * 6
            const fontSize = baseFontSize * scaleRatio
            ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", sans-serif`
            ctx.textBaseline = stroke._baselineY ? 'alphabetic' : 'top'
            
            // Positioning via fractions (newly saved) or original px (fallback)
            const px = stroke.xFrac != null ? stroke.xFrac * offCanvas.width : stroke.x * scaleRatio
            const py = stroke.yFrac != null ? stroke.yFrac * offCanvas.height : stroke.y * scaleRatio
            
            const lines = String(stroke.content || '').split('\n')
            // Use per-annotation right boundary (_maxXFrac) when available, else canvas edge
            const dlBoundary = stroke._maxXFrac != null
              ? stroke._maxXFrac * offCanvas.width
              : offCanvas.width
            const dlMaxW = stroke._autofilled ? Math.max(20, dlBoundary - px - 4) : undefined
            lines.forEach((line, i) => {
              if (dlMaxW != null) {
                ctx.fillText(line, px, py + i * fontSize * 1.25, dlMaxW)
              } else {
                ctx.fillText(line, px, py + i * fontSize * 1.25)
              }
            })
            ctx.restore()
          } else if (stroke.points && stroke.points.length > 1) {
            ctx.save()
            const strokeWidth = (stroke.width || 2.5) * scaleRatio
            if (stroke.tool === 'eraser') {
              ctx.globalCompositeOperation = 'destination-out'
              ctx.lineWidth = strokeWidth * 4
            } else {
              ctx.globalCompositeOperation = 'source-over'
              ctx.strokeStyle = stroke.color || '#1a1a2e'
              ctx.lineWidth = strokeWidth
              ctx.globalAlpha = stroke.opacity || 1
            }
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            
            const getX = (p) => p.xFrac != null ? p.xFrac * offCanvas.width : p.x * scaleRatio
            const getY = (p) => p.yFrac != null ? p.yFrac * offCanvas.height : p.y * scaleRatio
            
            ctx.moveTo(getX(stroke.points[0]), getY(stroke.points[0]))
            for (let i = 1; i < stroke.points.length; i++) {
              const prev = stroke.points[i - 1]
              const curr = stroke.points[i]
              ctx.quadraticCurveTo(getX(prev), getY(prev), (getX(prev) + getX(curr)) / 2, (getY(prev) + getY(curr)) / 2)
            }
            ctx.stroke()
            ctx.restore()
          }
        }

        // Embed the merged canvas as PNG on the pdf-lib page
        const pngBytes = await new Promise(resolve => offCanvas.toBlob(b => b.arrayBuffer().then(resolve), 'image/png'))
        const pngImage = await pdfLibDoc.embedPng(pngBytes)
        const libPage = pdfLibPages[pageNum - 1]
        const { width, height } = libPage.getSize()
        libPage.drawImage(pngImage, { x: 0, y: 0, width, height })
      }

      // Download the final PDF
      const finalBytes = await pdfLibDoc.save()
      const blob = new Blob([finalBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const name = formInstance.patient_name
        ? `${formInstance.template_name} - ${formInstance.patient_name}.pdf`
        : `${formInstance.template_name}.pdf`
      a.download = name.replace(/[/\\:*?"<>|]/g, '_')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Download failed: ' + err.message)
      console.error(err)
    } finally {
      setDownloading(false)
    }
  }

  const toggleFullscreen = () => {
    if (!fullScreenRef.current) return
    if (!document.fullscreenElement) {
      fullScreenRef.current.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen: ${err.message}`)
      })
    } else {
      document.exitFullscreen()
    }
  }

  // ── Save-dialog handlers ────────────────────────────────────────────────────
  const handleDialogCancel = () => {
    setShowSaveDialog(false)
    setPendingNavAction(null)
    setPendingNavDir(null)
  }
  const finishPendingNav = () => {
    const action = pendingNavAction
    const dir    = pendingNavDir
    setShowSaveDialog(false)
    setPendingNavAction(null)
    setPendingNavDir(null)
    if (dir) executeNavigate(dir, action)
    else action?.() // closing the viewer entirely — no slide animation needed
  }
  const handleDialogSkip = () => {
    hasUnsavedRef.current = false // discarding — we're leaving this form instance behind
    formDrafts.clear()
    finishPendingNav()
  }
  const handleDialogSave = async () => {
    setDialogSaving(true)
    const failed = []
    // Current form: through InkCanvas, so the open page's strokes and status are handled as usual
    if ((pageDirty || hasUnsavedRef.current) && inkCanvasRef.current?.save) {
      try { await inkCanvasRef.current.save() } catch (_) { /* InkCanvas reports its own errors */ }
      // A successful save clears hasUnsavedRef (see handleSave); if it's still set, it failed
      if (hasUnsavedRef.current) failed.push(formInstance.template_name)
    }
    // Other forms visited in this session with parked work
    for (const [id, { form, annotations: anns }] of formDrafts) {
      if (id === formInstance.id) continue
      try {
        const body = { annotations: anns, status: 'in-progress', filled_by: form.filled_by || '' }
        const updated = form.type === 'discharge'
          ? await api.saveDischargeSummaryAnnotations(id, body)
          : await api.savePatientFormAnnotations(id, body)
        formDrafts.delete(id)
        onAnnotationsSaved?.(Array.isArray(updated.annotations) ? updated.annotations : anns, updated.status || 'in-progress', id)
      } catch (_) { failed.push(form.template_name) }
    }
    setDialogSaving(false)
    if (failed.length) {
      alert(`Could not save: ${failed.join(', ')}. Please try again.`)
      return // stay in the viewer so nothing is lost
    }
    hasUnsavedRef.current = false
    formDrafts.clear()
    finishPendingNav()
  }

  // Names of every form with unsaved work, for the exit dialog
  const unsavedFormNames = [
    ...(pageDirty || hasUnsavedRef.current ? [formInstance.template_name] : []),
    ...[...formDrafts.entries()].filter(([id]) => id !== formInstance.id).map(([, d]) => d.form.template_name),
  ]

  const pageAnnotations = annotations.filter(s => s.page === page)

  // Build info strip from patientData
  const infoStrip = patientData ? [
    patientData.name,
    patientData.age ? `${patientData.age}Y/${patientData.gender?.[0] || ''}` : null,
    patientData.id,
    patientData.doctor_name ? `Dr. ${patientData.doctor_name}` : null,
    patientData.department,
    patientData.phone,
  ].filter(Boolean).join('  ·  ') : null

  return (
    <div ref={fullScreenRef} style={{ position: 'fixed', inset: 0, background: '#0f172a', zIndex: 99999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Save-before-navigate confirmation dialog ───────────────────── */}
      {showSaveDialog && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
          animation: 'fadeIn 180ms ease',
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 20,
            padding: '2rem 2.25rem',
            maxWidth: 420, width: '100%',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
            animation: 'fadeInUp 220ms cubic-bezier(0.4,0,0.2,1)',
          }}>
            {/* Icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(245,158,11,0.15)',
                border: '1.5px solid rgba(245,158,11,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.6rem',
              }}>💾</div>
            </div>
            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                Save before leaving?
              </div>
            </div>
            {/* Subtitle */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                You have unsaved annotations on
              </div>
              {unsavedFormNames.map(name => (
                <div key={name} style={{
                  margin: '0.4rem 0.2rem 0', display: 'inline-block',
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, padding: '0.25rem 0.75rem',
                  color: '#a5b4fc', fontWeight: 700, fontSize: '0.82rem',
                }}>
                  📄 {name}
                </div>
              ))}
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem', marginTop: '0.5rem' }}>
                Save now or your changes will be lost.
              </div>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {/* Save & Continue */}
              <button
                onClick={handleDialogSave}
                disabled={dialogSaving}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 12, border: 'none',
                  background: dialogSaving
                    ? 'rgba(99,102,241,0.4)'
                    : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                  cursor: dialogSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                  transition: 'all 150ms',
                }}
              >
                {dialogSaving
                  ? <><Loader size={15} className="spin" /> Saving...</>
                  : <><CheckCircle size={15} /> Save &amp; Exit</>
                }
              </button>
              {/* Skip & Continue */}
              <button
                onClick={handleDialogSkip}
                disabled={dialogSaving}
                style={{
                  width: '100%', padding: '0.7rem', borderRadius: 12, border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '0.88rem',
                  cursor: dialogSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { if (!dialogSaving) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
              >
                <ChevronRight size={15} /> Exit without saving
              </button>
              {/* Cancel */}
              <button
                onClick={handleDialogCancel}
                disabled={dialogSaving}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 12, border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.35)', fontWeight: 500, fontSize: '0.85rem',
                  cursor: dialogSaving ? 'not-allowed' : 'pointer',
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => { if (!dialogSaving) e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
              >
                ✕ Cancel — keep editing
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1rem', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '0.75rem', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={requestClose} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '0.4rem 0.8rem', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
          <ChevronLeft size={16} /> Back
        </button>

        {onSwitchForm && (
          <button
            onClick={() => setShowFormsQueue(v => !v)}
            title="Records"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: showFormsQueue ? 'rgba(125,216,125,0.25)' : 'rgba(255,255,255,0.08)',
              border: 'none', borderRadius: 8, padding: '0.4rem 0.75rem',
              color: showFormsQueue ? '#86efac' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer', fontSize: '0.825rem', fontWeight: 600,
            }}
          >
            <ClipboardList size={15} /> Records ({allForms.length})
          </button>
        )}

        {/* Form title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formInstance.template_name}</div>
          {(formInstance.patient_name || formInstance.patient_id) && (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>
              {formInstance.patient_name || formInstance.patient_id}
            </div>
          )}
        </div>

        {/* First open of a template that hasn't been scanned yet — one-time, auto-fill follows */}
        {scanProgress && (
          <div title="One-time scan of this form so patient details land in the right places"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
            <Loader size={13} className="spin" /> Reading form layout {scanProgress.page}/{scanProgress.pages}
          </div>
        )}

        {/* Toggle patient info sidebar */}
        {patientData && (
          <button
            onClick={() => setShowInfoPanel(v => !v)}
            title="Patient Details"
            style={{ background: showInfoPanel ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 7, padding: '0 0.6rem', height: 32, cursor: 'pointer', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            📋 {patientData.name?.split(' ')[0]}
          </button>
        )}

        {/* Page navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={goToPrev} disabled={!canGoPrev}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={15} />
          </button>
          <span style={{ color: '#fff', fontSize: '0.875rem', minWidth: 70, textAlign: 'center' }}>Page {page} / {totalPages}</span>
          <button onClick={goToNext} disabled={!canGoNext}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={15} />
          </button>
        </div>
        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <button onClick={() => setScale(s => Math.max(0.4, +(s - 0.25).toFixed(2)))}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ZoomOut size={14} />
          </button>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ZoomIn size={14} />
          </button>
          <button onClick={() => setScale(fitScale)} title="Fit to width"
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
            <Maximize2 size={13} />
          </button>
          <button onClick={toggleFullscreen} title="App Fullscreen"
            style={{ background: 'rgba(99,102,241,0.2)', border: 'none', borderRadius: 7, width: 32, height: 32, cursor: 'pointer', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
            <Maximize2 size={14} />
          </button>
        </div>
        <button onClick={requestClose} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading || annotations.length === 0}
          title={annotations.length === 0 ? 'Save annotations first, then download' : 'Download annotated PDF'}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: downloading ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.85)',
            border: 'none', borderRadius: 8, padding: '0.4rem 0.9rem',
            color: '#fff', cursor: annotations.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.825rem', fontWeight: 600, opacity: annotations.length === 0 ? 0.5 : 1,
            transition: 'all 150ms',
          }}
        >
          {downloading ? <Loader size={14} className="spin" /> : <Download size={14} />}
          {downloading ? ' Generating...' : ' Download PDF'}
        </button>
      </div>

      {/* Main content area: PDF + optional sidebars */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Records panel — slides over the left of the form */}
        {showFormsQueue && onSwitchForm && (
          <RecordsPanel
            forms={allForms}
            activeId={formInstance.id}
            activePages={totalPages}
            sort={sort}
            onSortChange={changeSort}
            patientId={patientData?.id || formInstance.patient_id}
            onSelect={switchToForm}
            onAddForm={onAddForm ? addFormFromPanel : undefined}
            onAddForms={onAddForm ? addFormsFromPanel : undefined}
            onClose={() => setShowFormsQueue(false)}
          />
        )}

        {/* PDF + Ink canvas area */}
        <div 
          ref={containerRef} 
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={e => activePointersRef.current.delete(e.pointerId)}
          onWheel={(e) => {
            // Only intercept clearly horizontal trackpad swipes.
            // If the event has any significant vertical component, let the browser scroll natively.
            const absX = Math.abs(e.deltaX)
            const absY = Math.abs(e.deltaY)
            if (absX <= absY || absX <= 40) return
            const now = Date.now()
            const quietFor = now - lastWheelRef.current
            lastWheelRef.current = now
            if (quietFor < 400 || transitioning) return // still the same (inertial) gesture
            if (e.deltaX > 0) goToNext()
            else goToPrev()
          }}
          style={{ 
            flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', 
            overflow: 'hidden',
            background: '#1e293b', position: 'relative',
            animation: slideDir === 'left'     ? 'slideOutLeft 220ms cubic-bezier(0.4,0,0.2,1) forwards'
                     : slideDir === 'right'    ? 'slideOutRight 220ms cubic-bezier(0.4,0,0.2,1) forwards'
                     : slideDir === 'in-right' ? 'slideInRight 280ms cubic-bezier(0.4,0,0.2,1) forwards'
                     : slideDir === 'in-left'  ? 'slideInLeft 280ms cubic-bezier(0.4,0,0.2,1) forwards'
                     : 'none',
          }}
        >
          {loadingPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.4)' }}>
              <Loader size={28} className="spin" style={{ display: 'inline-block' }} />
              <span style={{ marginLeft: '0.75rem' }}>Loading PDF...</span>
            </div>
          ) : pdfError ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#f87171', flex: 1 }}>{pdfError}</div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
              <InkCanvas
                ref={inkCanvasRef}
                key={`${formInstance.id}-p${page}`}
                formId={formInstance.id}
                initialAnnotations={pageAnnotations}
                pdfPage={page}
                viewportSize={viewportSize}
                onSave={handleSave}
                canErase={canErase}
                allowDrawing={true}
                scale={scale}
                onSwipeLeft={goToNext}
                onSwipeRight={goToPrev}
                onDirtyChange={setPageDirty}
                externalAnnotations={autoFilled ? annotations.filter(s => s.page === page && s._autofilled) : undefined}
                onPinchZoom={(ratio) => setScale(s => {
                  const next = Math.max(0.4, Math.min(3, s * ratio))
                  return Math.round(next * 100) / 100  // round to 2dp to avoid float drift
                })}
              />
              
              {/* Pagination UI Arrows (Clickable on Laptop) */}
              <button 
                onClick={goToPrev}
                title="Previous Form/Page"
                style={{ visibility: canGoPrev ? 'visible' : 'hidden', position: 'sticky', top: '50%', left: 0, transform: 'translateY(-50%)', width: 44, height: 100, background: 'linear-gradient(90deg, rgba(0,0,0,0.3), transparent)', border: 'none', borderRadius: '0 12px 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', zIndex: 10, transition: 'all 150ms' }}
                onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(90deg, rgba(99,102,241,0.4), transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(90deg, rgba(0,0,0,0.3), transparent)'}
              ><ChevronLeft size={28} /></button>
              
              <button 
                onClick={goToNext}
                title="Next Form/Page"
                style={{ visibility: canGoNext ? 'visible' : 'hidden', position: 'sticky', top: '50%', left: 'calc(100% - 44px)', transform: 'translateY(-50%)', width: 44, height: 100, background: 'linear-gradient(-90deg, rgba(0,0,0,0.3), transparent)', border: 'none', borderRadius: '12px 0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', zIndex: 10, transition: 'all 150ms' }}
                onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(-90deg, rgba(99,102,241,0.4), transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(-90deg, rgba(0,0,0,0.3), transparent)'}
              ><ChevronRight size={28} /></button>
            </div>
          )}
        </div>

        {/* Patient Info Sidebar */}
        {showInfoPanel && patientData && (
          <PatientInfoSidebar
            patientData={patientData}
            onClose={() => setShowInfoPanel(false)}
            onStampField={(val) => {
              setPendingStamp(val)
              alert(`Now click on the PDF where you want to place: "${val}"`)
            }}
          />
        )}
      </div>
    </div>
  )
}
