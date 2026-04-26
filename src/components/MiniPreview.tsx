interface MiniPreviewProps {
  variant: 'workbench' | 'focus';
  theme: 'dark' | 'light';
}

/** Compact representation of the Workbench/Focus layouts — used in the
 * first-run picker and the Appearance settings layout cards. Not a live UI;
 * it's a structural mockup that conveys what the chosen layout looks like. */
export function MiniPreview({ variant, theme }: MiniPreviewProps) {
  const surface = theme === 'dark' ? '#23201c' : '#fbf7ed';
  const surface2 = theme === 'dark' ? '#2a2622' : '#efe8d8';
  const line = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const ink = theme === 'dark' ? '#cdc5b4' : '#2d2a25';
  const faint = theme === 'dark' ? '#8b8478' : '#857d6e';

  const TopBar = (
    <div
      style={{
        height: 14, background: surface, borderBottom: `1px solid ${line}`,
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 5px', borderRadius: 3,
      }}
    >
      <div
        style={{
          width: 8, height: 8, borderRadius: 2,
          background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 55%, var(--violet)))',
        }}
      />
      <div style={{ flex: 1, height: 4, background: surface2, borderRadius: 2 }} />
      <div style={{ width: 14, height: 6, background: 'var(--accent)', borderRadius: 2 }} />
    </div>
  );

  if (variant === 'workbench') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {TopBar}
        <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
          <div style={{ width: 8, background: surface, borderRadius: 2, padding: '4px 1px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            <div style={{ width: 4, height: 4, background: 'var(--accent)', borderRadius: 1 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
          </div>
          <div style={{ width: 32, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '60%' }} />
            <div style={{ height: 4, background: 'var(--accent-dim)', borderRadius: 1, marginTop: 2 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
          </div>
          <div style={{ flex: 1.6, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <div style={{ width: 10, height: 4, background: 'var(--accent-dim)', borderRadius: 1 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
            </div>
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 12, background: surface2, borderRadius: 1, marginTop: 2 }} />
          </div>
          <div style={{ width: 38, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <div style={{ flex: 1, height: 3, background: ink, borderRadius: 1, opacity: 0.7 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
              <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
            </div>
            <div style={{ height: 2, background: surface2, borderRadius: 1 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '80%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
          </div>
          <div style={{ flex: 1.25, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: 'var(--accent-dim)', borderRadius: 1, width: '40%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '70%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
          </div>
        </div>
        <div style={{ height: 6, background: surface, borderRadius: 2, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
          <div style={{ width: 3, height: 3, background: 'var(--accent)', borderRadius: 99 }} />
          <div style={{ flex: 1, height: 2, background: surface2, borderRadius: 1 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {TopBar}
      <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ flex: 1.5, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '30%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '65%' }} />
          </div>
          <div style={{ flex: 1, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '25%' }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '80%', marginTop: 2 }} />
            <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
          </div>
        </div>
        <div style={{ flex: 1, background: surface, borderRadius: 2, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 3, background: ink, borderRadius: 1, opacity: 0.7 }} />
            <div style={{ width: 8, height: 3, background: 'var(--accent-dim)', borderRadius: 1 }} />
          </div>
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '70%' }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
          <div style={{ height: 2, background: surface2, borderRadius: 1, width: '55%' }} />
        </div>
      </div>
      <div style={{ height: 6, background: surface, borderRadius: 2, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
        <div style={{ width: 3, height: 3, background: 'var(--accent)', borderRadius: 99 }} />
        <div style={{ flex: 1, height: 2, background: surface2, borderRadius: 1 }} />
      </div>
    </div>
  );
}
