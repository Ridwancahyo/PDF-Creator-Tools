import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [inkColor, setInkColor] = useState<'#0f172a' | '#1d4ed8'>('#0f172a');
  const [typedName, setTypedName] = useState('Ridwan');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokesRef = useRef(false);

  // Render typed signature automatically when in 'type' mode
  useEffect(() => {
    if (mode !== 'type') return;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const trimmed = typedName.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    ctx.fillStyle = inkColor;
    ctx.font = 'italic 600 54px Georgia, "Times New Roman", serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
    // Subtle signature flourish underline
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(96, 122);
    ctx.quadraticCurveTo(240, 110, 384, 120);
    ctx.stroke();

    onChange(canvas.toDataURL('image/png'));
  }, [mode, typedName, inkColor, onChange]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pos = getPointerPos(e);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    hasStrokesRef.current = true;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasStrokesRef.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasStrokesRef.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80">
          <button
            type="button"
            onClick={() => {
              setMode('draw');
              hasStrokesRef.current = false;
              onChange(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'draw' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Gambar Tangan
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'type' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ketik Nama
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setInkColor('#0f172a')}
            aria-label="Warna tinta hitam"
            className={`w-6 h-6 rounded-full bg-slate-900 border-2 ${
              inkColor === '#0f172a' ? 'border-blue-600 ring-2 ring-blue-200' : 'border-white'
            }`}
          />
          <button
            type="button"
            onClick={() => setInkColor('#1d4ed8')}
            aria-label="Warna tinta biru"
            className={`w-6 h-6 rounded-full bg-blue-700 border-2 ${
              inkColor === '#1d4ed8' ? 'border-blue-300 ring-2 ring-blue-200' : 'border-white'
            }`}
          />
        </div>
      </div>

      {mode === 'draw' ? (
        <div className="space-y-2">
          <div className="relative rounded-xl border border-slate-200 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={480}
              height={160}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-32 touch-none cursor-crosshair block"
            />
            <button
              type="button"
              onClick={clearCanvas}
              aria-label="Hapus goresan tanda tangan"
              className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
              Bersihkan
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Goreskan tanda tangan Anda di kotak putih di atas, lalu klik area halaman PDF untuk menempatkannya.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="typed-signature" className="block text-xs font-medium text-slate-700">
            Nama Tanda Tangan
          </label>
          <input
            id="typed-signature"
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Masukkan nama Anda"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:border-blue-600 focus:outline-none"
          />
          <div className="h-20 rounded-xl border border-slate-200 bg-white flex items-center justify-center px-4">
            <span
              style={{ color: inkColor, fontFamily: 'Georgia, "Times New Roman", serif' }}
              className="text-3xl italic font-semibold tracking-wide truncate"
            >
              {typedName.trim() || 'Pratinjau Tanda Tangan'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
