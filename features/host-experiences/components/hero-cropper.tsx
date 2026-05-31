'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { motion, useReducedMotion } from 'framer-motion';
import { ZoomIn } from 'lucide-react';
import { SPRING } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import {
  cropToWebp,
  HERO_ASPECT,
  type PixelArea,
} from '@/features/host-experiences/lib/image-process';

export interface HeroCropperCopy {
  title: string;
  instruction: string;
  zoom: string;
  cancel: string;
  apply: string;
  applying: string;
}

export interface HeroCropperProps {
  /** Data URL of the file the host selected. */
  imageSrc: string;
  copy: HeroCropperCopy;
  onCancel: () => void;
  /** Receives the cropped, re-encoded 16:9 WebP ready to upload. */
  onApply: (file: File) => void;
}

/**
 * Full-screen crop sheet for framing a hero photo to the canonical 16:9
 * (BRIEF §3). Springs up from the bottom; static under reduced motion.
 * On apply, the chosen region is rendered to a bounded WebP so every
 * stored hero is uniform and lightweight.
 */
export function HeroCropper({ imageSrc, copy, onCancel, onApply }: HeroCropperProps) {
  const reduce = useReducedMotion();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PixelArea | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setArea(pixels);
  }, []);

  // Close on Escape and lock background scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onCancel]);

  async function handleApply() {
    if (!area || busy) return;
    setBusy(true);
    try {
      const file = await cropToWebp(imageSrc, area);
      onApply(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label={copy.cancel}
        onClick={onCancel}
        className="bg-sarat-black/60 absolute inset-0 cursor-default"
      />

      <motion.div
        initial={reduce ? false : { y: '100%' }}
        animate={{ y: 0 }}
        transition={SPRING}
        className="bg-fog-white rounded-t-modal relative flex max-h-[90vh] w-full flex-col gap-5 p-6 sm:mx-auto sm:max-w-2xl"
      >
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.title}</h2>
          <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.instruction}</p>
        </div>

        <div className="bg-sarat-black rounded-image relative aspect-[16/9] w-full overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={HERO_ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
          />
        </div>

        <label className="flex items-center gap-3">
          <ZoomIn className="text-sarat-black-600 size-4 shrink-0" aria-hidden />
          <span className="sr-only">{copy.zoom}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label={copy.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="accent-saffron-gold h-1 w-full cursor-pointer"
          />
        </label>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={busy}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleApply}
            pending={busy}
            disabled={busy || !area}
          >
            {busy ? copy.applying : copy.apply}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
