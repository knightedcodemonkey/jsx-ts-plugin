import { DomBadge } from './views/dom-badge.js'
import { DomErrors } from './views/dom-errors.js'
import { DomMultilineExpressionErrors } from './views/dom-multiline-expression-errors.js'
import { DomMenu } from './views/dom-menu.js'
import { DomNoSubstitutionErrors } from './views/dom-no-substitution-errors.js'
import {
  DomDirectiveOverrideError,
  ReactDirectiveOverrideError,
} from './views/directive-override-errors.js'
import { ReactCard } from './views/react-card.js'
import { ReactChildrenErrors } from './views/react-children-errors.js'
import { ReactErrors } from './views/react-errors.js'
import { ReactMultiDiagnosticSameTemplate } from './views/react-multi-diagnostic-same-template.js'
import { ReactTagPositionErrors } from './views/react-tag-position-errors.js'

export {
  DomBadge,
  DomErrors,
  DomMultilineExpressionErrors,
  DomMenu,
  DomNoSubstitutionErrors,
  DomDirectiveOverrideError,
  ReactCard,
  ReactChildrenErrors,
  ReactDirectiveOverrideError,
  ReactErrors,
  ReactMultiDiagnosticSameTemplate,
  ReactTagPositionErrors,
}

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
