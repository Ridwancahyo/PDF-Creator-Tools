import {
  ArrowUpRight,
  Code2,
  Combine,
  Crop,
  Eraser,
  EyeOff,
  FileCheck2,
  FileDiff,
  FileImage,
  FileOutput,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  FileUp,
  Hash,
  ImagePlus,
  LayoutGrid,
  Lock,
  LockOpen,
  Minimize2,
  PenTool,
  Presentation,
  RefreshCw,
  RotateCw,
  Scaling,
  Scissors,
  ShieldCheck,
  Smartphone,
  Stamp,
  Trash2,
  Wallpaper,
  Wrench,
} from 'lucide-react';
import type { ToolId } from '../types/pdf';

interface ToolIconProps {
  toolId: ToolId;
  className?: string;
}

export function ToolIcon({ toolId, className = 'w-5 h-5' }: ToolIconProps) {
  switch (toolId) {
    case 'ai-remove-bg':
      return <Eraser className={className} aria-hidden="true" />;
    case 'ai-change-bg':
      return <Wallpaper className={className} aria-hidden="true" />;
    case 'image-convert':
      return <RefreshCw className={className} aria-hidden="true" />;
    case 'heic-convert':
      return <Smartphone className={className} aria-hidden="true" />;
    case 'image-upscale':
      return <ArrowUpRight className={className} aria-hidden="true" />;
    case 'image-resize':
      return <Scaling className={className} aria-hidden="true" />;
    case 'merge':
      return <Combine className={className} aria-hidden="true" />;
    case 'split':
      return <Scissors className={className} aria-hidden="true" />;
    case 'remove-pages':
      return <Trash2 className={className} aria-hidden="true" />;
    case 'extract-pages':
      return <FileOutput className={className} aria-hidden="true" />;
    case 'organize':
      return <LayoutGrid className={className} aria-hidden="true" />;
    case 'rotate':
      return <RotateCw className={className} aria-hidden="true" />;
    case 'compress':
      return <Minimize2 className={className} aria-hidden="true" />;
    case 'repair':
      return <Wrench className={className} aria-hidden="true" />;
    case 'jpg-to-pdf':
      return <ImagePlus className={className} aria-hidden="true" />;
    case 'word-to-pdf':
      return <FileUp className={className} aria-hidden="true" />;
    case 'excel-to-pdf':
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case 'ppt-to-pdf':
      return <Presentation className={className} aria-hidden="true" />;
    case 'html-to-pdf':
      return <Code2 className={className} aria-hidden="true" />;
    case 'pdf-to-jpg':
      return <FileImage className={className} aria-hidden="true" />;
    case 'pdf-to-word':
      return <FileText className={className} aria-hidden="true" />;
    case 'pdf-to-excel':
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case 'pdf-to-ppt':
      return <Presentation className={className} aria-hidden="true" />;
    case 'page-numbers':
      return <Hash className={className} aria-hidden="true" />;
    case 'watermark':
      return <Stamp className={className} aria-hidden="true" />;
    case 'crop':
      return <Crop className={className} aria-hidden="true" />;
    case 'edit-pdf':
      return <FilePenLine className={className} aria-hidden="true" />;
    case 'sign-pdf':
      return <PenTool className={className} aria-hidden="true" />;
    case 'redact-pdf':
      return <EyeOff className={className} aria-hidden="true" />;
    case 'lock-pdf':
      return <Lock className={className} aria-hidden="true" />;
    case 'unlock-pdf':
      return <LockOpen className={className} aria-hidden="true" />;
    case 'protect-pdf':
      return <ShieldCheck className={className} aria-hidden="true" />;
    case 'compare-pdf':
      return <FileDiff className={className} aria-hidden="true" />;
    default:
      return <FileCheck2 className={className} aria-hidden="true" />;
  }
}
