import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

// QR codes and Code128 barcodes are generated in the browser, so patient data is never
// sent to a third-party image service.

export function useQrDataUrl(data, size = 200, color = '#1a1a2e') {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(String(data ?? ''), { width: size, margin: 2, errorCorrectionLevel: 'M', color: { dark: color, light: '#ffffff' } })
      .then(u => { if (alive) setUrl(u) })
      .catch(() => { if (alive) setUrl('') })
    return () => { alive = false }
  }, [data, size, color])
  return url
}

export function QrImage({ data, size = 200, color, alt = 'QR code', style, ...rest }) {
  const url = useQrDataUrl(data, size, color)
  return url
    ? <img src={url} alt={alt} style={{ width: size, height: size, ...style }} {...rest} />
    : <div style={{ width: size, height: size, background: 'var(--gray-50)', ...style }} />
}

export function Barcode128({ value, width, height, style, ...rest }) {
  const url = useMemo(() => {
    try {
      const canvas = document.createElement('canvas')
      JsBarcode(canvas, String(value ?? ''), { format: 'CODE128', displayValue: false, margin: 0, height: 60 })
      return canvas.toDataURL('image/png')
    } catch { return '' }
  }, [value])
  return <img src={url} alt="Barcode" style={{ width, height, objectFit: 'contain', ...style }} {...rest} />
}
