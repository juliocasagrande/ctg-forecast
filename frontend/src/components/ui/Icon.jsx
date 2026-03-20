// Self-contained SVG icon set — no external dependencies
const icons = {
  'gear': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
    </svg>
  ),
  'circle-user': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
    </svg>
  ),
  'right-from-bracket': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7v-2H4V5h6V3H3zm11.293 4.293a1 1 0 011.414 1.414L13.414 11H9a1 1 0 110-2h4.414l2.293-2.293z" clipRule="evenodd"/>
    </svg>
  ),
  'house-chimney': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
    </svg>
  ),
  'folder-open': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
    </svg>
  ),
  'layer-group': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z"/>
    </svg>
  ),
  'sliders': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/>
    </svg>
  ),
};

export default function Icon({ name, className, style }) {
  const icon = icons[name];
  if (!icon) return null;
  return (
    <span className={`icon ${className || ''}`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', ...style }}>
      {icon}
    </span>
  );
}
