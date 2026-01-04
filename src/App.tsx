/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCw, FlipHorizontal, FlipVertical, RefreshCw, Trash2, Download, Pencil, Waves, Eraser, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Vertex {
  x: number;
  y: number;
}

interface BezierPoint extends Vertex {
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
}

interface ShapeConfig {
  vertices: Vertex[];
  points: BezierPoint[];
  color: string;
  rotation: number; // 0, 90, 180, 270
  flipX: boolean;
  flipY: boolean;
}

type InteractionMode = 'draw' | 'erase' | 'liquify';

export default function App() {
  // --- Refs ---
  const bottomCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- State ---
  const [shape, setShape] = useState<ShapeConfig | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [mode, setMode] = useState<InteractionMode>('draw');
  const [brushSize] = useState(4);
  const [brushColor] = useState('#1a1a1a');

  // --- Constants ---
  const CANVAS_SIZE = 600;
  const LIQUIFY_RADIUS = 60;
  const LIQUIFY_STRENGTH = 0.8;

  /**
   * Calculates control points for smooth cubic Bezier curves between vertices.
   */
  const computeBezierPoints = useCallback((vertices: Vertex[]): BezierPoint[] => {
    const numPoints = vertices.length;
    return vertices.map((p, i) => {
      const prev = vertices[(i - 1 + numPoints) % numPoints];
      const next = vertices[(i + 1) % numPoints];

      // Simple smoothing factor
      const tension = 0.3;

      // Control point 1 (incoming to current point p)
      const cp1x = p.x - (next.x - prev.x) * tension;
      const cp1y = p.y - (next.y - prev.y) * tension;

      // Control point 2 (outgoing from current point p)
      const cp2x = p.x + (next.x - prev.x) * tension;
      const cp2y = p.y + (next.y - prev.y) * tension;

      return { x: p.x, y: p.y, cp1x, cp1y, cp2x, cp2y };
    });
  }, []);

  /**
   * Generates a random "blob" shape using Bezier curves.
   */
  const generateRandomShape = useCallback(() => {
    const numPoints = Math.floor(Math.random() * 4) + 6; // 6 to 9 points
    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;
    const baseRadius = CANVAS_SIZE * 0.25;
    const vertices: Vertex[] = [];

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radius = baseRadius + (Math.random() - 0.5) * baseRadius * 1.2;
      vertices.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    }

    const bezierPoints = computeBezierPoints(vertices);

    const blobColors = [
      '#f4c8d5', '#80cbfa', '#8ed99e', '#c3b1db', '#f2ebda', '#5ba470', '#ebcf64'
    ];
    const color = blobColors[Math.floor(Math.random() * blobColors.length)];

    setShape({
      vertices,
      points: bezierPoints,
      color,
      rotation: 0,
      flipX: false,
      flipY: false,
    });
  }, [computeBezierPoints]);

  // --- Drawing Logic ---
  const drawShape = useCallback(() => {
    const canvas = bottomCanvasRef.current;
    if (!canvas || !shape) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();

    // Apply transformations
    ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    ctx.rotate((shape.rotation * Math.PI) / 180);
    ctx.scale(shape.flipX ? -1 : 1, shape.flipY ? -1 : 1);
    ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);

    ctx.beginPath();
    const first = shape.points[0];
    ctx.moveTo(first.x, first.y);

    for (let i = 0; i < shape.points.length; i++) {
      const curr = shape.points[i];
      const next = shape.points[(i + 1) % shape.points.length];
      // We use the control points calculated during generation
      ctx.bezierCurveTo(curr.cp2x, curr.cp2y, next.cp1x, next.cp1y, next.x, next.y);
    }

    ctx.closePath();
    ctx.fillStyle = shape.color;
    ctx.fill();
    ctx.restore();
  }, [shape]);

  useEffect(() => {
    if (!shape) {
      generateRandomShape();
    } else {
      drawShape();
    }
  }, [shape, drawShape, generateRandomShape]);

  // --- Event Handlers ---
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = topCanvasRef.current;
    if (!canvas) return;
    
    const coords = getCanvasCoords(e, canvas);
    lastPos.current = coords;
    setIsInteracting(true);

    if (mode === 'draw' || mode === 'erase') {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = brushSize * 5; // Eraser is bigger
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isInteracting) return;
    const canvas = topCanvasRef.current;
    if (!canvas) return;
    
    const coords = getCanvasCoords(e, canvas);

    if (mode === 'draw' || mode === 'erase') {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else if (mode === 'liquify' && shape && lastPos.current) {
      // Transform mouse coordinates to "shape space" to account for rotation/flipping
      const transformCoords = (p: { x: number; y: number }) => {
        let tx = p.x - CANVAS_SIZE / 2;
        let ty = p.y - CANVAS_SIZE / 2;

        // Inverse Rotation
        const rad = (-shape.rotation * Math.PI) / 180;
        const rx = tx * Math.cos(rad) - ty * Math.sin(rad);
        const ry = tx * Math.sin(rad) + ty * Math.cos(rad);

        // Inverse Scale (Flip)
        const sx = shape.flipX ? -rx : rx;
        const sy = shape.flipY ? -ry : ry;

        return { x: sx + CANVAS_SIZE / 2, y: sy + CANVAS_SIZE / 2 };
      };

      const localCoords = transformCoords(coords);
      const prevLocalCoords = transformCoords(lastPos.current);
      
      const ldx = localCoords.x - prevLocalCoords.x;
      const ldy = localCoords.y - prevLocalCoords.y;

      const newVertices = shape.vertices.map(v => {
        const dist = Math.sqrt(Math.pow(v.x - localCoords.x, 2) + Math.pow(v.y - localCoords.y, 2));
        if (dist < LIQUIFY_RADIUS) {
          const force = (1 - dist / LIQUIFY_RADIUS) * LIQUIFY_STRENGTH;
          return {
            x: v.x + ldx * force,
            y: v.y + ldy * force
          };
        }
        return v;
      });

      setShape(prev => prev ? {
        ...prev,
        vertices: newVertices,
        points: computeBezierPoints(newVertices)
      } : null);
    }

    lastPos.current = coords;
  };

  const handleMouseUp = () => {
    setIsInteracting(false);
    lastPos.current = null;
  };

  const clearDrawing = () => {
    const canvas = topCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const rotateShape = () => {
    setShape(prev => prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null);
  };

  const flipHorizontal = () => {
    setShape(prev => prev ? { ...prev, flipX: !prev.flipX } : null);
  };

  const flipVertical = () => {
    setShape(prev => prev ? { ...prev, flipY: !prev.flipY } : null);
  };

  const downloadArt = () => {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = CANVAS_SIZE;
    finalCanvas.height = CANVAS_SIZE;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return;

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw bottom layer
    if (bottomCanvasRef.current) {
      ctx.drawImage(bottomCanvasRef.current, 0, 0);
    }
    // Draw top layer
    if (topCanvasRef.current) {
      ctx.drawImage(topCanvasRef.current, 0, 0);
    }

    const link = document.createElement('a');
    link.download = 'shapeshift-art.png';
    link.href = finalCanvas.toDataURL();
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-center mb-8"
      >
        <h1 className="text-5xl font-black tracking-tighter text-slate-800 flex items-center justify-center gap-3 italic">
          <Palette className="w-12 h-12 text-indigo-500 fill-indigo-50" />
          Blob Ross
        </h1>
        <p className="text-slate-400 mt-2 font-medium italic">"We don't make mistakes, just happy little accidents."</p>
      </motion.header>

      {/* Canvas Container */}
      <motion.div 
        ref={containerRef}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className={`relative bg-white rounded-3xl shadow-2xl overflow-hidden border-8 border-white ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-move'}`}
        style={{ width: 'min(90vw, 600px)', aspectRatio: '1/1' }}
      >
        {/* Bottom Layer: The Prompt */}
        <canvas
          id="bottom-canvas"
          ref={bottomCanvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Top Layer: The Art */}
        <canvas
          id="top-canvas"
          ref={topCanvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="absolute inset-0 w-full h-full touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        />

        {/* Mode Indicator Overlay */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-slate-100 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"
            >
              {mode === 'draw' ? <Pencil className="w-3.5 h-3.5 text-indigo-500" /> : mode === 'erase' ? <Eraser className="w-3.5 h-3.5 text-rose-500" /> : <Waves className="w-3.5 h-3.5 text-cyan-500" />}
              {mode} mode
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Toolbar */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-8 bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl border border-slate-200 flex flex-wrap items-center justify-center gap-4 max-w-4xl"
      >
        {/* Mode Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-2xl">
          <button
            id="btn-mode-draw"
            onClick={() => setMode('draw')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold text-sm ${mode === 'draw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Pencil className="w-4 h-4" />
            Draw
          </button>
          <button
            id="btn-mode-erase"
            onClick={() => setMode('erase')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold text-sm ${mode === 'erase' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Eraser className="w-4 h-4" />
            Erase
          </button>
          <button
            id="btn-mode-liquify"
            onClick={() => setMode('liquify')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-bold text-sm ${mode === 'liquify' ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Waves className="w-4 h-4" />
            Liquify
          </button>
        </div>

        <div className="h-8 w-px bg-slate-200 hidden sm:block" />

        {/* Shape Controls */}
        <div className="flex items-center gap-2">
          <button
            id="btn-rotate"
            onClick={rotateShape}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            title="Rotate 90°"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            id="btn-flip-h"
            onClick={flipHorizontal}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            title="Flip Horizontal"
          >
            <FlipHorizontal className="w-5 h-5" />
          </button>
          <button
            id="btn-flip-v"
            onClick={flipVertical}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            title="Flip Vertical"
          >
            <FlipVertical className="w-5 h-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-slate-200 hidden sm:block" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            id="btn-new-shape"
            onClick={() => { generateRandomShape(); clearDrawing(); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white rounded-xl font-bold text-sm hover:bg-indigo-600 transition-all active:scale-95 shadow-md shadow-indigo-100"
          >
            <RefreshCw className="w-4 h-4" />
            New Shape
          </button>
          <button
            id="btn-clear"
            onClick={clearDrawing}
            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
            title="Clear Drawing"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            id="btn-download"
            onClick={downloadArt}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all active:scale-95 shadow-md shadow-emerald-100"
          >
            <Download className="w-4 h-4" />
            Save
          </button>
        </div>
      </motion.div>

      {/* Instructions */}
      <p className="mt-6 text-slate-400 text-sm max-w-md text-center">
        Rotate or flip the shape to find inspiration. Use your mouse or finger to draw on top.
      </p>
    </div>
  );
}
