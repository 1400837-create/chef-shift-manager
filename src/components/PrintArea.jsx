// Rendered once at the app root. Invisible on screen (#print-area is
// display:none outside @media print — see index.css); becomes the entire
// visible page when window.print() runs. Content is driven purely by
// `payload`, set right before printing and cleared via window.onafterprint.
export default function PrintArea({ payload }) {
  if (!payload) return <div id="print-area" />

  return (
    <div id="print-area">
      {payload.type === 'tasks' && <TasksPrint payload={payload} />}
      {payload.type === 'menu' && <MenuPrint payload={payload} />}
      {payload.type === 'recount' && <RecountPrint payload={payload} />}
    </div>
  )
}

function TasksPrint({ payload }) {
  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Задачи для Küchenhilfe</h1>
      <p style={{ marginBottom: 12, color: '#444' }}>{payload.date}</p>
      {payload.tasksByCategory.map((cat) => (
        <div key={cat.label} className="print-no-break" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 6 }}>
            {cat.label}
          </h2>
          {cat.items.length === 0 && <p style={{ color: '#888' }}>—</p>}
          {cat.items.map((text, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 14, height: 14, border: '1.5px solid #000', display: 'inline-block', flexShrink: 0, marginTop: 1 }} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function MenuPrint({ payload }) {
  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{payload.title}</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Дата', 'Суп', 'Горячее', 'Гарнир', 'Салат'].map((h) => (
              <th key={h} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: 11 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((r) => (
            <tr key={r.day} className="print-no-break">
              <td style={{ border: '1px solid #000', padding: '4px 6px', whiteSpace: 'nowrap' }}>
                {r.day}. {r.weekday}
              </td>
              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{r.soup}{r.soupKosher && ' ✡'}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{r.main}{r.mainKosher && ' ✡'}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{r.side}{r.sideKosher && ' ✡'}</td>
              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{r.salad}{r.saladKosher && ' ✡'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 8, fontSize: 10, color: '#444' }}>✡ — кошерное блюдо (кашрут)</p>
    </div>
  )
}

function RecountPrint({ payload }) {
  return (
    <div>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{payload.title}</h1>
      {payload.zones.map((zone) => (
        <div key={zone.label} className="print-no-break" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 2, marginBottom: 6 }}>
            {zone.label}
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: 11 }}>Продукт</th>
                <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: 11, width: 60 }}>Ед.</th>
                <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', fontSize: 11, width: 90 }}>Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {zone.items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{item.name}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{item.unit}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{payload.blank ? '' : item.qty}</td>
                </tr>
              ))}
              {zone.items.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 6px', color: '#888' }}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <p style={{ marginTop: 20 }}>Подпись Küchenleiterin: ______________________</p>
    </div>
  )
}
