import { DomBadge } from './views/dom-badge.js'
import { DomErrors } from './views/dom-errors.js'
import { DomMenu } from './views/dom-menu.js'
import { ReactCard } from './views/react-card.js'
import { ReactErrors } from './views/react-errors.js'

export { DomBadge, DomErrors, DomMenu, ReactCard, ReactErrors }

export const view = [
  DomBadge({ label: 'Badge' }),
  DomMenu(),
  ReactCard({
    title: 'JSX Plugin',
    description: 'React-style tagged templates with diagnostics.',
    footer: 'Rendered via fixtures workspace.',
  }),
  DomErrors(),
  ReactErrors(),
]
