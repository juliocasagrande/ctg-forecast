// Drag handle for resizing a table column (Excel-style). Drop on a <th> with position: relative.
export default function ColumnResizeHandle({ onResizeStart }) {
  return (
    <div
      onMouseDown={onResizeStart}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 6,
        cursor: 'col-resize', userSelect: 'none', zIndex: 2,
      }}
    />
  );
}
