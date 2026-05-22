// Renders comment text with @mentions highlighted in indigo (#6366f1).
const SPLIT_RE = /(@[A-Za-zÀ-ÿ0-9_]+)/g;
const ONE_RE = /^@[A-Za-zÀ-ÿ0-9_]+$/;

export default function MentionText({ text }) {
  if (!text) return null;
  const parts = String(text).split(SPLIT_RE);
  return (
    <>
      {parts.map((p, i) =>
        ONE_RE.test(p) ? (
          <span key={i} className="font-medium" style={{ color: '#6366f1' }}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}
