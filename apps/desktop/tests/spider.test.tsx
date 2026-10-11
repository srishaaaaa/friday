import { render, screen } from '@testing-library/react'
import { SpiderBot } from '../src/components/AIRobot'
import { SpiderWebs, webPath } from '../src/components/SpiderWeb'
import { Background } from '../src/components/Background'

describe('Spider theme', () => {
  it('draws webs with radial threads and sagging rings', () => {
    const d = webPath({ cx: 0, cy: 0, radius: 100, threads: 5, rings: 3, from: 0, to: 90 })
    expect((d.match(/L/g) ?? []).length).toBe(5)   // one line per thread
    expect((d.match(/Q/g) ?? []).length).toBe(12)  // 3 rings × 4 sagging segments
  })
  it('the spider bot reflects real state', () => {
    render(<SpiderBot state="thinking" />)
    expect(screen.getByRole('img', { name: 'FRIDAY: Thinking' })).toHaveAttribute('data-state', 'thinking')
  })
  it('webs appear only with the spider theme', () => {
    const { container, rerender } = render(<Background ambient interactive={false} />)
    expect(container.querySelector('.spider-webs')).toBeNull()
    rerender(<Background ambient interactive={false} theme="spider" />)
    expect(container.querySelector('.spider-webs')).not.toBeNull()
    expect(SpiderWebs).toBeTruthy()
  })
})

describe('Character themes', () => {
  it('each theme has its own mascot and background effect, reflecting real state', async () => {
    const { Mascot } = await import('../src/components/Mascots')
    const { ThemeDecor } = await import('../src/components/ThemeDecor')
    for (const theme of ['iron', 'loki', 'scarlet', 'upside'] as const) {
      const { container, unmount } = render(<><Mascot theme={theme} state="generating" /><ThemeDecor theme={theme} /></>)
      expect(container.querySelector(`.bot-${theme}`)).toHaveAttribute('data-state', 'generating')
      expect(container.querySelector(`.decor-${theme}`)).not.toBeNull()
      unmount()
    }
    const { container } = render(<ThemeDecor theme="violet" />)
    expect(container.innerHTML).toBe('')
  })
})

describe('Theme switch flourish', () => {
  it('plays only when the theme changes (not on startup) and not with reduced motion', async () => {
    const { ThemeTransition } = await import('../src/components/ThemeTransition')
    const { container, rerender } = render(<ThemeTransition theme="violet" enabled />)
    expect(container.querySelector('.theme-fx')).toBeNull()
    rerender(<ThemeTransition theme="iron" enabled />)
    expect(container.querySelector('.fx-iron')).not.toBeNull()
    const r2 = render(<ThemeTransition theme="violet" enabled={false} />)
    r2.rerender(<ThemeTransition theme="loki" enabled={false} />)
    expect(r2.container.querySelector('.theme-fx')).toBeNull()
  })
})
