export interface SSEEvent { event: string; data: unknown }

/** Incremental Server-Sent-Events parser; tolerant of chunk boundaries anywhere in a frame. */
export class SSEParser {
  private buf = ''

  feed(chunk: string): SSEEvent[] {
    this.buf += chunk.replace(/\r\n/g, '\n')
    const out: SSEEvent[] = []
    let idx: number
    while ((idx = this.buf.indexOf('\n\n')) !== -1) {
      const frame = this.buf.slice(0, idx)
      this.buf = this.buf.slice(idx + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }
      if (!dataLines.length) continue
      try {
        out.push({ event, data: JSON.parse(dataLines.join('\n')) })
      } catch {
        out.push({ event: 'error', data: { code: 'bad_frame', message: 'Malformed stream frame.', retryable: true } })
      }
    }
    return out
  }
}
