// ── YouTube / JSON tool declarations for Gemini ─────────────────────────────

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt. Optionally use an anchor/reference image (e.g. one the user dragged in) to guide style or content. The generated image is shown in-chat with a lightbox and download button.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Text description of the image to generate.',
        },
        anchorImageBase64: {
          type: 'STRING',
          description: 'Optional base64-encoded reference image (e.g. from user attachment) to guide generation.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot a numeric metric (view_count, like_count, comment_count, etc.) from the loaded YouTube JSON data over time. The chart is interactive, can be enlarged, and has a download button. Use the exact field names from the loaded JSON.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description: 'Numeric field to plot (e.g. viewCount, likeCount, commentCount). Use exact key from JSON.',
        },
        timeField: {
          type: 'STRING',
          description: 'Optional time/date field (default: releaseDate). Use exact key from JSON.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Show a clickable video card (title + thumbnail) that opens the YouTube URL in a new tab. Selection can be by: (1) title — match by video title; (2) ordinal — e.g. "the second video" use ordinal 2; (3) most_viewed — the video with highest view count. Use this whenever the user asks to play, open, or watch a video.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description: 'One of: "title", "ordinal", "most_viewed".',
        },
        title: { type: 'STRING', description: 'When selector is "title", the exact or partial video title.' },
        ordinal: {
          type: 'NUMBER',
          description: 'When selector is "ordinal", the 1-based index (e.g. 2 for "the second video").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std, min, and max for a numeric field in the loaded YouTube JSON (e.g. viewCount, likeCount, commentCount). Use the exact field name from the JSON.',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Numeric field name from the loaded JSON (e.g. viewCount, likeCount, commentCount).',
        },
      },
      required: ['field'],
    },
  },
];

// ── Normalize numeric field name (JSON may use camelCase or snake_case) ─────
function resolveNumericField(rows, name) {
  if (!rows.length || !name) return name;
  const keys = Object.keys(rows[0]);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  const camel = keys.find((k) => norm(k) === target);
  if (camel) return camel;
  const snake = keys.find((k) => norm(k) === target.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
  return snake || name;
}

function numericValues(rows, field) {
  return rows.map((r) => parseFloat(r[field])).filter((v) => !isNaN(v));
}

function median(sorted) {
  if (!sorted.length) return null;
  const s = [...sorted].sort((a, b) => a - b);
  return s.length % 2 === 0
    ? (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : s[Math.floor(s.length / 2)];
}

const fmt = (n) => (typeof n === 'number' && !isNaN(n) ? +n.toFixed(4) : n);

// ── Execute YouTube/JSON tools (client-side where possible) ──────────────────
// generateImage calls the backend API; others use sessionJsonData.
export async function executeYouTubeTool(toolName, args, sessionJsonData, anchorImageBase64) {
  const rows = Array.isArray(sessionJsonData) ? sessionJsonData : [];
  const API = process.env.REACT_APP_API_URL || '';

  switch (toolName) {
    case 'generateImage': {
      const promptText = args.prompt || '';
      const clientPlaceholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1e293b"/><text x="200" y="140" text-anchor="middle" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="14">Image tool: server unreachable</text><text x="200" y="165" text-anchor="middle" fill="#64748b" font-family="system-ui,sans-serif" font-size="12">Run the app with npm start so the backend is available</text></svg>`;
      const clientPlaceholderBase64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(clientPlaceholderSvg))) : '';

      try {
        const res = await fetch(`${API}/api/generate-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            anchorImageBase64: args.anchorImageBase64 || anchorImageBase64 || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            _imageResult: true,
            imageData: data.imageData || clientPlaceholderBase64,
            mimeType: data.mimeType || 'image/svg+xml',
            placeholder: true,
            message: data.error || `Server returned ${res.status}. Showing placeholder.`,
          };
        }
        if (!data.imageData) {
          const fallback = clientPlaceholderBase64 || 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFlMjkzYiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTRhM2I4Ij5JbWFnZTwvdGV4dD48L3N2Zz4=';
          return {
            _imageResult: true,
            imageData: fallback,
            mimeType: 'image/svg+xml',
            placeholder: true,
            message: data.error || 'No image data; showing placeholder.',
          };
        }
        return {
          _imageResult: true,
          imageData: data.imageData,
          mimeType: data.mimeType || 'image/png',
          placeholder: data.placeholder === true,
          message: data._message,
        };
      } catch (err) {
        return {
          _imageResult: true,
          imageData: clientPlaceholderBase64,
          mimeType: 'image/svg+xml',
          placeholder: true,
          message: err.message || 'Request failed; showing placeholder. Is the server running?',
        };
      }
    }

    case 'plot_metric_vs_time': {
      const metricKey = resolveNumericField(rows, args.metric || 'viewCount');
      const timeKey = args.timeField || 'releaseDate';
          const timeKeyResolved = resolveNumericField(rows, timeKey) || timeKey;
      const hasTime = rows.some((r) => r[timeKeyResolved] != null && r[timeKeyResolved] !== '');
      const data = hasTime
        ? rows
            .map((r) => ({
              date: r[timeKeyResolved] || '',
              value: parseFloat(r[metricKey]),
              raw: r,
            }))
            .filter((d) => d.date !== '' && !isNaN(d.value))
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((d) => ({ date: d.date, value: d.value, name: d.raw.title || d.date }))
        : rows
            .map((r, i) => ({ date: String(i + 1), value: parseFloat(r[metricKey]), name: r.title || `Video ${i + 1}` }))
            .filter((d) => !isNaN(d.value));
      return {
        _chartType: 'metric_vs_time',
        data,
        metricKey,
        timeKey: timeKeyResolved,
      };
    }

    case 'play_video': {
      const sel = (args.selector || '').toLowerCase();
      let video = null;
      if (sel === 'most_viewed' && rows.length) {
        const withViews = rows.map((r) => ({ ...r, _v: parseInt(r.viewCount, 10) || 0 }));
        withViews.sort((a, b) => b._v - a._v);
        video = withViews[0];
      } else if (sel === 'ordinal' && args.ordinal != null) {
        const idx = Math.max(0, parseInt(args.ordinal, 10) - 1);
        video = rows[idx] || null;
      } else if ((sel === 'title' || sel === 'title_match') && args.title) {
        const t = (args.title || '').toLowerCase();
        video = rows.find((r) => (r.title || '').toLowerCase().includes(t)) || null;
      }
      if (!video) return { error: 'No matching video found. Try "most_viewed", an ordinal (e.g. 1), or a title.' };
      return {
        _chartType: 'play_video',
        video: {
          title: video.title || 'Video',
          thumbnail: video.thumbnail || '',
          url: video.videoUrl || video.video_url || `https://www.youtube.com/watch?v=${video.videoId || ''}`,
        },
      };
    }

    case 'compute_stats_json': {
      const field = resolveNumericField(rows, args.field || 'viewCount');
      const vals = numericValues(rows, field);
      if (!vals.length)
        return { error: `No numeric values for field "${field}". Available: ${rows[0] ? Object.keys(rows[0]).join(', ') : 'none'}` };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
