import { useState } from 'react';

export default function GeneratedImageBlock({ imageData, mimeType = 'image/png' }) {
  const [enlarged, setEnlarged] = useState(false);
  const src = imageData ? `data:${mimeType};base64,${imageData}` : null;

  const download = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `generated_${Date.now()}.png`;
    a.click();
  };

  if (!src) return null;

  return (
    <div className="generated-image-block">
      <img
        src={src}
        alt="Generated"
        className="generated-image-img"
        onClick={() => setEnlarged(true)}
      />
      <div className="generated-image-actions">
        <button type="button" onClick={() => setEnlarged(true)} className="generated-image-btn">
          Enlarge
        </button>
        <button type="button" onClick={download} className="generated-image-btn">
          Download
        </button>
      </div>
      {enlarged && (
        <div className="generated-image-lightbox" onClick={() => setEnlarged(false)}>
          <div className="generated-image-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt="Generated (enlarged)" />
            <button type="button" onClick={download} className="generated-image-btn">
              Download
            </button>
            <button type="button" onClick={() => setEnlarged(false)} className="generated-image-btn">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
