import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { ToolCategory, ToolId } from '../types/pdf';

interface HeaderProps {
  activeToolId: ToolId | null;
  activeCategory: ToolCategory;
  onSelectHome: (category?: ToolCategory) => void;
  onSelectTool: (toolId: ToolId) => void;
}

export function Header({
  activeToolId,
  activeCategory,
  onSelectHome,
  onSelectTool,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{
    label: string;
    isActive: boolean;
    onClick: () => void;
  }> = [
    {
      label: 'Semua Alat',
      isActive: activeToolId === null && activeCategory === 'all',
      onClick: () => {
        onSelectHome('all');
        setMobileOpen(false);
      },
    },
    {
      label: 'AI Background',
      isActive:
        activeToolId === 'ai-remove-bg' ||
        activeToolId === 'ai-change-bg' ||
        (activeToolId === null && activeCategory === 'ai-studio'),
      onClick: () => {
        onSelectTool('ai-remove-bg');
        setMobileOpen(false);
      },
    },
    {
      label: 'Alat Gambar',
      isActive:
        activeToolId === 'image-convert' ||
        activeToolId === 'heic-convert' ||
        activeToolId === 'image-upscale' ||
        activeToolId === 'image-resize' ||
        (activeToolId === null && activeCategory === 'image-tools'),
      onClick: () => {
        onSelectHome('image-tools');
        setMobileOpen(false);
      },
    },
    {
      label: 'Gabungkan',
      isActive: activeToolId === 'merge',
      onClick: () => {
        onSelectTool('merge');
        setMobileOpen(false);
      },
    },
    {
      label: 'Konversi',
      isActive:
        activeToolId === null &&
        (activeCategory === 'convert-to-pdf' || activeCategory === 'convert-from-pdf'),
      onClick: () => {
        onSelectHome('convert-to-pdf');
        setMobileOpen(false);
      },
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectHome('all')}
          className="inline-flex items-center gap-2.5 text-base sm:text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-md"
        >
          <img
            src="/assets/aistudio/Gemini_Generated_Image_1mrvf1mrvf1mrvf1_e6c396f3.jpg"
            alt="Logo PDF Creator Tools"
            className="w-9 h-9 rounded-lg object-cover border border-slate-200/80 shrink-0"
          />
          <span>PDF Creator Tools</span>
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`py-1 transition-colors duration-150 whitespace-nowrap shrink-0 border-b-2 ${
                item.isActive
                  ? 'text-blue-700 border-blue-700'
                  : 'text-slate-600 border-transparent hover:text-blue-700 hover:border-blue-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action + mobile menu toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {activeToolId ? (
            <button
              type="button"
              onClick={() => onSelectHome('all')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              Semua Alat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelectTool('ai-remove-bg')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
            >
              AI Hapus BG
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileOpen}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Navigasi seluler"
          className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1"
        >
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                item.isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
