import { useState, useEffect } from 'react';
import './YouTubeDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeDownload() {
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const startDownload = async () => {
    setError('');
    setJobId(null);
    setProgress(null);
    try {
      const res = await fetch(`${API}/api/youtube/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: channelUrl.trim(),
          maxVideos: Math.min(100, Math.max(1, parseInt(maxVideos, 10) || 10)),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start download');
      setJobId(data.jobId);
    } catch (err) {
      setError(err.message || 'Failed to start download');
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/youtube/status/${jobId}`);
        const data = await res.json();
        setProgress(data);
        if (data.status === 'done' || data.status === 'error') clearInterval(t);
      } catch (_) {}
    }, 800);
    return () => clearInterval(t);
  }, [jobId]);

  const current = progress?.current ?? 0;
  const total = progress?.total || 1;
  const pct = total ? Math.round((current / total) * 100) : 0;

  const needsApiKey = error?.includes('YOUTUBE_API_KEY') || progress?.status === 'error' && progress?.error?.includes('YOUTUBE_API_KEY');

  return (
    <div className="youtube-download">
      <h2 className="youtube-download-title">YouTube Channel Download</h2>
      <p className="youtube-download-desc">
        Enter a YouTube channel URL (e.g. https://www.youtube.com/@veritasium) and how many videos to fetch. Data is saved as JSON in the public folder.
      </p>

      {needsApiKey && (
        <div className="youtube-download-setup">
          <strong>Setup: YouTube API key required</strong>
          <ol>
            <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console → Credentials</a>.</li>
            <li>Create a project (or pick one), then enable <strong>YouTube Data API v3</strong> (<a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">enable it here</a>).</li>
            <li>Click <strong>Create credentials</strong> → <strong>API key</strong>, then copy the key.</li>
            <li>In your project root, open <code>.env</code> and add: <code>YOUTUBE_API_KEY=your_key_here</code></li>
            <li>Restart the server (<code>npm run server</code> or <code>npm start</code>).</li>
          </ol>
        </div>
      )}

      <div className="youtube-download-form">
        <input
          type="text"
          placeholder="Channel URL (e.g. https://www.youtube.com/@veritasium)"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          className="youtube-download-input"
        />
        <label className="youtube-download-max">
          Max videos:
          <input
            type="number"
            min={1}
            max={100}
            value={maxVideos}
            onChange={(e) => setMaxVideos(e.target.value)}
            className="youtube-download-number"
          />
        </label>
        <button
          type="button"
          onClick={startDownload}
          disabled={!!jobId && progress?.status !== 'done' && progress?.status !== 'error'}
          className="youtube-download-btn"
        >
          Download Channel Data
        </button>
      </div>
      {error && <p className="youtube-download-error">{error}</p>}
      {progress && (
        <div className="youtube-download-progress-wrap">
          <div className="youtube-download-progress-bar">
            <div className="youtube-download-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="youtube-download-progress-text">
            {progress.status === 'fetching' && `${current} / ${total} videos`}
            {progress.status === 'done' && `Done. Saved as ${progress.filename}`}
            {progress.status === 'error' && (progress.error || 'Error')}
          </p>
          {progress.status === 'done' && progress.filepath && (
            <a href={progress.filepath} target="_blank" rel="noreferrer" className="youtube-download-link">
              Open JSON file
            </a>
          )}
        </div>
      )}
    </div>
  );
}
