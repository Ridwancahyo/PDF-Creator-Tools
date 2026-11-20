import { ArrowRight, Layers, Lock, Search, Zap } from 'lucide-react';
import { CATEGORY_SECTIONS, CATEGORY_TABS, PDF_TOOLS } from '../data/tools';
import type { PdfToolDefinition, ToolCategory, ToolId } from '../types/pdf';
import { SAMPLE_PORTRAIT_URL, STUDIO_BACKDROP_PRESETS } from '../utils/aiBackgroundEngine';
import { filterTools } from '../utils/pdfHelpers';
import { ToolIcon } from './ToolIcon';

interface ToolCatalogProps {
  activeCategory: ToolCategory;
  searchQuery: string;
  onCategoryChange: (category: ToolCategory) => void;
  onSearchChange: (query: string) => void;
  onSelectTool: (toolId: ToolId) => void;
}

export function ToolCatalog({
  activeCategory,
  searchQuery,
  onCategoryChange,
  onSearchChange,
  onSelectTool,
}: ToolCatalogProps) {
  const filteredTools = filterTools(PDF_TOOLS, activeCategory, searchQuery);
  const isGroupedMode = activeCategory === 'all' && searchQuery.trim() === '';
  const officeBackdrop = STUDIO_BACKDROP_PRESETS.find((p) => p.id === 'photo-office-modern');

  const renderToolCard = (tool: PdfToolDefinition) => (
    <button
      key={tool.id}
      type="button"
      onClick={() => onSelectTool(tool.id)}
      className="group text-left bg-white border border-slate-200/90 hover:border-blue-300 rounded-xl p-5 sm:p-6 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-700 group-hover:text-white transition-colors duration-150 inline-flex items-center justify-center shrink-0">
            <ToolIcon toolId={tool.id} className="w-5 h-5" />
          </span>
          <ArrowRight
            className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all duration-150"
            aria-hidden="true"
          />
        </div>
        <p className="text-xs text-slate-500 mb-1">{tool.categoryLabel}</p>
        <h3 className="font-display text-base font-semibold text-slate-900 group-hover:text-blue-800 transition-colors">
          {tool.name}
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-3">
          {tool.description}
        </p>
      </div>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14">
      {/* Focused Minimalist Hero */}
      <section className="max-w-3xl mx-auto text-center space-y-5">
        <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
          PDF Creator Tools untuk dokumen rapi dan studio AI Background
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Kelola, gabungkan, kompres, kunci &amp; buka kunci PDF, konversi gambar JPG/PNG/HEIC,
          upscale, resize, serta AI Hapus &amp; Ganti Background foto secara cepat.
        </p>

        {/* Search Input */}
        <div className="pt-2 max-w-xl mx-auto">
          <label htmlFor="tool-search" className="sr-only">
            Cari alat PDF, gambar, atau AI Background
          </label>
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="tool-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari alat PDF, HEIC, upscale, kunci PDF, atau AI Background..."
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 focus:outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* Segmented Category Filter Tabs */}
      <section aria-label="Filter kategori alat" className="mt-9">
        <div className="flex items-center justify-center">
          <div className="inline-flex flex-wrap items-center justify-center gap-1 p-1.5 bg-slate-100/90 border border-slate-200/70 rounded-xl">
            {CATEGORY_TABS.map((tab) => {
              const isSelected = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryChange(tab.id)}
                  aria-pressed={isSelected}
                  className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Flagship AI Studio Feature Showcase (visible in default catalog view) */}
        {isGroupedMode && (
          <div className="mt-10 bg-white border border-blue-200/90 rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-4">
              <p className="text-xs font-medium text-blue-700">
                Fitur Unggulan &middot; AI Studio Foto HD
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Hapus &amp; Ganti Background Foto oleh AI dengan Presisi Studio
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                Potong subjek otomatis dengan tepi rambut halus, ganti latar ke pas foto biru atau
                merah, studio minimalis, kantor modern bokeh, lengkapi dengan bayangan alami, lalu
                ekspor ke PNG transparan, JPG, atau langsung ke PDF.
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectTool('ai-remove-bg')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-colors whitespace-nowrap"
                >
                  Coba AI Hapus Background
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectTool('ai-change-bg')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap"
                >
                  Buka AI Ganti Background
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100">
                <img
                  src={SAMPLE_PORTRAIT_URL}
                  alt="Contoh foto potret studio"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/75 text-white text-[11px] font-medium">
                  Hapus BG Transparan
                </span>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100">
                {officeBackdrop?.imageUrl && (
                  <img
                    src={officeBackdrop.imageUrl}
                    alt="Latar kantor modern bokeh"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-blue-700/90 text-white text-[11px] font-medium">
                  Ganti Latar Studio
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Result count metadata (unboxed quiet text) */}
        <div className="mt-8 mb-6 flex items-center justify-between text-xs text-slate-500">
          <p className="tabular-nums">
            Menampilkan <span className="font-semibold text-slate-700">{filteredTools.length}</span> dari{' '}
            <span className="font-semibold text-slate-700">{PDF_TOOLS.length}</span> alat PDF, Gambar &amp; AI
          </p>
          {(activeCategory !== 'all' || searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                onCategoryChange('all');
                onSearchChange('');
              }}
              className="text-blue-700 hover:text-blue-800 font-medium transition-colors"
            >
              Reset filter
            </button>
          )}
        </div>

        {/* Grouped Organized Sections OR Flat Filtered Grid */}
        {filteredTools.length === 0 ? (
          <div className="py-16 px-6 text-center bg-white border border-slate-200 rounded-2xl">
            <p className="font-display text-base font-semibold text-slate-900">
              Alat tidak ditemukan
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Coba kata kunci lain seperti &ldquo;hapus background&rdquo;, &ldquo;gabungkan&rdquo;, atau &ldquo;kompres&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                onCategoryChange('all');
                onSearchChange('');
              }}
              className="mt-5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
            >
              Tampilkan Semua Alat
            </button>
          </div>
        ) : isGroupedMode ? (
          <div data-testid="tool-grid" className="space-y-12">
            {CATEGORY_SECTIONS.map((section) => {
              const sectionTools = filteredTools.filter((t) => t.category === section.id);
              if (sectionTools.length === 0) return null;
              return (
                <div key={section.id} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-200/80">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        <span className="text-blue-700 font-mono text-sm mr-2">{section.number}.</span>
                        {section.title}
                      </h2>
                      <p className="text-sm text-slate-600 mt-0.5">{section.subtitle}</p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                      {sectionTools.length} alat
                    </span>
                  </div>

                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${
                      sectionTools.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-4'
                    } gap-4`}
                  >
                    {sectionTools.map(renderToolCard)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            data-testid="tool-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {filteredTools.map(renderToolCard)}
          </div>
        )}
      </section>

      {/* Calm Trust & Workflow Summary Strip */}
      <section
        aria-label="Keunggulan PDF Creator Tools"
        className="mt-16 pt-12 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-blue-700">
            <Lock className="w-4 h-4" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Privasi Terjaga 100% Lokal
            </h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Berkas PDF dan foto Anda diolah langsung di memori browser tanpa diunggah ke server
            eksternal sehingga kerahasiaan data tetap aman.
          </p>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-blue-700">
            <Zap className="w-4 h-4" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Cepat &amp; Tanpa Antrean
            </h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Penggabungan, pemisahan, kompresi, konversi Office, hingga penghapusan latar belakang AI
            berlangsung cepat tanpa menunggu antrean server.
          </p>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-blue-700">
            <Layers className="w-4 h-4" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {PDF_TOOLS.length} Alat PDF &amp; Gambar Tersusun Rapi
            </h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Dikelompokkan rapi dalam {CATEGORY_SECTIONS.length} kategori utama mulai dari AI Studio
            Background, alat gambar &amp; HEIC, hingga kunci/buka kunci dan tanda tangan PDF.
          </p>
        </div>
      </section>
    </div>
  );
}
