'use client';

import { displayImageUrl } from '@/lib/image-url';
import Image from 'next/image';
import { useState } from 'react';

const FALLBACK_IMAGE = '/logo.png';

export function MenuImage({
  src,
  alt,
  className = 'object-cover',
  sizes = '(max-width: 640px) 100vw, 320px',
  priority = false,
}) {
  const imageSrc = displayImageUrl(src);
  const [failedSrc, setFailedSrc] = useState('');
  const renderedSrc = failedSrc === imageSrc ? FALLBACK_IMAGE : imageSrc;

  return (
    <Image
      src={renderedSrc}
      alt={alt || ''}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => {
        if (renderedSrc !== FALLBACK_IMAGE) {
          setFailedSrc(imageSrc);
        }
      }}
    />
  );
}
