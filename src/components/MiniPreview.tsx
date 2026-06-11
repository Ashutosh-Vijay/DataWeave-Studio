interface MiniPreviewProps {
  variant: 'workbench' | 'focus';
  theme: 'dark' | 'light';
}

/** Compact representation of the Workbench/Playground layouts — used in the
 * first-run picker and the Appearance settings layout cards. Not a live UI;
 * it's a structural mockup. Both layouts now read left→right as
 * Input/Context → Script → Output; Workbench adds the icon rail + sidebar. */
export function MiniPreview({ variant, theme }: MiniPreviewProps) {
  const surface = theme === 'dark' ? '#23201c' : '#fbf7ed';
  const surface2 = theme === 'dark' ? '#2a2622' : '#efe8d8';
  const line = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
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

  const StatusBar = (
    <div style={{ height: 6, background: surface, borderRadius: 2, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2 }}>
      <div style={{ width: 3, height: 3, background: 'var(--accent)', borderRadius: 99 }} />
      <div style={{ flex: 1, height: 2, background: surface2, borderRadius: 1 }} />
    </div>
  );

  // Column 1 — Inputs: payload (top) + context (bottom), stacked.
  const inputCol = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
      <div style={{ flex: 1.2, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ height: 3, background: 'var(--accent-dim)', borderRadius: 1, width: '45%' }} />
        <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 1 }} />
        <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
        <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
      </div>
      <div style={{ flex: 1, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ height: 3, background: surface2, borderRadius: 1, width: '35%' }} />
        <div style={{ height: 2, background: surface2, borderRadius: 1, width: '80%', marginTop: 1 }} />
        <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
      </div>
    </div>
  );

  // Column 2 — Transformation: the script editor.
  const scriptCol = (
    <div style={{ flex: 1.5, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <div style={{ width: 10, height: 4, background: 'var(--accent-dim)', borderRadius: 1 }} />
        <div style={{ flex: 1, height: 3, background: surface2, borderRadius: 1 }} />
      </div>
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 2 }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '75%' }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '60%' }} />
    </div>
  );

  // Column 3 — Output.
  const outputCol = (
    <div style={{ flex: 1.1, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ height: 3, background: 'var(--accent-dim)', borderRadius: 1, width: '40%' }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '90%', marginTop: 1 }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '70%' }} />
      <div style={{ height: 2, background: surface2, borderRadius: 1, width: '85%' }} />
    </div>
  );

  if (variant === 'workbench') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {TopBar}
        <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
          {/* icon rail */}
          <div style={{ width: 8, background: surface, borderRadius: 2, padding: '4px 1px', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            <div style={{ width: 4, height: 4, background: 'var(--accent)', borderRadius: 1 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
            <div style={{ width: 4, height: 4, background: faint, borderRadius: 1, opacity: 0.5 }} />
          </div>
          {/* sidebar */}
          <div style={{ width: 26, background: surface, borderRadius: 2, padding: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ height: 3, background: surface2, borderRadius: 1, width: '60%' }} />
            <div style={{ height: 4, background: 'var(--accent-dim)', borderRadius: 1, marginTop: 2 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
            <div style={{ height: 4, background: surface2, borderRadius: 1 }} />
          </div>
          {inputCol}
          {scriptCol}
          {outputCol}
        </div>
        {StatusBar}
      </div>
    );
  }

  // Playground — same Input → Script → Output flow, no rail/sidebar.
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {TopBar}
      <div style={{ flex: 1, display: 'flex', gap: 3, minHeight: 0 }}>
        {inputCol}
        {scriptCol}
        {outputCol}
      </div>
      {StatusBar}
    </div>
  );
}
