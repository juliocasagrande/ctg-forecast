import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * ColumnFilterDropdown - Dropdown de filtro estilo Excel para colunas de tabela
 * 
 * Props:
 * - column: string (nome da coluna)
 * - uniqueValues: string[] (valores únicos disponíveis na coluna)
 * - selectedValues: string[] (valores atualmente selecionados)
 * - onChange: (values: string[]) => void (callback quando os filtros mudam)
 * - searchPlaceholder?: string
 * - maxWidth?: number
 */
export default function ColumnFilterDropdown({
  column,
  uniqueValues,
  selectedValues,
  onChange,
  searchPlaceholder = 'Buscar...',
  maxWidth = 240,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempSelected, setTempSelected] = useState(selectedValues);
  const btnRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const [dropdownWidth, setDropdownWidth] = useState(maxWidth);

  // Sync with parent
  useEffect(() => {
    setTempSelected(selectedValues);
  }, [selectedValues]);

  // Calculate position when opening
  const handleOpen = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - maxWidth - 16),
      });
      setDropdownWidth(Math.min(maxWidth, window.innerWidth - rect.left - 16));
    }
    setOpen(true);
  }, [maxWidth]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearch('');
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        handleClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, handleClose]);

  const allValues = uniqueValues.filter(v =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = tempSelected.length === uniqueValues.length;
  const someSelected = tempSelected.length > 0 && tempSelected.length < uniqueValues.length;

  const toggleAll = () => {
    setTempSelected(allSelected ? [] : [...uniqueValues]);
  };

  const toggleValue = (value) => {
    setTempSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

  const applyFilter = () => {
    onChange(tempSelected);
    handleClose();
  };

  const clearFilter = () => {
    setTempSelected([]);
    onChange([]);
    handleClose();
  };

  const hasActiveFilter = selectedValues.length > 0 && selectedValues.length < uniqueValues.length;

  // Filter icon color
  const iconColor = hasActiveFilter ? '#0066B3' : '#94A3B8';

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title={hasActiveFilter ? `Filtro ativo: ${selectedValues.length} de ${uniqueValues.length}` : 'Filtrar coluna'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          marginLeft: 4,
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 4,
          transition: 'background 0.15s',
          color: iconColor,
          lineHeight: 1,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        {/* Filter icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 1.5h13l-5.5 6.5v4l-3 1.5v-5.5L1.5 1.5z"/>
        </svg>
        {hasActiveFilter && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#0066B3',
            border: '1.5px solid #fff',
          }}/>
        )}
      </button>

      {open && createPortal(
        <div
          style={{
            position: 'fixed',
            top: dropdownPos?.top || 0,
            left: dropdownPos?.left || 0,
            width: dropdownWidth,
            maxHeight: 400,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#64748B" style={{ flexShrink: 0 }}>
              <path d="M1.5 1.5h13l-5.5 6.5v4l-3 1.5v-5.5L1.5 1.5z"/>
            </svg>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#1E293B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {column}
            </span>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 8px',
              background: '#fff',
              border: '1.5px solid #E2E8F0',
              borderRadius: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="#94A3B8" style={{ flexShrink: 0 }}>
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.82rem',
                  color: '#1E293B',
                  background: 'transparent',
                  minWidth: 0,
                }}
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Select All */}
          <label style={{
            padding: '8px 12px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            background: someSelected ? '#F0F7FF' : 'transparent',
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              style={{
                width: 16,
                height: 16,
                accentColor: '#0066B3',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
            <span style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: someSelected ? '#0066B3' : '#475569',
            }}>
              {allSelected ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
            </span>
            {someSelected && (
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.68rem',
                color: '#0066B3',
                fontWeight: 600,
              }}>
                {tempSelected.length}/{uniqueValues.length}
              </span>
            )}
          </label>

          {/* Value list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
            maxHeight: 220,
          }}>
            {allValues.length === 0 ? (
              <div style={{
                padding: '16px 12px',
                textAlign: 'center',
                color: '#94A3B8',
                fontSize: '0.78rem',
              }}>
                Nenhum resultado
              </div>
            ) : (
              allValues.map(value => {
                const isSelected = tempSelected.includes(value);
                return (
                  <label
                    key={value}
                    style={{
                      padding: '6px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      background: isSelected ? '#EFF6FF' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleValue(value)}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: '#0066B3',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontSize: '0.82rem',
                      color: '#1E293B',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      fontWeight: isSelected ? 600 : 400,
                    }}>
                      {value}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer buttons */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            gap: 8,
            background: '#F8FAFC',
          }}>
            <button
              onClick={clearFilter}
              disabled={tempSelected.length === 0}
              style={{
                flex: 1,
                padding: '6px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: 6,
                background: tempSelected.length === 0 ? '#F1F5F9' : '#fff',
                color: tempSelected.length === 0 ? '#94A3B8' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: tempSelected.length === 0 ? 'not-allowed' : 'pointer',
                opacity: tempSelected.length === 0 ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (tempSelected.length > 0) {
                  e.currentTarget.style.borderColor = '#CBD5E1';
                  e.currentTarget.style.background = '#F8FAFC';
                }
              }}
              onMouseLeave={e => {
                if (tempSelected.length > 0) {
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.background = '#fff';
                }
              }}
            >
              Limpar Filtro
            </button>
            <button
              onClick={applyFilter}
              style={{
                flex: 1,
                padding: '6px 12px',
                border: 'none',
                borderRadius: 6,
                background: '#0066B3',
                color: '#fff',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#0050B3'}
              onMouseLeave={e => e.currentTarget.style.background = '#0066B3'}
            >
              Aplicar
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
