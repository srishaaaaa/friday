import { SSEParser } from '../src/services/sse'

describe('SSEParser', () => {
  it('parses complete frames', () => {
    const p = new SSEParser()
    const ev = p.feed('event: delta\ndata: {"text":"Hi"}\n\nevent: done\ndata: {"status":"ok"}\n\n')
    expect(ev).toEqual([{ event: 'delta', data: { text: 'Hi' } }, { event: 'done', data: { status: 'ok' } }])
  })
  it('handles frames split across chunks at any byte boundary', () => {
    const full = 'event: delta\ndata: {"text":"héllo"}\n\n'
    for (let i = 1; i < full.length; i++) {
      const p = new SSEParser()
      const ev = [...p.feed(full.slice(0, i)), ...p.feed(full.slice(i))]
      expect(ev).toEqual([{ event: 'delta', data: { text: 'héllo' } }])
    }
  })
  it('normalises CRLF and reports malformed JSON as an error event', () => {
    const p = new SSEParser()
    expect(p.feed('event: delta\r\ndata: {"text":"a"}\r\n\r\n')).toHaveLength(1)
    const bad = p.feed('event: delta\ndata: {oops\n\n')
    expect(bad[0].event).toBe('error')
  })
})
