import type { Transition, Variants } from 'framer-motion'

/** Central motion vocabulary. Components import presets from here instead of inventing timings. */
export const dur = { micro: 0.14, ui: 0.2, menu: 0.2, sidebar: 0.28, panel: 0.34, scene: 0.7 } as const
export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
}
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } satisfies Transition,
  soft: { type: 'spring', stiffness: 260, damping: 30 } satisfies Transition,
}
export const stagger = { tight: 0.035, normal: 0.06, scene: 0.12 } as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: dur.panel, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: dur.ui, ease: ease.inOut } },
}
export const staggerParent = (each: number = stagger.normal, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
  exit: { transition: { staggerChildren: each / 2, staggerDirection: -1 } },
})
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: dur.menu, ease: ease.out } },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: dur.micro, ease: ease.inOut } },
}
export const dialog: Variants = {
  hidden: { opacity: 0, scale: 0.965, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: dur.panel, ease: ease.out } },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: { duration: dur.ui, ease: ease.inOut } },
}
export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: dur.ui } },
  exit: { opacity: 0, transition: { duration: dur.ui } },
}
export const slideRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: dur.panel, ease: ease.out } },
  exit: { opacity: 0, x: 24, transition: { duration: dur.ui, ease: ease.inOut } },
}
