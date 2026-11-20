import type { ToolId } from '../types/pdf';

interface FooterProps {
  onSelectTool: (toolId: ToolId) => void;
  onSelectHome: () => void;
}

export function Footer({ onSelectTool, onSelectHome }: FooterProps) {
  const popularTools: Array<{ id: ToolId; label: string }> = [
    { id: 'ai-remove-bg', label: 'AI Hapus Background' },
    { id: 'image-convert', label: 'Konversi JPG/PNG' },
    { id: 'heic-convert', label: 'HEIC ke JPG / PDF' },
    { id: 'image-upscale', label: 'Upscale Gambar HD' },
    { id: 'lock-pdf', label: 'Kunci PDF' },
    { id: 'unlock-pdf', label: 'Buka Kunci PDF' },
  ];

  return (
    <footer className="mt-20 border-t border-slate-200/90 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-slate-100">
          <div className="md:col-span-5 space-y-3">
            <button
              type="button"
              onClick={onSelectHome}
              className="inline-flex items-center gap-2.5 text-base font-display font-bold text-slate-900"
            >
              <img
                src="/assets/aistudio/Gemini_Generated_Image_1mrvf1mrvf1mrvf1_e6c396f3.jpg"
                alt="Logo PDF Creator Tools"
                className="w-8 h-8 rounded-lg object-cover border border-slate-200/80 shrink-0"
              />
              <span>PDF Creator Tools</span>
            </button>
            <p className="text-sm text-slate-600 leading-relaxed max-w-md">
              Rangkaian lengkap alat pengelolaan, konversi, pengeditan PDF, serta AI Studio
              Hapus &amp; Ganti Background foto yang berjalan cepat dan menjaga privasi berkas.
            </p>
          </div>

          <div className="md:col-span-4 space-y-3">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Alat Populer
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {popularTools.map((tool) => (
                <li key={tool.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTool(tool.id)}
                    className="text-sm text-slate-600 hover:text-blue-700 transition-colors"
                  >
                    {tool.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h2 className="text-sm font-display font-semibold text-slate-900">
              Privasi Berkas
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Seluruh pemrosesan PDF dan gambar berjalan lokal di browser Anda. Dokumen tidak
              dikirim atau disimpan di server pihak ketiga.
            </p>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-slate-500">
          <p className="font-medium text-slate-700">
            &copy; {new Date().getFullYear()} PDF Creator Tools &middot; Dibuat oleh Ridwan. Seluruh hak cipta dilindungi.
          </p>
        </div>
      </div>
    </footer>
  );
}
