export default function PlayVideoCard({ video }) {
  if (!video?.url) return null;
  return (
    <div className="play-video-card">
      <a
        href={video.url}
        target="_blank"
        rel="noreferrer noopener"
        className="play-video-card-link"
      >
        {video.thumbnail && (
          <img src={video.thumbnail} alt="" className="play-video-card-thumb" />
        )}
        <span className="play-video-card-title">{video.title || 'Watch video'}</span>
        <span className="play-video-card-hint">Opens in new tab →</span>
      </a>
    </div>
  );
}
