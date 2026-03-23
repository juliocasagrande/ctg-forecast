// Self-contained SVG icon set — no external dependencies
const icons = {
  'inbox': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M2.94 6.412A2 2 0 014.913 5h10.174a2 2 0 011.973 1.412l1.861 7A2 2 0 0116.987 16H3.013a2 2 0 01-1.934-2.588l1.861-7zM14 12a2 2 0 11-4 0H4l1.6-6h8.8L16 12h-2z" clipRule="evenodd"/>
    </svg>
  ),
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
  'file-excel': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
      <path d="M7.5 10.5l2 3m0-3l-2 3M10.5 10.5l2 3m0-3l-2 3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  'question-circle': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
    </svg>
  ),
  'lightbulb': (
    <svg viewBox="0 0 20 20" fill="currentColor" width="1em" height="1em">
      <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM4 11a1 1 0 100-2H3a1 1 0 000 2h1zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3zM10 6a4 4 0 00-4 4c0 1.306.622 2.418 1.582 3.128C8.006 13.428 8 13.71 8 14h4c0-.29-.006-.572-.418-.872A4.003 4.003 0 0010 6z"/>
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
