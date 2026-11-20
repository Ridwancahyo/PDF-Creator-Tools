export type ToolCategory =
  | 'all'
  | 'ai-studio'
  | 'image-tools'
  | 'organize'
  | 'optimize'
  | 'convert-to-pdf'
  | 'convert-from-pdf'
  | 'edit-security';

export type ToolId =
  | 'ai-remove-bg'
  | 'ai-change-bg'
  | 'image-convert'
  | 'heic-convert'
  | 'image-upscale'
  | 'image-resize'
  | 'merge'
  | 'split'
  | 'remove-pages'
  | 'extract-pages'
  | 'organize'
  | 'rotate'
  | 'compress'
  | 'repair'
  | 'jpg-to-pdf'
  | 'word-to-pdf'
  | 'excel-to-pdf'
  | 'ppt-to-pdf'
  | 'html-to-pdf'
  | 'pdf-to-jpg'
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-ppt'
  | 'page-numbers'
  | 'watermark'
  | 'crop'
  | 'edit-pdf'
  | 'sign-pdf'
  | 'redact-pdf'
  | 'lock-pdf'
  | 'unlock-pdf'
  | 'protect-pdf'
  | 'compare-pdf';

export interface PdfToolDefinition {
  id: ToolId;
  name: string;
  shortName: string;
  description: string;
  category: Exclude<ToolCategory, 'all'>;
  categoryLabel: string;
  accept: string;
  acceptLabel: string;
  multiple: boolean;
  minFiles?: number;
  maxFiles?: number;
  keywords: string[];
  actionLabel: string;
}

export interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  data: Uint8Array;
  pageCount?: number;
  previewUrl?: string;
  width?: number;
  height?: number;
  isEncrypted?: boolean;
}

export interface PageItem {
  id: string;
  originalIndex: number; // 0-based
  pageNumber: number; // 1-based display
  rotation: number; // 0, 90, 180, 270
  selected: boolean;
  thumbnailUrl: string;
  width: number;
  height: number;
}

export interface AnnotationOverlay {
  id: string;
  type: 'text' | 'redact' | 'highlight' | 'signature';
  pageIndex: number; // 0-based
  // Normalized coordinates (0..1 relative to page width & height)
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  color?: string;
  imageDataUrl?: string;
}

export interface ProcessingResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  originalSize: number;
  outputSize: number;
  pageCount?: number;
  summary: string;
  previewUrl?: string;
  secondaryDetail?: string;
}

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
  lineNumberA?: number;
  lineNumberB?: number;
}
